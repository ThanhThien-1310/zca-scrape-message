import { isLateAttendance } from "./attendanceReport.js";
import { isDayViolated, type AttendanceDayRecord } from "./attendanceStreaks.js";
import { WEEKDAY_EXCEL_TYPE1, type FileLayout } from "./statusReportLayout.js";
import type { Cell } from "../types/index.js";

export const ATTENDANCE_LAYOUT: FileLayout = { templateFile: "VI PHAM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 5, lastColumn: "L" };

const pad2 = (n: number): string => String(n).padStart(2, "0");
const fmtHm = (t: { hour: number; minute: number }): string => `${t.hour}:${pad2(t.minute)}`;
const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
};

/** Chỉ tạo dòng cho NGƯỜI VI PHẠM trong đúng ngày `day` — ngày hoàn toàn đúng giờ không ra dòng nào (xem
 * spec). Cột SÁNG/CHIỀU chỉ điền giờ tự báo khi ĐÚNG KHUNG ĐÓ bị trễ; không dùng để hiển thị giờ đến đúng giờ.
 * Cột I/J/K/L (NỘI DUNG/GIẢI TRÌNH/CAM KẾT/GHI CHÚ) cố tình không có trong object trả về — để trống. */
export function buildAttendanceRows(records: AttendanceDayRecord[], counts: Map<string, number>, day: string): Array<Record<string, Cell>> {
    const [y, m, d] = day.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const thu = `Thứ ${WEEKDAY_EXCEL_TYPE1(weekday)}`;

    return records
        .filter((r) => r.day === day && isDayViolated(r))
        .sort((a, b) => a.tenNV.localeCompare(b.tenNV))
        .map((r) => ({
            A: thu,
            B: fmtDate(day),
            C: r.tenNV,
            D: "TTS",
            E: r.noiLamViec,
            F: r.morning && isLateAttendance("morning", r.morning.hour, r.morning.minute) ? fmtHm(r.morning) : "",
            G: r.afternoon && isLateAttendance("afternoon", r.afternoon.hour, r.afternoon.minute) ? fmtHm(r.afternoon) : "",
            H: counts.get(`${r.tenNV}|${day}`) ?? 0,
        }));
}
