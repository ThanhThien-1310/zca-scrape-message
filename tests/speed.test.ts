import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { internetSpeedEntries, parseInternetMessage } from "../src/lesson/internetSpeedReport.js";
import { buildInternetSpeedRows, gradeOfEntry, INTERNET_SPEED_LAYOUT, internetSpeedHeaderCells } from "../src/lesson/internetSpeedRows.js";
import { applyHumanSpeedRow, parseSpeedFix } from "../src/speed/apply.js";
import { loadSpeedByMessage, type SpeedForMessage } from "../src/speed/measures.js";
import { reviewSpeed, speedRowsOf, validateSpeedRow } from "../src/speed/review.js";
import { gradeOfMbps, toMbps } from "../src/speed/units.js";
import { processBundle } from "../src/vision/pipeline.js";
import { loadRules } from "../src/vision/rules.js";
import type { BundleReading, ReadInput, ReadResult, SourceMessage, VisionReader } from "../src/types/index.js";
import { leaveReadingOf, leaveRow, manifestOf, readingOf, T0 } from "./helpers/visionFixtures.js";

const rules = loadRules();
const lan = (rows: unknown[], conf: "cao" | "vua" | "thap" = "cao"): BundleReading => readingOf(["speedtest"], { speedtest: { lan: rows } }, conf);

test("toMbps converts Kbps, Mbps and Gbps and refuses any other unit", () => {
    assert.equal(toMbps(500, "Kbps"), 0.5);
    assert.equal(toMbps(95.4, "Mbps"), 95.4);
    assert.equal(toMbps(1.2, "Gbps"), 1200);
    assert.equal(toMbps(1234, "Kbps"), 1.23, "rounded to two decimals");
    for (const u of ["kb/s", "KBPS", " Kbit/s ", "kbit/s"]) assert.equal(toMbps(1000, u), 1, u);
    for (const u of ["Mb/s", "Mbit/s", " mbps "]) assert.equal(toMbps(5, u), 5, u);
    for (const u of ["MB/s", "KB/s", "bps", "", "xyz", null, undefined]) assert.equal(toMbps(5, u as string | null), null, String(u));
    assert.equal(toMbps(-1, "Mbps"), null);
    assert.equal(toMbps(Number.NaN, "Mbps"), null);
});

test("the grade follows the speed: A from 20, B from 10, C below 10", () => {
    assert.deepEqual([20, 19.99, 10, 9.99, 0.5, 300].map(gradeOfMbps), ["A", "B", "B", "C", "C", "A"]);
});

test("a speed row is valid with a positive number and a known unit, or when the photo says there is no internet", () => {
    assert.deepEqual(validateSpeedRow({ tocDo: 95.4, donVi: "Mbps", khongCoMang: false }), { ok: true, hard: [], mbps: 95.4, noInternet: false });
    assert.equal(validateSpeedRow({ tocDo: 500, donVi: "Kbps" }).mbps, 0.5);
    assert.deepEqual(validateSpeedRow({ tocDo: null, donVi: null, khongCoMang: true }), { ok: true, hard: [], mbps: null, noInternet: true });
    assert.match(validateSpeedRow({ tocDo: null, donVi: "Mbps" }).hard.join(" "), /không đọc được số tốc độ/);
    assert.match(validateSpeedRow({ tocDo: 50, donVi: "xyz" }).hard.join(" "), /đơn vị tốc độ không nhận ra/);
    assert.match(validateSpeedRow({ tocDo: 50, donVi: null }).hard.join(" "), /đơn vị/);
    assert.match(validateSpeedRow({ tocDo: 0.001, donVi: "Kbps" }).hard.join(" "), /ngoài khoảng hợp lý/);
    assert.match(validateSpeedRow({ tocDo: 1e9, donVi: "Mbps" }).hard.join(" "), /ngoài khoảng hợp lý/);
    assert.match(validateSpeedRow({ tocDo: -5, donVi: "Mbps" }).hard.join(" "), /không đọc được số tốc độ/);
});

test("speedRowsOf keeps every position (junk becomes an empty row)", () => {
    assert.deepEqual(speedRowsOf(lan([{ tocDo: 1, donVi: "Mbps" }, "rác", null])).map((r) => Object.keys(r).length), [2, 0, 0]);
    assert.deepEqual(speedRowsOf(readingOf(["khac"])), []);
});

test("reviewSpeed: no speed photo means nothing to review; a clean bundle passes; a bad unit sends only that row to review", () => {
    assert.equal(reviewSpeed({ rules, first: readingOf(["khac"]), second: null }), null);
    const clean = reviewSpeed({ rules, first: lan([{ tocDo: 95, donVi: "Mbps", khongCoMang: false }]), second: null })!;
    assert.deepEqual(clean.rows.map((r) => r.status), ["tu_dong_dat"]);
    const mixed = reviewSpeed({ rules, first: readingOf(["speedtest", "speedtest"], { speedtest: { lan: [{ tocDo: 95, donVi: "Mbps" }, { tocDo: 50, donVi: "xyz" }] } }), second: null })!;
    assert.deepEqual(mixed.rows.map((r) => r.status), ["tu_dong_dat", "can_xem"]);
});

test("reviewSpeed: low confidence, a second read that differs, a different number of measurements, or a failed second read", () => {
    const first = lan([{ tocDo: 95, donVi: "Mbps" }]);
    assert.equal(reviewSpeed({ rules, first: lan([{ tocDo: 95, donVi: "Mbps" }], "thap"), second: null })!.rows[0].status, "can_xem");
    assert.equal(reviewSpeed({ rules, first, second: { ok: true, reading: lan([{ tocDo: 95, donVi: "Mbps" }]) } })!.rows[0].status, "tu_dong_dat");
    const differs = reviewSpeed({ rules, first, second: { ok: true, reading: lan([{ tocDo: 59, donVi: "Mbps" }]) } })!;
    assert.equal(differs.rows[0].status, "can_xem");
    assert.match(differs.rows[0].reasons.join(" "), /speedtest\.lan\[0\]\.tocDo/);
    const more = reviewSpeed({ rules, first, second: { ok: true, reading: lan([{ tocDo: 95, donVi: "Mbps" }, { tocDo: 1, donVi: "Mbps" }]) } })!;
    assert.match(more.reasons.join(" "), /số lần đo/);
    assert.match(reviewSpeed({ rules, first, second: { ok: false, error: "hết hạn mức" } })!.reasons.join(" "), /đọc lần hai lỗi: hết hạn mức/);
});

test("parseSpeedFix validates what a person types", () => {
    assert.deepEqual(parseSpeedFix("tocDo=95.4"), { column: "tocDo", value: 95.4 });
    assert.deepEqual(parseSpeedFix("tocDo=null"), { column: "tocDo", value: null });
    assert.deepEqual(parseSpeedFix("donVi=Kbps"), { column: "donVi", value: "Kbps" });
    assert.deepEqual(parseSpeedFix("khongCoMang=true"), { column: "khongCoMang", value: true });
    assert.deepEqual(parseSpeedFix("khongCoMang=khong"), { column: "khongCoMang", value: false });
    for (const bad of ["tocDo=-5", "tocDo=abc", "tocDo=0", "donVi=MB/s", "khongCoMang=maybe", "mau=do", "khong-co-dau-bang"]) assert.throws(() => parseSpeedFix(bad), /./, bad);
});

const REPORT = (school: string, rooms: Array<[string, string | null]>): string =>
    [`BÁO CÁO CUỐI BUỔI`, `Tên trường: ${school}`, `- Tên IT: An`, ...rooms.flatMap(([name, net]) => [`* Phòng máy: ${name} (P. Vi Tính)`, `- Tổng số máy: 49`, ...(net ? [`- Internet: ${net}`] : []), `- Vệ sinh sạch sẽ: Có`])].join("\n");
const msg = (content: string, ts: number, id = String(ts)): SourceMessage => ({ msgId: id, groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u", senderName: "IT", isSelf: false, ts, msgType: "desktop.text", content } as SourceMessage);
const all = () => true;
const pt = (mbps: number | null, extra: Partial<{ usable: boolean; noInternet: boolean }> = {}) => ({ usable: true, mbps, noInternet: false, ...extra });
const speedOf = (id: string, points: ReturnType<typeof pt>[]): Map<string, SpeedForMessage> => new Map([[id, { bundleId: "b", sentTs: 1, points }]]);

test("parseInternetMessage reads the school, every room block and its Internet line", () => {
    const p = parseInternetMessage(REPORT("THCS Vĩnh Lộc B - BC", [["PM1", "Có"], ["PM3", "Không"], ["PM4", null]]))!;
    assert.deepEqual([p.cap, p.tenTruong, p.khuVuc], ["THCS", "VĨNH LỘC B", "BC"]);
    assert.deepEqual(p.rooms, [{ phongMay: "PM1", internet: "co" }, { phongMay: "PM3", internet: "khong" }, { phongMay: "PM4", internet: null }]);
    assert.equal(parseInternetMessage("BÁO CÁO CUỐI BUỔI\nTên trường: THCS A - BC"), null, "no room block");
    assert.equal(parseInternetMessage(REPORT("THCS A - BC", [["PM1", "Có"]]).replace("Tên trường", "Truong")), null, "no school line");
    assert.equal(parseInternetMessage("BÁO CÁO CUỐI BUỔI DẠY\nTên trường: THCS A - BC\n* Phòng máy: PM1\n- Internet: Có"), null, "another report");
});

test("two room blocks in ONE message share the one speed photo of that school", () => {
    const m = msg(REPORT("THCS Vĩnh Lộc B - BC", [["PM1", "Có"], ["PM3", "Có"]]), 1000, "r1");
    const entries = internetSpeedEntries([m], all, speedOf("r1", [pt(45.5)]));
    assert.deepEqual(entries.map((e) => [e.phongMay, e.mbps]), [["PM1", 45.5], ["PM3", 45.5]]);
});

test("as many photos as rooms are matched in order; any other count is not matched", () => {
    const two = msg(REPORT("THCS A - BC", [["PM1", "Có"], ["PM2", "Có"]]), 1000, "r1");
    assert.deepEqual(internetSpeedEntries([two], all, speedOf("r1", [pt(5), pt(50)])).map((e) => [e.phongMay, e.mbps]), [["PM1", 5], ["PM2", 50]]);
    assert.deepEqual(internetSpeedEntries([two], all, speedOf("r1", [pt(5), pt(50), pt(9)])).map((e) => e.mbps), [null, null]);
});

test("a photo that could not be used leaves the speed blank; a later report without a photo keeps the earlier speed; the latest Internet flag wins", () => {
    const m1 = msg(REPORT("THCS A - BC", [["PM1", "Có"]]), 1000, "r1");
    const m2 = msg(REPORT("THCS A - BC", [["PM1", "Có"]]), 2000, "r2");
    assert.equal(internetSpeedEntries([m1], all, speedOf("r1", [pt(null, { usable: false })]))[0].mbps, null);
    assert.equal(internetSpeedEntries([m1, m2], all, speedOf("r1", [pt(33)]))[0].mbps, 33);
    const m3 = msg(REPORT("THCS A - BC", [["PM1", "Không"]]), 3000, "r3");
    const e = internetSpeedEntries([m1, m2, m3], all, speedOf("r1", [pt(33)]));
    assert.equal(e.length, 1, "one row per (school, area, room)");
    assert.equal(gradeOfEntry(e[0]), "D");
});

test("the time filter and the area both separate rows", () => {
    const a = msg(REPORT("THCS An Phú - BC", [["PM1", "Có"]]), 1000);
    const b = msg(REPORT("THCS An Phú - HM", [["PM1", "Có"]]), 2000);
    const old = msg(REPORT("THCS Cũ - BC", [["PM1", "Có"]]), 10);
    assert.equal(internetSpeedEntries([a, b, old], all, new Map()).length, 3);
    assert.equal(internetSpeedEntries([a, b, old], (ts) => ts >= 1000, new Map()).length, 2);
});

test("grades: D for no internet (message or photo), A/B/C by speed, blank when there is no usable photo", () => {
    const base = { cap: "", tenTruong: "X", khuVuc: "BC", phongMay: "PM1", thoiGian: 1, maTinNhan: "m" };
    assert.equal(gradeOfEntry({ ...base, internet: "khong", mbps: 99, noInternet: false }), "D");
    assert.equal(gradeOfEntry({ ...base, internet: "co", mbps: null, noInternet: true }), "D");
    assert.deepEqual([25, 12, 3].map((mbps) => gradeOfEntry({ ...base, internet: "co", mbps, noInternet: false })), ["A", "B", "C"]);
    assert.equal(gradeOfEntry({ ...base, internet: "co", mbps: null, noInternet: false }), "");
});

test("rows are sorted D, C, B, A, with rooms that have no grade last; slower first inside a grade; blank columns stay blank", () => {
    const e = (tenTruong: string, internet: "co" | "khong", mbps: number | null) => ({ cap: "THCS", tenTruong, khuVuc: "BC", phongMay: "PM1", internet, mbps, noInternet: false, thoiGian: 1, maTinNhan: "m" });
    const rows = buildInternetSpeedRows([e("A1", "co", 50), e("B1", "co", null), e("C2", "co", 8), e("D1", "khong", null), e("C1", "co", 3), e("B2", "co", 12)], "2026-10-07");
    assert.deepEqual(rows.map((r) => [r.C, r.G ?? ""]), [["D1", "D"], ["C1", "C"], ["C2", "C"], ["B2", "B"], ["A1", "A"], ["B1", ""]]);
    assert.deepEqual(rows.map((r) => r.A), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(rows[0], { A: 1, B: "II", C: "D1", D: "BC", E: "PM1", H: "'07/10/2026", G: "D" }, "D has no speed");
    assert.equal(rows[1].F, 3);
    assert.equal("F" in rows[5], false, "no photo, no speed");
    for (const r of rows) assert.equal("I" in r, false, "GHI CHÚ stays blank");
});

test("the header date is a real date shown dd/mm/yyyy", () => {
    assert.deepEqual(internetSpeedHeaderCells("2026-10-07"), [{ ref: "I2", value: 46302, numberFormat: "dd/mm/yyyy" }]);
    assert.equal(INTERNET_SPEED_LAYOUT.legend, undefined, "the template's own filter-aware legend formulas are kept");
});

const REAL = path.join("data", "mau bao cao new", INTERNET_SPEED_LAYOUT.templateFile);
test("the real template still has the headers the layout relies on", { skip: !fs.existsSync(REAL) }, async () => {
    const { default: XLSX } = await import("xlsx");
    const ws = XLSX.readFile(REAL).Sheets[INTERNET_SPEED_LAYOUT.sheet];
    assert.deepEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((c) => String(ws[`${c}3`]?.v).trim()), ["STT", "CẤP", "TÊN TRƯỜNG", "KHU VỰC", "PM", "TỐC ĐỘ", "XẾP LOẠI", "NGÀY CẬP NHẬT", "GHI CHÚ"]);
    assert.equal(ws["A11"]?.v, "TỔNG");
    assert.match(String(ws["A1"]?.v), /TRẠNG THÁI KẾT NỐI INTERNET/);
});

// ---- trên đĩa: gắn lần đo vào tin báo cáo, người xem sửa, và chu trình đọc ----

function bundleOnDisk(root: string, id: string, reading: BundleReading, review: unknown, texts: Array<{ msgId: string }>, firstTs = T0): string {
    const dir = path.join(root, "2026-10-07", "g1", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestOf(reading.images.length, { bundleId: id, firstTs, texts: texts.map((t) => ({ msgId: t.msgId, ts: 1, content: "x" })) })));
    fs.writeFileSync(path.join(dir, "reading.json"), JSON.stringify(reading));
    fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(review));
    return dir;
}
const reviewWith = (reading: BundleReading, second: Parameters<typeof reviewSpeed>[0]["second"] = null) => ({ status: "tu_dong_dat" as const, reasons: [], notes: [], rows: [], secondRead: { ran: false, disagree: [] }, speed: reviewSpeed({ rules, first: reading, second })! });

test("loadSpeedByMessage attaches the measurements to the report messages sent with the photos; a person's fix makes a held row usable", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "speed-"));
    const reading = readingOf(["speedtest", "speedtest"], { speedtest: { lan: [{ tocDo: 500, donVi: "Kbps" }, { tocDo: 50, donVi: "xyz" }] } });
    bundleOnDisk(root, "b1", reading, reviewWith(reading), [{ msgId: "t1" }, { msgId: "t2" }]);
    const map = loadSpeedByMessage(root, "2026-10-01");
    assert.deepEqual([...map.keys()].sort(), ["t1", "t2"]);
    assert.deepEqual(map.get("t1")!.points, [{ usable: true, mbps: 0.5, noInternet: false }, { usable: false, mbps: null, noInternet: false }]);

    const fixed = applyHumanSpeedRow(reviewWith(reading) as never, 1, "sua", { donVi: "Mbps" }, 5);
    assert.equal(fixed.speed!.rows[1].status, "da_sua");
    bundleOnDisk(root, "b1", reading, fixed, [{ msgId: "t1" }]);
    assert.deepEqual(loadSpeedByMessage(root, "2026-10-01").get("t1")!.points.map((p) => p.mbps), [0.5, 50]);
});

test("loadSpeedByMessage: the latest bundle wins for a message, dismissed bundles and old days are ignored", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "speed-"));
    const a = lan([{ tocDo: 10, donVi: "Mbps" }]);
    const b = lan([{ tocDo: 70, donVi: "Mbps" }]);
    bundleOnDisk(root, "old", a, reviewWith(a), [{ msgId: "t1" }], T0);
    bundleOnDisk(root, "new", b, reviewWith(b), [{ msgId: "t1" }], T0 + 1000);
    assert.equal(loadSpeedByMessage(root, "2026-10-01").get("t1")!.points[0].mbps, 70);
    bundleOnDisk(root, "new", b, { ...reviewWith(b), dismissed: true }, [{ msgId: "t1" }], T0 + 1000);
    assert.equal(loadSpeedByMessage(root, "2026-10-01").get("t1")!.points[0].mbps, 10);
    assert.equal(loadSpeedByMessage(root, "2026-11-01").size, 0, "since-day filter");
});

test("applyHumanSpeedRow: confirm only a row under review, fix needs a column, and the bundle status follows the worst row", () => {
    const reading = readingOf(["speedtest", "speedtest"], { speedtest: { lan: [{ tocDo: 95, donVi: "Mbps" }, { tocDo: 5, donVi: "xyz" }] } });
    const base = { ...reviewWith(reading), status: "can_xem" as const };
    assert.throws(() => applyHumanSpeedRow(base as never, 0, "xac_nhan", {}, 1), /không cần xác nhận/);
    assert.throws(() => applyHumanSpeedRow(base as never, 1, "sua", {}, 1), /ít nhất một/);
    assert.throws(() => applyHumanSpeedRow(base as never, 9, "bo", {}, 1), /không có lần đo tốc độ 9/);
    const confirmed = applyHumanSpeedRow(base as never, 1, "xac_nhan", {}, 1);
    assert.equal(confirmed.status, "da_xac_nhan");
    assert.equal(applyHumanSpeedRow(base as never, 1, "bo", {}, 1).status, "tu_dong_dat", "the other row is still automatic");
});

function fake(first: ReadResult, second?: ReadResult) {
    const calls: number[] = [];
    const reader: VisionReader = { async readBundle(input: ReadInput) { calls.push(input.pass); return input.pass === 1 ? first : (second ?? first); } };
    return { reader, calls };
}

test("processBundle reviews the speed photos next to the leave rows: clean bundle is read once; a doubtful measurement triggers the second read and the worst status wins", async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pipe-")), "2026-10-07", "g1", "b1");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestOf(1)));
    const cfg = { maxPastDays: 7, maxFutureDays: 120 };
    const clean = fake({ ok: true, reading: lan([{ tocDo: 95, donVi: "Mbps", khongCoMang: false }]) });
    const r = await processBundle(dir, { reader: clean.reader, rules, cfg });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(clean.calls, [1]);
    assert.equal(r.review.status, "tu_dong_dat");
    assert.deepEqual(r.review.speed!.rows.map((x) => x.status), ["tu_dong_dat"]);

    const doubtful = fake({ ok: true, reading: lan([{ tocDo: 95, donVi: "xyz" }]) });
    const r2 = await processBundle(dir, { reader: doubtful.reader, rules, cfg });
    assert.ok(r2.ok);
    assert.deepEqual(doubtful.calls, [1, 2]);
    if (r2.ok) assert.equal(r2.review.status, "can_xem");

    const mixed = fake({ ok: true, reading: { ...leaveReadingOf([leaveRow()], "cao", 1), images: [{ seq: 1, loai: "leave", doTinCay: "cao" }] } });
    const r3 = await processBundle(dir, { reader: mixed.reader, rules, cfg });
    assert.ok(r3.ok);
    if (r3.ok) assert.equal(r3.review.speed, undefined, "no speed photo: no speed section");
});
