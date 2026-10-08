import { test } from "node:test";
import assert from "node:assert/strict";
import { addTargets, resolveTargetName } from "../src/scrape/queueAdd.js";

const TARGETS = ["bot test", "LC_HoaSen1_TĐ", "LC_TríTuệViệt_BTAN", "LC_QuangTrungNguyễnHuệ_Q5"];

test("an exact name resolves to itself, ignoring surrounding and repeated spaces", () => {
    assert.equal(resolveTargetName("LC_HoaSen1_TĐ", TARGETS), "LC_HoaSen1_TĐ");
    assert.equal(resolveTargetName("  bot   test ", TARGETS), "bot test");
});

test("case and diacritics are forgiven when the match is unambiguous, and the configured spelling is returned", () => {
    assert.equal(resolveTargetName("lc_tritueviet_btan", TARGETS), "LC_TríTuệViệt_BTAN");
    assert.equal(resolveTargetName("BOT TEST", TARGETS), "bot test");
});

test("a name that is not in config.targets, or that matches two, does not resolve", () => {
    assert.equal(resolveTargetName("LC_KhongCo", TARGETS), null);
    assert.equal(resolveTargetName("x", ["Nhóm A", "Nhom A"]), null);
    assert.equal(resolveTargetName("nhom a", ["Nhóm A", "Nhom A"]), null); // both fold to the same text
    assert.equal(resolveTargetName("Nhom A", ["Nhóm A", "Nhom A"]), "Nhom A"); // but an exact match always wins
});

test("addTargets queues each resolved group once and reports what happened", () => {
    const queued = new Set<string>(["LC_HoaSen1_TĐ"]);
    const results = addTargets(["bot test", "LC_HoaSen1_TĐ", "lc_tritueviet_btan"], TARGETS, (t) => {
        if (queued.has(t)) return false;
        queued.add(t);
        return true;
    });
    assert.deepEqual(results, [
        { name: "bot test", status: "added" },
        { name: "LC_HoaSen1_TĐ", status: "already-queued" },
        { name: "LC_TríTuệViệt_BTAN", status: "added" },
    ]);
});

test("an unknown name is reported with suggestions and nothing is queued for it", () => {
    let calls = 0;
    const results = addTargets(["LC_QuangTrung"], TARGETS, () => (calls++, true));
    assert.equal(calls, 0);
    assert.equal(results[0].status, "unknown");
    assert.deepEqual((results[0] as { suggestions: string[] }).suggestions, ["LC_QuangTrungNguyễnHuệ_Q5"]);
    assert.deepEqual(addTargets(["zzz"], TARGETS, () => true), [{ name: "zzz", status: "unknown", suggestions: [] }]);
});

test("the same group given twice is queued once", () => {
    let calls = 0;
    const results = addTargets(["bot test", "BOT TEST"], TARGETS, () => (calls++, true));
    assert.equal(calls, 1);
    assert.deepEqual(results.map((r) => r.status), ["added", "already-queued"]);
});
