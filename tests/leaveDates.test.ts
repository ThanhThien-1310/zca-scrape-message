import { test } from "node:test";
import assert from "node:assert/strict";
import { compareYmd, countNonSundays, dayNumber, dmyOf, isoOf, parseHour, parseIso, weekdayExcel } from "../src/leave/dates.js";

const d = (s: string) => parseIso(s)!;

test("parseIso accepts only real YYYY-MM-DD dates", () => {
    assert.deepEqual(parseIso("2026-10-03"), { y: 2026, m: 10, d: 3 });
    assert.deepEqual(parseIso(" 2026-10-03 "), { y: 2026, m: 10, d: 3 });
    for (const bad of ["2026-02-30", "2026-13-01", "03/10/2026", "2026-1-3", "", null, undefined, 20261003]) assert.equal(parseIso(bad), null, String(bad));
    assert.ok(parseIso("2028-02-29"), "leap day");
    assert.equal(parseIso("2026-02-29"), null);
});

test("isoOf and dmyOf format a date", () => {
    assert.equal(isoOf(d("2026-10-03")), "2026-10-03");
    assert.equal(dmyOf(d("2026-10-03")), "03/10/2026");
    assert.equal(dmyOf(d("2026-01-09")), "09/01/2026");
});

test("weekdayExcel numbers Sunday 1 to Saturday 7, as Excel WEEKDAY does", () => {
    assert.equal(weekdayExcel(d("2026-10-03")), 7, "Saturday");
    assert.equal(weekdayExcel(d("2026-10-04")), 1, "Sunday");
    assert.equal(weekdayExcel(d("2026-10-05")), 2, "Monday");
    assert.equal(weekdayExcel(d("2026-10-07")), 4, "Wednesday");
});

test("compareYmd counts days, countNonSundays skips Sundays and includes both ends", () => {
    assert.equal(compareYmd(d("2026-10-05"), d("2026-10-03")), 2);
    assert.equal(compareYmd(d("2026-10-03"), d("2026-10-05")), -2);
    assert.equal(dayNumber(d("2026-10-04")) - dayNumber(d("2026-10-03")), 1);
    assert.equal(countNonSundays(d("2026-10-03"), d("2026-10-03")), 1);
    assert.equal(countNonSundays(d("2026-10-03"), d("2026-10-05")), 2, "Sat, Sun, Mon");
    assert.equal(countNonSundays(d("2026-10-05"), d("2026-10-06")), 2);
    assert.equal(countNonSundays(d("2026-10-04"), d("2026-10-04")), 0, "a lone Sunday");
    assert.equal(countNonSundays(d("2026-10-08"), d("2026-10-12")), 4, "Thu, Fri, Sat, (Sun), Mon");
    assert.equal(countNonSundays(d("2026-10-05"), d("2026-10-03")), 0, "reversed range");
});

test("parseHour reads 8:00, 08:00, 13:30 and 8h30; anything else is null", () => {
    assert.equal(parseHour("8:00"), 8);
    assert.equal(parseHour("08:00"), 8);
    assert.equal(parseHour("13:30"), 13.5);
    assert.equal(parseHour("8h30"), 8.5);
    assert.equal(parseHour(" 18:00 "), 18);
    assert.equal(parseHour("12"), 12);
    for (const bad of ["25:00", "8:75", "abc", "", null, undefined, 8]) assert.equal(parseHour(bad), null, String(bad));
});
