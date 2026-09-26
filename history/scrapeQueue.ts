import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { writeFileAtomic } from "./atomicWrite.js";

/**
 * Durable set of target names (as in `config.targets`) that `bot:watch` saw new
 * activity for and `bot:scrape` has not scraped yet. Two processes use it:
 * `bot:watch` only adds, `bot:scrape` reads a snapshot and later removes the
 * targets it handled. Every write is atomic (temp file + rename); the
 * read-modify-write itself is not locked — the worst case of the tiny race
 * between the two processes is one target enqueued again by its next message.
 * Times live in two sidecar files (see `readQueueMeta`, `readQueueSeen`): when a
 * group was first queued, and when a message for it last arrived while it was
 * already queued (so a scrape that started earlier does not drop that message).
 */
export const DEFAULT_QUEUE_PATH = path.join(config.dataDir, ".scrape-queue.json");

/** A missing, unreadable or wrongly shaped file reads as an empty queue; non-string entries are dropped. */
export function readQueue(file: string = DEFAULT_QUEUE_PATH): string[] {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return [];
    }
}

function writeJson(value: unknown, file: string): void {
    writeFileAtomic(file, JSON.stringify(value, null, 2));
}

/** `.scrape-queue.json` -> `.scrape-queue-meta.json`: when each queued group was queued (epoch ms), for the runner's debounce. */
function metaPath(file: string): string {
    return file.replace(/\.json$/, "-meta.json");
}

/** `.scrape-queue.json` -> `.scrape-queue-seen.json`: when a message last arrived for a group that was already queued. */
function seenPath(file: string): string {
    return file.replace(/\.json$/, "-seen.json");
}

/** A missing, unreadable or wrongly shaped file reads as empty; entries whose value is not a number are dropped. */
function readNumberMap(file: string): Record<string, number> {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === "number"));
    } catch {
        return {};
    }
}

/** When each queued group was queued (epoch ms). */
export function readQueueMeta(file: string = DEFAULT_QUEUE_PATH): Record<string, number> {
    return readNumberMap(metaPath(file));
}

/** When a message last arrived for each group that was queued again while it was already in the queue. */
export function readQueueSeen(file: string = DEFAULT_QUEUE_PATH): Record<string, number> {
    return readNumberMap(seenPath(file));
}

/**
 * Adds `target` unless already queued; returns whether it was added. When it is added its time
 * is recorded; when it was already queued the message time is remembered instead (`readQueueSeen`).
 */
export function enqueueTarget(target: string, file: string = DEFAULT_QUEUE_PATH, now: number = Date.now()): boolean {
    const queue = readQueue(file);
    if (queue.includes(target)) {
        writeJson({ ...readQueueSeen(file), [target]: now }, seenPath(file));
        return false;
    }
    queue.push(target);
    writeJson(queue, file);
    writeJson({ ...readQueueMeta(file), [target]: now }, metaPath(file));
    return true;
}

/**
 * Re-reads the file and removes only `handled`, so a target queued after the caller took its snapshot survives.
 * A handled target that got another message at or after `scrapeStartedAt` stays queued (that message may not
 * have been scraped), counted as freshly queued at that time.
 */
export function removeFromQueue(handled: string[], file: string = DEFAULT_QUEUE_PATH, scrapeStartedAt?: number): void {
    const seen = readQueueSeen(file);
    const stays = new Set(scrapeStartedAt === undefined ? [] : handled.filter((t) => typeof seen[t] === "number" && seen[t] >= scrapeStartedAt));
    const drop = new Set(handled.filter((t) => !stays.has(t)));
    const current = readQueue(file);
    const remaining = current.filter((t) => !drop.has(t));
    if (remaining.length === current.length && !fs.existsSync(file)) return;
    writeJson(remaining, file);

    const meta = Object.fromEntries(Object.entries(readQueueMeta(file)).filter(([t]) => !drop.has(t)));
    for (const t of stays) meta[t] = seen[t];
    writeJson(meta, metaPath(file));
    writeJson(Object.fromEntries(Object.entries(seen).filter(([t]) => !handled.includes(t))), seenPath(file));
}
