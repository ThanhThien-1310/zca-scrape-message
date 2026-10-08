import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedSessions, mergeSessions } from "../src/runner/affectedSessions.js";
import { messageKey } from "../src/lesson/recovery.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg, SPECIALIST, YESTERDAY } from "./fixtures.js";

const none = new Set<string>();

test("a new start report makes its own session affected", () => {
    assert.deepEqual(affectedSessions(none, [msg(COMPLETE, at(8))]), [{ day: DAY, buoi: "morningstart" }]);
});

test("messages already in the store before the scrape do not count", () => {
    const old = msg(COMPLETE, at(8));
    assert.deepEqual(affectedSessions(new Set([messageKey(old)]), [old]), []);
});

test("chat that is not a start or end report never triggers a rebuild", () => {
    assert.deepEqual(affectedSessions(none, [msg("ok em nhé", at(9)), msg(SPECIALIST, at(9, 5))]), []);
});

test("sessions follow the report's own time, sorted, one entry per session (two DauBuoi at 9:00 and 9:30 both reroute into the same afternoonstart session)", () => {
    const list = affectedSessions(none, [
        msg(IT_MAINTENANCE, at(20)), // CuoiBuoi, 20:00 -> raw morningstart (wrap) -> tomorrow's morningstart
        msg(COMPLETE, at(9)), // DauBuoi, 9:00 -> raw morningend -> reroute to afternoonstart
        msg(COMPLETE, at(9, 30)), // DauBuoi, 9:30 -> raw morningend -> reroute to afternoonstart (same session as above)
        msg(IT_MAINTENANCE, at(11)), // CuoiBuoi, 11:00 -> raw morningend, never reroutes
        msg(COMPLETE, YESTERDAY), // DauBuoi, 08:00 the day before -> morningstart of that day
    ]);
    assert.deepEqual(list, [
        { day: "2026-09-23", buoi: "morningstart" },
        { day: DAY, buoi: "morningend" },
        { day: DAY, buoi: "afternoonstart" },
        { day: "2026-09-25", buoi: "morningstart" },
    ]);
});

test("session boundaries follow classifyPhase: a DauBuoi report reroutes at 9:00 and 15:00, a CuoiBuoi report never does", () => {
    const dauAt = (h: number, m = 0) => affectedSessions(none, [msg(COMPLETE, at(h, m))])[0];
    const cuoiAt = (h: number, m = 0) => affectedSessions(none, [msg(IT_MAINTENANCE, at(h, m))])[0];
    assert.equal(dauAt(8, 59).buoi, "morningstart");
    assert.equal(dauAt(9, 0).buoi, "afternoonstart"); // lỡ hẹn đầu-sáng -> đẩy sang đầu-chiều cùng ngày
    assert.equal(cuoiAt(9, 0).buoi, "morningend"); // cuối buổi không bao giờ bị đẩy
    assert.equal(dauAt(14, 59).buoi, "afternoonstart");
    assert.deepEqual(dauAt(15, 0), { day: "2026-09-25", buoi: "morningstart" }); // lỡ hẹn đầu-chiều -> đầu-sáng NGÀY MAI
});

test("mergeSessions dedupes and orders by day then session", () => {
    const a = [{ day: DAY, buoi: "afternoonstart" as const }];
    const b = [{ day: DAY, buoi: "morningstart" as const }, { day: DAY, buoi: "afternoonstart" as const }, { day: "2026-09-23", buoi: "afternoonend" as const }];
    assert.deepEqual(mergeSessions(a, b), [
        { day: "2026-09-23", buoi: "afternoonend" },
        { day: DAY, buoi: "morningstart" },
        { day: DAY, buoi: "afternoonstart" },
    ]);
    assert.deepEqual(mergeSessions(), []);
});
