import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { failedKey, readFailed, retryPlans, settle, writeFailed } from "../src/runner/failedFills.js";
import type { SessionKey } from "../src/types/index.js";

const S1: SessionKey = { day: "2026-10-06", buoi: "morningstart" };
const S2: SessionKey = { day: "2026-10-06", buoi: "afternoonend" };
const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "failed-")), ".runner-failed.json");

test("failedKey is <set>|<day>|<phase>|<report>", () => {
    assert.equal(failedKey("A", S1, "loa"), "A|2026-10-06|morningstart|loa");
});

test("settle removes what was attempted and adds only what failed now", () => {
    const failed = new Set([failedKey("A", S1, "loa"), failedKey("A", S1, "internet"), failedKey("B", S1, "loa")]);
    settle(failed, "A", S1, ["loa", "internet"], ["internet"]);
    assert.deepEqual([...failed].sort(), [failedKey("A", S1, "internet"), failedKey("B", S1, "loa")].sort());
});

test("settle leaves other sessions and other reports of the same session alone", () => {
    const failed = new Set([failedKey("A", S1, "loa"), failedKey("A", S2, "loa"), failedKey("A", S1, "mayTinh")]);
    settle(failed, "A", S1, ["loa"], []);
    assert.deepEqual([...failed].sort(), [failedKey("A", S2, "loa"), failedKey("A", S1, "mayTinh")].sort());
});

test("retryPlans groups the failed reports of ONE set by session, in registry order", () => {
    const failed = new Set([failedKey("A", S2, "mayTinh"), failedKey("A", S1, "loa"), failedKey("A", S1, "netsupport"), failedKey("B", S1, "loa")]);
    assert.deepEqual(retryPlans(failed, "A"), [
        { session: S2, keys: ["mayTinh"] },
        { session: S1, keys: ["netsupport", "loa"] },
    ]);
    assert.deepEqual(retryPlans(failed, "C"), []);
});

test("retryPlans ignores entries it cannot read", () => {
    const failed = new Set(["A|2026-10-06|bogus|loa", "A|2026-10-06|morningstart|nope", "garbage", failedKey("A", S1, "loa")]);
    assert.deepEqual(retryPlans(failed, "A"), [{ session: S1, keys: ["loa"] }]);
});

test("the failed list round-trips; a missing, corrupt or wrongly shaped file reads as empty", () => {
    const file = fresh();
    assert.deepEqual([...readFailed(file)], []);
    writeFailed(new Set([failedKey("A", S1, "loa")]), file);
    assert.deepEqual([...readFailed(file)], [failedKey("A", S1, "loa")]);
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.deepEqual([...readFailed(file)], []);
    fs.writeFileSync(file, JSON.stringify({ a: 1 }), "utf8");
    assert.deepEqual([...readFailed(file)], []);
});

test("dropStaleFailed forgets the failures of days before today (a failure that never heals must not be retried forever) and says how many", async () => {
    const { dropStaleFailed } = await import("../src/runner/failedFills.js");
    const old: SessionKey = { day: "2026-10-05", buoi: "afternoonend" };
    const failed = new Set([failedKey("A", old, "loa"), failedKey("A", S1, "loa"), failedKey("B", old, "mayTinh"), "garbage"]);
    assert.equal(dropStaleFailed(failed, "2026-10-06"), 3); // two old days + the entry that cannot be read
    assert.deepEqual([...failed], [failedKey("A", S1, "loa")]);
    assert.equal(dropStaleFailed(failed, "2026-10-06"), 0);
});
