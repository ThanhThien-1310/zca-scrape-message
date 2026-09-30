import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTENDANCE_LAYOUT, buildAttendanceRows } from "../src/lesson/attendanceRows.js";
import type { AttendanceDayRecord } from "../src/lesson/attendanceStreaks.js";

test("ATTENDANCE_LAYOUT matches the real template's HANG NGAY sheet", () => {
    assert.deepEqual(ATTENDANCE_LAYOUT, { templateFile: "VI PHAM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 5, lastColumn: "L" });
});

const record = (over: Partial<AttendanceDayRecord>): AttendanceDayRecord => ({
    tenNV: "Lưu Đình Phong", day: "2026-09-23", noiLamViec: "LC Quang Trung Nguyễn Huệ", morning: null, afternoon: null,
    ...over,
});

test("buildAttendanceRows: người trễ sáng ra đúng 1 dòng, CHIỀU để trống, CHỨC VỤ luôn TTS", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 25 } })], new Map([["Lưu Đình Phong|2026-09-23", 1]]), "2026-09-23");
    assert.deepEqual(rows, [{ A: "Thứ 4", B: "23/09/2026", C: "Lưu Đình Phong", D: "TTS", E: "LC Quang Trung Nguyễn Huệ", F: "8:25", G: "", H: 1 }]);
});

test("buildAttendanceRows: trễ CẢ sáng lẫn chiều cùng ngày -> vẫn 1 dòng, cả 2 cột cùng điền", () => {
    const rows = buildAttendanceRows(
        [record({ morning: { hour: 8, minute: 10 }, afternoon: { hour: 14, minute: 30 } })],
        new Map([["Lưu Đình Phong|2026-09-23", 1]]),
        "2026-09-23",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].F, "8:10");
    assert.equal(rows[0].G, "14:30");
});

test("buildAttendanceRows: ngày hoàn toàn đúng giờ không ra dòng nào", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 0 } })], new Map(), "2026-09-23");
    assert.deepEqual(rows, []);
});

test("buildAttendanceRows: chỉ lấy đúng NGÀY mục tiêu, bỏ qua ngày khác trong `records`", () => {
    const rows = buildAttendanceRows(
        [record({ day: "2026-09-22", morning: { hour: 8, minute: 10 } }), record({ day: "2026-09-23", morning: { hour: 8, minute: 10 } })],
        new Map([["Lưu Đình Phong|2026-09-23", 1]]),
        "2026-09-23",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].B, "23/09/2026");
});

test("buildAttendanceRows: đúng giờ sáng nhưng trễ chiều -> cột SÁNG để trống dù có tự báo giờ đến", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 5 } })], new Map([["Lưu Đình Phong|2026-09-23", 1]]), "2026-09-23");
    assert.equal(rows[0].F, "");
    assert.equal(rows[0].G, "14:05");
});
