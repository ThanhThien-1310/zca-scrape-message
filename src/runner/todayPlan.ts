import { affectedSessions } from "./affectedSessions.js";
import { sessionReportKeys, type BuiltBySet } from "./builtReports.js";
import type { QueueRunResult, SessionKey, SourceMessage, TargetOutcome } from "../types/index.js";

/**
 * Các việc thuần của `npm run today` (src/cli/today.ts): chọn nhóm cần cào, giai đoạn của hôm nay, buộc runner coi các báo cáo
 * hôm nay là chưa dựng, và đổi kết quả cào một lượt thành dạng `runCycle` hiểu.
 */

/** Mọi nhóm trong `targets` trừ các nhóm chỉ để chat (không bao giờ cào), giữ nguyên thứ tự. */
export function targetsToScrape(targets: string[], noScrape: ReadonlySet<string>): string[] {
    return targets.filter((t) => !noScrape.has(t));
}

/** Các giai đoạn CỦA NGÀY `today` có ít nhất một báo cáo đầu/cuối buổi trong kho tin, cũ nhất trước. Báo cáo gửi sau 17:30 thuộc ngày hôm sau nên không tính. */
export function todaySessions(messages: SourceMessage[], today: string): SessionKey[] {
    return affectedSessions(new Set(), messages).filter((s) => s.day === today);
}

/**
 * Gỡ khoá của mọi báo cáo thuộc các giai đoạn hôm nay khỏi các bộ `setIds`, để `runCycle` coi chúng là chưa dựng và dựng lại. Không sửa
 * `built` được truyền vào (trả về bản mới); bộ chưa có mục nào thì giữ nguyên. `forgotten` là tổng số khoá đã gỡ.
 */
export function forgetToday(built: BuiltBySet, messages: SourceMessage[], today: string, setIds: string[]): { built: BuiltBySet; forgotten: number } {
    const todayKeys = new Set(todaySessions(messages, today).flatMap((session) => sessionReportKeys(messages, session)));
    const next: BuiltBySet = new Map();
    let forgotten = 0;
    for (const [id, keys] of built) {
        if (!setIds.includes(id)) {
            next.set(id, new Set(keys));
            continue;
        }
        const kept = new Set<string>();
        for (const key of keys) {
            if (todayKeys.has(key)) forgotten++;
            else kept.add(key);
        }
        next.set(id, kept);
    }
    return { built: next, forgotten };
}

/** Kết quả cào MỘT LƯỢT mọi nhóm, ở dạng của lần cào theo hàng chờ (`runCycle` đọc `targets`, `failed`, `outcomes`). Nhóm có `error` là nhóm lỗi. */
export function toRunResult(targets: string[], outcomes: TargetOutcome[]): Extract<QueueRunResult, { status: "done" }> {
    return { status: "done", targets, failed: outcomes.filter((o) => o.error !== undefined).map((o) => o.target), gaveUp: [], outcomes };
}
