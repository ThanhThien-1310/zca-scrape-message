import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/config/configCheck.js";
import type { ConfigShape } from "../src/types/index.js";

const good = (): ConfigShape => ({
    targets: ["bot test", "LC_HoaSen1_TĐ"],
    recoveryIgnoreTargets: ["bot test"],
    targetMessageCount: 2000,
    scrollDelayMs: { min: 500, max: 1200 },
    watch: { heartbeatSeconds: 30, deadAfterSeconds: 90, minBlindSeconds: 60 },
    runner: { quietSeconds: 120, maxWaitSeconds: 600, pollSeconds: 5, dirtyCheckSeconds: 60, dirtyRetrySeconds: 300, watchWarmupSeconds: 90, maxConsecutiveFailures: 3, maxScrapeAttempts: 3, queueKeepDays: 3 },
    recovery: { marginMinutes: 5 },
    chat: { pollSeconds: 3, heartbeatSeconds: 30, skipBackoffSeconds: 45, sentLedgerMinutes: 10, echoWindowSeconds: 120, restorePreviousConversation: false },
    sessions: { chieuFromHour: 12, toiFromHour: 18 },
});
const bad = (mutate: (c: ConfigShape) => void) => {
    const c = good();
    mutate(c);
    return () => validateConfig(c);
};

test("the default values are valid and produce no warning", () => {
    assert.deepEqual(validateConfig(good()), []);
});

test("every seconds/minutes value must be a positive whole number, and the error names the key", () => {
    assert.throws(bad((c) => (c.runner.quietSeconds = 0)), /runner\.quietSeconds/);
    assert.throws(bad((c) => (c.runner.pollSeconds = -5)), /runner\.pollSeconds/);
    assert.throws(bad((c) => (c.watch.heartbeatSeconds = 1.5)), /watch\.heartbeatSeconds/);
    assert.throws(bad((c) => (c.recovery.marginMinutes = Number.NaN)), /recovery\.marginMinutes/);
    assert.throws(bad((c) => (c.chat.skipBackoffSeconds = "45" as unknown as number)), /chat\.skipBackoffSeconds/);
    assert.throws(bad((c) => (c.runner.maxConsecutiveFailures = 0)), /runner\.maxConsecutiveFailures/);
    assert.throws(bad((c) => (c.runner.queueKeepDays = 0)), /runner.queueKeepDays/);
    assert.throws(bad((c) => (c.chat.restorePreviousConversation = "yes" as unknown as boolean)), /chat.restorePreviousConversation.*true hoặc false/);
    assert.throws(bad((c) => (c.runner.maxScrapeAttempts = 0)), /runner.maxScrapeAttempts/);
    assert.throws(bad((c) => (c.targetMessageCount = 0)), /targetMessageCount/);
});

test("quietSeconds may equal maxWaitSeconds but not exceed it", () => {
    assert.deepEqual(bad((c) => (c.runner.quietSeconds = 600))(), []);
    assert.throws(bad((c) => (c.runner.quietSeconds = 601)), /quietSeconds.*maxWaitSeconds/);
});

test("a watcher is declared dead only after at least two missed beats; fewer than three is only a warning", () => {
    assert.throws(bad((c) => (c.watch.deadAfterSeconds = 45)), /deadAfterSeconds/);
    const warnings = bad((c) => (c.watch.deadAfterSeconds = 60))().filter((w) => /watch\.heartbeatSeconds/.test(w));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /deadAfterSeconds/);
});

test("the sent-reply ledger must outlive the echo window", () => {
    assert.throws(bad((c) => ((c.chat.sentLedgerMinutes = 1), (c.chat.echoWindowSeconds = 120))), /sentLedgerMinutes.*echoWindowSeconds/);
    assert.deepEqual(bad((c) => ((c.chat.sentLedgerMinutes = 3), (c.chat.echoWindowSeconds = 120)))(), []);
});

test("session hours must satisfy 0 < chieuFromHour < toiFromHour <= 23", () => {
    assert.throws(bad((c) => (c.sessions.chieuFromHour = 0)), /chieuFromHour/);
    assert.throws(bad((c) => ((c.sessions.chieuFromHour = 18), (c.sessions.toiFromHour = 18))), /toiFromHour/);
    assert.throws(bad((c) => (c.sessions.toiFromHour = 24)), /toiFromHour/);
    assert.throws(bad((c) => (c.sessions.chieuFromHour = 11.5)), /chieuFromHour/);
    assert.deepEqual(bad((c) => (c.sessions.toiFromHour = 17))(), []);
});

test("scroll delay: both non-negative and min <= max", () => {
    assert.throws(bad((c) => (c.scrollDelayMs.min = 2000)), /scrollDelayMs/);
    assert.throws(bad((c) => (c.scrollDelayMs.min = -1)), /scrollDelayMs/);
    assert.deepEqual(bad((c) => ((c.scrollDelayMs.min = 800), (c.scrollDelayMs.max = 800)))(), []);
});

test("targets: not empty, no duplicates; recoveryIgnoreTargets must be among them", () => {
    assert.throws(bad((c) => (c.targets = [])), /targets/);
    assert.throws(bad((c) => (c.targets = ["A", "A"])), /trùng/);
    assert.throws(bad((c) => (c.recoveryIgnoreTargets = ["Nhóm lạ"])), /recoveryIgnoreTargets.*Nhóm lạ/);
});

test("every problem is reported at once", () => {
    const fn = bad((c) => {
        c.runner.quietSeconds = 0;
        c.sessions.toiFromHour = 30;
        c.targets = [];
    });
    assert.throws(fn, (e: Error) => /quietSeconds/.test(e.message) && /toiFromHour/.test(e.message) && /targets/.test(e.message));
});

test("bot:chat's own heartbeat is judged against watch.deadAfterSeconds (chat:status uses it): two beats must fit, fewer than three only warns", () => {
    assert.throws(bad((c) => (c.chat.heartbeatSeconds = 60)), /chat\.heartbeatSeconds.*watch\.deadAfterSeconds/);
    assert.throws(bad((c) => (c.chat.heartbeatSeconds = 46)), /chat\.heartbeatSeconds/);
    const warnings = bad((c) => (c.chat.heartbeatSeconds = 40))();
    assert.equal(warnings.filter((w) => /chat\.heartbeatSeconds/.test(w)).length, 1);
    assert.deepEqual(bad((c) => (c.chat.heartbeatSeconds = 30))(), []);
});
