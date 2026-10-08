import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStableRounds } from "../src/scrape/scrollStability.js";

test("progress resets the counter", () => {
    assert.equal(nextStableRounds(1200, 800, 2), 0);
});

test("an unchanged height counts as a stable round", () => {
    assert.equal(nextStableRounds(800, 800, 0), 1);
    assert.equal(nextStableRounds(800, 800, 2), 3);
});

test("a pane with no height (no messages rendered) counts as stable, so the loop ends", () => {
    let rounds = 0;
    for (let i = 0; i < 3; i++) rounds = nextStableRounds(null, -1, rounds);
    assert.equal(rounds, 3);
});
