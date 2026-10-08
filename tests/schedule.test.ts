import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { at } from "./fixtures.js";
import { decide, MAX_WAIT_MS, newRecoveryKeys, QUIET_MS, scrapeSinceTs, settledGaps, toQueueTimes, watchWarmingUp } from "../src/runner/schedule.js";

const NOW = 1_000_000_000_000;

test("an empty queue is idle", () => {
    assert.deepEqual(decide({ count: 0, firstQueuedAt: 0, lastQueuedAt: 0 }, NOW), { action: "idle" });
});

test("a group queued a moment ago is waited for, with the time it becomes due", () => {
    const q = { count: 1, firstQueuedAt: NOW - 10_000, lastQueuedAt: NOW - 10_000 };
    assert.deepEqual(decide(q, NOW), { action: "wait", runAt: NOW - 10_000 + QUIET_MS });
});

test("the queue runs once it has been quiet for the quiet period", () => {
    const q = { count: 2, firstQueuedAt: NOW - QUIET_MS - 60_000, lastQueuedAt: NOW - QUIET_MS };
    assert.deepEqual(decide(q, NOW), { action: "run", reason: "quiet" });
});

test("a steady stream of groups still runs at the maximum wait", () => {
    const q = { count: 4, firstQueuedAt: NOW - MAX_WAIT_MS, lastQueuedAt: NOW - 5_000 };
    assert.deepEqual(decide(q, NOW), { action: "run", reason: "max-wait" });
});

test("runAt is the earlier of the quiet deadline and the maximum wait", () => {
    const q = { count: 3, firstQueuedAt: NOW - MAX_WAIT_MS + 30_000, lastQueuedAt: NOW - 1_000 };
    assert.deepEqual(decide(q, NOW), { action: "wait", runAt: NOW + 30_000 });
});

test("toQueueTimes takes the earliest and latest recorded time, and falls back for groups with none", () => {
    assert.deepEqual(toQueueTimes([], {}, NOW), { count: 0, firstQueuedAt: NOW, lastQueuedAt: NOW });
    assert.deepEqual(toQueueTimes(["A", "B"], { A: 100, B: 300 }, NOW), { count: 2, firstQueuedAt: 100, lastQueuedAt: 300 });
    assert.deepEqual(toQueueTimes(["A", "B"], { A: 100 }, NOW), { count: 2, firstQueuedAt: 100, lastQueuedAt: NOW });
    assert.deepEqual(toQueueTimes(["A"], { Z: 5 }, NOW), { count: 1, firstQueuedAt: NOW, lastQueuedAt: NOW });
});

test("newRecoveryKeys lists the gaps not yet recovered, keyed by session and bounds; an open gap is keyed apart from its closed form", () => {
    const gaps = [
        { from: 100, to: 200, reason: "crash" as const },
        { from: 300, to: null, reason: "stopped" as const },
    ];
    const scope = "2026-09-24|sang";
    assert.deepEqual(newRecoveryKeys(gaps, new Set(), scope), [`${scope}|100|200`, `${scope}|300|open`]);
    assert.deepEqual(newRecoveryKeys(gaps, new Set([`${scope}|100|200`]), scope), [`${scope}|300|open`]);
    assert.deepEqual(newRecoveryKeys([{ from: 300, to: 900, reason: "stopped" as const }], new Set([`${scope}|300|open`]), scope), [`${scope}|300|900`]);
    assert.deepEqual(newRecoveryKeys([], new Set(), scope), []);
});

test("an open gap that lasts into the next session is a new thing to recover, because its key includes the session", () => {
    const gaps = [{ from: 300, to: null, reason: "crash" as const }];
    const done = new Set(newRecoveryKeys(gaps, new Set(), "2026-09-24|sang"));
    assert.deepEqual(newRecoveryKeys(gaps, done, "2026-09-24|sang"), []);
    assert.equal(newRecoveryKeys(gaps, done, "2026-09-24|chieu").length, 1);
});

test("queued-again times count as activity for the quiet period", () => {
    assert.deepEqual(toQueueTimes(["A"], { A: 100 }, NOW, { A: 900 }), { count: 1, firstQueuedAt: 100, lastQueuedAt: 900 });
    assert.deepEqual(toQueueTimes(["A"], { A: 100 }, NOW, { Z: 900 }), { count: 1, firstQueuedAt: 100, lastQueuedAt: 100 });
});

test("scrapeSinceTs is 17:30 the evening before (reports sent after 17:30 count for the next morning), so the scroll-back does not grow with the runner's uptime", () => {
    const prevEvening = at(17, 30) - 24 * 3_600_000;
    assert.equal(scrapeSinceTs(at(15, 30)), prevEvening);
    assert.equal(scrapeSinceTs(at(0, 0)), prevEvening);
    assert.equal(scrapeSinceTs(at(23, 59)), prevEvening);
});

test("bot:watch counts as warming up for 90 seconds after it started", () => {
    const state = (startedAt: number, s: "running" | "stopped" = "running") => ({ pid: 1, startedAt, lastBeat: startedAt, state: s, detections: 0, sources: { ws: "connecting" as const } });
    assert.equal(watchWarmingUp(state(NOW - 30_000), NOW), true);
    assert.equal(watchWarmingUp(state(NOW - 91_000), NOW), false);
    assert.equal(watchWarmingUp(state(NOW - 30_000, "stopped"), NOW), false);
    assert.equal(watchWarmingUp(null, NOW), false);
});

test("settledGaps drops an open blind spell younger than a minute (start-up noise) and keeps everything else", () => {
    const young = { from: NOW - 20_000, to: null, reason: "blind" as const };
    const old = { from: NOW - 120_000, to: null, reason: "blind" as const };
    const crash = { from: NOW - 20_000, to: null, reason: "crash" as const };
    const closed = { from: NOW - 20_000, to: NOW - 5_000, reason: "blind" as const };
    assert.deepEqual(settledGaps([young, old, crash, closed], NOW), [old, crash, closed]);
});
