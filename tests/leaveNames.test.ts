import { test } from "node:test";
import assert from "node:assert/strict";
import { levenshtein, normalizeName, suggestNames } from "../src/leave/names.js";

test("normalizeName drops accents, maps đ to d, lowercases and squeezes spaces and punctuation", () => {
    assert.equal(normalizeName("Đinh  Đình Chinh"), "dinh dinh chinh");
    assert.equal(normalizeName("  Huỳnh Hữu Đức "), "huynh huu duc");
    assert.equal(normalizeName("Nguyễn-Văn.A"), "nguyen van a");
    assert.equal(normalizeName("PHẠM YẾN NHƯ"), "pham yen nhu");
    assert.equal(normalizeName(""), "");
    assert.equal(normalizeName("Phạm Yến Như"), normalizeName("pham yen nhu"));
});

test("levenshtein counts single-character edits", () => {
    assert.equal(levenshtein("abc", "abc"), 0);
    assert.equal(levenshtein("abc", "abd"), 1);
    assert.equal(levenshtein("abc", "ab"), 1);
    assert.equal(levenshtein("", "abc"), 3);
});

const ROSTER = ["Huỳnh Hữu Đức", "Đinh Đình Chinh", "Phạm Yến Như", "Phạm Ngọc Minh"];

test("suggestNames offers same words in another order, a missing middle name, and one-letter slips; never the exact match", () => {
    assert.deepEqual(suggestNames("Chinh Đình Đinh", ROSTER), ["Đinh Đình Chinh"]);
    assert.deepEqual(suggestNames("Đinh Chinh", ROSTER), ["Đinh Đình Chinh"]);
    assert.deepEqual(suggestNames("Pham Yen Nho", ROSTER), ["Phạm Yến Như"]);
    assert.deepEqual(suggestNames("Phạm Yến Như", ROSTER), [], "an exact match is a match, not a suggestion");
    assert.deepEqual(suggestNames("Nguyễn Văn Zzz", ROSTER), []);
    assert.deepEqual(suggestNames("", ROSTER), []);
});

test("suggestNames returns at most max suggestions, best first, each name once", () => {
    const roster = ["An Binh", "An Binh", "An Bình X", "Ann Binh", "Anh Binh"];
    const got = suggestNames("An Binhh", roster, 2);
    assert.equal(got.length, 2);
    assert.equal(new Set(got).size, 2);
});
