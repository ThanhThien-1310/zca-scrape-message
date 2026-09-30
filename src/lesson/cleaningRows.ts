import type { FileLayout, FormulaCell } from "./statusReportLayout.js";
import type { Cell, CleaningEntry } from "../types/index.js";

export const CLEANING_LAYOUT: FileLayout = { templateFile: "TINH TRANG VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "H" };

const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
};

/** Cột GHI CHÚ (H) cố tình không có trong object trả về — để trống, không ghi gì (xem spec). */
export function buildCleaningRows(entries: CleaningEntry[], day: string): Array<Record<string, Cell>> {
    return entries.map((e, i) => ({
        A: i + 1,
        B: fmtDate(day),
        C: e.tenTruong,
        D: e.khuVuc,
        E: e.phongMay,
        F: e.tenIT,
        G: e.veSinhSach ? "A" : "B",
    }));
}

/**
 * Mirrors `boSungFormulaCells` (statusRows.ts): file mẫu có công thức `TỔNG = COUNTA(...)` ngay dưới vùng dữ
 * liệu, và khối "CHÚ GIẢI VÀ THỐNG KÊ" (đếm XẾP LOẠI A/B/C ở cột G) nằm ngay dưới đó nữa — Excel không tự mở
 * rộng/thu hẹp đúng các tham chiếu này khi PowerShell chèn/xoá dòng kề bên (xem
 * scripts/fill-status-template.ps1), nên luôn ghi đè lại theo đúng vùng dữ liệu hiện tại, tối thiểu 1 dòng (0
 * dòng dữ liệu vẫn tham chiếu firstDataRow, không để trống hẳn). Khối CHÚ GIẢI ở file mẫu gốc nằm đúng
 * totalRow+5 (dòng A), totalRow+6 (dòng B), totalRow+7 (dòng C) — xác nhận qua file mẫu thật (totalRow=8, A=13,
 * B=14, C=15). Dòng C vẫn phải ghi đè dù cột G không bao giờ chứa "C" nữa (xếp loại C đã bỏ khỏi phạm vi, đếm
 * ra 0 là đúng) — nếu KHÔNG ghi đè, công thức GỐC của dòng C (tham chiếu đúng 3 dòng, không có dòng nào chắc
 * chắn sống sót khi rowCount nhỏ, khác A/B luôn còn firstDataRow) vỡ thành lỗi thật `#REF!` khi số dòng dữ
 * liệu ít — đã tái hiện lỗi này với dữ liệu thật, không phải giả thuyết.
 */
export function cleaningFormulaCells(firstDataRow: number, rowCount: number): FormulaCell[] {
    const effectiveRows = Math.max(rowCount, 1);
    const lastDataRow = firstDataRow + effectiveRows - 1;
    const totalRow = firstDataRow + effectiveRows;
    const statsRowA = totalRow + 5;
    const statsRowB = totalRow + 6;
    const statsRowC = totalRow + 7;
    return [
        { ref: `C${totalRow}`, formula: `COUNTA(C${firstDataRow}:C${lastDataRow})` },
        { ref: `L${statsRowA}`, formula: `COUNTIF(G${firstDataRow}:G${lastDataRow},J${statsRowA})` },
        { ref: `L${statsRowB}`, formula: `COUNTIF(G${firstDataRow}:G${lastDataRow},J${statsRowB})` },
        { ref: `L${statsRowC}`, formula: `COUNTIF(G${firstDataRow}:G${lastDataRow},J${statsRowC})` },
    ];
}
