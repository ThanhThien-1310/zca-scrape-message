import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../config.js";
import { ATTENDANCE_HEADER_REFS, ATTENDANCE_LAYOUT, attendanceHeaderCells, buildAttendanceRows } from "../src/lesson/attendanceRows.js";
import type { AttendanceDayRecord } from "../src/lesson/attendanceDays.js";
import { readTemplateTitle } from "../src/lesson/statusReportLayout.js";

test("ATTENDANCE_LAYOUT matches the new NỘI QUY template's HANG NGAY sheet (cột A-I, không còn SỐ LẦN)", () => {
    assert.deepEqual(ATTENDANCE_LAYOUT, { templateFile: "05 - FORM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 7, lastColumn: "I" });
    assert.deepEqual(ATTENDANCE_HEADER_REFS, { ngay: "H2", gio: "I2" });
});

// Mẫu có H2 = "Ngày: <TODAY()>" và I2 = "Thời gian: <NOW()>" (không còn một ô "Ngày báo cáo" ở I2): ghi NGÀY vào H2 và GIỜ CHẠY vào I2 bằng chữ,
// không ghi số ngày vào I2 (như vậy ô "Thời gian" hiện ra ngày tháng năm).
test("attendanceHeaderCells: H2 là 'Ngày: dd/mm/yyyy' của ngày báo cáo, I2 là 'Thời gian: hh:mm' giờ chạy (giờ Việt Nam), cả hai là chữ", () => {
    const at1022 = Date.UTC(2026, 9, 5, 3, 22); // 10:22 giờ Việt Nam
    assert.deepEqual(attendanceHeaderCells("2026-10-05", at1022), [{ ref: "H2", value: "Ngày: 05/10/2026" }, { ref: "I2", value: "Thời gian: 10:22" }]);
});

const record = (over: Partial<AttendanceDayRecord>): AttendanceDayRecord => ({
    tenNV: "Lưu Đình Phong", day: "2026-09-23", noiLamViec: "LC Quang Trung Nguyễn Huệ", morning: null, afternoon: null,
    ...over,
});

test("buildAttendanceRows: người trễ sáng ra đúng 1 dòng, CHIỀU để trống, CHỨC VỤ luôn TTS, không có cột SỐ LẦN", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 25 } })], "2026-09-23");
    assert.deepEqual(rows, [{ A: "Thứ 4", B: "'23/09/2026", C: "Lưu Đình Phong", D: "TTS", E: "LC Quang Trung Nguyễn Huệ", F: "8:25", G: "" }]);
});

test("buildAttendanceRows: trễ CẢ sáng lẫn chiều cùng ngày -> vẫn 1 dòng, cả 2 cột cùng điền", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 10 }, afternoon: { hour: 14, minute: 30 } })], "2026-09-23");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].F, "8:10");
    assert.equal(rows[0].G, "14:30");
});

test("buildAttendanceRows: ngày hoàn toàn đúng giờ không ra dòng nào", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 0 } })], "2026-09-23");
    assert.deepEqual(rows, []);
});

test("buildAttendanceRows: chỉ lấy đúng NGÀY mục tiêu, bỏ qua ngày khác trong `records`", () => {
    const rows = buildAttendanceRows([record({ day: "2026-09-22", morning: { hour: 8, minute: 10 } }), record({ day: "2026-09-23", morning: { hour: 8, minute: 10 } })], "2026-09-23");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].B, "'23/09/2026");
});

test("buildAttendanceRows: đúng giờ sáng nhưng trễ chiều -> cột SÁNG để trống dù có tự báo giờ đến", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 6 } })], "2026-09-23");
    assert.equal(rows[0].F, "");
    assert.equal(rows[0].G, "14:06");
});

test("buildAttendanceRows: nhiều người cùng ngày sắp theo tên", () => {
    const rows = buildAttendanceRows([record({ tenNV: "Trần B", morning: { hour: 8, minute: 30 } }), record({ tenNV: "An C", morning: { hour: 8, minute: 30 } })], "2026-09-23");
    assert.deepEqual(rows.map((r) => r.C), ["An C", "Trần B"]);
});

const templatesDir = path.join(config.dataDir, "mau bao cao new");

test("the real NỘI QUY template still has the TỔNG row, column headers and date cell assumed", { skip: fs.existsSync(templatesDir) ? false : "không có thư mục mẫu trên máy này" }, () => {
    const file = path.join(templatesDir, ATTENDANCE_LAYOUT.templateFile);
    const ws = XLSX.readFile(file).Sheets[ATTENDANCE_LAYOUT.sheet];
    assert.equal(ws[`A${ATTENDANCE_LAYOUT.totalRowBefore}`]?.v, "TỔNG");
    assert.deepEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((c) => ws[`${c}3`]?.v), ["THỨ", "NGÀY", "HỌ TÊN", "CHỨC VỤ", "VỊ TRÍ", "SÁNG", "CHIỀU", "NỘI DUNG", "GHI CHÚ"]);
    assert.ok(!ws["J3"], "cột J dòng 3 vẫn có tiêu đề — lastColumn thiếu cột");
    assert.match(String(ws[ATTENDANCE_HEADER_REFS.ngay]?.v), /^Ngày:/, "ô ngày (H2) không còn là 'Ngày: ...'");
    assert.match(String(ws[ATTENDANCE_HEADER_REFS.gio]?.v), /^Thời gian:/, "ô giờ (I2) không còn là 'Thời gian: ...'");
    assert.equal(readTemplateTitle(file, ATTENDANCE_LAYOUT.sheet), "NỘI QUY THỰC TẬP");
});
