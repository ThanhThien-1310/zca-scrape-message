/** Một tin chữ `bot:watch` đưa vào hộp thư chat. */
export interface InboxEntry {
    groupName: string;
    groupId: string;
    msgId: string;
    senderId: string;
    senderName: string;
    ts: number;
    text: string;
}
