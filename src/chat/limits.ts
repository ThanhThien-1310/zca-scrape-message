import type { Limits } from "../types/index.js";

export type LimitCheck = { ok: true } | { ok: false; reason: "cooldown" | "rate" };

export interface Limiter {
    check(group: string, ruleId: string, now: number): LimitCheck;
    /** Ghi nhận một câu trả lời (thật hoặc dry-run). */
    record(group: string, ruleId: string, now: number): void;
}

/** Trong bộ nhớ: một tình huống không lặp lại trong cùng nhóm quá nhanh, và tổng số tin mỗi phút bị chặn. */
export function createLimiter(limits: Limits): Limiter {
    const last = new Map<string, number>();
    let sent: number[] = [];
    return {
        check(group, ruleId, now) {
            const at = last.get(`${group}|${ruleId}`);
            if (at !== undefined && now - at < limits.cooldownSecondsPerRule * 1000) return { ok: false, reason: "cooldown" };
            sent = sent.filter((t) => now - t < 60_000);
            if (sent.length >= limits.maxRepliesPerMinute) return { ok: false, reason: "rate" };
            return { ok: true };
        },
        record(group, ruleId, now) {
            last.set(`${group}|${ruleId}`, now);
            sent.push(now);
        },
    };
}

/** Trả lời quá trễ có thể còn tệ hơn không trả lời. */
export function isStale(messageTs: number, now: number, maxDelaySeconds: number): boolean {
    return now - messageTs > maxDelaySeconds * 1000;
}
