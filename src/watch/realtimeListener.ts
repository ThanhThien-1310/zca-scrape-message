import zlib from "node:zlib";
import { webcrypto } from "node:crypto";
import type { CdpPage } from "../scrape/cdp.js";
import type { RealtimeMessageEvent, TextMessage } from "../types/index.js";

/**
 * Reads Zalo Desktop's own WebSocket connection to its chat backend
 * (wss://ws*-msg.chat.zalo.me) via CDP's `Network` domain — the same
 * connection the renderer already uses to update its own UI in real time.
 * No separate login, no cookie of our own: this only *observes* frames on
 * the connection Zalo Desktop's already-logged-in session opened itself.
 *
 * Protocol (reverse-engineered, cross-checked against zca-js's `listen.ts` /
 * `utils.ts` and confirmed live against this exact desktop build on
 * 2026-09-23): each binary frame is a 4-byte header (version, cmd as
 * uint16LE, subCmd) followed by a UTF-8 JSON body. The very first frame on a
 * fresh connection (`cmd=1, subCmd=1`) carries `{ key: "<base64>" }` — the
 * AES-GCM key for every encrypted frame on *this* connection. Frame bodies
 * otherwise look like `{ encrypt: 0|1|2|3, data: "..." }`; `encrypt:0` is
 * plain JSON, `encrypt:2` (the common case here) is
 * `gzip(AES-GCM-decrypt(base64(data)))` with the first 16 bytes of the
 * decoded buffer as IV, the next 16 as AAD, and the rest as ciphertext+tag.
 *
 * Decodes `cmd 501` (new DM) / `cmd 521` (new group message). For every
 * message this reads `idTo` (the conversation id, same value as
 * NormalizedMessage's `groupId`) to trigger a DOM scrape of that thread —
 * DOM scrape remains the source of truth for plain text content. For photo
 * messages specifically (`msgType === "chat.photo"`), this frame already
 * carries the image URL + caption directly (confirmed live 2026-09-23),
 * which the DOM scrape cannot read at all (`.text-message__container` is
 * empty for a photo bubble, with or without a caption) — so those are
 * reported as a ready-to-save `photoMessage` instead of left to the scrape.
 * A recalled/undone message (`msgType === "chat.undo"`, or `content` an
 * object carrying `deleteMsg`) is recognized but not yet acted on.
 */

const CMD_KEY_EXCHANGE = 1;
const CMD_NEW_USER_MESSAGE = 501;
const CMD_NEW_GROUP_MESSAGE = 521;

type FrameHeader = { version: number; cmd: number; subCmd: number };

type RawMessage = {
    idTo?: string;
    uidFrom?: string;
    dName?: string;
    ts?: string;
    msgType?: string;
    content?: unknown;
    msgId?: string;
};

type RawPhotoContent = {
    href?: string;
    title?: string;
};

function parseFrame(payloadBase64: string): { header: FrameHeader; body: unknown } | null {
    const buf = Buffer.from(payloadBase64, "base64");
    if (buf.length < 4) return null;
    const header: FrameHeader = { version: buf[0], cmd: buf.readUInt16LE(1), subCmd: buf[3] };
    const bodyText = buf.subarray(4).toString("utf-8");
    if (bodyText.length === 0) return { header, body: null };
    try {
        return { header, body: JSON.parse(bodyText) };
    } catch {
        return { header, body: null };
    }
}

async function decryptGroupMessagePayload(encData: string, cipherKey: string): Promise<Record<string, unknown> | null> {
    const decodedBuffer = Buffer.from(decodeURIComponent(encData), "base64");
    if (decodedBuffer.length < 48) return null;

    const iv = decodedBuffer.subarray(0, 16);
    const aad = decodedBuffer.subarray(16, 32);
    const ciphertext = decodedBuffer.subarray(32);
    const keyBytes = Buffer.from(cipherKey, "base64");

    const cryptoKey = await webcrypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
    const decrypted = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, cryptoKey, ciphertext);

    const decompressed = zlib.gunzipSync(Buffer.from(decrypted));
    return JSON.parse(decompressed.toString("utf-8"));
}

function buildTextMessage(msg: RawMessage): TextMessage | undefined {
    if (msg.msgType !== "webchat" || typeof msg.content !== "string" || !msg.msgId) return undefined;
    const isSelf = msg.uidFrom === "0";
    const ts = Number(msg.ts);
    return {
        msgId: msg.msgId,
        senderId: isSelf ? "" : (msg.uidFrom ?? ""),
        senderName: isSelf ? "" : (msg.dName ?? ""),
        isSelf,
        ts: Number.isFinite(ts) ? ts : Date.now(),
        content: msg.content,
    };
}

function buildPhotoMessage(msg: RawMessage): RealtimeMessageEvent["photoMessage"] | undefined {
    if (typeof msg.content !== "object" || msg.content === null) return undefined;
    const raw = msg.content as RawPhotoContent;
    if (!raw.href || !msg.msgId) return undefined;

    const isSelf = msg.uidFrom === "0";
    const ts = Number(msg.ts);
    return {
        // Zalo's own numeric message id — confirmed live to match exactly
        // what a DOM row's `data-qid` attribute carries for the same
        // message (see extractRowsFromMessageSrc in
        // src/scrape/desktopScraper.ts), so a photo saved from here dedupes
        // correctly if the DOM scrape also ends up seeing the same row.
        msgId: msg.msgId,
        senderId: isSelf ? "" : (msg.uidFrom ?? ""),
        senderName: isSelf ? "" : (msg.dName ?? ""),
        isSelf,
        ts: Number.isFinite(ts) ? ts : Date.now(),
        content: raw.title ?? "",
        url: raw.href,
    };
}

/**
 * Starts listening on `page` (must already be a connected main-window
 * CdpPage) for real-time new-message frames. Calls `onMessage` with the
 * conversation id every time one decodes successfully; decode failures
 * (protocol changed, frame arrived before the cipher key, unexpected shape)
 * are logged and skipped — this is a best-effort trigger source: messages it
 * misses are caught by the gap recovery (`recover:missing`, the runner's catch-up scrape).
 *
 * Must be called (and `page.enableNetwork()` must already have run) before
 * Zalo Desktop's own WebSocket connects, or the one-time cipher-key frame
 * will have already passed and no message frame will ever decode. See
 * src/watch/watch.ts for how the caller guarantees this ordering.
 */
export function installRealtimeListener(page: CdpPage, onMessage: (event: RealtimeMessageEvent) => void, onKeyCaptured?: () => void): void {
    let cipherKey: string | undefined;

    page.onWsFrameReceived((opcode, payloadBase64) => {
        if (opcode !== 2) return; // binary frames only
        const frame = parseFrame(payloadBase64);
        if (!frame) return;

        if (frame.header.cmd === CMD_KEY_EXCHANGE && frame.body && typeof frame.body === "object" && "key" in frame.body) {
            cipherKey = (frame.body as { key: string }).key;
            console.log("[watch] realtime-ws: cipher key captured, live message detection active");
            onKeyCaptured?.();
            return;
        }

        const isMessageCmd = frame.header.cmd === CMD_NEW_USER_MESSAGE || frame.header.cmd === CMD_NEW_GROUP_MESSAGE;
        if (!isMessageCmd || !frame.body || typeof frame.body !== "object") return;

        const body = frame.body as { encrypt?: number; data?: string };
        if (body.encrypt !== 2 || typeof body.data !== "string") return;
        if (!cipherKey) return; // frame arrived before we captured the key on this connection

        decryptGroupMessagePayload(body.data, cipherKey)
            .then((decoded) => {
                // decodeEventData's JSON shape is { error_code, error_message, data: { msgs | groupMsgs: [...] } }.
                const inner = decoded?.data as Record<string, unknown> | undefined;
                const msgs = (inner?.groupMsgs as RawMessage[] | undefined) ?? (inner?.msgs as RawMessage[] | undefined);
                if (!Array.isArray(msgs)) return;
                const isGroup = frame.header.cmd === CMD_NEW_GROUP_MESSAGE;

                for (const msg of msgs) {
                    if (!msg.idTo) continue;

                    // Recalled/undone message — recognized so it isn't
                    // mistaken for a photo below, but not acted on yet.
                    const isRecall = msg.msgType === "chat.undo" || (typeof msg.content === "object" && msg.content !== null && "deleteMsg" in msg.content);

                    // Only text and photo messages are supported right now
                    // — anything else (chat.voice, chat.sticker, chat.gif,
                    // chat.video.msg, share.file, chat.location.new...)
                    // is ignored outright: no trigger, no scrape, nothing
                    // saved. A recall is still worth letting through even
                    // though its own msgType is "chat.undo" (not in this
                    // allow-list), since it's about an *existing* saved
                    // message, not a new one of some unsupported type.
                    const isSupportedType = isRecall || msg.msgType === "webchat" || msg.msgType === "chat.photo";
                    if (!isSupportedType) continue;

                    // WS's idTo is the bare numeric id; the store's groupId
                    // (and this listener's lookup map, built from it) uses
                    // "g<digits>" for groups, the bare id for DMs — see
                    // NormalizedMessage.groupId in src/store/messageStore.ts.
                    const groupId = isGroup ? `g${msg.idTo}` : msg.idTo;

                    const photoMessage = !isRecall && msg.msgType === "chat.photo" ? buildPhotoMessage(msg) : undefined;
                    const textMessage = !isRecall ? buildTextMessage(msg) : undefined;
                    onMessage({ groupId, isGroup, photoMessage, textMessage });
                }
            })
            .catch((err) => console.warn(`[watch] realtime-ws: failed to decode cmd=${frame.header.cmd} frame: ${(err as Error).message}`));
    });
}
