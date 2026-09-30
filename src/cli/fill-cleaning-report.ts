import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { classifyCleaningTitle, cleaningReportDay, parseCleaningMessage } from "../lesson/cleaningReport.js";
import { buildCleaningRows, CLEANING_LAYOUT, cleaningFormulaCells } from "../lesson/cleaningRows.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { excelDateSerialForDay, freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { vietnamDay } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { CleaningEntry, SourceMessage } from "../types/index.js";

/**
 * Điền sheet HANG NGAY của TINH TRANG VE SINH PHONG MAY.xlsx từ tin "BÁO CÁO CUỐI BUỔI" (IT kỹ thuật) của
 * ĐÚNG 1 ngày (hôm qua, hoặc Thứ 7 nếu hôm nay Thứ 2 — xem cleaningReportDay). Độc lập với Phase/SessionKey —
 * xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md. An toàn khi chạy lại nhiều lần trong ngày:
 * luôn quét lại toàn bộ tin của đúng ngày mục tiêu rồi ghi đè, không có state tích luỹ.
 *
 *   npm run fill:cleaning-report -- [--now <unix ms>]
 */
async function loadAllMessages(): Promise<SourceMessage[]> {
    const store = new MessageStore();
    const all: SourceMessage[] = [];
    for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
    return all;
}

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const now = Number(option("--now") ?? Date.now());
    const day = cleaningReportDay(now);

    const messages = await loadAllMessages();
    const entries: CleaningEntry[] = [];
    for (const msg of messages) {
        if (vietnamDay(msg.ts) !== day) continue;
        if (!classifyCleaningTitle(msg.content)) continue;
        for (const room of parseCleaningMessage(msg.content)) {
            entries.push({ maNhom: msg.groupId, maTinNhan: msg.msgId, thoiGian: msg.ts, ...room });
        }
    }

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMM = day.slice(2, 4) + day.slice(5, 7);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = path.join(config.dataDir, "export", "trang-thai", yyMM, yyMMdd);
    fs.mkdirSync(outDir, { recursive: true });

    const rows = buildCleaningRows(entries, day);
    const title = readTemplateTitle(path.join(templatesSrc, CLEANING_LAYOUT.templateFile), CLEANING_LAYOUT.sheet);
    const hhmm = new Date(now + 7 * 3_600_000).toISOString().slice(11, 16).replace(":", "");
    const outName = freeFormFileName(title, day, hhmm);

    runFillTemplate({
        name: "cleaning",
        templatesSrc,
        layout: CLEANING_LAYOUT,
        outDir,
        outName,
        rows,
        headerCells: [{ ref: "H2", value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" }],
        formulaCells: cleaningFormulaCells(CLEANING_LAYOUT.firstDataRow, rows.length),
    });

    console.log(`[fill-cleaning-report] ngày ${day}: ${rows.length} dòng -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
