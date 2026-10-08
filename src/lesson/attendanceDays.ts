import { attendanceSessionOf, isLateAttendance, isRecordedAttendance } from "./attendanceReport.js";
import { vietnamDay, vietnamHourMinute } from "./time.js";
import type { AttendanceEntry } from "../types/index.js";

export interface AttendanceDayRecord {
    tenNV: string;
    day: string;
    noiLamViec: string;
    morning: { hour: number; minute: number } | null;
    afternoon: { hour: number; minute: number } | null;
}

/** Gộp tin thô theo (người, ngày), tách sáng/chiều theo giờ Zalo GHI NHẬN tin gửi tới (`thoiGian`) — KHÔNG
 * theo giá trị tự khai trong tin (đã xác nhận với người dùng: tự khai có thể sai/lệch với giờ gửi thật, xem
 * attendanceReport.ts). Nếu cùng 1 khung trong ngày có nhiều tin (báo lại), chỉ giữ tin gửi MUỘN NHẤT. */
export function groupAttendanceByDay(entries: AttendanceEntry[]): AttendanceDayRecord[] {
    const byKey = new Map<string, AttendanceDayRecord & { morningTs: number; afternoonTs: number }>();
    for (const en of entries) {
        const day = vietnamDay(en.thoiGian);
        const { hour, minute } = vietnamHourMinute(en.thoiGian);
        if (!isRecordedAttendance(hour, minute)) continue; // quá 17h30: không ghi nhận, cũng không đè tin đã ghi nhận trước đó
        const session = attendanceSessionOf(hour);
        const key = `${en.tenNV}|${day}`;
        let rec = byKey.get(key);
        if (!rec) {
            rec = { tenNV: en.tenNV, day, noiLamViec: en.noiLamViec, morning: null, afternoon: null, morningTs: -Infinity, afternoonTs: -Infinity };
            byKey.set(key, rec);
        }
        if (session === "morning" && en.thoiGian >= rec.morningTs) {
            rec.morning = { hour, minute };
            rec.morningTs = en.thoiGian;
            rec.noiLamViec = en.noiLamViec;
        } else if (session === "afternoon" && en.thoiGian >= rec.afternoonTs) {
            rec.afternoon = { hour, minute };
            rec.afternoonTs = en.thoiGian;
            rec.noiLamViec = en.noiLamViec;
        }
    }
    return [...byKey.values()].map(({ tenNV, day, noiLamViec, morning, afternoon }) => ({ tenNV, day, noiLamViec, morning, afternoon }));
}

export function isDayViolated(r: AttendanceDayRecord): boolean {
    return (r.morning !== null && isLateAttendance("morning", r.morning.hour, r.morning.minute)) || (r.afternoon !== null && isLateAttendance("afternoon", r.afternoon.hour, r.afternoon.minute));
}
