import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../config.js";
import { buildFillSpecs, excelDateSerialForDay, FILE_LAYOUT, freeFormFileName, headerDateTexts, OTHER_TEMPLATE_FILES, PHASE_HHMM, readTemplateTitle, statusFileName, WEEKDAY_EXCEL_TYPE1 } from "../src/lesson/statusReportLayout.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

test("headerDateTexts matches the original TEXT()/WEEKDAY() formula's own output convention", () => {
    // 2026-09-28 is a Monday; Excel WEEKDAY(date,1) is 1=Sunday..7=Saturday, so Monday is 2 (a number, not a name —
    // the template's own formula prints the number, e.g. "Thứ: 2", not "Thứ: Hai").
    const r = headerDateTexts("2026-09-28", Date.UTC(2026, 8, 28, 7, 5)); // 07:05 UTC = 14:05 VN
    assert.deepEqual(r, { thu: "Thứ: 2", ngay: "Ngày: 28/09/2026", gio: "Thời gian: 14:05" });
});

test("excelDateSerialForDay matches Excel's 1900 date system", () => {
    assert.equal(excelDateSerialForDay("2026-09-28"), 46293);
});

test("buildFillSpecs wires each builder's rows and the right header cells per file", () => {
    const report = (id: string, facilities: CoSoVatChat[]): Report => ({
        maTinNhan: id, maNguoiGui: "u", maNhom: "g1", thoiGian: 1000, loaiBaoCao: "DauBuoi",
        data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "X", coSo: null }, khuVuc: "K", phongMay: "PM1", giaoVien: "GV", coSoVatChat: facilities },
    });
    const reports = [report("m1", [{ loai: "MayTinh", xepLoai: "A", soLuong: [{ loai: "Thieu", so: 1 }, { loai: "Loi", so: 0 }] }, { loai: "Internet", xepLoai: "K" }])];
    const perMessage = new Map([["m1|internet", 3]]);

    const specs = buildFillSpecs(reports, perMessage, "2026-09-28", Date.UTC(2026, 8, 28, 7, 5));

    assert.equal(specs.boSung.sheet, "BO SUNG");
    assert.deepEqual(specs.boSung.rows, [{ A: 1, B: "LC", C: "X", D: "K", J: "PM1", L: 1, M: 1 }]);
    assert.deepEqual(specs.boSung.headerCells, [{ ref: "Q2", value: 46293, numberFormat: "dd/mm/yyyy" }]);
    // 1 dòng dữ liệu -> TỔNG ở đúng vị trí gốc (firstDataRow=5, totalRowBefore=6): công thức tham chiếu lại
    // đúng dòng dữ liệu thay vì để Excel tự suy ra (Excel không mở rộng một tham chiếu 1-ô khi chèn/xoá dòng
    // kề bên, và xoá hết dòng dữ liệu duy nhất biến tham chiếu thành #REF!).
    assert.deepEqual(specs.boSung.formulaCells, [
        { ref: "C6", formula: "COUNTA(C5:C5)" },
        { ref: "L6", formula: "SUM(L5:L5)" },
        { ref: "M6", formula: "SUM(M5:M5)" },
        { ref: "G10", formula: "COUNTIF(N5:N5,D10)" },
        { ref: "G11", formula: "COUNTIF(N5:N5,D11)" },
        { ref: "G12", formula: "COUNTIF(N5:N5,D12)" },
        { ref: "G13", formula: "COUNTIF(N5:N5,D13)" },
    ]);

    assert.equal(specs.internet.rows[0].G, 3);
    assert.deepEqual(specs.internet.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "I2", value: "Thời gian: 14:05" }]);

    assert.deepEqual(specs.netsupport.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "I2", value: "Thời gian: 14:05" }]);
    assert.deepEqual(specs.loa.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "H2", value: "Thời gian: 14:05" }]);
    assert.deepEqual(specs.mayTinh.headerCells, [{ ref: "J2", value: "Thứ: 2" }, { ref: "K2", value: "Ngày: 28/09/2026" }, { ref: "M2", value: "Thời gian: 14:05" }]);
});

test("buildFillSpecs: BO SUNG formulaCells never shrink below 1 row (0 rows still reference firstDataRow, not an empty/#REF range)", () => {
    const specs = buildFillSpecs([], new Map(), "2026-09-28");
    assert.deepEqual(specs.boSung.rows, []);
    assert.deepEqual(specs.boSung.formulaCells?.slice(0, 3), [
        { ref: "C6", formula: "COUNTA(C5:C5)" },
        { ref: "L6", formula: "SUM(L5:L5)" },
        { ref: "M6", formula: "SUM(M5:M5)" },
    ]);
});

test("buildFillSpecs: BO SUNG formulaCells range grows with more rows, TỔNG follows to the right row", () => {
    const report = (id: string, thieu: number): Report => ({
        maTinNhan: id, maNguoiGui: "u", maNhom: "g1", thoiGian: 1000, loaiBaoCao: "DauBuoi",
        data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "X", coSo: null }, khuVuc: "K", phongMay: "PM1", giaoVien: "GV", coSoVatChat: [{ loai: "MayTinh", xepLoai: "A", soLuong: [{ loai: "Thieu", so: thieu }, { loai: "Loi", so: 0 }] }] },
    });
    const specs = buildFillSpecs([report("m1", 1), report("m2", 2), report("m3", 3)], new Map(), "2026-09-28");
    assert.equal(specs.boSung.rows.length, 3);
    assert.deepEqual(specs.boSung.formulaCells?.slice(0, 3), [
        { ref: "C8", formula: "COUNTA(C5:C7)" },
        { ref: "L8", formula: "SUM(L5:L7)" },
        { ref: "M8", formula: "SUM(M5:M7)" },
    ]);
    assert.deepEqual(specs.boSung.formulaCells?.slice(3), [
        { ref: "G12", formula: "COUNTIF(N5:N7,D12)" },
        { ref: "G13", formula: "COUNTIF(N5:N7,D13)" },
        { ref: "G14", formula: "COUNTIF(N5:N7,D14)" },
        { ref: "G15", formula: "COUNTIF(N5:N7,D15)" },
    ]);
});

test("OTHER_TEMPLATE_FILES lists exactly the 3 files with no data source, and none overlap FILE_LAYOUT's templates", () => {
    assert.deepEqual(
        [...OTHER_TEMPLATE_FILES].sort(),
        ["TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx", "THAY THE MAY TINH.xlsx"].sort(),
    );
    const inScope = new Set<string>(Object.values(FILE_LAYOUT).map((l) => l.templateFile));
    for (const f of OTHER_TEMPLATE_FILES) assert.equal(inScope.has(f), false, f);
});

test("freeFormFileName: <title>_<yyMMdd>_T<thu>_<hhmm tự do>.xlsx", () => {
    // 2026-09-29 là thứ Ba -> Excel WEEKDAY(d,1) = 3.
    assert.equal(freeFormFileName("TÌNH TRẠNG VỆ SINH PHÒNG MÁY", "2026-09-29", "1042"), "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx");
});

test("WEEKDAY_EXCEL_TYPE1: JS getUTCDay() (0=CN) -> Excel WEEKDAY(d,1) (1=CN)", () => {
    assert.equal(WEEKDAY_EXCEL_TYPE1(0), 1);
    assert.equal(WEEKDAY_EXCEL_TYPE1(2), 3);
    assert.equal(WEEKDAY_EXCEL_TYPE1(6), 7);
});

const templatesDir = path.join(config.dataDir, "mau bao cao new");
const templatesPresent = fs.existsSync(templatesDir);

test("statusFileName: <title>_<yyMMdd>_T<thu>_<HHmm cố định theo giai đoạn>.xlsx", () => {
    // 2026-09-29 là thứ Ba -> Excel WEEKDAY(d,1) = 3.
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "morningstart"), "TÌNH TRẠNG LOA_260929_T3_0900.xlsx");
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "morningend"), "TÌNH TRẠNG LOA_260929_T3_1230.xlsx");
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "afternoonstart"), "TÌNH TRẠNG LOA_260929_T3_1500.xlsx");
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "afternoonend"), "TÌNH TRẠNG LOA_260929_T3_1730.xlsx");
});

test("PHASE_HHMM has the fixed end-of-phase clock time for all 4 phases", () => {
    assert.deepEqual(PHASE_HHMM, { morningstart: "0900", morningend: "1230", afternoonstart: "1500", afternoonend: "1730" });
});

test(
    "readTemplateTitle reads the exact second line of cell A1 in a real template",
    { skip: templatesPresent ? false : `${templatesDir} không có trên máy này — bỏ qua` },
    () => {
        assert.equal(readTemplateTitle(path.join(templatesDir, "TINH TRANG LOA.xlsx"), "1209"), "TÌNH TRẠNG LOA");
        assert.equal(readTemplateTitle(path.join(templatesDir, "TINH TRANG LOI MAY TINH.xlsx"), "2409"), "TÌNH TRẠNG LỖI MÁY TÍNH");
    },
);

test(
    "the real template files still have the sheet/TỔNG-row layout the constants assume",
    { skip: templatesPresent ? false : `${templatesDir} không có trên máy này — bỏ qua kiểm tra đối chiếu thật` },
    () => {
        for (const [key, layout] of Object.entries(FILE_LAYOUT)) {
            const wb = XLSX.readFile(path.join(templatesDir, layout.templateFile));
            const ws = wb.Sheets[layout.sheet];
            assert.ok(ws, `${key}: sheet "${layout.sheet}" không có trong ${layout.templateFile}`);
            const totalCell = ws[`A${layout.totalRowBefore}`];
            assert.equal(totalCell?.v, "TỔNG", `${key}: A${layout.totalRowBefore} trong ${layout.templateFile} không phải "TỔNG" — file mẫu đã đổi, cập nhật FILE_LAYOUT`);
            const headerRow = layout.firstDataRow - 1;
            const nextCol = String.fromCharCode(layout.lastColumn.charCodeAt(0) + 1);
            assert.ok(ws[`${layout.lastColumn}${headerRow}`], `${key}: cột ${layout.lastColumn} dòng ${headerRow} trống — lastColumn sai`);
            assert.ok(!ws[`${nextCol}${headerRow}`], `${key}: cột ${nextCol} dòng ${headerRow} vẫn có tiêu đề — lastColumn (${layout.lastColumn}) thiếu cột`);
        }
        for (const f of OTHER_TEMPLATE_FILES) assert.ok(fs.existsSync(path.join(templatesDir, f)), `thiếu file ${f}`);
    },
);
