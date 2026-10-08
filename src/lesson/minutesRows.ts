import { excelDateSerialForDay, type FileLayout, type HeaderCell } from "./statusReportLayout.js";
import type { Cell } from "../types/index.js";
import type { MinutesEntry } from "./minutesReport.js";

/**
 * Sheet FORM của mẫu QUẢN LÝ BIÊN BẢN (05 - QUAN LY BIEN BAN.xlsx): A STT, B NGÀY, C TÊN TRƯỜNG, D KHU VỰC, E PM, F NỘI DUNG, G SL, H ĐẠI DIỆN CTY, I ĐẠI DIỆN TRƯỜNG,
 * J CHỨC VỤ, K XẾP LOẠI, L GHI CHÚ. Bot điền A đến J; K (xếp loại A đã lưu, B chưa lưu, C chưa ký) và L để TRỐNG cho người dùng. Khối CHÚ GIẢI & THỐNG KÊ dùng công thức riêng của
 * mẫu (đếm theo cột K có tính bộ lọc) nên KHÔNG viết lại: không có `legend`.
 */
export const MINUTES_LAYOUT: FileLayout = {
    templateFile: "05 - QUAN LY BIEN BAN.xlsx",
    sheet: "FORM ", // tên sheet của mẫu có một dấu cách ở cuối
    firstDataRow: 4,
    totalRowBefore: 9,
    lastColumn: "L",
};

/** L2 là ô "Ngày báo cáo" (mẫu để `=TODAY()`): ghi số ngày của `day`, hiển thị dd/mm/yyyy. */
export function minutesHeaderCells(day: string): HeaderCell[] {
    return [{ ref: "L2", value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" }];
}

const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `'${d}/${m}/${y}`;
};

/** Một dòng mỗi biên bản; SL luôn là 1. Biên bản chưa đọc được (chờ người xem) vẫn có dòng với trường, khu vực, PM, ngày, còn NỘI DUNG và hai đại diện để trống. */
export function buildMinutesRows(entries: MinutesEntry[]): Array<Record<string, Cell>> {
    return entries.map((e, i) => {
        const row: Record<string, Cell> = { A: i + 1, B: fmtDate(e.ngay), C: e.tenTruong, D: e.khuVuc, E: e.pm, G: 1 };
        if (e.item.tieuDe) row.F = e.item.tieuDe;
        if (e.item.daiDienCty) row.H = e.item.daiDienCty;
        if (e.item.daiDienTruong) row.I = e.item.daiDienTruong;
        if (e.item.boPhanTruong) row.J = e.item.boPhanTruong;
        return row; // K (XẾP LOẠI) và L (GHI CHÚ) để trống
    });
}
