import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STALE_AFTER_MS } from "../src/watch/watchState.js";
import { appendLog, beatRunner, MAX_CONSECUTIVE_FAILURES, readRunnerState, recordCycle, runnerHealth, setPhase, startRunner, stopRunner } from "../src/runner/runnerState.js";
import type { CycleSummary, RunnerFiles } from "../src/types/index.js";

function files(): RunnerFiles {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-"));
    return { state: path.join(dir, "data", ".runner-state.json"), log: path.join(dir, "output", "runner-log.jsonl"), built: path.join(dir, "data", ".runner-built.json") };
}
const cycle = (ok: boolean, at = 1): CycleSummary => ({ kind: "cycle", at, ok, groups: ["A"], sessions: [], reviewCount: 0, excel: [], warnings: [], errors: ok ? [] : ["boom"], buildErrors: [] });
const alive = () => true;
const dead = () => false;

test("starting writes an idle state with no failures", () => {
    const f = files();
    assert.deepEqual(startRunner(1000, 42, f, alive), { anotherInstanceAlive: false, crashed: false });
    const s = readRunnerState(f.state)!;
    assert.equal(s.pid, 42);
    assert.equal(s.state, "idle");
    assert.equal(s.consecutiveFailures, 0);
    assert.equal(s.startedAt, 1000);
});

test("a second runner is refused while the first is alive and beating", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    assert.equal(startRunner(2000, 43, f, alive).anotherInstanceAlive, true);
    assert.equal(readRunnerState(f.state)!.pid, 42);
});

test("a runner whose beat went stale or whose process is gone is replaced, and the crash is noted", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    assert.deepEqual(startRunner(1000 + STALE_AFTER_MS + 1, 43, f, alive), { anotherInstanceAlive: false, crashed: true });
    startRunner(5000, 44, f, dead);
    assert.equal(readRunnerState(f.state)!.pid, 44);
});

test("a cleanly stopped runner is not reported as crashed on the next start", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    stopRunner(2000, f);
    assert.equal(readRunnerState(f.state)!.state, "stopped");
    assert.deepEqual(startRunner(3000, 43, f, alive), { anotherInstanceAlive: false, crashed: false });
});

test("setPhase and beatRunner update the phase and the last beat", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    setPhase(2000, "waiting", f);
    assert.deepEqual([readRunnerState(f.state)!.state, readRunnerState(f.state)!.lastBeat], ["waiting", 2000]);
    beatRunner(3000, f);
    assert.deepEqual([readRunnerState(f.state)!.state, readRunnerState(f.state)!.lastBeat], ["waiting", 3000]);
});

test("recording cycles counts failures in a row, goes to error at the limit, and resets on success", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    for (let i = 1; i < MAX_CONSECUTIVE_FAILURES; i++) {
        const s = recordCycle(2000 + i, cycle(false), f);
        assert.equal(s.consecutiveFailures, i);
        assert.equal(s.state, "idle");
    }
    assert.equal(recordCycle(3000, cycle(false), f).state, "error");
    const ok = recordCycle(4000, cycle(true, 4000), f);
    assert.deepEqual([ok.consecutiveFailures, ok.state, ok.lastCycle?.at], [0, "idle", 4000]);
});

test("every cycle is appended to the log as one JSON line, and appendLog can add a rebuild entry", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    recordCycle(2000, cycle(true, 2000), f);
    appendLog({ ...cycle(true, 3000), kind: "rebuild" }, f);
    const lines = fs.readFileSync(f.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.kind, l.at]), [["cycle", 2000], ["rebuild", 3000]]);
});

test("runnerHealth tells none, stopped, dead, error and alive apart", () => {
    const f = files();
    assert.equal(runnerHealth(null, 1000), "none");
    startRunner(1000, 42, f, alive);
    assert.equal(runnerHealth(readRunnerState(f.state), 1000 + 10_000), "alive");
    assert.equal(runnerHealth(readRunnerState(f.state), 1000 + STALE_AFTER_MS + 1), "dead");
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) recordCycle(2000, cycle(false), f);
    assert.equal(runnerHealth(readRunnerState(f.state), 2000), "error");
    stopRunner(3000, f);
    assert.equal(runnerHealth(readRunnerState(f.state), 3000), "stopped");
});

test("a corrupt state file reads as no state", () => {
    const f = files();
    fs.mkdirSync(path.dirname(f.state), { recursive: true });
    fs.writeFileSync(f.state, JSON.stringify({ pid: "x" }), "utf8");
    assert.equal(readRunnerState(f.state), null);
});
