import { currentSession, isBuoi, todayVietnam, type Buoi } from "./lesson/time.js";
import { appendLog, readPending, writePending, type CycleSummary } from "./runner/runnerState.js";
import { buildSession } from "./runner/steps.js";

/**
 * Rebuilds ONE session's outputs without scraping: extract (applying output/overrides.json),
 * write the Excel (temp file then swap), mark the messages. This is what the agent runs after
 * fixing `overrides.json`. Touching neither Zalo Desktop nor the queue, it does not need the scrape lock.
 *
 *   npm run runner:once -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const day = option("--day") ?? todayVietnam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isBuoi(buoiArg)) throw new Error(`--buoi must be sang, chieu or toi, got "${buoiArg}"`);
    const buoi: Buoi = buoiArg ?? currentSession();

    const summary: CycleSummary = { kind: "rebuild", at: Date.now(), ok: true, groups: [], sessions: [{ day, buoi }], reviewCount: 0, excel: [], warnings: [], errors: [] };
    try {
        const built = await buildSession({ day, buoi });
        summary.reviewCount = built.reviewCount;
        if (built.excel) summary.excel.push(built.excel);
        summary.warnings.push(...built.warnings);
        writePending(readPending().filter((s) => s.day !== day || s.buoi !== buoi));
    } catch (err) {
        summary.ok = false;
        summary.errors.push((err as Error).message);
        process.exitCode = 1;
    }
    appendLog(summary);
    console.log(`[rebuild] ${day} ${buoi}: ${summary.ok ? "OK" : "LỖI"}, cần xem ${summary.reviewCount}${summary.excel.length > 0 ? `, Excel: ${summary.excel.join(", ")}` : ", không có Excel (không báo cáo nào có phòng trong DB)"}`);
    for (const w of summary.warnings) console.warn(`[rebuild] cảnh báo: ${w}`);
    for (const e of summary.errors) console.error(`[rebuild] lỗi: ${e}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
