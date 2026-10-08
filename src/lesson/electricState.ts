import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { Cell } from "../types/index.js";

/** Bản ĐIỆN đã dựng gần nhất (file `data/.electric-report.json`): ngày, chữ ký của các dòng đã ghi, và tên file. */
export interface ElectricBuilt {
    day: string;
    signature: string;
    file: string;
}

export const DEFAULT_ELECTRIC_BUILT_PATH = path.join(config.dataDir, ".electric-report.json");

/** Trạng thái ĐIỆN của một bộ: `data/.electric-report.<id>.json` (mỗi bộ có file ĐIỆN riêng trong thư mục riêng, nên chữ ký và tên file riêng). */
export const electricBuiltPath = (setId: string): string => path.join(config.dataDir, `.electric-report.${setId}.json`);

/** Chữ ký nội dung của các dòng sẽ ghi vào file: cùng dòng ra cùng chữ ký, đổi bất kỳ ô nào ra chữ ký khác; không dòng nào cũng có chữ ký riêng. */
export function electricSignature(rows: Array<Record<string, Cell>>): string {
    return createHash("sha1").update(JSON.stringify(rows)).digest("hex");
}

/**
 * Có cần dựng lại file ĐIỆN của `day` không: chưa dựng lần nào, sang ngày khác, nội dung đổi (có tin điện mới làm đổi dòng), hoặc
 * file đã dựng không còn trên đĩa. Cùng ngày và cùng nội dung thì KHÔNG dựng lại, nên giờ trong tên file chỉ đổi khi có dữ liệu mới.
 */
export function electricNeedsRebuild(prev: ElectricBuilt | null, day: string, signature: string, fileExists: (name: string) => boolean): boolean {
    if (!prev || prev.day !== day || prev.signature !== signature) return true;
    return !fileExists(prev.file);
}

const isBuilt = (v: unknown): v is ElectricBuilt => {
    const r = v as Record<string, unknown> | null;
    return typeof r === "object" && r !== null && typeof r.day === "string" && typeof r.signature === "string" && typeof r.file === "string";
};

/** File thiếu, hỏng hoặc sai dạng đều đọc ra null (chỉ khiến lần sau dựng lại một lần). */
export function readElectricBuilt(file: string = DEFAULT_ELECTRIC_BUILT_PATH): ElectricBuilt | null {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return isBuilt(v) ? { day: v.day, signature: v.signature, file: v.file } : null;
    } catch {
        return null;
    }
}

export function writeElectricBuilt(state: ElectricBuilt, file: string = DEFAULT_ELECTRIC_BUILT_PATH): void {
    writeFileAtomic(file, JSON.stringify(state, null, 2));
}
