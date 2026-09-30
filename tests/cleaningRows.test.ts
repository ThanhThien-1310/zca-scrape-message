import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCleaningRows, CLEANING_LAYOUT, cleaningFormulaCells } from "../src/lesson/cleaningRows.js";
import type { CleaningEntry } from "../src/types/index.js";

const entry = (over: Partial<CleaningEntry>): CleaningEntry => ({
    maNhom: "g1", maTinNhan: "m1", thoiGian: 1000,
    tenTruong: "THCS X", khuVuc: "DA", phongMay: "PM1", tenIT: "A", veSinhSach: true,
    ...over,
});

test("CLEANING_LAYOUT matches the real template's HANG NGAY sheet", () => {
    assert.deepEqual(CLEANING_LAYOUT, { templateFile: "TINH TRANG VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "H" });
});

test("buildCleaningRows: Có -> A, Không -> B, STT tăng dần, NGÀY là dd/mm/yyyy", () => {
    const rows = buildCleaningRows([entry({ veSinhSach: true }), entry({ maTinNhan: "m2", phongMay: "PM2", veSinhSach: false })], "2026-09-29");
    assert.deepEqual(rows, [
        { A: 1, B: "29/09/2026", C: "THCS X", D: "DA", E: "PM1", F: "A", G: "A" },
        { A: 2, B: "29/09/2026", C: "THCS X", D: "DA", E: "PM2", F: "A", G: "B" },
    ]);
});

test("buildCleaningRows: no entries -> no rows", () => {
    assert.deepEqual(buildCleaningRows([], "2026-09-29"), []);
});

test("cleaningFormulaCells: TỔNG luôn tham chiếu đúng vùng dữ liệu hiện tại, tối thiểu 1 dòng", () => {
    assert.deepEqual(cleaningFormulaCells(4, 0), [{ ref: "C5", formula: "COUNTA(C4:C4)" }]);
    assert.deepEqual(cleaningFormulaCells(4, 1), [{ ref: "C5", formula: "COUNTA(C4:C4)" }]);
    assert.deepEqual(cleaningFormulaCells(4, 3), [{ ref: "C7", formula: "COUNTA(C4:C6)" }]);
});
