import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dirtySessions, initBuiltBaseline, readBuilt, reportKeys, sessionReportKeys, writeBuilt } from "../runner/builtReports.js";
import { messageKey } from "../lesson/recovery.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg, SPECIALIST } from "./fixtures.js";

const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "built-")), "data", ".runner-built.json");

test("reportKeys lists only start/end-of-lesson reports", () => {
    const a = msg(COMPLETE, at(9));
    const b = msg(IT_MAINTENANCE, at(13));
    const chat = msg("ok em nhé", at(9, 5));
    const other = msg(SPECIALIST, at(9, 6));
    assert.deepEqual([...reportKeys([a, b, chat, other])].sort(), [messageKey(a), messageKey(b)].sort());
});

test("sessionReportKeys keeps only the reports of that session", () => {
    const a = msg(COMPLETE, at(9));
    const b = msg(IT_MAINTENANCE, at(13));
    assert.deepEqual(sessionReportKeys([a, b], { day: DAY, buoi: "chieu" }), [messageKey(b)]);
});

test("built keys round-trip; a missing file reads as null and a corrupt one as null", () => {
    const file = fresh();
    assert.equal(readBuilt(file), null);
    writeBuilt(new Set(["g|1", "g|2"]), file);
    assert.deepEqual([...readBuilt(file)!].sort(), ["g|1", "g|2"]);
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.equal(readBuilt(file), null);
    fs.writeFileSync(file, JSON.stringify(["g|1", 3, null]), "utf8");
    assert.deepEqual([...readBuilt(file)!], ["g|1"]);
});

test("the first start treats the reports that already exist as built, and later starts keep the file as it is", () => {
    const file = fresh();
    const a = msg(COMPLETE, at(9));
    assert.equal(initBuiltBaseline([a], file), true);
    assert.deepEqual([...readBuilt(file)!], [messageKey(a)]);
    const b = msg(IT_MAINTENANCE, at(13));
    assert.equal(initBuiltBaseline([a, b], file), false);
    assert.deepEqual([...readBuilt(file)!], [messageKey(a)]);
});

test("dirty sessions are the sessions with a report that is not built yet", () => {
    const a = msg(COMPLETE, at(9));
    const b = msg(IT_MAINTENANCE, at(13));
    assert.deepEqual(dirtySessions([a, b], new Set([messageKey(a)])), [{ day: DAY, buoi: "chieu" }]);
    assert.deepEqual(dirtySessions([a, b], new Set([messageKey(a), messageKey(b)])), []);
});
