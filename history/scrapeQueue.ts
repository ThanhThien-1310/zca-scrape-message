import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { vietnamDay } from "../lesson/time.js";
import { writeFileAtomic } from "./atomicWrite.js";

/**
 * The scrape queue: which groups (as named in `config.targets`) have new messages that nobody has scraped yet.
 *
 * Nothing here is a shared file that two processes read, change and write back (that lost groups: `bot:watch` and
 * `bot:runner` overwrote each other). Instead there are two append-only files, each with its own writers:
 *
 *  - events `.scrape-events-<YYYY-MM-DD>.jsonl` (one file per Vietnam day): `bot:watch` and `scrape:add` append
 *    `{"t": group, "at": epoch ms}`, one line per message.
 *  - handled `.scrape-events.handled.jsonl`: whoever scraped (`bot:runner`, `bot:scrape`; both hold `data/.scrape.lock`)
 *    appends `{"at", "mark", "handled", "failed"}` after a scrape.
 *
 * A group is queued while some line of it lies at or after the byte offset its last scrape had read up to (`mark`, one
 * offset per day file). Using offsets, not clock times, means a message that arrives while the scrape is running (even in
 * the same millisecond as the snapshot) is always after the mark and can never be swallowed. The queue, when each group
 * was first queued and its latest message are all derived from those two files; nothing is ever rewritten in place
 * except the tiny handled file when it is trimmed (`compactQueue`, only by whoever holds the lock).
 */
export const DEFAULT_QUEUE_PATH = path.join(config.dataDir, ".scrape-events.jsonl");
/** The queue file that earlier versions used (a JSON array plus `-meta`/`-seen` sidecars); imported once, see `importLegacyQueue`. */
export const LEGACY_QUEUE_PATH = path.join(config.dataDir, ".scrape-queue.json");

/** Event files (and handled records that only mention them) older than this many Vietnam days are deleted by `compactQueue`. */
const KEEP_DAYS = 3;
const DAY_MS = 86_400_000;

/** For every event file that existed when the snapshot was taken, the byte offset up to which it was read. */
export type QueueMark = Record<string, number>;

export interface QueueSnapshot {
    /** The queued groups at the time of the snapshot, oldest first. */
    targets: string[];
    mark: QueueMark;
}

interface Entry {
    start: number;
    at: number;
}

interface Segment {
    offset: number;
    byTarget: Map<string, Entry[]>;
}

interface HandledRecord {
    at: number;
    mark: QueueMark;
    handled: string[];
    failed: Record<string, number>;
}

const stem = (file: string) => file.replace(/\.jsonl$/, "");
const handledPath = (file: string) => `${stem(file)}.handled.jsonl`;

/** The event file for the Vietnam day of `now`, e.g. `.scrape-events-2026-09-24.jsonl`. */
export function segmentPath(file: string, now: number): string {
    return `${stem(file)}-${vietnamDay(now)}.jsonl`;
}

function listSegments(file: string): string[] {
    const dir = path.dirname(file);
    const prefix = `${path.basename(stem(file))}-`;
    try {
        return fs
            .readdirSync(dir)
            .filter((f) => f.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f.slice(prefix.length)))
            .sort();
    } catch {
        return [];
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseHandled(text: string): HandledRecord[] {
    const out: HandledRecord[] = [];
    for (const line of text.split("\n")) {
        if (line.trim() === "") continue;
        try {
            const v: unknown = JSON.parse(line);
            if (!isRecord(v) || typeof v.at !== "number" || !isRecord(v.mark)) continue;
            const mark = Object.fromEntries(Object.entries(v.mark).filter((e): e is [string, number] => typeof e[1] === "number"));
            const handled = Array.isArray(v.handled) ? v.handled.filter((x): x is string => typeof x === "string") : [];
            const failed = isRecord(v.failed) ? Object.fromEntries(Object.entries(v.failed).filter((e): e is [string, number] => typeof e[1] === "number")) : {};
            out.push({ at: v.at, mark, handled, failed });
        } catch {
            /* dòng hỏng */
        }
    }
    return out;
}

/** Reads a file from `offset` to its end; a missing file reads as nothing. */
function readFrom(file: string, offset: number): { buf: Buffer; size: number } {
    let fd: number | undefined;
    try {
        fd = fs.openSync(file, "r");
        const size = fs.fstatSync(fd).size;
        if (size <= offset) return { buf: Buffer.alloc(0), size };
        const buf = Buffer.alloc(size - offset);
        let read = 0;
        while (read < buf.length) {
            const n = fs.readSync(fd, buf, read, buf.length - read, offset + read);
            if (n === 0) break;
            read += n;
        }
        return { buf: buf.subarray(0, read), size };
    } catch {
        return { buf: Buffer.alloc(0), size: 0 };
    } finally {
        if (fd !== undefined) fs.closeSync(fd);
    }
}

/**
 * What the two files say right now, kept in memory and brought up to date by reading only what was appended since
 * (so the runner can ask every few seconds even when a day file is large).
 */
class QueueView {
    private segments = new Map<string, Segment>();
    private handledSig = "";
    private marks = new Map<string, Map<string, number>>();
    private attempts = new Map<string, number>();
    private failedAt = new Map<string, number>();

    constructor(private readonly file: string) {}

    refresh(): void {
        const dir = path.dirname(this.file);
        const names = listSegments(this.file);
        for (const name of [...this.segments.keys()]) if (!names.includes(name)) this.segments.delete(name);
        for (const name of names) this.readSegment(name, path.join(dir, name));
        this.readHandled();
    }

    private readSegment(name: string, full: string): void {
        let seg = this.segments.get(name);
        if (!seg) {
            seg = { offset: 0, byTarget: new Map() };
            this.segments.set(name, seg);
        }
        let { buf, size } = readFrom(full, seg.offset);
        if (size < seg.offset) {
            // The file is shorter than what was read: it was replaced. Start over.
            seg.offset = 0;
            seg.byTarget.clear();
            ({ buf } = readFrom(full, 0));
        }
        let pos = 0;
        while (pos < buf.length) {
            const nl = buf.indexOf(0x0a, pos);
            if (nl < 0) break; // a line still being written
            const start = seg.offset + pos;
            const line = buf.subarray(pos, nl).toString("utf8");
            pos = nl + 1;
            try {
                const v: unknown = JSON.parse(line);
                if (isRecord(v) && typeof v.t === "string" && typeof v.at === "number") {
                    const list = seg.byTarget.get(v.t) ?? [];
                    list.push({ start, at: v.at });
                    seg.byTarget.set(v.t, list);
                }
            } catch {
                /* dòng hỏng */
            }
        }
        seg.offset += pos;
    }

    private readHandled(): void {
        const file = handledPath(this.file);
        let sig = "";
        try {
            const st = fs.statSync(file);
            sig = `${st.size}:${st.mtimeMs}`;
        } catch {
            /* no handled file yet */
        }
        if (sig === this.handledSig) return;
        this.handledSig = sig;
        this.marks.clear();
        this.attempts.clear();
        this.failedAt.clear();
        let text = "";
        try {
            text = fs.readFileSync(file, "utf8");
        } catch {
            return;
        }
        for (const rec of parseHandled(text)) {
            for (const t of rec.handled) {
                const perSeg = this.marks.get(t) ?? new Map<string, number>();
                for (const [seg, off] of Object.entries(rec.mark)) perSeg.set(seg, Math.max(perSeg.get(seg) ?? 0, off));
                this.marks.set(t, perSeg);
                this.attempts.delete(t);
                this.failedAt.delete(t);
            }
            for (const [t, n] of Object.entries(rec.failed)) {
                this.attempts.set(t, n);
                this.failedAt.set(t, rec.at);
            }
        }
    }

    /** First and latest time of every queued group: the lines it has at or after its mark, moved up to its last failure. */
    pending(): Map<string, { first: number; last: number }> {
        const out = new Map<string, { first: number; last: number }>();
        const targets = new Set<string>();
        for (const seg of this.segments.values()) for (const t of seg.byTarget.keys()) targets.add(t);
        for (const t of targets) {
            let first = Infinity;
            let last = -Infinity;
            for (const [name, seg] of this.segments) {
                const from = this.marks.get(t)?.get(name) ?? 0;
                for (const e of seg.byTarget.get(t) ?? []) {
                    if (e.start < from) continue;
                    first = Math.min(first, e.at);
                    last = Math.max(last, e.at);
                }
            }
            if (first === Infinity) continue;
            const failed = this.failedAt.get(t);
            if (failed !== undefined) {
                first = Math.max(first, failed);
                last = Math.max(last, failed);
            }
            out.set(t, { first, last });
        }
        return out;
    }

    mark(): QueueMark {
        return Object.fromEntries([...this.segments].map(([name, seg]) => [name, seg.offset]));
    }

    attemptsOf(target: string): number {
        return this.attempts.get(target) ?? 0;
    }
}

const views = new Map<string, QueueView>();
function view(file: string): QueueView {
    let v = views.get(file);
    if (!v) {
        v = new QueueView(file);
        views.set(file, v);
    }
    v.refresh();
    return v;
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** One `O_APPEND` write; a Windows lock held for a moment by a reader is retried. */
function appendLine(file: string, text: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (let attempt = 1; ; attempt++) {
        try {
            fs.appendFileSync(file, text, "utf8");
            return;
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (attempt >= 10 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw err;
            sleep(5);
        }
    }
}

/** The queued groups, oldest first. */
export function readQueue(file: string = DEFAULT_QUEUE_PATH): string[] {
    const p = view(file).pending();
    return [...p.entries()].sort((a, b) => a[1].first - b[1].first || (a[0] < b[0] ? -1 : 1)).map(([t]) => t);
}

/** When each queued group was first queued (epoch ms). */
export function readQueueMeta(file: string = DEFAULT_QUEUE_PATH): Record<string, number> {
    return Object.fromEntries([...view(file).pending()].map(([t, v]) => [t, v.first]));
}

/** When the latest message (or failed scrape) of each queued group happened. */
export function readQueueSeen(file: string = DEFAULT_QUEUE_PATH): Record<string, number> {
    return Object.fromEntries([...view(file).pending()].map(([t, v]) => [t, v.last]));
}

/** Records that `target` has a new message; returns whether it was not queued before. Only ever appends. */
export function enqueueTarget(target: string, file: string = DEFAULT_QUEUE_PATH, now: number = Date.now()): boolean {
    const wasQueued = view(file).pending().has(target);
    appendLine(segmentPath(file, now), `${JSON.stringify({ t: target, at: now })}\n`);
    return !wasQueued;
}

/** The queued groups now, and how far each event file has been read: hand it back to `completeSnapshot` after the scrape. */
export function takeSnapshot(file: string = DEFAULT_QUEUE_PATH): QueueSnapshot {
    const v = view(file);
    const p = v.pending();
    const targets = [...p.entries()].sort((a, b) => a[1].first - b[1].first || (a[0] < b[0] ? -1 : 1)).map(([t]) => t);
    return { targets, mark: v.mark() };
}

export interface CompleteOptions {
    /** Groups of the snapshot whose scrape failed: they stay queued and are tried again, up to `maxAttempts` times in all. */
    failed?: string[];
    file?: string;
    now?: number;
    maxAttempts?: number;
}

export interface CompleteResult {
    /** Failed groups that stay queued for another try. */
    retrying: string[];
    /** Failed groups that reached the maximum number of attempts and were dropped. */
    gaveUp: string[];
}

/**
 * Records that the snapshot was scraped. Every group of it is handled up to the snapshot's mark, so lines appended
 * since (a new message, a new group) stay queued, except failed ones, which stay queued until their attempts run out.
 * Must be called by whoever holds `data/.scrape.lock`.
 */
export function completeSnapshot(snapshot: QueueSnapshot, opts: CompleteOptions = {}): CompleteResult {
    const file = opts.file ?? DEFAULT_QUEUE_PATH;
    const now = opts.now ?? Date.now();
    const maxAttempts = opts.maxAttempts ?? config.runner.maxScrapeAttempts;
    const failedSet = new Set(opts.failed ?? []);
    const v = view(file);

    const handled: string[] = [];
    const failed: Record<string, number> = {};
    const result: CompleteResult = { retrying: [], gaveUp: [] };
    for (const t of snapshot.targets) {
        if (!failedSet.has(t)) {
            handled.push(t);
            continue;
        }
        const attempts = v.attemptsOf(t) + 1;
        if (attempts >= maxAttempts) {
            handled.push(t);
            result.gaveUp.push(t);
        } else {
            failed[t] = attempts;
            result.retrying.push(t);
        }
    }
    if (handled.length > 0 || Object.keys(failed).length > 0) {
        const record: HandledRecord = { at: now, mark: snapshot.mark, handled, failed };
        appendLine(handledPath(file), `${JSON.stringify(record)}\n`);
    }
    compactQueue(file, now);
    return result;
}

/**
 * Deletes event files older than `KEEP_DAYS` Vietnam days, and rewrites the handled file without the records that
 * only refer to deleted ones. Only for whoever holds `data/.scrape.lock` (the only writer of the handled file).
 */
export function compactQueue(file: string = DEFAULT_QUEUE_PATH, now: number = Date.now()): void {
    const oldest = `${path.basename(stem(file))}-${vietnamDay(now - KEEP_DAYS * DAY_MS)}.jsonl`;
    const dir = path.dirname(file);
    const names = listSegments(file);
    const removed = names.filter((n) => n < oldest);
    for (const n of removed) {
        try {
            fs.rmSync(path.join(dir, n), { force: true });
        } catch {
            /* a reader has it open; the next call deletes it */
        }
    }
    const kept = names.filter((n) => n >= oldest);
    if (removed.length === 0) return;

    const hf = handledPath(file);
    let text = "";
    try {
        text = fs.readFileSync(hf, "utf8");
    } catch {
        return;
    }
    const keep = parseHandled(text).filter((r) => Object.keys(r.mark).some((s) => kept.includes(s)));
    writeFileAtomic(hf, keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length > 0 ? "\n" : ""));
}

/**
 * Puts the groups of the old queue file (`.scrape-queue.json`) into the events file once, then renames the old file and its
 * `-meta`/`-seen` sidecars to `*.migrated`. Returns how many groups were imported. Safe to call from several processes.
 */
export function importLegacyQueue(file: string = DEFAULT_QUEUE_PATH, legacy: string = LEGACY_QUEUE_PATH, now: number = Date.now()): number {
    let names: string[] = [];
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(legacy, "utf8"));
        names = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return 0;
    }
    try {
        fs.renameSync(legacy, `${legacy}.migrated`); // whoever renames first imports; another process fails here and imports nothing
    } catch {
        return 0;
    }
    for (const suffix of ["-meta", "-seen"]) {
        const side = legacy.replace(/\.json$/, `${suffix}.json`);
        try {
            fs.renameSync(side, `${side}.migrated`);
        } catch {
            /* no sidecar */
        }
    }
    for (const t of names) enqueueTarget(t, file, now);
    return names.length;
}
