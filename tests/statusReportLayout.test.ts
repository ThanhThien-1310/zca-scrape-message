import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../config.js";
import { buildFillSpecs, excelDateSerialForDay, FILE_LAYOUT, freeFormFileName, headerDateTexts, legendFormulaCells, readTemplateTitle, WEEKDAY_EXCEL_TYPE1, type StatusFileLayout, PHASE_STATUS_KEYS } from "../src/lesson/statusReportLayout.js";
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

test("FILE_LAYOUT lists exactly the 5 status files; INTERNET/NETSUPPORT share one template but each drops the other sheet", () => {
    // Thứ tự xuất file VÀ in: NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN (rồi VỆ SINH, NỘI QUY ở báo cáo tổng).
    assert.deepEqual(Object.keys(FILE_LAYOUT), ["netsupport", "loa", "internet", "mayTinh", "dien"]);
    assert.equal(FILE_LAYOUT.loa.templateFile, "01 - FORM TINH TRANG AM THANH.xlsx");
    assert.equal(FILE_LAYOUT.netsupport.templateFile, FILE_LAYOUT.internet.templateFile);
    assert.deepEqual(FILE_LAYOUT.netsupport.deleteSheets, ["INTERNET"]);
    assert.deepEqual(FILE_LAYOUT.internet.deleteSheets, ["NETSUPPORT"]);
    assert.deepEqual(FILE_LAYOUT.mayTinh.deleteSheets, ["0310 (2)"]);
});

// --- công thức khối CHÚ GIẢI & THỐNG KÊ ---
// LOA: dòng TỔNG gốc ở 7, dòng loại T/B/K ở 10/11/12 (cách TỔNG 3/4/5), dòng TỔNG của chú giải ở 13 (cách 6).
test("legendFormulaCells: 3 dòng dữ liệu giữ nguyên vị trí gốc của mẫu LOA (T/B/K ở dòng 10-12, TỔNG ở 13)", () => {
    assert.deepEqual(legendFormulaCells(FILE_LAYOUT.loa, 3), [
        { ref: "K10", formula: "COUNTIF(F4:F6,I10)" },
        { ref: "L10", formula: "IF(K13=0,0,K10/K13)" },
        { ref: "K11", formula: "COUNTIF(F4:F6,I11)" },
        { ref: "L11", formula: "IF(K13=0,0,K11/K13)" },
        { ref: "K12", formula: "COUNTIF(F4:F6,I12)" },
        { ref: "L12", formula: "IF(K13=0,0,K12/K13)" },
        { ref: "K13", formula: "SUM(K10:K12)" },
        { ref: "L13", formula: "SUM(L10:L12)" },
    ]);
});

test("legendFormulaCells: khối chú giải dời theo số dòng dữ liệu; 0 dòng vẫn tham chiếu 1 dòng hợp lệ (không #REF!)", () => {
    const one = legendFormulaCells(FILE_LAYOUT.loa, 1);
    assert.deepEqual(one[0], { ref: "K8", formula: "COUNTIF(F4:F4,I8)" }); // TỔNG ở 5, T ở 5+3
    assert.deepEqual(one.at(-2), { ref: "K11", formula: "SUM(K8:K10)" });
    assert.deepEqual(legendFormulaCells(FILE_LAYOUT.loa, 0), one);
    const five = legendFormulaCells(FILE_LAYOUT.loa, 5); // TỔNG ở 9
    assert.deepEqual(five[0], { ref: "K12", formula: "COUNTIF(F4:F8,I12)" });
    assert.deepEqual(five.at(-1), { ref: "L15", formula: "SUM(L12:L14)" });
});

test("legendFormulaCells: MÁY TÍNH có 5 loại A-E đếm theo cột J, nhãn ở C, số lượng F, tỷ lệ G", () => {
    const cells = legendFormulaCells(FILE_LAYOUT.mayTinh, 3); // TỔNG ở 7 -> loại ở 11..15, TỔNG chú giải ở 16
    assert.equal(cells.length, 12); // 5 loại x (SL + tỷ lệ) + tổng x 2
    assert.deepEqual(cells[0], { ref: "F11", formula: "COUNTIF(J4:J6,C11)" });
    assert.deepEqual(cells[1], { ref: "G11", formula: "IF(F16=0,0,F11/F16)" });
    assert.deepEqual(cells.at(-2), { ref: "F16", formula: "SUM(F11:F15)" });
    assert.deepEqual(cells.at(-1), { ref: "G16", formula: "SUM(G11:G15)" });
});

test("legendFormulaCells: INTERNET/NETSUPPORT/ĐIỆN có TỔNG gốc ở dòng 10 và loại T/B/K ở 14-16 (nhãn A, số lượng C, tỷ lệ D)", () => {
    for (const layout of [FILE_LAYOUT.netsupport, FILE_LAYOUT.internet, FILE_LAYOUT.dien]) {
        const cells = legendFormulaCells(layout, 6); // đúng 6 dòng dữ liệu như mẫu gốc (4..9)
        assert.deepEqual(cells[0], { ref: "C14", formula: "COUNTIF(F4:F9,A14)" });
        assert.deepEqual(cells.at(-2), { ref: "C17", formula: "SUM(C14:C16)" });
        assert.deepEqual(cells.at(-1), { ref: "D17", formula: "SUM(D14:D16)" });
    }
});

test("legendFormulaCells: layout không có khối chú giải thì không có công thức", () => {
    assert.deepEqual(legendFormulaCells({ templateFile: "x", sheet: "S", firstDataRow: 4, totalRowBefore: 7, lastColumn: "G" }, 3), []);
});

const facility = (loai: CoSoVatChat["loai"], xepLoai: string | null, soLuong?: CoSoVatChat["soLuong"]): CoSoVatChat => ({ loai, xepLoai, soLuong });
const report = (id: string, facilities: CoSoVatChat[]): Report => ({
    maTinNhan: id, maNguoiGui: "u", maNhom: "g1", thoiGian: 1000, loaiBaoCao: "DauBuoi",
    data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "X", coSo: null }, khuVuc: "K", phongMay: "PM1", giaoVien: "GV", coSoVatChat: facilities },
});

test("buildFillSpecs wires each builder's rows, the header cells and the legend formulas per file", () => {
    const reports = [report("m1", [
        facility("AmThanh", "T"), facility("Internet", "K"), facility("NetSupport", "B"), facility("MayLanh", "T"),
        facility("MayTinh", "A", [{ loai: "Thieu", so: 3 }, { loai: "Loi", so: 1 }]),
    ])];
    const specs = buildFillSpecs(reports, "2026-09-28", Date.UTC(2026, 8, 28, 7, 5));

    assert.deepEqual(specs.loa.rows, [{ A: 1, B: "X", C: "K", D: "PM1", F: "T" }]);
    assert.deepEqual(specs.loa.headerCells, [{ ref: "E2", value: "Thứ: 2" }, { ref: "F2", value: "Ngày: 28/09/2026" }, { ref: "G2", value: "Thời gian: 14:05" }]);
    assert.deepEqual(specs.loa.formulaCells, legendFormulaCells(FILE_LAYOUT.loa, 1));

    assert.deepEqual(specs.mayTinh.rows, [{ A: 1, B: "X", C: "K", D: "PM1", E: null, F: 1, G: 3, I: null, J: "B" }]);
    assert.deepEqual(specs.mayTinh.headerCells, [{ ref: "J2", value: "Thứ: 2" }, { ref: "K2", value: "Ngày: 28/09/2026" }, { ref: "L2", value: "Thời gian: 14:05" }]);

    assert.deepEqual(specs.netsupport.rows, [{ A: 1, B: "X", C: "K", D: "PM1", F: "B" }]);
    assert.deepEqual(specs.internet.rows, [{ A: 1, B: "X", C: "K", D: "PM1", F: "K" }]);
    for (const key of ["netsupport", "internet", "dien"] as const) {
        assert.deepEqual(specs[key].headerCells, [{ ref: "E2", value: "Thứ: 2" }, { ref: "F2", value: "Ngày: 28/09/2026" }, { ref: "G2", value: "Thời gian: 14:05" }], key);
    }
});

test("buildFillSpecs: ĐIỆN lấy dòng từ tin LỖI ĐIỆN (tham số thứ 4), không lấy từ báo cáo buổi dạy; không có tin thì rỗng nhưng vẫn có đầu trang và công thức chú giải", () => {
    const withTin = buildFillSpecs([report("m1", [facility("MayLanh", "K")])], "2026-09-28", Date.now(), [{ maNhom: "g", maTinNhan: "e1", thoiGian: 1, tenTruong: "X", khuVuc: "K", phongMay: "PM1", tinhTrang: "K" }]);
    assert.deepEqual(withTin.dien.rows, [{ A: 1, B: "X", C: "K", D: "PM1", F: "K" }]);
    assert.deepEqual(withTin.dien.formulaCells, legendFormulaCells(FILE_LAYOUT.dien, 1));
    assert.equal(withTin.loa.rows.length, 0);
    const specs = buildFillSpecs([report("m1", [facility("MayLanh", "K")])], "2026-09-28");
    assert.deepEqual(specs.dien.rows, []);
    assert.deepEqual(specs.dien.formulaCells, legendFormulaCells(FILE_LAYOUT.dien, 0));
    assert.equal(specs.dien.headerCells.length, 3);
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

test(
    "readTemplateTitle reads the title (second line of A1) of each new template, which names the output file",
    { skip: templatesPresent ? false : `${templatesDir} không có trên máy này — bỏ qua` },
    () => {
        const titles = Object.fromEntries(Object.entries(FILE_LAYOUT).map(([k, l]) => [k, readTemplateTitle(path.join(templatesDir, l.templateFile), l.sheet)]));
        assert.deepEqual(titles, {
            loa: "TÌNH TRẠNG ÂM THANH",
            mayTinh: "TÌNH TRẠNG MÁY TÍNH",
            netsupport: "TÌNH TRẠNG NETSUPPORT",
            internet: "TÌNH TRẠNG INTERNET",
            dien: "TÌNH TRẠNG ĐIỆN",
        });
    },
);

test(
    "the real template files still have the sheet / TỔNG-row / legend layout the constants assume",
    { skip: templatesPresent ? false : `${templatesDir} không có trên máy này — bỏ qua kiểm tra đối chiếu thật` },
    () => {
        for (const [key, layout] of Object.entries(FILE_LAYOUT) as Array<[string, StatusFileLayout]>) {
            const wb = XLSX.readFile(path.join(templatesDir, layout.templateFile));
            const ws = wb.Sheets[layout.sheet];
            assert.ok(ws, `${key}: sheet "${layout.sheet}" không có trong ${layout.templateFile}`);
            for (const extra of layout.deleteSheets ?? []) assert.ok(wb.Sheets[extra], `${key}: sheet cần xoá "${extra}" không có trong ${layout.templateFile}`);
            assert.equal(ws[`A${layout.totalRowBefore}`]?.v, "TỔNG", `${key}: A${layout.totalRowBefore} trong ${layout.templateFile} không phải "TỔNG" — file mẫu đã đổi, cập nhật FILE_LAYOUT`);
            const headerRow = layout.firstDataRow - 1;
            const nextCol = String.fromCharCode(layout.lastColumn.charCodeAt(0) + 1);
            assert.ok(ws[`${layout.lastColumn}${headerRow}`], `${key}: cột ${layout.lastColumn} dòng ${headerRow} trống — lastColumn sai`);
            assert.ok(!ws[`${nextCol}${headerRow}`], `${key}: cột ${nextCol} dòng ${headerRow} vẫn có tiêu đề — lastColumn (${layout.lastColumn}) thiếu cột`);
            assert.equal(ws[`${layout.legend!.gradeCol}${headerRow}`]?.v, "XẾP LOẠI", `${key}: cột ${layout.legend!.gradeCol} không phải XẾP LOẠI`);
            // Mỗi dòng loại của chú giải có mã loại (T/B/K hoặc A-E) đúng chỗ, và dòng tổng của chú giải có ô TỔNG.
            const legend = layout.legend!;
            const labels = legend.gradeRowOffsets.map((off) => ws[`${legend.labelCol}${layout.totalRowBefore + off}`]?.v);
            assert.ok(labels.every((v) => typeof v === "string" && /^[A-E]$|^[TBK]$/.test(v)), `${key}: mã loại chú giải sai vị trí: ${JSON.stringify(labels)}`);
            assert.equal(ws[`${legend.labelCol}${layout.totalRowBefore + legend.sumRowOffset}`]?.v, "TỔNG", `${key}: dòng TỔNG của chú giải sai vị trí`);
        }
    },
);

test("PHASE_STATUS_KEYS: fill:status-reports của 4 giai đoạn chỉ làm 4 file; ĐIỆN có chu trình riêng (mỗi ngày một file) nên không nằm trong đó", () => {
    assert.deepEqual(PHASE_STATUS_KEYS, ["netsupport", "loa", "internet", "mayTinh"]);
    assert.ok(Object.keys(FILE_LAYOUT).includes("dien")); // báo cáo tổng vẫn dùng đủ 5
});
