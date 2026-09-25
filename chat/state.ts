import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export const DEFAULT_DONE_PATH = path.join(config.dataDir, ".chat-done.json");
export const DEFAULT_SENT_PATH = path.join(config.dataDir, ".chat-sent.json");

const KEEP_SENT_MS = 10 * 60_000;
const ECHO_WINDOW_MS = 2 * 60_000;

function writeAtomic(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Tên tạm riêng cho từng tiến trình: `bot:watch` và `bot:chat` cùng ghi sổ tin đã gửi và không được dẫm lên tệp tạm của nhau.
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, file);
}

function readJson(file: string): unknown {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return undefined;
    }
}

/** `msgId` của các tin đã xử lý (đã trả lời, hoặc quyết định không trả lời): chống trả lời lại sau khi khởi động lại. */
export function loadDone(file: string = DEFAULT_DONE_PATH): Set<string> {
    const v = readJson(file);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
}

export function markDone(msgId: string, file: string = DEFAULT_DONE_PATH, keep = 500): void {
    const ids = [...loadDone(file)].filter((id) => id !== msgId);
    ids.push(msgId);
    writeAtomic(file, ids.slice(-keep));
}

interface Sent {
    groupName: string;
    text: string;
    at: number;
}

const norm = (s: string): string => s.normalize("NFC").replace(/\s+/g, " ").trim();

function readSent(file: string): Sent[] {
    const v = readJson(file);
    return Array.isArray(v) ? v.filter((s): s is Sent => !!s && typeof s.groupName === "string" && typeof s.text === "string" && typeof s.at === "number") : [];
}

/** Ghi nhớ một câu sắp gửi (ghi TRƯỚC khi gửi, để tin dội lại không kịp đến trước sổ). Các mục quá 10 phút bị xóa. */
export function recordSent(groupName: string, text: string, at: number, file: string = DEFAULT_SENT_PATH): void {
    const kept = readSent(file).filter((s) => at - s.at < KEEP_SENT_MS);
    kept.push({ groupName, text: norm(text), at });
    writeAtomic(file, kept);
}

/**
 * `bot:watch` hỏi khi thấy một tin của chính tài khoản: có phải câu bot vừa gửi không? Nếu có (cùng nhóm, cùng nội
 * sau khi chuẩn hóa, trong 2 phút), mục đó bị tiêu (mỗi câu đã gửi chỉ khớp một tin dội lại) và trả về true.
 */
export function consumeEcho(groupName: string, text: string, now: number, file: string = DEFAULT_SENT_PATH, windowMs: number = ECHO_WINDOW_MS): boolean {
    const sent = readSent(file);
    const wanted = norm(text);
    const i = sent.findIndex((s) => s.groupName === groupName && s.text === wanted && now - s.at <= windowMs);
    if (i < 0) return false;
    sent.splice(i, 1);
    writeAtomic(file, sent);
    return true;
}
