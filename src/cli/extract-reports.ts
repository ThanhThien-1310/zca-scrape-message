import fs from "node:fs";
import path from "node:path";
import { setOutputDir } from "../core/paths.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
import { extractAll } from "../lesson/extract.js";
import { readOverrides } from "../lesson/overrides.js";
import { lookupRoomIds } from "../lesson/roomLookup.js";
import { isBuoi, isPhase, phaseOf, todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { Buoi, Phase, SourceMessage } from "../types/index.js";

/**
 * Extracts every start/end-of-lesson report of ONE giai đoạn (đầu/cuối buổi sáng, đầu/cuối buổi chiều) of
 * one Vietnam calendar day from the scraped `data/<groupId>.json` files and
 * writes, into `output/<id>/` (`<id>` = the report set, `--set <id>`; omit it when exactly one set is active):
 *   output.json  — the valid reports (input of `fill:status-reports`)
 *   marks.json   — StatusId for every message considered (input of `mark:messages`)
 *   review.json  — reports the agent should check against the raw text
 *   meta.json    — { day, buoi } so `fill:status-reports` can name the files
 * `output/<id>/overrides.json`, when present, holds the agent's corrections for THAT set (editing one set's data never touches another's).
 *
 *   npm run extract:reports -- [--set <id>] [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--no-db]
 *
 * `--buoi` defaults to the raw phase of the current time (`phaseOf`).
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function writeJson(dir: string, file: string, value: unknown): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2), "utf8");
}

async function main(): Promise<void> {
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    const outDir = setOutputDir(set.id);
    const day = option("--day") ?? todayVietnam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
    const buoiArg = option("--buoi");
    // Giá trị Buoi cũ (sang|chieu|toi) vẫn được nhận TẠM THỜI cho tới khi bot:runner migrate sang Phase (Chặng 2)
    // — xem ExtractOptions.buoi trong src/lesson/extract.ts.
    if (buoiArg !== undefined && !isPhase(buoiArg) && !isBuoi(buoiArg)) {
        throw new Error(`--buoi must be morningstart, morningend, afternoonstart, afternoonend (or the deprecated sang, chieu, toi), got "${buoiArg}"`);
    }
    const buoi: Buoi | Phase = buoiArg ?? phaseOf(Date.now());
    const noDb = process.argv.includes("--no-db");

    const store = new MessageStore();
    const messages: SourceMessage[] = [];
    for (const groupId of store.listThreads()) messages.push(...(await store.readThread(groupId)));

    const result = await extractAll(messages, {
        day,
        buoi,
        overrides: readOverrides(path.join(outDir, "overrides.json")),
        lookupRoomIds: noDb ? undefined : lookupRoomIds,
    });

    writeJson(outDir, "output.json", result.reports);
    writeJson(outDir, "marks.json", result.marks);
    writeJson(outDir, "review.json", result.review);
    writeJson(outDir, "meta.json", { day, buoi });

    const s = result.summary;
    console.log(`[extract] bộ ${set.id}, ngày ${day}, buổi ${buoi}: xét ${s.xet} tin, ${s.baoCao} báo cáo, ${s.boQua} tin bỏ qua (-1), ${s.canXem} mục cần xem${noDb ? " (không tra DB)" : ""}`);
    for (const [lyDo, n] of Object.entries(s.theoLyDo)) console.log(`  ${lyDo}: ${n}`);
    for (const k of result.unknownOverrides) console.warn(`[extract] CẢNH BÁO: override cho maNhom=${k.maNhom} maTinNhan=${k.maTinNhan} không khớp tin nhắn nào — kiểm tra lại key trong ${path.join(outDir, "overrides.json")}.`);
    if (s.canXem > 0) console.log(`[extract] xem ${path.join(outDir, "review.json")}, sửa bằng ${path.join(outDir, "overrides.json")} rồi chạy lại lệnh này.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
