import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBoSungRows, buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows, latestPerRoom, mayTinhGrade } from "../src/lesson/statusRows.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

const facility = (loai: CoSoVatChat["loai"], xepLoai: string | null, soLuong?: CoSoVatChat["soLuong"]): CoSoVatChat => ({ loai, xepLoai, soLuong });

function report(id: string, phongMay: string | null, facilities: CoSoVatChat[], over: Partial<Report["data"]> = {}): Report {
    return {
        maTinNhan: id,
        maNguoiGui: "u1",
        maNhom: "g1",
        thoiGian: 1000,
        loaiBaoCao: "DauBuoi",
        data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "CHU VĂN AN", coSo: null }, khuVuc: "BTAN", phongMay, giaoVien: "GV", coSoVatChat: facilities, ...over },
    };
}

test("latestPerRoom: cùng một phòng (maNhom+phongMay) báo cáo nhiều lần trong buổi thì chỉ giữ báo cáo có thoiGian lớn nhất", () => {
    const early = report("m1", "PM1", []);
    early.thoiGian = 1000;
    const late = report("m2", "PM1", []);
    late.thoiGian = 5000;
    assert.deepEqual(latestPerRoom([early, late]), [late]);
    assert.deepEqual(latestPerRoom([late, early]), [late]);
});

test("latestPerRoom: các phòng khác nhau (phongMay khác nhau) đều được giữ, không gộp lẫn nhau", () => {
    const a = report("m1", "PM1", []);
    const b = report("m2", "PM2", []);
    assert.deepEqual(latestPerRoom([a, b]).map((r) => r.maTinNhan).sort(), ["m1", "m2"]);
});

test("latestPerRoom: khớp phòng không phân biệt hoa thường/khoảng trắng thừa (giống khoá của bộ đếm SỐ LẦN)", () => {
    const a = report("m1", " pm1 ", []);
    a.thoiGian = 1000;
    const b = report("m2", "PM1", []);
    b.thoiGian = 2000;
    assert.deepEqual(latestPerRoom([a, b]), [b]);
});

test("latestPerRoom: report không có phongMay được giữ nguyên hết, không bị gộp với nhau", () => {
    const a = report("m1", null, []);
    const b = report("m2", null, []);
    assert.deepEqual(latestPerRoom([a, b]).map((r) => r.maTinNhan).sort(), ["m1", "m2"]);
});

test("mayTinhGrade: 0 is A, 1-5 is B, 6-9 is C, 10+ is D, null stays null", () => {
    assert.equal(mayTinhGrade(0), "A");
    assert.equal(mayTinhGrade(1), "B");
    assert.equal(mayTinhGrade(5), "B");
    assert.equal(mayTinhGrade(6), "C");
    assert.equal(mayTinhGrade(9), "C");
    assert.equal(mayTinhGrade(10), "D");
    assert.equal(mayTinhGrade(25), "D");
    assert.equal(mayTinhGrade(null), null);
});

test("BO SUNG: a room with thieu - loi > 0 gets a row naming the room, quantities equal to thieu", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 3 }, { loai: "Loi", so: 1 }])]);
    const rows = buildBoSungRows([r]);
    assert.deepEqual(rows, [{ A: 1, B: "LC", C: "CHU VĂN AN", D: "BTAN", J: "PM1", L: 3, M: 3 }]);
});

test("BO SUNG: thieu - loi exactly 0, or negative, or either missing, produces no row", () => {
    const equal = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 2 }, { loai: "Loi", so: 2 }])]);
    const negative = report("m2", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 1 }, { loai: "Loi", so: 3 }])]);
    const noThieu = report("m3", "PM1", [facility("MayTinh", "A", [{ loai: "Loi", so: 0 }])]);
    assert.deepEqual(buildBoSungRows([equal, negative, noThieu]), []);
});

test("BO SUNG: a report with no phongMay produces no row", () => {
    const r = report("m1", null, [facility("MayTinh", "A", [{ loai: "Thieu", so: 5 }, { loai: "Loi", so: 0 }])]);
    assert.deepEqual(buildBoSungRows([r]), []);
});

test("BO SUNG: STT numbers only the rows that qualify, in the order given", () => {
    const skip = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0 }])]);
    const a = report("m2", "PM2", [facility("MayTinh", "A", [{ loai: "Thieu", so: 1 }, { loai: "Loi", so: 0 }])]);
    const b = report("m3", "PM3", [facility("MayTinh", "A", [{ loai: "Thieu", so: 2 }, { loai: "Loi", so: 0 }])]);
    const rows = buildBoSungRows([skip, a, b]);
    assert.deepEqual(rows.map((r) => r.A), [1, 2]);
    assert.deepEqual(rows.map((r) => r.J), ["PM2", "PM3"]);
});

test("LOA: a room with an AmThanh grade gets a row with that grade and PM (tên phòng máy)", () => {
    const r = report("m1", "PM1", [facility("AmThanh", "K")]);
    assert.deepEqual(buildLoaRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", G: "K" }]);
});

test("LOA: no AmThanh grade (missing facility or null xepLoai) produces no row", () => {
    const missing = report("m1", "PM1", []);
    const nullGrade = report("m2", "PM1", [facility("AmThanh", null)]);
    assert.deepEqual(buildLoaRows([missing, nullGrade]), []);
});

test("LOA: rows are sorted by XẾP LOẠI in the order T, B, K (STT renumbered after sort)", () => {
    const t = report("m1", "PM1", [facility("AmThanh", "T")]);
    const b = report("m2", "PM2", [facility("AmThanh", "B")]);
    const k = report("m3", "PM3", [facility("AmThanh", "K")]);
    const rows = buildLoaRows([b, k, t]);
    assert.deepEqual(rows.map((r) => [r.A, r.G]), [[1, "T"], [2, "B"], [3, "K"]]);
});

test("INTERNET: XẾP LOẠI is the raw T/B/K, PM is the room name, SỐ LẦN comes from perMessage keyed by internet", () => {
    const r = report("m1", "PM1", [facility("Internet", "K")]);
    const perMessage = new Map([["m1|internet", 2]]);
    assert.deepEqual(buildInternetRows([r], perMessage), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", G: 2, I: "K" }]);
});

test("INTERNET: a message missing from perMessage defaults SỐ LẦN to 0", () => {
    const r = report("m1", "PM1", [facility("Internet", "T")]);
    assert.deepEqual(buildInternetRows([r], new Map()), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", G: 0, I: "T" }]);
});

test("INTERNET: rows are sorted by XẾP LOẠI in the order T, B, K", () => {
    const k = report("m1", "PM1", [facility("Internet", "K")]);
    const t = report("m2", "PM2", [facility("Internet", "T")]);
    const b = report("m3", "PM3", [facility("Internet", "B")]);
    const rows = buildInternetRows([k, t, b], new Map());
    assert.deepEqual(rows.map((r) => r.I), ["T", "B", "K"]);
});

test("NETSUPPORT: same shape as INTERNET, keyed by netsupport in perMessage, sorted T, B, K", () => {
    const r = report("m1", "PM1", [facility("NetSupport", "K")]);
    const perMessage = new Map([["m1|netsupport", 5]]);
    assert.deepEqual(buildNetSupportRows([r], perMessage), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", G: 5, I: "K" }]);
});

test("MÁY TÍNH: SM LỖI, SM THIẾU, XẾP LOẠI (by count), PM (tên phòng máy) are filled, and the lỗi note goes into HIỆN TRẠNG (not GHI CHÚ)", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 2 }, { loai: "Loi", so: 7, ghiChu: "máy 5 hỏng nguồn" }])]);
    assert.deepEqual(buildMayTinhRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", F: 7, G: 2, I: "máy 5 hỏng nguồn", K: "C" }]);
});

test("MÁY TÍNH: a report without a MayTinh entry at all produces no row", () => {
    const r = report("m1", "PM1", []);
    assert.deepEqual(buildMayTinhRows([r]), []);
});

test("MÁY TÍNH: no ghi chú (undefined) becomes null, not the string 'undefined'", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0 }])]);
    assert.equal(buildMayTinhRows([r])[0].I, null);
});
