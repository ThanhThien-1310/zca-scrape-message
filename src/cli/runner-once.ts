import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import { isPhase, phaseOf, todayVietnam } from "../lesson/time.js";
import { loadBuiltBySet, readBuiltRaw, sessionReportKeys, writeBuiltBySet } from "../runner/builtReports.js";
import { readFailed, settle, writeFailed } from "../runner/failedFills.js";
import { mergeMarks } from "../runner/mergeMarks.js";
import { appendLog } from "../runner/runnerState.js";
import { buildSet, loadMessages, markMerged } from "../runner/steps.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
import type { ReportKey } from "../reportSets/registry.js";
import type { CycleSummary, Mark, Phase } from "../types/index.js";

/**
 * Rebuilds ONE session's outputs without scraping, for one report set (`--set <id>`) or for every active set: extract (applying
 * output/<id>/overrides.json), fill the set's per-phase status files, mark the messages, and count the session's reports as built.
 * This is what the agent runs after fixing an `overrides.json`. It touches neither Zalo Desktop nor the
 * queue, but it shares `output/` with the runner's cycles, so it takes the same lock and refuses to run
 * while a cycle (or a manual scrape) holds it; try again in a minute.
 *
 *   npm run runner:once -- [--set <id>] [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend]
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

    const loaded = loadReportSets();
    logSetProblems(loaded.problems);
    const chosen = option("--set") === undefined ? loaded.active : [pickSet(loaded.active, option("--set"))];
    if (chosen.length === 0) {
        console.error("[rebuild] không có bộ báo cáo nào để dựng.");
        process.exit(2);
    }

    const lock = acquireScrapeLock("runner:once");
    if (!lock.ok) {
        console.error(`[rebuild] đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) chạy và dùng chung thư mục output/ — thử lại sau ít phút.`);
        process.exit(2);
    }
    try {
        const summary: CycleSummary = { kind: "rebuild", at: Date.now(), ok: true, groups: [], sessions: [{ day, buoi }], reviewCount: 0, excel: [], warnings: [], errors: [], buildErrors: [], sets: [] };
        const messages = await loadMessages();
        const { built } = loadBuiltBySet(readBuiltRaw(), loaded.active.map((s) => s.id), messages);
        const failed = readFailed();
        const marks: Mark[] = [];
        for (const set of chosen.filter((s) => s.phaseKeys.length > 0)) {
            const setSummary = { id: set.id, sessions: [{ day, buoi }], failedReports: [] as string[] };
            summary.sets!.push(setSummary);
            try {
                const result = await buildSet(set, { day, buoi }, set.phaseKeys);
                summary.reviewCount += result.reviewCount;
                summary.warnings.push(...result.warnings.map((w) => `${set.id}: ${w}`));
                marks.push(...result.marks);
                settle(failed, set.id, { day, buoi }, set.phaseKeys, result.failedKeys as ReportKey[]);
                setSummary.failedReports.push(...result.failedKeys.map((k) => `${day} ${buoi} ${k}`));
                const keys = built.get(set.id) ?? new Set<string>();
                for (const key of sessionReportKeys(messages, { day, buoi })) keys.add(key);
                built.set(set.id, keys);
            } catch (err) {
                summary.ok = false;
                summary.errors.push(`${set.id}: ${(err as Error).message}`);
                process.exitCode = 1;
            }
        }
        writeBuiltBySet(built);
        writeFailed(failed);
        try {
            await markMerged(mergeMarks(marks));
        } catch (err) {
            summary.warnings.push(`đánh dấu tin: ${(err as Error).message}`);
        }
        appendLog(summary);
        console.log(`[rebuild] ${day} ${buoi}: ${summary.ok ? "OK" : "LỖI"}, ${chosen.map((s) => s.id).join(", ")}, cần xem ${summary.reviewCount} (output/<bộ>/review_${day}_${buoi}.json) -- xem file trạng thái thiết bị ở thư mục của từng bộ trong statusExportDir`);
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
