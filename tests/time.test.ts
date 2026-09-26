import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSession, excelDateSerial, excelTimeFraction, isBuoi, reportFileName, sessionOf, todayVietnam, vietnamDay } from "../lesson/time.js";

test("time helpers use the Vietnam calendar", () => {
    const ts = Date.UTC(2026, 8, 23, 18, 30); // 01:30 on 24 Sep in Vietnam
    assert.equal(vietnamDay(ts), "2026-09-24");
    assert.equal(excelDateSerial(ts), 46289);
    assert.equal(excelTimeFraction(ts), (1 * 60 + 30) / 1440);
    assert.equal(todayVietnam(ts), "2026-09-24");
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
