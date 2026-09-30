import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceSessionOf, classifyAttendanceTitle, isLateAttendance, parseAttendanceMessage } from "../src/lesson/attendanceReport.js";

test("classifyAttendanceTitle", () => {
    assert.equal(classifyAttendanceTitle("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A"), true);
    assert.equal(classifyAttendanceTitle("báo cáo điểm danh"), true);
    assert.equal(classifyAttendanceTitle("BÁO CÁO CUỐI BUỔI"), false);
    assert.equal(classifyAttendanceTitle(""), false);
});

const REAL_MORNING = `BÁO CÁO ĐIỂM DANH
- Tên NV IT thực tập: Lưu Đình Phong
- Thời gian đến nơi: 8h25
- Nơi làm việc: LC QUANG TRUNG NGUYỄN HUỆ Q5`;

test("parseAttendanceMessage parses a real message (\"8h25\" -> hour 8, minute 25)", () => {
    assert.deepEqual(parseAttendanceMessage(REAL_MORNING), { tenNV: "Lưu Đình Phong", noiLamViec: "LC QUANG TRUNG NGUYỄN HUỆ Q5", gioDen: { hour: 8, minute: 25 } });
});

test("parseAttendanceMessage: \"14h00\" -> hour 14, minute 0", () => {
    const msg = REAL_MORNING.replace("8h25", "14h00");
    assert.deepEqual(parseAttendanceMessage(msg)?.gioDen, { hour: 14, minute: 0 });
});

test("parseAttendanceMessage: thiếu 1 trong 3 trường -> null", () => {
    assert.equal(parseAttendanceMessage("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A\n- Nơi làm việc: X"), null);
});

test("parseAttendanceMessage: giờ/phút không hợp lệ -> null", () => {
    const msg = REAL_MORNING.replace("8h25", "25h99");
    assert.equal(parseAttendanceMessage(msg), null);
});

test("attendanceSessionOf: giờ < 12 là sáng, >= 12 là chiều", () => {
    assert.equal(attendanceSessionOf(8), "morning");
    assert.equal(attendanceSessionOf(11), "morning");
    assert.equal(attendanceSessionOf(12), "afternoon");
    assert.equal(attendanceSessionOf(17), "afternoon");
});

test("isLateAttendance: trễ = sau ĐÚNG 8h00 (sáng) hoặc 14h00 (chiều)", () => {
    assert.equal(isLateAttendance("morning", 8, 0), false);
    assert.equal(isLateAttendance("morning", 8, 1), true);
    assert.equal(isLateAttendance("morning", 7, 59), false);
    assert.equal(isLateAttendance("afternoon", 14, 0), false);
    assert.equal(isLateAttendance("afternoon", 14, 1), true);
    assert.equal(isLateAttendance("afternoon", 13, 59), false);
});
