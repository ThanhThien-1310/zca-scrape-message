import { test } from "node:test";
import assert from "node:assert/strict";
import { collectLeaves } from "../src/leave/collect.js";
import type { LeaveRowSource } from "../src/leave/sources.js";
import type { ReviewStatus } from "../src/types/index.js";
import { leaveRow } from "./helpers/visionFixtures.js";

const TODAY = "2026-10-07";
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
const src = (bundleId: string, sentTs: number, rowIndex: number, status: ReviewStatus, over: Record<string, unknown> = {}): LeaveRowSource => ({
    bundleId, dir: "d", rowIndex, sentTs, sendDay: "2026-10-07", status, raw: leaveRow(over), reasons: [], warnings: [],
});
// 08/10/2026 là thứ năm (5), 09/10 thứ sáu (6), 20/10 thứ ba (3), 07/10 thứ tư (4), 05/10 thứ hai (2), 06/10 thứ ba (3).
const on = (iso: string, thu: number) => ({ tuNgay: iso, denNgay: iso, tuThu: thu, denThu: thu, soNgay: thu === 1 ? 0 : 1 });
const A = (iso: string, thu: number, name = "Nguyễn Văn A") => ({ hoTen: name, ...on(iso, thu) });

test("a leave that ended yesterday is dropped; one ending today or in the future is kept", () => {
    const rows = [
        src("b1", 1000, 0, "tu_dong_dat", { hoTen: "Hôm qua", tuNgay: "2026-10-05", tuThu: 2, denNgay: "2026-10-06", denThu: 3, soNgay: 2 }),
        src("b1", 1000, 1, "tu_dong_dat", A("2026-10-07", 4, "Hôm nay")),
        src("b1", 1000, 2, "tu_dong_dat", A("2026-10-20", 3, "Tương lai")),
    ];
    const r = collectLeaves(rows, TODAY, cfg);
    assert.deepEqual(r.leaves.map((l) => l.hoTen), ["Hôm nay", "Tương lai"]);
});

test("the newest photo wins for a person who is in two photos, and the replacement is noted", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5)), src("new", 2000, 0, "tu_dong_dat", A("2026-10-09", 6))], TODAY, cfg);
    assert.equal(r.leaves.length, 1);
    assert.equal(r.leaves[0].bundleId, "new");
    assert.match(r.notes.join(" "), /thay kỳ nghỉ 08\/10\/2026 .* bằng 09\/10\/2026/);
});

test("the same leave repeated in a newer photo is not a replacement and makes no note", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5)), src("new", 2000, 0, "tu_dong_dat", A("2026-10-08", 5))], TODAY, cfg);
    assert.equal(r.leaves[0].bundleId, "new");
    assert.deepEqual(r.notes, []);
});

test("a newer row that is still waiting for review does not erase the good older leave, and says so", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5)), src("new", 2000, 0, "can_xem", A("2026-10-09", 6))], TODAY, cfg);
    assert.equal(r.leaves[0].bundleId, "old");
    assert.equal(r.pending.length, 1);
    assert.match(r.notes.join(" "), /có bản mới hơn đang chờ xem/);
});

test("only tu_dong_dat, da_xac_nhan and da_sua rows are used; can_xem rows are listed as pending with the name read", () => {
    const rows = [
        src("b1", 1000, 0, "da_sua", A("2026-10-08", 5, "Sửa")),
        src("b1", 1000, 1, "da_xac_nhan", A("2026-10-08", 5, "Xác nhận")),
        src("b1", 1000, 2, "can_xem", A("2026-10-08", 5, "Chờ xem")),
    ];
    const r = collectLeaves(rows, TODAY, cfg);
    assert.deepEqual(r.leaves.map((l) => l.hoTen), ["Sửa", "Xác nhận"]);
    assert.deepEqual(r.pending.map((p) => [p.hoTen, p.rowIndex]), [["Chờ xem", 2]]);
});

test("one person with two leaves in the same photo: the nearest ending is kept and the other is reported", () => {
    const r = collectLeaves([src("b1", 1000, 0, "tu_dong_dat", A("2026-10-20", 3)), src("b1", 1000, 1, "tu_dong_dat", A("2026-10-08", 5))], TODAY, cfg);
    assert.equal(r.leaves.length, 1);
    assert.equal(r.leaves[0].rowIndex, 1);
    assert.match(r.notes.join(" "), /nhiều kỳ nghỉ/);
    assert.match(r.notes.join(" "), /bỏ 20\/10\/2026/);
});

test("names are grouped ignoring accents, case and spacing", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5, "Nguyễn Văn A")), src("new", 2000, 0, "tu_dong_dat", A("2026-10-09", 6, "nguyen  van a"))], TODAY, cfg);
    assert.equal(r.leaves.length, 1);
    assert.equal(r.leaves[0].bundleId, "new");
});

test("a usable row whose dates cannot be read is skipped with a note, and the leaves are sorted by name", () => {
    const rows = [src("b1", 1000, 0, "tu_dong_dat", { hoTen: "Hỏng", tuNgay: "2026-02-30" }), src("b1", 1000, 1, "tu_dong_dat", A("2026-10-08", 5, "Zed")), src("b1", 1000, 2, "tu_dong_dat", A("2026-10-08", 5, "An"))];
    const r = collectLeaves(rows, TODAY, cfg);
    assert.deepEqual(r.leaves.map((l) => l.hoTen), ["An", "Zed"]);
    assert.match(r.notes.join(" "), /bỏ dòng 0 của bộ b1/);
});

test("an invalid today is a clear error", () => {
    assert.throws(() => collectLeaves([], "07/10/2026", cfg), /ngày hôm nay/);
});
