import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enqueueTarget, readQueue, readQueueMeta, removeFromQueue } from "../history/scrapeQueue.js";

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

test("enqueue records when a group was queued, and re-queuing does not move that time", () => {
    const file = fresh();
    enqueueTarget("A", file, 1000);
    enqueueTarget("B", file, 2000);
    enqueueTarget("A", file, 3000);
    assert.deepEqual(readQueueMeta(file), { A: 1000, B: 2000 });
});

test("removeFromQueue forgets the times of the handled groups only", () => {
    const file = fresh();
    enqueueTarget("A", file, 1000);
    enqueueTarget("B", file, 2000);
    removeFromQueue(["A"], file);
    assert.deepEqual(readQueueMeta(file), { B: 2000 });
});

test("a missing or corrupt meta file reads as empty", () => {
    const file = fresh();
    assert.deepEqual(readQueueMeta(file), {});
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const content of ["{ nope", "[]", '"x"', '{"A": "soon", "B": 5}']) {
        fs.writeFileSync(file.replace(/.json$/, "-meta.json"), content, "utf8");
        assert.deepEqual(readQueueMeta(file), content.includes('"B": 5') ? { B: 5 } : {}, content);
    }
});
