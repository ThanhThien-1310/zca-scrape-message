import { excelDateSerialForDay, type FileLayout, type HeaderCell } from "./statusReportLayout.js";
import type { Cell } from "../types/index.js";
import type { MaintenanceEntry } from "./maintenanceReport.js";

/**
 * Sheet FORM của mẫu THỜI GIAN CHƯA BẢO TRÌ PM (02 - THOI GIAN CHUA BAO TRI.xlsx): A STT, B CẤP (số La Mã: TH = I, THCS = II, THPT = III; cấp khác giữ nguyên), C TÊN TRƯỜNG, D KHU VỰC, E TỔNG PM, F PM TRƯỜNG, G PM CTY, H BẢO TRÌ GN,
 * I SỐ NGÀY, J XẾP LOẠI, K TÌNH TRẠNG BẢO TRÌ, L GHI CHÚ. Bot chỉ điền A, B, C, D và H (ngày của báo cáo); các cột còn lại để TRỐNG cho tới khi có nguồn dữ liệu.
 * Khối CHÚ GIẢI & THỐNG KÊ (B13:E18) đếm theo cột J nên tự cập nhật khi người dùng gõ xếp loại; công thức tỷ lệ của mẫu trỏ vào một file ngoài đã mất
 * ([1]BRVT) nên ta viết lại bằng `legendFormulaCells`.
 */
export const MAINTENANCE_LAYOUT: FileLayout = {
    templateFile: "02 - THOI GIAN CHUA BAO TRI.xlsx",
    sheet: "FORM",
    firstDataRow: 4,
    totalRowBefore: 10,
    lastColumn: "L",
    legend: { gradeCol: "J", labelCol: "B", countCol: "D", ratioCol: "E", gradeRowOffsets: [4, 5, 6, 7], sumRowOffset: 8 },
};

/** L2 là ô "Ngày báo cáo" (mẫu để `=TODAY()`): ghi số ngày của `day`, hiển thị dd/mm/yyyy. */
export function maintenanceHeaderCells(day: string): HeaderCell[] {
    return [{ ref: "L2", value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" }];
}

/** Ngày ghi dạng CHỮ dd/mm/yyyy có dấu nháy đơn đứng đầu (ép ô thành chữ, Excel không đảo ngày/tháng theo định dạng Mỹ; dấu nháy không hiện trong ô). */
const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `'${d}/${m}/${y}`;
};

/** Cột CẤP ghi số La Mã: cấp 1 (TH) là "I", cấp 2 (THCS) là "II", cấp 3 (THPT) là "III"; các cấp khác (MN, LC, "THCS - THPT"...) hoặc rỗng giữ nguyên. */
export function capLaMa(cap: string): string {
    return ({ TH: "I", THCS: "II", THPT: "III" } as Record<string, string>)[cap] ?? cap;
}

export function buildMaintenanceRows(entries: MaintenanceEntry[], day: string): Array<Record<string, Cell>> {
    return entries.map((e, i) => ({
        A: i + 1,
        B: capLaMa(e.cap),
        C: e.tenTruong,
        D: e.khuVuc,
        H: fmtDate(day),
        // E, F, G, I, J, K, L không có trong object: để trống.
    }));
}
