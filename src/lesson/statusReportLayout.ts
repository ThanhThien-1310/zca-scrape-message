import XLSX from "xlsx";
import { buildBoSungRows, buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows } from "./statusRows.js";
import type { Phase, Report } from "../types/index.js";

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
    boSung: { templateFile: "BO SUNG MAY TINH.xlsx", sheet: "BO SUNG", firstDataRow: 5, totalRowBefore: 6, lastColumn: "Q" },
    loa: { templateFile: "TINH TRANG LOA.xlsx", sheet: "1209", firstDataRow: 4, totalRowBefore: 7, lastColumn: "H" },
    internet: { templateFile: "TINH TRANG LOI INTERNET.xlsx", sheet: "INTERNET", firstDataRow: 4, totalRowBefore: 7, lastColumn: "J" },
    // Tên file trên đĩa hiện là "NETUPPORT" (thiếu chữ S) — người dùng đổi tên, có thể là gõ nhầm. Sheet bên trong vẫn
    // tên "NETSUPPORT" như cũ. Nếu người dùng đổi tên file lại cho đúng chính tả, sửa templateFile này theo.
    netsupport: { templateFile: "TINH TRANG LOI NETUPPORT.xlsx", sheet: "NETSUPPORT", firstDataRow: 4, totalRowBefore: 7, lastColumn: "J" },
    mayTinh: { templateFile: "TINH TRANG LOI MAY TINH.xlsx", sheet: "2409", firstDataRow: 4, totalRowBefore: 7, lastColumn: "N" },
} as const satisfies Record<string, FileLayout>;

/** 3 file chưa có nguồn dữ liệu: chỉ chép nguyên trạng, không mở qua Excel COM (xem CLI, task 4). VỆ SINH và
 * VI PHẠM có script riêng (fill-cleaning-report.ts / fill-attendance-report.ts — xem
 * docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md), không còn ở đây. */
export const OTHER_TEMPLATE_FILES: string[] = ["THAY THE MAY TINH.xlsx", "TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx"];

export interface HeaderCell {
    ref: string;
    value: string | number;
    numberFormat?: string;
}

export interface FormulaCell {
    ref: string;
    formula: string;
}

export interface FileFillSpec extends FileLayout {
    rows: Array<Record<string, string | number | null>>;
    headerCells: HeaderCell[];
    formulaCells?: FormulaCell[];
}

/**
 * BO SUNG MAY TINH là file DUY NHẤT có công thức trong dòng TỔNG (COUNTA/SUM) và khối "CHÚ GIẢI VÀ THỐNG KÊ"
 * (COUNTIF theo XẾP LOẠI) — các file khác dòng TỔNG chỉ là chữ, không có công thức. Excel KHÔNG tự mở rộng
 * một tham chiếu 1 dòng (ví dụ `C5:C5`) khi chèn dòng kề bên nó, và xoá hết dòng dữ liệu duy nhất mà công thức
 * đang trỏ tới sẽ biến tham chiếu đó thành `#REF!` vĩnh viễn trong file lưu ra — cả hai đều xảy ra thật khi số
 * dòng dữ liệu thay đổi (đã tái hiện: file mẫu mới chỉ có 1 dòng trống sẵn, need=0 xoá nốt dòng đó -> #REF!).
 * Vì vậy luôn ghi đè lại 7 công thức này theo đúng vùng dữ liệu hiện tại, không dựa vào Excel tự suy ra; và
 * luôn tính vùng dữ liệu tối thiểu là 1 dòng (không bao giờ coi như xoá hết, kể cả khi 0 dòng đủ điều kiện) để
 * luôn có dòng hợp lệ cho C{firstDataRow}, L, M, N tham chiếu tới.
 */
function boSungFormulaCells(firstDataRow: number, rowCount: number): FormulaCell[] {
    const effectiveRows = Math.max(rowCount, 1);
    const lastDataRow = firstDataRow + effectiveRows - 1;
    const totalRow = firstDataRow + effectiveRows;
    const dataRange = (col: string): string => `${col}${firstDataRow}:${col}${lastDataRow}`;
    const gradeRow = (offset: number): number => totalRow + offset;
    return [
        { ref: `C${totalRow}`, formula: `COUNTA(${dataRange("C")})` },
        { ref: `L${totalRow}`, formula: `SUM(${dataRange("L")})` },
        { ref: `M${totalRow}`, formula: `SUM(${dataRange("M")})` },
        ...[4, 5, 6, 7].map((offset) => ({ ref: `G${gradeRow(offset)}`, formula: `COUNTIF(${dataRange("N")},D${gradeRow(offset)})` })),
    ];
}

export const WEEKDAY_EXCEL_TYPE1 = (jsDay: number): number => jsDay + 1; // JS getUTCDay(): 0=CN..6=Thứ 7; Excel WEEKDAY(d,1): 1=CN..7=Thứ 7.
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

export const PHASE_HHMM: Record<Phase, string> = {
    morningstart: "0900",
    morningend: "1230",
    afternoonstart: "1500",
    afternoonend: "1730",
};

/**
 * Đọc dòng 2 của ô A1 (gộp 2 dòng, vd "TIN HỌC ĐẠI DƯƠNG\nTÌNH TRẠNG LOA") trong file mẫu — đây là tiêu đề
 * hiển thị dùng làm tên file xuất, KHÔNG hard-code danh sách tên vì mỗi file mẫu tự có sẵn dòng này.
 */
export function readTemplateTitle(templatePath: string, sheet: string): string {
    const wb = XLSX.readFile(templatePath);
    const ws = wb.Sheets[sheet];
    const cell = ws?.["A1"];
    const raw = typeof cell?.v === "string" ? cell.v : "";
    const lines = raw.split("\n");
    if (lines.length < 2 || !lines[1].trim()) throw new Error(`${templatePath}: không đọc được dòng tiêu đề (dòng 2) ở ô A1 sheet "${sheet}".`);
    return lines[1].trim();
}

/** `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm cố định của giai đoạn>.xlsx` — xem spec "fill:status-reports". */
export function statusFileName(title: string, day: string, buoi: Phase): string {
    const [y, m, d] = day.split("-");
    const yyMMdd = `${y.slice(2)}${m}${d}`;
    const weekday = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
    return `${title}_${yyMMdd}_T${WEEKDAY_EXCEL_TYPE1(weekday)}_${PHASE_HHMM[buoi]}.xlsx`;
}

/** Như `statusFileName`, nhưng cho file KHÔNG có mốc giờ cố định theo giai đoạn — VỆ SINH/VI PHẠM đóng dấu
 * đúng giờ chạy thực tế (`hhmm` truyền vào tự do, dạng "HHmm") thay vì tra `PHASE_HHMM`. */
export function freeFormFileName(title: string, day: string, hhmm: string): string {
    const [y, m, d] = day.split("-");
    const yyMMdd = `${y.slice(2)}${m}${d}`;
    const weekday = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
    return `${title}_${yyMMdd}_T${WEEKDAY_EXCEL_TYPE1(weekday)}_${hhmm}.xlsx`;
}

export function buildFillSpecs(reports: Report[], perMessage: Map<string, number>, day: string, generatedAt: number = Date.now()): Record<keyof typeof FILE_LAYOUT, FileFillSpec> {
    const { thu, ngay, gio } = headerDateTexts(day, generatedAt);
    const dateSerial = excelDateSerialForDay(day);
    const boSungRows = buildBoSungRows(reports);
    return {
        boSung: {
            ...FILE_LAYOUT.boSung,
            rows: boSungRows,
            headerCells: [{ ref: "Q2", value: dateSerial, numberFormat: "dd/mm/yyyy" }],
            formulaCells: boSungFormulaCells(FILE_LAYOUT.boSung.firstDataRow, boSungRows.length),
        },
        loa: { ...FILE_LAYOUT.loa, rows: buildLoaRows(reports), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "H2", value: gio }] },
        internet: { ...FILE_LAYOUT.internet, rows: buildInternetRows(reports, perMessage), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "I2", value: gio }] },
        netsupport: { ...FILE_LAYOUT.netsupport, rows: buildNetSupportRows(reports, perMessage), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "I2", value: gio }] },
        mayTinh: { ...FILE_LAYOUT.mayTinh, rows: buildMayTinhRows(reports), headerCells: [{ ref: "J2", value: thu }, { ref: "K2", value: ngay }, { ref: "M2", value: gio }] },
    };
}
