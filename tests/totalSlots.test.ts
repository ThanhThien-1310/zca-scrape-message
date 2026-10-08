import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoFileName, inSlotWindow, isSlotName, slotKey, slotsOfDay, vietnamHourToMs } from "../src/total/slots.js";

const HOURS = { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 };
/** Mốc UTC-ms của giờ:phút:giây GIỜ VIỆT NAM ngày 2026-10-03. */
const vn = (h: number, m = 0, s = 0, ms = 0): number => Date.UTC(2026, 9, 3, h - 7, m, s, ms);

test("vietnamHourToMs reads fractional hours on the Vietnam clock", () => {
    assert.equal(vietnamHourToMs("2026-10-03", 6.5), vn(6, 30));
    assert.equal(vietnamHourToMs("2026-10-03", 9), vn(9));
    assert.equal(vietnamHourToMs("2026-10-03", 0), vn(0));
    assert.equal(vietnamHourToMs("2026-10-03", 24), vn(24));
});

test("slotsOfDay: both slots share the window start and end at their own hour", () => {
    const [morning, afternoon] = slotsOfDay("2026-10-03", HOURS);
    assert.deepEqual(morning, { name: "morning", day: "2026-10-03", fromMs: vn(6, 30), atMs: vn(9) });
    assert.deepEqual(afternoon, { name: "afternoon", day: "2026-10-03", fromMs: vn(6, 30), atMs: vn(15) });
});

test("slotsOfDay uses config.total when no hours are given", () => {
    assert.deepEqual(slotsOfDay("2026-10-03"), slotsOfDay("2026-10-03", HOURS));
});

test("inSlotWindow is half-open: 6:30:00 in, 6:29:59.999 out, the slot hour itself out of its own slot but in the later one", () => {
    const [morning, afternoon] = slotsOfDay("2026-10-03", HOURS);
    assert.equal(inSlotWindow(vn(6, 29, 59, 999), morning), false);
    assert.equal(inSlotWindow(vn(6, 30), morning), true);
    assert.equal(inSlotWindow(vn(8, 59, 59, 999), morning), true);
    assert.equal(inSlotWindow(vn(9), morning), false);
    assert.equal(inSlotWindow(vn(9), afternoon), true);
    assert.equal(inSlotWindow(vn(14, 59), afternoon), true);
    assert.equal(inSlotWindow(vn(15), afternoon), false);
});

test("inSlotWindow: the same clock time on ANOTHER day is outside", () => {
    const [morning] = slotsOfDay("2026-10-03", HOURS);
    assert.equal(inSlotWindow(Date.UTC(2026, 9, 2, 0, 0), morning), false); // 07:00 ngày 02/10
    assert.equal(inSlotWindow(Date.UTC(2026, 9, 4, 0, 0), morning), false); // 07:00 ngày 04/10
});

test("slotKey joins the day and the slot name", () => {
    assert.equal(slotKey({ day: "2026-10-03", name: "morning" }), "2026-10-03|morning");
    assert.equal(slotKey({ day: "2026-10-03", name: "afternoon" }), "2026-10-03|afternoon");
});

test("autoFileName keeps <title>_<yyMMdd>_T<thu>_<HHmm> and puts -auto before .xlsx", () => {
    // 2026-10-03 là thứ Bảy -> Excel WEEKDAY(d,1) = 7.
    assert.equal(autoFileName("TÌNH TRẠNG LOA", "2026-10-03", "0907"), "TÌNH TRẠNG LOA_261003_T7_0907-auto.xlsx");
});

test("isSlotName accepts only the two slot names", () => {
    assert.equal(isSlotName("morning"), true);
    assert.equal(isSlotName("afternoon"), true);
    assert.equal(isSlotName("evening"), false);
    assert.equal(isSlotName(undefined), false);
});
