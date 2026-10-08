import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, classifyPhase, currentSession, excelDateSerial, excelTimeFraction, hhmmVietnam, isBuoi, isPhase, phaseDay, phaseOf, reportFileName, reportFileNameV2, sessionOf, todayVietnam, vietnamDay, vietnamHourMinute } from "../src/lesson/time.js";

test("time helpers use the Vietnam calendar", () => {
    const ts = Date.UTC(2026, 8, 23, 18, 30); // 01:30 on 24 Sep in Vietnam
    assert.equal(vietnamDay(ts), "2026-09-24");
    assert.equal(excelDateSerial(ts), 46289);
    assert.equal(excelTimeFraction(ts), (1 * 60 + 30) / 1440);
    assert.equal(todayVietnam(ts), "2026-09-24");
    assert.deepEqual(vietnamHourMinute(ts), { hour: 1, minute: 30 });
});

test("hhmmVietnam is the Vietnam wall-clock HHmm, zero-padded", () => {
    assert.equal(hhmmVietnam(Date.UTC(2026, 8, 28, 3, 5)), "1005"); // 10:05 VN
    assert.equal(hhmmVietnam(Date.UTC(2026, 8, 27, 17, 0)), "0000"); // 00:00 on 28 Sep VN
    assert.equal(hhmmVietnam(Date.UTC(2026, 8, 28, 16, 59)), "2359");
});

test("vietnamHourMinute rolls back across the Vietnam midnight boundary correctly", () => {
    assert.deepEqual(vietnamHourMinute(Date.UTC(2026, 8, 27, 17, 0)), { hour: 0, minute: 0 }); // 00:00 on 28 Sep VN
    assert.deepEqual(vietnamHourMinute(Date.UTC(2026, 8, 28, 6, 59)), { hour: 13, minute: 59 }); // 13:59 on 28 Sep VN
});

test("a message just before Vietnam midnight stays on the same day", () => {
    const ts = Date.UTC(2026, 8, 24, 16, 59, 59); // 23:59:59 on 24 Sep in Vietnam
    assert.equal(vietnamDay(ts), "2026-09-24");
    assert.equal(vietnamDay(ts + 1000), "2026-09-25");
});

test("sessions split the Vietnam day at 12:00 and 18:00", () => {
    const vn = (h: number, m = 0, s = 0) => Date.UTC(2026, 8, 24, h - 7, m, s);
    assert.equal(sessionOf(vn(0)), "sang");
    assert.equal(sessionOf(vn(11, 59, 59)), "sang");
    assert.equal(sessionOf(vn(12)), "chieu");
    assert.equal(sessionOf(vn(17, 59, 59)), "chieu");
    assert.equal(sessionOf(vn(18)), "toi");
    assert.equal(sessionOf(vn(23, 59, 59)), "toi");
    assert.equal(currentSession(vn(9)), "sang");
});

test("isBuoi accepts only the three sessions", () => {
    assert.equal(isBuoi("sang"), true);
    assert.equal(isBuoi("chieu"), true);
    assert.equal(isBuoi("toi"), true);
    assert.equal(isBuoi("sáng"), false);
    assert.equal(isBuoi(undefined), false);
});

test("reportFileName is baocaobuoi<buoi>_<ddMMyy>.xlsm", () => {
    assert.equal(reportFileName("2026-09-25", "sang"), "baocaobuoisang_250926.xlsm");
    assert.equal(reportFileName("2026-01-05", "chieu"), "baocaobuoichieu_050126.xlsm");
});

test("addDays adds/subtracts calendar days, crossing month/year boundaries", () => {
    assert.equal(addDays("2026-09-29", 1), "2026-09-30");
    assert.equal(addDays("2026-09-30", 1), "2026-10-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("phaseOf splits the Vietnam day into 4 phases at 9:00, 12:30, 15:00, 17:30", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.equal(phaseOf(vn(0)), "morningstart");
    assert.equal(phaseOf(vn(8, 59)), "morningstart");
    assert.equal(phaseOf(vn(9)), "morningend");
    assert.equal(phaseOf(vn(12, 29)), "morningend");
    assert.equal(phaseOf(vn(12, 30)), "afternoonstart");
    assert.equal(phaseOf(vn(14, 59)), "afternoonstart");
    assert.equal(phaseOf(vn(15)), "afternoonend");
    assert.equal(phaseOf(vn(17, 29)), "afternoonend");
    assert.equal(phaseOf(vn(17, 30)), "morningstart");
    assert.equal(phaseOf(vn(23, 59)), "morningstart");
});

test("phaseDay: early-morning morningstart (before 9h) stays on the same day; late-night morningstart (after 17h30) rolls to tomorrow", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.equal(phaseDay(vn(3)), "2026-09-24");
    assert.equal(phaseDay(vn(8, 59)), "2026-09-24");
    assert.equal(phaseDay(vn(17, 30)), "2026-09-25");
    assert.equal(phaseDay(vn(23, 59)), "2026-09-25");
    assert.equal(phaseDay(vn(12)), "2026-09-24");
});

test("classifyPhase: a CuoiBuoi report always keeps its raw phase/day, even when that raw phase is a morning-report slot", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.deepEqual(classifyPhase(vn(3), "CuoiBuoi"), { phase: "morningstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(11), "CuoiBuoi"), { phase: "morningend", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(13), "CuoiBuoi"), { phase: "afternoonstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(18), "CuoiBuoi"), { phase: "morningstart", day: "2026-09-25" });
});

test("classifyPhase: a late DauBuoi report is pushed forward to the next dau-buoi slot, never into a cuoi-buoi slot", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.deepEqual(classifyPhase(vn(9, 48), "DauBuoi"), { phase: "afternoonstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(16), "DauBuoi"), { phase: "morningstart", day: "2026-09-25" });
    assert.deepEqual(classifyPhase(vn(3), "DauBuoi"), { phase: "morningstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(13), "DauBuoi"), { phase: "afternoonstart", day: "2026-09-24" });
});

test("reportFileNameV2 is baocaobuoi<phase>_<ddMMyy>.xlsm", () => {
    assert.equal(reportFileNameV2("2026-09-29", "morningstart"), "baocaobuoimorningstart_290926.xlsm");
    assert.equal(reportFileNameV2("2026-01-05", "afternoonend"), "baocaobuoiafternoonend_050126.xlsm");
});

test("isPhase accepts only the 4 phase values", () => {
    assert.equal(isPhase("morningstart"), true);
    assert.equal(isPhase("afternoonend"), true);
    assert.equal(isPhase("sang"), false);
    assert.equal(isPhase(undefined), false);
});
