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

/** Trễ = đến sau ĐÚNG 8h00 (sáng) hoặc 14h00 (chiều) — không phải 8h05/14h05 (đã xác nhận với người dùng, xem
 * design doc). Đúng 8h00/14h00 không tính trễ. */
export function isLateAttendance(session: AttendanceSession, hour: number, minute: number): boolean {
    const cutoffHour = session === "morning" ? 8 : 14;
    return hour > cutoffHour || (hour === cutoffHour && minute > 0);
}
