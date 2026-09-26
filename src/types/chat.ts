// Shared chat types. Import them from "../types/index.js".

import type { RealtimeMessageEvent } from "./message.js";
import type { LoaiBaoCao } from "./report.js";

export interface ChatSummary {
    sent: number;
    dryRun: number;
    /** Không trả lời (không khớp, nhóm không có rules, quá hạn, cooldown, công tắc dừng): coi như xong. */
    ignored: number;
    /** Chưa gửi được lúc này (khóa bận, ô soạn tin đang có chữ, quá tốc độ): giữ lại cho vòng sau. */
    deferred: number;
    failed: number;
}

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

/** Một dòng đã đọc, kèm vị trí byte ngay sau nó (đặt con trỏ tới đó để coi như đã xử lý). */
export interface InboxItem {
    entry: InboxEntry;
    end: number;
}

/** Điều kiện của một tình huống: mọi khóa có mặt phải cùng khớp. */
export interface When {
    loaiBaoCao?: LoaiBaoCao[];
    mayLoi?: true;
    keywords?: string[];
}

export interface Rule {
    id: string;
    when: When;
    reply: string;
    /** Tên những người bot gắn thẻ (@) ở đầu câu trả lời, đúng như hiện trong danh sách thành viên của nhóm. */
    mention?: string[];
}

export interface Limits {
    maxRepliesPerMinute: number;
    maxReplyDelaySeconds: number;
    cooldownSecondsPerRule: number;
}

export interface ChatRules {
    version: 1;
    dryRun: boolean;
    limits: Limits;
    /** `scrape: false` = chat-only group: never queued for scraping, never recovered (default true). */
    groups: Record<string, { rules: Rule[]; scrape: boolean }>;
}

export interface ComposerState {
    /** Tên nhóm đang được chọn ở thanh bên. */
    title: string | null;
    /** `placeholder` của ô soạn tin, dạng "Nhập @, tin nhắn tới  <tên nhóm>". */
    placeholder: string | null;
    /** Ô soạn tin đang trống (class `empty`). */
    empty: boolean | null;
    text: string | null;
}

/** Thứ bot gửi: câu trả lời và những người cần gắn thẻ (gắn trước, theo thứ tự). */
export interface OutgoingReply {
    text: string;
    mentions: string[];
}

export type SendResult =
    | { status: "sent" }
    | { status: "skipped"; reason: "draft" | "not-opened" }
    | { status: "failed"; reason: string; unconfirmed?: boolean };
