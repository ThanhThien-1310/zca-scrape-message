import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { InboxEntry, InboxItem } from "../types/index.js";

/**
 * Hộp thư của `bot:chat`: `bot:watch` chỉ thêm dòng, `bot:chat` đọc từ con trỏ. Tách khỏi hàng chờ cào
 * để `bot:runner` không bao giờ nhìn thấy nó. Mỗi dòng là một JSON; dòng chưa xuống dòng (đang ghi dở) chưa được đọc.
 */
export const DEFAULT_INBOX_PATH = path.join(config.dataDir, ".chat-inbox.jsonl");
export const DEFAULT_CURSOR_PATH = path.join(config.dataDir, ".chat-inbox.cursor");

export function appendInbox(entry: InboxEntry, file: string = DEFAULT_INBOX_PATH): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, "utf8");
}

function readCursor(cursorFile: string): number {
    try {
        const n = Number(fs.readFileSync(cursorFile, "utf8").trim());
        return Number.isInteger(n) && n >= 0 ? n : 0;
    } catch {
        return 0;
    }
}

export function writeCursor(offset: number, cursorFile: string = DEFAULT_CURSOR_PATH): void {
    writeFileAtomic(cursorFile, String(offset));
}

function isEntry(v: unknown): v is InboxEntry {
    if (typeof v !== "object" || v === null) return false;
    const o = v as Record<string, unknown>;
    return ["groupName", "groupId", "msgId", "senderId", "senderName", "text"].every((k) => typeof o[k] === "string") && typeof o.ts === "number";
}

/** Các dòng đầy đủ sau con trỏ, theo thứ tự; dòng hỏng bị bỏ qua. Con trỏ vượt quá tệp (tệp đã xoay) thì đọc lại từ đầu. */
export function readInbox(file: string = DEFAULT_INBOX_PATH, cursorFile: string = DEFAULT_CURSOR_PATH): InboxItem[] {
    let buf: Buffer;
    try {
        buf = fs.readFileSync(file);
    } catch {
        return [];
    }
    let pos = readCursor(cursorFile);
    if (pos > buf.length) pos = 0;

    const items: InboxItem[] = [];
    while (pos < buf.length) {
        const nl = buf.indexOf(0x0a, pos);
        if (nl < 0) break; // dòng cuối chưa hoàn chỉnh
        const line = buf.subarray(pos, nl).toString("utf8");
        pos = nl + 1;
        try {
            const v: unknown = JSON.parse(line);
            if (isEntry(v)) items.push({ entry: v, end: pos });
        } catch {
            /* dòng hỏng */
        }
    }
    return items;
}
