import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter, isStale } from "../src/chat/limits.js";

const limits = { maxRepliesPerMinute: 2, maxReplyDelaySeconds: 180, cooldownSecondsPerRule: 30 };

test("a rule that just replied in a group is on cooldown there, but not in another group or for another rule", () => {
    const l = createLimiter(limits);
    l.record("A", "r1", 1000);
    assert.deepEqual(l.check("A", "r1", 1000 + 29_000), { ok: false, reason: "cooldown" });
    assert.deepEqual(l.check("A", "r1", 1000 + 30_000), { ok: true });
    assert.deepEqual(l.check("B", "r1", 1000 + 1_000), { ok: true });
    assert.deepEqual(l.check("A", "r2", 1000 + 1_000), { ok: true });
});

test("no more than maxRepliesPerMinute replies in any 60 seconds, across all groups", () => {
    const l = createLimiter(limits);
    l.record("A", "r1", 0);
    l.record("B", "r1", 10_000);
    assert.deepEqual(l.check("C", "r1", 20_000), { ok: false, reason: "rate" });
    assert.deepEqual(l.check("C", "r1", 60_001), { ok: true }); // the first one left the window
});

test("cooldown is reported before the rate limit", () => {
    const l = createLimiter(limits);
    l.record("A", "r1", 0);
    l.record("B", "r1", 1000);
    assert.deepEqual(l.check("A", "r1", 2000), { ok: false, reason: "cooldown" });
});

test("isStale is true only when the message is older than the allowed delay", () => {
    assert.equal(isStale(0, 180_000, 180), false);
    assert.equal(isStale(0, 180_001, 180), true);
});
