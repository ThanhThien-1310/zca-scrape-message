import { buildBoSungRows, buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows } from "./statusRows.js";
import type { Report } from "../types/index.js";

export interface FileLayout {
    templateFile: string;
    sheet: string;
    /** Dòng dữ liệu đầu tiên trong file mẫu (còn trống, đã định dạng). */
    firstDataRow: number;
    /** Dòng chứa chữ "TỔNG" trong file mẫu GỐC, trước khi chèn/xoá dòng nào. */
    totalRowBefore: number;
    /** Chữ cột cuối cùng có dùng trong bảng (kể cả cột luôn để trống) — quyết định bề rộng mảng ghi hàng loạt. */
    lastColumn: string;
}

export const FILE_LAYOUT = {
    boSung: { templateFile: "BO SUNG MAY TINH.xlsx", sheet: "BO SUNG", firstDataRow: 5, totalRowBefore: 8, lastColumn: "Q" },
    loa: { templateFile: "TINH TRANG LOA.xlsx", sheet: "1209", firstDataRow: 4, totalRowBefore: 7, lastColumn: "H" },
    internet: { templateFile: "TINH TRANG LOI INTERNET.xlsx", sheet: "INTERNET", firstDataRow: 4, totalRowBefore: 7, lastColumn: "J" },
    netsupport: { templateFile: "TINH TRANG LOI NETSUPPORT.xlsx", sheet: "NETSUPPORT", firstDataRow: 4, totalRowBefore: 7, lastColumn: "J" },
    mayTinh: { templateFile: "TINH TRANG LOI MAY TINH.xlsx", sheet: "2409", firstDataRow: 4, totalRowBefore: 7, lastColumn: "N" },
} as const satisfies Record<string, FileLayout>;

/** 5 file chưa có nguồn dữ liệu: chỉ chép nguyên trạng, không mở qua Excel COM (xem CLI, task 4). */
export const OTHER_TEMPLATE_FILES: string[] = ["THAY THE MAY TINH.xlsx", "TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx", "TINH TRANG VE SINH PHONG MAY.xlsx", "VI PHAM NOI QUY THUC TAP.xlsx"];

export interface HeaderCell {
    ref: string;
    value: string | number;
    numberFormat?: string;
}

export interface FileFillSpec extends FileLayout {
    rows: Array<Record<string, string | number | null>>;
    headerCells: HeaderCell[];
}

const WEEKDAY_EXCEL_TYPE1 = (jsDay: number): number => jsDay + 1; // JS getUTCDay(): 0=CN..6=Thứ 7; Excel WEEKDAY(d,1): 1=CN..7=Thứ 7.
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Thay cho các công thức `="Thứ: "&WEEKDAY(TODAY(),1)`, `="Ngày: "&TEXT(TODAY(),"dd/mm/yyyy")`,
 * `="Thời gian: "&TEXT(NOW(),"hh:mm")` trong file mẫu — giữ ĐÚNG định dạng chữ chúng in ra (kể cả số thứ,
 * không phải tên thứ), chỉ đóng băng thành giá trị của ngày báo cáo thay vì tính lại mỗi khi mở file.
 */
export function headerDateTexts(day: string, generatedAt: number): { thu: string; ngay: string; gio: string } {
    const [y, m, d] = day.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const gd = new Date(generatedAt + 7 * 3_600_000); // giờ Việt Nam
    return {
        thu: `Thứ: ${WEEKDAY_EXCEL_TYPE1(weekday)}`,
        ngay: `Ngày: ${pad(d)}/${pad(m)}/${y}`,
        gio: `Thời gian: ${pad(gd.getUTCHours())}:${pad(gd.getUTCMinutes())}`,
    };
}

/** Excel date serial (số ngày từ 1899-12-30) của ngày `day` (YYYY-MM-DD), cho ô đang là `=TODAY()`. */
export function excelDateSerialForDay(day: string): number {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000 + 25569;
}

export function buildFillSpecs(reports: Report[], perMessage: Map<string, number>, day: string, generatedAt: number = Date.now()): Record<keyof typeof FILE_LAYOUT, FileFillSpec> {
    const { thu, ngay, gio } = headerDateTexts(day, generatedAt);
    const dateSerial = excelDateSerialForDay(day);
    return {
        boSung: { ...FILE_LAYOUT.boSung, rows: buildBoSungRows(reports), headerCells: [{ ref: "Q2", value: dateSerial, numberFormat: "dd/mm/yyyy" }] },
        loa: { ...FILE_LAYOUT.loa, rows: buildLoaRows(reports), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "H2", value: gio }] },
        internet: { ...FILE_LAYOUT.internet, rows: buildInternetRows(reports, perMessage), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "I2", value: gio }] },
        netsupport: { ...FILE_LAYOUT.netsupport, rows: buildNetSupportRows(reports, perMessage), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "I2", value: gio }] },
        mayTinh: { ...FILE_LAYOUT.mayTinh, rows: buildMayTinhRows(reports), headerCells: [{ ref: "J2", value: thu }, { ref: "K2", value: ngay }, { ref: "M2", value: gio }] },
    };
}
