import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { Phase } from "../types/index.js";

/**
 * Tên file của 8 báo cáo trạng thái đóng dấu GIỜ CHẠY THỰC TẾ (không còn mốc cố định theo giai đoạn), nên tên
 * file không còn cho biết file thuộc giai đoạn nào — không thể dọn bản cũ bằng cách so tên. File này nhớ tên
 * file mới nhất của từng (ngày, giai đoạn, tiêu đề) để lần dựng lại SAU xoá đúng bản cũ của đúng giai đoạn đó,
 * giữ mỗi giai đoạn đúng 1 file cho mỗi loại báo cáo. Khoá có `setId` vì mỗi bộ ghi vào thư mục riêng và có bản cũ riêng.
 */
export type TrackerState = Record<string, string>;

export const DEFAULT_TRACKER_PATH = path.join(config.dataDir, ".status-report-files.json");

export function trackerKey(setId: string, day: string, phase: Phase, title: string): string {
    return `${setId}|${day}|${phase}|${title}`;
}

/**
 * Giờ phút "HHmm" để đặt tên file của `phase`: `hhmm` nếu chưa giai đoạn KHÁC nào (cùng bộ, ngày, tiêu đề) dùng nó, nếu có thì phút kế tiếp
 * chưa ai dùng (qua giờ, và quay về 0000 sau 2359). Tên file không có tên giai đoạn nên hai giai đoạn dựng liền nhau trong cùng một phút
 * sẽ trùng tên và giai đoạn sau ghi đè giai đoạn trước; hàm này giữ nguyên định dạng tên mà vẫn cho mỗi giai đoạn một file riêng.
 * Chính giai đoạn `phase` dựng lại thì không bị coi là "người khác": giữ tên, ghi đè tại chỗ.
 */
export function freeHhmm(state: TrackerState, setId: string, day: string, phase: Phase, title: string, hhmm: string): string {
    const own = trackerKey(setId, day, phase, title);
    const taken = new Set<string>();
    for (const [key, name] of Object.entries(state)) {
        if (key === own) continue;
        const [keySet, keyDay, , ...keyTitle] = key.split("|");
        if (keySet !== setId || keyDay !== day || keyTitle.join("|") !== title) continue;
        const m = /_(\d{4})\.xlsx$/.exec(name);
        if (m) taken.add(m[1]);
    }
    let minutes = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2));
    for (let i = 0; i < 1440; i++) {
        const candidate = `${String(Math.floor(minutes / 60)).padStart(2, "0")}${String(minutes % 60).padStart(2, "0")}`;
        if (!taken.has(candidate)) return candidate;
        minutes = (minutes + 1) % 1440;
    }
    return hhmm;
}

/** Tên file cũ đã ghi cho `key` nếu khác `newName` (cần xoá sau khi ghi xong bản mới); null nếu chưa có hoặc trùng tên. */
export function staleName(state: TrackerState, key: string, newName: string): string | null {
    const previous = state[key];
    return previous !== undefined && previous !== newName ? previous : null;
}

function isTrackerState(v: unknown): v is TrackerState {
    return typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");
}

/** File thiếu, hỏng hoặc sai dạng đều đọc ra rỗng (mất nhớ chỉ khiến lần sau để lại 1 file cũ, không làm hỏng gì). */
export function readTracker(file: string = DEFAULT_TRACKER_PATH): TrackerState {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return isTrackerState(v) ? v : {};
    } catch {
        return {};
    }
}

export function writeTracker(state: TrackerState, file: string = DEFAULT_TRACKER_PATH): void {
    writeFileAtomic(file, JSON.stringify(state, null, 2));
}
