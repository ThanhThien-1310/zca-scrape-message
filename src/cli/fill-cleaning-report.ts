import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { setReportDir } from "../core/paths.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
import { classifyCleaningTitle, cleaningReportDay, parseCleaningMessage } from "../lesson/cleaningReport.js";
import { buildCleaningRows, CLEANING_LAYOUT, cleaningHeaderCells } from "../lesson/cleaningRows.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { freeFormFileName, legendFormulaCells, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { hhmmVietnam, todayVietnam, vietnamDay } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { CleaningEntry, SourceMessage } from "../types/index.js";

/**
 * Điền sheet HANG NGAY của mẫu VỆ SINH PHÒNG MÁY (04 - FORM VE SINH PHONG MAY.xlsx) từ tin "BÁO CÁO CUỐI BUỔI" (IT kỹ thuật) của
 * ĐÚNG 1 ngày (tạm thời là CHÍNH NGÀY HÔM NAY, không lùi ngày — xem cleaningReportDay). Độc lập với Phase/SessionKey —
 * xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md và 2026-10-03-bo-mau-moi-7-file-design.md (mẫu mới: sheet TONG để
 * trống, chỉ cập nhật ngày). An toàn khi chạy lại nhiều lần trong ngày:
 * luôn quét lại toàn bộ tin của đúng ngày mục tiêu rồi ghi đè, không có state tích luỹ.
 *
 *   npm run fill:cleaning-report -- [--set <id>] [--now <unix ms>]
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
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    requireKey(set, "cleaning");
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
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    fs.mkdirSync(outDir, { recursive: true });

    const rows = buildCleaningRows(entries, day);
    const title = readTemplateTitle(path.join(templatesSrc, CLEANING_LAYOUT.templateFile), CLEANING_LAYOUT.sheet);
    const hhmm = hhmmVietnam(now);
    const outName = freeFormFileName(title, day, hhmm);

    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ.
    const outPrefix = `${title}_${yyMMdd}_T`;
    runFillReplacingSameDay({
        name: "cleaning",
        templatesSrc,
        layout: CLEANING_LAYOUT,
        outDir,
        outName,
        rows,
        // "Ngày báo cáo" là ngày CHẠY báo cáo (hôm nay), ở cả sheet HANG NGAY và sheet TONG. Hiện trùng với cột B (NGÀY) vì báo
        // cáo không còn lùi ngày; nếu khôi phục việc lùi ngày trong cleaningReportDay thì hai ngày này lại khác nhau.
        headerCells: cleaningHeaderCells(todayVietnam(now), now),
        formulaCells: legendFormulaCells(CLEANING_LAYOUT, rows.length),
    }, outPrefix);

    console.log(`[fill-cleaning-report] bộ ${set.id}, ngày ${day}: ${rows.length} dòng -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
