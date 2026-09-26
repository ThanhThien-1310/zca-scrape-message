import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { swallow, writeFileAtomic, type AtomicFs } from "../src/core/atomicWrite.js";

const code = (c: string) => Object.assign(new Error(`${c}: simulated`), { code: c });

/** A fake filesystem whose rename fails with `failures` in order before it succeeds (or forever when `always`). */
function fakeFs(failures: string[], always?: string) {
    const calls: string[] = [];
    let n = 0;
    const io: AtomicFs = {
        mkdirSync: () => undefined,
        writeFileSync: (f) => void calls.push(`write:${path.basename(String(f))}`),
        renameSync: () => {
            calls.push("rename");
            const c = always ?? failures[n++];
            if (c) throw code(c);
        },
        rmSync: (f) => void calls.push(`rm:${path.basename(String(f))}`),
    };
    return { io, calls };
}

test("a rename that succeeds first time does not sleep or retry", () => {
    const f = fakeFs([]);
    const sleeps: number[] = [];
    writeFileAtomic("C:/x/.watch-state.json", "{}", { io: f.io, sleep: (ms) => sleeps.push(ms) });
    assert.deepEqual(sleeps, []);
    assert.equal(f.calls.filter((c) => c === "rename").length, 1);
});

test("EPERM (another process has the target open) is retried until the rename goes through", () => {
    const f = fakeFs(["EPERM", "EBUSY", "EACCES"]);
    const sleeps: number[] = [];
    writeFileAtomic("C:/x/.watch-state.json", "{}", { io: f.io, sleep: (ms) => sleeps.push(ms), sleepMs: 7 });
    assert.equal(f.calls.filter((c) => c === "rename").length, 4);
    assert.deepEqual(sleeps, [7, 7, 7]);
    assert.equal(f.calls.some((c) => c.startsWith("rm:")), false); // nothing left over to clean
});

test("when the rename never succeeds it gives up after the attempts, throws the last error and removes its temp file", () => {
    const f = fakeFs([], "EPERM");
    assert.throws(() => writeFileAtomic("C:/x/.watch-state.json", "{}", { io: f.io, sleep: () => undefined, attempts: 5 }), /EPERM/);
    assert.equal(f.calls.filter((c) => c === "rename").length, 5);
    assert.ok(f.calls.some((c) => c.startsWith("rm:.watch-state.json.")));
});

test("an error that is not a sharing problem (for example ENOENT) is thrown at once, without sleeping", () => {
    const f = fakeFs([], "ENOENT");
    const sleeps: number[] = [];
    assert.throws(() => writeFileAtomic("C:/x/f.json", "{}", { io: f.io, sleep: (ms) => sleeps.push(ms) }), /ENOENT/);
    assert.deepEqual(sleeps, []);
    assert.equal(f.calls.filter((c) => c === "rename").length, 1);
});

test("the temp file name is unique per process, so two processes never write the same temp file", () => {
    const f = fakeFs([]);
    writeFileAtomic("C:/x/.chat-sent.json", "[]", { io: f.io, sleep: () => undefined });
    assert.ok(f.calls.some((c) => c === `write:.chat-sent.json.${process.pid}.tmp`), f.calls.join(","));
});

test("with the real filesystem it writes the content, replaces an existing file and leaves no temp file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-"));
    const file = path.join(dir, "data", "state.json");
    writeFileAtomic(file, "one");
    writeFileAtomic(file, "two");
    assert.equal(fs.readFileSync(file, "utf8"), "two");
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ["state.json"]);
});

test("swallow runs the function and reports true; when it throws it warns, does not rethrow and reports false", () => {
    const warnings: string[] = [];
    assert.equal(swallow("heartbeat", () => undefined, (m) => warnings.push(m)), true);
    assert.equal(
        swallow("heartbeat", () => {
            throw code("EPERM");
        }, (m) => warnings.push(m)),
        false,
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /heartbeat.*EPERM/);
});
