import { test } from "node:test";
import assert from "node:assert/strict";
import { runQueuedScrape, type QueueRunDeps } from "../src/scrape/queueRun.js";
import type { CompleteResult, QueueSnapshot } from "../src/types/index.js";

function harness(initial: string[], scrape: QueueRunDeps["scrape"], result: CompleteResult = { retrying: [], gaveUp: [] }) {
    let queue = [...initial];
    const completed: { snapshot: QueueSnapshot; failed: string[] }[] = [];
    const logs: string[] = [];
    const deps: QueueRunDeps = {
        takeSnapshot: () => ({ targets: [...queue], mark: { day: queue.length } }),
        complete: (snapshot, failed) => {
            completed.push({ snapshot, failed });
            queue = queue.filter((t) => !snapshot.targets.includes(t) || failed.includes(t));
            return result;
        },
        scrape,
        log: (m) => logs.push(m),
    };
    return { deps, logs, completed, get queue() { return queue; }, push: (t: string) => queue.push(t) };
}

test("an empty queue exits without scraping", async () => {
    let called = false;
    const h = harness([], async () => {
        called = true;
        return [];
    });
    assert.deepEqual(await runQueuedScrape(h.deps), { status: "empty" });
    assert.equal(called, false);
    assert.equal(h.completed.length, 0);
    assert.ok(h.logs.some((l) => l.includes("hàng chờ rỗng")));
});

test("only the queued targets are scraped and then marked as scraped", async () => {
    let seen: string[] = [];
    const h = harness(["A", "B"], async (targets) => {
        seen = targets;
        return targets.map((target) => ({ target }));
    });
    const r = await runQueuedScrape(h.deps);
    assert.deepEqual(seen, ["A", "B"]);
    assert.deepEqual(r, { status: "done", targets: ["A", "B"], failed: [], gaveUp: [], outcomes: [{ target: "A" }, { target: "B" }] });
    assert.deepEqual(h.queue, []);
});

test("a target queued while the scrape runs survives the cleanup", async () => {
    const h = harness(["A"], async (targets) => {
        h.push("C");
        return targets.map((target) => ({ target }));
    });
    await runQueuedScrape(h.deps);
    assert.deepEqual(h.queue, ["C"]);
});

test("a failed target is reported to the queue, logged, and stays queued while it has attempts left", async () => {
    const h = harness(["A", "B"], async () => [{ target: "A", error: "sidebar item not found" }, { target: "B" }], { retrying: ["A"], gaveUp: [] });
    const r = await runQueuedScrape(h.deps);
    assert.deepEqual(r, { status: "done", targets: ["A", "B"], failed: ["A"], gaveUp: [], outcomes: [{ target: "A", error: "sidebar item not found" }, { target: "B" }] });
    assert.deepEqual(h.completed[0].failed, ["A"]);
    assert.deepEqual(h.queue, ["A"]);
    assert.ok(h.logs.some((l) => l.includes('"A"') && l.includes("lỗi") && l.includes("thử lại")));
});

test("a target whose attempts ran out is reported and logged loudly", async () => {
    const h = harness(["A"], async () => [{ target: "A", error: "sidebar item not found" }], { retrying: [], gaveUp: ["A"] });
    const r = await runQueuedScrape(h.deps);
    assert.deepEqual(r, { status: "done", targets: ["A"], failed: ["A"], gaveUp: ["A"], outcomes: [{ target: "A", error: "sidebar item not found" }] });
    assert.ok(h.logs.some((l) => l.includes('"A"') && l.includes("hết số lần thử") && l.includes("scrape:add")));
});

test("if the whole run cannot start nothing is marked and the error propagates", async () => {
    const h = harness(["A", "B"], async () => {
        throw new Error("CDP not reachable");
    });
    await assert.rejects(runQueuedScrape(h.deps), /CDP not reachable/);
    assert.equal(h.completed.length, 0);
    assert.deepEqual(h.queue, ["A", "B"]);
});

test("the snapshot taken before the scrape is what is handed back, so messages that arrive during the scrape can be told apart", async () => {
    const h = harness(["A"], async (targets) => {
        h.push("Z");
        return targets.map((target) => ({ target }));
    });
    await runQueuedScrape(h.deps);
    assert.deepEqual(h.completed[0].snapshot, { targets: ["A"], mark: { day: 1 } });
});
