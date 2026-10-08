import fs from "node:fs";
import path from "node:path";
import type { ReportKey } from "../reportSets/registry.js";
import type { Phase } from "../types/index.js";
import type { FillTemplateArgs } from "./excelFill.js";
import { freeHhmm, staleName, trackerKey, type TrackerState } from "./statusFileTracker.js";
import { freeFormFileName, type FileFillSpec } from "./statusReportLayout.js";
import { hhmmVietnam } from "./time.js";

/**
 * Giờ "HHmm" (giờ Việt Nam) đặt vào tên file của một giai đoạn: giờ của BÁO CÁO MUỘN NHẤT trong giai đoạn đó (đầu buổi sáng lấy báo cáo trễ nhất
 * trước 9h, cuối buổi sáng lấy báo cáo trễ nhất của khung đó, các giai đoạn khác tương tự), không phải giờ chạy. Khung giờ của các giai đoạn
 * không giao nhau nên giờ này gần như luôn khác nhau giữa các giai đoạn; dựng lại mà không có báo cáo mới thì ra đúng tên cũ. Giai đoạn không
 * có báo cáo nào thì lấy giờ chạy `fallbackNow`.
 */
export function latestReportHhmm(reports: ReadonlyArray<{ thoiGian: number }>, fallbackNow: number): string {
    return hhmmVietnam(reports.length === 0 ? fallbackNow : Math.max(...reports.map((r) => r.thoiGian)));
}

/** Mọi thứ việc điền cần từ bên ngoài, để test được mà không cần Excel hay đĩa thật (bản thật nằm ở `src/cli/fill-status-reports.ts`). */
export interface StatusFillDeps {
    templatesSrc: string;
    outDir: string;
    fill(args: FillTemplateArgs): string;
    readTitle(templatePath: string, sheet: string): string;
    removeFile(file: string): void;
    log(message: string): void;
    warn(message: string): void;
}

export interface StatusFillInput {
    setId: string;
    day: string;
    buoi: Phase;
    /** Giờ dạng "HHmm" đóng dấu vào tên file (xem `latestReportHhmm`); nếu giai đoạn khác trong ngày đã dùng giờ này thì `fillStatusFiles` lấy phút kế tiếp. */
    hhmm: string;
    keys: ReportKey[];
    specs: Partial<Record<ReportKey, FileFillSpec>>;
    /** Sổ tên file mới nhất của từng (bộ, ngày, giai đoạn, tiêu đề); hàm này cập nhật nó tại chỗ. */
    tracker: TrackerState;
}

export interface StatusFillResult {
    ok: ReportKey[];
    failed: Array<{ key: ReportKey; message: string }>;
}

/**
 * Điền từng mã báo cáo theo giai đoạn của MỘT bộ. Mỗi mã nằm trong `try` riêng: việc đọc tiêu đề mẫu (mẫu thiếu), dựng tên, điền file, xoá
 * bản cũ và dọn bản ghi dở đều có thể lỗi mà không được làm dừng các mã còn lại. Mã lỗi: bản cũ và dòng tracker của nó được giữ nguyên.
 * Bản cũ của mã thành công chỉ bị xoá SAU khi bản mới ghi xong; xoá không được (đang mở trong Excel) thì chỉ cảnh báo.
 */
export function fillStatusFiles(input: StatusFillInput, deps: StatusFillDeps): StatusFillResult {
    const result: StatusFillResult = { ok: [], failed: [] };
    for (const key of input.keys) {
        let outName: string | undefined;
        try {
            const spec = input.specs[key];
            if (!spec) throw new Error(`không có dữ liệu dựng cho mã "${key}"`);
            const title = deps.readTitle(path.join(deps.templatesSrc, spec.templateFile), spec.sheet);
            // Tên chỉ có giờ phút, không có giai đoạn: giai đoạn dựng liền sau giai đoạn khác trong cùng phút phải lấy phút khác, không thì ghi đè.
            outName = freeFormFileName(title, input.day, freeHhmm(input.tracker, input.setId, input.day, input.buoi, title, input.hhmm));
            const log = deps.fill({ name: key, templatesSrc: deps.templatesSrc, layout: spec, outDir: deps.outDir, outName, rows: spec.rows, headerCells: spec.headerCells, formulaCells: spec.formulaCells });
            if (log) deps.log(log);
            const k = trackerKey(input.setId, input.day, input.buoi, title);
            const old = staleName(input.tracker, k, outName);
            if (old) {
                try {
                    deps.removeFile(path.join(deps.outDir, old));
                } catch (err) {
                    deps.warn(`không xoá được bản cũ "${old}" (đang mở trong Excel?): ${(err as Error).message}`);
                }
            }
            input.tracker[k] = outName;
            result.ok.push(key);
        } catch (err) {
            result.failed.push({ key, message: (err as Error).message });
            // Bản mới ghi dở (mới chỉ chép từ file mẫu): bỏ đi. Xoá không được (file đang bị Excel giữ — chính là lý do "Access denied") thì bỏ qua.
            if (outName) {
                try {
                    deps.removeFile(path.join(deps.outDir, outName));
                } catch {
                    /* giữ nguyên file */
                }
            }
        }
    }
    return result;
}

/** File báo cho runner biết những mã nào của lần chạy này bị lỗi (script thoát mã 1 chỉ cho biết "có lỗi"). */
export const FILL_FAILED_FILE = "fill-failed.json";

export function writeFillFailed(dir: string, keys: ReportKey[]): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILL_FAILED_FILE), JSON.stringify(keys), "utf8");
}

/** null khi không có file hoặc file hỏng: người gọi coi là "không biết mã nào lỗi" và thử lại tất cả. */
export function readFillFailed(dir: string): string[] | null {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(path.join(dir, FILL_FAILED_FILE), "utf8"));
        return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : null;
    } catch {
        return null;
    }
}

export function clearFillFailed(dir: string): void {
    fs.rmSync(path.join(dir, FILL_FAILED_FILE), { force: true });
}

/**
 * Các mã (trong số `attempted`) lỗi ở lần chạy `fill-status-reports` vừa rồi. File không đọc được (script chết trước khi ghi) thì coi mọi mã
 * vừa thử đều lỗi; mã trong file mà không nằm trong `attempted` (file cũ còn sót) bị bỏ qua.
 */
export function failedKeysOf(dir: string, attempted: ReportKey[]): ReportKey[] {
    const reported = readFillFailed(dir);
    return reported === null ? [...attempted] : attempted.filter((k) => reported.includes(k));
}
