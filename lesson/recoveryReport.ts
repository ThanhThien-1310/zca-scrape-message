import type { GapReason } from "../history/watchState.js";
import type { RecoveryResult } from "./recoveryRun.js";
import type { LoaiBaoCao } from "./types.js";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

function hhmm(ts: number): string {
    const d = new Date(ts + VN_OFFSET_MS);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const REASON_TEXT: Record<GapReason, string> = {
    crash: "chết đột ngột",
    stopped: "dừng có chủ ý",
    blind: "mất cả hai nguồn phát hiện",
    fatal: "dừng vì lỗi nghiêm trọng",
    unknown: "chưa có dữ liệu nhịp tim",
};
const KIND_TEXT: Record<LoaiBaoCao, string> = { DauBuoi: "đầu buổi", CuoiBuoi: "cuối buổi" };

const missingText = (m: { target: string; missing: LoaiBaoCao[] }) => `${m.target} (thiếu: ${m.missing.map((k) => KIND_TEXT[k]).join(", ")})`;

/** Human-readable lines for `recover:missing` (Vietnam time). */
export function formatRecovery(r: RecoveryResult): string[] {
    const lines: string[] = [`[recover] ngày ${r.day}, buổi ${r.buoi} (${hhmm(r.window.from)}–${hhmm(r.window.to)})`];

    if (r.status === "no-gap") {
        lines.push("[recover] bot:watch không có khoảng gián đoạn nào trong buổi này — không cần khôi phục.");
        return lines;
    }

    for (const g of r.gaps) {
        const from = g.from < r.window.from ? "trước buổi" : hhmm(g.from);
        const to = g.to === null ? "đang diễn ra" : hhmm(g.to);
        lines.push(`[recover] gián đoạn: ${from} → ${to} (${REASON_TEXT[g.reason]})`);
    }

    if (r.status === "nothing-missing") {
        lines.push("[recover] mọi nhóm đều đã đủ báo cáo đầu buổi và cuối buổi — không cần cào lại.");
        return lines;
    }

    const since = r.sinceTs === null ? "" : ` từ ${hhmm(r.sinceTs)}`;
    if (r.status === "dry-run") {
        lines.push(`[recover] chạy thử: sẽ cào lại ${r.candidates.length} nhóm${since}:`);
        for (const c of r.candidates) lines.push(`  - ${missingText(c)}`);
        return lines;
    }

    lines.push(`[recover] đã cào lại ${r.candidates.length} nhóm${since}:`);
    for (const c of r.candidates) lines.push(`  - ${missingText(c)}`);

    if (r.recovered.length === 0) {
        lines.push("[recover] không tìm thấy tin nhắn nào bị lỡ trong các nhóm đã cào lại.");
    } else {
        lines.push(`[recover] tin nhắn bị lỡ đã khôi phục (${r.recovered.length}):`);
        for (const m of r.recovered) {
            const tag = m.kind ? `[${KIND_TEXT[m.kind]}] ` : "";
            lines.push(`  ${hhmm(m.ts)}  ${m.groupName} — ${tag}${m.preview || "(không có chữ, có thể là ảnh)"}`);
        }
    }
    if (r.stillMissing.length > 0) {
        lines.push("[recover] vẫn thiếu báo cáo sau khi cào lại:");
        for (const m of r.stillMissing) lines.push(`  - ${missingText(m)}`);
    }
    if (r.errors.length > 0) {
        lines.push("[recover] lỗi khi cào:");
        for (const e of r.errors) lines.push(`  - ${e.target}: ${e.error}`);
    }
    return lines;
}
