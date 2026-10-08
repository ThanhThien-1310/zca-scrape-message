import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLeaveRow } from "../src/leave/validate.js";
import { leaveRow } from "./helpers/visionFixtures.js";

const ctx = { sendDay: "2026-10-07", maxPastDays: 7, maxFutureDays: 120 };

test("the three rows of the sample photo: the first and the third are clean, the second only warns about its THỨ", () => {
    const phap = validateLeaveRow(leaveRow(), ctx);
    assert.equal(phap.ok, true);
    assert.deepEqual(phap.warnings, []);
    assert.equal(phap.parsed!.hoTen, "Nguyễn Quốc Pháp");
    assert.equal(phap.parsed!.soNgay, 1);

    // Ảnh mẫu ghi THỨ bắt đầu = 2 cho 03/10/2026 (thực tế là thứ bảy = 7); THỨ kết thúc và SỐ NGÀY đều đúng.
    const loc = validateLeaveRow(leaveRow({ hoTen: "Trần Nguyên Lộc", tuThu: 2, denThu: 2, denNgay: "2026-10-05", soNgay: 2 }), ctx);
    assert.equal(loc.ok, true, "one failed cross-check is only a warning");
    assert.equal(loc.warnings.length, 1);
    assert.match(loc.warnings[0], /THỨ bắt đầu ghi 2/);

    const huy = validateLeaveRow(leaveRow({ hoTen: "Hồ Đình Huy", tuThu: 2, tuNgay: "2026-10-05", denThu: 3, denNgay: "2026-10-06", soNgay: 2 }), ctx);
    assert.equal(huy.ok, true);
    assert.deepEqual(huy.warnings, []);
});

test("two failed cross-checks make the row a hard failure, and the parsed leave is still available", () => {
    const v = validateLeaveRow(leaveRow({ tuNgay: "2026-10-03", denNgay: "2026-10-05", denThu: 5, soNgay: 3 }), ctx);
    assert.equal(v.ok, false);
    assert.match(v.hard.join(" "), /lệch 2 phép/);
    assert.ok(v.parsed, "a human who confirms the row still gets its dates");
});

test("a missing THỨ or SỐ NGÀY is not judged", () => {
    const v = validateLeaveRow(leaveRow({ tuThu: null, denThu: null, soNgay: null }), ctx);
    assert.equal(v.ok, true);
    assert.deepEqual(v.warnings, []);
    assert.equal(v.parsed!.soNgay, null);
});

test("basic fields: a name, readable dates and hours are required", () => {
    assert.match(validateLeaveRow(leaveRow({ hoTen: "  " }), ctx).hard.join(" "), /thiếu họ tên/);
    assert.match(validateLeaveRow(leaveRow({ tuNgay: "2026-02-30" }), ctx).hard.join(" "), /ngày bắt đầu không đọc được/);
    assert.match(validateLeaveRow(leaveRow({ denNgay: null }), ctx).hard.join(" "), /ngày kết thúc không đọc được/);
    assert.match(validateLeaveRow(leaveRow({ tuGio: "abc" }), ctx).hard.join(" "), /giờ bắt đầu không đọc được/);
    assert.match(validateLeaveRow(leaveRow({ denGio: null }), ctx).hard.join(" "), /giờ kết thúc không đọc được/);
    assert.equal(validateLeaveRow(leaveRow({ tuNgay: "2026-02-30" }), ctx).parsed, null);
});

test("the end cannot be before the start, and the same day needs the end hour after the start hour", () => {
    assert.match(validateLeaveRow(leaveRow({ tuNgay: "2026-10-05", denNgay: "2026-10-03", tuThu: 2, denThu: 7, soNgay: 1 }), ctx).hard.join(" "), /trước ngày bắt đầu/);
    assert.match(validateLeaveRow(leaveRow({ tuGio: "13:00", denGio: "08:00" }), ctx).hard.join(" "), /giờ kết thúc không sau giờ bắt đầu/);
    assert.match(validateLeaveRow(leaveRow({ tuGio: "8:00", denGio: "8:00" }), ctx).hard.join(" "), /giờ kết thúc không sau giờ bắt đầu/);
});

test("the start date must be plausible against the send day", () => {
    const past = validateLeaveRow(leaveRow({ tuNgay: "2026-09-20", denNgay: "2026-09-20", tuThu: 1, denThu: 1, soNgay: 0 }), ctx);
    assert.match(past.hard.join(" "), /sớm hơn ngày gửi ảnh quá 7 ngày/);
    const future = validateLeaveRow(leaveRow({ tuNgay: "2027-03-01", denNgay: "2027-03-01", tuThu: 2, denThu: 2, soNgay: 1 }), ctx);
    assert.match(future.hard.join(" "), /muộn hơn ngày gửi ảnh quá 120 ngày/);
    const edge = validateLeaveRow(leaveRow({ tuNgay: "2026-09-30", denNgay: "2026-09-30", tuThu: 4, denThu: 4, soNgay: 1 }), ctx);
    assert.equal(edge.ok, true, "exactly 7 days before is still fine");
});

test("the name is cleaned of extra spaces in the parsed leave", () => {
    assert.equal(validateLeaveRow(leaveRow({ hoTen: "  Nguyễn   Quốc  Pháp " }), ctx).parsed!.hoTen, "Nguyễn Quốc Pháp");
});
