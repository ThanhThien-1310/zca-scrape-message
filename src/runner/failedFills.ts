import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { isPhase } from "../lesson/time.js";
import { isReportKey, REPORT_KEYS, type ReportKey } from "../reportSets/registry.js";
import type { SessionKey } from "../types/index.js";

/**
 * Các cặp (bộ, giai đoạn, mã báo cáo) mà lần điền file trước bị lỗi (mẫu thiếu, file đang mở trong Excel...). Một giai đoạn
 * vẫn được coi là "đã dựng" (tin đã đọc xong) dù một file của nó lỗi, nên việc thử lại không thể suy ra từ tập "đã dựng":
 * danh sách này nhớ chính xác cái gì cần điền lại. Mã báo cáo theo ngày không cần ở đây (chúng tự quét lại mỗi vòng).
 */
export const DEFAULT_FAILED_PATH = path.join(config.dataDir, ".runner-failed.json");

export const failedKey = (setId: string, session: SessionKey, key: ReportKey): string => `${setId}|${session.day}|${session.buoi}|${key}`;

/** File thiếu, hỏng hoặc sai dạng đều đọc ra rỗng (mất nhớ chỉ khiến một file lỗi không được tự thử lại). */
export function readFailed(file: string = DEFAULT_FAILED_PATH): Set<string> {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : new Set();
    } catch {
        return new Set();
    }
}

export function writeFailed(failed: Set<string>, file: string = DEFAULT_FAILED_PATH): void {
    writeFileAtomic(file, JSON.stringify([...failed].sort(), null, 2));
}

export interface RetryPlan {
    session: SessionKey;
    keys: ReportKey[];
}

/** Các giai đoạn có file lỗi của MỘT bộ, kèm những mã cần điền lại (theo thứ tự bảng đăng ký). Mục đọc không ra thì bỏ qua. */
export function retryPlans(failed: Set<string>, setId: string): RetryPlan[] {
    const bySession = new Map<string, { session: SessionKey; keys: Set<ReportKey> }>();
    for (const entry of failed) {
        const [id, day, phase, key] = entry.split("|");
        if (id !== setId || !day || !isPhase(phase) || !isReportKey(key)) continue;
        const k = `${day}|${phase}`;
        const slot = bySession.get(k) ?? { session: { day, buoi: phase }, keys: new Set<ReportKey>() };
        slot.keys.add(key);
        bySession.set(k, slot);
    }
    return [...bySession.values()].map((s) => ({ session: s.session, keys: REPORT_KEYS.filter((k) => s.keys.has(k)) }));
}

/** Sau một lần điền: bỏ các mã vừa thử khỏi danh sách rồi thêm lại đúng những mã còn lỗi. */
export function settle(failed: Set<string>, setId: string, session: SessionKey, attempted: ReportKey[], nowFailed: ReportKey[]): void {
    for (const key of attempted) failed.delete(failedKey(setId, session, key));
    for (const key of nowFailed) failed.add(failedKey(setId, session, key));
}

/**
 * Quên các file lỗi của những ngày TRƯỚC `today` (YYYY-MM-DD) và các mục không đọc được: một file lỗi mãi mãi (mẫu bị xoá hẳn, file bị khoá cả
 * ngày) không được thử lại vô hạn — mỗi lần thử là một vòng runner (khoá cào, đồng bộ DB, Excel). Trả về số mục đã bỏ.
 */
export function dropStaleFailed(failed: Set<string>, today: string): number {
    let dropped = 0;
    for (const entry of [...failed]) {
        const day = entry.split("|")[1];
        if (day === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today) {
            failed.delete(entry);
            dropped++;
        }
    }
    return dropped;
}
