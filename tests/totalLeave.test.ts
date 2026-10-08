import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveReportSets } from "../src/reportSets/resolve.js";
import { runTotalOnce, type TotalDeps } from "../src/total/runTotal.js";
import { slotsOfDay } from "../src/total/slots.js";
import { DAY, at } from "./fixtures.js";
import type { LeaveDay } from "../src/leave/buildDay.js";
import type { FillTemplateArgs } from "../src/lesson/excelFill.js";

const [morning] = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const SEVEN = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"];
const WITH = resolveReportSets([{ id: "A", reports: [...SEVEN, "leave"] }]).active[0];
const WITHOUT = resolveReportSets([{ id: "A", reports: SEVEN }]).active[0];
const fakeTitle = (templatePath: string, sheet: string): string => `T:${path.basename(templatePath, ".xlsx")}:${sheet}`;

const stub = (over: Partial<LeaveDay> = {}): LeaveDay => ({
    headerCells: [
        { ref: "F4", value: "08/10/2026", numberFormat: "@" },
        { ref: "E4", value: "Cả ngày" },
        { ref: "F6", value: "08/10/2026", numberFormat: "@" },
        { ref: "E6", value: "Cả ngày" },
    ],
    filled: [{ row: 4, name: "A", ngay: "08/10/2026", buoi: "Cả ngày" }, { row: 6, name: "B", ngay: "08/10/2026", buoi: "Cả ngày" }],
    unmatched: [],
    notes: ["ảnh mới thay kỳ nghỉ cũ"],
    pending: [],
    warnings: ["1 bộ ảnh nghỉ phép chưa đọc"],
    signature: "s",
    ...over,
});

function setup(over: Partial<TotalDeps> = {}, failName?: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "total-leave-"));
    const calls: FillTemplateArgs[] = [];
    const deps: TotalDeps = {
        loadMessages: async () => [],
        readOverrides: () => [],
        fill: (a) => {
            if (a.name === failName) throw new Error("Excel lỗi");
            calls.push(a);
            return "";
        },
        templateTitle: fakeTitle,
        templatesSrc: "C:\\mau",
        outDirFor: () => dir,
        trackerFile: path.join(dir, "tracker.json"),
        removeFile: () => undefined,
        ...over,
    };
    return { calls, deps };
}

test("a set with the leave code writes it as the 8th file, filled in place with the cells of that day", async () => {
    const { calls, deps } = setup({ leave: () => stub() });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.deepEqual(calls.map((c) => c.name), [...SEVEN.map((k) => `total-${k}`), "total-leave"]);
    const leave = calls[7];
    assert.equal(leave.layout.inPlace, true);
    assert.deepEqual(leave.rows, []);
    assert.deepEqual(leave.headerCells, stub().headerCells);
    assert.ok(leave.outName.startsWith("T:LICH NGHI PHEP KY THUAT:BAO CAO_"), leave.outName);
    assert.ok(leave.outName.endsWith("_0907-auto.xlsx"));
    assert.equal(result.counts.leave, 2);
    assert.deepEqual(result.failed, []);
    assert.equal(result.expected, 8);
    assert.deepEqual(result.written[7], { name: "leave", file: path.join(path.dirname(result.written[0].file), leave.outName), sheet: "BAO CAO", rows: 2 });
    assert.ok(result.warnings.includes("1 bộ ảnh nghỉ phép chưa đọc"));
    assert.ok(result.warnings.includes("ảnh mới thay kỳ nghỉ cũ"));
});

test("with no leave at all the file is still written, with no cells", async () => {
    const { calls, deps } = setup({ leave: () => stub({ headerCells: [], filled: [], notes: [], warnings: [] }) });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.equal(calls.length, 8);
    assert.deepEqual(calls[7].headerCells, []);
    assert.equal(result.counts.leave, 0);
});

test("a leave source that throws costs only a warning: the file is written empty and the other 7 are untouched", async () => {
    const { calls, deps } = setup({ leave: () => { throw new Error("thiếu file mẫu"); } });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.equal(calls.length, 8);
    assert.deepEqual(calls[7].headerCells, []);
    assert.deepEqual(result.failed, []);
    assert.ok(result.warnings.some((w) => /leave: thiếu file mẫu/.test(w)));
});

test("without a leave source the file is still written empty", async () => {
    const { calls, deps } = setup();
    await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.equal(calls.length, 8);
    assert.deepEqual(calls[7].headerCells, []);
});

test("a set without the leave code gets exactly the 7 files, even when a leave source exists", async () => {
    const { calls, deps } = setup({ leave: () => stub() });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITHOUT }, deps);
    assert.equal(calls.length, 7);
    assert.ok(!calls.some((c) => c.name === "total-leave"));
    assert.equal(result.counts.leave, undefined);
});

test("when the leave file itself fails to fill, it is the only failure", async () => {
    const { calls, deps } = setup({ leave: () => stub() }, "total-leave");
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.deepEqual(result.failed, ["leave"]);
    assert.equal(calls.length, 7);
    assert.equal(result.files.length, 7);
});
