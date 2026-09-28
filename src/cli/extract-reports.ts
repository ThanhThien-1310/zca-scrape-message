import fs from "node:fs";
import path from "node:path";
import { outputDir } from "../core/paths.js";
import { extractAll } from "../lesson/extract.js";
import { readOverrides } from "../lesson/overrides.js";
import { lookupRoomIds } from "../lesson/roomLookup.js";
import { currentSession, isBuoi, todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { Buoi, SourceMessage } from "../types/index.js";

/**
 * Extracts every start/end-of-lesson report of ONE session (sáng/chiều/tối) of
 * one Vietnam calendar day from the scraped `data/<groupId>.json` files and
 * writes, into `output/`:
 *   output.json  — the valid reports (input of `fill:report`)
 *   marks.json   — StatusId for every message considered (input of `mark:messages`)
 *   review.json  — reports the agent should check against the raw text
 *   meta.json    — { day, buoi } so `fill:report` can name the Excel file
 * `output/overrides.json`, when present, holds the agent's corrections.
 *
 *   npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]
 *
 * `--buoi` defaults to the session of the current time.
 */
const outDir = outputDir;

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, file), JSON.stringify(value, null, 2), "utf8");
}

async function main(): Promise<void> {
    const day = option("--day") ?? todayVietnam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isBuoi(buoiArg)) throw new Error(`--buoi must be sang, chieu or toi, got "${buoiArg}"`);
    const buoi: Buoi = buoiArg ?? currentSession();
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

    writeJson("output.json", result.reports);
    writeJson("marks.json", result.marks);
    writeJson("review.json", result.review);
    writeJson("meta.json", { day, buoi });

    const s = result.summary;
    console.log(`[extract] ngày ${day}, buổi ${buoi}: xét ${s.xet} tin, ${s.baoCao} báo cáo, ${s.boQua} tin bỏ qua (-1), ${s.canXem} mục cần xem${noDb ? " (không tra DB)" : ""}`);
    for (const [lyDo, n] of Object.entries(s.theoLyDo)) console.log(`  ${lyDo}: ${n}`);
    for (const k of result.unknownOverrides) console.warn(`[extract] CẢNH BÁO: override cho maNhom=${k.maNhom} maTinNhan=${k.maTinNhan} không khớp tin nhắn nào — kiểm tra lại key trong output/overrides.json.`);
    if (s.canXem > 0) console.log(`[extract] xem output/review.json, sửa bằng output/overrides.json rồi chạy lại lệnh này.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
