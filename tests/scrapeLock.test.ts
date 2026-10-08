import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireScrapeLock, releaseScrapeLock } from "../src/core/scrapeLock.js";

const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lock-")), "data", ".scrape.lock");
const alive = () => true;
const dead = () => false;

test("a free lock is acquired and released", () => {
    const file = fresh();
    assert.deepEqual(acquireScrapeLock("bot:runner", 100, file, alive, 5), { ok: true });
    assert.equal(fs.existsSync(file), true);
    releaseScrapeLock(100, file);
    assert.equal(fs.existsSync(file), false);
});

test("a lock held by a live process refuses others and says who holds it", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    assert.deepEqual(acquireScrapeLock("bot:scrape", 200, file, alive, 6), { ok: false, heldBy: { pid: 100, owner: "bot:runner", at: 5 } });
});

test("a lock left by a dead process is taken over", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    assert.deepEqual(acquireScrapeLock("bot:scrape", 200, file, dead, 6), { ok: true });
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).pid, 200);
});

test("the holder can re-acquire its own lock", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    assert.deepEqual(acquireScrapeLock("bot:runner", 100, file, alive, 6), { ok: true });
});

test("only the holder can release; anyone else leaves it alone", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    releaseScrapeLock(200, file);
    assert.equal(fs.existsSync(file), true);
    releaseScrapeLock(100, file);
    assert.equal(fs.existsSync(file), false);
});

test("a corrupt lock file is treated as stale", () => {
    const file = fresh();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.deepEqual(acquireScrapeLock("bot:scrape", 200, file, alive, 6), { ok: true });
});
