import { describeProblem } from "../reportSets/cliSet.js";
import type { ResolvedSet, SetProblem } from "../reportSets/resolve.js";
import { hhmm } from "../watch/watchStatusReport.js";
import type { SlotRecord } from "./decide.js";
import { slotKey, type SlotName, type TotalSlot } from "./slots.js";
import { totalHealth, type SlotMap, type TotalState } from "./totalState.js";

const SLOT_LABEL: Record<SlotName, string> = { morning: "sáng", afternoon: "chiều" };

function ago(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} giây`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

function slotLines(slot: TotalSlot, record: SlotRecord | undefined, now: number): string[] {
    const head = `  ${SLOT_LABEL[slot.name]} ${hhmm(slot.atMs)}:`;
    if (!record) return [now < slot.atMs ? `${head} chưa tới giờ` : `${head} đến giờ, chưa xuất (đang đợi runner hoặc bot:total chưa chạy)`];
    const verdict = record.complete ? "đủ dữ liệu" : record.final ? "CHƯA ĐỦ, không xuất lại nữa" : "chưa đủ, sẽ xuất lại";
    const lines = [`${head} đã xuất lúc ${hhmm(record.lastRunAt)} (${record.files.length} file) — ${verdict}`];
    if (record.printedAt !== undefined) lines.push(`    đã gửi lệnh in ${record.printed?.length ?? 0} file lúc ${hhmm(record.printedAt)} (giấy ra hay chưa phải xem ở máy in)`);
    if (record.pending.length > 0) lines.push(`    còn ${record.pending.length} nhóm chưa cào: ${record.pending.join(", ")}`);
    if (record.failures > 0) lines.push(`    lỗi ${record.failures} lần liên tiếp`);
    for (const w of record.warnings) lines.push(`    cảnh báo: ${w}`);
    return lines;
}

export interface TotalStatusInput {
    state: TotalState | null;
    slots: SlotMap;
    day: string;
    schedule: TotalSlot[];
    now: number;
    /** Các bộ báo cáo đang chạy và các vấn đề của `config.reportSets`. */
    sets?: { active: ResolvedSet[]; problems: SetProblem[] };
}

/** Các dòng chữ cho `total:status` (giờ Việt Nam). */
export function formatTotalStatus(input: TotalStatusInput): string[] {
    const { state, slots, day, schedule, now, sets } = input;
    const lines: string[] = [];
    const health = totalHealth(state, now);
    if (!state) {
        lines.push("[total] chưa có dữ liệu — bot:total chưa từng chạy.");
    } else if (health === "stopped") {
        lines.push(`[total] ĐÃ DỪNG lúc ${hhmm(state.lastBeat)}`);
    } else if (health === "dead") {
        lines.push(`[total] CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc ${hhmm(state.lastBeat)} (${ago(now - state.lastBeat)} trước)`);
    } else {
        lines.push(`[total] ĐANG CHẠY (pid ${state.pid}) từ ${hhmm(state.startedAt)}`);
        lines.push(`  trạng thái: ${state.state}`);
        lines.push(`  nhịp tim cuối: ${ago(now - state.lastBeat)} trước`);
    }
    lines.push(`[total] hôm nay ${day}:`);
    for (const slot of schedule) lines.push(...slotLines(slot, slots[slotKey(slot)], now));
    if (sets) {
        lines.push(sets.active.length === 0 ? "[total] KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: các đợt không xuất file nào." : `[total] bộ báo cáo: ${sets.active.map((s) => `${s.id} (${s.reports.length} loại)`).join(", ")}`);
        for (const p of sets.problems) lines.push(`  ${describeProblem(p)}`);
    }
    return lines;
}
