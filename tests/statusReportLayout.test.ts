import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../config.js";
import { buildFillSpecs, excelDateSerialForDay, FILE_LAYOUT, headerDateTexts, OTHER_TEMPLATE_FILES } from "../src/lesson/statusReportLayout.js";
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

    assert.equal(specs.internet.rows[0].G, 3);
    assert.deepEqual(specs.internet.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "I2", value: "Thời gian: 14:05" }]);

    assert.deepEqual(specs.netsupport.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "I2", value: "Thời gian: 14:05" }]);
    assert.deepEqual(specs.loa.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "H2", value: "Thời gian: 14:05" }]);
    assert.deepEqual(specs.mayTinh.headerCells, [{ ref: "J2", value: "Thứ: 2" }, { ref: "K2", value: "Ngày: 28/09/2026" }, { ref: "M2", value: "Thời gian: 14:05" }]);
});

test("OTHER_TEMPLATE_FILES lists exactly the 5 files with no data source, and none overlap FILE_LAYOUT's templates", () => {
    assert.deepEqual(
        [...OTHER_TEMPLATE_FILES].sort(),
        ["TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx", "TINH TRANG VE SINH PHONG MAY.xlsx", "THAY THE MAY TINH.xlsx", "VI PHAM NOI QUY THUC TAP.xlsx"].sort(),
    );
    const inScope = new Set<string>(Object.values(FILE_LAYOUT).map((l) => l.templateFile));
    for (const f of OTHER_TEMPLATE_FILES) assert.equal(inScope.has(f), false, f);
});

const templatesDir = path.join(config.dataDir, "mau bao cao new");
const templatesPresent = fs.existsSync(templatesDir);

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
        }
        for (const f of OTHER_TEMPLATE_FILES) assert.ok(fs.existsSync(path.join(templatesDir, f)), `thiếu file ${f}`);
    },
);
