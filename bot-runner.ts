import { acquireScrapeLock, releaseScrapeLock } from "./history/scrapeLock.js";
import { readQueue, readQueueMeta, readQueueSeen } from "./history/scrapeQueue.js";
import { effectiveGaps, HEARTBEAT_INTERVAL_MS, readState } from "./history/watchState.js";
import { gapsInWindow, sessionWindow } from "./lesson/recovery.js";
import { currentSession, todayVietnam } from "./lesson/time.js";
import { dirtySessions, initBuiltBaseline, readBuilt } from "./runner/builtReports.js";
import { runCycle } from "./runner/cycle.js";
import { beatRunner, readRunnerState, recordCycle, setPhase, startRunner, stopRunner } from "./runner/runnerState.js";
import { decide, newRecoveryKeys, settledGaps, toQueueTimes, watchWarmingUp } from "./runner/schedule.js";
import { loadMessages, realDeps } from "./runner/steps.js";

/**
 * Long-running orchestrator. `bot:watch` only detects and queues; this process notices work, waits for a
 * quiet spell (runner/schedule.ts), then runs a cycle: recover a `bot:watch` gap if there was one, scrape
 * the queue, sync the DB, rebuild the Excel of every session that has a report not built yet
 * (runner/cycle.ts). Work is any of: groups in the queue; a `bot:watch` gap over the current session not
 * recovered yet; a session with an unbuilt report (checked every minute, every 5 minutes after a build
 * error). It never restarts `bot:watch`. Like `bot:scrape`, a scrape relaunches Zalo Desktop if its debug
 * port is closed, which is why nothing runs while `bot:watch` is still starting (it relaunches Zalo itself).
 *
 *   npm run bot:runner
 *
 * After 3 failed cycles in a row it stops trying (state `error`) until restarted; the queue is untouched.
 * Look at it with `npm run runner:status`.
 */
const POLL_MS = 5_000;
const DIRTY_CHECK_MS = 60_000;
const DIRTY_RETRY_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function main(): Promise<void> {
    const started = startRunner(Date.now(), process.pid);
    if (started.anotherInstanceAlive) {
        console.error("[runner] another `bot:runner` is already running — exiting.");
        process.exit(1);
    }
    if (started.crashed) log("[runner] the previous bot:runner did not stop cleanly; reports it had not built yet are found again and built.");

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

    if (initBuiltBaseline(await loadMessages())) log("[runner] first start: the reports that already exist count as built (rebuild one with `npm run runner:once`).");

    const deps = realDeps();
    const startedAt = Date.now();
    const recovered = new Set<string>();
    let nextDirtyCheck = 0;
    log("[runner] running. Waiting for work.");

    for (;;) {
        await sleep(POLL_MS);
        const now = Date.now();
        if (readRunnerState()?.state === "error") continue; // stopped trying; a restart clears it
        if (watchWarmingUp(readState(), now)) {
            setPhase(now, "waiting");
            continue; // bot:watch is restarting Zalo Desktop; do not touch it yet
        }

        const decision = decide(toQueueTimes(readQueue(), readQueueMeta(), startedAt, readQueueSeen()), now);

        // bot:watch may be dead and so queue nothing at all: a gap that covers the current session and
        // has not been recovered yet triggers a cycle by itself (its recover step re-scrapes what is missing).
        const day = todayVietnam(now);
        const buoi = currentSession(now);
        const gaps = settledGaps(gapsInWindow(effectiveGaps(now), sessionWindow(day, buoi), now), now);
        const freshGaps = newRecoveryKeys(gaps, recovered, `${day}|${buoi}`);

        // A report that is on disk but not built (the runner or a cycle died, a manual scrape, a failed build).
        let dirty = false;
        if (now >= nextDirtyCheck) {
            dirty = dirtySessions(await loadMessages(), readBuilt() ?? new Set<string>()).length > 0;
            nextDirtyCheck = now + DIRTY_CHECK_MS;
        }

        if (decision.action !== "run" && freshGaps.length === 0 && !dirty) {
            setPhase(now, decision.action === "wait" ? "waiting" : "idle");
            continue;
        }

        const lock = acquireScrapeLock("bot:runner");
        if (!lock.ok) {
            log(`[runner] "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) đang điều khiển Zalo Desktop — thử lại sau.`);
            nextDirtyCheck = 0;
            continue;
        }
        setPhase(now, "running");
        try {
            const why = decision.action === "run" ? `hàng chờ: ${decision.reason}` : freshGaps.length > 0 ? "khoảng gián đoạn của bot:watch" : "có báo cáo chưa dựng";
            log(`[runner] bắt đầu vòng (${why}).`);
            const summary = await runCycle(deps);
            if (summary.ok) for (const key of freshGaps) recovered.add(key); // a failed recovery is tried again
            if (summary.buildErrors.length > 0) nextDirtyCheck = Date.now() + DIRTY_RETRY_MS;
            const state = recordCycle(Date.now(), summary);
            log(`[runner] vòng xong: ${summary.ok ? "OK" : "LỖI"} — nhóm ${summary.groups.length}, buổi ${summary.sessions.length}, cần xem ${summary.reviewCount}${summary.errors.length > 0 ? `, lỗi: ${summary.errors.join("; ")}` : ""}${summary.buildErrors.length > 0 ? `, lỗi dựng: ${summary.buildErrors.join("; ")}` : ""}`);
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
