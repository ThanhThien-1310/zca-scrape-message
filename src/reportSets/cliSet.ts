import { config } from "../../config.js";
import type { ReportKey } from "./registry.js";
import { resolveReportSets, type ResolveResult, type ResolvedSet, type SetProblem } from "./resolve.js";

/** Đọc và kiểm tra `config.reportSets` (hoặc một giá trị khác, để test). Không ném lỗi. */
export function loadReportSets(raw: unknown = config.reportSets): ResolveResult {
    return resolveReportSets(raw);
}

export function describeProblem(p: SetProblem): string {
    return `[bộ báo cáo] ${p.level === "error" ? "LỖI" : "cảnh báo"}${p.setId ? ` (${p.setId})` : ""}: ${p.message}`;
}

export const hasSetErrors = (problems: SetProblem[]): boolean => problems.some((p) => p.level === "error");

/** In từng vấn đề (mặc định ra stderr). Gọi lúc khởi động bot và ở đầu các CLI. */
export function logSetProblems(problems: SetProblem[], write: (line: string) => void = (l) => console.error(l)): void {
    for (const p of problems) write(describeProblem(p));
}

/**
 * Chọn bộ cho một CLI: `--set <id>` chọn đúng bộ đó; bỏ trống chỉ hợp lệ khi đang có ĐÚNG MỘT bộ hợp lệ (để lệnh chạy tay
 * không phải gõ thêm khi chỉ có một người); ngược lại ném lỗi nói rõ phải chỉ ra bộ nào.
 */
export function pickSet(sets: ResolvedSet[], arg: string | undefined): ResolvedSet {
    if (sets.length === 0) throw new Error("không có bộ báo cáo nào hợp lệ trong config.reportSets (xem lỗi ở trên hoặc `npm run config:show`).");
    const ids = sets.map((s) => s.id).join(", ");
    if (arg === undefined) {
        if (sets.length === 1) return sets[0];
        throw new Error(`có ${sets.length} bộ báo cáo nên cần --set <id>. Các bộ: ${ids}.`);
    }
    const found = sets.find((s) => s.id === arg);
    if (!found) throw new Error(`không có bộ "${arg}" đang chạy. Các bộ: ${ids}.`);
    return found;
}

/** Chặn chạy tay một báo cáo mà bộ không bật (tránh ghi file vào thư mục của người không được giao báo cáo đó). */
export function requireKey(set: ResolvedSet, key: ReportKey): void {
    if (!set.reports.includes(key)) throw new Error(`bộ "${set.id}" không bật báo cáo "${key}" (reports: ${set.reports.join(", ")}).`);
}

/** Các dòng của mục "bộ báo cáo" trong `config:show`: bộ đang chạy với mã của nó, rồi mọi vấn đề (bộ bị tắt và lý do). */
export function formatSetsReport(result: ResolveResult): string[] {
    const lines = ["", "── BỘ BÁO CÁO ĐANG CHẠY (config.reportSets) ──"];
    if (result.active.length === 0) lines.push("   KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: bot không xuất file nào.");
    for (const set of result.active) lines.push(`   ${set.id}: ${set.reports.join(", ")}`);
    for (const p of result.problems) lines.push(`   ${describeProblem(p)}`);
    return lines;
}
