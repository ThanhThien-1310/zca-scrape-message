import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { classifyAttendanceTitle, parseAttendanceMessage } from "../lesson/attendanceReport.js";
import { ATTENDANCE_LAYOUT, buildAttendanceRows } from "../lesson/attendanceRows.js";
import { computeAttendanceCounts, groupAttendanceByDay } from "../lesson/attendanceStreaks.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { excelDateSerialForDay, freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { AttendanceEntry, SourceMessage } from "../types/index.js";

/**
 * Điền sheet HANG NGAY của VI PHAM NOI QUY THUC TAP.xlsx từ tin "BÁO CÁO ĐIỂM DANH" — KHÔNG lùi ngày (khác
 * vệ sinh): mỗi lần chạy tính lại toàn bộ danh sách người vi phạm của HÔM NAY, SỐ LẦN (cột H) tính lại từ
 * toàn bộ lịch sử điểm danh. Độc lập với Phase/SessionKey — xem
 * docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md.
 *
 *   npm run fill:attendance-report -- [--now <unix ms>]
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
    const counts = computeAttendanceCounts(records);
    const rows = buildAttendanceRows(records, counts, day);

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMM = day.slice(2, 4) + day.slice(5, 7);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = path.join(config.dataDir, "export", "trang-thai", yyMM, yyMMdd);
    fs.mkdirSync(outDir, { recursive: true });

    const title = readTemplateTitle(path.join(templatesSrc, ATTENDANCE_LAYOUT.templateFile), ATTENDANCE_LAYOUT.sheet);
    const hhmm = new Date(now + 7 * 3_600_000).toISOString().slice(11, 16).replace(":", "");
    const outName = freeFormFileName(title, day, hhmm);

    // Xoá các file cùng ngày (mọi HHmm cũ) trước khi ghi file mới — cùng lý do đã sửa ở fill-cleaning-report.ts:
    // chạy lại nhiều lần trong ngày không được để hàng chục file gần trùng nhau tồn đọng.
    const outPrefix = `${title}_${yyMMdd}_T`;
    for (const f of fs.readdirSync(outDir)) {
        if (f.startsWith(outPrefix) && f.endsWith(".xlsx")) fs.rmSync(path.join(outDir, f));
    }

    runFillTemplate({
        name: "attendance",
        templatesSrc,
        layout: ATTENDANCE_LAYOUT,
        outDir,
        outName,
        rows,
        headerCells: [{ ref: "L2", value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" }],
    });

    console.log(`[fill-attendance-report] ngày ${day}: ${rows.length} dòng vi phạm -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
