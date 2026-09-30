import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildFillPsSpec } from "../src/lesson/excelFill.js";

test("buildFillPsSpec wires the layout, rows and header cells into the PowerShell spec shape", () => {
    const spec = buildFillPsSpec({
        name: "cleaning",
        templatesSrc: "C:\\data\\mau bao cao new",
        layout: { templateFile: "TINH TRANG VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "H" },
        outDir: "C:\\out\\260929",
        outName: "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx",
        rows: [{ A: 1, B: "29/09/2026" }],
        headerCells: [{ ref: "H2", value: 46293, numberFormat: "dd/mm/yyyy" }],
        formulaCells: [{ ref: "C5", formula: "COUNTA(C4:C4)" }],
    });
    assert.deepEqual(spec, {
        files: [
            {
                name: "cleaning",
                template: path.join("C:\\data\\mau bao cao new", "TINH TRANG VE SINH PHONG MAY.xlsx"),
                out: path.join("C:\\out\\260929", "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx"),
                sheet: "HANG NGAY",
                firstDataRow: 4,
                totalRowBefore: 8,
                lastColumn: "H",
                rows: [{ A: 1, B: "29/09/2026" }],
                headerCells: [{ ref: "H2", value: 46293, numberFormat: "dd/mm/yyyy" }],
                formulaCells: [{ ref: "C5", formula: "COUNTA(C4:C4)" }],
            },
        ],
    });
});

test("buildFillPsSpec: formulaCells defaults to an empty array when omitted", () => {
    const spec = buildFillPsSpec({
        name: "attendance",
        templatesSrc: "C:\\data\\mau bao cao new",
        layout: { templateFile: "VI PHAM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 5, lastColumn: "L" },
        outDir: "C:\\out",
        outName: "out.xlsx",
        rows: [],
        headerCells: [],
    });
    assert.deepEqual((spec as { files: Array<{ formulaCells: unknown[] }> }).files[0].formulaCells, []);
});
