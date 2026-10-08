import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STALE_AFTER_MS } from "../src/watch/watchState.js";
import { takeRunnerSnapshot } from "../src/total/runnerSnapshot.js";
import { beatTotal, pruneSlots, readSlots, readTotalState, saveSlot, setTotalPhase, startTotal, stopTotal, totalHealth, writeSlots } from "../src/total/totalState.js";
import type { SlotRecord } from "../src/total/decide.js";
import type { RunnerState } from "../src/types/index.js";

const dir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "total-state-"));
const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: 1, lastRunAt: 2, complete: true, final: true, pending: [], files: ["a.xlsx"], warnings: [], failures: 0, ...over });

test("startTotal writes an idle state; beat and phase changes keep the pid and start time", () => {
    const file = path.join(dir(), "state.json");
    assert.deepEqual(startTotal(1000, 42, file), { anotherInstanceAlive: false, crashed: false });
    assert.deepEqual(readTotalState(file), { pid: 42, startedAt: 1000, lastBeat: 1000, state: "idle" });
    beatTotal(2000, file);
    setTotalPhase(3000, "running", file);
    assert.deepEqual(readTotalState(file), { pid: 42, startedAt: 1000, lastBeat: 3000, state: "running" });
    stopTotal(4000, file);
    assert.deepEqual(readTotalState(file), { pid: 42, startedAt: 1000, lastBeat: 4000, state: "stopped" });
});

test("startTotal refuses while another live bot is running, takes over a dead or stale one, and reports a crash", () => {
    const file = path.join(dir(), "state.json");
    startTotal(1000, 42, file);
    assert.deepEqual(startTotal(1500, 99, file, () => true), { anotherInstanceAlive: true, crashed: false });
    assert.equal(readTotalState(file)?.pid, 42); // không bị đè
    assert.deepEqual(startTotal(1500, 99, file, () => false), { anotherInstanceAlive: false, crashed: true }); // tiến trình cũ đã chết
    startTotal(1000, 7, file, () => false);
    assert.deepEqual(startTotal(1000 + STALE_AFTER_MS + 1, 99, file, () => true), { anotherInstanceAlive: false, crashed: true }); // nhịp tim quá cũ
    stopTotal(5000, file);
    assert.deepEqual(startTotal(6000, 100, file, () => true), { anotherInstanceAlive: false, crashed: false }); // dừng sạch
});

test("readTotalState reads a missing or corrupt file as null, and beat on a missing state does nothing", () => {
    const d = dir();
    assert.equal(readTotalState(path.join(d, "none.json")), null);
    fs.writeFileSync(path.join(d, "bad.json"), "{not json");
    assert.equal(readTotalState(path.join(d, "bad.json")), null);
    fs.writeFileSync(path.join(d, "shape.json"), JSON.stringify({ pid: "x" }));
    assert.equal(readTotalState(path.join(d, "shape.json")), null);
    beatTotal(1, path.join(d, "none.json"));
    assert.equal(fs.existsSync(path.join(d, "none.json")), false);
});

test("totalHealth: none, stopped, dead after a stale heartbeat, alive otherwise", () => {
    const base = { pid: 1, startedAt: 0, lastBeat: 10_000, state: "idle" as const };
    assert.equal(totalHealth(null, 0), "none");
    assert.equal(totalHealth({ ...base, state: "stopped" }, 10_001), "stopped");
    assert.equal(totalHealth(base, 10_000 + STALE_AFTER_MS), "alive");
    assert.equal(totalHealth(base, 10_000 + STALE_AFTER_MS + 1), "dead");
});

test("slot records round-trip, missing or corrupt files read as empty, and invalid entries are dropped", () => {
    const d = dir();
    const file = path.join(d, "slots.json");
    assert.deepEqual(readSlots(file), {});
    writeSlots({ "2026-10-03|morning": record() }, file);
    assert.deepEqual(readSlots(file), { "2026-10-03|morning": record() });
    fs.writeFileSync(file, JSON.stringify({ "2026-10-03|morning": record(), "2026-10-03|afternoon": { firstRunAt: "x" } }));
    assert.deepEqual(Object.keys(readSlots(file)), ["2026-10-03|morning"]);
    fs.writeFileSync(file, "{not json");
    assert.deepEqual(readSlots(file), {});
});

test("pruneSlots drops entries older than keepDays (by the day in the key) and keeps recent ones", () => {
    const now = Date.UTC(2026, 9, 10, 3, 0); // 10/10/2026 10:00 VN
    const slots = { "2026-10-10|morning": record(), "2026-10-07|afternoon": record(), "2026-10-06|morning": record() };
    assert.deepEqual(Object.keys(pruneSlots(slots, now, 3)).sort(), ["2026-10-07|afternoon", "2026-10-10|morning"]);
});

test("saveSlot adds or replaces one slot and prunes old ones in the same write", () => {
    const file = path.join(dir(), "slots.json");
    const now = Date.UTC(2026, 9, 10, 3, 0);
    writeSlots({ "2026-09-01|morning": record(), "2026-10-10|morning": record({ failures: 1 }) }, file);
    saveSlot("2026-10-10|morning", record({ failures: 0 }), now, file);
    saveSlot("2026-10-10|afternoon", record({ complete: false, final: false }), now, file);
    const slots = readSlots(file);
    assert.deepEqual(Object.keys(slots).sort(), ["2026-10-10|afternoon", "2026-10-10|morning"]);
    assert.equal(slots["2026-10-10|morning"].failures, 0);
});

test("takeRunnerSnapshot reads the runner's health and phase", () => {
    const now = 1_000_000;
    const state = (over: Partial<RunnerState> = {}): RunnerState => ({ pid: 1, startedAt: 0, lastBeat: now, state: "idle", consecutiveFailures: 0, ...over });
    assert.deepEqual(takeRunnerSnapshot(now, null), { health: "none", phase: null });
    assert.deepEqual(takeRunnerSnapshot(now, state()), { health: "alive", phase: "idle" });
    assert.deepEqual(takeRunnerSnapshot(now, state({ state: "running" })), { health: "alive", phase: "running" });
    assert.deepEqual(takeRunnerSnapshot(now, state({ state: "stopped" })), { health: "stopped", phase: "stopped" });
    assert.deepEqual(takeRunnerSnapshot(now, state({ state: "error" })), { health: "error", phase: "error" });
    assert.deepEqual(takeRunnerSnapshot(now + STALE_AFTER_MS + 1, state()), { health: "dead", phase: "idle" });
});
