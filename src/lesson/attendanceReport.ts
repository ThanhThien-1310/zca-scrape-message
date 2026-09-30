import { fold, splitLabel } from "./parseReport.js";

export interface AttendanceRoomResult {
    tenNV: string;
    noiLamViec: string;
    gioDen: { hour: number; minute: number };
}

export function classifyAttendanceTitle(content: string): boolean {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return fold(lines[0] ?? "") === "bao cao diem danh";
}

/** "8h25", "8:25", "8g25", "8h25'" -> { hour: 8, minute: 25 }; "8h" (không có phút) -> phút = 0. Chấp nhận
 * ":", "h", "g" làm dấu phân cách (cách viết giờ tự do thường gặp trong chat), dấu nháy đơn cuối bị bỏ qua.
 * null nếu không đúng khuôn hoặc giờ/phút ngoài phạm vi hợp lệ — im lặng bỏ 1 tin là chấp nhận được, nhưng
 * không được bỏ những cách viết phổ biến thật (xem test). */
function parseHm(value: string): { hour: number; minute: number } | null {
    const m = /^(\d{1,2})[:hg](\d{1,2})?'?$/i.exec(value.trim());
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = m[2] === undefined ? 0 : Number(m[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
}

export function parseAttendanceMessage(content: string): AttendanceRoomResult | null {
    const lines = content.normalize("NFC").split(/\r?\n/);
    let tenNV = "";
    let noiLamViec = "";
    let gioDen: { hour: number; minute: number } | null = null;
    for (const line of lines) {
        const parsed = splitLabel(line);
        if (!parsed) continue;
        if (parsed.label === "ten nv it thuc tap") tenNV = parsed.value;
        else if (parsed.label === "thoi gian den noi") gioDen = parseHm(parsed.value);
        else if (parsed.label === "noi lam viec") noiLamViec = parsed.value;
    }
    if (!tenNV || !noiLamViec || !gioDen) return null;
    return { tenNV, noiLamViec, gioDen };
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
