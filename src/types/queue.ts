// Shared queue types. Import them from "../types/index.js".

export interface QueueTimes {
    count: number;
    /** When the earliest queued group was queued. Meaningless when `count` is 0. */
    firstQueuedAt: number;
    /** When the latest queued group was queued. Meaningless when `count` is 0. */
    lastQueuedAt: number;
}

export type Decision = { action: "idle" } | { action: "wait"; runAt: number } | { action: "run"; reason: "quiet" | "max-wait" };

/** `ms` is how long the group took (opening it, scrolling back, saving); `scraped`/`written` are the messages read and the new ones saved. */
export type TargetOutcome = { target: string; error?: string; ms?: number; scraped?: number; written?: number };

export type ScrapeTargetResult = { scraped: number; written: number };

export type QueueRunResult = { status: "empty" } | { status: "done"; targets: string[]; failed: string[]; gaveUp: string[]; outcomes: TargetOutcome[] };

/** For every event file that existed when the snapshot was taken, the byte offset up to which it was read. */
export type QueueMark = Record<string, number>;

export interface QueueSnapshot {
    /** The queued groups at the time of the snapshot, oldest first. */
    targets: string[];
    mark: QueueMark;
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
