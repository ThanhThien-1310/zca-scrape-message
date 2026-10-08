import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows, latestPerRoom, mayTinhGrade } from "../src/lesson/statusRows.js";
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

test("mayTinhGrade: XẾP LOẠI theo SM THIẾU — <=2 A, <=4 B, <=6 C, <=8 D, >8 E (đúng CHÚ GIẢI của mẫu MÁY TÍNH), null giữ null", () => {
    assert.equal(mayTinhGrade(0), "A");
    assert.equal(mayTinhGrade(2), "A");
    assert.equal(mayTinhGrade(3), "B");
    assert.equal(mayTinhGrade(4), "B");
    assert.equal(mayTinhGrade(5), "C");
    assert.equal(mayTinhGrade(6), "C");
    assert.equal(mayTinhGrade(7), "D");
    assert.equal(mayTinhGrade(8), "D");
    assert.equal(mayTinhGrade(9), "E");
    assert.equal(mayTinhGrade(40), "E");
    assert.equal(mayTinhGrade(null), null);
});

test("LOA: a room with an AmThanh grade gets a row with that grade and PM (tên phòng máy)", () => {
    const r = report("m1", "PM1", [facility("AmThanh", "K")]);
    assert.deepEqual(buildLoaRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", F: "K" }]);
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
    assert.deepEqual(rows.map((r) => [r.A, r.F]), [[1, "T"], [2, "B"], [3, "K"]]);
});

test("INTERNET: XẾP LOẠI là T/B/K gốc ở cột F, PM là tên phòng máy, không còn cột SỐ LẦN", () => {
    const r = report("m1", "PM1", [facility("Internet", "K")]);
    assert.deepEqual(buildInternetRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", F: "K" }]);
});

test("INTERNET: rows are sorted by XẾP LOẠI in the order T, B, K", () => {
    const k = report("m1", "PM1", [facility("Internet", "K")]);
    const t = report("m2", "PM2", [facility("Internet", "T")]);
    const b = report("m3", "PM3", [facility("Internet", "B")]);
    const rows = buildInternetRows([k, t, b]);
    assert.deepEqual(rows.map((r) => r.F), ["T", "B", "K"]);
});

test("NETSUPPORT: cùng dạng với INTERNET nhưng đọc cơ sở vật chất NetSupport", () => {
    const r = report("m1", "PM1", [facility("NetSupport", "K"), facility("Internet", "T")]);
    assert.deepEqual(buildNetSupportRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", F: "K" }]);
});

test("INTERNET/NETSUPPORT: a report without that facility or with a null grade produces no row", () => {
    const none = report("m1", "PM1", []);
    const nullGrade = report("m2", "PM1", [facility("Internet", null), facility("NetSupport", null)]);
    assert.deepEqual(buildInternetRows([none, nullGrade]), []);
    assert.deepEqual(buildNetSupportRows([none, nullGrade]), []);
});

test("MÁY TÍNH: SM LỖI (F), SM THIẾU (G), XẾP LOẠI theo SM THIẾU (J), PM (D) được điền; ghi chú lỗi vào HIỆN TRẠNG (I); SM BỔ SUNG/NGUỒN TT để trống (TỔNG SM null khi tin không có)", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 5 }, { loai: "Loi", so: 7, ghiChu: "máy 5 hỏng nguồn" }])]);
    assert.deepEqual(buildMayTinhRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", D: "PM1", E: null, F: 7, G: 5, I: "máy 5 hỏng nguồn", J: "C" }]);
});

test("MÁY TÍNH: XẾP LOẠI để trống (null) khi tin không có số máy thiếu", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Loi", so: 3 }])]);
    const row = buildMayTinhRows([r])[0];
    assert.equal(row.G, null);
    assert.equal(row.J, null);
});

test("MÁY TÍNH: a report without a MayTinh entry at all produces no row", () => {
    const r = report("m1", "PM1", []);
    assert.deepEqual(buildMayTinhRows([r]), []);
});

test("MÁY TÍNH: no ghi chú (undefined) becomes null, not the string 'undefined'", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0 }])]);
    assert.equal(buildMayTinhRows([r])[0].I, null);
});

// --- cùng trường: gom các dòng liền nhau, chỉ dòng đầu hiện TÊN TRƯỜNG, các cột khác vẫn hiện ---
const school = (name: string): Partial<Report["data"]> => ({ truong: { capHoc: "LC", tenRieng: name, coSo: null } });
const hoaSen = (id: string, phong: string, f: CoSoVatChat[]) => report(id, phong, f, school("HOA SEN 1"));
const chuVanAn = (id: string, phong: string, f: CoSoVatChat[]) => report(id, phong, f, school("CHU VĂN AN"));

test("LOA: the same school's rooms are pulled together even when their grades sort them apart; only the first row shows the name", () => {
    // Thứ tự xếp loại thuần: HOA SEN PM1 (T), CHU VĂN AN (T), HOA SEN "Dạy tại lớp" (chưa có xếp loại -> cuối). Gom lại: HOA SEN x2 liền nhau.
    const a = hoaSen("m1", "PM1", [facility("AmThanh", "T")]);
    const b = chuVanAn("m2", "PM1", [facility("AmThanh", "T")]);
    const c = hoaSen("m3", "Dạy tại lớp", [facility("AmThanh", "")]);
    const rows = buildLoaRows([a, b, c]);
    assert.deepEqual(rows, [
        { A: 1, B: "HOA SEN 1", C: "BTAN", D: "PM1", F: "T" },
        { A: 2, C: "BTAN", D: "Dạy tại lớp", F: "" }, // không có B, nhưng C (KHU VỰC) và D (PM) vẫn hiện
        { A: 3, B: "CHU VĂN AN", C: "BTAN", D: "PM1", F: "T" },
    ]);
});

test("INTERNET and NETSUPPORT use the same school grouping (only the first row of a school shows the name)", () => {
    const a = hoaSen("m1", "PM1", [facility("Internet", "T"), facility("NetSupport", "T")]);
    const b = chuVanAn("m2", "PM1", [facility("Internet", "T"), facility("NetSupport", "T")]);
    const c = hoaSen("m3", "PM2", [facility("Internet", "K"), facility("NetSupport", "K")]);
    const net = buildInternetRows([a, b, c]);
    assert.deepEqual(net.map((r) => [r.B, r.D, r.F]), [["HOA SEN 1", "PM1", "T"], [undefined, "PM2", "K"], ["CHU VĂN AN", "PM1", "T"]]);
    const ns = buildNetSupportRows([a, b, c]);
    assert.deepEqual(ns.map((r) => [r.B, r.F]), [["HOA SEN 1", "T"], [undefined, "K"], ["CHU VĂN AN", "T"]]);
});

test("MÁY TÍNH: reports already in school order stay put; interleaved ones are grouped; STT stays 1..n by row", () => {
    const mt = (id: string, phong: string, school: Partial<Report["data"]>) => report(id, phong, [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 1 }])], school);
    const rows = buildMayTinhRows([mt("m1", "PM1", school("HOA SEN 1")), mt("m2", "PM1", school("CHU VĂN AN")), mt("m3", "PM2", school("HOA SEN 1"))]);
    assert.deepEqual(rows.map((r) => [r.A, r.B, r.D]), [[1, "HOA SEN 1", "PM1"], [2, undefined, "PM2"], [3, "CHU VĂN AN", "PM1"]]);
});

test("different school names are never merged, and a row with no school name is left alone", () => {
    const a = report("m1", "PM1", [facility("AmThanh", "T")], school("HOA SEN 1"));
    const b = report("m2", "PM1", [facility("AmThanh", "T")], school("HOA SEN 2"));
    const c = report("m3", "PM1", [facility("AmThanh", "T")], { truong: null });
    const d = report("m4", "PM2", [facility("AmThanh", "T")], { truong: null });
    const rows = buildLoaRows([a, b, c, d]);
    assert.deepEqual(rows.map((r) => r.B), ["HOA SEN 1", "HOA SEN 2", "", ""]);
});

test("MÁY TÍNH: TỔNG SM (E) lấy từ tongSoMay của báo cáo, kể cả số 0", () => {
    const mt = [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 1 }])];
    assert.equal(buildMayTinhRows([report("m1", "PM1", mt, { tongSoMay: 49 })])[0].E, 49);
    assert.equal(buildMayTinhRows([report("m2", "PM1", mt, { tongSoMay: 0 })])[0].E, 0);
    assert.equal(buildMayTinhRows([report("m3", "PM1", mt, { tongSoMay: null })])[0].E, null);
});
