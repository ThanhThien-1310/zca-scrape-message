import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRecoverStep, selectFreshGaps } from "../src/runner/recoveryPlan.js";
import type { Gap } from "../src/types/index.js";

const SCOPE = "2026-09-26|sang";
const g = (from: number, to: number | null): Gap => ({ from, to, reason: "crash" });
const key = (gap: Gap) => `${SCOPE}|${gap.from}|${gap.to ?? "open"}`;

test("gaps that were already recovered are not selected again, so old gaps stop causing rescans", () => {
    const gaps = [g(100, 200), g(300, 400), g(500, null)];
    const done = new Set([key(gaps[0]), key(gaps[1])]);
    const r = selectFreshGaps(gaps, done, SCOPE);
    assert.deepEqual(r.fresh, [gaps[2]]);
    assert.deepEqual(r.keys, [key(gaps[2])]);
});

test("with every gap already recovered nothing is selected", () => {
    const gaps = [g(100, 200)];
    const r = selectFreshGaps(gaps, new Set([key(gaps[0])]), SCOPE);
    assert.deepEqual(r, { fresh: [], keys: [] });
});

test("a gap that was open and later closes is a new gap to recover once more", () => {
    const open = g(500, null);
    const closed = g(500, 900);
    const done = new Set([key(open)]);
    assert.deepEqual(selectFreshGaps([closed], done, SCOPE).fresh, [closed]);
});

test("the recover step does nothing at all (no scrape, no Zalo) when there is no fresh gap", async () => {
    let calls = 0;
    const step = makeRecoverStep(() => [], async () => (calls++, { errors: [] }));
    assert.deepEqual(await step(), { errors: [] });
    assert.equal(calls, 0);
});

test("the recover step runs recovery exactly for the fresh gaps it is given", async () => {
    const fresh = [g(500, null)];
    const seen: Gap[][] = [];
    const step = makeRecoverStep(() => fresh, async (gaps) => (seen.push(gaps), { errors: ["x"] }));
    assert.deepEqual(await step(), { errors: ["x"] });
    assert.deepEqual(seen, [fresh]);
});
