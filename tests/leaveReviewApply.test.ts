import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHumanRow, describeBundle, dismissBundle, finalRow, parseFix } from "../src/leave/reviewApply.js";
import { reviewLeave } from "../src/leave/review.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveReadingOf, leaveRow, manifestOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
/** Dòng 0 sạch, dòng 1 có ngày không đọc được (can_xem). */
const first = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B", tuNgay: "2026-02-30" })]);
const base = () => reviewLeave({ rules, manifest: manifestOf(1), first, second: null, cfg });

test("parseFix: text columns stay text, numeric columns become numbers or null, unknown columns are refused", () => {
    assert.deepEqual(parseFix("hoTen=Nguyễn Văn A"), { column: "hoTen", value: "Nguyễn Văn A" });
    assert.deepEqual(parseFix("hoTen=123"), { column: "hoTen", value: "123" });
    assert.deepEqual(parseFix("tuNgay=2026-10-03"), { column: "tuNgay", value: "2026-10-03" });
    assert.deepEqual(parseFix("soNgay=2"), { column: "soNgay", value: 2 });
    assert.deepEqual(parseFix("tuThu=null"), { column: "tuThu", value: null });
    assert.deepEqual(parseFix("lyDo=a=b"), { column: "lyDo", value: "a=b" });
    assert.throws(() => parseFix("khong-co-dau-bang"), /cột=giá trị/);
    assert.throws(() => parseFix("mau=đỏ"), /Cột "mau"/);
    assert.throws(() => parseFix("soNgay=abc"), /số/);
});

test("parseFix rejects malformed values and accepts the boundaries", () => {
    for (const bad of ["tuNgay=3/10/2026", "tuNgay=2026-02-30", "tuNgay=null", "denNgay=null", "denNgay=", "tuNgay=2026-1-3"]) assert.throws(() => parseFix(bad), /YYYY-MM-DD/, bad);
    for (const bad of ["tuGio=abc", "tuGio=25:00", "denGio=", "denGio=null", "tuGio=8:75"]) assert.throws(() => parseFix(bad), /giờ/, bad);
    for (const bad of ["tuThu=9", "tuThu=0", "denThu=-1", "denThu=2.5", "tuThu=0x2", "tuThu=abc"]) assert.throws(() => parseFix(bad), /1 đến 7/, bad);
    for (const bad of ["soNgay=-1", "soNgay=2.5", "soNgay=0x10", "soNgay=1e2", "soNgay=367", "soNgay=abc"]) assert.throws(() => parseFix(bad), /0 đến 366/, bad);
    assert.throws(() => parseFix("hoTen=   "), /không được để trống/);
    assert.deepEqual(parseFix("tuThu=7"), { column: "tuThu", value: 7 });
    assert.deepEqual(parseFix("denThu="), { column: "denThu", value: null });
    assert.deepEqual(parseFix("soNgay=0"), { column: "soNgay", value: 0 });
    assert.deepEqual(parseFix("soNgay=366"), { column: "soNgay", value: 366 });
    assert.deepEqual(parseFix("soNgay="), { column: "soNgay", value: null });
    assert.deepEqual(parseFix("tuGio=13:30"), { column: "tuGio", value: "13:30" });
    assert.deepEqual(parseFix("denGio= 8h30 "), { column: "denGio", value: "8h30" });
    assert.deepEqual(parseFix("hoTen=  Trần Văn B "), { column: "hoTen", value: "Trần Văn B" });
    assert.deepEqual(parseFix("lyDo="), { column: "lyDo", value: "" });
    assert.deepEqual(parseFix("lyDo= ốm "), { column: "lyDo", value: "ốm" });
});

test("confirming, fixing and discarding a can_xem row set its status and the bundle status follows", () => {
    const r = base();
    assert.equal(r.status, "can_xem");
    const confirmed = applyHumanRow(r, 1, "xac_nhan", {}, 1000);
    assert.equal(confirmed.rows[1].status, "da_xac_nhan");
    assert.equal(confirmed.status, "da_xac_nhan");
    const fixed = applyHumanRow(r, 1, "sua", { tuNgay: "2026-10-04", tuThu: 1 }, 1000);
    assert.equal(fixed.rows[1].status, "da_sua");
    assert.deepEqual(fixed.rows[1].human, { at: 1000, action: "sua", corrections: { tuNgay: "2026-10-04", tuThu: 1 } });
    assert.equal(fixed.status, "da_sua");
    const dropped = applyHumanRow(r, 1, "bo", {}, 1000);
    assert.equal(dropped.rows[1].status, "da_bo");
    assert.equal(dropped.status, "tu_dong_dat", "row 0 is still automatic");
    assert.equal(r.rows[1].status, "can_xem", "the input is not mutated");
});

test("fixing or dropping a row that was fine (a wrong name) is allowed, and a second fix adds to the first", () => {
    const r = base();
    const renamed = applyHumanRow(r, 0, "sua", { hoTen: "Đinh Đình Chinh" }, 1);
    assert.equal(renamed.rows[0].status, "da_sua");
    const again = applyHumanRow(renamed, 0, "sua", { soNgay: 2 }, 2);
    assert.deepEqual(again.rows[0].human!.corrections, { hoTen: "Đinh Đình Chinh", soNgay: 2 });
    assert.equal(applyHumanRow(again, 0, "bo", {}, 3).rows[0].status, "da_bo");
});

test("invalid human actions are refused", () => {
    const r = base();
    assert.throws(() => applyHumanRow(r, 9, "xac_nhan", {}, 1), /không có dòng 9/);
    assert.throws(() => applyHumanRow(r, 1, "sua", {}, 1), /ít nhất một/);
    assert.throws(() => applyHumanRow(r, 1, "xac_nhan", { soNgay: 1 }, 1), /không kèm sửa/);
    assert.throws(() => applyHumanRow(r, 1, "bo", { soNgay: 1 }, 1), /không kèm sửa/);
    assert.throws(() => applyHumanRow(r, 0, "xac_nhan", {}, 1), /không cần xác nhận/);
});

test("dismissBundle drops the whole bundle", () => {
    const d = dismissBundle(base());
    assert.equal(d.dismissed, true);
    assert.equal(d.status, "da_bo");
});

test("finalRow overlays the human corrections on the read row", () => {
    const r = applyHumanRow(base(), 1, "sua", { tuNgay: "2026-10-04" }, 1);
    assert.equal(finalRow({ hoTen: "B", tuNgay: "2026-02-30" }, r.rows[1]).tuNgay, "2026-10-04");
    assert.equal(finalRow({ hoTen: "B", tuNgay: "2026-02-30" }, base().rows[1]).tuNgay, "2026-02-30");
});

test("describeBundle shows the group, status, reasons and each row with its status", () => {
    const text = describeBundle(manifestOf(1), first, base()).join("\n");
    assert.match(text, /bot test/);
    assert.match(text, /can_xem/);
    assert.match(text, /Dòng 0 \[tu_dong_dat\] Nguyễn Quốc Pháp/);
    assert.match(text, /Dòng 1 \[can_xem\] Trần Văn B/);
    assert.match(text, /ngày bắt đầu không đọc được/);
    assert.match(text, /01\.jpg/);
});
