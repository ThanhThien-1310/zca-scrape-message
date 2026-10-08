import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideTotal, giveUp, recordAfterCrash, recordAfterRun, type RunnerSnapshot, type SlotRecord } from "../src/total/decide.js";
import { slotsOfDay } from "../src/total/slots.js";

const [morning] = slotsOfDay("2026-10-03", { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const MIN = 60_000;
const T = { waitMaxMs: 10 * MIN, refreshEveryMs: 10 * MIN, refreshUntilMs: 60 * MIN, maxFailures: 3 };
const at = (minutesAfterSlot: number): number => morning.atMs + minutesAfterSlot * MIN;

const idle: RunnerSnapshot = { health: "alive", phase: "idle" };
const busy: RunnerSnapshot = { health: "alive", phase: "running" };
const waiting: RunnerSnapshot = { health: "alive", phase: "waiting" };
const dead: RunnerSnapshot = { health: "dead", phase: "running" };
const errored: RunnerSnapshot = { health: "error", phase: "error" };

const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: at(10), lastRunAt: at(10), complete: false, final: false, pending: ["A"], files: [], warnings: [], failures: 0, ...over });

test("before the slot hour nothing happens", () => {
    assert.deepEqual(decideTotal({ now: at(-1), slot: morning, record: undefined, runner: idle, queue: [], ...T }), { action: "idle" });
});

test("first run: runner idle and queue empty -> export now, complete and final", () => {
    assert.deepEqual(decideTotal({ now: at(0), slot: morning, record: undefined, runner: idle, queue: [], ...T }), { action: "run", kind: "first", reason: "runner-idle", complete: true, final: true, pending: [] });
});

test("first run: runner busy or waiting, or queue not empty -> wait; at the deadline export anyway as incomplete", () => {
    for (const runner of [busy, waiting]) assert.deepEqual(decideTotal({ now: at(5), slot: morning, record: undefined, runner, queue: ["A"], ...T }), { action: "wait", reason: "runner-busy" });
    assert.deepEqual(decideTotal({ now: at(5), slot: morning, record: undefined, runner: idle, queue: ["A"], ...T }), { action: "wait", reason: "runner-busy" });
    assert.deepEqual(decideTotal({ now: at(10), slot: morning, record: undefined, runner: busy, queue: ["A", "B"], ...T }), { action: "run", kind: "first", reason: "wait-expired", complete: false, final: false, pending: ["A", "B"] });
});

test("first run: runner dead, stopped or in error -> export immediately without waiting", () => {
    assert.deepEqual(decideTotal({ now: at(0), slot: morning, record: undefined, runner: dead, queue: ["A"], ...T }), { action: "run", kind: "first", reason: "runner-down", complete: false, final: false, pending: ["A"] });
    assert.deepEqual(decideTotal({ now: at(0), slot: morning, record: undefined, runner: errored, queue: [], ...T }), { action: "run", kind: "first", reason: "runner-down", complete: true, final: true, pending: [] });
    assert.equal(decideTotal({ now: at(0), slot: morning, record: undefined, runner: { health: "stopped", phase: "stopped" }, queue: ["A"], ...T }).action, "run");
    assert.equal(decideTotal({ now: at(0), slot: morning, record: undefined, runner: { health: "none", phase: null }, queue: [], ...T }).action, "run");
});

test("a bot that starts late catches up the slot once the hour has passed", () => {
    assert.deepEqual(decideTotal({ now: at(180), slot: morning, record: undefined, runner: idle, queue: [], ...T }), { action: "run", kind: "first", reason: "runner-idle", complete: true, final: true, pending: [] });
});

test("a final record never runs again", () => {
    assert.deepEqual(decideTotal({ now: at(30), slot: morning, record: record({ complete: true, final: true, pending: [] }), runner: idle, queue: [], ...T }), { action: "idle" });
    assert.deepEqual(decideTotal({ now: at(30), slot: morning, record: record({ complete: false, final: true }), runner: idle, queue: [], ...T }), { action: "idle" });
});

test("refresh: as soon as the queue is drained and the runner idle, run the last (complete, final) export", () => {
    assert.deepEqual(decideTotal({ now: at(12), slot: morning, record: record({ lastRunAt: at(10) }), runner: idle, queue: [], ...T }), { action: "run", kind: "refresh", reason: "queue-drained", complete: true, final: true, pending: [] });
});

test("refresh: not drained -> wait until refreshEvery has passed since the last run, then refresh as incomplete", () => {
    assert.deepEqual(decideTotal({ now: at(15), slot: morning, record: record({ lastRunAt: at(10) }), runner: busy, queue: ["A"], ...T }), { action: "wait", reason: "refresh-later" });
    assert.deepEqual(decideTotal({ now: at(20), slot: morning, record: record({ lastRunAt: at(10) }), runner: busy, queue: ["A"], ...T }), { action: "run", kind: "refresh", reason: "refresh-due", complete: false, final: false, pending: ["A"] });
});

test("refresh: a dead runner makes nothing new, so wait (no useless re-export) until it is back or the deadline passes", () => {
    assert.deepEqual(decideTotal({ now: at(30), slot: morning, record: record({ lastRunAt: at(10) }), runner: dead, queue: ["A"], ...T }), { action: "wait", reason: "refresh-later" });
    assert.deepEqual(decideTotal({ now: at(61), slot: morning, record: record({ lastRunAt: at(10) }), runner: dead, queue: ["A"], ...T }), { action: "give-up" });
});

test("give up after refreshUntil even when the runner is alive and busy", () => {
    assert.deepEqual(decideTotal({ now: at(60), slot: morning, record: record({ lastRunAt: at(50) }), runner: busy, queue: ["A"], ...T }), { action: "give-up" });
});

test("failures: retry only after refreshEvery (even if drained), and give up after maxFailures", () => {
    const failed = record({ failures: 1, lastRunAt: at(10), pending: [] });
    assert.deepEqual(decideTotal({ now: at(12), slot: morning, record: failed, runner: idle, queue: [], ...T }), { action: "wait", reason: "refresh-later" });
    assert.equal(decideTotal({ now: at(21), slot: morning, record: failed, runner: idle, queue: [], ...T }).action, "run");
    assert.deepEqual(decideTotal({ now: at(21), slot: morning, record: record({ failures: 3 }), runner: idle, queue: [], ...T }), { action: "give-up" });
});

test("recordAfterRun: a clean run stores the flags; a run with a failed file is neither complete nor final and counts a failure", () => {
    const flags = { complete: true, final: true, pending: [] };
    assert.deepEqual(recordAfterRun(undefined, flags, { files: ["a", "b"], failed: [], warnings: [] }, 1000), { firstRunAt: 1000, lastRunAt: 1000, complete: true, final: true, pending: [], files: ["a", "b"], warnings: [], failures: 0 });
    const after = recordAfterRun(record({ firstRunAt: 500, failures: 1 }), flags, { files: ["a"], failed: ["mayTinh"], warnings: ["mayTinh: lỗi"] }, 2000);
    assert.deepEqual(after, { firstRunAt: 500, lastRunAt: 2000, complete: false, final: false, pending: [], files: ["a"], warnings: ["mayTinh: lỗi"], failures: 2 });
    assert.equal(recordAfterRun(record({ failures: 2 }), flags, { files: ["a"], failed: [], warnings: [] }, 3000).failures, 0);
});

test("recordAfterCrash keeps what was known, counts a failure and explains it; giveUp makes the record final", () => {
    const crashed = recordAfterCrash(undefined, 1000, "không đọc được kho tin");
    assert.deepEqual(crashed, { firstRunAt: 1000, lastRunAt: 1000, complete: false, final: false, pending: [], files: [], warnings: ["lỗi: không đọc được kho tin"], failures: 1 });
    assert.equal(recordAfterCrash(crashed, 2000, "x").failures, 2);
    const done = giveUp(record({ warnings: ["w"] }), "hết hạn xuất lại");
    assert.equal(done.final, true);
    assert.deepEqual(done.warnings, ["w", "hết hạn xuất lại"]);
});

test("failures while the runner is DEAD: the failed file is still retried after refreshEvery (not 'wait' until give-up)", () => {
    const failed = record({ failures: 1, lastRunAt: at(10), pending: [] });
    assert.deepEqual(decideTotal({ now: at(12), slot: morning, record: failed, runner: dead, queue: [], ...T }), { action: "wait", reason: "refresh-later" });
    assert.deepEqual(decideTotal({ now: at(21), slot: morning, record: failed, runner: dead, queue: [], ...T }), { action: "run", kind: "refresh", reason: "runner-down", complete: true, final: true, pending: [] });
    const withQueue = record({ failures: 1, lastRunAt: at(10), pending: ["A"] });
    assert.deepEqual(decideTotal({ now: at(21), slot: morning, record: withQueue, runner: dead, queue: ["A"], ...T }), { action: "run", kind: "refresh", reason: "runner-down", complete: false, final: false, pending: ["A"] });
});

test("two exports of a slot are never closer than a minute (the same HHmm would reuse, and clobber, the file name)", () => {
    const last = record({ lastRunAt: at(10) });
    assert.deepEqual(decideTotal({ now: at(10) + 30_000, slot: morning, record: last, runner: idle, queue: [], ...T }), { action: "wait", reason: "refresh-later" });
    assert.equal(decideTotal({ now: at(10) + 60_000, slot: morning, record: last, runner: idle, queue: [], ...T }).action, "run");
});

test("shouldRecordSlot: a manual run of only SOME of the active sets must not close the slot for the others", async () => {
    const { shouldRecordSlot } = await import("../src/total/decide.js");
    assert.equal(shouldRecordSlot(["A", "B"], ["A", "B"]), true);
    assert.equal(shouldRecordSlot(["B", "A"], ["A", "B"]), true);
    assert.equal(shouldRecordSlot(["A"], ["A", "B"]), false);
    assert.equal(shouldRecordSlot(["A"], ["A"]), true);
    assert.equal(shouldRecordSlot([], []), false); // nothing ran
});
