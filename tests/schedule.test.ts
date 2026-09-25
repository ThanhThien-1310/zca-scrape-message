import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, MAX_WAIT_MS, newRecoveryKeys, QUIET_MS, toQueueTimes } from "../runner/schedule.js";

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

test("newRecoveryKeys lists the gaps not yet recovered, keyed by their bounds; an open gap is keyed apart from its closed form", () => {
    const gaps = [
        { from: 100, to: 200, reason: "crash" as const },
        { from: 300, to: null, reason: "stopped" as const },
    ];
    assert.deepEqual(newRecoveryKeys(gaps, new Set()), ["100|200", "300|open"]);
    assert.deepEqual(newRecoveryKeys(gaps, new Set(["100|200"])), ["300|open"]);
    assert.deepEqual(newRecoveryKeys([{ from: 300, to: 900, reason: "stopped" as const }], new Set(["300|open"])), ["300|900"]);
    assert.deepEqual(newRecoveryKeys([], new Set()), []);
});
