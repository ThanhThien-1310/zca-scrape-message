import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveUntilTs } from "../src/scrape/scrapeWindow.js";

test("with no override the configured untilTs applies (manual bot:scrape keeps honouring it)", () => {
    assert.equal(resolveUntilTs(undefined, 123), 123);
    assert.equal(resolveUntilTs(undefined, null), null);
});

test("an explicit null overrides a configured untilTs, so bot:runner and recovery never cut messages off at, say, noon", () => {
    assert.equal(resolveUntilTs(null, 123), null);
});

test("an explicit number overrides the configured one", () => {
    assert.equal(resolveUntilTs(50, 123), 50);
});
