import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { pidAlive, STALE_AFTER_MS } from "../history/watchState.js";
import type { SessionKey } from "./affectedSessions.js";
import { writeFileAtomic } from "../history/atomicWrite.js";

/**
 * What `bot:runner` leaves on disk, so that an agent (or a person) can tell whether it is alive,
 * what its last cycle did, and which sessions still owe a rebuild:
 *  - `data/.runner-state.json`   heartbeat, phase, consecutive failures, last cycle
 *  - `output/runner-log.jsonl`   one JSON line per cycle (and per `runner:once` rebuild)
 *  - `data/.runner-built.json`   keys of the reports already built into an Excel (see builtReports.ts)
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** After this many failed cycles in a row the runner stops trying until it is restarted. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CycleSummary {
    kind: "cycle" | "rebuild";
    at: number;
    ok: boolean;
    /** Groups scraped from the queue. */
    groups: string[];
    /** Sessions rebuilt (or attempted). */
    sessions: SessionKey[];
    reviewCount: number;
    /** Excel files written (a `_moi` path means the real one was open). */
    excel: string[];
    warnings: string[];
    /** Failures that stop the cycle (scrape or sync); they count toward the 3-strike `error` state. */
    errors: string[];
    /** Sessions whose build failed; retried later, reported, but they do not stop the runner. */
    buildErrors: string[];
}

export type RunnerPhase = "idle" | "waiting" | "running" | "error" | "stopped";

export interface RunnerState {
    pid: number;
    startedAt: number;
    lastBeat: number;
    state: RunnerPhase;
    consecutiveFailures: number;
    lastCycle?: CycleSummary;
}

export interface RunnerFiles {
    state: string;
    log: string;
    built: string;
}

export const DEFAULT_RUNNER_FILES: RunnerFiles = {
    state: path.join(config.dataDir, ".runner-state.json"),
    log: path.join(repoRoot, "output", "runner-log.jsonl"),
    built: path.join(config.dataDir, ".runner-built.json"),
};

function writeAtomic(file: string, value: unknown): void {
    writeFileAtomic(file, JSON.stringify(value, null, 2));
}

const PHASES: RunnerPhase[] = ["idle", "waiting", "running", "error", "stopped"];

/** Missing, unreadable or wrongly shaped state reads as null. */
export function readRunnerState(file: string = DEFAULT_RUNNER_FILES.state): RunnerState | null {
    try {
        const v = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RunnerState>;
        const ok = typeof v.pid === "number" && typeof v.startedAt === "number" && typeof v.lastBeat === "number" && typeof v.consecutiveFailures === "number" && PHASES.includes(v.state as RunnerPhase);
        return ok ? (v as RunnerState) : null;
    } catch {
        return null;
    }
}

/** Refuses (changing nothing) when another runner is demonstrably alive; otherwise writes a fresh idle state. */
export function startRunner(
    now: number,
    pid: number,
    files: RunnerFiles = DEFAULT_RUNNER_FILES,
    isAlive: (pid: number) => boolean = pidAlive,
): { anotherInstanceAlive: boolean; crashed: boolean } {
    const prev = readRunnerState(files.state);
    if (prev && prev.state !== "stopped" && prev.pid !== pid && now - prev.lastBeat < STALE_AFTER_MS && isAlive(prev.pid)) {
        return { anotherInstanceAlive: true, crashed: false };
    }
    const state: RunnerState = { pid, startedAt: now, lastBeat: now, state: "idle", consecutiveFailures: 0, lastCycle: prev?.lastCycle };
    writeAtomic(files.state, state);
    return { anotherInstanceAlive: false, crashed: !!prev && prev.state !== "stopped" };
}

export function setPhase(now: number, phase: RunnerPhase, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    const s = readRunnerState(files.state);
    if (!s) return;
    s.state = phase;
    s.lastBeat = now;
    writeAtomic(files.state, s);
}

/** Heartbeat only: keeps the current phase. */
export function beatRunner(now: number, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    const s = readRunnerState(files.state);
    if (!s) return;
    s.lastBeat = now;
    writeAtomic(files.state, s);
}

export function appendLog(entry: CycleSummary, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    fs.mkdirSync(path.dirname(files.log), { recursive: true });
    fs.appendFileSync(files.log, `${JSON.stringify(entry)}\n`, "utf8");
}

/** Logs the cycle, updates the failure count and the phase (`error` at the limit), and returns the new state. */
export function recordCycle(now: number, summary: CycleSummary, files: RunnerFiles = DEFAULT_RUNNER_FILES): RunnerState {
    appendLog(summary, files);
    const s = readRunnerState(files.state) ?? { pid: process.pid, startedAt: now, lastBeat: now, state: "idle" as RunnerPhase, consecutiveFailures: 0 };
    s.consecutiveFailures = summary.ok ? 0 : s.consecutiveFailures + 1;
    s.state = s.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? "error" : "idle";
    s.lastBeat = now;
    s.lastCycle = summary;
    writeAtomic(files.state, s);
    return s;
}

export function stopRunner(now: number, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    const s = readRunnerState(files.state);
    if (!s) return;
    s.state = "stopped";
    s.lastBeat = now;
    writeAtomic(files.state, s);
}

export type Health = "none" | "stopped" | "dead" | "error" | "alive";

export function runnerHealth(state: RunnerState | null, now: number): Health {
    if (!state) return "none";
    if (state.state === "stopped") return "stopped";
    if (now - state.lastBeat > STALE_AFTER_MS) return "dead";
    if (state.state === "error") return "error";
    return "alive";
}
