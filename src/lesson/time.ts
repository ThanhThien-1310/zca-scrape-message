import { config } from "../../config.js";
import type { Buoi, LoaiBaoCao, Phase, PhaseHours, SessionHours } from "../types/index.js";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` of an epoch-ms instant on the Vietnam wall clock. */
export function vietnamDay(ts: number): string {
    const d = new Date(ts + VN_OFFSET_MS);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function todayVietnam(now: number = Date.now()): string {
    return vietnamDay(now);
}

/** Giờ:phút trên đồng hồ Việt Nam của một mốc epoch-ms. */
export function vietnamHourMinute(ts: number): { hour: number; minute: number } {
    const d = new Date(ts + VN_OFFSET_MS);
    return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** `HHmm` trên đồng hồ Việt Nam (vd "1042"), dùng đóng dấu giờ chạy thực tế vào tên file xuất. */
export function hhmmVietnam(ts: number): string {
    const { hour, minute } = vietnamHourMinute(ts);
    return `${pad(hour)}${pad(minute)}`;
}

/** Excel date serial (whole days since 1899-12-30) of the Vietnam calendar day. */
export function excelDateSerial(ts: number): number {
    const d = new Date(ts + VN_OFFSET_MS);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS + 25569;
}

/** Fraction of a day (0 <= x < 1) of the Vietnam wall-clock time. */
export function excelTimeFraction(ts: number): number {
    const d = new Date(ts + VN_OFFSET_MS);
    return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
}

/**
 * Session of the Vietnam day. With the defaults (config.ts, mục 8): sáng 00:00-11:59, chiều 12:00-17:59, tối 18:00-23:59.
 * `hours` defaults to `config.sessions`; tests pass fixed hours.
 */
export function sessionOf(ts: number, hours: SessionHours = config.sessions): Buoi {
    const hour = new Date(ts + VN_OFFSET_MS).getUTCHours();
    return hour < hours.chieuFromHour ? "sang" : hour < hours.toiFromHour ? "chieu" : "toi";
}

export function currentSession(now: number = Date.now(), hours: SessionHours = config.sessions): Buoi {
    return sessionOf(now, hours);
}

export function isBuoi(value: string | undefined): value is Buoi {
    return value === "sang" || value === "chieu" || value === "toi";
}

/** `baocaobuoisang_250926.xlsm`: the session and the ddMMyy of the Vietnam day (`YYYY-MM-DD`). */
export function reportFileName(day: string, buoi: Buoi): string {
    const [y, m, d] = day.split("-");
    return `baocaobuoi${buoi}_${d}${m}${y.slice(2)}.xlsm`;
}

/** `YYYY-MM-DD` cộng/trừ `n` ngày lịch (không phụ thuộc múi giờ — thao tác thuần trên ngày/tháng/năm). */
export function addDays(day: string, n: number): string {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function hourOfDayVN(ts: number): number {
    const d = new Date(ts + VN_OFFSET_MS);
    return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/**
 * Giai đoạn THÔ của một mốc thời gian, chỉ theo giờ đồng hồ (giờ Việt Nam), không xét loại báo cáo.
 * Mặc định 4 mốc: 9:00, 12:30, 15:00, 17:30 (config.phases). `morningstart` bao trùm cả sáng sớm (giờ < mốc đầu)
 * lẫn đêm khuya (giờ >= mốc cuối, khi đó thuộc "đầu buổi sáng NGÀY MAI" — xem `phaseDay`).
 */
export function phaseOf(ts: number, hours: PhaseHours = config.phases): Phase {
    const h = hourOfDayVN(ts);
    if (h < hours.morningEndFromHour) return "morningstart";
    if (h < hours.afternoonStartFromHour) return "morningend";
    if (h < hours.afternoonEndFromHour) return "afternoonstart";
    if (h < hours.morningStartFromHour) return "afternoonend";
    return "morningstart";
}

/** Ngày ứng với giai đoạn THÔ (`phaseOf`) của một mốc thời gian — cộng 1 ngày khi rơi vào phần "đêm khuya" của `morningstart`. */
export function phaseDay(ts: number, hours: PhaseHours = config.phases): string {
    const day = vietnamDay(ts);
    return hourOfDayVN(ts) >= hours.morningStartFromHour ? addDays(day, 1) : day;
}

/**
 * Phân loại một tin nhắn vào đúng (giai đoạn, ngày) theo `loaiBaoCao` VÀ giờ gửi — xem
 * "Quy tắc phân loại" trong spec. Báo cáo CUỐI BUỔI luôn nhận nguyên giai đoạn/ngày thô (kể cả khi đó là
 * một khung "đầu buổi"). Báo cáo ĐẦU BUỔI lỡ hẹn (giai đoạn thô ra "cuối buổi") bị đẩy sang khung đầu-buổi
 * KẾ TIẾP: lỡ đầu-sáng (giai đoạn thô `morningend`) -> `afternoonstart` cùng ngày; lỡ đầu-chiều (giai đoạn
 * thô `afternoonend`) -> `morningstart` NGÀY MAI (ngày phải cộng thêm 1 thủ công vì giờ gửi thật luôn < mốc
 * wrap nên `phaseDay` không tự cộng được).
 */
export function classifyPhase(ts: number, loaiBaoCao: LoaiBaoCao, hours: PhaseHours = config.phases): { phase: Phase; day: string } {
    const raw = phaseOf(ts, hours);
    const day = phaseDay(ts, hours);
    if (loaiBaoCao !== "DauBuoi") return { phase: raw, day };
    if (raw === "morningend") return { phase: "afternoonstart", day };
    if (raw === "afternoonend") return { phase: "morningstart", day: addDays(day, 1) };
    return { phase: raw, day };
}

export function isPhase(value: string | undefined): value is Phase {
    return value === "morningstart" || value === "morningend" || value === "afternoonstart" || value === "afternoonend";
}

/** `baocaobuoimorningstart_290926.xlsm`: bản Phase mới của `reportFileName` — buoi là 1 trong 4 giai đoạn. */
export function reportFileNameV2(day: string, buoi: Phase): string {
    const [y, m, d] = day.split("-");
    return `baocaobuoi${buoi}_${d}${m}${y.slice(2)}.xlsm`;
}
