// Shared message types. Import them from "../types/index.js".

/** The subset of a scraped message (data/<groupId>.json) the extractor reads. */
export interface SourceMessage {
    msgId: string;
    groupId: string;
    groupName: string;
    senderId: string;
    ts: number;
    msgType: string;
    content: string;
}

export type ScrapedRow = {
    externalId: string;
    senderId: string;
    senderName: string;
    content: string;
    ts: number | null;
    isSelf: boolean;
    /** Real Zalo conversation id (group: `g<digits>`; DM: the other party's numeric user id) — not derived from any display name, stable across renames. Null only if Zalo's internal data model couldn't be read for this row. */
    groupId: string | null;
    /** Display name of the conversation at scrape time — informational only; use `groupId` for identity. */
    groupName: string | null;
    isGroup: boolean;
    /** True for a photo bubble (class-detected in extractRowsFromMessageSrc). */
    isPhoto?: boolean;
    /** Client message id parsed from data-qid — names the photo's file in Zalo's local download cache. */
    cliMsgId?: string;
};

/**
 * Columns of the `Zalo_CrawlMessage` table (see Zalo_CrawlMessage.md) that
 * this project fills in. `Id`, `HasRead`, `StatusId` and `Created` are left
 * to the database (defaults / generated) and are deliberately not here.
 */
export type CrawlMessageRow = {
    MessageId: string;
    MessageType: "text" | "image";
    IsSelf: boolean;
    SenderId: string;
    SenderName: string;
    GroupId: string;
    GroupName: string;
    Timestamp: number;
    TextContent: string;
    Url: string | null;
    /** 1 = normal, 2 = recalled. Recall tracking isn't implemented on the scraper side yet, so always 1. */
    MessageStatus: 1 | 2;
};

export type NormalizedMessage = {
    msgId: string;
    /** Real Zalo conversation id (group: `g<digits>`; DM: the other party's numeric user id) — stable across renames, also used as the JSON filename. */
    groupId: string;
    /** Display name of the conversation at scrape time — informational only, never used as a storage key. */
    groupName: string;
    threadType: "user" | "group";
    senderId: string;
    senderName: string;
    isSelf: boolean;
    ts: number;
    /** `"desktop.text"` for DOM-scraped rows (the only kind this scraper reads text content for); `"chat.photo"` for a photo message saved directly from the realtime WS payload — see src/watch/realtimeListener.ts. Other Zalo msgTypes (sticker, voice, video, file...) aren't captured specially yet and fall through as an empty-content `"desktop.text"` row, same as before. */
    msgType: string;
    /** Message text. For `"chat.photo"`, this is the photo's caption (empty string if it has none) — the image itself is `url`, not `content`. */
    content: string;
    /** Path of the saved image file, relative to the data dir (`images/<groupId>/<msgId>.<ext>`, see src/store/imageStore.ts) — only present for `"chat.photo"` rows whose image could actually be saved. */
    url?: string;
};

/** A plain text message (msgType "webchat"): what `bot:chat` needs, straight from the WS frame. */
export type TextMessage = {
    msgId: string;
    senderId: string;
    senderName: string;
    /** True for the account's own messages (the wire sends `uidFrom: "0"`); id and name are blank then. */
    isSelf: boolean;
    ts: number;
    content: string;
};

export type RealtimeMessageEvent = {
    groupId: string;
    isGroup: boolean;
    /**
     * Present only for a photo message, whose WS frame already carries
     * everything needed to save a row directly (unlike plain text, where
     * DOM scrape remains the source of truth). `msgId` is Zalo's own
     * numeric message id (`msg.msgId` on the wire) — confirmed live to
     * match character-for-character the `data-qid` attribute the same
     * message's DOM row carries (see extractRowsFromMessageSrc in
     * src/scrape/desktopScraper.ts), so a save here dedupes correctly against
     * whatever the DOM scrape saves for the same row. `senderId`/`senderName` are blank for the account's own messages
     * (the wire format sends `uidFrom: "0"` for those, with no numeric id
     * substitute available at this layer), matching how self-sent rows
     * already look coming from the DOM path.
     */
    photoMessage?: {
        msgId: string;
        senderId: string;
        senderName: string;
        isSelf: boolean;
        ts: number;
        /** The photo's caption — empty string if it has none. */
        content: string;
        url: string;
    };
    /** Present for a plain text message; the source of truth for text content stays the DOM scrape. */
    textMessage?: TextMessage;
};
