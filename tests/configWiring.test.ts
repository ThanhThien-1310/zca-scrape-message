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

test("chat timings come from config", () => {
    const out = probe(
        `config.chat.pollSeconds = 4; config.chat.heartbeatSeconds = 31; config.chat.skipBackoffSeconds = 46; config.chat.sentLedgerMinutes = 11; config.chat.echoWindowSeconds = 121;`,
        `
const t = await import("../chat/timing.js");
const c = await import("../chat/cycle.js");
return { poll: t.CHAT_POLL_MS, hb: t.CHAT_HEARTBEAT_MS, skip: t.SKIP_BACKOFF_MS, cycleSkip: c.SKIP_BACKOFF_MS, keep: t.KEEP_SENT_MS, echo: t.ECHO_WINDOW_MS };
`,
    );
    assert.deepEqual(out, { poll: 4000, hb: 31000, skip: 46000, cycleSkip: 46000, keep: 660000, echo: 121000 });
});
