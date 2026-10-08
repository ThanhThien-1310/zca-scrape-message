import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recordAfterCrash, recordAfterRun, shouldPrintAfterRun, withPrinted, type SlotRecord } from "../src/total/decide.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";
import { runTotalOnce, type TotalDeps } from "../src/total/runTotal.js";
import { autoFileName, slotsOfDay } from "../src/total/slots.js";
import { readSlots, writeSlots } from "../src/total/totalState.js";
import { COMPLETE, DAY, at, msg } from "./fixtures.js";

const SET = resolveReportSets([{ id: "A", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] }]).active[0];
const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: 1, lastRunAt: 2, complete: true, final: true, pending: [], files: ["a.xlsx"], warnings: [], failures: 0, ...over });

test("shouldPrintAfterRun: only the first SUCCESSFUL export of a slot, once, and only when printing is on", () => {
    const ok = { files: ["a.xlsx"] };
    assert.equal(shouldPrintAfterRun(undefined, ok, true), true);
    assert.equal(shouldPrintAfterRun(undefined, ok, false), false);
    assert.equal(shouldPrintAfterRun(undefined, { files: [] }, true), false); // không ghi được file nào thì không có gì để in
    assert.equal(shouldPrintAfterRun(record({ files: ["old.xlsx"] }), ok, true), false); // đã có lần xuất trước: xuất lại không in
    assert.equal(shouldPrintAfterRun(record({ files: [] }), ok, true), true); // lần xuất trước chưa ghi được file nào: đây mới là lần đầu thành công
    assert.equal(shouldPrintAfterRun(record({ files: [], printedAt: 5, printed: [] }), ok, true), false); // đã in rồi thì không in lại
});

test("withPrinted stamps the print time and the files sent, and appends the print warnings", () => {
    const printed = withPrinted(record({ warnings: ["w"] }), { sent: ["a.xlsx", "b.xlsx"], warnings: ["loa: chỉ in 5/8 trang đầu"] }, 7000);
    assert.equal(printed.printedAt, 7000);
    assert.deepEqual(printed.printed, ["a.xlsx", "b.xlsx"]);
    assert.deepEqual(printed.warnings, ["w", "loa: chỉ in 5/8 trang đầu"]);
});

test("a later recordAfterRun / recordAfterCrash keeps the print stamp, so a refresh never forgets it was printed", () => {
    const printed = record({ printedAt: 7000, printed: ["a.xlsx"] });
    const flags = { complete: true, final: true, pending: [] };
    const after = recordAfterRun(printed, flags, { files: ["a.xlsx"], failed: [], warnings: [] }, 8000);
    assert.equal(after.printedAt, 7000);
    assert.deepEqual(after.printed, ["a.xlsx"]);
    assert.equal(recordAfterCrash(printed, 9000, "x").printedAt, 7000);
    assert.equal(recordAfterRun(undefined, flags, { files: [], failed: [], warnings: [] }, 1).printedAt, undefined);
});

test("the print stamp (printedAt, printed) round-trips through the slots file, and a malformed one drops the entry", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "total-print-")), "slots.json");
    writeSlots({ "2026-10-03|morning": record({ printedAt: 5000, printed: ["a.xlsx"] }) }, file);
    assert.deepEqual(readSlots(file)["2026-10-03|morning"].printed, ["a.xlsx"]);
    assert.equal(readSlots(file)["2026-10-03|morning"].printedAt, 5000);
    fs.writeFileSync(file, JSON.stringify({ "2026-10-03|morning": { ...record(), printedAt: "x" }, "2026-10-03|afternoon": { ...record(), printed: [1] }, "2026-10-02|afternoon": record() }));
    assert.deepEqual(Object.keys(readSlots(file)), ["2026-10-02|afternoon"]);
});

test("runTotalOnce result.written lists the files really written, with full path, sheet and row count (the print step reads it)", async () => {
    const [morning] = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "total-written-"));
    const title = (p: string, sheet: string): string => `T:${path.basename(p, ".xlsx")}:${sheet}`;
    const deps: TotalDeps = {
        loadMessages: async () => [msg(COMPLETE, at(7, 0))],
        readOverrides: () => [],
        fill: (a) => {
            if (a.name === "total-mayTinh") throw new Error("Excel đang mở file");
            return "";
        },
        templateTitle: title,
        templatesSrc: "C:\\mau",
        outDirFor: () => dir,
        trackerFile: path.join(dir, "tracker.json"),
        removeFile: () => undefined,
    };
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(result.written.map((w) => w.name), ["netsupport", "loa", "internet", "dien", "cleaning", "attendance"]); // mayTinh lỗi nên không có
    const loa = result.written.find((w) => w.name === "loa")!;
    assert.equal(loa.file, path.join(dir, autoFileName(title("01 - FORM TINH TRANG AM THANH.xlsx", "1209"), DAY, "0907")));
    assert.equal(loa.sheet, "1209");
    assert.equal(loa.rows, 1);
    assert.equal(result.written.find((w) => w.name === "dien")!.rows, 0);
    assert.equal(result.written.find((w) => w.name === "cleaning")!.sheet, "HANG NGAY");
});
