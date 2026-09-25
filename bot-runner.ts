import { acquireScrapeLock, releaseScrapeLock } from "./history/scrapeLock.js";
import { readQueue, readQueueMeta } from "./history/scrapeQueue.js";
import { effectiveGaps, HEARTBEAT_INTERVAL_MS } from "./history/watchState.js";
import { gapsInWindow, sessionWindow } from "./lesson/recovery.js";
import { currentSession, todayVietnam } from "./lesson/time.js";
import { runCycle } from "./runner/cycle.js";
import { beatRunner, readRunnerState, recordCycle, setPhase, startRunner, stopRunner } from "./runner/runnerState.js";
import { decide, newRecoveryKeys, toQueueTimes } from "./runner/schedule.js";
import { realDeps } from "./runner/steps.js";

/**
 * Long-running orchestrator. `bot:watch` only detects and queues; this process notices the queue
 * has groups, waits for a quiet spell (runner/schedule.ts), then runs a cycle: recover a
 * `bot:watch` gap if there was one, scrape the queue, sync the DB, rebuild the Excel of every
 * session that got a new report (runner/cycle.ts). It never restarts Zalo Desktop or `bot:watch`.
 *
 *   npm run bot:runner
 *
 * After 3 failed cycles in a row it stops trying (state `error`) until restarted; the queue is untouched.
 * Look at it with `npm run runner:status`.
 */
const POLL_MS = 5_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function main(): Promise<void> {
    const started = startRunner(Date.now(), process.pid);
    if (started.anotherInstanceAlive) {
        console.error("[runner] another `bot:runner` is already running — exiting.");
        process.exit(1);
    }
    if (started.crashed) log("[runner] the previous bot:runner did not stop cleanly; unfinished sessions (data/.runner-pending.json) will be rebuilt.");

    const shutdown = (code: number) => {
        stopRunner(Date.now());
        releaseScrapeLock();
        process.exit(code);
    };
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
    process.on("uncaughtException", (err) => {
        console.error("[runner] fatal:", err);
        shutdown(1);
    });
    process.on("unhandledRejection", (err) => {
        console.error("[runner] fatal:", err);
        shutdown(1);
    });

    setInterval(() => beatRunner(Date.now()), HEARTBEAT_INTERVAL_MS);

    const deps = realDeps();
    const startedAt = Date.now();
    const recovered = new Set<string>();
    log("[runner] running. Waiting for groups in the scrape queue.");

    for (;;) {
        await sleep(POLL_MS);
        const now = Date.now();
        if (readRunnerState()?.state === "error") continue; // stopped trying; a restart clears it

        const times = toQueueTimes(readQueue(), readQueueMeta(), startedAt);
        const decision = decide(times, now);

        // bot:watch may be dead and so queue nothing at all: a gap that covers the current session and
        // has not been recovered yet triggers a cycle by itself (its recover step re-scrapes what is missing).
        const gaps = gapsInWindow(effectiveGaps(now), sessionWindow(todayVietnam(now), currentSession(now)), now);
        const freshGaps = newRecoveryKeys(gaps, recovered);

        if (decision.action !== "run" && freshGaps.length === 0) {
            setPhase(now, decision.action === "wait" ? "waiting" : "idle");
            continue;
        }

        const lock = acquireScrapeLock("bot:runner");
        if (!lock.ok) {
            log(`[runner] "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) đang điều khiển Zalo Desktop — thử lại sau.`);
            continue;
        }
        setPhase(now, "running");
        try {
            log(`[runner] bắt đầu vòng (${decision.action === "run" ? `hàng chờ: ${decision.reason}` : "khoảng gián đoạn của bot:watch"}).`);
            const summary = await runCycle(deps);
            for (const key of freshGaps) recovered.add(key);
            const state = recordCycle(Date.now(), summary);
            log(`[runner] vòng xong: ${summary.ok ? "OK" : "LỖI"} — nhóm ${summary.groups.length}, buổi ${summary.sessions.length}, cần xem ${summary.reviewCount}${summary.errors.length > 0 ? `, lỗi: ${summary.errors.join("; ")}` : ""}`);
            if (state.state === "error") log(`[runner] ${state.consecutiveFailures} vòng lỗi liên tiếp — ngừng tự thử. Sửa nguyên nhân rồi khởi động lại.`);
        } finally {
            releaseScrapeLock();
        }
    }
}

main().catch((err) => {
    console.error(err);
    stopRunner(Date.now());
    releaseScrapeLock();
    process.exit(1);
});
