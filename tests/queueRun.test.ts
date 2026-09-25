import { test } from "node:test";
import assert from "node:assert/strict";
import { runQueuedScrape, type QueueRunDeps } from "../history/queueRun.js";

function harness(initial: string[], scrape: QueueRunDeps["scrape"]) {
    let queue = [...initial];
    const logs: string[] = [];
    const deps: QueueRunDeps = {
        readQueue: () => [...queue],
        removeFromQueue: (handled) => {
            queue = queue.filter((t) => !handled.includes(t));
        },
        scrape,
        log: (m) => logs.push(m),
    };
    return { deps, logs, get queue() { return queue; }, push: (t: string) => queue.push(t) };
}

test("an empty queue exits without scraping", async () => {
    let called = false;
    const h = harness([], async () => {
        called = true;
        return [];
    });
    assert.deepEqual(await runQueuedScrape(h.deps), { status: "empty" });
    assert.equal(called, false);
    assert.ok(h.logs.some((l) => l.includes("hàng chờ rỗng")));
});

test("only the queued targets are scraped and then removed", async () => {
    let seen: string[] = [];
    const h = harness(["A", "B"], async (targets) => {
        seen = targets;
        return targets.map((target) => ({ target }));
    });
    const r = await runQueuedScrape(h.deps);
    assert.deepEqual(seen, ["A", "B"]);
    assert.deepEqual(r, { status: "done", targets: ["A", "B"], failed: [] });
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

test("a failed target is still removed, reported and logged", async () => {
    const h = harness(["A", "B"], async () => [{ target: "A", error: "sidebar item not found" }, { target: "B" }]);
    const r = await runQueuedScrape(h.deps);
    assert.deepEqual(r, { status: "done", targets: ["A", "B"], failed: ["A"] });
    assert.deepEqual(h.queue, []);
    assert.ok(h.logs.some((l) => l.includes('"A"') && l.includes("lỗi")));
});

test("if the whole run cannot start nothing is removed and the error propagates", async () => {
    const h = harness(["A", "B"], async () => {
        throw new Error("CDP not reachable");
    });
    await assert.rejects(runQueuedScrape(h.deps), /CDP not reachable/);
    assert.deepEqual(h.queue, ["A", "B"]);
});
