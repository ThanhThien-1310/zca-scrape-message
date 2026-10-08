import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildFillPsSpec } from "../src/lesson/excelFill.js";

test("buildFillPsSpec wires the layout, rows and header cells into the PowerShell spec shape", () => {
    const spec = buildFillPsSpec({
        name: "cleaning",
        templatesSrc: "C:\\data\\mau bao cao new",
        layout: { templateFile: "04 - FORM VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "G", deleteSheets: ["TONG"] },
        outDir: "C:\\out\\260929",
        outName: "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx",
        rows: [{ A: 1, B: "29/09/2026" }],
        headerCells: [{ ref: "G2", value: 46293, numberFormat: "dd/mm/yyyy" }, { sheet: "TONG", ref: "J2", value: 46293 }],
        formulaCells: [{ ref: "K10", formula: "COUNTIF(G4:G4,I10)" }],
    });
    assert.deepEqual(spec, {
        files: [
            {
                name: "cleaning",
                template: path.join("C:\\data\\mau bao cao new", "04 - FORM VE SINH PHONG MAY.xlsx"),
                out: path.join("C:\\out\\260929", "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx"),
                sheet: "HANG NGAY",
                firstDataRow: 4,
                totalRowBefore: 8,
                lastColumn: "G",
                deleteSheets: ["TONG"],
                rows: [{ A: 1, B: "29/09/2026" }],
                headerCells: [{ ref: "G2", value: 46293, numberFormat: "dd/mm/yyyy" }, { sheet: "TONG", ref: "J2", value: 46293 }],
                formulaCells: [{ ref: "K10", formula: "COUNTIF(G4:G4,I10)" }],
            },
        ],
    });
});

test("buildFillPsSpec: formulaCells defaults to an empty array when omitted", () => {
    const spec = buildFillPsSpec({
        name: "attendance",
        templatesSrc: "C:\\data\\mau bao cao new",
        layout: { templateFile: "05 - FORM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 7, lastColumn: "I" },
        outDir: "C:\\out",
        outName: "out.xlsx",
        rows: [],
        headerCells: [],
    });
    assert.deepEqual((spec as { files: Array<{ formulaCells: unknown[] }> }).files[0].formulaCells, []);
});

test("buildFillPsSpec: deleteSheets defaults to an empty array when the layout has none", () => {
    const spec = buildFillPsSpec({
        name: "attendance",
        templatesSrc: "C:\\data",
        layout: { templateFile: "t.xlsx", sheet: "S", firstDataRow: 4, totalRowBefore: 7, lastColumn: "I" },
        outDir: "C:\\out",
        outName: "out.xlsx",
        rows: [],
        headerCells: [],
    });
    assert.deepEqual((spec as { files: Array<{ deleteSheets: unknown[] }> }).files[0].deleteSheets, []);
});

// --- ghi file mới trước, xoá bản cũ cùng ngày sau ---
import fs from "node:fs";
import os from "node:os";
import { pruneSiblings, runFillReplacingSameDay, type FillTemplateArgs } from "../src/lesson/excelFill.js";

const mkdir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "fill-"));
const touch = (dir: string, name: string): void => fs.writeFileSync(path.join(dir, name), "x");
const argsFor = (outDir: string, outName: string): FillTemplateArgs => ({
    name: "t", templatesSrc: "x", layout: { templateFile: "t.xlsx", sheet: "S", firstDataRow: 4, totalRowBefore: 5, lastColumn: "A" }, outDir, outName, rows: [], headerCells: [],
});

test("pruneSiblings removes older files of the same title+day only, never the kept file or other reports", () => {
    const dir = mkdir();
    for (const f of ["VP_260930_T4_0900.xlsx", "VP_260930_T4_1000.xlsx", "VP_260930_T4_1100.xlsx", "TONG VP_260930_T4_0900.xlsx", "VP_260929_T3_0900.xlsx", "VP_260930_T4_0900.txt"]) touch(dir, f);
    assert.deepEqual(pruneSiblings(dir, "VP_260930_T", "VP_260930_T4_1100.xlsx"), []);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["TONG VP_260930_T4_0900.xlsx", "VP_260929_T3_0900.xlsx", "VP_260930_T4_0900.txt", "VP_260930_T4_1100.xlsx"]);
});

test("runFillReplacingSameDay: success keeps only the new file", () => {
    const dir = mkdir();
    touch(dir, "VP_260930_T4_0900.xlsx");
    runFillReplacingSameDay(argsFor(dir, "VP_260930_T4_1000.xlsx"), "VP_260930_T", (a) => (touch(a.outDir, a.outName), ""));
    assert.deepEqual(fs.readdirSync(dir), ["VP_260930_T4_1000.xlsx"]);
});

test("runFillReplacingSameDay: a failed fill keeps the old file and drops the half-written new one", () => {
    const dir = mkdir();
    touch(dir, "VP_260930_T4_0900.xlsx");
    assert.throws(
        () => runFillReplacingSameDay(argsFor(dir, "VP_260930_T4_1000.xlsx"), "VP_260930_T", (a) => (touch(a.outDir, a.outName), (() => { throw new Error("Excel lỗi"); })())),
        /Excel lỗi/,
    );
    assert.deepEqual(fs.readdirSync(dir), ["VP_260930_T4_0900.xlsx"]);
});

test("pruneSiblings never touches the -auto files of the total reports, even for the same title and day", () => {
    const dir = mkdir();
    for (const f of ["VP_260930_T4_0900.xlsx", "VP_260930_T4_0907-auto.xlsx", "VP_260930_T4_1500-auto.xlsx"]) touch(dir, f);
    assert.deepEqual(pruneSiblings(dir, "VP_260930_T", "VP_260930_T4_1100.xlsx"), []);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["VP_260930_T4_0907-auto.xlsx", "VP_260930_T4_1500-auto.xlsx"]);
});

test("buildFillPsSpec: inPlace goes to the PowerShell spec only when the layout asks for it", () => {
    const args = { name: "leave", templatesSrc: "C:\\data", outDir: "C:\\out", outName: "o.xlsx", rows: [], headerCells: [{ ref: "F4", value: "08/10/2026", numberFormat: "@" }] };
    const on = buildFillPsSpec({ ...args, layout: { templateFile: "t.xlsx", sheet: "S", firstDataRow: 4, totalRowBefore: 16, lastColumn: "M", inPlace: true } }) as { files: Array<Record<string, unknown>> };
    assert.equal(on.files[0].inPlace, true);
    const off = buildFillPsSpec({ ...args, layout: { templateFile: "t.xlsx", sheet: "S", firstDataRow: 4, totalRowBefore: 7, lastColumn: "I" } }) as { files: Array<Record<string, unknown>> };
    assert.equal("inPlace" in off.files[0], false);
});
