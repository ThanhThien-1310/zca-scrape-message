import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMarks } from "../src/runner/mergeMarks.js";

const m = (maTinNhan: string, maTrangThai: number, maNhom = "g") => ({ maNhom, maTinNhan, maTrangThai });

test("one mark per message: 'cần xem' (2) beats 'đã xử lý' (1) beats 'bỏ qua' (-1)", () => {
    const merged = mergeMarks([m("1", -1), m("1", 1), m("1", 2), m("2", 1), m("2", -1), m("3", -1)]);
    assert.deepEqual(merged, [m("1", 2), m("2", 1), m("3", -1)]);
});

test("the same message id in two groups is two messages", () => {
    assert.equal(mergeMarks([m("1", 1, "g1"), m("1", 2, "g2")]).length, 2);
});

test("equal ranks keep the first mark; an unknown status never beats a known one", () => {
    assert.deepEqual(mergeMarks([m("1", 1), m("1", 1)]), [m("1", 1)]);
    assert.deepEqual(mergeMarks([m("1", 99), m("1", 1)]), [m("1", 1)]);
    assert.deepEqual(mergeMarks([m("1", 1), m("1", 99)]), [m("1", 1)]);
});

test("no marks gives no marks", () => {
    assert.deepEqual(mergeMarks([]), []);
});
