import { hhmm } from "../watch/watchStatusReport.js";
import { describeProblem } from "../reportSets/cliSet.js";
import type { ResolvedSet, SetProblem } from "../reportSets/resolve.js";
import { runnerHealth } from "./runnerState.js";
import { seconds } from "./timingReport.js";
import type { RunnerState, SessionKey } from "../types/index.js";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

function hhmmDdMm(ts: number): string {
    const d = new Date(ts + VN_OFFSET_MS);
    return `${hhmm(ts)} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
}

function ago(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} giây`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

const label = (s: SessionKey) => `${s.buoi} ${s.day}`;

export interface RunnerStatusInput {
    state: RunnerState | null;
    queue: string[];
    /** When the earliest queued group was queued; null when the queue is empty. */
    firstQueuedAt: number | null;
    /** Sessions that have a report not built into an Excel yet. */
    dirty: SessionKey[];
    now: number;
    /** The report sets: the ones that run, the problems found in `config.reportSets`, and the report files waiting for a retry. */
    sets?: { active: ResolvedSet[]; problems: SetProblem[]; failed: string[] };
}

/** Human-readable lines for `runner:status` (Vietnam time). */
export function formatRunnerStatus(input: RunnerStatusInput): string[] {
    const { state, queue, firstQueuedAt, dirty, now, sets } = input;
    const lines: string[] = [];
    const health = runnerHealth(state, now);

    if (!state) {
        lines.push("[runner] chưa có dữ liệu — bot:runner chưa từng chạy.");
    } else if (health === "stopped") {
        lines.push(`[runner] ĐÃ DỪNG lúc ${hhmm(state.lastBeat)}`);
    } else if (health === "dead") {
        lines.push(`[runner] CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc ${hhmm(state.lastBeat)} (${ago(now - state.lastBeat)} trước), tiến trình pid ${state.pid} không còn báo.`);
    } else if (health === "error") {
        lines.push(`[runner] LỖI: ${state.consecutiveFailures} vòng liên tiếp thất bại (pid ${state.pid}). Runner đã ngừng tự thử — xem lỗi bên dưới rồi khởi động lại \`npm run bot:runner\`.`);
    } else {
        lines.push(`[runner] ĐANG CHẠY (pid ${state.pid}) từ ${hhmmDdMm(state.startedAt)}`);
        lines.push(`  trạng thái: ${state.state}`);
        lines.push(`  nhịp tim cuối: ${ago(now - state.lastBeat)} trước`);
    }

    lines.push(queue.length === 0 ? "  hàng chờ: rỗng" : `  hàng chờ: ${queue.length} nhóm (${queue.join(", ")})${firstQueuedAt === null ? "" : `, nhóm đầu tiên vào lúc ${hhmm(firstQueuedAt)}`}`);

    const c = state?.lastCycle;
    if (c) {
        lines.push(`  vòng gần nhất lúc ${hhmm(c.at)}: ${c.ok ? "OK" : "LỖI"}`);
        lines.push(`    nhóm: ${c.groups.length > 0 ? c.groups.join(", ") : "(không có)"}`);
        lines.push(`    buổi: ${c.sessions.length > 0 ? c.sessions.map(label).join(", ") : "(không dựng)"}, cần xem: ${c.reviewCount}`);
        if (typeof c.durationMs === "number") {
            const s = c.stepMs;
            const steps = s ? ` (khôi phục ${seconds(s.recover)}, cào ${seconds(s.scrape)}, nạp tin ${seconds(s.load)}, đồng bộ DB ${seconds(s.sync)}, dựng Excel ${seconds(s.build)})` : "";
            lines.push(`    thời gian: ${seconds(c.durationMs)}${steps}`);
        }
        if (c.timings && c.timings.length > 0) lines.push(`    cào từng nhóm: ${c.timings.map((t) => `${t.target} ${seconds(t.ms)}${t.ok ? "" : " (lỗi)"}`).join(", ")}`);
        for (const f of c.excel) lines.push(`    Excel: ${f}`);
        if (c.errors.length > 0) lines.push(`    lỗi: ${c.errors.join("; ")}`);
        if (c.buildErrors.length > 0) lines.push(`    lỗi dựng: ${c.buildErrors.join("; ")}`);
        for (const s of c.sets ?? []) lines.push(`    bộ ${s.id}: ${s.sessions.length > 0 ? `buổi ${s.sessions.map((x) => `${x.buoi} ${x.day}`).join(", ")}` : "không có buổi nào cần dựng"}${s.failedReports.length > 0 ? `; lỗi file: ${s.failedReports.join(", ")}` : ""}`);
        if (c.warnings.length > 0) lines.push(`    cảnh báo: ${c.warnings.join("; ")}`);
    }
    if (sets) {
        lines.push(sets.active.length === 0 ? "  KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: bot không xuất file nào (sửa config.reportSets rồi khởi động lại)." : `  bộ báo cáo: ${sets.active.map((s) => `${s.id} (${s.reports.length} loại)`).join(", ")}`);
        for (const p of sets.problems) lines.push(`  ${describeProblem(p)}`);
        if (sets.failed.length > 0) lines.push(`  file báo cáo đang lỗi, sẽ thử lại: ${sets.failed.join("; ")}`);
    }
    if (dirty.length > 0) lines.push(`  buổi chưa dựng xong: ${dirty.map(label).join(", ")}`);
    return lines;
}
