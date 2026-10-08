import { test } from "node:test";
import assert from "node:assert/strict";
import { messageKey } from "../src/lesson/recovery.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";
import { failedKey } from "../src/runner/failedFills.js";
import { pendingBuilds, planSetBuilds } from "../src/runner/buildPlan.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg } from "./fixtures.js";

const [A, DAY_ONLY] = resolveReportSets([{ id: "A", reports: ["netsupport", "loa", "dien"] }, { id: "D", reports: ["dien", "cleaning"] }]).active;
const MORNING = { day: DAY, buoi: "morningstart" as const };
const AFTERNOON = { day: DAY, buoi: "afternoonstart" as const };
const a = msg(COMPLETE, at(8)); // morningstart
const b = msg(IT_MAINTENANCE, at(13)); // afternoonstart

test("an unbuilt session is planned with ALL the set's phase keys (not the day keys)", () => {
    assert.deepEqual(planSetBuilds(A, [a], new Set(), new Set()), [{ session: MORNING, keys: ["netsupport", "loa"] }]);
});

test("built sessions are not planned", () => {
    assert.deepEqual(planSetBuilds(A, [a, b], new Set([messageKey(a)]), new Set()), [{ session: AFTERNOON, keys: ["netsupport", "loa"] }]);
});

test("a set with only day keys never plans a phase build", () => {
    assert.deepEqual(planSetBuilds(DAY_ONLY, [a, b], new Set(), new Set([failedKey("D", MORNING, "loa")])), []);
});

test("a failed report of a built session is planned again with only the failed keys", () => {
    const failed = new Set([failedKey("A", MORNING, "loa")]);
    assert.deepEqual(planSetBuilds(A, [a], new Set([messageKey(a)]), failed), [{ session: MORNING, keys: ["loa"] }]);
});

test("a session that is both unbuilt and has failures is planned once with every phase key; sessions come out oldest first", () => {
    const failed = new Set([failedKey("A", MORNING, "loa")]);
    assert.deepEqual(planSetBuilds(A, [b, a], new Set([messageKey(a)]), failed), [
        { session: MORNING, keys: ["loa"] },
        { session: AFTERNOON, keys: ["netsupport", "loa"] },
    ]);
    assert.deepEqual(planSetBuilds(A, [a], new Set(), new Set([failedKey("A", MORNING, "loa")])), [{ session: MORNING, keys: ["netsupport", "loa"] }]);
});

test("failures of another set do not plan anything for this set; keys the set no longer enables are dropped", () => {
    assert.deepEqual(planSetBuilds(A, [a], new Set([messageKey(a)]), new Set([failedKey("D", MORNING, "loa")])), []);
    assert.deepEqual(planSetBuilds(A, [a], new Set([messageKey(a)]), new Set([failedKey("A", MORNING, "mayTinh")])), []);
});

test("pendingBuilds is the union of every set's planned sessions, oldest first", () => {
    const built = new Map([["A", new Set([messageKey(a)])], ["D", new Set<string>()]]);
    assert.deepEqual(pendingBuilds([A, DAY_ONLY], [a, b], built, new Set()), [AFTERNOON]);
});
