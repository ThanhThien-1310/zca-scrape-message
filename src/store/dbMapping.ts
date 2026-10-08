import type { CrawlMessageRow, NormalizedMessage } from "../types/index.js";

export const GROUP_NAME_MAX = 50;

export type MappingWarning = "group-name-truncated" | "empty-sender-id" | "image-without-url" | "text-without-content";

export function toCrawlMessageRow(m: NormalizedMessage): { row: CrawlMessageRow; warnings: MappingWarning[] } {
    const warnings: MappingWarning[] = [];
    const isImage = m.msgType === "chat.photo";

    let groupName = m.groupName;
    if (groupName.length > GROUP_NAME_MAX) {
        groupName = groupName.slice(0, GROUP_NAME_MAX);
        warnings.push("group-name-truncated");
    }
    if (!m.senderId) warnings.push("empty-sender-id");
    if (isImage && !m.url) warnings.push("image-without-url");
    if (!isImage && !m.content) warnings.push("text-without-content");

    return {
        row: {
            MessageId: m.msgId,
            MessageType: isImage ? "image" : "text",
            IsSelf: m.isSelf,
            SenderId: m.senderId,
            SenderName: m.senderName,
            GroupId: m.groupId,
            GroupName: groupName,
            Timestamp: m.ts,
            TextContent: m.content,
            Url: m.url ?? null,
            MessageStatus: 1,
        },
        warnings,
    };
}
