import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBoSungRows, buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows, mayTinhGrade } from "../src/lesson/statusRows.js";
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

test("LOA: a room with an AmThanh grade gets a row with that grade; PM is never written", () => {
    const r = report("m1", "PM1", [facility("AmThanh", "K")]);
    assert.deepEqual(buildLoaRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: "K" }]);
});

test("LOA: no AmThanh grade (missing facility or null xepLoai) produces no row", () => {
    const missing = report("m1", "PM1", []);
    const nullGrade = report("m2", "PM1", [facility("AmThanh", null)]);
    assert.deepEqual(buildLoaRows([missing, nullGrade]), []);
});

test("INTERNET: XẾP LOẠI is the raw T/B/K, SỐ LẦN comes from perMessage keyed by internet", () => {
    const r = report("m1", "PM1", [facility("Internet", "K")]);
    const perMessage = new Map([["m1|internet", 2]]);
    assert.deepEqual(buildInternetRows([r], perMessage), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: 2, I: "K" }]);
});

test("INTERNET: a message missing from perMessage defaults SỐ LẦN to 0", () => {
    const r = report("m1", "PM1", [facility("Internet", "T")]);
    assert.deepEqual(buildInternetRows([r], new Map()), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: 0, I: "T" }]);
});

test("NETSUPPORT: same shape as INTERNET, keyed by netsupport in perMessage", () => {
    const r = report("m1", "PM1", [facility("NetSupport", "K")]);
    const perMessage = new Map([["m1|netsupport", 5]]);
    assert.deepEqual(buildNetSupportRows([r], perMessage), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: 5, I: "K" }]);
});

test("MÁY TÍNH: SM LỖI, SM THIẾU, XẾP LOẠI (by count) and GHI CHÚ (the lỗi note) are filled", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 2 }, { loai: "Loi", so: 7, ghiChu: "máy 5 hỏng nguồn" }])]);
    assert.deepEqual(buildMayTinhRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", F: 7, G: 2, K: "C", N: "máy 5 hỏng nguồn" }]);
});

test("MÁY TÍNH: a report without a MayTinh entry at all produces no row", () => {
    const r = report("m1", "PM1", []);
    assert.deepEqual(buildMayTinhRows([r]), []);
});

test("MÁY TÍNH: no ghi chú (undefined) becomes null, not the string 'undefined'", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0 }])]);
    assert.equal(buildMayTinhRows([r])[0].N, null);
});
