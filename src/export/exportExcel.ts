import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../../config.js";
import type { NormalizedMessage } from "../types/index.js";

const exportDir = path.join(config.dataDir, "export");

const JSON_COLUMNS = ["msgId", "groupId", "groupName", "threadType", "senderId", "senderName", "isSelf", "ts", "msgType", "content", "url", "source"];

function todayStamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Zalo Desktop renders sender names with U+00A0 (NBSP) between words instead
 * of a regular space, and can carry zero-width chars — a raw `===` against a
 * typed name (which uses regular spaces) silently never matches, so both
 * sides of a senderName comparison go through this first.
 */
export function normalizeSenderName(name: string): string {
    return name
        .normalize("NFC")
        .replace(/[​-‍﻿]/g, "")
        .replace(/[\s ]+/g, " ")
        .trim();
}

/**
 * Writes messages to a .xlsx file (one sheet, one row per message), sorted
 * oldest first. Pass `opts.senderName` to keep only messages from that exact
 * sender. Note: Zalo Desktop's DOM only renders the sender name on the first
 * bubble of a consecutive run from the same person (see toNormalizedMessage
 * in desktopScraper.ts) — messages that follow it in the same burst have an
 * empty senderName and will NOT match a senderName filter, so a strict
 * filter can under-count a sender's real message total.
 */
export function exportThreadExcel(groupId: string, messages: NormalizedMessage[], opts: { senderName?: string; fileSuffix?: string } = {}): string {
    fs.mkdirSync(exportDir, { recursive: true });

    const wantedSender = opts.senderName ? normalizeSenderName(opts.senderName) : null;
    const filtered = wantedSender ? messages.filter((m) => normalizeSenderName(m.senderName) === wantedSender) : messages;

    const rows = filtered
        .slice()
        .sort((a, b) => a.ts - b.ts)
        .map((m) => ({
            msgId: m.msgId,
            groupId: m.groupId,
            groupName: m.groupName,
            threadType: m.threadType,
            senderId: m.senderId,
            senderName: m.senderName,
            isSelf: m.isSelf,
            ts: m.ts,
            msgType: m.msgType,
            content: m.content,
            url: m.url ?? "",
            source: (m as NormalizedMessage & { source?: string }).source ?? "",
        }));

    // Same column order as the keys in data/<groupId>.json.
    const sheet = XLSX.utils.json_to_sheet(rows, { header: JSON_COLUMNS });
    sheet["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 24 }, { wch: 11 }, { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 15 }, { wch: 14 }, { wch: 60 }, { wch: 40 }, { wch: 14 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Messages");

    const suffix = opts.fileSuffix ? `_${opts.fileSuffix}` : "";
    const filePath = path.join(exportDir, `${groupId}${suffix}_${todayStamp()}.xlsx`);
    XLSX.writeFile(workbook, filePath);
    return filePath;
}
