import type { RealtimeMessageEvent } from "../history/realtimeListener.js";
import type { InboxEntry } from "./inbox.js";

export interface RouteInput {
    event: Pick<RealtimeMessageEvent, "groupId" | "photoMessage" | "textMessage">;
    /** Tên nhóm trong `config.targets` ứng với `groupId`; undefined nếu chưa biết. */
    target: string | undefined;
    /** Nhóm có trong `chat-rules.json`. */
    allowedGroups: ReadonlySet<string>;
    /** Nhóm chỉ chat (`"scrape": false`): không bao giờ xếp vào hàng chờ cào. */
    noScrapeGroups?: ReadonlySet<string>;
    /** Có phải câu bot vừa gửi quay về không (tiêu mục trong sổ nếu đúng). */
    consumeEcho: (target: string, text: string) => boolean;
}

export interface Route {
    /** Xếp nhóm vào hàng chờ cào (luồng của `bot:runner`). */
    queue: boolean;
    /** Dòng ghi vào hộp thư chat (luồng của `bot:chat`), hoặc null. */
    inbox: InboxEntry | null;
}

/**
 * Một tin đi vào hai luồng độc lập. Nhóm không có trong rules không bao giờ vào hộp thư chat; tin của chính
 * tài khoản không bao giờ vào hộp thư chat; câu bot vừa gửi quay về bị bỏ ở cả hai luồng (không cào thừa, không tự trả lời).
 */
export function routeMessage(input: RouteInput): Route {
    const { event, target, allowedGroups } = input;
    if (!target) return { queue: false, inbox: null };
    const t = event.textMessage;
    // Tin dội lại được nhận ra theo sổ, kể cả khi Zalo không đánh dấu nó là của chính tài khoản (phòng thủ nhiều lớp:
    // nếu không, câu trả lời của bot có thể bị chính bot khớp và trả lời tiếp). Chỉ hỏi sổ khi có khả năng là của bot.
    if (t && (t.isSelf || allowedGroups.has(target)) && input.consumeEcho(target, t.content)) return { queue: false, inbox: null };

    const inbox: InboxEntry | null =
        t && !t.isSelf && t.content.trim() !== "" && allowedGroups.has(target)
            ? { groupName: target, groupId: event.groupId, msgId: t.msgId, senderId: t.senderId, senderName: t.senderName, ts: t.ts, text: t.content }
            : null;
    return { queue: !input.noScrapeGroups?.has(target), inbox };
}

/**
 * Như `routeMessage` nhưng phần chat không bao giờ làm mất việc phát hiện tin: nếu nó ném lỗi (ví dụ không ghi được
 * sổ), nhóm vẫn được xếp hàng cào như trước khi có chat và không có gì vào hộp thư chat.
 */
export function routeMessageSafe(input: RouteInput, onError: (err: Error) => void): Route {
    try {
        return routeMessage(input);
    } catch (err) {
        onError(err as Error);
        return { queue: !!input.target && !input.noScrapeGroups?.has(input.target), inbox: null };
    }
}
