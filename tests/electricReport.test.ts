import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyElectricTitle, electricEntriesOfDay, electricEntriesOfMessage, latestElectricPerRoom, parseElectricMessage } from "../src/lesson/electricReport.js";
import { buildDienRows } from "../src/lesson/statusRows.js";
import type { ElectricEntry } from "../src/types/index.js";
import { at, msg } from "./fixtures.js";

const SAMPLE = ["LỖI ĐIỆN", "- Trường: ", "- Khu vực:", "- Phòng Máy: PM1", "- Tình trạng:"].join("\n");
const FILLED = ["LỖI ĐIỆN", "- Trường: THCS Tân Đông Hiệp", "- Khu vực: DA", "- Phòng Máy: PM2", "- Tình trạng: Mất điện cả phòng"].join("\n");
const ALIASES = { "bot test": "LC_ChuVănAn_BTAN" };

test("classifyElectricTitle: dòng đầu phải đúng 'LỖI ĐIỆN' (không phân biệt hoa thường/dấu), không có gì thêm sau", () => {
    assert.equal(classifyElectricTitle(SAMPLE), true);
    assert.equal(classifyElectricTitle("\n  lỗi điện  \n- Phòng Máy: PM1"), true);
    assert.equal(classifyElectricTitle("LOI DIEN\n- Phòng Máy: PM1"), true);
    assert.equal(classifyElectricTitle("BÁO CÁO CUỐI BUỔI\n- Phòng Máy: PM1"), false);
    assert.equal(classifyElectricTitle("LỖI ĐIỆN HÔM NAY\n- Phòng Máy: PM1"), false);
    assert.equal(classifyElectricTitle(""), false);
});

test("parseElectricMessage: mẫu trống Trường/Khu vực/Tình trạng vẫn ra một dòng với phòng máy", () => {
    assert.deepEqual(parseElectricMessage(SAMPLE), [{ tenTruong: "", khuVuc: "", phongMay: "PM1", tinhTrang: "" }]);
});

test("parseElectricMessage: đọc đủ bốn trường, tình trạng nhiều dòng nối lại, bỏ tin không có phòng máy", () => {
    assert.deepEqual(parseElectricMessage(FILLED), [{ tenTruong: "THCS Tân Đông Hiệp", khuVuc: "DA", phongMay: "PM2", tinhTrang: "Mất điện cả phòng" }]);
    const multi = ["LỖI ĐIỆN", "- Trường: THCS A", "- Khu vực: DA", "- Phòng Máy: PM1", "- Tình trạng: Cháy ổ cắm", "dãy máy cuối không lên điện"].join("\n");
    assert.equal(parseElectricMessage(multi)[0].tinhTrang, "Cháy ổ cắm dãy máy cuối không lên điện");
    assert.deepEqual(parseElectricMessage("LỖI ĐIỆN\n- Trường: THCS A\n- Tình trạng: mất điện"), []);
});

test("parseElectricMessage: một tin nhiều phòng máy ra nhiều dòng, dùng chung Trường/Khu vực", () => {
    const multi = ["LỖI ĐIỆN", "- Trường: THCS A", "- Khu vực: DA", "- Phòng Máy: PM1", "- Tình trạng: Mất điện", "- Phòng Máy: PM2", "- Tình trạng: Chập chờn"].join("\n");
    assert.deepEqual(parseElectricMessage(multi), [
        { tenTruong: "THCS A", khuVuc: "DA", phongMay: "PM1", tinhTrang: "Mất điện" },
        { tenTruong: "THCS A", khuVuc: "DA", phongMay: "PM2", tinhTrang: "Chập chờn" },
    ]);
});

test("electricEntriesOfMessage: Trường/Khu vực trống lấy từ TÊN NHÓM (qua groupAliases như báo cáo buổi dạy); có điền thì giữ như đã điền", () => {
    const fromTest = electricEntriesOfMessage(msg(SAMPLE, at(8, 30), { groupId: "gT", groupName: "bot test" }), ALIASES);
    assert.equal(fromTest.length, 1);
    assert.equal(fromTest[0].maNhom, "gT");
    assert.equal(fromTest[0].thoiGian, at(8, 30));
    assert.equal(fromTest[0].phongMay, "PM1");
    assert.equal(fromTest[0].khuVuc, "BTAN");
    assert.notEqual(fromTest[0].tenTruong, "");
    const filled = electricEntriesOfMessage(msg(FILLED, at(8, 30), { groupName: "bot test" }), ALIASES);
    assert.deepEqual([filled[0].tenTruong, filled[0].khuVuc], ["THCS Tân Đông Hiệp", "DA"]);
    assert.deepEqual(electricEntriesOfMessage(msg("Chào cả nhóm", at(8, 30)), ALIASES), []);
});

const entry = (over: Partial<ElectricEntry>): ElectricEntry => ({ maNhom: "g1", maTinNhan: "m1", thoiGian: 1000, tenTruong: "THCS X", khuVuc: "DA", phongMay: "PM1", tinhTrang: "Mất điện", ...over });

test("latestElectricPerRoom: mỗi phòng (nhóm + tên phòng) giữ tin MỚI NHẤT, phòng khác nhau giữ riêng", () => {
    const out = latestElectricPerRoom([
        entry({ maTinNhan: "a", thoiGian: 1000, tinhTrang: "Mất điện" }),
        entry({ maTinNhan: "b", thoiGian: 2000, tinhTrang: "Đã có điện lại", phongMay: " pm1 " }),
        entry({ maTinNhan: "c", thoiGian: 1500, phongMay: "PM2" }),
        entry({ maTinNhan: "d", thoiGian: 1500, maNhom: "g2" }),
    ]);
    assert.deepEqual(out.map((e) => e.maTinNhan).sort(), ["b", "c", "d"]);
});

test("buildDienRows: Tình trạng T/B/K vào XẾP LOẠI (F) và sắp T, B, K; chữ khác vào HIỆN TRẠNG (E) xếp sau; GHI CHÚ (G) để trống; cùng trường liền nhau, chỉ dòng đầu hiện tên", () => {
    const rows = buildDienRows([
        entry({ phongMay: "PM1", tinhTrang: "K" }),
        entry({ tenTruong: "THCS Y", phongMay: "PM1", tinhTrang: "t" }),
        entry({ phongMay: "PM2", tinhTrang: " b " }),
        entry({ tenTruong: "THCS Z", phongMay: "PM1", tinhTrang: "bị nổ" }),
        entry({ tenTruong: "THCS W", phongMay: "PM1", tinhTrang: "" }),
    ]);
    assert.deepEqual(rows, [
        { A: 1, B: "THCS Y", C: "DA", D: "PM1", F: "T" },
        { A: 2, B: "THCS X", C: "DA", D: "PM2", F: "B" },
        { A: 3, C: "DA", D: "PM1", F: "K" },
        { A: 4, B: "THCS Z", C: "DA", D: "PM1", E: "bị nổ" },
        { A: 5, B: "THCS W", C: "DA", D: "PM1" },
    ]);
    for (const row of rows) assert.ok(!("G" in row));
    assert.deepEqual(buildDienRows([]), []);
});

test("electricEntriesOfDay: nhận CẢ NGÀY (mọi giờ, không theo buổi), bỏ tin của ngày khác, mỗi phòng giữ tin mới nhất", () => {
    const early = msg(FILLED, at(7, 0));
    const later = msg(FILLED.replace("Mất điện cả phòng", "Đã có điện lại"), at(13, 30));
    const otherRoom = msg(FILLED.replace("PM2", "PM3"), at(20, 0));
    const yesterday = msg(FILLED, at(23, 0) - 86400000);
    const tomorrow = msg(FILLED, at(1, 0) + 86400000);
    const day = "2026-09-24";
    const out = electricEntriesOfDay([early, later, otherRoom, yesterday, tomorrow], day, ALIASES);
    assert.deepEqual(out.map((e) => [e.maTinNhan, e.phongMay, e.tinhTrang]).sort(), [[later.msgId, "PM2", "Đã có điện lại"], [otherRoom.msgId, "PM3", "Mất điện cả phòng"]].sort());
    assert.deepEqual(electricEntriesOfDay([early, later], "2026-09-25", ALIASES), []);
    assert.deepEqual(electricEntriesOfDay([msg("Chào cả nhóm", at(8, 0))], day, ALIASES), []);
});
