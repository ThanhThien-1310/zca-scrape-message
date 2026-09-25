import type { RealtimeMessageEvent } from "../history/realtimeListener.js";
import type { InboxEntry } from "./inbox.js";

export interface RouteInput {
    event: Pick<RealtimeMessageEvent, "groupId" | "photoMessage" | "textMessage">;
    /** Tên nhóm trong `config.targets` ứng với `groupId`; undefined nếu chưa biết. */
    target: string | undefined;
    /** Nhóm có trong `chat-rules.json`. */
    allowedGroups: ReadonlySet<string>;
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
    if (t?.isSelf && input.consumeEcho(target, t.content)) return { queue: false, inbox: null };

    const inbox: InboxEntry | null =
        t && !t.isSelf && t.content.trim() !== "" && allowedGroups.has(target)
            ? { groupName: target, groupId: event.groupId, msgId: t.msgId, senderId: t.senderId, senderName: t.senderName, ts: t.ts, text: t.content }
            : null;
    return { queue: true, inbox };
}
