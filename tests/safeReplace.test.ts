import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeReplace, type FsLike } from "../runner/safeReplace.js";

const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), "replace-"));
const write = (file: string, text: string) => fs.writeFileSync(file, text, "utf8");
const read = (file: string) => fs.readFileSync(file, "utf8");

test("the produced file replaces the target and leaves no temp or _moi file", async () => {
    const dir = fresh();
    const target = path.join(dir, "baocaobuoisang_250926.xlsm");
    write(target, "old");
    write(path.join(dir, "baocaobuoisang_250926_moi.xlsm"), "leftover");
    const r = await safeReplace(target, (tmp) => write(tmp, "new"));
    assert.deepEqual(r, { status: "replaced", path: target });
    assert.equal(read(target), "new");
    assert.deepEqual(fs.readdirSync(dir), ["baocaobuoisang_250926.xlsm"]);
});

test("a locked target gets the result as _moi and keeps the old file intact", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    write(target, "old");
    const locked: FsLike = {
        existsSync: fs.existsSync,
        rmSync: fs.rmSync,
        renameSync: (from, to) => {
            if (to === target) throw Object.assign(new Error("resource busy"), { code: "EBUSY" });
            fs.renameSync(from, to);
        },
    };
    const r = await safeReplace(target, (tmp) => write(tmp, "new"), locked);
    assert.equal(r.status, "fallback");
    assert.equal(r.path, path.join(dir, "b_moi.xlsm"));
    assert.equal(read(target), "old");
    assert.equal(read(path.join(dir, "b_moi.xlsm")), "new");
    assert.deepEqual(fs.readdirSync(dir).sort(), ["b.xlsm", "b_moi.xlsm"]);
});

test("when producing fails the old file stays and no temp file is left", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    write(target, "old");
    await assert.rejects(
        safeReplace(target, (tmp) => {
            write(tmp, "half");
            throw new Error("Excel crashed");
        }),
        /Excel crashed/,
    );
    assert.equal(read(target), "old");
    assert.deepEqual(fs.readdirSync(dir), ["b.xlsm"]);
});

test("producing nothing (no rows to report) changes nothing", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    write(target, "old");
    assert.deepEqual(await safeReplace(target, () => undefined), { status: "nothing", path: null });
    assert.equal(read(target), "old");
});

test("an unrelated rename error is not swallowed and cleans up the temp file", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    const broken: FsLike = {
        existsSync: fs.existsSync,
        rmSync: fs.rmSync,
        renameSync: () => {
            throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        },
    };
    await assert.rejects(safeReplace(target, (tmp) => write(tmp, "new"), broken), /disk full/);
    assert.deepEqual(fs.readdirSync(dir), []);
});
