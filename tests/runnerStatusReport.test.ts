import { test } from "node:test";
import assert from "node:assert/strict";
import { STALE_AFTER_MS } from "../history/watchState.js";
import { formatRunnerStatus } from "../runner/runnerStatusReport.js";
import type { CycleSummary, RunnerState } from "../runner/runnerState.js";
import { at, DAY } from "./fixtures.js";

const NOW = at(10, 0);
const state = (over: Partial<RunnerState> = {}): RunnerState => ({ pid: 777, startedAt: at(7, 0), lastBeat: NOW - 5_000, state: "idle", consecutiveFailures: 0, ...over });
const cycle = (over: Partial<CycleSummary> = {}): CycleSummary => ({ kind: "cycle", at: at(9, 40), ok: true, groups: ["LC_HoaSen1_TĐ"], sessions: [{ day: DAY, buoi: "sang" }], reviewCount: 2, buildErrors: [], excel: ["data/export/baocaobuoisang_240926.xlsm"], warnings: [], errors: [], ...over });
const text = (input: Partial<Parameters<typeof formatRunnerStatus>[0]> = {}) =>
    formatRunnerStatus({ state: state(), queue: [], firstQueuedAt: null, dirty: [], now: NOW, ...input }).join("\n");

test("no state says the runner never ran", () => {
    assert.match(text({ state: null }), /chưa có dữ liệu.*bot:runner chưa từng chạy/);
});

test("a healthy runner shows pid, phase and the age of its last beat", () => {
    const t = text();
    assert.match(t, /ĐANG CHẠY \(pid 777\) từ 07:00/);
    assert.match(t, /trạng thái: idle/);
    assert.match(t, /nhịp tim cuối: 5 giây trước/);
});

test("a stale heartbeat is reported as probably dead", () => {
    assert.match(text({ state: state({ lastBeat: NOW - STALE_AFTER_MS - 60_000 }) }), /CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc 09:57/);
});

test("the error phase says it stopped trying and needs a restart", () => {
    const t = text({ state: state({ state: "error", consecutiveFailures: 3 }) });
    assert.match(t, /LỖI: 3 vòng liên tiếp thất bại/);
    assert.match(t, /khởi động lại/);
});

test("a stopped runner is reported with its time", () => {
    assert.match(text({ state: state({ state: "stopped", lastBeat: at(9, 0) }) }), /ĐÃ DỪNG lúc 09:00/);
});

test("the queue is described, with when its earliest group arrived", () => {
    assert.match(text(), /hàng chờ: rỗng/);
    assert.match(text({ queue: ["A", "B"], firstQueuedAt: at(9, 55) }), /hàng chờ: 2 nhóm \(A, B\), nhóm đầu tiên vào lúc 09:55/);
});

test("the last cycle shows groups, sessions, review count and the Excel written", () => {
    const t = text({ state: state({ lastCycle: cycle() }) });
    assert.match(t, /vòng gần nhất lúc 09:40: OK/);
    assert.match(t, /nhóm: LC_HoaSen1_TĐ/);
    assert.match(t, /buổi: sang 2026-09-24/);
    assert.match(t, /cần xem: 2/);
    assert.match(t, /baocaobuoisang_240926\.xlsm/);
});

test("a failed cycle lists its errors and warnings", () => {
    const t = text({ state: state({ lastCycle: cycle({ ok: false, errors: ["2026-09-24 sang: Excel COM failed"], warnings: ['không cào được "B"'] }) }) });
    assert.match(t, /vòng gần nhất lúc 09:40: LỖI/);
    assert.match(t, /lỗi: 2026-09-24 sang: Excel COM failed/);
    assert.match(t, /cảnh báo: không cào được "B"/);
});

test("sessions still owing a rebuild are listed", () => {
    assert.match(text({ dirty: [{ day: DAY, buoi: "chieu" }] }), /buổi chưa dựng xong: chieu 2026-09-24/);
});

test("a build error is shown apart from cycle errors", () => {
    const t = text({ state: state({ lastCycle: cycle({ buildErrors: ["2026-09-24 sang: template missing"] }) }) });
    assert.match(t, /vòng gần nhất lúc 09:40: OK/);
    assert.match(t, /lỗi dựng: 2026-09-24 sang: template missing/);
});

test("the last cycle shows how long it took, per step, and how long each group took", () => {
    const t = text({
        state: state({
            lastCycle: cycle({
                durationMs: 125_000,
                stepMs: { recover: 0, scrape: 90_000, load: 2_000, sync: 13_000, build: 20_000 },
                timings: [
                    { target: "LC_A", ms: 12_300, ok: true },
                    { target: "LC_B", ms: 8_000, ok: false },
                ],
            }),
        }),
    });
    assert.match(t, /thời gian: 125,0 s \(khôi phục 0,0 s, cào 90,0 s, nạp tin 2,0 s, đồng bộ DB 13,0 s, dựng Excel 20,0 s\)/);
    assert.match(t, /cào từng nhóm: LC_A 12,3 s, LC_B 8,0 s \(lỗi\)/);
});

test("a last cycle written before timings existed shows no timing lines", () => {
    assert.doesNotMatch(text({ state: state({ lastCycle: cycle() }) }), /thời gian:|cào từng nhóm/);
});
