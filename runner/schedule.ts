/** The queue must be quiet this long before a cycle runs (bursts of reports arrive together). */
export const QUIET_MS = 2 * 60_000;
/** A cycle runs at the latest this long after the earliest group was queued, however busy the queue stays. */
export const MAX_WAIT_MS = 10 * 60_000;

export interface QueueTimes {
    count: number;
    /** When the earliest queued group was queued. Meaningless when `count` is 0. */
    firstQueuedAt: number;
    /** When the latest queued group was queued. Meaningless when `count` is 0. */
    lastQueuedAt: number;
}

export type Decision = { action: "idle" } | { action: "wait"; runAt: number } | { action: "run"; reason: "quiet" | "max-wait" };

/** Pure: is it time to run a cycle? "Has work" is simply `count > 0`; no separate flag is stored. */
export function decide(q: QueueTimes, now: number, quietMs: number = QUIET_MS, maxWaitMs: number = MAX_WAIT_MS): Decision {
    if (q.count === 0) return { action: "idle" };
    if (now - q.lastQueuedAt >= quietMs) return { action: "run", reason: "quiet" };
    if (now - q.firstQueuedAt >= maxWaitMs) return { action: "run", reason: "max-wait" };
    return { action: "wait", runAt: Math.min(q.lastQueuedAt + quietMs, q.firstQueuedAt + maxWaitMs) };
}

/** Times of the queued groups from the sidecar `meta` file; a group without a recorded time counts as queued at `fallback`. */
export function toQueueTimes(queue: string[], meta: Record<string, number>, fallback: number): QueueTimes {
    if (queue.length === 0) return { count: 0, firstQueuedAt: fallback, lastQueuedAt: fallback };
    const times = queue.map((t) => (typeof meta[t] === "number" ? meta[t] : fallback));
    return { count: queue.length, firstQueuedAt: Math.min(...times), lastQueuedAt: Math.max(...times) };
}
