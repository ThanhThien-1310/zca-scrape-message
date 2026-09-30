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

// Quyết định (đã xác nhận với người dùng, thay cho lần đầu dùng tự khai): giờ để tính trễ/khung sáng-chiều
// và giờ hiển thị ở cột SÁNG/CHIỀU đều lấy đúng giờ Zalo GHI NHẬN tin gửi tới (msg.ts), không lấy giá trị tự
// khai "Thời gian đến nơi" trong nội dung tin — trường thật (vd Đỗ Tiến Giang tự khai "14h00" nhưng gửi lúc
// 14:30) cho thấy tự khai có thể không đúng giờ gửi thật, và hướng dẫn thật lấy giờ gửi làm giờ tính.
// "Thời gian đến nơi" vẫn phải CÓ MẶT (không rỗng) để coi là một tin điểm danh hợp lệ, nhưng giá trị của nó
// không còn được đọc/parse thành giờ nữa.
test("parseAttendanceMessage parses a real message — chỉ lấy Tên NV/Nơi làm việc, không đọc giờ tự khai", () => {
    assert.deepEqual(parseAttendanceMessage(REAL_MORNING), { tenNV: "Lưu Đình Phong", noiLamViec: "LC QUANG TRUNG NGUYỄN HUỆ Q5" });
});

test("parseAttendanceMessage: giá trị 'Thời gian đến nơi' viết kiểu gì cũng được, miễn không rỗng", () => {
    for (const value of ["8h25", "8:25", "đã đến", "abc"]) {
        assert.deepEqual(parseAttendanceMessage(REAL_MORNING.replace("8h25", value)), { tenNV: "Lưu Đình Phong", noiLamViec: "LC QUANG TRUNG NGUYỄN HUỆ Q5" });
    }
});

test("parseAttendanceMessage: thiếu Tên NV hoặc Nơi làm việc -> null", () => {
    assert.equal(parseAttendanceMessage("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A\n- Nơi làm việc: X"), null);
    assert.equal(parseAttendanceMessage("BÁO CÁO ĐIỂM DANH\n- Thời gian đến nơi: 8h25\n- Nơi làm việc: X"), null);
});

test("parseAttendanceMessage: dòng 'Thời gian đến nơi' rỗng hoặc thiếu hẳn -> null", () => {
    assert.equal(parseAttendanceMessage("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A\n- Thời gian đến nơi: \n- Nơi làm việc: X"), null);
    assert.equal(parseAttendanceMessage("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A\n- Nơi làm việc: X"), null);
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
