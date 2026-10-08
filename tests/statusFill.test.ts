import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FillTemplateArgs } from "../src/lesson/excelFill.js";
import { clearFillFailed, fillStatusFiles, latestReportHhmm, readFillFailed, writeFillFailed, type StatusFillDeps } from "../src/lesson/statusFill.js";
import { trackerKey } from "../src/lesson/statusFileTracker.js";
import { buildFillSpecs } from "../src/lesson/statusReportLayout.js";
import { DAY, at } from "./fixtures.js";

const specs = buildFillSpecs([], DAY, at(9, 0));
const KEYS = ["netsupport", "loa", "internet", "mayTinh"] as const;
const titleOf = (templatePath: string, sheet: string) => `T:${path.basename(templatePath, ".xlsx")}:${sheet}`;
const LOA_TITLE = titleOf("C:\\mau\\01 - FORM TINH TRANG AM THANH.xlsx", "1209");

function harness(over: Partial<StatusFillDeps> = {}) {
    const calls: string[] = [];
    const removed: string[] = [];
    const warnings: string[] = [];
    const deps: StatusFillDeps = {
        templatesSrc: "C:\\mau",
        outDir: "C:\\out\\A",
        fill: (a: FillTemplateArgs) => (calls.push(a.name), ""),
        readTitle: titleOf,
        removeFile: (f) => void removed.push(f),
        log: () => undefined,
        warn: (m) => void warnings.push(m),
        ...over,
    };
    return { deps, calls, removed, warnings };
}
const input = (tracker: Record<string, string> = {}, keys: Array<(typeof KEYS)[number]> = [...KEYS]) => ({ setId: "A", day: DAY, buoi: "morningstart" as const, hhmm: "0907", keys, specs, tracker });

test("every key is filled, in the given order, and recorded in the tracker under the set's key", () => {
    const { deps, calls } = harness();
    const tracker: Record<string, string> = {};
    const r = fillStatusFiles(input(tracker), deps);
    assert.deepEqual(calls, ["netsupport", "loa", "internet", "mayTinh"]);
    assert.deepEqual(r.ok, ["netsupport", "loa", "internet", "mayTinh"]);
    assert.deepEqual(r.failed, []);
    assert.match(tracker[trackerKey("A", DAY, "morningstart", LOA_TITLE)], /_0907\.xlsx$/);
});

test("a key whose template title cannot be read (missing template) fails alone: the others after it still run", () => {
    const { deps, calls } = harness({
        readTitle: (p, s) => {
            if (p.includes("AM THANH")) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
            return titleOf(p, s);
        },
    });
    const r = fillStatusFiles(input(), deps);
    assert.deepEqual(r.ok, ["netsupport", "internet", "mayTinh"]);
    assert.deepEqual(r.failed.map((f) => f.key), ["loa"]);
    assert.match(r.failed[0].message, /ENOENT.*AM THANH/);
    assert.deepEqual(calls, ["netsupport", "internet", "mayTinh"]);
});

test("a failing fill keeps the old file and the old tracker entry, and drops the half-written new file", () => {
    const { deps, removed } = harness({ fill: (a) => { if (a.name === "loa") throw new Error("Access to the path is denied"); return ""; } });
    const tracker = { [trackerKey("A", DAY, "morningstart", LOA_TITLE)]: "OLD-LOA.xlsx" };
    const r = fillStatusFiles(input(tracker), deps);
    assert.deepEqual(r.failed.map((f) => f.key), ["loa"]);
    assert.equal(tracker[trackerKey("A", DAY, "morningstart", LOA_TITLE)], "OLD-LOA.xlsx");
    assert.ok(removed.some((f) => f.startsWith(path.join("C:\\out\\A", LOA_TITLE)) && f.endsWith("_0907.xlsx")), JSON.stringify(removed));
    assert.ok(!removed.some((f) => f.endsWith("OLD-LOA.xlsx")));
});

test("when removing the half-written file also fails (Excel holds it), the loop still goes on", () => {
    const { deps } = harness({
        fill: (a) => { if (a.name === "netsupport") throw new Error("denied"); return ""; },
        removeFile: () => { throw new Error("EBUSY"); },
    });
    const r = fillStatusFiles(input(), deps);
    assert.deepEqual(r.failed.map((f) => f.key), ["netsupport"]);
    assert.deepEqual(r.ok, ["loa", "internet", "mayTinh"]);
});

test("the old file of the same phase is removed AFTER the new one is written; failing to remove it is only a warning", () => {
    const { deps, warnings } = harness({ removeFile: () => { throw new Error("EBUSY"); } });
    const tracker = { [trackerKey("A", DAY, "morningstart", LOA_TITLE)]: "OLD-LOA.xlsx" };
    const r = fillStatusFiles(input(tracker), deps);
    assert.deepEqual(r.failed, []);
    assert.ok(warnings.some((w) => w.includes("OLD-LOA.xlsx") && w.includes("EBUSY")), JSON.stringify(warnings));
});

test("another set's tracker entry is never touched", () => {
    const { deps, removed } = harness();
    const tracker = { [trackerKey("B", DAY, "morningstart", LOA_TITLE)]: "B-LOA.xlsx" };
    fillStatusFiles(input(tracker), deps);
    assert.equal(tracker[trackerKey("B", DAY, "morningstart", LOA_TITLE)], "B-LOA.xlsx");
    assert.ok(!removed.some((f) => f.endsWith("B-LOA.xlsx")));
});

test("only the requested keys are filled (a retry of one failed report)", () => {
    const { deps, calls } = harness();
    const r = fillStatusFiles(input({}, ["mayTinh"]), deps);
    assert.deepEqual(calls, ["mayTinh"]);
    assert.deepEqual(r.ok, ["mayTinh"]);
});

test("the failed-keys file round-trips, reads null when absent or malformed, and can be cleared", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fill-failed-"));
    assert.equal(readFillFailed(dir), null);
    writeFillFailed(dir, ["loa", "mayTinh"]);
    assert.deepEqual(readFillFailed(dir), ["loa", "mayTinh"]);
    clearFillFailed(dir);
    assert.equal(readFillFailed(dir), null);
    fs.writeFileSync(path.join(dir, "fill-failed.json"), "{ nope", "utf8");
    assert.equal(readFillFailed(dir), null);
    clearFillFailed(path.join(dir, "does-not-exist"));
});

test("failedKeysOf: only keys that were actually attempted count; a missing or malformed file means every attempted key failed", async () => {
    const { failedKeysOf } = await import("../src/lesson/statusFill.js");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fill-failed-of-"));
    assert.deepEqual(failedKeysOf(dir, ["loa", "mayTinh"]), ["loa", "mayTinh"]); // the script died before writing anything
    writeFillFailed(dir, ["loa", "internet"]); // a stale file from an earlier run mentions a key we did not attempt now
    assert.deepEqual(failedKeysOf(dir, ["loa", "mayTinh"]), ["loa"]);
    fs.writeFileSync(path.join(dir, "fill-failed.json"), "{ nope", "utf8");
    assert.deepEqual(failedKeysOf(dir, ["loa"]), ["loa"]);
});

test("two phases built back to back in the SAME minute get different file names, so neither overwrites the other", () => {
    const { deps } = harness();
    const names: string[] = [];
    const record = (a: FillTemplateArgs) => (names.push(`${a.name}:${a.outName}`), "");
    const tracker: Record<string, string> = {};
    const base = input(tracker, ["loa"]);
    fillStatusFiles({ ...base, buoi: "morningstart" }, { ...deps, fill: record });
    fillStatusFiles({ ...base, buoi: "morningend" }, { ...deps, fill: record });
    fillStatusFiles({ ...base, buoi: "afternoonstart" }, { ...deps, fill: record });
    const files = names.map((n) => n.split(":").slice(1).join(":"));
    assert.equal(new Set(files).size, 3, JSON.stringify(files));
    assert.match(files[0], /_0907\.xlsx$/);
    assert.match(files[1], /_0908\.xlsx$/);
    assert.match(files[2], /_0909\.xlsx$/);
    assert.equal(Object.values(tracker).length, 3);
});

test("rebuilding the SAME phase in the same minute keeps its name (overwritten in place, nothing deleted)", () => {
    const { deps, removed } = harness();
    const tracker: Record<string, string> = {};
    const base = input(tracker, ["loa"]);
    fillStatusFiles({ ...base, buoi: "morningstart" }, deps);
    const first = tracker[trackerKey("A", DAY, "morningstart", LOA_TITLE)];
    fillStatusFiles({ ...base, buoi: "morningstart" }, deps);
    assert.equal(tracker[trackerKey("A", DAY, "morningstart", LOA_TITLE)], first);
    assert.deepEqual(removed, []);
});

// Tên file của một giai đoạn mang GIỜ CỦA BÁO CÁO MUỘN NHẤT trong giai đoạn đó (giờ Việt Nam), không phải giờ chạy.
test("latestReportHhmm: the file time is the latest report time of the phase, not the run time", () => {
    assert.equal(latestReportHhmm([{ thoiGian: at(7, 40) }, { thoiGian: at(8, 52) }, { thoiGian: at(8, 5) }], at(14, 30)), "0852");
    assert.equal(latestReportHhmm([{ thoiGian: at(11, 3) }], at(14, 30)), "1103");
});

test("latestReportHhmm: a phase with no report falls back to the run time", () => {
    assert.equal(latestReportHhmm([], at(14, 30)), "1430");
});
