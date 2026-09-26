import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedSessions, mergeSessions } from "../src/runner/affectedSessions.js";
import { messageKey } from "../src/lesson/recovery.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg, SPECIALIST, YESTERDAY } from "./fixtures.js";

const none = new Set<string>();

test("a new start report makes its own session affected", () => {
    assert.deepEqual(affectedSessions(none, [msg(COMPLETE, at(9))]), [{ day: DAY, buoi: "sang" }]);
});

test("messages already in the store before the scrape do not count", () => {
    const old = msg(COMPLETE, at(9));
    assert.deepEqual(affectedSessions(new Set([messageKey(old)]), [old]), []);
});

test("chat that is not a start or end report never triggers a rebuild", () => {
    assert.deepEqual(affectedSessions(none, [msg("ok em nhé", at(9)), msg(SPECIALIST, at(9, 5))]), []);
});

test("sessions follow the report's own time, sorted, one entry per session", () => {
    const list = affectedSessions(none, [
        msg(IT_MAINTENANCE, at(19)),
        msg(COMPLETE, at(9)),
        msg(COMPLETE, at(9, 30)),
        msg(IT_MAINTENANCE, at(13)),
        msg(COMPLETE, YESTERDAY),
    ]);
    assert.deepEqual(list, [
        { day: "2026-09-23", buoi: "sang" },
        { day: DAY, buoi: "sang" },
        { day: DAY, buoi: "chieu" },
        { day: DAY, buoi: "toi" },
    ]);
});

test("session boundaries: 11:59 is sáng, 12:00 chiều, 23:59 tối, 00:00 sáng of the same day", () => {
    const of = (h: number, m: number) => affectedSessions(none, [msg(COMPLETE, at(h, m))])[0];
    assert.equal(of(11, 59).buoi, "sang");
    assert.equal(of(12, 0).buoi, "chieu");
    assert.equal(of(23, 59).buoi, "toi");
    assert.deepEqual(of(0, 0), { day: DAY, buoi: "sang" });
});

test("mergeSessions dedupes and orders by day then session", () => {
    const a = [{ day: DAY, buoi: "chieu" as const }];
    const b = [{ day: DAY, buoi: "sang" as const }, { day: DAY, buoi: "chieu" as const }, { day: "2026-09-23", buoi: "toi" as const }];
    assert.deepEqual(mergeSessions(a, b), [
        { day: "2026-09-23", buoi: "toi" },
        { day: DAY, buoi: "sang" },
        { day: DAY, buoi: "chieu" },
    ]);
    assert.deepEqual(mergeSessions(), []);
});
