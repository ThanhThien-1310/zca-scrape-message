import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTotalStatus } from "../src/total/totalStatusReport.js";
import { slotKey, slotsOfDay } from "../src/total/slots.js";
import type { SlotRecord } from "../src/total/decide.js";
import type { TotalState } from "../src/total/totalState.js";

const DAY = "2026-10-03";
const schedule = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const vn = (h: number, m = 0): number => Date.UTC(2026, 9, 3, h - 7, m);
const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: vn(9, 7), lastRunAt: vn(9, 7), complete: true, final: true, pending: [], files: new Array(7).fill("f.xlsx"), warnings: [], failures: 0, ...over });
const state = (over: Partial<TotalState> = {}): TotalState => ({ pid: 123, startedAt: vn(8, 32), lastBeat: vn(9, 10) - 5000, state: "idle", ...over });
const text = (lines: string[]): string => lines.join("\n");

test("never ran: says so and still lists today's two slots as not due yet", () => {
    const out = text(formatTotalStatus({ state: null, slots: {}, day: DAY, schedule, now: vn(8, 0) }));
    assert.match(out, /chưa từng chạy/);
    assert.match(out, /sáng 09:00: chưa tới giờ/);
    assert.match(out, /chiều 15:00: chưa tới giờ/);
});

test("alive bot with a complete morning slot", () => {
    const out = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record() }, day: DAY, schedule, now: vn(9, 10) }));
    assert.match(out, /ĐANG CHẠY \(pid 123\)/);
    assert.match(out, /sáng 09:00: đã xuất lúc 09:07 \(7 file\) — đủ dữ liệu/);
    assert.match(out, /chiều 15:00: chưa tới giờ/);
});

test("an incomplete slot shows the groups still queued and whether it will be exported again", () => {
    const again = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ complete: false, final: false, pending: ["A", "B"] }) }, day: DAY, schedule, now: vn(9, 20) }));
    assert.match(again, /chưa đủ, sẽ xuất lại/);
    assert.match(again, /còn 2 nhóm chưa cào: A, B/);
    const stopped = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ complete: false, final: true, pending: ["A"], warnings: ["hết hạn xuất lại"] }) }, day: DAY, schedule, now: vn(10, 30) }));
    assert.match(stopped, /CHƯA ĐỦ, không xuất lại nữa/);
    assert.match(stopped, /cảnh báo: hết hạn xuất lại/);
});

test("a printed slot shows when the print command was SENT and how many files, never 'printed'", () => {
    const out = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ printedAt: vn(9, 8), printed: ["a.xlsx", "b.xlsx", "c.xlsx"] }) }, day: DAY, schedule, now: vn(9, 10) }));
    assert.match(out, /đã gửi lệnh in 3 file lúc 09:08/);
    assert.doesNotMatch(out, /đã in xong/);
    const none = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ printedAt: vn(9, 8), printed: [] }) }, day: DAY, schedule, now: vn(9, 10) }));
    assert.match(none, /đã gửi lệnh in 0 file lúc 09:08/);
    const notPrinted = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record() }, day: DAY, schedule, now: vn(9, 10) }));
    assert.doesNotMatch(notPrinted, /lệnh in/);
});

test("a due slot with no record, failures, a dead heartbeat and a clean stop", () => {
    const due = text(formatTotalStatus({ state: state(), slots: {}, day: DAY, schedule, now: vn(9, 3) }));
    assert.match(due, /sáng 09:00: đến giờ, chưa xuất/);
    const failing = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ complete: false, final: false, failures: 2 }) }, day: DAY, schedule, now: vn(9, 30) }));
    assert.match(failing, /lỗi 2 lần liên tiếp/);
    assert.match(text(formatTotalStatus({ state: state({ lastBeat: vn(8, 0) }), slots: {}, day: DAY, schedule, now: vn(9, 30) })), /CÓ VẺ ĐÃ CHẾT/);
    assert.match(text(formatTotalStatus({ state: state({ state: "stopped" }), slots: {}, day: DAY, schedule, now: vn(9, 30) })), /ĐÃ DỪNG/);
});

test("total:status lists the report sets and the problems of config.reportSets", async () => {
    const { resolveReportSets } = await import("../src/reportSets/resolve.js");
    const r = resolveReportSets([{ id: "A", reports: ["loa", "x"] }]);
    const out = text(formatTotalStatus({ state: null, slots: {}, day: DAY, schedule, now: vn(8, 0), sets: { active: r.active, problems: r.problems } }));
    assert.match(out, /bộ báo cáo: A \(1 loại\)/);
    assert.match(out, /\[bộ báo cáo\] LỖI \(A\)/);
});
