import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { Report } from "../types/index.js";

export type FaultCategory = "internet" | "netsupport";

export interface StreakEntry {
    count: number;
    lastMsgId: string;
    lastTs: number;
}

export type StreakState = Record<string, StreakEntry>;

export const DEFAULT_STREAKS_PATH = path.join(config.dataDir, ".status-streaks.json");

const CATEGORY_FACILITY: Record<FaultCategory, "Internet" | "NetSupport"> = { internet: "Internet", netsupport: "NetSupport" };
const DEFAULT_CATEGORIES: FaultCategory[] = ["internet", "netsupport"];

export function streakKey(maNhom: string, phongMay: string, category: FaultCategory): string {
    return `${maNhom}|${phongMay.trim().toUpperCase()}|${category}`;
}

export interface ApplyStreaksResult {
    state: StreakState;
    /** key: `${maTinNhan}|${category}` -> streak count as of that specific report. */
    perMessage: Map<string, number>;
}

/**
 * Xử lý `reports` theo thứ tự `thoiGian` tăng dần (bất kể thứ tự truyền vào), cập nhật số lần liên tiếp bị "K"
 * cho từng (nhóm, phòng, loại). Không sửa `state` truyền vào — trả về bản mới. Một báo cáo không có `phongMay`,
 * hoặc không có `xepLoai` hợp lệ cho loại đang xét, bị bỏ qua với loại đó (giữ nguyên số cũ, không ghi vào `perMessage`).
 * Đã xử lý một `maTinNhan` cho một khoá rồi (khớp `lastMsgId` đã lưu) thì không cộng lại — cho phép chạy lại an toàn.
 */
export function applyStreaks(state: StreakState, reports: Report[], categories: FaultCategory[] = DEFAULT_CATEGORIES): ApplyStreaksResult {
    const next: StreakState = { ...state };
    const perMessage = new Map<string, number>();
    const sorted = [...reports].sort((a, b) => a.thoiGian - b.thoiGian);

    for (const r of sorted) {
        if (!r.data.phongMay) continue;
        for (const category of categories) {
            const facility = r.data.coSoVatChat.find((f) => f.loai === CATEGORY_FACILITY[category]);
            if (!facility || facility.xepLoai === null) continue;

            const key = streakKey(r.maNhom, r.data.phongMay, category);
            const prev = next[key];
            if (prev && prev.lastMsgId === r.maTinNhan) {
                perMessage.set(`${r.maTinNhan}|${category}`, prev.count);
                continue;
            }
            const count = facility.xepLoai === "K" ? (prev?.count ?? 0) + 1 : 0;
            next[key] = { count, lastMsgId: r.maTinNhan, lastTs: r.thoiGian };
            perMessage.set(`${r.maTinNhan}|${category}`, count);
        }
    }
    return { state: next, perMessage };
}

function isStreakEntry(v: unknown): v is StreakEntry {
    return typeof v === "object" && v !== null && typeof (v as StreakEntry).count === "number" && typeof (v as StreakEntry).lastMsgId === "string" && typeof (v as StreakEntry).lastTs === "number";
}

function isStreakState(v: unknown): v is StreakState {
    return typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every(isStreakEntry);
}

/** Missing or unreadable file reads as empty; a wrongly-shaped file also reads as empty rather than throwing. */
export function readStreaks(file: string = DEFAULT_STREAKS_PATH): StreakState {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return isStreakState(v) ? v : {};
    } catch {
        return {};
    }
}

export function writeStreaks(state: StreakState, file: string = DEFAULT_STREAKS_PATH): void {
    writeFileAtomic(file, JSON.stringify(state, null, 2));
}
