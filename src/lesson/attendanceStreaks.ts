import { attendanceSessionOf, isLateAttendance } from "./attendanceReport.js";
import { vietnamDay } from "./time.js";
import type { AttendanceEntry } from "../types/index.js";

export interface AttendanceDayRecord {
    tenNV: string;
    day: string;
    noiLamViec: string;
    morning: { hour: number; minute: number } | null;
    afternoon: { hour: number; minute: number } | null;
}

/** Gộp tin thô theo (người, ngày), tách sáng/chiều theo giờ TỰ BÁO (không theo giờ gửi tin) — xem design doc.
 * Nếu cùng 1 khung trong ngày có nhiều tin (báo lại), chỉ giữ tin có `thoiGian` (giờ gửi) lớn nhất. */
export function groupAttendanceByDay(entries: AttendanceEntry[]): AttendanceDayRecord[] {
    const byKey = new Map<string, AttendanceDayRecord & { morningTs: number; afternoonTs: number }>();
    for (const en of entries) {
        const day = vietnamDay(en.thoiGian);
        const session = attendanceSessionOf(en.gioDenGio);
        const key = `${en.tenNV}|${day}`;
        let rec = byKey.get(key);
        if (!rec) {
            rec = { tenNV: en.tenNV, day, noiLamViec: en.noiLamViec, morning: null, afternoon: null, morningTs: -Infinity, afternoonTs: -Infinity };
            byKey.set(key, rec);
        }
        if (session === "morning" && en.thoiGian >= rec.morningTs) {
            rec.morning = { hour: en.gioDenGio, minute: en.gioDenPhut };
            rec.morningTs = en.thoiGian;
            rec.noiLamViec = en.noiLamViec;
        } else if (session === "afternoon" && en.thoiGian >= rec.afternoonTs) {
            rec.afternoon = { hour: en.gioDenGio, minute: en.gioDenPhut };
            rec.afternoonTs = en.thoiGian;
            rec.noiLamViec = en.noiLamViec;
        }
    }
    return [...byKey.values()].map(({ tenNV, day, noiLamViec, morning, afternoon }) => ({ tenNV, day, noiLamViec, morning, afternoon }));
}

export function isDayViolated(r: AttendanceDayRecord): boolean {
    return (r.morning !== null && isLateAttendance("morning", r.morning.hour, r.morning.minute)) || (r.afternoon !== null && isLateAttendance("afternoon", r.afternoon.hour, r.afternoon.minute));
}

/**
 * Tính lại SỐ LẦN (VI PHẠM) từ TOÀN BỘ lịch sử mỗi lần gọi — không lưu state tích luỹ, nên tin đến không đúng
 * thứ tự thời gian thật (khôi phục sau gián đoạn) không bao giờ tính sai (đúng nguyên tắc đã thống nhất khi
 * bàn về SỐ LẦN của BO SUNG/internet/netsupport). Với mỗi người: NGÀY VI PHẠM nối tiếp +1 từ ngày trước đó
 * (chỉ tính trên các ngày CÓ tin điểm danh — một ngày hoàn toàn không có tin bị bỏ qua, KHÔNG coi là reset);
 * NGÀY ĐÚNG GIỜ đưa về 0.
 */
export function computeAttendanceCounts(records: AttendanceDayRecord[]): Map<string, number> {
    const byPerson = new Map<string, AttendanceDayRecord[]>();
    for (const r of records) {
        const list = byPerson.get(r.tenNV) ?? [];
        list.push(r);
        byPerson.set(r.tenNV, list);
    }
    const counts = new Map<string, number>();
    for (const [tenNV, list] of byPerson) {
        const sorted = [...list].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
        let count = 0;
        for (const r of sorted) {
            count = isDayViolated(r) ? count + 1 : 0;
            counts.set(`${tenNV}|${r.day}`, count);
        }
    }
    return counts;
}
