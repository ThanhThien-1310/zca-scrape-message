import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beat, effectiveGaps, gapOverlaps, readGaps, readState, startWatching, stopWatching, STALE_AFTER_MS } from "../src/watch/watchState.js";
import type { WatchFiles } from "../src/types/index.js";

const files = (): WatchFiles => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-"));
    return { state: path.join(dir, ".watch-state.json"), gaps: path.join(dir, ".watch-gaps.json") };
};
const T0 = Date.UTC(2026, 8, 25, 0, 0, 0);
const dead = () => false;
const alive = () => true;
const wsActive = { sources: { ws: "active" } } as const;

test("a first start creates a running state and no gaps", () => {
    const f = files();
    assert.deepEqual(startWatching(T0, 100, f, dead), { crashed: false, anotherInstanceAlive: false });
    const s = readState(f.state)!;
    assert.equal(s.state, "running");
    assert.equal(s.pid, 100);
    assert.equal(s.startedAt, T0);
    assert.equal(s.lastBeat, T0);
    assert.deepEqual(s.sources, { ws: "connecting" });
    assert.deepEqual(readGaps(f.gaps), []);
});

test("a start after a process that never stopped records a crash gap from its last beat", () => {
    const f = files();
    startWatching(T0, 100, f, dead);
    beat(T0 + 30_000, wsActive, f);
    const r = startWatching(T0 + 600_000, 200, f, dead);
    assert.equal(r.crashed, true);
    assert.deepEqual(readGaps(f.gaps), [{ from: T0 + 30_000, to: T0 + 600_000, reason: "crash" }]);
    assert.equal(readState(f.state)!.pid, 200);
});

test("a second instance next to a live watcher is refused and nothing is changed", () => {
    const f = files();
    startWatching(T0, 100, f, dead);
    const before = fs.readFileSync(f.state, "utf8");
    const r = startWatching(T0 + 10_000, 200, f, alive);
    assert.equal(r.anotherInstanceAlive, true);
    assert.equal(fs.readFileSync(f.state, "utf8"), before);
});

test("a clean stop then a start records a stopped gap, not a crash", () => {
    const f = files();
    startWatching(T0, 100, f, dead);
    beat(T0 + 30_000, wsActive, f);
    stopWatching(T0 + 3_600_000, "stopped", f);
    assert.deepEqual(readGaps(f.gaps), [{ from: T0 + 3_600_000, to: null, reason: "stopped" }]);
    const r = startWatching(T0 + 7_200_000, 200, f, dead);
    assert.equal(r.crashed, false);
    assert.deepEqual(readGaps(f.gaps), [{ from: T0 + 3_600_000, to: T0 + 7_200_000, reason: "stopped" }]);
});

test("the WebSocket source down for a minute or more is a blind gap; a shorter dip is not", () => {
    const f = files();
    startWatching(T0, 100, f, dead);
    beat(T0 + 10_000, wsActive, f);
    beat(T0 + 40_000, { sources: { ws: "down" } }, f);
    beat(T0 + 70_000, { sources: { ws: "active" } }, f); // blind for only 30s
    assert.deepEqual(readGaps(f.gaps), []);
    beat(T0 + 100_000, { sources: { ws: "down" } }, f);
    beat(T0 + 200_000, { sources: { ws: "active" } }, f); // blind for 100s
    assert.deepEqual(readGaps(f.gaps), [{ from: T0 + 100_000, to: T0 + 200_000, reason: "blind" }]);
});

test("beat counts detections and remembers the last one", () => {
    const f = files();
    startWatching(T0, 100, f, dead);
    beat(T0 + 5_000, { ...wsActive, detection: true }, f);
    beat(T0 + 9_000, { detection: true }, f);
    const s = readState(f.state)!;
    assert.equal(s.detections, 2);
    assert.equal(s.lastDetectionAt, T0 + 9_000);
});

test("effectiveGaps adds an open crash gap once the heartbeat is stale", () => {
    const f = files();
    startWatching(T0, 100, f, dead);
    beat(T0 + 30_000, wsActive, f);
    assert.deepEqual(effectiveGaps(T0 + 30_000 + STALE_AFTER_MS - 1, f), []);
    assert.deepEqual(effectiveGaps(T0 + 30_000 + STALE_AFTER_MS + 1, f), [{ from: T0 + 30_000, to: null, reason: "crash" }]);
});

test("effectiveGaps reports an open blind gap while the watcher is alive but blind", () => {
    const f = files();
    startWatching(T0, 100, f, dead);
    beat(T0 + 30_000, wsActive, f);
    beat(T0 + 60_000, { sources: { ws: "down" } }, f);
    assert.deepEqual(effectiveGaps(T0 + 70_000, f), [{ from: T0 + 60_000, to: null, reason: "blind" }]);
});

test("with no state at all nothing can be ruled out, so the whole past is an unknown gap", () => {
    assert.deepEqual(effectiveGaps(T0, files()), [{ from: 0, to: null, reason: "unknown" }]);
});

test("corrupt state and gap files read as missing instead of throwing", () => {
    const f = files();
    fs.writeFileSync(f.state, "{ not json", "utf8");
    fs.writeFileSync(f.gaps, '{"a":1}', "utf8");
    assert.equal(readState(f.state), null);
    assert.deepEqual(readGaps(f.gaps), []);
});

test("gapOverlaps treats an open gap as lasting until now and the window as half-open", () => {
    const w = { from: 100, to: 200 };
    assert.equal(gapOverlaps({ from: 0, to: 100, reason: "crash" }, w, 999), false);
    assert.equal(gapOverlaps({ from: 0, to: 101, reason: "crash" }, w, 999), true);
    assert.equal(gapOverlaps({ from: 199, to: null, reason: "stopped" }, w, 300), true);
    assert.equal(gapOverlaps({ from: 200, to: null, reason: "stopped" }, w, 300), false);
    assert.equal(gapOverlaps({ from: 50, to: null, reason: "crash" }, w, 120), true); // opened before the window, still open inside it
    assert.equal(gapOverlaps({ from: 50, to: null, reason: "crash" }, w, 90), false); // ... but "now" is still before the window
});
