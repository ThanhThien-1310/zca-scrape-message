import type { Gap } from "../types/index.js";

/** Khóa của một khoảng gián đoạn trong một buổi: khoảng còn mở và khi đã đóng có khóa khác nhau (đóng rồi thì khôi phục thêm một lần). */
export const recoveryKey = (gap: Gap, scope: string): string => `${scope}|${gap.from}|${gap.to ?? "open"}`;

/**
 * Chỉ các khoảng gián đoạn CHƯA được khôi phục. `gaps` đã được giới hạn theo buổi `scope` (ví dụ `2026-09-26|sang`).
 * Nếu không lọc thế này, một khoảng gián đoạn đã qua từ lâu vẫn chồng lên buổi hiện tại và làm mọi vòng cào lại
 * các nhóm còn thiếu báo cáo, kể cả vòng chỉ do một nhóm trong hàng chờ kích hoạt.
 */
export function selectFreshGaps(gaps: Gap[], done: ReadonlySet<string>, scope: string): { fresh: Gap[]; keys: string[] } {
    const fresh = gaps.filter((g) => !done.has(recoveryKey(g, scope)));
    return { fresh, keys: fresh.map((g) => recoveryKey(g, scope)) };
}

/**
 * Bước khôi phục của một vòng runner: không có khoảng gián đoạn mới thì KHÔNG làm gì (không cào, không đụng vào Zalo);
 * có thì khôi phục đúng các khoảng đó.
 */
export function makeRecoverStep(
    getFreshGaps: () => Gap[],
    run: (gaps: Gap[]) => Promise<{ errors: string[] }>,
): () => Promise<{ errors: string[] }> {
    return async () => {
        const fresh = getFreshGaps();
        if (fresh.length === 0) return { errors: [] };
        return run(fresh);
    };
}
