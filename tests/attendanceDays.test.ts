import { test } from "node:test";
import assert from "node:assert/strict";
import { groupAttendanceByDay, isDayViolated } from "../src/lesson/attendanceDays.js";
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
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: { hour: 8, minute: 6 }, afternoon: null }), true);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: null, afternoon: { hour: 14, minute: 6 } }), true);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: { hour: 8, minute: 5 }, afternoon: { hour: 14, minute: 5 } }), false);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: null, afternoon: null }), false);
});

test("groupAttendanceByDay: tin gửi quá 17h30 không được ghi nhận và không đè tin trễ đã ghi nhận trước đó trong buổi chiều", () => {
    const records = groupAttendanceByDay([
        e({ maTinNhan: "m1", thoiGian: vnTs(2026, 9, 28, 14, 30) }),
        e({ maTinNhan: "m2", thoiGian: vnTs(2026, 9, 28, 17, 45) }),
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].afternoon, { hour: 14, minute: 30 });
    assert.deepEqual(groupAttendanceByDay([e({ thoiGian: vnTs(2026, 9, 28, 18, 0) })]), []);
});
