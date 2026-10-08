import { STALE_AFTER_MS } from "./watchState.js";
import type { Gap, GapReason, WatchState } from "../types/index.js";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

export function hhmm(ts: number): string {
    const d = new Date(ts + VN_OFFSET_MS);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function hhmmDdMm(ts: number): string {
    const d = new Date(ts + VN_OFFSET_MS);
    return `${hhmm(ts)} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
}

export const GAP_REASON_TEXT: Record<GapReason, string> = {
    crash: "chết đột ngột",
    stopped: "dừng có chủ ý",
    blind: "mất nguồn phát hiện WebSocket",
    fatal: "dừng vì lỗi nghiêm trọng",
    unknown: "chưa có dữ liệu nhịp tim",
};

function ago(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} giây`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} phút`;
    return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

/**
 * Human-readable lines for `watch:status` (Vietnam time). With `session`, ends with the
 * verdict an agent acts on: does a gap overlap that session (so `recover:missing` is needed)?
 */
export function formatWatchStatus(state: WatchState | null, gaps: Gap[], now: number, session?: { day: string; buoi: string; overlapping: Gap[] }): string[] {
    const lines: string[] = [];

    if (!state) {
        lines.push("[watch] chưa có dữ liệu nhịp tim — bot:watch chưa từng chạy (hoặc chạy trước khi có tính năng này).");
    } else if (state.state === "stopped") {
        lines.push(`[watch] ĐÃ DỪNG lúc ${hhmm(state.stoppedAt ?? state.lastBeat)}`);
    } else if (now - state.lastBeat > STALE_AFTER_MS) {
        lines.push(`[watch] CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc ${hhmm(state.lastBeat)} (${ago(now - state.lastBeat)} trước), tiến trình pid ${state.pid} không còn báo.`);
    } else if (state.blindSince !== undefined) {
        lines.push(`[watch] ĐANG CHẠY NHƯNG MÙ (pid ${state.pid}): nguồn phát hiện (WebSocket) không hoạt động từ ${hhmm(state.blindSince)}`);
    } else {
        lines.push(`[watch] ĐANG CHẠY (pid ${state.pid}) từ ${hhmmDdMm(state.startedAt)}`);
    }

    if (state && state.state === "running") {
        if (now - state.lastBeat <= STALE_AFTER_MS) lines.push(`  nhịp tim cuối: ${ago(now - state.lastBeat)} trước`);
        lines.push(`  nguồn phát hiện: WebSocket: ${state.sources.ws}`);
        if (state.lastFrameAt !== undefined) lines.push(`  khung WebSocket cuối: ${ago(now - state.lastFrameAt)} trước`);
        if (state.reconnects) lines.push(`  đã tự nối lại ${state.reconnects} lần${state.restartedAt !== undefined ? ` (gần nhất lúc ${hhmm(state.restartedAt)})` : ""}`);
        lines.push(
            state.lastDetectionAt === undefined
                ? `  chưa phát hiện tin nào (tổng ${state.detections} lần)`
                : `  phát hiện gần nhất: ${hhmm(state.lastDetectionAt)} (tổng ${state.detections} lần)`,
        );
    }

    const recent = gaps.filter((g) => (g.to ?? now) >= now - 24 * 60 * 60 * 1000);
    if (recent.length === 0) {
        lines.push("[watch] không có khoảng gián đoạn nào trong 24 giờ qua.");
    } else {
        lines.push("[watch] khoảng gián đoạn trong 24 giờ qua:");
        for (const g of recent) lines.push(`  - ${g.from === 0 ? "không rõ" : hhmm(g.from)} → ${g.to === null ? "đang diễn ra" : hhmm(g.to)} (${GAP_REASON_TEXT[g.reason]})`);
    }

    if (session) {
        const head = `[watch] buổi ${session.buoi} ngày ${session.day}:`;
        lines.push(
            session.overlapping.length > 0
                ? `${head} có ${session.overlapping.length} khoảng gián đoạn chồng lên buổi → CẦN chạy recover:missing`
                : `${head} không có gián đoạn chồng lên buổi → không cần khôi phục`,
        );
    }
    return lines;
}
