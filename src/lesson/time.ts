import { config } from "../../config.js";
import type { Buoi, SessionHours } from "../types/index.js";

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
