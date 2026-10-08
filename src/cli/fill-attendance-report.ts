import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { setReportDir } from "../core/paths.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
import { classifyAttendanceTitle, parseAttendanceMessage } from "../lesson/attendanceReport.js";
import { ATTENDANCE_LAYOUT, attendanceHeaderCells, buildAttendanceRows } from "../lesson/attendanceRows.js";
import { groupAttendanceByDay } from "../lesson/attendanceDays.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { hhmmVietnam, todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { AttendanceEntry, SourceMessage } from "../types/index.js";

/**
 * Điền sheet HANG NGAY của mẫu NỘI QUY THỰC TẬP (05 - FORM NOI QUY THUC TAP.xlsx) từ tin "BÁO CÁO ĐIỂM DANH" — KHÔNG lùi ngày
 * (khác vệ sinh): mỗi lần chạy tính lại toàn bộ danh sách người vi phạm của HÔM NAY. Mẫu mới không còn cột SỐ LẦN nên không
 * đếm lịch sử nữa. Độc lập với Phase/SessionKey — xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md và
 * 2026-10-03-bo-mau-moi-7-file-design.md.
 *
 *   npm run fill:attendance-report -- [--set <id>] [--now <unix ms>]
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
    requireKey(set, "attendance");
    const now = Number(option("--now") ?? Date.now());
    const day = todayVietnam(now);

    const messages = await loadAllMessages();
    const entries: AttendanceEntry[] = [];
    for (const msg of messages) {
        if (!classifyAttendanceTitle(msg.content)) continue;
        const parsed = parseAttendanceMessage(msg.content);
        if (!parsed) continue;
        entries.push({ maNhom: msg.groupId, maTinNhan: msg.msgId, thoiGian: msg.ts, tenNV: parsed.tenNV, noiLamViec: parsed.noiLamViec });
    }

    const records = groupAttendanceByDay(entries);
    const rows = buildAttendanceRows(records, day);

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    fs.mkdirSync(outDir, { recursive: true });

    const title = readTemplateTitle(path.join(templatesSrc, ATTENDANCE_LAYOUT.templateFile), ATTENDANCE_LAYOUT.sheet);
    const hhmm = hhmmVietnam(now);
    const outName = freeFormFileName(title, day, hhmm);

    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ.
    const outPrefix = `${title}_${yyMMdd}_T`;
    runFillReplacingSameDay({
        name: "attendance",
        templatesSrc,
        layout: ATTENDANCE_LAYOUT,
        outDir,
        outName,
        rows,
        headerCells: attendanceHeaderCells(day, now),
    }, outPrefix);

    console.log(`[fill-attendance-report] bộ ${set.id}, ngày ${day}: ${rows.length} dòng vi phạm -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
