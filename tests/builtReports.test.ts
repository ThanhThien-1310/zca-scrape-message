import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dirtySessions, loadBuiltBySet, readBuiltRaw, reportKeys, sessionReportKeys, writeBuiltBySet } from "../src/runner/builtReports.js";
import { messageKey } from "../src/lesson/recovery.js";
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
    const a = msg(COMPLETE, at(8)); // DauBuoi, 8:00 -> morningstart (no reroute)
    const b = msg(IT_MAINTENANCE, at(13)); // CuoiBuoi, 13:00 -> afternoonstart
    assert.deepEqual(sessionReportKeys([a, b], { day: DAY, buoi: "afternoonstart" }), [messageKey(b)]);
});

test("built state round-trips per set; a missing file or a corrupt one reads as null", () => {
    const file = fresh();
    assert.equal(readBuiltRaw(file), null);
    writeBuiltBySet(new Map([["B", new Set(["g|2", "g|1"])], ["A", new Set(["g|3"])]]), file);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { A: ["g|3"], B: ["g|1", "g|2"] });
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.equal(readBuiltRaw(file), null);
});

test("the first start (no file) counts the reports that already exist as built, for every set", () => {
    const a = msg(COMPLETE, at(9));
    const { built, changed } = loadBuiltBySet(null, ["A", "B"], [a]);
    assert.equal(changed, true);
    assert.deepEqual([...built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...built.get("B")!], [messageKey(a)]);
});

test("the old format (one array) is handed to every current set, so nothing is rebuilt", () => {
    const a = msg(COMPLETE, at(8));
    const b = msg(IT_MAINTENANCE, at(13));
    const { built, changed } = loadBuiltBySet([messageKey(a), 7, null], ["A", "B"], [a, b]);
    assert.equal(changed, true);
    assert.deepEqual([...built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...built.get("B")!], [messageKey(a)]);
    assert.deepEqual(dirtySessions([a, b], built.get("A")!), [{ day: DAY, buoi: "afternoonstart" }]);
});

test("with no active set the old array is not consumed (nothing would be kept)", () => {
    const a = msg(COMPLETE, at(8));
    const { built, changed } = loadBuiltBySet([messageKey(a)], [], [a]);
    assert.equal(changed, false);
    assert.equal(built.size, 0);
});

test("a set added later gets a baseline of the reports that exist now; the others keep their state", () => {
    const a = msg(COMPLETE, at(8));
    const b = msg(IT_MAINTENANCE, at(13));
    const { built, changed } = loadBuiltBySet({ A: [messageKey(a)] }, ["A", "New"], [a, b]);
    assert.equal(changed, true);
    assert.deepEqual([...built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...built.get("New")!].sort(), [messageKey(a), messageKey(b)].sort());
});

test("known state is returned unchanged; a set that is no longer in config keeps its keys so it can come back", () => {
    const a = msg(COMPLETE, at(8));
    const { built, changed } = loadBuiltBySet({ A: [messageKey(a)], Old: ["x|1"] }, ["A"], [a]);
    assert.equal(changed, false);
    assert.deepEqual([...built.get("Old")!], ["x|1"]);
});

test("dirty sessions are the sessions with a report that is not built yet", () => {
    const a = msg(COMPLETE, at(8)); // morningstart
    const b = msg(IT_MAINTENANCE, at(13)); // afternoonstart
    assert.deepEqual(dirtySessions([a, b], new Set([messageKey(a)])), [{ day: DAY, buoi: "afternoonstart" }]);
    assert.deepEqual(dirtySessions([a, b], new Set([messageKey(a), messageKey(b)])), []);
});
