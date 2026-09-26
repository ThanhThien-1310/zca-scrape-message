import { isStale, type Limiter } from "./limits.js";
import { echoText } from "./mentions.js";
import { pickRule, renderReply } from "./match.js";
import type { SendHooks } from "./send.js";
import { SKIP_BACKOFF_MS } from "./timing.js";
import type { ChatRules, ChatSummary, InboxItem, OutgoingReply, SendResult } from "../types/index.js";

export { SKIP_BACKOFF_MS };

export interface ChatDeps {
    now(): number;
    /** Từ `msgId` tới thời điểm sớm nhất được thử gửi lại; do người gọi giữ trong bộ nhớ giữa các vòng. */
    deferUntil: Map<string, number>;
    rules: ChatRules;
    limiter: Limiter;
    /** Các dòng hộp thư chưa xử lý, theo thứ tự. */
    readNew(): InboxItem[];
    /** Đặt con trỏ tới vị trí byte `end` (mọi dòng trước đó coi như xong). */
    commit(end: number): void;
    isDone(msgId: string): boolean;
    markDone(msgId: string): void;
    /** Ghi câu sắp gửi vào sổ tin dội lại; được gọi (qua `hooks.beforeType`) sau khi chốt chặn đã qua, trước khi gõ. */
    recordSent(group: string, text: string, at: number): void;
    /** Chạy `fn` khi giữ khóa giao diện Zalo; `acquired: false` khi người khác đang giữ. */
    withLock(fn: () => Promise<SendResult>): Promise<{ acquired: true; result: SendResult } | { acquired: false }>;
    /** Gửi thật; phải gọi `hooks.beforeType` và `hooks.beforeEnter` đúng lúc. */
    send(group: string, reply: OutgoingReply, hooks: SendHooks): Promise<SendResult>;
    /** Công tắc dừng nhanh (tệp `data/.chat-off`). */
    off(): boolean;
    log(message: string): void;
}

/**
 * Xử lý các tin mới của hộp thư theo thứ tự. Dừng ở tin đầu tiên phải hoãn để giữ đúng thứ tự;
 * con trỏ chỉ tiến tới hết tin cuối đã xử lý xong. Tin gửi lỗi (kể cả không xác nhận được) được đánh dấu xong và
 * không tự gửi lại, vì tin có thể đã ra ngoài.
 */
export async function runChatCycle(deps: ChatDeps): Promise<ChatSummary> {
    const summary: ChatSummary = { sent: 0, dryRun: 0, ignored: 0, deferred: 0, failed: 0 };
    let advanceTo: number | null = null;

    for (const { entry, end } of deps.readNew()) {
        const now = deps.now();

        if (deps.isDone(entry.msgId)) {
            advanceTo = end;
            continue;
        }
        const retryAt = deps.deferUntil.get(entry.msgId);
        if (retryAt !== undefined && now < retryAt) {
            summary.deferred++; // vừa bị hoãn: đừng giật giao diện Zalo của người dùng mỗi vòng
            break;
        }
        const group = deps.rules.groups[entry.groupName];
        if (!group) {
            summary.ignored++;
            advanceTo = end;
            continue;
        }
        if (isStale(entry.ts, now, deps.rules.limits.maxReplyDelaySeconds)) {
            deps.log(`[chat] bỏ tin ${entry.msgId} của "${entry.groupName}": quá hạn trả lời`);
            summary.ignored++;
            advanceTo = end;
            continue;
        }
        const rule = pickRule(group.rules, entry);
        if (!rule) {
            summary.ignored++;
            advanceTo = end;
            continue;
        }
        if (deps.off()) {
            deps.log(`[chat] công tắc dừng đang bật: không trả lời tin ${entry.msgId} ("${rule.id}")`);
            summary.ignored++;
            advanceTo = end;
            continue;
        }

        const check = deps.limiter.check(entry.groupName, rule.id, now);
        if (!check.ok && check.reason === "cooldown") {
            deps.log(`[chat] "${rule.id}" ở "${entry.groupName}" đang trong thời gian nghỉ: bỏ tin ${entry.msgId}`);
            summary.ignored++;
            advanceTo = end;
            continue;
        }
        if (!check.ok) {
            deps.log("[chat] đã chạm giới hạn số tin mỗi phút: hoãn phần còn lại");
            summary.deferred++;
            break;
        }

        const reply: OutgoingReply = { text: renderReply(rule, entry), mentions: rule.mention ?? [] };
        const text = echoText(reply); // như sẽ hiện trong nhóm, gồm cả @tên
        if (deps.rules.dryRun) {
            deps.log(`[chat] [dry-run] sẽ trả lời "${entry.groupName}" (${rule.id}): ${text}`);
            deps.limiter.record(entry.groupName, rule.id, now);
            deps.markDone(entry.msgId);
            summary.dryRun++;
            advanceTo = end;
            continue;
        }

        const hooks: SendHooks = {
            // Sổ tin dội lại chỉ được ghi khi chắc chắn sắp gõ (chốt chặn đã qua), và tin được đánh dấu xong TRƯỚC
            // Enter: chết ngay sau Enter thì mất một câu trả lời, không bao giờ gửi trùng.
            beforeType: () => deps.recordSent(entry.groupName, text, now),
            beforeEnter: () => deps.markDone(entry.msgId),
        };
        let outcome: { acquired: true; result: SendResult } | { acquired: false };
        try {
            outcome = await deps.withLock(() => deps.send(entry.groupName, reply, hooks));
        } catch (err) {
            outcome = { acquired: true, result: { status: "failed", reason: (err as Error).message } };
        }
        if (!outcome.acquired) {
            deps.log("[chat] Zalo đang được tiến trình khác điều khiển: hoãn");
            summary.deferred++;
            break;
        }
        const result = outcome.result;
        if (result.status === "sent") {
            deps.log(`[chat] đã trả lời "${entry.groupName}" (${rule.id}): ${text}`);
            deps.limiter.record(entry.groupName, rule.id, now);
            deps.markDone(entry.msgId);
            summary.sent++;
            advanceTo = end;
        } else if (result.status === "skipped") {
            deps.log(`[chat] chưa gửi được vào "${entry.groupName}" (${result.reason}): hoãn ${SKIP_BACKOFF_MS / 1000} giây`);
            deps.deferUntil.set(entry.msgId, now + SKIP_BACKOFF_MS);
            summary.deferred++;
            break;
        } else {
            deps.log(`[chat] gửi lỗi vào "${entry.groupName}": ${result.reason}${result.unconfirmed ? " (có thể đã gửi; không gửi lại)" : ""}`);
            deps.markDone(entry.msgId);
            summary.failed++;
            advanceTo = end;
        }
    }

    if (advanceTo !== null) deps.commit(advanceTo);
    return summary;
}
