import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import { isPhase, phaseOf, todayVietnam } from "../lesson/time.js";
import { readBuilt, sessionReportKeys, writeBuilt } from "../runner/builtReports.js";
import { appendLog } from "../runner/runnerState.js";
import { buildSession, loadMessages } from "../runner/steps.js";
import type { CycleSummary, Phase } from "../types/index.js";

/**
 * Rebuilds ONE session's outputs without scraping: extract (applying output/overrides.json),
 * write the Excel (temp file then swap), mark the messages, and count the session's reports as built.
 * This is what the agent runs after fixing `overrides.json`. It touches neither Zalo Desktop nor the
 * queue, but it shares `output/` with the runner's cycles, so it takes the same lock and refuses to run
 * while a cycle (or a manual scrape) holds it; try again in a minute.
 *
 *   npm run runner:once -- [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const day = option("--day") ?? todayVietnam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isPhase(buoiArg)) throw new Error(`--buoi must be morningstart, morningend, afternoonstart or afternoonend, got "${buoiArg}"`);
    const buoi: Phase = buoiArg ?? phaseOf(Date.now());

    const lock = acquireScrapeLock("runner:once");
    if (!lock.ok) {
        console.error(`[rebuild] đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) chạy và dùng chung thư mục output/ — thử lại sau ít phút.`);
        process.exit(2);
    }
    try {
        const summary: CycleSummary = { kind: "rebuild", at: Date.now(), ok: true, groups: [], sessions: [{ day, buoi }], reviewCount: 0, excel: [], warnings: [], errors: [], buildErrors: [] };
        try {
            const built = await buildSession({ day, buoi });
            summary.reviewCount = built.reviewCount;
            if (built.excel) summary.excel.push(built.excel);
            summary.warnings.push(...built.warnings);
            const keys = readBuilt() ?? new Set<string>();
            for (const key of sessionReportKeys(await loadMessages(), { day, buoi })) keys.add(key);
            writeBuilt(keys);
        } catch (err) {
            summary.ok = false;
            summary.errors.push((err as Error).message);
            process.exitCode = 1;
        }
        appendLog(summary);
        console.log(`[rebuild] ${day} ${buoi}: ${summary.ok ? "OK" : "LỖI"}, cần xem ${summary.reviewCount} (output/review_${day}_${buoi}.json)${summary.excel.length > 0 ? `, Excel: ${summary.excel.join(", ")}` : ", không có Excel (không báo cáo nào có phòng trong DB)"}`);
        for (const w of summary.warnings) console.warn(`[rebuild] cảnh báo: ${w}`);
        for (const e of summary.errors) console.error(`[rebuild] lỗi: ${e}`);
    } finally {
        releaseScrapeLock();
    }
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
    releaseScrapeLock();
});
