import { fold, splitLabel } from "./parseReport.js";

export interface AttendanceRoomResult {
    tenNV: string;
    noiLamViec: string;
}

export function classifyAttendanceTitle(content: string): boolean {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return fold(lines[0] ?? "") === "bao cao diem danh";
}

/**
 * Giờ để tính trễ và giờ hiển thị ở cột SÁNG/CHIỀU lấy từ giờ Zalo GHI NHẬN tin gửi tới (msg.ts, xem
 * attendanceStreaks.ts), KHÔNG đọc giá trị tự khai trong dòng "Thời gian đến nơi" — tin thật (vd tự khai
 * "14h00" nhưng gửi lúc 14:30) cho thấy giá trị tự khai không đáng tin bằng giờ gửi thật (đã xác nhận với
 * người dùng). Dòng "Thời gian đến nơi" vẫn phải CÓ MẶT và không rỗng để coi là 1 tin điểm danh hợp lệ — chỉ
 * không đọc/parse giá trị của nó thành giờ nữa.
 */
export function parseAttendanceMessage(content: string): AttendanceRoomResult | null {
    const lines = content.normalize("NFC").split(/\r?\n/);
    let tenNV = "";
    let noiLamViec = "";
    let hasArrivalField = false;
    for (const line of lines) {
        const parsed = splitLabel(line);
        if (!parsed) continue;
        if (parsed.label === "ten nv it thuc tap") tenNV = parsed.value;
        else if (parsed.label === "thoi gian den noi") hasArrivalField = parsed.value.trim() !== "";
        else if (parsed.label === "noi lam viec") noiLamViec = parsed.value;
    }
    if (!tenNV || !noiLamViec || !hasArrivalField) return null;
    return { tenNV, noiLamViec };
}

export type AttendanceSession = "morning" | "afternoon";

export function attendanceSessionOf(hour: number): AttendanceSession {
    return hour < 12 ? "morning" : "afternoon";
}

/** Mốc tính trễ: QUA 8h05 (sáng) hoặc QUA 14h05 (chiều); đúng 8h05/14h05 chưa tính trễ (người dùng đổi từ 8h00/14h00 lên thêm 5 phút
 * ngày 2026-10-03). Giờ là giờ Zalo GHI NHẬN tin gửi tới, xem comment của `parseAttendanceMessage`. */
const LATE_AFTER: Record<AttendanceSession, { hour: number; minute: number }> = { morning: { hour: 8, minute: 5 }, afternoon: { hour: 14, minute: 5 } };

/** Tin điểm danh gửi quá 17h30 không còn được ghi nhận (đúng 17h30 vẫn ghi nhận). Buổi sáng tính tới trước 12h (xem `attendanceSessionOf`). */
const RECORD_UNTIL = { hour: 17, minute: 30 };

export function isRecordedAttendance(hour: number, minute: number): boolean {
    return hour < RECORD_UNTIL.hour || (hour === RECORD_UNTIL.hour && minute <= RECORD_UNTIL.minute);
}

/** Trễ = QUA mốc của khung: sáng sau 8h05 (tới hết buổi sáng), chiều sau 14h05 và không quá 17h30 (sau 17h30 không ghi nhận). */
export function isLateAttendance(session: AttendanceSession, hour: number, minute: number): boolean {
    if (!isRecordedAttendance(hour, minute)) return false;
    const cutoff = LATE_AFTER[session];
    return hour > cutoff.hour || (hour === cutoff.hour && minute > cutoff.minute);
}
