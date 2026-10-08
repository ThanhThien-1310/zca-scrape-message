import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../config.js";
import { buildCleaningRows, CLEANING_HEADER_REFS, CLEANING_LAYOUT, cleaningHeaderCells } from "../src/lesson/cleaningRows.js";
import { excelDateSerialForDay, legendFormulaCells, readTemplateTitle } from "../src/lesson/statusReportLayout.js";
import type { CleaningEntry } from "../src/types/index.js";

const entry = (over: Partial<CleaningEntry>): CleaningEntry => ({
    maNhom: "g1", maTinNhan: "m1", thoiGian: 1000,
    tenTruong: "THCS X", khuVuc: "DA", phongMay: "PM1", tenIT: "A", veSinhSach: true,
    ...over,
});

test("CLEANING_LAYOUT matches the new template's HANG NGAY sheet (7 cột A-G, GHI CHÚ ở G mang mã A/B/C)", () => {
    assert.deepEqual(CLEANING_LAYOUT, {
        templateFile: "04 - FORM VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "G",
        legend: { gradeCol: "G", labelCol: "I", countCol: "K", ratioCol: "L", gradeRowOffsets: [5, 6, 7], sumRowOffset: 8 },
    });
    assert.deepEqual(CLEANING_HEADER_REFS, { ngay: "F2", gio: "G2" });
});

// Mẫu có F2 = "Ngày: <TODAY()>" và G2 = "Thời gian: <NOW()>" ở sheet HANG NGAY; sheet TONG (để trống) chỉ có ô "Ngày báo cáo" J2 là một ngày.
test("cleaningHeaderCells: HANG NGAY F2 'Ngày: dd/mm/yyyy', G2 'Thời gian: hh:mm' giờ chạy (chữ); TONG J2 là số ngày dd/mm/yyyy", () => {
    const at1022 = Date.UTC(2026, 9, 5, 3, 22); // 10:22 giờ Việt Nam
    assert.deepEqual(cleaningHeaderCells("2026-10-05", at1022), [
        { ref: "F2", value: "Ngày: 05/10/2026" },
        { ref: "G2", value: "Thời gian: 10:22" },
        { sheet: "TONG", ref: "J2", value: excelDateSerialForDay("2026-10-05"), numberFormat: "dd/mm/yyyy" },
    ]);
});

// NGÀY có dấu nháy đơn đứng đầu: Excel (COM) hiểu chữ "01/10/2026" theo kiểu Mỹ thành 10/01/2026 (số ngày), dấu nháy ép nó thành CHỮ.
test("buildCleaningRows: chỉ điền A-F (STT, NGÀY dd/mm/yyyy, trường, khu vực, PM, họ tên); cột GHI CHÚ G để trống dù tin báo Có hay Không", () => {
    const rows = buildCleaningRows([entry({ veSinhSach: true }), entry({ maTinNhan: "m2", phongMay: "PM2", veSinhSach: false })], "2026-09-29");
    assert.deepEqual(rows, [
        { A: 1, B: "'29/09/2026", C: "THCS X", D: "DA", E: "PM1", F: "A" },
        { A: 2, B: "'29/09/2026", C: "THCS X", D: "DA", E: "PM2", F: "A" },
    ]);
    for (const row of rows) assert.ok(!("G" in row));
});

test("buildCleaningRows: no entries -> no rows", () => {
    assert.deepEqual(buildCleaningRows([], "2026-09-29"), []);
});

test("khối chú giải của VỆ SINH: A/B/C đếm theo cột G, dời đúng theo số dòng, 0 dòng vẫn tham chiếu 1 dòng (không #REF!)", () => {
    // Đúng số dòng ban đầu của mẫu (4 dòng, TỔNG ở 8): A ở 13, B ở 14, C ở 15, TỔNG chú giải ở 16.
    assert.deepEqual(legendFormulaCells(CLEANING_LAYOUT, 4), [
        { ref: "K13", formula: "COUNTIF(G4:G7,I13)" },
        { ref: "L13", formula: "IF(K16=0,0,K13/K16)" },
        { ref: "K14", formula: "COUNTIF(G4:G7,I14)" },
        { ref: "L14", formula: "IF(K16=0,0,K14/K16)" },
        { ref: "K15", formula: "COUNTIF(G4:G7,I15)" },
        { ref: "L15", formula: "IF(K16=0,0,K15/K16)" },
        { ref: "K16", formula: "SUM(K13:K15)" },
        { ref: "L16", formula: "SUM(L13:L15)" },
    ]);
    const none = legendFormulaCells(CLEANING_LAYOUT, 0); // TỔNG ở 5 -> A ở 10, TỔNG chú giải ở 13
    assert.deepEqual(none[0], { ref: "K10", formula: "COUNTIF(G4:G4,I10)" });
    assert.deepEqual(none.at(-2), { ref: "K13", formula: "SUM(K10:K12)" });
    assert.deepEqual(legendFormulaCells(CLEANING_LAYOUT, 1), none);
});

const templatesDir = path.join(config.dataDir, "mau bao cao new");
const present = fs.existsSync(templatesDir);

test("the real VỆ SINH template still has the sheets, TỔNG row, GHI CHÚ column, A/B/C legend and date cells assumed", { skip: present ? false : "không có thư mục mẫu trên máy này" }, () => {
    const file = path.join(templatesDir, CLEANING_LAYOUT.templateFile);
    const wb = XLSX.readFile(file);
    const ws = wb.Sheets[CLEANING_LAYOUT.sheet];
    assert.ok(wb.Sheets["TONG"], "thiếu sheet TONG");
    assert.equal(ws[`A${CLEANING_LAYOUT.totalRowBefore}`]?.v, "TỔNG");
    assert.equal(ws["G3"]?.v, "GHI CHÚ");
    assert.ok(!ws["H3"], "cột H dòng 3 vẫn có tiêu đề — lastColumn thiếu cột");
    const legend = CLEANING_LAYOUT.legend!;
    assert.deepEqual(legend.gradeRowOffsets.map((o) => ws[`${legend.labelCol}${CLEANING_LAYOUT.totalRowBefore + o}`]?.v), ["A", "B", "C"]);
    assert.match(String(ws[CLEANING_HEADER_REFS.ngay]?.v), /^Ngày:/, "ô ngày (F2) không còn là 'Ngày: ...'");
    assert.match(String(ws[CLEANING_HEADER_REFS.gio]?.v), /^Thời gian:/, "ô giờ (G2) không còn là 'Thời gian: ...'");
    assert.ok(wb.Sheets["TONG"]["J2"], "thiếu ô ngày báo cáo của sheet TONG (J2)");
    assert.equal(readTemplateTitle(file, CLEANING_LAYOUT.sheet), "VỆ SINH PHÒNG MÁY");
});
