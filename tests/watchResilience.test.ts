import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateConfig } from "../src/config/configCheck.js";
import { watchWarmingUp } from "../src/runner/schedule.js";
import { beat, readState, startWatching } from "../src/watch/watchState.js";
import { formatWatchStatus } from "../src/watch/watchStatusReport.js";
import { config } from "../config.js";
import type { WatchState } from "../src/types/index.js";

/** validateConfig ném một lỗi gộp khi sai; trả về các dòng lỗi (rỗng khi hợp lệ). */
const errorsOf = (c: typeof config): string[] => {
    try {
        validateConfig(c as never);
        return [];
    } catch (e) {
        return (e as Error).message.split("\n");
    }
};

const state = (over: Partial<WatchState> = {}): WatchState => ({ pid: 1, startedAt: 0, lastBeat: 0, state: "running", detections: 0, sources: { ws: "active" }, ...over });

test("the runner waits again after bot:watch reconnects (restartedAt), not only after it starts", () => {
    const warm = config.runner.watchWarmupSeconds * 1000;
    assert.equal(watchWarmingUp(state({ startedAt: 0 }), warm + 1), false);
    assert.equal(watchWarmingUp(state({ startedAt: 0, restartedAt: warm }), warm + 1), true, "a fresh reconnect warms up again");
    assert.equal(watchWarmingUp(state({ startedAt: 0, restartedAt: warm }), warm * 2 + 1), false);
    assert.equal(watchWarmingUp(null, 1), false);
});

test("beat records the reconnect count, restart time and last frame; a zero last-frame is ignored", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "watch-"));
    const files = { state: path.join(dir, "s.json"), gaps: path.join(dir, "g.json") };
    startWatching(1000, 7, files, () => false);
    beat(2000, { restartedAt: 2000, reconnects: 1, lastFrameAt: 1500 }, files);
    assert.deepEqual([readState(files.state)!.restartedAt, readState(files.state)!.reconnects, readState(files.state)!.lastFrameAt], [2000, 1, 1500]);
    beat(3000, { lastFrameAt: 0 }, files);
    assert.equal(readState(files.state)!.lastFrameAt, 1500, "no frame yet must not erase the last real one");
});

test("watch:status shows the last frame and the reconnect count", () => {
    const now = 10 * 60_000;
    const text = formatWatchStatus(state({ lastBeat: now, lastFrameAt: now - 30_000, reconnects: 2, restartedAt: now - 120_000 }), [], now).join("\n");
    assert.match(text, /khung WebSocket cuối/);
    assert.match(text, /đã tự nối lại 2 lần/);
});

test("the new knobs: zero means off for the optional ones, negatives are refused, probe and reconnect must be positive", () => {
    const base = JSON.parse(JSON.stringify(config)) as typeof config;
    assert.deepEqual(errorsOf(base).filter((e) => /silenceRestart|errorRetry|sweep|probe|reconnect/.test(e)), []);
    const off = JSON.parse(JSON.stringify(base)) as typeof config;
    off.watch.silenceRestartMinutes = 0;
    off.runner.errorRetryMinutes = 0;
    off.runner.sweepMinutes = 0;
    assert.deepEqual(errorsOf(off).filter((e) => /silenceRestart|errorRetry|sweep/.test(e)), []);
    for (const [section, key] of [["watch", "silenceRestartMinutes"], ["runner", "errorRetryMinutes"], ["runner", "sweepMinutes"]] as const) {
        const bad = JSON.parse(JSON.stringify(base)) as typeof config;
        (bad[section] as Record<string, number>)[key] = -1;
        assert.ok(errorsOf(bad).some((e) => e.includes(`${section}.${key}`)), `${section}.${key}`);
    }
    for (const key of ["probeSeconds", "reconnectMaxSeconds"] as const) {
        const bad = JSON.parse(JSON.stringify(base)) as typeof config;
        bad.watch[key] = 0;
        assert.ok(errorsOf(bad).some((e) => e.includes(`watch.${key}`)), key);
    }
});
