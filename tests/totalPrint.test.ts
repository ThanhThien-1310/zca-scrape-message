import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { printTotalFiles, type PrintJob, type PrintOutcome } from "../src/total/printFiles.js";
import type { TotalRunResult } from "../src/total/runTotal.js";

const written = (name: string, rows: number, sheet = "S"): TotalRunResult["written"][number] => ({ name, file: `C:\\out\\${name}-auto.xlsx`, sheet, rows });
const result = (items: TotalRunResult["written"]): TotalRunResult => ({ slot: "morning", day: "2026-10-03", files: items.map((i) => `${i.name}-auto.xlsx`), counts: {}, failed: [], warnings: [], written: items });

function setup(run: (job: PrintJob, maxPages: number) => PrintOutcome) {
    const calls: Array<{ job: PrintJob; maxPages: number }> = [];
    const beats: number[] = [];
    const deps = { maxPages: 5, run: (job: PrintJob, maxPages: number) => (calls.push({ job, maxPages }), run(job, maxPages)), onProgress: () => void beats.push(1) };
    return { calls, beats, deps };
}
const PRINTER = "\\\\srv\\Brother on Ne03:";
const sentOk = (pages: number, printed = pages): PrintOutcome => ({ pages, printed, printer: PRINTER, sent: true });

test("every written file is printed, including those with no data rows, one job per file, on the main sheet of each file", () => {
    const { calls, deps } = setup(() => sentOk(1));
    const summary = printTotalFiles(result([written("loa", 3, "1209"), written("dien", 0, "DIEN"), written("cleaning", 2, "HANG NGAY"), written("attendance", 0, "HANG NGAY")]), deps);
    assert.deepEqual(calls.map((c) => [c.job.name, c.job.sheet, c.maxPages]), [["loa", "1209", 5], ["dien", "DIEN", 5], ["cleaning", "HANG NGAY", 5], ["attendance", "HANG NGAY", 5]]);
    assert.deepEqual(summary.sent, ["loa-auto.xlsx", "dien-auto.xlsx", "cleaning-auto.xlsx", "attendance-auto.xlsx"]);
    assert.deepEqual(summary.warnings, []);
    assert.equal(summary.printer, PRINTER);
});

test("a file longer than the cap prints only the first pages and says so", () => {
    const { deps } = setup(() => sentOk(8, 5));
    const summary = printTotalFiles(result([written("mayTinh", 40)]), deps);
    assert.deepEqual(summary.sent, ["mayTinh-auto.xlsx"]);
    assert.match(summary.warnings[0], /mayTinh.*5\/8.*print\.maxPagesPerFile/);
});

test("a print error on one file is only a warning: the other files still print", () => {
    const { deps } = setup((job) => {
        if (job.name === "loa") throw new Error("Excel không in được");
        return sentOk(1);
    });
    const summary = printTotalFiles(result([written("loa", 1), written("internet", 1)]), deps);
    assert.deepEqual(summary.sent, ["internet-auto.xlsx"]);
    assert.match(summary.warnings[0], /loa.*Excel không in được/);
});

test("a file with no printable pages is skipped with a warning, and a dry run lists what WOULD print without claiming it was sent", () => {
    const empty = setup(() => ({ pages: 0, printed: 0, printer: "p", sent: false }));
    const s1 = printTotalFiles(result([written("loa", 1)]), empty.deps);
    assert.deepEqual(s1.sent, []);
    assert.match(s1.warnings[0], /loa.*không có trang nào/);

    const dry = setup(() => ({ pages: 2, printed: 2, printer: "p", sent: false }));
    const s2 = printTotalFiles(result([written("loa", 1)]), dry.deps);
    assert.deepEqual(s2.sent, []);
    assert.deepEqual(s2.wouldPrint, ["loa-auto.xlsx"]);
    assert.deepEqual(s2.warnings, []);
});

test("onProgress is called before every file that is sent to the printer, empty ones included (the bot keeps its heartbeat)", () => {
    const { beats, deps } = setup(() => sentOk(1));
    printTotalFiles(result([written("loa", 1), written("dien", 0), written("internet", 2)]), deps);
    assert.equal(beats.length, 3);
});

test("no file written at all gives an empty summary and never calls the printer", () => {
    const { calls, deps } = setup(() => sentOk(1));
    const summary = printTotalFiles(result([]), deps);
    assert.deepEqual(calls, []);
    assert.deepEqual(summary.sent, []);
    assert.equal(summary.printer, null);
});
