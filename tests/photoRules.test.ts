import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRules, parseRule } from "../src/vision/rules.js";

const base = () => ({
    id: "demo",
    version: 1,
    title: "Demo",
    nhanRa: "Ảnh demo",
    soLuongMoiBo: { toiThieu: 1, toiDa: 2 },
    truong: [{ ten: "a", kieu: "so", batBuoc: true, min: 0, max: 10 }],
    docLanHai: "khong",
    nguongTinCay: "vua",
});

test("the shipped leave rule loads with the documented shape", () => {
    const rules = loadRules();
    assert.deepEqual(rules.map((r) => r.id), ["bienban", "leave", "speedtest"]);
    const leave = rules.find((r) => r.id === "leave")!;
    assert.deepEqual(leave.soLuongMoiBo, { toiThieu: 1, toiDa: 5 });
    assert.deepEqual(leave.truong.map((f) => f.ten), ["ngayBaoCao", "nguoiBaoCao", "boPhan", "dong"]);
    const dong = leave.truong.find((f) => f.ten === "dong")!;
    assert.equal(dong.kieu, "danh_sach");
    assert.deepEqual(dong.phanTu!.map((c) => c.ten), ["hoTen", "tuGio", "tuThu", "tuNgay", "denGio", "denThu", "denNgay", "soNgay", "lyDo"]);
    assert.equal(leave.docLanHai, "khi_tin_cay_thap");
    assert.equal(leave.nguongTinCay, "vua");
});

test("a valid rule parses and keeps its fields", () => {
    const r = parseRule(base(), "demo.json");
    assert.equal(r.truong[0].max, 10);
    assert.equal(r.truong[0].batBuoc, true);
});

test("errors name the file and the field path", () => {
    assert.throws(() => parseRule({ ...base(), id: "Khac" }, "demo.json"), /demo\.json: gốc\.id/);
    assert.throws(() => parseRule({ ...base(), id: "khac" }, "khac.json"), /gốc\.id/);
    assert.throws(() => parseRule({ ...base(), version: 0 }, "demo.json"), /gốc\.version/);
    assert.throws(() => parseRule({ ...base(), soLuongMoiBo: { toiThieu: 3, toiDa: 2 } }, "demo.json"), /soLuongMoiBo/);
    assert.throws(() => parseRule({ ...base(), truong: [] }, "demo.json"), /gốc\.truong/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "lạ" }] }, "demo.json"), /truong\[0\]\.kieu/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "so" }, { ten: "a", kieu: "chu" }] }, "demo.json"), /trùng/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "so", min: 5, max: 1 }] }, "demo.json"), /min/);
    assert.throws(() => parseRule({ ...base(), docLanHai: "đôi khi" }, "demo.json"), /docLanHai/);
    assert.throws(() => parseRule({ ...base(), nguongTinCay: "thap" }, "demo.json"), /nguongTinCay/);
});

test("danh_sach needs columns and cannot nest", () => {
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "ds", kieu: "danh_sach" }] }, "demo.json"), /phanTu/);
    const nested = { ...base(), truong: [{ ten: "ds", kieu: "danh_sach", phanTu: [{ ten: "x", kieu: "danh_sach", phanTu: [{ ten: "y", kieu: "so" }] }] }] };
    assert.throws(() => parseRule(nested, "demo.json"), /lồng/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "so", phanTu: [] }] }, "demo.json"), /phanTu/);
});

test("loadRules requires the id to equal the file name, and ignores a missing folder", () => {
    assert.deepEqual(loadRules(path.join(os.tmpdir(), "khong-co-thu-muc-nay")), []);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-"));
    fs.writeFileSync(path.join(dir, "demo.json"), JSON.stringify(base()), "utf8");
    assert.equal(loadRules(dir)[0].id, "demo");
    fs.writeFileSync(path.join(dir, "khac-ten.json"), JSON.stringify(base()), "utf8");
    assert.throws(() => loadRules(dir), /khac-ten\.json/);
    fs.writeFileSync(path.join(dir, "khac-ten.json"), "{ không phải json", "utf8");
    assert.throws(() => loadRules(dir), /không phải JSON/);
});
