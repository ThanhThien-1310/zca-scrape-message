import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { countUnreadBundles, loadLeaveRows } from "../src/leave/sources.js";
import { applyHumanRow, dismissBundle } from "../src/leave/reviewApply.js";
import { reviewLeave } from "../src/leave/review.js";
import { loadRules } from "../src/vision/rules.js";
import type { BundleReading, Review } from "../src/types/index.js";
import { leaveReadingOf, leaveRow, manifestOf, T0 } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), "leave-src-"));

function writeBundle(r: string, id: string, day: string, reading: BundleReading | null, review: Review | null, extra: Parameters<typeof manifestOf>[1] = {}): void {
    const dir = path.join(r, day, "g1", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestOf(1, { bundleId: id, day, ...extra })), "utf8");
    if (reading) fs.writeFileSync(path.join(dir, "reading.json"), JSON.stringify(reading), "utf8");
    if (review) fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(review), "utf8");
}
const reviewOf = (reading: BundleReading): Review => reviewLeave({ rules, manifest: manifestOf(1), first: reading, second: null, cfg });

test("every row of a read bundle becomes a source with its status, raw cells and the bundle's send time", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B", tuNgay: "2026-02-30" })]);
    writeBundle(r, "b1", "2026-10-07", reading, reviewOf(reading));
    const rows = loadLeaveRows(r, "2026-08-01");
    assert.deepEqual(rows.map((x) => [x.bundleId, x.rowIndex, x.status, x.raw.hoTen]), [["b1", 0, "tu_dong_dat", "Nguyễn Quốc Pháp"], ["b1", 1, "can_xem", "B"]]);
    assert.equal(rows[0].sentTs, T0);
    assert.equal(rows[0].sendDay, "2026-10-07");
});

test("human corrections are laid over the read cells; dropped rows and dismissed bundles never appear", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B", tuNgay: "2026-02-30" })]);
    const fixed = applyHumanRow(reviewOf(reading), 1, "sua", { tuNgay: "2026-10-04", tuThu: 1 }, 5);
    writeBundle(r, "b1", "2026-10-07", reading, applyHumanRow(fixed, 0, "bo", {}, 6));
    const rows = loadLeaveRows(r, "2026-08-01");
    assert.deepEqual(rows.map((x) => [x.rowIndex, x.status, x.raw.tuNgay]), [[1, "da_sua", "2026-10-04"]]);
    writeBundle(r, "b2", "2026-10-07", reading, dismissBundle(reviewOf(reading)), { firstTs: T0 + 1000 });
    assert.equal(loadLeaveRows(r, "2026-08-01").every((x) => x.bundleId !== "b2"), true);
});

test("bundles that are old, unread or without a review are skipped", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow()]);
    writeBundle(r, "old", "2026-06-01", reading, reviewOf(reading));
    writeBundle(r, "unread", "2026-10-07", null, null);
    writeBundle(r, "noreview", "2026-10-07", reading, null);
    assert.deepEqual(loadLeaveRows(r, "2026-08-01"), []);
    assert.equal(loadLeaveRows(r, "2026-05-01").length, 1, "the old one comes back once the window reaches it");
});

test("countUnreadBundles counts the bundles of the named groups that have no reading yet, or are flagged for re-reading", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow()]);
    writeBundle(r, "read", "2026-10-07", reading, reviewOf(reading));
    writeBundle(r, "unread", "2026-10-07", null, null);
    writeBundle(r, "other-group", "2026-10-07", null, null, { groupName: "LC_Khac_BD" });
    writeBundle(r, "reread", "2026-10-07", reading, reviewOf(reading), { reread: true });
    writeBundle(r, "old-unread", "2026-06-01", null, null);
    assert.equal(countUnreadBundles(r, "2026-08-01", ["bot test"]), 2);
    assert.equal(countUnreadBundles(r, "2026-08-01", []), 0);
});
