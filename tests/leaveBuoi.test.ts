import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";
import { parseIso } from "../src/leave/dates.js";
import { buoiNghi, ngayText } from "../src/leave/buoi.js";

const d = (s: string) => parseIso(s)!;
const buoi = (tu: string, tuGio: number, den: string, denGio: number): string => buoiNghi({ tu: d(tu), tuGio, den: d(den), denGio }, 12);

test("the table of the spec", () => {
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 18), "Cả ngày");
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 11.5), "Sáng");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-08", 18), "Chiều");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-10", 18), "Chiều - Cả ngày");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-10", 11.5), "Chiều - Sáng");
    assert.equal(buoi("2026-10-08", 8, "2026-10-10", 11.5), "Cả ngày - Sáng");
    assert.equal(buoi("2026-10-08", 8, "2026-10-10", 18), "Cả ngày");
});

test("the boundary at exactly 12:00", () => {
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 12), "Sáng", "ends at noon: morning only");
    assert.equal(buoi("2026-10-08", 12, "2026-10-08", 18), "Chiều", "starts at noon: afternoon only");
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 12.5), "Cả ngày");
    assert.equal(buoi("2026-10-08", 12, "2026-10-10", 18), "Chiều - Cả ngày");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-10", 12), "Chiều - Sáng");
});

test("the default noon is config.sessions.chieuFromHour", () => {
    const p = { tu: d("2026-10-08"), tuGio: 8, den: d("2026-10-08"), denGio: 18 };
    assert.equal(buoiNghi(p), buoiNghi(p, config.sessions.chieuFromHour));
});

test("ngayText: one day is dd/MM/yyyy, several days are 'from - to'", () => {
    assert.equal(ngayText(d("2026-10-08"), d("2026-10-08")), "08/10/2026");
    assert.equal(ngayText(d("2026-10-08"), d("2026-10-10")), "08/10/2026 - 10/10/2026");
});
