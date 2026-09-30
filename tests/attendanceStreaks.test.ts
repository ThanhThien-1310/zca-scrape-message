import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAttendanceCounts, groupAttendanceByDay, isDayViolated } from "../src/lesson/attendanceStreaks.js";
import type { AttendanceEntry } from "../src/types/index.js";

const e = (over: Partial<AttendanceEntry>): AttendanceEntry => ({
    maNhom: "g1", maTinNhan: "m", thoiGian: Date.UTC(2026, 8, 28, 1, 0), tenNV: "A", noiLamViec: "X", gioDenGio: 8, gioDenPhut: 0,
    ...over,
});

test("groupAttendanceByDay: gộp theo (người, ngày), tách sáng/chiều theo giờ tự báo", () => {
    const day0 = Date.UTC(2026, 8, 28, 1, 0); // 08:00 giờ VN, 2026-09-28
    const records = groupAttendanceByDay([
        e({ maTinNhan: "m1", gioDenGio: 8, gioDenPhut: 25 }),
        e({ maTinNhan: "m2", thoiGian: day0 + 6 * 3600_000, gioDenGio: 14, gioDenPhut: 10 }),
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].morning, { hour: 8, minute: 25 });
    assert.deepEqual(records[0].afternoon, { hour: 14, minute: 10 });
});

test("groupAttendanceByDay: cùng 1 khung trong ngày báo lại (resend) chỉ giữ tin MỚI NHẤT theo thời gian gửi", () => {
    const day0 = Date.UTC(2026, 8, 28, 1, 0);
    const records = groupAttendanceByDay([
        e({ maTinNhan: "m1", thoiGian: day0, gioDenGio: 8, gioDenPhut: 25 }),
        e({ maTinNhan: "m2", thoiGian: day0 + 60_000, gioDenGio: 8, gioDenPhut: 5 }),
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].morning, { hour: 8, minute: 5 });
});

test("isDayViolated: trễ sáng HOẶC chiều đều tính vi phạm ngày đó", () => {
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: { hour: 8, minute: 1 }, afternoon: null }), true);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: null, afternoon: { hour: 14, minute: 1 } }), true);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 0 } }), false);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: null, afternoon: null }), false);
});

test("computeAttendanceCounts: vi phạm liên tiếp (bỏ qua các ngày không có tin) vẫn cộng dồn, không reset", () => {
    // Giống ví dụ thật trong hướng dẫn: Giang trễ ngày 12/08 (lần 1), rồi trễ tiếp ngày 14/09 (lần 2) dù giữa
    // 2 ngày đó có rất nhiều ngày KHÔNG có tin điểm danh nào (không phải reset về 0).
    const records = groupAttendanceByDay([
        e({ tenNV: "Giang", maTinNhan: "m1", thoiGian: Date.UTC(2026, 7, 12, 7, 10), gioDenGio: 14, gioDenPhut: 10 }),
        e({ tenNV: "Giang", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 14, 7, 30), gioDenGio: 14, gioDenPhut: 30 }),
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("Giang|2026-08-12"), 1);
    assert.equal(counts.get("Giang|2026-09-14"), 2);
});

test("computeAttendanceCounts: một ngày ĐÚNG GIỜ reset về 0, ngày sau vi phạm lại tính lại từ 1", () => {
    const records = groupAttendanceByDay([
        e({ tenNV: "A", maTinNhan: "m1", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 30 }), // trễ -> 1
        e({ tenNV: "A", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 2, 1, 0), gioDenGio: 8, gioDenPhut: 0 }), // đúng giờ -> 0
        e({ tenNV: "A", maTinNhan: "m3", thoiGian: Date.UTC(2026, 8, 3, 1, 0), gioDenGio: 8, gioDenPhut: 10 }), // trễ -> 1 (không phải 3)
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("A|2026-09-02"), 0);
    assert.equal(counts.get("A|2026-09-03"), 1);
});

test("computeAttendanceCounts: 2 người khác nhau có bộ đếm độc lập", () => {
    const records = groupAttendanceByDay([
        e({ tenNV: "A", maTinNhan: "m1", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 30 }),
        e({ tenNV: "B", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 0 }),
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("B|2026-09-01"), 0);
});

test("computeAttendanceCounts: tin đến KHÔNG đúng thứ tự mảng (gap-recovery) vẫn tính đúng theo thời gian thật", () => {
    const late = e({ tenNV: "A", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 2, 1, 0), gioDenGio: 8, gioDenPhut: 30 });
    const early = e({ tenNV: "A", maTinNhan: "m1", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 30 });
    // Mảng đầu vào cố tình để "late" (ngày 2) TRƯỚC "early" (ngày 1) trong mảng thô.
    const records = groupAttendanceByDay([late, early]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("A|2026-09-02"), 2);
});
