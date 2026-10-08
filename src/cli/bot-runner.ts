import fs from "node:fs";
import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import { config } from "../../config.js";
import { noScrapeGroupsFromFile } from "../chat/rules.js";
import { enqueueTarget, importLegacyQueue, readQueue, readQueueMeta, readQueueSeen } from "../scrape/scrapeQueue.js";
import { effectiveGaps, HEARTBEAT_INTERVAL_MS, readState } from "../watch/watchState.js";
import { gapsInWindow, recoveryWindow } from "../lesson/recovery.js";
import { currentSession, todayVietnam } from "../lesson/time.js";
import { loadBuiltBySet, readBuiltRaw, writeBuiltBySet } from "../runner/builtReports.js";
import { pendingBuilds } from "../runner/buildPlan.js";
import { readFailed } from "../runner/failedFills.js";
import { legacyOverridesWarning } from "../reportSets/legacy.js";
import { loadReportSets, logSetProblems } from "../reportSets/cliSet.js";
import { runCycle } from "../runner/cycle.js";
import { beatRunner, readRunnerState, recordCycle, setPhase, startRunner, stopRunner } from "../runner/runnerState.js";
import { selectFreshGaps } from "../runner/recoveryPlan.js";
import { decide, DIRTY_CHECK_MS, DIRTY_RETRY_MS, POLL_MS, settledGaps, toQueueTimes, watchWarmingUp } from "../runner/schedule.js";
import { loadMessages, realDeps } from "../runner/steps.js";
import type { Gap } from "../types/index.js";

/**
 * Long-running orchestrator. `bot:watch` only detects and queues; this process notices work, waits for a
 * quiet spell (src/runner/schedule.ts), then runs a cycle: recover a `bot:watch` gap if there was one, scrape
 * the queue, sync the DB, rebuild the Excel of every session that has a report not built yet
 * (src/runner/cycle.ts). Work is any of: groups in the queue; a `bot:watch` gap over the current session not
 * recovered yet; a session with an unbuilt report (checked every minute, every 5 minutes after a build
 * error). It never restarts `bot:watch`. Like `bot:scrape`, a scrape relaunches Zalo Desktop if its debug
 * port is closed, which is why nothing runs while `bot:watch` is still starting (it relaunches Zalo itself).
 *
 *   npm run bot:runner
 *
 * After 3 failed cycles in a row it stops trying (state `error`) until restarted; the queue is untouched.
 * Look at it with `npm run runner:status`.
 */
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

    const { active: sets, problems } = loadReportSets();
    logSetProblems(problems, log);
    if (sets.length === 0) log("[runner] KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: vẫn cào và đồng bộ DB nhưng không xuất file nào. Sửa config.reportSets rồi khởi động lại.");
    const legacy = legacyOverridesWarning(sets, (file) => fs.existsSync(file));
    if (legacy) log(`[runner] CẢNH BÁO: ${legacy}`);
    const baseline = loadBuiltBySet(readBuiltRaw(), sets.map((s) => s.id), await loadMessages());
    if (baseline.changed && sets.length > 0) {
        writeBuiltBySet(baseline.built);
        log("[runner] bộ mới hoặc lần chạy đầu: các báo cáo đã có coi như đã dựng (dựng lại một buổi bằng `npm run runner:once`).");
    }

    // The gaps the NEXT cycle must recover; set right before each cycle and read by its recover step, so an old gap that
    // was already recovered never makes a queue-triggered cycle rescan the groups that still lack a report.
    const plan: { gaps: Gap[] } = { gaps: [] };
    const deps = realDeps({ freshGaps: () => plan.gaps, sets: () => sets });
    const startedAt = Date.now();
    const recovered = new Set<string>();
    let nextDirtyCheck = 0;
    const SWEEP_MS = config.runner.sweepMinutes * 60_000;
    const ERROR_RETRY_MS = config.runner.errorRetryMinutes * 60_000;
    let nextSweep = Date.now() + SWEEP_MS;
    const imported = importLegacyQueue();
    if (imported > 0) log(`[runner] đã nhập ${imported} nhóm từ hàng chờ cũ (.scrape-queue.json) sang hàng chờ mới.`);
    log("[runner] running. Waiting for work.");

    for (;;) {
        await sleep(POLL_MS);
        const now = Date.now();
        const runnerState = readRunnerState();
        // Đã ngừng vì lỗi liên tiếp: nằm im, nhưng sau errorRetryMinutes thử lại (0 = ngừng hẳn, chỉ khởi động lại mới xoá).
        if (runnerState?.state === "error" && (ERROR_RETRY_MS === 0 || now - (runnerState.lastCycle?.at ?? 0) < ERROR_RETRY_MS)) continue;
        // Lưới an toàn khi bot:watch mù mà không biết: định kỳ xếp mọi nhóm vào hàng chờ để cào bù tin chữ.
        if (SWEEP_MS > 0 && now >= nextSweep) {
            nextSweep = now + SWEEP_MS;
            const skip = new Set(noScrapeGroupsFromFile());
            const targets = config.targets.filter((t) => !skip.has(t));
            for (const t of targets) enqueueTarget(t);
            log(`[runner] cào bù theo lịch (mỗi ${config.runner.sweepMinutes} phút): xếp ${targets.length} nhóm vào hàng chờ.`);
        }
        if (watchWarmingUp(readState(), now)) {
            setPhase(now, "waiting");
            continue; // bot:watch is restarting Zalo Desktop; do not touch it yet
        }

        const decision = decide(toQueueTimes(readQueue(), readQueueMeta(), startedAt, readQueueSeen()), now);

        // bot:watch may be dead and so queue nothing at all: a gap that covers the current session and
        // has not been recovered yet triggers a cycle by itself (its recover step re-scrapes what is missing).
        const day = todayVietnam(now);
        const buoi = currentSession(now);
        const gaps = settledGaps(gapsInWindow(effectiveGaps(now), recoveryWindow(day, buoi), now), now);
        const fresh = selectFreshGaps(gaps, recovered, `${day}|${buoi}`);
        const freshGaps = fresh.keys;

        // A report that is on disk but not built (the runner or a cycle died, a manual scrape, a failed build).
        let dirty = false;
        if (now >= nextDirtyCheck) {
            const messages = await loadMessages();
            const { built } = loadBuiltBySet(readBuiltRaw(), sets.map((s) => s.id), messages);
            dirty = pendingBuilds(sets, messages, built, readFailed()).length > 0;
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
        plan.gaps = fresh.fresh;
        try {
            const why = decision.action === "run" ? `hàng chờ: ${decision.reason}` : freshGaps.length > 0 ? "khoảng gián đoạn của bot:watch" : "có báo cáo chưa dựng";
            log(`[runner] bắt đầu vòng (${why}).`);
            const summary = await runCycle(deps);
            if (summary.ok) for (const key of freshGaps) recovered.add(key); // a failed recovery is tried again
            // Cặp (bộ, mã) lỗi cũng chờ DIRTY_RETRY_MS: nếu không, một mẫu thiếu sẽ làm runner chạy cả một vòng mỗi phút.
            const failedReports = (summary.sets ?? []).flatMap((s) => s.failedReports.map((r) => `${s.id} ${r}`));
            if (summary.buildErrors.length > 0 || failedReports.length > 0) nextDirtyCheck = Date.now() + DIRTY_RETRY_MS;
            const state = recordCycle(Date.now(), summary);
            log(`[runner] vòng xong sau ${((summary.durationMs ?? 0) / 1000).toFixed(1)} s: ${summary.ok ? "OK" : "LỖI"} — nhóm ${summary.groups.length}, buổi ${summary.sessions.length}, cần xem ${summary.reviewCount}${summary.errors.length > 0 ? `, lỗi: ${summary.errors.join("; ")}` : ""}${summary.buildErrors.length > 0 ? `, lỗi dựng: ${summary.buildErrors.join("; ")}` : ""}${failedReports.length > 0 ? `, file lỗi: ${failedReports.join("; ")}` : ""}`);
            if (state.state === "error") log(`[runner] ${state.consecutiveFailures} vòng lỗi liên tiếp — ngừng tự thử. Sửa nguyên nhân rồi khởi động lại.`);
        } finally {
            plan.gaps = [];
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
