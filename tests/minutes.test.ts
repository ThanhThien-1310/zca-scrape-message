import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { minutesEntries } from "../src/lesson/minutesReport.js";
import { buildMinutesRows, MINUTES_LAYOUT, minutesHeaderCells } from "../src/lesson/minutesRows.js";
import { applyHumanMinutesRow, parseMinutesFix } from "../src/minutes/apply.js";
import { loadMinutesByMessage, type MinutesForMessage, type MinutesItem } from "../src/minutes/measures.js";
import { minutesRowsOf, reviewMinutes, validateMinutesRow } from "../src/minutes/review.js";
import { loadRules } from "../src/vision/rules.js";
import type { BundleReading, SourceMessage } from "../src/types/index.js";
import { manifestOf, readingOf, T0 } from "./helpers/visionFixtures.js";

const rules = loadRules();
const good = { tieuDe: "BIÊN BẢN BÀN GIAO PHÒNG MÁY CHO TRƯỜNG", daiDienCty: "Vũ Nguyễn Quang Vinh", daiDienTruong: "Cao Minh Trung", boPhanTruong: "Văn phòng", laTrangTiep: false };
const reading = (rows: unknown[], conf: "cao" | "vua" | "thap" = "cao"): BundleReading => readingOf(rows.map(() => "bienban"), { bienban: { bienBan: rows } }, conf);

test("a minutes row needs title, both representatives and the school department, and must not be a continuation page", () => {
    assert.deepEqual(validateMinutesRow(good), { ok: true, hard: [] });
    assert.match(validateMinutesRow({ ...good, daiDienTruong: "  " }).hard.join(" "), /đại diện trường/);
    assert.match(validateMinutesRow({ ...good, boPhanTruong: null }).hard.join(" "), /bộ phận bên trường/);
    assert.match(validateMinutesRow({ ...good, tieuDe: "" }).hard.join(" "), /tiêu đề/);
    assert.match(validateMinutesRow({ ...good, laTrangTiep: true }).hard.join(" "), /trang tiếp theo/);
});

test("minutesRowsOf keeps every position", () => {
    assert.deepEqual(minutesRowsOf(reading([good, "rác", null])).map((r) => Object.keys(r).length), [5, 0, 0]);
    assert.deepEqual(minutesRowsOf(readingOf(["khac"])), []);
});

test("reviewMinutes: none without minutes photos; clean passes; a missing name or a continuation page needs review; a second read that differs needs review", () => {
    assert.equal(reviewMinutes({ rules, first: readingOf(["khac"]), second: null }), null);
    const first = reading([good, { ...good, daiDienTruong: null }]);
    assert.deepEqual(reviewMinutes({ rules, first, second: null })!.rows.map((r) => r.status), ["tu_dong_dat", "can_xem"]);
    const same = { ok: true as const, reading: reading([good, { ...good, daiDienTruong: null }]) };
    assert.deepEqual(reviewMinutes({ rules, first, second: same })!.rows.map((r) => r.status), ["tu_dong_dat", "can_xem"]);
    const differs = reviewMinutes({ rules, first: reading([good]), second: { ok: true, reading: reading([{ ...good, daiDienTruong: "Cao Minh Trúc" }]) } })!;
    assert.equal(differs.rows[0].status, "can_xem");
    assert.match(differs.rows[0].reasons.join(" "), /bienban\.bienBan\[0\]\.daiDienTruong/);
    assert.match(reviewMinutes({ rules, first: reading([good]), second: { ok: false, error: "hết hạn mức" } })!.reasons.join(" "), /đọc lần hai lỗi/);
    assert.match(reviewMinutes({ rules, first: reading([good], "thap"), second: null })!.rows[0].reasons.join(" "), /độ tin cậy/);
});

test("reviewMinutes: the number of minutes read must match the number of minutes photos", () => {
    const r = readingOf(["bienban", "bienban"], { bienban: { bienBan: [good] } });
    assert.match(reviewMinutes({ rules, first: r, second: null })!.reasons.join(" "), /1 biên bản nhưng có 2 ảnh/);
});

test("parseMinutesFix and applyHumanMinutesRow", () => {
    assert.deepEqual(parseMinutesFix("daiDienTruong=Cao Minh Trung"), { column: "daiDienTruong", value: "Cao Minh Trung" });
    assert.deepEqual(parseMinutesFix("boPhanTruong=null"), { column: "boPhanTruong", value: null });
    assert.deepEqual(parseMinutesFix("laTrangTiep=true"), { column: "laTrangTiep", value: true });
    for (const bad of ["mau=do", "laTrangTiep=maybe", "khong-co-dau-bang"]) assert.throws(() => parseMinutesFix(bad), /./, bad);

    const first = reading([good, { ...good, daiDienTruong: null }]);
    const base = { status: "can_xem" as const, reasons: [], notes: [], rows: [], secondRead: { ran: false, disagree: [] }, minutes: reviewMinutes({ rules, first, second: null })! };
    assert.throws(() => applyHumanMinutesRow(base as never, 0, "xac_nhan", {}, 1), /không cần xác nhận/);
    assert.throws(() => applyHumanMinutesRow(base as never, 9, "bo", {}, 1), /không có biên bản 9/);
    assert.throws(() => applyHumanMinutesRow(base as never, 1, "sua", {}, 1), /ít nhất một/);
    assert.equal(applyHumanMinutesRow(base as never, 1, "xac_nhan", {}, 1).status, "da_xac_nhan");
    assert.equal(applyHumanMinutesRow(base as never, 1, "sua", { daiDienTruong: "Cao Minh Trung" }, 1).minutes!.rows[1].status, "da_sua");
});

const msgText = (school: string, rooms: string[]): string => ["BÁO CÁO CUỐI BUỔI", `Tên trường: ${school}`, "- Tên IT: An", ...rooms.flatMap((r) => [`* Phòng máy: ${r} (P. Vi Tính)`, "- Internet: Có"])].join("\n");
const msg = (content: string, ts: number, id: string): SourceMessage => ({ msgId: id, groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u", senderName: "IT", isSelf: false, ts, msgType: "desktop.text", content }) as SourceMessage;
const item = (key: string, over: Partial<MinutesItem> = {}): MinutesItem => ({ key, usable: true, tieuDe: "BIÊN BẢN A", daiDienCty: "Vinh", daiDienTruong: "Trung", boPhanTruong: "Văn phòng", ...over });
const forMsg = (id: string, items: MinutesItem[]): Map<string, MinutesForMessage> => new Map([[id, { bundleId: "b", sentTs: 1, items }]]);
const all = () => true;
const DAY_TS = Date.parse("2026-10-08T09:00:00+07:00");

test("every minutes photo is one row; school and rooms come from the message; messages without minutes give no rows", () => {
    const m = msg(msgText("THCS Vĩnh Lộc B - BC", ["PM1", "PM3"]), DAY_TS, "r1");
    const e = minutesEntries([m, msg(msgText("THCS Khác - DA", ["PM1"]), DAY_TS + 1, "r2")], all, forMsg("r1", [item("b#0"), item("b#1", { tieuDe: "BIÊN BẢN B" })]));
    assert.equal(e.length, 2);
    assert.deepEqual(e.map((x) => [x.tenTruong, x.khuVuc, x.pm, x.ngay, x.item.tieuDe]), [["THCS Vĩnh Lộc B", "BC", "PM1,PM3", "2026-10-08", "BIÊN BẢN A"], ["THCS Vĩnh Lộc B", "BC", "PM1,PM3", "2026-10-08", "BIÊN BẢN B"]]);
});

test("the same photos linked to a resent report count once, and the newer message decides the rooms", () => {
    const m1 = msg(msgText("THCS A - BC", ["PM1"]), DAY_TS, "r1");
    const m2 = msg(msgText("THCS A - BC", ["PM1", "PM2"]), DAY_TS + 1000, "r2");
    const map = new Map([...forMsg("r1", [item("b#0")]), ...forMsg("r2", [item("b#0")])]);
    const e = minutesEntries([m1, m2], all, map);
    assert.equal(e.length, 1);
    assert.equal(e[0].pm, "PM1,PM2");
    assert.equal(minutesEntries([m1, m2], (ts) => ts < DAY_TS + 1000, map)[0].pm, "PM1");
});

test("rows: SL is 1, XẾP LOẠI and GHI CHÚ stay blank, an unread minutes keeps its row with blank text", () => {
    const entries = minutesEntries([msg(msgText("THCS A - BC", ["PM1"]), DAY_TS, "r1")], all, forMsg("r1", [item("b#0"), item("b#1", { usable: false, tieuDe: "", daiDienCty: "", daiDienTruong: "", boPhanTruong: "" })]));
    const rows = buildMinutesRows(entries);
    assert.deepEqual(rows[0], { A: 1, B: "'08/10/2026", C: "THCS A", D: "BC", E: "PM1", F: "BIÊN BẢN A", G: 1, H: "Vinh", I: "Trung", J: "Văn phòng" });
    assert.deepEqual(rows[1], { A: 2, B: "'08/10/2026", C: "THCS A", D: "BC", E: "PM1", G: 1 });
    for (const r of rows) assert.ok(!("K" in r) && !("L" in r));
    assert.deepEqual(minutesHeaderCells("2026-10-08"), [{ ref: "L2", value: 46303, numberFormat: "dd/mm/yyyy" }]);
    assert.equal(MINUTES_LAYOUT.legend, undefined);
});

const REAL = path.join("data", "mau bao cao new", MINUTES_LAYOUT.templateFile);
test("the real template still has the headers the layout relies on", { skip: !fs.existsSync(REAL) }, async () => {
    const { default: XLSX } = await import("xlsx");
    const ws = XLSX.readFile(REAL).Sheets[MINUTES_LAYOUT.sheet];
    assert.ok(ws, "sheet name matches (the template name has a trailing space)");
    assert.deepEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"].map((c) => String(ws[`${c}3`]?.v).trim()), ["STT", "NGÀY", "TÊN TRƯỜNG", "KHU VỰC", "PM", "NỘI DUNG", "SL", "ĐẠI DIỆN CTY", "ĐẠI DIỆN TRƯỜNG", "CHỨC VỤ", "XẾP LOẠI", "GHI CHÚ"]);
    assert.equal(ws["A9"]?.v, "TỔNG");
});

function bundleOnDisk(root: string, id: string, rd: BundleReading, review: unknown, texts: string[], firstTs = T0): void {
    const dir = path.join(root, "2026-10-07", "g1", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestOf(rd.images.length, { bundleId: id, firstTs, texts: texts.map((t) => ({ msgId: t, ts: 1, content: "x" })) })));
    fs.writeFileSync(path.join(dir, "reading.json"), JSON.stringify(rd));
    fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(review));
}
const reviewOf = (rd: BundleReading) => ({ status: "tu_dong_dat" as const, reasons: [], notes: [], rows: [], secondRead: { ran: false, disagree: [] }, minutes: reviewMinutes({ rules, first: rd, second: null })! });

test("loadMinutesByMessage links the minutes to the report texts; a held row is blank, a fixed row is used, a discarded row is gone", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "minutes-"));
    const rd = reading([good, { ...good, daiDienTruong: null }, good]);
    const review = reviewOf(rd);
    bundleOnDisk(root, "b1", rd, review, ["t1"]);
    const got = loadMinutesByMessage(root, "2026-10-01").get("t1")!;
    assert.deepEqual(got.items.map((i) => [i.key, i.usable, i.daiDienTruong]), [["b1#0", true, "Cao Minh Trung"], ["b1#1", false, ""], ["b1#2", true, "Cao Minh Trung"]]);

    const fixed = applyHumanMinutesRow(applyHumanMinutesRow(review as never, 1, "sua", { daiDienTruong: "Cao Minh Trung" }, 5), 2, "bo", {}, 6);
    bundleOnDisk(root, "b1", rd, fixed, ["t1"]);
    const after = loadMinutesByMessage(root, "2026-10-01").get("t1")!;
    assert.deepEqual(after.items.map((i) => [i.key, i.usable]), [["b1#0", true], ["b1#1", true]]);
    bundleOnDisk(root, "b1", rd, { ...fixed, dismissed: true }, ["t1"]);
    assert.equal(loadMinutesByMessage(root, "2026-10-01").size, 0);
});
