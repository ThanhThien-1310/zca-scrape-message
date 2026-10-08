import fs from "node:fs";
import path from "node:path";
import { listBundleDirs, readManifest } from "../vision/bundleStore.js";
import { leaveRowsOf } from "./review.js";
import { finalRow } from "./reviewApply.js";
import type { BundleReading, Review, ReviewStatus } from "../types/index.js";

/** Một dòng nghỉ phép đã đọc, kèm trạng thái review và các ô (đã đè các sửa của người xem), với thời điểm gửi ảnh của bộ chứa nó. */
export interface LeaveRowSource {
    bundleId: string;
    dir: string;
    rowIndex: number;
    /** Giờ gửi ảnh đầu của bộ (ảnh nào mới hơn thì thắng). */
    sentTs: number;
    /** Ngày gửi ảnh, `YYYY-MM-DD`. */
    sendDay: string;
    status: ReviewStatus;
    raw: Record<string, unknown>;
    reasons: string[];
    warnings: string[];
}

function readJson<T>(file: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as T;
    } catch {
        return null;
    }
}

/**
 * Mọi dòng nghỉ phép của các bộ đã đọc, từ ngày `sinceDay` trở đi. Bộ chưa đọc, chưa có review, hoặc bị bỏ cả bộ thì không có dòng nào; dòng người xem
 * đã bỏ (`da_bo`) cũng không xuất hiện. Chỉ đọc đĩa, không gọi agent.
 */
export function loadLeaveRows(root: string, sinceDay: string): LeaveRowSource[] {
    const out: LeaveRowSource[] = [];
    for (const dir of listBundleDirs(root)) {
        const manifest = readManifest(dir);
        if (!manifest || manifest.day < sinceDay) continue;
        const reading = readJson<BundleReading>(path.join(dir, "reading.json"));
        const review = readJson<Review>(path.join(dir, "review.json"));
        if (!reading || !review || review.dismissed) continue;
        const rows = leaveRowsOf(reading);
        for (const rr of review.rows) {
            if (rr.status === "da_bo") continue;
            const raw = rows[rr.index];
            if (!raw) continue;
            out.push({ bundleId: manifest.bundleId, dir, rowIndex: rr.index, sentTs: manifest.firstTs, sendDay: manifest.day, status: rr.status, raw: finalRow(raw, rr), reasons: rr.reasons, warnings: rr.warnings });
        }
    }
    return out;
}

/** Số bộ ảnh của các nhóm trong `groups` (từ `sinceDay`) chưa có `reading.json` hoặc đang có cờ đọc lại: ảnh đã gửi nhưng chưa được đọc. */
export function countUnreadBundles(root: string, sinceDay: string, groups: string[]): number {
    let n = 0;
    for (const dir of listBundleDirs(root)) {
        const m = readManifest(dir);
        if (!m || m.day < sinceDay || !groups.includes(m.groupName)) continue;
        if (m.reread || !fs.existsSync(path.join(dir, "reading.json"))) n += 1;
    }
    return n;
}
