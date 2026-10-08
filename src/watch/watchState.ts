import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { Gap, WatchFiles, WatchState } from "../types/index.js";

/**
 * `bot:watch` is the only thing that notices new messages, and a dead watcher
 * notices nothing — so it leaves evidence of when it was and was not running:
 *
 *  - `data/.watch-state.json`: a heartbeat (pid, last beat, whether each
 *    detection source is up, last detection).
 *  - `data/.watch-gaps.json`: every period the watcher was not (fully)
 *    listening — crashed, stopped, or alive but with the WebSocket source down.
 *
 * It cannot know WHICH messages it missed; it records WHEN. `recover:missing`
 * uses the gaps to decide whether a re-scrape is needed at all.
 */
export const HEARTBEAT_INTERVAL_MS = config.watch.heartbeatSeconds * 1000;
/** A heartbeat older than this means the watcher is dead (3 missed beats). */
export const STALE_AFTER_MS = config.watch.deadAfterSeconds * 1000;
/** A blind spell (WebSocket source down) shorter than this is start-up noise, not a gap. */
export const MIN_BLIND_GAP_MS = config.watch.minBlindSeconds * 1000;

export const DEFAULT_FILES: WatchFiles = {
    state: path.join(config.dataDir, ".watch-state.json"),
    gaps: path.join(config.dataDir, ".watch-gaps.json"),
};

function writeAtomic(file: string, value: unknown): void {
    writeFileAtomic(file, JSON.stringify(value, null, 2));
}

function readJson(file: string): unknown {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return undefined;
    }
}

/** Missing, unreadable or wrongly shaped state reads as null. */
export function readState(file: string = DEFAULT_FILES.state): WatchState | null {
    const v = readJson(file) as Partial<WatchState> | undefined;
    const ok = v && typeof v === "object" && typeof v.lastBeat === "number" && typeof v.pid === "number" && (v.state === "running" || v.state === "stopped") && v.sources && typeof v.sources === "object";
    return ok ? (v as WatchState) : null;
}

export function readGaps(file: string = DEFAULT_FILES.gaps): Gap[] {
    const v = readJson(file);
    if (!Array.isArray(v)) return [];
    return v.filter((g): g is Gap => g && typeof g.from === "number" && (typeof g.to === "number" || g.to === null) && typeof g.reason === "string");
}

export function pidAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return (err as NodeJS.ErrnoException).code === "EPERM";
    }
}

/**
 * Called once when `bot:watch` starts. Closes any open gap, records a crash gap
 * if the previous run never said it stopped, and writes a fresh state. Refuses
 * (changing nothing) when another watcher is demonstrably alive.
 */
export function startWatching(
    now: number,
    pid: number,
    files: WatchFiles = DEFAULT_FILES,
    isAlive: (pid: number) => boolean = pidAlive,
): { crashed: boolean; anotherInstanceAlive: boolean } {
    const prev = readState(files.state);
    if (prev && prev.state === "running" && prev.pid !== pid && now - prev.lastBeat < STALE_AFTER_MS && isAlive(prev.pid)) {
        return { crashed: false, anotherInstanceAlive: true };
    }

    const gaps = readGaps(files.gaps);
    for (const g of gaps) if (g.to === null) g.to = now;

    let crashed = false;
    if (prev && prev.state === "running") {
        crashed = true;
        if (prev.blindSince !== undefined && prev.lastBeat - prev.blindSince >= MIN_BLIND_GAP_MS) {
            gaps.push({ from: prev.blindSince, to: prev.lastBeat, reason: "blind" });
        }
        gaps.push({ from: prev.lastBeat, to: now, reason: "crash" });
    }

    writeAtomic(files.gaps, gaps);
    const state: WatchState = {
        pid,
        startedAt: now,
        lastBeat: now,
        state: "running",
        detections: 0,
        sources: { ws: "connecting" },
        blindSince: now,
    };
    writeAtomic(files.state, state);
    return { crashed, anotherInstanceAlive: false };
}

/** Heartbeat. Also records source changes, detections, and closes a blind spell into a gap when one lasted long enough. */
export function beat(
    now: number,
    patch: { sources?: Partial<WatchState["sources"]>; detection?: boolean; restartedAt?: number; reconnects?: number; lastFrameAt?: number },
    files: WatchFiles = DEFAULT_FILES,
): void {
    const s = readState(files.state);
    if (!s || s.state !== "running") return;

    s.lastBeat = now;
    if (patch.sources) s.sources = { ...s.sources, ...patch.sources };
    if (patch.detection) {
        s.lastDetectionAt = now;
        s.detections += 1;
    }
    if (patch.restartedAt !== undefined) s.restartedAt = patch.restartedAt;
    if (patch.reconnects !== undefined) s.reconnects = patch.reconnects;
    if (patch.lastFrameAt !== undefined && patch.lastFrameAt > 0) s.lastFrameAt = patch.lastFrameAt;

    const blind = s.sources.ws !== "active";
    if (blind && s.blindSince === undefined) {
        s.blindSince = now;
    } else if (!blind && s.blindSince !== undefined) {
        if (now - s.blindSince >= MIN_BLIND_GAP_MS) {
            const gaps = readGaps(files.gaps);
            gaps.push({ from: s.blindSince, to: now, reason: "blind" });
            writeAtomic(files.gaps, gaps);
        }
        delete s.blindSince;
    }
    writeAtomic(files.state, s);
}

/** Called on a clean stop or a fatal error: the watcher is no longer listening from `now`. */
export function stopWatching(now: number, reason: "stopped" | "fatal", files: WatchFiles = DEFAULT_FILES): void {
    const s = readState(files.state);
    if (!s || s.state === "stopped") return;

    const gaps = readGaps(files.gaps);
    if (s.blindSince !== undefined && now - s.blindSince >= MIN_BLIND_GAP_MS) gaps.push({ from: s.blindSince, to: now, reason: "blind" });
    gaps.push({ from: now, to: null, reason });

    s.state = "stopped";
    s.stoppedAt = now;
    s.lastBeat = now;
    delete s.blindSince;
    writeAtomic(files.gaps, gaps);
    writeAtomic(files.state, s);
}

/**
 * Recorded gaps plus what can be read off the current state: a stale heartbeat
 * means the watcher is dead right now (open crash gap), the WebSocket source down means
 * it is alive but blind (open blind gap). No state at all means nothing can be
 * ruled out, so the whole past is one unknown gap.
 */
export function effectiveGaps(now: number, files: WatchFiles = DEFAULT_FILES, staleMs: number = STALE_AFTER_MS): Gap[] {
    const gaps = readGaps(files.gaps);
    const s = readState(files.state);
    if (!s) {
        if (gaps.length === 0) gaps.push({ from: 0, to: null, reason: "unknown" });
        return gaps;
    }
    if (s.state === "running") {
        if (now - s.lastBeat > staleMs) gaps.push({ from: s.lastBeat, to: null, reason: "crash" });
        else if (s.blindSince !== undefined) gaps.push({ from: s.blindSince, to: null, reason: "blind" });
    }
    return gaps;
}

/** Does the gap overlap the half-open window [from, to)? An open gap lasts until `now`. */
export function gapOverlaps(gap: Gap, window: { from: number; to: number }, now: number): boolean {
    const end = gap.to ?? now;
    return gap.from < window.to && end > window.from;
}
