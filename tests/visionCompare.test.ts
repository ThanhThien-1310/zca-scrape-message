import { test } from "node:test";
import assert from "node:assert/strict";
import { compareReadings, flattenReading, needsSecondRead } from "../src/vision/review.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveReadingOf, leaveRow, readingOf } from "./helpers/visionFixtures.js";

const rules = loadRules();

test("flattenReading flattens images, scalars and list cells", () => {
    const f = flattenReading(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })]));
    assert.equal(f.get("anh[1].loai"), "leave");
    assert.equal(f.get("leave.ngayBaoCao"), "2026-10-02");
    assert.equal(f.get("leave.dong.length"), 2);
    assert.equal(f.get("leave.dong[1].hoTen"), "B");
    assert.equal(f.get("leave.dong[0].soNgay"), 1);
});

test("needsSecondRead follows docLanHai: low confidence only for leave, never for an all-khac bundle", () => {
    assert.equal(needsSecondRead(rules, leaveReadingOf([leaveRow()], "cao")), false);
    assert.equal(needsSecondRead(rules, leaveReadingOf([leaveRow()], "vua")), false);
    assert.equal(needsSecondRead(rules, leaveReadingOf([leaveRow()], "thap")), true);
    assert.equal(needsSecondRead(rules, readingOf(["khac", "khac"])), false);
    const always = rules.map((r) => ({ ...r, docLanHai: "luon" as const }));
    assert.equal(needsSecondRead(always, leaveReadingOf([leaveRow()], "cao")), true);
    const never = rules.map((r) => ({ ...r, docLanHai: "khong" as const }));
    assert.equal(needsSecondRead(never, leaveReadingOf([leaveRow()], "thap")), false);
});

test("compareReadings finds a differing cell and ignores case and spacing of text", () => {
    assert.deepEqual(compareReadings(leaveReadingOf([leaveRow()]), leaveReadingOf([leaveRow()])), []);
    const diff = compareReadings(leaveReadingOf([leaveRow()]), leaveReadingOf([leaveRow({ soNgay: 2 })]));
    assert.deepEqual(diff, [{ path: "leave.dong[0].soNgay", first: 1, second: 2 }]);
    assert.deepEqual(compareReadings(leaveReadingOf([leaveRow({ hoTen: "Nguyễn  Quốc Pháp " })]), leaveReadingOf([leaveRow({ hoTen: "nguyễn quốc pháp" })])), []);
});

test("compareReadings reports a class change and a list length change", () => {
    assert.deepEqual(compareReadings(readingOf(["leave"]), readingOf(["khac"])).map((d) => d.path), ["anh[1].loai"]);
    const grown = compareReadings(leaveReadingOf([leaveRow()]), leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })])).map((d) => d.path);
    assert.ok(grown.includes("leave.dong.length"));
    assert.ok(grown.includes("leave.dong[1].hoTen"));
});
