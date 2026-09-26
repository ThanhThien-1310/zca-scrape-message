import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readOverrides } from "../src/lesson/overrides.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "overrides-"));
const write = (name: string, content: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content, "utf8");
    return file;
};

test("a missing file means no corrections", () => {
    assert.deepEqual(readOverrides(path.join(dir, "nope.json")), []);
});

test("a valid file is read, including one written with a BOM", () => {
    const body = JSON.stringify([{ key: { maNhom: "g1", maTinNhan: "m1" }, sua: { loi: 3 } }]);
    assert.deepEqual(readOverrides(write("ok.json", body)), [{ key: { maNhom: "g1", maTinNhan: "m1" }, sua: { loi: 3 } }]);
    assert.deepEqual(readOverrides(write("bom.json", `﻿${body}`)).length, 1);
});

test("invalid JSON is reported with the file name", () => {
    const file = write("bad.json", "{ not json");
    assert.throws(() => readOverrides(file), (e: Error) => e.message.includes("bad.json") && /not valid JSON/.test(e.message));
});

test("a wrong shape is reported with the entry index", () => {
    assert.throws(() => readOverrides(write("obj.json", "{}")), /must be a JSON array/);
    assert.throws(() => readOverrides(write("shape.json", JSON.stringify([{ key: { maNhom: "g1" }, sua: {} }]))), /entry 0/);
});
