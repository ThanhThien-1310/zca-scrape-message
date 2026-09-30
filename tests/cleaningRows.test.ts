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
    // Dòng C (totalRow+7) cũng phải được ghi đè lại như A/B — công thức GỐC trong file mẫu tham chiếu đúng 3
    // dòng (G5:G7 hoặc tương đương); khi rowCount nhỏ, PowerShell xoá HẾT các dòng đó (không còn dòng nào sống
    // sót trong vùng tham chiếu cũ, khác trường hợp A/B nơi firstDataRow luôn còn 1 dòng sống sót) khiến Excel
    // biến công thức gốc thành lỗi thật `#REF!` — đã tái hiện được lỗi này với dữ liệu thật (xem hội thoại).
    assert.deepEqual(cleaningFormulaCells(4, 0), [
        { ref: "C5", formula: "COUNTA(C4:C4)" },
        { ref: "L10", formula: "COUNTIF(G4:G4,J10)" },
        { ref: "L11", formula: "COUNTIF(G4:G4,J11)" },
        { ref: "L12", formula: "COUNTIF(G4:G4,J12)" },
    ]);
    assert.deepEqual(cleaningFormulaCells(4, 1), [
        { ref: "C5", formula: "COUNTA(C4:C4)" },
        { ref: "L10", formula: "COUNTIF(G4:G4,J10)" },
        { ref: "L11", formula: "COUNTIF(G4:G4,J11)" },
        { ref: "L12", formula: "COUNTIF(G4:G4,J12)" },
    ]);
    // 3 dòng dữ liệu: firstDataRow=4, effectiveRows=3 -> totalRow=7 (khớp file mẫu gốc khi có đúng số dòng ban
    // đầu là 4: totalRow=8, khối CHÚ GIẢI ở dòng 13 (A)/14 (B)/15 (C) — tức luôn là totalRow+5/+6/+7).
    assert.deepEqual(cleaningFormulaCells(4, 3), [
        { ref: "C7", formula: "COUNTA(C4:C6)" },
        { ref: "L12", formula: "COUNTIF(G4:G6,J12)" },
        { ref: "L13", formula: "COUNTIF(G4:G6,J13)" },
        { ref: "L14", formula: "COUNTIF(G4:G6,J14)" },
    ]);
    // Đúng số dòng ban đầu của file mẫu (4 dòng) -> khối CHÚ GIẢI đúng vị trí gốc: A dòng 13, B dòng 14, C dòng 15.
    assert.deepEqual(cleaningFormulaCells(4, 4), [
        { ref: "C8", formula: "COUNTA(C4:C7)" },
        { ref: "L13", formula: "COUNTIF(G4:G7,J13)" },
        { ref: "L14", formula: "COUNTIF(G4:G7,J14)" },
        { ref: "L15", formula: "COUNTIF(G4:G7,J15)" },
    ]);
});
