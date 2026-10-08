import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { leaveForDay, leaveSignature, type LeaveIO } from "../src/leave/buildDay.js";
import type { LeaveRowSource } from "../src/leave/sources.js";
import type { ReviewStatus } from "../src/types/index.js";
import { leaveRow } from "./helpers/visionFixtures.js";

const cfg = { lookbackDays: 60, maxPastDays: 7, maxFutureDays: 120 };
const ROSTER = [{ row: 4, name: "Huỳnh Hữu Đức" }, { row: 6, name: "Đinh Đình Chinh" }];
const row = (rowIndex: number, status: ReviewStatus, over: Record<string, unknown>): LeaveRowSource => ({
    bundleId: "b1", dir: "d", rowIndex, sentTs: 1000, sendDay: "2026-10-07", status, raw: leaveRow({ tuNgay: "2026-10-08", denNgay: "2026-10-08", tuThu: 5, denThu: 5, soNgay: 1, ...over }), reasons: [], warnings: [],
});
function io(rows: LeaveRowSource[], over: Partial<LeaveIO> = {}): LeaveIO & { since: string[] } {
    const since: string[] = [];
    return { since, readRoster: () => ROSTER, loadRows: (d) => (since.push(d), rows), countUnread: () => 0, ...over };
}

test("the window starts lookbackDays before the day", () => {
    const i = io([]);
    leaveForDay("2026-10-07", i, cfg);
    assert.deepEqual(i.since, ["2026-08-08"]);
});

test("an in-roster leave becomes cells and a signature; the same input gives the same signature", () => {
    const rows = [row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức" })];
    const a = leaveForDay("2026-10-07", io(rows), cfg);
    assert.deepEqual(a.filled.map((f) => [f.row, f.ngay, f.buoi]), [[4, "08/10/2026", "Cả ngày"]]);
    assert.deepEqual(a.warnings, []);
    assert.equal(a.signature, leaveSignature(a.headerCells));
    assert.equal(leaveForDay("2026-10-07", io(rows), cfg).signature, a.signature);
    const b = leaveForDay("2026-10-07", io([row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức", denGio: "11:30" })]), cfg);
    assert.notEqual(b.signature, a.signature, "a different BUỔI is different content");
});

test("no leave at all: no cells, and the signature is the stable signature of nothing", () => {
    const d = leaveForDay("2026-10-07", io([]), cfg);
    assert.deepEqual([d.headerCells, d.filled, d.warnings, d.notes], [[], [], [], []]);
    assert.equal(d.signature, leaveSignature([]));
});

test("warnings: unread bundles, a name that is not in the roster (with the fix command), and rows waiting for review", () => {
    const rows = [row(0, "tu_dong_dat", { hoTen: "Đinh Chinh" }), row(1, "can_xem", { hoTen: "Chờ Xem" })];
    const d = leaveForDay("2026-10-07", io(rows, { countUnread: () => 2 }), cfg);
    const text = d.warnings.join("\n");
    assert.match(text, /2 bộ ảnh nghỉ phép chưa đọc/);
    assert.match(text, /Đinh Chinh .*không có trong danh sách.*gần giống: Đinh Đình Chinh/);
    assert.match(text, /photos:review -- --bundle b1 --row 0 --fix hoTen=/);
    assert.match(text, /1 dòng nghỉ phép đang chờ xem/);
    assert.deepEqual(d.filled, []);
});

test("notes from the selection (a replaced leave) are passed through", () => {
    const rows = [
        { ...row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức" }), bundleId: "old", sentTs: 1000 },
        { ...row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức", tuNgay: "2026-10-09", denNgay: "2026-10-09", tuThu: 6, denThu: 6 }), bundleId: "new", sentTs: 2000 },
    ];
    const d = leaveForDay("2026-10-07", io(rows), cfg);
    assert.match(d.notes.join(" "), /thay kỳ nghỉ/);
    assert.equal(d.filled[0].ngay, "09/10/2026");
});
