import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { Mark } from "../types/index.js";

/**
 * Dấu StatusId/HasRead đã tính xong nhưng CHƯA ghi vào DB. Một giai đoạn được coi là "đã dựng" ngay khi dựng xong, còn dấu chỉ được ghi một lần
 * ở cuối vòng; nếu ghi lỗi (DB sập) hoặc runner bị tắt giữa chừng thì dấu không thể tính lại vì giai đoạn đó không được dựng lại. File này giữ
 * chúng cho tới khi ghi thành công (vòng sau ghi nốt).
 */
export const DEFAULT_PENDING_MARKS_PATH = path.join(config.dataDir, ".runner-marks-pending.json");

const isMark = (v: unknown): v is Mark => {
    const m = v as Record<string, unknown> | null;
    return typeof m === "object" && m !== null && typeof m.maNhom === "string" && typeof m.maTinNhan === "string" && typeof m.maTrangThai === "number";
};

/** File thiếu, hỏng hoặc sai dạng đều đọc ra rỗng. */
export function readPendingMarks(file: string = DEFAULT_PENDING_MARKS_PATH): Mark[] {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(v) ? v.filter(isMark) : [];
    } catch {
        return [];
    }
}

export function writePendingMarks(marks: Mark[], file: string = DEFAULT_PENDING_MARKS_PATH): void {
    writeFileAtomic(file, JSON.stringify(marks));
}
