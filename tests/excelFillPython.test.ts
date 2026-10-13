import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFillTemplate } from "../src/lesson/excelFill.js";

test("runFillTemplate successfully executes Python Export Worker and populates file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zca-test-fill-"));
    const templatesDir = path.join(tmpDir, "templates");
    const outDir = path.join(tmpDir, "out");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    // Create a mock template with Python via simple CLI
    const templatePath = path.join(templatesDir, "01 - FORM TINH TRANG AM THANH.xlsx");
    const createScript = `
import openpyxl
wb = openpyxl.Workbook()
ws = wb.active
ws.title = "1209"
ws["A1"] = "TIN HỌC ĐẠI DƯƠNG\\nTÌNH TRẠNG LOA"
ws["A3"] = "STT"
ws["B3"] = "TÊN TRƯỜNG"
ws["D3"] = "PHÒNG MÁY"
ws["F3"] = "XẾP LOẠI"
ws["A4"] = ""
ws["A5"] = "TỔNG"
wb.save(r"${templatePath.replace(/\\/g, "\\\\")}")
`;
    fs.writeFileSync(path.join(tmpDir, "create.py"), createScript, "utf8");
    execSync(`python "${path.join(tmpDir, "create.py")}"`);

    const result = runFillTemplate({
        name: "loa",
        templatesSrc: templatesDir,
        layout: {
            templateFile: "01 - FORM TINH TRANG AM THANH.xlsx",
            sheet: "1209",
            firstDataRow: 4,
            totalRowBefore: 5,
            lastColumn: "G",
        },
        outDir,
        outName: "TÌNH TRẠNG ÂM THANH_261013_T3_0900.xlsx",
        rows: [
            { A: 1, B: "TH Chu Văn An", D: "PM1", F: "T" },
            { A: 2, B: "TH Chu Văn An", D: "PM2", F: "K" },
        ],
        headerCells: [
            { ref: "E2", value: "Thứ: 3" },
            { ref: "F2", value: "Ngày: 13/10/2026" },
        ],
        formulaCells: [],
    });

    const expectedOut = path.join(outDir, "TÌNH TRẠNG ÂM THANH_261013_T3_0900.xlsx");
    assert.ok(fs.existsSync(expectedOut), "Output Excel file must be created by Python worker");
    assert.match(result, /2 dòng/);

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
});
