import { capLaMa } from "./maintenanceRows.js";
import { excelDateSerialForDay, type FileLayout, type HeaderCell } from "./statusReportLayout.js";
import { gradeOfMbps, type SpeedGrade } from "../speed/units.js";
import type { Cell } from "../types/index.js";
import type { InternetSpeedEntry } from "./internetSpeedReport.js";

/**
 * Sheet FORM của mẫu TRẠNG THÁI KẾT NỐI INTERNET (03 - TRANG THAI KET NOI INTERNET.xlsx): A STT, B CẤP, C TÊN TRƯỜNG, D KHU VỰC, E PM, F TỐC ĐỘ (Mbps), G XẾP LOẠI,
 * H NGÀY CẬP NHẬT, I GHI CHÚ (để trống). Khối CHÚ GIẢI & THỐNG KÊ dùng công thức riêng của mẫu (đếm theo cột G, có tính bộ lọc) nên KHÔNG viết lại: không có `legend`.
 */
export const INTERNET_SPEED_LAYOUT: FileLayout = {
    templateFile: "03 - TRANG THAI KET NOI INTERNET.xlsx",
    sheet: "FORM",
    firstDataRow: 4,
    totalRowBefore: 11,
    lastColumn: "I",
};

/** I2 là ô "Ngày báo cáo" (số ngày, mẫu để giá trị cố định): ghi số ngày của `day`, hiển thị dd/mm/yyyy. */
export function internetSpeedHeaderCells(day: string): HeaderCell[] {
    return [{ ref: "I2", value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" }];
}

/** Xếp loại của một phòng: D khi tin ghi "Internet: Không" hoặc ảnh đo báo không có mạng; A, B, C theo tốc độ; rỗng khi chưa có ảnh đo dùng được. */
export function gradeOfEntry(e: InternetSpeedEntry): SpeedGrade | "" {
    if (e.internet === "khong" || e.noInternet) return "D";
    return e.mbps === null ? "" : gradeOfMbps(e.mbps);
}

/** Thứ tự TĂNG DẦN theo chất lượng: D rồi C, B, A; phòng chưa có xếp loại xuống cuối. Cùng loại thì tốc độ thấp trước, rồi theo tên trường và phòng. */
const ORDER: Record<SpeedGrade | "", number> = { D: 0, C: 1, B: 2, A: 3, "": 4 };

const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `'${d}/${m}/${y}`;
};

export function buildInternetSpeedRows(entries: InternetSpeedEntry[], day: string): Array<Record<string, Cell>> {
    const graded = entries.map((e) => ({ e, grade: gradeOfEntry(e) }));
    graded.sort(
        (a, b) =>
            ORDER[a.grade] - ORDER[b.grade] ||
            (a.e.mbps ?? Number.POSITIVE_INFINITY) - (b.e.mbps ?? Number.POSITIVE_INFINITY) ||
            a.e.tenTruong.localeCompare(b.e.tenTruong) ||
            a.e.phongMay.localeCompare(b.e.phongMay),
    );
    return graded.map(({ e, grade }, i) => {
        const row: Record<string, Cell> = { A: i + 1, B: capLaMa(e.cap), C: e.tenTruong, D: e.khuVuc, E: e.phongMay, H: fmtDate(day) };
        if (e.mbps !== null && grade !== "D") row.F = e.mbps;
        if (grade !== "") row.G = grade;
        return row; // I (GHI CHÚ) để trống
    });
}
