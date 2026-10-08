import type { InboxEntry, Route, RouteInput } from "../types/index.js";

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
