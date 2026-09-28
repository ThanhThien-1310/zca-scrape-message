import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    compactQueue,
    completeSnapshot,
    enqueueTarget,
    importLegacyQueue,
    readQueue,
    readQueueMeta,
    readQueueSeen,
    segmentPath,
    takeSnapshot,
} from "../src/scrape/scrapeQueue.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "queue-")), "data", ".scrape-events.jsonl");
/** Epoch ms of hour:minute on 2026-09-24 in Vietnam (UTC+7). */
const at = (hour: number, minute = 0, day = 24): number => Date.UTC(2026, 8, day, hour - 7, minute);
const done = (file: string, snapshot = takeSnapshot(file), failed: string[] = [], now = at(12)) =>
    completeSnapshot(snapshot, { failed, file, now, maxAttempts: 3 });

test("a missing file is an empty queue", () => {
    assert.deepEqual(readQueue(fresh()), []);
    assert.deepEqual(takeSnapshot(fresh()).targets, []);
});

test("enqueue creates the file (and its folder), dedupes, and reports whether it added", () => {
    const file = fresh();
    assert.equal(enqueueTarget("A", file, at(9)), true);
    assert.equal(enqueueTarget("B", file, at(9, 1)), true);
    assert.equal(enqueueTarget("A", file, at(9, 2)), false);
    assert.deepEqual(readQueue(file), ["A", "B"]);
});

test("events go to a file named after the Vietnam day of the message", () => {
    const file = fresh();
    enqueueTarget("A", file, at(23, 30));
    enqueueTarget("A", file, at(0, 30, 25)); // 00:30 the next day in Vietnam, still 17:30 UTC of the 24th
    assert.equal(fs.existsSync(segmentPath(file, at(9))), true);
    assert.equal(fs.existsSync(segmentPath(file, at(9, 0, 25))), true);
    assert.match(path.basename(segmentPath(file, at(9))), /^\.scrape-events-2026-09-24\.jsonl$/);
});

test("a group queued while another is being scraped stays queued when the scrape is completed", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    enqueueTarget("B", file, at(9, 1));
    enqueueTarget("C", file, at(9, 2));
    const snapshot = takeSnapshot(file);
    assert.deepEqual(snapshot.targets, ["A", "B", "C"]);
    enqueueTarget("D", file, at(9, 3)); // arrives while A is being scraped
    done(file, snapshot);
    assert.deepEqual(readQueue(file), ["D"]);
});

test("a message for a group that was just scraped keeps it queued, counted as queued at that message", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    const snapshot = takeSnapshot(file);
    assert.equal(enqueueTarget("A", file, at(9, 5)), false); // still pending when it arrives
    done(file, snapshot);
    assert.deepEqual(readQueue(file), ["A"]);
    assert.deepEqual(readQueueMeta(file), { A: at(9, 5) });
    done(file); // a later scrape did see it
    assert.deepEqual(readQueue(file), []);
});

test("a message that arrived before the snapshot does not keep the group queued", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    enqueueTarget("A", file, at(9, 1));
    done(file);
    assert.deepEqual(readQueue(file), []);
});

test("meta is when a group was first queued and seen is its latest message", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    enqueueTarget("B", file, at(9, 1));
    enqueueTarget("A", file, at(9, 5));
    assert.deepEqual(readQueueMeta(file), { A: at(9), B: at(9, 1) });
    assert.deepEqual(readQueueSeen(file), { A: at(9, 5), B: at(9, 1) });
});

test("corrupt lines are skipped and a half-written last line is neither read nor counted as handled", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    const seg = segmentPath(file, at(9));
    fs.appendFileSync(seg, 'not json\n{"t":3,"at":"x"}\n{"t":"B","at":' + at(9, 1) + "}\n");
    fs.appendFileSync(seg, '{"t":"C","at":' + at(9, 2)); // no newline yet
    assert.deepEqual(readQueue(file), ["A", "B"]);
    const snapshot = takeSnapshot(file);
    fs.appendFileSync(seg, "}\n"); // the writer finishes the line after the snapshot
    done(file, snapshot);
    assert.deepEqual(readQueue(file), ["C"]);
});

test("a queued group survives midnight and is covered by a snapshot of both days", () => {
    const file = fresh();
    enqueueTarget("A", file, at(23, 50));
    enqueueTarget("B", file, at(0, 10, 25));
    const snapshot = takeSnapshot(file);
    assert.deepEqual(snapshot.targets, ["A", "B"]);
    enqueueTarget("C", file, at(0, 20, 25));
    done(file, snapshot, [], at(0, 30, 25));
    assert.deepEqual(readQueue(file), ["C"]);
});

test("a failed group stays queued, counted as queued when it failed, and is dropped after the third failure", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    enqueueTarget("B", file, at(9, 1));

    const r1 = done(file, takeSnapshot(file), ["A"], at(10));
    assert.deepEqual(r1, { retrying: ["A"], gaveUp: [] });
    assert.deepEqual(readQueue(file), ["A"]); // B was scraped
    assert.deepEqual(readQueueMeta(file), { A: at(10) });
    assert.deepEqual(readQueueSeen(file), { A: at(10) });

    const r2 = done(file, takeSnapshot(file), ["A"], at(10, 5));
    assert.deepEqual(r2, { retrying: ["A"], gaveUp: [] });
    assert.deepEqual(readQueue(file), ["A"]);

    const r3 = done(file, takeSnapshot(file), ["A"], at(10, 10));
    assert.deepEqual(r3, { retrying: [], gaveUp: ["A"] });
    assert.deepEqual(readQueue(file), []);
});

test("a success clears the failure count", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    done(file, takeSnapshot(file), ["A"], at(10));
    done(file, takeSnapshot(file), [], at(10, 5)); // scraped fine
    enqueueTarget("A", file, at(11));
    assert.deepEqual(done(file, takeSnapshot(file), ["A"], at(11, 5)), { retrying: ["A"], gaveUp: [] }); // counts from 1 again
});

test("a new message for a group whose scrape failed keeps it queued from that message on", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    done(file, takeSnapshot(file), ["A"], at(10));
    enqueueTarget("A", file, at(10, 30));
    assert.deepEqual(readQueueSeen(file), { A: at(10, 30) });
});

test("a view sees lines appended by another process and a file that was replaced", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9));
    assert.deepEqual(readQueue(file), ["A"]);
    fs.appendFileSync(segmentPath(file, at(9)), JSON.stringify({ t: "B", at: at(9, 1) }) + "\n");
    assert.deepEqual(readQueue(file), ["A", "B"]);
    fs.writeFileSync(segmentPath(file, at(9)), JSON.stringify({ t: "Z", at: at(9, 2) }) + "\n"); // shorter file
    assert.deepEqual(readQueue(file), ["Z"]);
});

test("compaction drops old day files and the handled records that only mention them", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9, 0, 20));
    done(file, takeSnapshot(file), [], at(10, 0, 20));
    enqueueTarget("B", file, at(9, 0, 24));
    compactQueue(file, at(12, 0, 24), 3);
    assert.equal(fs.existsSync(segmentPath(file, at(9, 0, 20))), false);
    assert.equal(fs.existsSync(segmentPath(file, at(9, 0, 24))), true);
    assert.deepEqual(readQueue(file), ["B"]);
    const handled = fs.readFileSync(file.replace(/\.jsonl$/, ".handled.jsonl"), "utf8").trim();
    assert.equal(handled, "");
});

test("compaction keeps a queued group of a recent day", () => {
    const file = fresh();
    enqueueTarget("A", file, at(9, 0, 23));
    compactQueue(file, at(12, 0, 24), 3);
    assert.deepEqual(readQueue(file), ["A"]);
});

test("how many days of event files are kept is a parameter", () => {
    for (const [keepDays, expected] of [[1, ["C"]], [2, ["B", "C"]], [7, ["A", "B", "C"]]] as const) {
        const file = fresh();
        enqueueTarget("A", file, at(9, 0, 20));
        enqueueTarget("B", file, at(9, 0, 22));
        enqueueTarget("C", file, at(9, 0, 24));
        compactQueue(file, at(12, 0, 24), keepDays);
        assert.deepEqual(readQueue(file), [...expected], `keepDays ${keepDays}`);
    }
});

test("the old queue file is imported once and renamed", () => {
    const file = fresh();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const legacy = path.join(path.dirname(file), ".scrape-queue.json");
    fs.writeFileSync(legacy, '["A", "B"]', "utf8");
    fs.writeFileSync(path.join(path.dirname(file), ".scrape-queue-meta.json"), '{"A": 1000}', "utf8");
    assert.equal(importLegacyQueue(file, legacy, at(9)), 2);
    assert.deepEqual(readQueue(file), ["A", "B"]);
    assert.equal(fs.existsSync(legacy), false);
    assert.equal(fs.existsSync(`${legacy}.migrated`), true);
    assert.equal(importLegacyQueue(file, legacy, at(9, 1)), 0);
    assert.deepEqual(readQueue(file), ["A", "B"]);
});

test("no group is lost when another process queues groups while this one keeps completing snapshots", async () => {
    const groups = 100;
    for (let trial = 0; trial < 3; trial++) {
        const file = fresh();
        const producer = spawn(process.execPath, ["--import", "tsx", path.join(here, "helpers", "queueProducer.ts"), file, String(groups)], { stdio: "inherit" });
        let finished = false;
        producer.on("close", () => (finished = true));
        const handled = new Set<string>();
        const drain = () => {
            const snapshot = takeSnapshot(file);
            for (const t of snapshot.targets) handled.add(t);
            completeSnapshot(snapshot, { failed: [], file, now: Date.now(), maxAttempts: 3 });
        };
        while (!finished) {
            drain();
            await new Promise((r) => setTimeout(r, 1));
        }
        drain();
        assert.equal(handled.size, groups, `trial ${trial}: ${groups - handled.size} group(s) were lost`);
    }
});
