import XLSX from "xlsx";
import { buildDienRows, buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows } from "./statusRows.js";
import type { ElectricEntry, Report } from "../types/index.js";

/**
 * Khối "CHÚ GIẢI & THỐNG KÊ" của mẫu: bảng nhỏ đếm số dòng theo từng XẾP LOẠI (mỗi loại một dòng: mã loại, ý nghĩa, SỐ LƯỢNG,
 * TỶ LỆ) rồi một dòng TỔNG. Vị trí các dòng được tính theo "cách dòng TỔNG của mẫu gốc bao nhiêu dòng" để dời đúng khi số
 * dòng dữ liệu thay đổi (xem `legendFormulaCells`).
 */
export interface LegendLayout {
    /** Cột XẾP LOẠI trong bảng dữ liệu — nơi COUNTIF đếm. */
    gradeCol: string;
    /** Cột chứa mã loại (T/B/K hoặc A-E) ở khối chú giải. */
    labelCol: string;
    /** Cột SỐ LƯỢNG ở khối chú giải. */
    countCol: string;
    /** Cột TỶ LỆ ở khối chú giải. */
    ratioCol: string;
    /** Số dòng cách dòng TỔNG của mẫu GỐC, theo thứ tự các dòng loại trong mẫu. */
    gradeRowOffsets: number[];
    /** Số dòng cách dòng TỔNG của mẫu GỐC của dòng TỔNG trong khối chú giải. */
    sumRowOffset: number;
}

export interface FileLayout {
    templateFile: string;
    sheet: string;
    /** Dòng dữ liệu đầu tiên trong file mẫu (còn trống, đã định dạng). */
    firstDataRow: number;
    /** Dòng chứa chữ "TỔNG" trong file mẫu GỐC, trước khi chèn/xoá dòng nào. */
    totalRowBefore: number;
    /** Chữ cột cuối cùng có dùng trong bảng (kể cả cột luôn để trống) — quyết định bề rộng mảng ghi hàng loạt. */
    lastColumn: string;
    /** Sheet khác trong file mẫu cần XOÁ khỏi file xuất (vd mẫu INTERNET có thêm sheet NETSUPPORT, mỗi cái xuất một file riêng). */
    deleteSheets?: string[];
    /**
     * true: điền TẠI CHỖ. Script Excel bỏ qua việc chèn/xoá dòng (số dòng của mẫu giữ nguyên) và chỉ ghi các ô trong `headerCells`. Dùng cho
     * LỊCH NGHỈ PHÉP: danh sách tên nằm sẵn trong mẫu, bot chỉ ghi cột BUỔI và NGÀY của vài dòng.
     */
    inPlace?: boolean;
    /** Khối CHÚ GIẢI & THỐNG KÊ (nếu mẫu có). */
    legend?: LegendLayout;
}

/** Ba ô đầu trang "Thứ: N", "Ngày: dd/mm/yyyy", "Thời gian: hh:mm" (mẫu có công thức TODAY()/NOW(); ta ghi đè bằng chữ của ngày báo cáo). */
export interface StatusFileLayout extends FileLayout {
    headerRefs: { thu: string; ngay: string; gio: string };
}

const NET_LEGEND: LegendLayout = { gradeCol: "F", labelCol: "A", countCol: "C", ratioCol: "D", gradeRowOffsets: [4, 5, 6], sumRowOffset: 7 };

/**
 * 5 file tình trạng xuất từ bộ mẫu mới `data/mau bao cao new` (mẫu INTERNET có 2 sheet nên cho ra 2 file). VỆ SINH và NỘI QUY có
 * script riêng (fill-cleaning-report.ts / fill-attendance-report.ts). Giá trị dòng/cột đo trực tiếp trên các mẫu; có test đối chiếu
 * với file thật để phát hiện khi mẫu bị đổi.
 *
 * THỨ TỰ KHOÁ Ở ĐÂY LÀ THỨ TỰ XUẤT FILE VÀ IN (4 giai đoạn lẫn báo cáo tổng): NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN; báo cáo tổng
 * nối tiếp VỆ SINH, NỘI QUY. Muốn đổi thứ tự chỉ cần đổi thứ tự khoá.
 */
export const FILE_LAYOUT = {
    netsupport: {
        templateFile: "03 - FORM TINH TRANG INTERNET.xlsx", sheet: "NETSUPPORT", firstDataRow: 4, totalRowBefore: 10, lastColumn: "G",
        deleteSheets: ["INTERNET"], headerRefs: { thu: "E2", ngay: "F2", gio: "G2" }, legend: NET_LEGEND,
    },
    // "loa" là khoá nội bộ (tin vẫn đọc "Tình trạng Loa, Âm ly"); tên hiển thị và tên file xuất là TÌNH TRẠNG ÂM THANH (lấy từ ô A1 của mẫu).
    loa: {
        templateFile: "01 - FORM TINH TRANG AM THANH.xlsx", sheet: "1209", firstDataRow: 4, totalRowBefore: 7, lastColumn: "G",
        headerRefs: { thu: "E2", ngay: "F2", gio: "G2" },
        legend: { gradeCol: "F", labelCol: "I", countCol: "K", ratioCol: "L", gradeRowOffsets: [3, 4, 5], sumRowOffset: 6 },
    },
    internet: {
        templateFile: "03 - FORM TINH TRANG INTERNET.xlsx", sheet: "INTERNET", firstDataRow: 4, totalRowBefore: 10, lastColumn: "G",
        deleteSheets: ["NETSUPPORT"], headerRefs: { thu: "E2", ngay: "F2", gio: "G2" }, legend: NET_LEGEND,
    },
    mayTinh: {
        templateFile: "02 - FORM TINH TRANG MAY TINH.xlsx", sheet: "2409", firstDataRow: 4, totalRowBefore: 7, lastColumn: "L",
        // Sheet thứ hai là bảng khác ("Danh sách dự kiến các trường thiếu máy") có sẵn dữ liệu mẫu — không đưa vào file xuất.
        deleteSheets: ["0310 (2)"],
        headerRefs: { thu: "J2", ngay: "K2", gio: "L2" },
        legend: { gradeCol: "J", labelCol: "C", countCol: "F", ratioCol: "G", gradeRowOffsets: [4, 5, 6, 7, 8], sumRowOffset: 9 },
    },
    dien: {
        templateFile: "03 - FORM TINH TRANG LOI DIEN.xlsx", sheet: "DIEN", firstDataRow: 4, totalRowBefore: 10, lastColumn: "G",
        headerRefs: { thu: "E2", ngay: "F2", gio: "G2" }, legend: NET_LEGEND,
    },
} as const satisfies Record<string, StatusFileLayout>;

/** Các file mà `fill:status-reports` của 4 giai đoạn làm. ĐIỆN không nằm trong đó: nó có chu trình riêng, mỗi ngày một file (`fill:electric-report`). */
export const PHASE_STATUS_KEYS = (Object.keys(FILE_LAYOUT) as Array<keyof typeof FILE_LAYOUT>).filter((key) => key !== "dien");

export interface HeaderCell {
    ref: string;
    value: string | number;
    numberFormat?: string;
    /** Sheet chứa ô; bỏ trống = sheet chính của file (`FileLayout.sheet`). */
    sheet?: string;
}

export interface FormulaCell {
    ref: string;
    formula: string;
    /** Sheet chứa ô; bỏ trống = sheet chính của file. */
    sheet?: string;
}

export interface FileFillSpec extends FileLayout {
    rows: Array<Record<string, string | number | null>>;
    headerCells: HeaderCell[];
    formulaCells: FormulaCell[];
}

/**
 * Công thức của khối CHÚ GIẢI & THỐNG KÊ, viết lại theo ĐÚNG vùng dữ liệu hiện tại. Excel không tự mở rộng đúng một tham chiếu
 * khi chèn/xoá dòng kề bên nó, và xoá hết dòng dữ liệu mà công thức đang trỏ tới biến tham chiếu thành `#REF!` vĩnh viễn trong
 * file lưu ra — cả hai đã xảy ra thật (xem scripts/fill-status-template.ps1) — nên không dựa vào Excel tự suy ra mà luôn ghi đè,
 * và luôn tính vùng dữ liệu tối thiểu là 1 dòng (PowerShell cũng không bao giờ xoá dưới 1 dòng). Mỗi dòng loại có SỐ LƯỢNG
 * (COUNTIF theo cột XẾP LOẠI) và TỶ LỆ (SỐ LƯỢNG / tổng, 0 khi tổng bằng 0 — ô tỷ lệ đã định dạng % sẵn trong mẫu); dòng cuối là TỔNG.
 */
export function legendFormulaCells(layout: FileLayout, rowCount: number): FormulaCell[] {
    const legend = layout.legend;
    if (!legend) return [];
    const first = layout.firstDataRow;
    const last = first + Math.max(rowCount, 1) - 1;
    const total = last + 1;
    const dataRange = `${legend.gradeCol}${first}:${legend.gradeCol}${last}`;
    const gradeRows = legend.gradeRowOffsets.map((off) => total + off);
    const sumRow = total + legend.sumRowOffset;
    const cells: FormulaCell[] = [];
    for (const row of gradeRows) {
        cells.push({ ref: `${legend.countCol}${row}`, formula: `COUNTIF(${dataRange},${legend.labelCol}${row})` });
        cells.push({ ref: `${legend.ratioCol}${row}`, formula: `IF(${legend.countCol}${sumRow}=0,0,${legend.countCol}${row}/${legend.countCol}${sumRow})` });
    }
    const [firstRow, lastRow] = [gradeRows[0], gradeRows[gradeRows.length - 1]];
    cells.push({ ref: `${legend.countCol}${sumRow}`, formula: `SUM(${legend.countCol}${firstRow}:${legend.countCol}${lastRow})` });
    cells.push({ ref: `${legend.ratioCol}${sumRow}`, formula: `SUM(${legend.ratioCol}${firstRow}:${legend.ratioCol}${lastRow})` });
    return cells;
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

/**
 * Đọc dòng 2 của ô A1 (gộp 2 dòng, vd "TIN HỌC ĐẠI DƯƠNG\nTÌNH TRẠNG LOA") của sheet `sheet` trong file mẫu — đây là tiêu đề
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

/** `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` — `hhmm` là giờ chạy thực tế (dạng "HHmm"), dùng cho mọi báo cáo
 * trạng thái (cả các file của fill:status-reports lẫn VỆ SINH/NỘI QUY); không còn mốc giờ cố định theo giai đoạn. */
export function freeFormFileName(title: string, day: string, hhmm: string): string {
    const [y, m, d] = day.split("-");
    const yyMMdd = `${y.slice(2)}${m}${d}`;
    const weekday = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
    return `${title}_${yyMMdd}_T${WEEKDAY_EXCEL_TYPE1(weekday)}_${hhmm}.xlsx`;
}

export function buildFillSpecs(reports: Report[], day: string, generatedAt: number = Date.now(), electric: ElectricEntry[] = []): Record<keyof typeof FILE_LAYOUT, FileFillSpec> {
    const { thu, ngay, gio } = headerDateTexts(day, generatedAt);
    const spec = (key: keyof typeof FILE_LAYOUT, rows: FileFillSpec["rows"]): FileFillSpec => {
        const layout: StatusFileLayout = FILE_LAYOUT[key];
        return {
            ...layout,
            rows,
            headerCells: [{ ref: layout.headerRefs.thu, value: thu }, { ref: layout.headerRefs.ngay, value: ngay }, { ref: layout.headerRefs.gio, value: gio }],
            formulaCells: legendFormulaCells(layout, rows.length),
        };
    };
    return {
        loa: spec("loa", buildLoaRows(reports)),
        mayTinh: spec("mayTinh", buildMayTinhRows(reports)),
        netsupport: spec("netsupport", buildNetSupportRows(reports)),
        internet: spec("internet", buildInternetRows(reports)),
        dien: spec("dien", buildDienRows(electric)),
    };
}
