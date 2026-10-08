import { excelDateSerialForDay, headerDateTexts, type FileLayout, type HeaderCell } from "./statusReportLayout.js";
import type { Cell, CleaningEntry } from "../types/index.js";

/**
 * Sheet HANG NGAY của mẫu VỆ SINH PHÒNG MÁY mới: A STT, B NGÀY, C TÊN TRƯỜNG, D KHU VỰC, E PM, F HỌ TÊN, G GHI CHÚ. Bot chỉ điền A-F;
 * cột GHI CHÚ để TRỐNG cho người dùng tự xếp loại A (Đã vệ sinh) / B (Chưa vệ sinh) / C (Trường nhờ sau) theo khối chú giải (công
 * thức SỐ LƯỢNG/TỶ LỆ của khối này đếm theo cột G nên tự cập nhật khi họ gõ). Sheet TONG (tổng
 * hợp theo trường) CHƯA có nguồn dữ liệu nên để trống. Xem docs/superpowers/specs/2026-10-03-bo-mau-moi-7-file-design.md.
 */
export const CLEANING_LAYOUT: FileLayout = {
    templateFile: "04 - FORM VE SINH PHONG MAY.xlsx",
    sheet: "HANG NGAY",
    firstDataRow: 4,
    totalRowBefore: 8,
    lastColumn: "G",
    legend: { gradeCol: "G", labelCol: "I", countCol: "K", ratioCol: "L", gradeRowOffsets: [5, 6, 7], sumRowOffset: 8 },
};

/**
 * Dòng 2 của sheet HANG NGAY trong mẫu: F2 = "Ngày: <TODAY()>" và G2 = "Thời gian: <NOW()>" (mẫu cũ có một ô "Ngày báo cáo" ở G2 nên trước đây ta
 * ghi SỐ NGÀY vào G2, làm ô "Thời gian" hiện ra ngày tháng năm). Sheet TONG (để trống) vẫn chỉ có ô "Ngày báo cáo" J2 là một ngày.
 */
export const CLEANING_HEADER_REFS = { ngay: "F2", gio: "G2" } as const;
const CLEANING_TONG_DATE_REF = "J2";

/** HANG NGAY F2/G2 bằng CHỮ ("Ngày: dd/mm/yyyy" của `day`, "Thời gian: hh:mm" giờ chạy `generatedAt`); TONG J2 là số ngày hiển thị dd/mm/yyyy. */
export function cleaningHeaderCells(day: string, generatedAt: number): HeaderCell[] {
    const { ngay, gio } = headerDateTexts(day, generatedAt);
    return [
        { ref: CLEANING_HEADER_REFS.ngay, value: ngay },
        { ref: CLEANING_HEADER_REFS.gio, value: gio },
        { sheet: "TONG", ref: CLEANING_TONG_DATE_REF, value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" },
    ];
}

/** NGÀY ghi dạng CHỮ dd/mm/yyyy, có dấu nháy đơn đứng đầu: nếu không, Excel (qua COM, theo định dạng Mỹ) tự hiểu "01/10/2026"
 * thành ngày 10/01/2026 (ngày ≤ 12 bị đảo ngày/tháng); dấu nháy ép ô thành chữ và không hiện ra trong ô. */
const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `'${d}/${m}/${y}`;
};

export function buildCleaningRows(entries: CleaningEntry[], day: string): Array<Record<string, Cell>> {
    return entries.map((e, i) => ({
        A: i + 1,
        B: fmtDate(day),
        C: e.tenTruong,
        D: e.khuVuc,
        E: e.phongMay,
        F: e.tenIT,
        // Không điền G (GHI CHÚ): người dùng tự xếp loại A/B/C; khối chú giải vẫn đếm theo những gì họ gõ vào cột G.
    }));
}
