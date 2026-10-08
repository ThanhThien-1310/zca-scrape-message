import { isLateAttendance } from "./attendanceReport.js";
import { isDayViolated, type AttendanceDayRecord } from "./attendanceDays.js";
import { headerDateTexts, WEEKDAY_EXCEL_TYPE1, type FileLayout, type HeaderCell } from "./statusReportLayout.js";
import type { Cell } from "../types/index.js";

/**
 * Sheet HANG NGAY của mẫu NỘI QUY THỰC TẬP mới: A THỨ, B NGÀY, C HỌ TÊN, D CHỨC VỤ, E VỊ TRÍ, F SÁNG, G CHIỀU, H NỘI DUNG, I GHI CHÚ.
 * Không còn cột SỐ LẦN, GIẢI TRÌNH, CAM KẾT như mẫu cũ. H và I để trống.
 */
export const ATTENDANCE_LAYOUT: FileLayout = { templateFile: "05 - FORM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 7, lastColumn: "I" };

/**
 * Hai ô của dòng 2 trong mẫu: H2 = "Ngày: <TODAY()>" và I2 = "Thời gian: <NOW()>". Mẫu cũ có một ô "Ngày báo cáo" ở I2 nên trước đây ta ghi
 * SỐ NGÀY vào I2; mẫu mới I2 là ô giờ, ghi số ngày vào đó làm ô "Thời gian" hiện ra ngày tháng năm.
 */
export const ATTENDANCE_HEADER_REFS = { ngay: "H2", gio: "I2" } as const;

/** Ghi đè hai ô trên bằng CHỮ: "Ngày: dd/mm/yyyy" của ngày báo cáo `day` và "Thời gian: hh:mm" là giờ chạy `generatedAt` (giờ Việt Nam). */
export function attendanceHeaderCells(day: string, generatedAt: number): HeaderCell[] {
    const { ngay, gio } = headerDateTexts(day, generatedAt);
    return [{ ref: ATTENDANCE_HEADER_REFS.ngay, value: ngay }, { ref: ATTENDANCE_HEADER_REFS.gio, value: gio }];
}

const pad2 = (n: number): string => String(n).padStart(2, "0");
const fmtHm = (t: { hour: number; minute: number }): string => `${t.hour}:${pad2(t.minute)}`;
/** NGÀY ghi dạng CHỮ dd/mm/yyyy, có dấu nháy đơn đứng đầu: nếu không, Excel (qua COM, theo định dạng Mỹ) tự hiểu "01/10/2026"
 * thành ngày 10/01/2026 (ngày ≤ 12 bị đảo ngày/tháng); dấu nháy ép ô thành chữ và không hiện ra trong ô. */
const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `'${d}/${m}/${y}`;
};

/** Chỉ tạo dòng cho NGƯỜI VI PHẠM trong đúng ngày `day` — ngày hoàn toàn đúng giờ không ra dòng nào (xem
 * spec). Cột SÁNG/CHIỀU chỉ điền giờ tự báo khi ĐÚNG KHUNG ĐÓ bị trễ; không dùng để hiển thị giờ đến đúng giờ.
 * Cột H/I (NỘI DUNG/GHI CHÚ) cố tình không có trong object trả về — để trống. */
export function buildAttendanceRows(records: AttendanceDayRecord[], day: string): Array<Record<string, Cell>> {
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
        }));
}
