import { ATTENDANCE_LAYOUT } from "../lesson/attendanceRows.js";
import { CLEANING_LAYOUT } from "../lesson/cleaningRows.js";
import { FILE_LAYOUT, type FileLayout } from "../lesson/statusReportLayout.js";
import { LEAVE_LAYOUT } from "../leave/layout.js";
import { INTERNET_SPEED_LAYOUT } from "../lesson/internetSpeedRows.js";
import { MINUTES_LAYOUT } from "../lesson/minutesRows.js";
import { MAINTENANCE_LAYOUT } from "../lesson/maintenanceRows.js";

/**
 * Mã nội bộ của từng báo cáo. Mã là DANH TÍNH ỔN ĐỊNH: tên file mẫu và tiêu đề đọc từ ô A1 của mẫu có thể đổi (LOA đã đổi thành
 * ÂM THANH) mà mã `loa` giữ nguyên, nên `config.reportSets[].reports` ghi mã, không ghi tên file hay tiêu đề.
 * THỨ TỰ Ở ĐÂY LÀ THỨ TỰ XUẤT FILE VÀ IN (NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH, NỘI QUY, NGHỈ PHÉP).
 */
export const REPORT_KEYS = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance", "leave", "maintenance", "internetSpeed", "minutes"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** `phase`: dựng theo từng giai đoạn trong ngày (4 giai đoạn). `day`: một file mỗi ngày, quét lại cả ngày. */
export type ReportKind = "phase" | "day";

export interface ReportDef {
    key: ReportKey;
    kind: ReportKind;
    /** Tên hiển thị gọn, chỉ để in trong `reports:list` và thông báo lỗi. */
    label: string;
    /** Tiêu đề dòng đầu của tin nguồn (mô tả; việc nhận diện thật nằm ở `src/lesson/*Report.ts`). */
    source: string;
    layout: FileLayout;
}

const PHASE_SOURCE = "BÁO CÁO ĐẦU/CUỐI BUỔI DẠY";

export const REPORT_DEFS: Record<ReportKey, ReportDef> = {
    netsupport: { key: "netsupport", kind: "phase", label: "TÌNH TRẠNG NETSUPPORT", source: PHASE_SOURCE, layout: FILE_LAYOUT.netsupport },
    loa: { key: "loa", kind: "phase", label: "TÌNH TRẠNG ÂM THANH", source: PHASE_SOURCE, layout: FILE_LAYOUT.loa },
    internet: { key: "internet", kind: "phase", label: "TÌNH TRẠNG INTERNET", source: PHASE_SOURCE, layout: FILE_LAYOUT.internet },
    mayTinh: { key: "mayTinh", kind: "phase", label: "TÌNH TRẠNG MÁY TÍNH", source: PHASE_SOURCE, layout: FILE_LAYOUT.mayTinh },
    dien: { key: "dien", kind: "day", label: "TÌNH TRẠNG ĐIỆN", source: "LỖI ĐIỆN", layout: FILE_LAYOUT.dien },
    cleaning: { key: "cleaning", kind: "day", label: "VỆ SINH PHÒNG MÁY", source: "BÁO CÁO CUỐI BUỔI", layout: CLEANING_LAYOUT },
    attendance: { key: "attendance", kind: "day", label: "NỘI QUY THỰC TẬP", source: "BÁO CÁO ĐIỂM DANH", layout: ATTENDANCE_LAYOUT },
    leave: { key: "leave", kind: "day", label: "LỊCH NGHỈ PHÉP KỸ THUẬT", source: "ẢNH NGHỈ PHÉP (không có tiêu đề)", layout: LEAVE_LAYOUT },
    maintenance: { key: "maintenance", kind: "day", label: "THỜI GIAN CHƯA BẢO TRÌ PM", source: "BÁO CÁO CUỐI BUỔI", layout: MAINTENANCE_LAYOUT },
    internetSpeed: { key: "internetSpeed", kind: "day", label: "TRẠNG THÁI KẾT NỐI INTERNET", source: "BÁO CÁO CUỐI BUỔI + ẢNH ĐO TỐC ĐỘ", layout: INTERNET_SPEED_LAYOUT },
    minutes: { key: "minutes", kind: "day", label: "QUẢN LÝ BIÊN BẢN", source: "BÁO CÁO CUỐI BUỔI + ẢNH BIÊN BẢN", layout: MINUTES_LAYOUT },
};

export const PHASE_REPORT_KEYS: ReportKey[] = REPORT_KEYS.filter((k) => REPORT_DEFS[k].kind === "phase");
export const DAY_REPORT_KEYS: ReportKey[] = REPORT_KEYS.filter((k) => REPORT_DEFS[k].kind === "day");

export function isReportKey(v: unknown): v is ReportKey {
    return typeof v === "string" && (REPORT_KEYS as readonly string[]).includes(v);
}
