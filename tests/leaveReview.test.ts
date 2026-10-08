import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleStatus, leaveRowsOf, reviewLeave } from "../src/leave/review.js";
import { loadRules } from "../src/vision/rules.js";
import type { BundleReading, RowReview } from "../src/types/index.js";
import { leaveReadingOf, leaveRow, manifestOf, readingOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
type Second = Parameters<typeof reviewLeave>[0]["second"];
const run = (first: BundleReading, second: Second = null) => reviewLeave({ rules, manifest: manifestOf(first.images.length), first, second, cfg });
const loc = () => leaveRow({ hoTen: "Trần Nguyên Lộc", tuThu: 2, denThu: 2, denNgay: "2026-10-05", soNgay: 2 });

test("leaveRowsOf keeps every position of the list; a non-object element becomes an empty row", () => {
    const rows = leaveRowsOf(leaveReadingOf([leaveRow(), "rác", leaveRow({ hoTen: "B" })]));
    assert.deepEqual(rows.map((r) => r.hoTen), ["Nguyễn Quốc Pháp", undefined, "B"]);
    assert.deepEqual(rows[1], {});
    assert.deepEqual(leaveRowsOf(leaveReadingOf([null, 3, []])), [{}, {}, {}]);
    assert.deepEqual(leaveRowsOf(readingOf(["khac"])), []);
});

test("a second-read difference after a junk element is attributed to the row at the same position", () => {
    const shape = (soNgay: number) => leaveReadingOf([leaveRow(), "rác", leaveRow({ hoTen: "B", soNgay })]);
    const r = run(shape(1), { ok: true, reading: shape(2) });
    assert.equal(r.status, "can_xem");
    assert.deepEqual(r.rows.map((x) => x.index), [0, 1, 2]);
    assert.equal(r.rows[0].status, "tu_dong_dat");
    assert.equal(r.rows[1].status, "can_xem");
    assert.match(r.rows[1].reasons.join(" "), /thiếu họ tên/);
    assert.equal(r.rows[2].status, "can_xem");
    assert.match(r.rows[2].reasons.join(" "), /leave\.dong\[2\]\.soNgay/);
});

test("a clean bundle is tu_dong_dat; a row with one failed cross-check keeps its warning but is still tu_dong_dat", () => {
    const r = run(leaveReadingOf([leaveRow(), loc()]));
    assert.equal(r.status, "tu_dong_dat");
    assert.deepEqual(r.reasons, []);
    assert.deepEqual(r.rows.map((x) => [x.index, x.status]), [[0, "tu_dong_dat"], [1, "tu_dong_dat"]]);
    assert.equal(r.rows[1].warnings.length, 1);
    assert.equal(r.secondRead.ran, false);
});

test("one unreadable row is can_xem and the others stay tu_dong_dat", () => {
    const r = run(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B", tuNgay: "2026-02-30" })]));
    assert.equal(r.status, "can_xem");
    assert.equal(r.rows[0].status, "tu_dong_dat");
    assert.equal(r.rows[1].status, "can_xem");
    assert.match(r.rows[1].reasons.join(" "), /ngày bắt đầu không đọc được/);
});

test("low confidence on the photo or the list sends every row to review", () => {
    const r = run(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })], "thap"));
    assert.equal(r.status, "can_xem");
    assert.ok(r.rows.every((x) => x.status === "can_xem"));
    assert.match(r.reasons.join(" "), /độ tin cậy/);
});

test("the wrong number of leave photos is a bundle-level reason", () => {
    const r = run(leaveReadingOf([leaveRow()], "cao", 6));
    assert.match(r.reasons.join(" "), /6 ảnh nghỉ phép, cần từ 1 đến 5/);
    assert.equal(r.rows[0].status, "can_xem");
});

test("a bundle with no leave photo has nothing to review; a leave photo with no readable row is can_xem", () => {
    const none = run(readingOf(["khac", "khac"]));
    assert.deepEqual([none.status, none.rows.length, none.reasons.length], ["tu_dong_dat", 0, 0]);
    const empty = run(leaveReadingOf([]));
    assert.equal(empty.status, "can_xem");
    assert.match(empty.reasons.join(" "), /không đọc được dòng nghỉ phép nào/);
});

test("a second read that agrees keeps tu_dong_dat; one that differs sends only that row to review", () => {
    const rows = [leaveRow(), leaveRow({ hoTen: "B" })];
    const same = run(leaveReadingOf(rows), { ok: true, reading: leaveReadingOf(rows) });
    assert.equal(same.status, "tu_dong_dat");
    assert.equal(same.secondRead.ran, true);
    const differs = run(leaveReadingOf(rows), { ok: true, reading: leaveReadingOf([rows[0], leaveRow({ hoTen: "B", soNgay: 2 })]) });
    assert.equal(differs.status, "can_xem");
    assert.equal(differs.rows[0].status, "tu_dong_dat");
    assert.equal(differs.rows[1].status, "can_xem");
    assert.match(differs.rows[1].reasons.join(" "), /leave\.dong\[1\]\.soNgay/);
    assert.equal(differs.secondRead.disagree.length, 1);
});

test("a second read with a different number of rows, a different image class, or an error sends everything to review", () => {
    const first = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })]);
    const fewer = run(first, { ok: true, reading: leaveReadingOf([leaveRow()]) });
    assert.ok(fewer.rows.every((x) => x.status === "can_xem"));
    assert.match(fewer.reasons.join(" "), /số dòng/);
    const other = run(first, { ok: true, reading: readingOf(["khac"], {}) });
    assert.ok(other.rows.every((x) => x.status === "can_xem"));
    assert.match(other.reasons.join(" "), /phân loại/);
    const failed = run(first, { ok: false, error: "hết hạn mức" });
    assert.ok(failed.rows.every((x) => x.status === "can_xem"));
    assert.match(failed.reasons.join(" "), /đọc lần hai lỗi: hết hạn mức/);
});

test("the report date on the photo far from the send day is only a note", () => {
    const first = leaveReadingOf([leaveRow()]);
    first.extracted.leave.ngayBaoCao = { value: "2026-09-01", doTinCay: "cao" };
    const r = run(first);
    assert.equal(r.status, "tu_dong_dat");
    assert.match(r.notes.join(" "), /ngày báo cáo trên ảnh/);
});

test("bundleStatus is the worst row, dismissed wins, and an empty bundle follows its reasons", () => {
    const row = (status: RowReview["status"]): RowReview => ({ index: 0, status, reasons: [], warnings: [], human: null });
    assert.equal(bundleStatus([row("tu_dong_dat"), row("can_xem")], []), "can_xem");
    assert.equal(bundleStatus([row("tu_dong_dat"), row("da_sua")], []), "da_sua");
    assert.equal(bundleStatus([row("da_xac_nhan"), row("tu_dong_dat")], []), "da_xac_nhan");
    assert.equal(bundleStatus([row("da_bo"), row("da_bo")], []), "da_bo");
    assert.equal(bundleStatus([row("tu_dong_dat")], []), "tu_dong_dat");
    assert.equal(bundleStatus([], ["x"]), "can_xem");
    assert.equal(bundleStatus([], []), "tu_dong_dat");
    assert.equal(bundleStatus([row("can_xem")], [], true), "da_bo");
});
