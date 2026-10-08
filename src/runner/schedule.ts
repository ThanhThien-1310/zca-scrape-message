import { config } from "../../config.js";
import { recoveryKey } from "./recoveryPlan.js";
import { recoveryWindow } from "../lesson/recovery.js";
import { vietnamDay } from "../lesson/time.js";
import type { Decision, Gap, QueueTimes, WatchState } from "../types/index.js";

/** The queue must be quiet this long before a cycle runs (bursts of reports arrive together). */
export const QUIET_MS = config.runner.quietSeconds * 1000;
/** A cycle runs at the latest this long after the earliest group was queued, however busy the queue stays. */
export const MAX_WAIT_MS = config.runner.maxWaitSeconds * 1000;

/** Pure: is it time to run a cycle? "Has work" is simply `count > 0`; no separate flag is stored. */
export function decide(q: QueueTimes, now: number, quietMs: number = QUIET_MS, maxWaitMs: number = MAX_WAIT_MS): Decision {
    if (q.count === 0) return { action: "idle" };
    if (now - q.lastQueuedAt >= quietMs) return { action: "run", reason: "quiet" };
    if (now - q.firstQueuedAt >= maxWaitMs) return { action: "run", reason: "max-wait" };
    return { action: "wait", runAt: Math.min(q.lastQueuedAt + quietMs, q.firstQueuedAt + maxWaitMs) };
}

/** Times of the queued groups from the sidecar `meta` file; a group without a recorded time counts as queued at `fallback`. */
export function toQueueTimes(queue: string[], meta: Record<string, number>, fallback: number, seen: Record<string, number> = {}): QueueTimes {
    if (queue.length === 0) return { count: 0, firstQueuedAt: fallback, lastQueuedAt: fallback };
    const first = queue.map((t) => (typeof meta[t] === "number" ? meta[t] : fallback));
    const last = queue.map((t, i) => Math.max(first[i], typeof seen[t] === "number" ? seen[t] : first[i]));
    return { count: queue.length, firstQueuedAt: Math.min(...first), lastQueuedAt: Math.max(...last) };
}

/**
 * Keys of the gaps (already restricted to the session `scope`, e.g. `2026-09-24|sang`) that no recovery has
 * covered yet. The scope is part of the key, so a gap that stays open into the next session is recovered
 * again for it; a gap that was open and later closes gets a new key too.
 */
export function newRecoveryKeys(gaps: Gap[], done: ReadonlySet<string>, scope: string): string[] {
    return gaps.map((g) => recoveryKey(g, scope)).filter((key) => !done.has(key));
}

/**
 * Scrape back to 17:30 the evening before the Vietnam day of `now` (reports sent after that hour count for the next morning's
 * `morningstart`), so the scroll-back does not grow with the runner's uptime.
 */
export function scrapeSinceTs(now: number): number {
    return recoveryWindow(vietnamDay(now), "sang").from;
}

export const WARMUP_MS = config.runner.watchWarmupSeconds * 1000;
export const MIN_BLIND_MS = config.watch.minBlindSeconds * 1000;

/** Runner: how often it looks at the queue, checks for unbuilt reports, and retries a session whose build failed. */
export const POLL_MS = config.runner.pollSeconds * 1000;
export const DIRTY_CHECK_MS = config.runner.dirtyCheckSeconds * 1000;
export const DIRTY_RETRY_MS = config.runner.dirtyRetrySeconds * 1000;

/** `bot:watch` restarts Zalo Desktop when it starts; the runner must not touch Zalo until that has settled. */
export function watchWarmingUp(state: WatchState | null, now: number): boolean {
    return !!state && state.state === "running" && now - Math.max(state.startedAt, state.restartedAt ?? 0) < WARMUP_MS;
}

/** Drops an open blind spell younger than a minute (`bot:watch` start-up noise); every other gap is kept. */
export function settledGaps(gaps: Gap[], now: number): Gap[] {
    return gaps.filter((g) => !(g.to === null && g.reason === "blind" && now - g.from < MIN_BLIND_MS));
}
