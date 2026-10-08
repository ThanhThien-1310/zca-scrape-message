import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { LEAVE_BUOI_COLUMN, LEAVE_LAYOUT, LEAVE_NGAY_COLUMN } from "../src/leave/layout.js";

test("the leave layout fills in place and writes the BUỔI and NGÀY columns", () => {
    assert.equal(LEAVE_LAYOUT.inPlace, true);
    assert.equal(LEAVE_LAYOUT.templateFile, "LICH NGHI PHEP KY THUAT.xlsx");
    assert.equal(LEAVE_LAYOUT.sheet, "BAO CAO");
    assert.equal(LEAVE_NGAY_COLUMN, "F");
    assert.equal(LEAVE_BUOI_COLUMN, "E");
});

const REAL = path.join("data", "mau bao cao new", LEAVE_LAYOUT.templateFile);
test("the real template still has the headers the layout relies on", { skip: !fs.existsSync(REAL) }, () => {
    const ws = XLSX.readFile(REAL).Sheets[LEAVE_LAYOUT.sheet];
    assert.ok(ws, "sheet BAO CAO");
    assert.equal(ws["B3"]?.v, "NHÂN VIÊN");
    assert.equal(ws["E3"]?.v, "BUỔI");
    assert.equal(ws["F3"]?.v, "NGÀY");
    assert.equal(ws["A16"]?.v, "TỔNG");
    assert.match(String(ws["A1"]?.v), /LỊCH NGHỈ PHÉP KỸ THUẬT/);
});
