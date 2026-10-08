import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { tickTotal, type TickDeps } from "../src/total/tick.js";
import { slotKey, slotsOfDay } from "../src/total/slots.js";
import type { RunnerSnapshot, SlotRecord } from "../src/total/decide.js";
import type { TotalPhase } from "../src/total/totalState.js";
import type { PrintSummary } from "../src/total/printFiles.js";
import type { TotalRunResult } from "../src/total/runTotal.js";

const DAY = "2026-10-03";
const [morning, afternoon] = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
/** Mốc UTC-ms của giờ:phút GIỜ VIỆT NAM ngày 2026-10-03. */
const vn = (h: number, m = 0): number => Date.UTC(2026, 9, 3, h - 7, m);
const idle: RunnerSnapshot = { health: "alive", phase: "idle" };
const busy: RunnerSnapshot = { health: "alive", phase: "running" };
const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: vn(9, 1), lastRunAt: vn(9, 1), complete: true, final: true, pending: [], files: ["f.xlsx"], warnings: [], failures: 0, ...over });

function setup(over: Partial<TickDeps> = {}, now2 = vn(9, 5)) {
    const saved: Array<[string, SlotRecord]> = [];
    const phases: TotalPhase[] = [];
    const logs: string[] = [];
    const ran: string[] = [];
    const printedResults: TotalRunResult[] = [];
    const summary: PrintSummary = { sent: ["a-auto.xlsx", "b-auto.xlsx"], wouldPrint: [], warnings: [], printer: "p" };
    const deps: TickDeps = {
        readSlots: () => ({}),
        saveSlot: (key, rec) => void saved.push([key, rec]),
        readQueue: () => [],
        runnerSnapshot: () => idle,
        runTotal: async (slot) => (ran.push(slot.name), { slot: slot.name, day: slot.day, files: new Array(7).fill("f.xlsx"), counts: {}, failed: [], warnings: [], written: [] }),
        printEnabled: false,
        print: (r) => (printedResults.push(r), summary),
        setPhase: (p) => void phases.push(p),
        log: (m) => void logs.push(m),
        clock: () => now2,
        ...over,
    };
    return { saved, phases, logs, ran, printedResults, deps };
}

test("before the first slot hour nothing runs and the bot stays idle", async () => {
    const { ran, saved, phases, deps } = setup();
    await tickTotal(vn(8, 0), deps);
    assert.deepEqual(ran, []);
    assert.deepEqual(saved, []);
    assert.deepEqual(phases, ["idle"]);
});

test("at 9:00 with an idle runner and an empty queue the morning slot runs once and is saved as complete and final", async () => {
    const { ran, saved, phases, deps } = setup();
    await tickTotal(vn(9, 0), deps);
    assert.deepEqual(ran, ["morning"]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0][0], slotKey(morning));
    assert.equal(saved[0][1].complete, true);
    assert.equal(saved[0][1].final, true);
    assert.deepEqual(phases, ["running", "idle"]);
});

test("a busy runner inside the wait window: the bot waits, runs nothing and saves nothing", async () => {
    const { ran, saved, phases, deps } = setup({ runnerSnapshot: () => busy, readQueue: () => ["A"] });
    await tickTotal(vn(9, 5), deps);
    assert.deepEqual(ran, []);
    assert.deepEqual(saved, []);
    assert.deepEqual(phases, ["waiting"]);
});

test("after the wait window a busy runner no longer blocks: it exports as incomplete and remembers the pending groups", async () => {
    const { saved, deps } = setup({ runnerSnapshot: () => busy, readQueue: () => ["A", "B"] });
    await tickTotal(vn(9, 10), deps);
    assert.equal(saved[0][1].complete, false);
    assert.equal(saved[0][1].final, false);
    assert.deepEqual(saved[0][1].pending, ["A", "B"]);
});

test("a final slot is not run again, and only today's slots are looked at", async () => {
    const { ran, deps } = setup({ readSlots: () => ({ [slotKey(morning)]: record(), [`2026-10-02|afternoon`]: record({ final: false, complete: false }) }) });
    await tickTotal(vn(9, 30), deps);
    assert.deepEqual(ran, []);
});

test("an expired incomplete slot is given up: saved as final with the reason, and logged", async () => {
    const { saved, logs, ran, deps } = setup({ readSlots: () => ({ [slotKey(morning)]: record({ complete: false, final: false, pending: ["A"], lastRunAt: vn(9, 15) }) }), runnerSnapshot: () => busy, readQueue: () => ["A"] });
    await tickTotal(vn(10, 5), deps);
    assert.deepEqual(ran, []);
    assert.equal(saved[0][1].final, true);
    assert.match(saved[0][1].warnings.at(-1)!, /hết thời hạn/);
    assert.ok(logs.some((l) => l.includes("bỏ cuộc")), JSON.stringify(logs));
});

test("a failing run is recorded as a failed attempt and does not throw", async () => {
    const { saved, logs, phases, deps } = setup({ runTotal: async () => { throw new Error("không đọc được kho tin"); } });
    await tickTotal(vn(9, 5), deps);
    assert.equal(saved[0][1].failures, 1);
    assert.equal(saved[0][1].final, false);
    assert.match(saved[0][1].warnings[0], /không đọc được kho tin/);
    assert.ok(logs.some((l) => l.includes("lỗi")), JSON.stringify(logs));
    assert.equal(phases.at(-1), "idle");
});

test("an error anywhere in the tick (reading the slots, or saving the crash record) is logged and swallowed, never thrown", async () => {
    const reading = setup({ readSlots: () => { throw new Error("EBUSY"); } });
    await assert.doesNotReject(tickTotal(vn(9, 5), reading.deps));
    assert.ok(reading.logs.some((l) => l.includes("EBUSY")), JSON.stringify(reading.logs));
    assert.equal(reading.phases.at(-1), "idle");

    const saving = setup({ runTotal: async () => { throw new Error("excel"); }, saveSlot: () => { throw new Error("EPERM"); } });
    await assert.doesNotReject(tickTotal(vn(9, 5), saving.deps));
    assert.ok(saving.logs.some((l) => l.includes("EPERM")), JSON.stringify(saving.logs));
    assert.equal(saving.phases.at(-1), "idle");
});

test("the afternoon slot is handled after the morning one is final", async () => {
    const { ran, saved, deps } = setup({ readSlots: () => ({ [slotKey(morning)]: record() }) });
    await tickTotal(vn(15, 0), deps);
    assert.deepEqual(ran, ["afternoon"]);
    assert.equal(saved[0][0], slotKey(afternoon));
});

test("print enabled: the first export of a slot is printed, and the slot is stamped with the files sent (never 'printed done')", async () => {
    const { saved, logs, printedResults, deps } = setup({ printEnabled: true });
    await tickTotal(vn(9, 5), deps);
    assert.equal(printedResults.length, 1);
    const last = saved.at(-1)![1];
    assert.equal(last.printedAt, vn(9, 5));
    assert.deepEqual(last.printed, ["a-auto.xlsx", "b-auto.xlsx"]);
    assert.ok(logs.some((l) => l.includes("gửi lệnh in 2 file")), JSON.stringify(logs));
    assert.ok(!logs.some((l) => l.includes("đã in xong")), JSON.stringify(logs));
});

test("print disabled (the default): nothing is printed and no stamp is written", async () => {
    const { saved, printedResults, deps } = setup();
    await tickTotal(vn(9, 5), deps);
    assert.deepEqual(printedResults, []);
    assert.equal(saved.at(-1)![1].printedAt, undefined);
});

test("a refresh export of a slot that already has files is not printed again", async () => {
    const { printedResults, deps } = setup({ printEnabled: true, readSlots: () => ({ [slotKey(morning)]: record({ complete: false, final: false, pending: ["A"], lastRunAt: vn(9, 1) }) }) });
    await tickTotal(vn(9, 12), deps);
    assert.deepEqual(printedResults, []);
});

test("a print failure after a good export is only logged: the slot keeps its export record, never a crash record", async () => {
    const { saved, logs, phases, deps } = setup({ printEnabled: true, print: () => { throw new Error("máy in không sẵn sàng"); } });
    await assert.doesNotReject(tickTotal(vn(9, 5), deps));
    assert.equal(saved.length, 1);
    assert.equal(saved[0][1].failures, 0);
    assert.equal(saved[0][1].complete, true);
    assert.equal(saved[0][1].printedAt, undefined);
    assert.ok(logs.some((l) => l.includes("máy in không sẵn sàng")), JSON.stringify(logs));
    assert.equal(phases.at(-1), "idle");
});
