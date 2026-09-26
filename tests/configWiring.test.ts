import { test } from "node:test";
import assert from "node:assert/strict";
import { probe } from "./helpers/configProbe.js";

test("watch, runner and recovery timings come from config, not from constants in the modules", () => {
    const out = probe(
        `
config.watch.heartbeatSeconds = 11; config.watch.deadAfterSeconds = 33; config.watch.minBlindSeconds = 22;
config.runner.quietSeconds = 31; config.runner.maxWaitSeconds = 301; config.runner.pollSeconds = 7;
config.runner.dirtyCheckSeconds = 41; config.runner.dirtyRetrySeconds = 61; config.runner.watchWarmupSeconds = 51;
config.runner.maxConsecutiveFailures = 4;
config.recovery.marginMinutes = 9;
`,
        `
const w = await import("../history/watchState.js");
const s = await import("../runner/schedule.js");
const r = await import("../runner/runnerState.js");
const rr = await import("../lesson/recoveryRun.js");
return { hb: w.HEARTBEAT_INTERVAL_MS, dead: w.STALE_AFTER_MS, blind: w.MIN_BLIND_GAP_MS, quiet: s.QUIET_MS, max: s.MAX_WAIT_MS, warm: s.WARMUP_MS, sblind: s.MIN_BLIND_MS, poll: s.POLL_MS, dc: s.DIRTY_CHECK_MS, dr: s.DIRTY_RETRY_MS, fails: r.MAX_CONSECUTIVE_FAILURES, margin: rr.SINCE_MARGIN_MS };
`,
    );
    assert.deepEqual(out, { hb: 11000, dead: 33000, blind: 22000, quiet: 31000, max: 301000, warm: 51000, sblind: 22000, poll: 7000, dc: 41000, dr: 61000, fails: 4, margin: 540000 });
});
