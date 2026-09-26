import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";

test("the old keys are all still there with the same types", () => {
    assert.equal(typeof config.cdpPort, "number");
    assert.equal(config.cdpUrl, `http://127.0.0.1:${config.cdpPort}`);
    assert.equal(typeof config.autoLaunchZalo, "boolean");
    assert.equal(typeof config.dataDir, "string");
    assert.ok(Array.isArray(config.targets) && config.targets.length > 0);
    assert.ok(Array.isArray(config.recoveryIgnoreTargets));
    assert.ok(config.sinceTs === null || typeof config.sinceTs === "number");
    assert.ok(config.untilTs === null || typeof config.untilTs === "number");
    assert.equal(typeof config.targetMessageCount, "number");
    assert.equal(typeof config.scrollDelayMs.min, "number");
    assert.equal(typeof config.scrollDelayMs.max, "number");
});

test("the new sections exist and hold numbers", () => {
    for (const section of [config.watch, config.runner, config.recovery, config.chat, config.sessions]) {
        assert.ok(Object.keys(section).length > 0);
        for (const [key, value] of Object.entries(section)) assert.equal(typeof value, key === "restorePreviousConversation" ? "boolean" : "number", key);
    }
    for (const key of ["quietSeconds", "maxWaitSeconds", "pollSeconds", "dirtyCheckSeconds", "dirtyRetrySeconds", "watchWarmupSeconds", "maxConsecutiveFailures"]) {
        assert.equal(typeof (config.runner as Record<string, unknown>)[key], "number", key);
    }
});
