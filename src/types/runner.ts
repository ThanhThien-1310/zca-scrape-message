// Shared runner types. Import them from "../types/index.js".

import type { SessionKey } from "./session.js";

export interface BuildResult {
    reviewCount: number;
    /** Path of the Excel written; null when the session had no report with a known room. */
    excel: string | null;
    warnings: string[];
}

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
    /** How long the whole cycle took (ms). Absent in log lines written before timings existed. */
    durationMs?: number;
    /** Time spent per step (ms). `scrape` includes opening Zalo and the sidebar, so it is a little more than the sum of `timings`. */
    stepMs?: StepMs;
    /** How long each queued group took to scrape (ms), in scrape order; `ok` is false when the scrape of that group failed. */
    timings?: GroupTiming[];
}

export interface StepMs {
    recover: number;
    scrape: number;
    load: number;
    sync: number;
    build: number;
}

export interface GroupTiming {
    target: string;
    ms: number;
    ok: boolean;
    scraped?: number;
    written?: number;
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

export type Health = "none" | "stopped" | "dead" | "error" | "alive";

export interface GroupStat {
    target: string;
    /** Scrapes timed. */
    count: number;
    /** How many of them failed. */
    failures: number;
    avgMs: number;
    p95Ms: number;
    maxMs: number;
    /** Average new messages saved per scrape, over the scrapes that reported it; null when none did. */
    avgWritten: number | null;
}

export interface TimingSummary {
    /** Cycles that recorded a duration. */
    cycles: number;
    cycleAvgMs: number;
    cycleMaxMs: number;
    /** Average time per step over the cycles that recorded steps. */
    stepAvgMs: StepMs;
    /** Slowest average first. */
    groups: GroupStat[];
}
