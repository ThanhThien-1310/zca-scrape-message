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
 * liệu — Excel không tự mở rộng/thu hẹp đúng tham chiếu này khi PowerShell chèn/xoá dòng kề bên (xem
 * scripts/fill-status-template.ps1), nên luôn ghi đè lại công thức theo đúng vùng dữ liệu hiện tại, tối thiểu
 * 1 dòng (0 dòng dữ liệu vẫn tham chiếu firstDataRow, không để trống hẳn).
 */
export function cleaningFormulaCells(firstDataRow: number, rowCount: number): FormulaCell[] {
    const effectiveRows = Math.max(rowCount, 1);
    const lastDataRow = firstDataRow + effectiveRows - 1;
    const totalRow = firstDataRow + effectiveRows;
    return [{ ref: `C${totalRow}`, formula: `COUNTA(C${firstDataRow}:C${lastDataRow})` }];
}
