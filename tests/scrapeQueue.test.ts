import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enqueueTarget, readQueue, removeFromQueue } from "../history/scrapeQueue.js";

const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "queue-")), "data", ".scrape-queue.json");

test("a missing file is an empty queue", () => {
    assert.deepEqual(readQueue(fresh()), []);
});

test("enqueue creates the file (and its folder), dedupes, and reports whether it added", () => {
    const file = fresh();
    assert.equal(enqueueTarget("A", file), true);
    assert.equal(enqueueTarget("B", file), true);
    assert.equal(enqueueTarget("A", file), false);
    assert.deepEqual(readQueue(file), ["A", "B"]);
    assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("removeFromQueue drops only the handled targets and keeps the ones added meanwhile", () => {
    const file = fresh();
    enqueueTarget("A", file);
    enqueueTarget("B", file);
    const snapshot = readQueue(file);
    enqueueTarget("C", file); // arrives while the scrape of A and B is running
    removeFromQueue(snapshot, file);
    assert.deepEqual(readQueue(file), ["C"]);
});

test("a corrupt or wrongly shaped file reads as an empty queue instead of throwing", () => {
    const file = fresh();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const content of ["{ not json", "{}", '"A"', '["A", 3, null]', ""]) {
        fs.writeFileSync(file, content, "utf8");
        assert.deepEqual(readQueue(file), content === '["A", 3, null]' ? ["A"] : [], content);
    }
});

test("removing from a missing queue is a no-op", () => {
    const file = fresh();
    removeFromQueue(["A"], file);
    assert.deepEqual(readQueue(file), []);
});
