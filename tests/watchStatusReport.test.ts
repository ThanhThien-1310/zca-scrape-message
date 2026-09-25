import { test } from "node:test";
import assert from "node:assert/strict";
import { formatWatchStatus } from "../history/watchStatusReport.js";
import { STALE_AFTER_MS, type Gap, type WatchState } from "../history/watchState.js";
import { at } from "./fixtures.js";

const NOW = at(10, 0);
const state = (over: Partial<WatchState> = {}): WatchState => ({
    pid: 4242,
    startedAt: at(7, 0),
    lastBeat: NOW - 10_000,
    state: "running",
    detections: 5,
    lastDetectionAt: at(9, 40),
    sources: { ws: "active", notification: "active" },
    ...over,
});
const text = (s: WatchState | null, gaps: Gap[] = []) => formatWatchStatus(s, gaps, NOW).join("\n");

test("no state at all says the watcher has never left a heartbeat", () => {
    assert.match(text(null), /chưa có dữ liệu nhịp tim/);
});

test("a healthy watcher shows pid, start, last detection and both sources", () => {
    const t = text(state());
    assert.match(t, /ĐANG CHẠY \(pid 4242\)/);
    assert.match(t, /từ 07:00 25\/09|từ 07:00 24\/09/);
    assert.match(t, /nhịp tim cuối: 10 giây trước/);
    assert.match(t, /WebSocket: active/);
    assert.match(t, /thông báo: active/);
    assert.match(t, /phát hiện gần nhất: 09:40 \(tổng 5 lần\)/);
});

test("a stale heartbeat is reported as probably dead, with when it last beat", () => {
    const t = text(state({ lastBeat: NOW - STALE_AFTER_MS - 60_000 }));
    assert.match(t, /CÓ VẺ ĐÃ CHẾT/);
    assert.match(t, /nhịp tim cuối lúc 09:57/);
});

test("both sources down while the process lives is reported as blind since when", () => {
    const t = text(state({ sources: { ws: "down", notification: "down" }, blindSince: at(9, 30) }));
    assert.match(t, /ĐANG CHẠY NHƯNG MÙ/);
    assert.match(t, /từ 09:30/);
});

test("a clean stop is reported with its time", () => {
    const t = text(state({ state: "stopped", stoppedAt: at(9, 0) }));
    assert.match(t, /ĐÃ DỪNG lúc 09:00/);
});

test("recent gaps are listed, with open ones marked as ongoing", () => {
    const t = text(state(), [{ from: at(8, 0), to: at(8, 30), reason: "crash" }, { from: at(9, 50), to: null, reason: "stopped" }]);
    assert.match(t, /khoảng gián đoạn/);
    assert.match(t, /08:00 → 08:30 \(chết đột ngột\)/);
    assert.match(t, /09:50 → đang diễn ra \(dừng có chủ ý\)/);
});

test("no gaps in the last 24 hours says so", () => {
    assert.match(text(state()), /không có khoảng gián đoạn nào trong 24 giờ qua/);
});
