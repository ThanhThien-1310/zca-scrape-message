import { config } from "../../config.js";
import { freeFormFileName } from "../lesson/statusReportLayout.js";

/** Hai đợt báo cáo tổng mỗi ngày: sáng (đến 9:00) và chiều (đến 15:00, cộng dồn). */
export type SlotName = "morning" | "afternoon";

export interface TotalSlot {
    name: SlotName;
    /** Ngày của đợt, YYYY-MM-DD theo giờ Việt Nam. */
    day: string;
    /** Đầu khung dữ liệu (epoch ms), tính cả mốc này. */
    fromMs: number;
    /** Giờ chạy của đợt, cũng là cuối khung dữ liệu (epoch ms), KHÔNG tính mốc này. */
    atMs: number;
}

export interface SlotHours {
    windowStartHour: number;
    morningHour: number;
    afternoonHour: number;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Mốc epoch-ms của `hour` giờ (có thể lẻ, vd 6.5 là 6:30) trên đồng hồ Việt Nam của ngày `day` (YYYY-MM-DD). */
export function vietnamHourToMs(day: string, hour: number): number {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d) - VN_OFFSET_MS + Math.round(hour * HOUR_MS);
}

/** Hai đợt của một ngày, theo thứ tự sáng rồi chiều; cùng đầu khung `windowStartHour`, cuối khung là giờ đợt. */
export function slotsOfDay(day: string, hours: SlotHours = config.total): TotalSlot[] {
    const fromMs = vietnamHourToMs(day, hours.windowStartHour);
    return [
        { name: "morning", day, fromMs, atMs: vietnamHourToMs(day, hours.morningHour) },
        { name: "afternoon", day, fromMs, atMs: vietnamHourToMs(day, hours.afternoonHour) },
    ];
}

/** Tin gửi trong khung của đợt: `fromMs <= ts < atMs` (nửa mở, nên tin đúng 9:00:00 thuộc đợt chiều). */
export function inSlotWindow(ts: number, slot: Pick<TotalSlot, "fromMs" | "atMs">): boolean {
    return ts >= slot.fromMs && ts < slot.atMs;
}

/** Khoá của một đợt trong `data/.total-slots.json`, vd `2026-10-03|morning`. */
export function slotKey(slot: Pick<TotalSlot, "day" | "name">): string {
    return `${slot.day}|${slot.name}`;
}

/** Tên file báo cáo tổng: như `freeFormFileName` (giờ xuất thực tế) nhưng thêm `-auto` trước `.xlsx`. */
export function autoFileName(title: string, day: string, hhmm: string): string {
    return freeFormFileName(title, day, hhmm).replace(/\.xlsx$/, "-auto.xlsx");
}

export function isSlotName(value: string | undefined): value is SlotName {
    return value === "morning" || value === "afternoon";
}
