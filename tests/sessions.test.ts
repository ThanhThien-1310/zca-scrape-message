import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionWindow } from "../src/lesson/recovery.js";
import { sessionOf } from "../src/lesson/time.js";
import type { Buoi } from "../src/types/index.js";

const DAY = "2026-09-24";
const vn = (h: number, m = 0, s = 0) => Date.UTC(2026, 8, 24, h - 7, m, s);
const DEFAULT = { chieuFromHour: 12, toiFromHour: 18 };
const EARLY_TOI = { chieuFromHour: 12, toiFromHour: 17 };

test("default hours split the day at 12:00 and 18:00", () => {
    assert.equal(sessionOf(vn(11, 59, 59), DEFAULT), "sang");
    assert.equal(sessionOf(vn(12), DEFAULT), "chieu");
    assert.equal(sessionOf(vn(17, 59, 59), DEFAULT), "chieu");
    assert.equal(sessionOf(vn(18), DEFAULT), "toi");
});

test("with the evening starting at 17:00 the boundary moves (16:59 chiều, 17:00 tối)", () => {
    assert.equal(sessionOf(vn(16, 59, 59), EARLY_TOI), "chieu");
    assert.equal(sessionOf(vn(17), EARLY_TOI), "toi");
    assert.equal(sessionOf(vn(17, 30), EARLY_TOI), "toi");
});

test("sessionWindow follows the hours: the chiều window ends where the tối window starts", () => {
    assert.deepEqual(sessionWindow(DAY, "chieu", DEFAULT), { from: Date.UTC(2026, 8, 24, 5), to: Date.UTC(2026, 8, 24, 11) });
    assert.deepEqual(sessionWindow(DAY, "chieu", EARLY_TOI), { from: Date.UTC(2026, 8, 24, 5), to: Date.UTC(2026, 8, 24, 10) });
    assert.deepEqual(sessionWindow(DAY, "toi", EARLY_TOI), { from: Date.UTC(2026, 8, 24, 10), to: Date.UTC(2026, 8, 24, 17) });
});

test("sessionOf and sessionWindow agree at both edges of every session, for any valid hours", () => {
    for (const hours of [DEFAULT, EARLY_TOI, { chieuFromHour: 6, toiFromHour: 20 }]) {
        for (const buoi of ["sang", "chieu", "toi"] as Buoi[]) {
            const w = sessionWindow(DAY, buoi, hours);
            assert.equal(sessionOf(w.from, hours), buoi, `${JSON.stringify(hours)} ${buoi} start`);
            assert.equal(sessionOf(w.to - 1, hours), buoi, `${JSON.stringify(hours)} ${buoi} last ms`);
        }
    }
});
