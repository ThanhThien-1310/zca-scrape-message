import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";

/** Bản LỊCH NGHỈ PHÉP đã dựng gần nhất của một bộ: ngày, chữ ký của các ô đã ghi, và tên file. */
export interface LeaveBuilt {
    day: string;
    signature: string;
    file: string;
}

/** Trạng thái của một bộ: `data/.leave-report.<id>.json` (mỗi bộ có file riêng trong thư mục riêng, nên chữ ký và tên file riêng). */
export const leaveBuiltPath = (setId: string): string => path.join(config.dataDir, `.leave-report.${setId}.json`);

/**
 * Có cần dựng lại file nghỉ phép của `day` không: chưa dựng lần nào, sang ngày khác, nội dung các ô đổi (có ảnh mới, kỳ nghỉ kết thúc, người xem sửa
 * dòng), hoặc file đã dựng không còn trên đĩa. Cùng ngày và cùng nội dung thì KHÔNG dựng lại, nên giờ trong tên file chỉ đổi khi có dữ liệu mới.
 */
export function leaveNeedsRebuild(prev: LeaveBuilt | null, day: string, signature: string, fileExists: (name: string) => boolean): boolean {
    if (!prev || prev.day !== day || prev.signature !== signature) return true;
    return !fileExists(prev.file);
}

const isBuilt = (v: unknown): v is LeaveBuilt => {
    const r = v as Record<string, unknown> | null;
    return typeof r === "object" && r !== null && typeof r.day === "string" && typeof r.signature === "string" && typeof r.file === "string";
};

/** File thiếu, hỏng hoặc sai dạng đều đọc ra null (chỉ khiến lần sau dựng lại một lần). */
export function readLeaveBuilt(file: string): LeaveBuilt | null {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return isBuilt(v) ? { day: v.day, signature: v.signature, file: v.file } : null;
    } catch {
        return null;
    }
}

export function writeLeaveBuilt(state: LeaveBuilt, file: string): void {
    writeFileAtomic(file, JSON.stringify(state, null, 2));
}
