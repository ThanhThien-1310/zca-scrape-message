import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAttendanceCounts, groupAttendanceByDay, isDayViolated } from "../src/lesson/attendanceStreaks.js";
import type { AttendanceEntry } from "../src/types/index.js";

/** Mốc UTC-ms cho một giờ:phút GIỜ VIỆT NAM cụ thể — tránh phải tự quy đổi +7h bằng tay ở mỗi test. */
const vnTs = (y: number, m: number, d: number, h: number, mi = 0): number => Date.UTC(y, m - 1, d, h - 7, mi);

const e = (over: Partial<AttendanceEntry>): AttendanceEntry => ({
    maNhom: "g1", maTinNhan: "m", thoiGian: vnTs(2026, 9, 28, 8, 0), tenNV: "A", noiLamViec: "X",
    ...over,
});

test("groupAttendanceByDay: gộp theo (người, ngày), tách sáng/chiều theo giờ GỬI TIN (không theo giờ tự khai)", () => {
    const records = groupAttendanceByDay([
        e({ maTinNhan: "m1", thoiGian: vnTs(2026, 9, 28, 8, 25) }),
        e({ maTinNhan: "m2", thoiGian: vnTs(2026, 9, 28, 14, 10) }),
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].morning, { hour: 8, minute: 25 });
    assert.deepEqual(records[0].afternoon, { hour: 14, minute: 10 });
});

test("groupAttendanceByDay: cùng 1 khung trong ngày báo lại (resend) chỉ giữ tin gửi MUỘN NHẤT", () => {
    const records = groupAttendanceByDay([
        e({ maTinNhan: "m1", thoiGian: vnTs(2026, 9, 28, 8, 0) }),
        e({ maTinNhan: "m2", thoiGian: vnTs(2026, 9, 28, 8, 5) }),
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
    // Giống ví dụ thật trong hướng dẫn: Giang tự khai "14h00" nhưng GỬI tin lúc 14:10 ngày 12/08 (lần 1), rồi
    // gửi lúc 14:30 ngày 14/09 (lần 2) dù giữa 2 ngày đó có rất nhiều ngày KHÔNG có tin điểm danh nào.
    const records = groupAttendanceByDay([
        e({ tenNV: "Giang", maTinNhan: "m1", thoiGian: vnTs(2026, 8, 12, 14, 10) }),
        e({ tenNV: "Giang", maTinNhan: "m2", thoiGian: vnTs(2026, 9, 14, 14, 30) }),
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("Giang|2026-08-12"), 1);
    assert.equal(counts.get("Giang|2026-09-14"), 2);
});

test("computeAttendanceCounts: một ngày ĐÚNG GIỜ reset về 0, ngày sau vi phạm lại tính lại từ 1", () => {
    const records = groupAttendanceByDay([
        e({ tenNV: "A", maTinNhan: "m1", thoiGian: vnTs(2026, 9, 1, 8, 30) }), // trễ -> 1
        e({ tenNV: "A", maTinNhan: "m2", thoiGian: vnTs(2026, 9, 2, 8, 0) }), // đúng giờ -> 0
        e({ tenNV: "A", maTinNhan: "m3", thoiGian: vnTs(2026, 9, 3, 8, 10) }), // trễ -> 1 (không phải 3)
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("A|2026-09-02"), 0);
    assert.equal(counts.get("A|2026-09-03"), 1);
});

test("computeAttendanceCounts: 2 người khác nhau có bộ đếm độc lập", () => {
    const records = groupAttendanceByDay([
        e({ tenNV: "A", maTinNhan: "m1", thoiGian: vnTs(2026, 9, 1, 8, 30) }),
        e({ tenNV: "B", maTinNhan: "m2", thoiGian: vnTs(2026, 9, 1, 8, 0) }),
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("B|2026-09-01"), 0);
});

test("computeAttendanceCounts: tin đến KHÔNG đúng thứ tự mảng (gap-recovery) vẫn tính đúng theo thời gian thật", () => {
    const late = e({ tenNV: "A", maTinNhan: "m2", thoiGian: vnTs(2026, 9, 2, 8, 30) });
    const early = e({ tenNV: "A", maTinNhan: "m1", thoiGian: vnTs(2026, 9, 1, 8, 30) });
    // Mảng đầu vào cố tình để "late" (ngày 2) TRƯỚC "early" (ngày 1) trong mảng thô.
    const records = groupAttendanceByDay([late, early]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("A|2026-09-02"), 2);
});
