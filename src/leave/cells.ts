import { buoiNghi, ngayText } from "./buoi.js";
import { LEAVE_BUOI_COLUMN, LEAVE_NGAY_COLUMN } from "./layout.js";
import { suggestNames } from "./names.js";
import { matchRoster, type RosterRow } from "./roster.js";
import type { ActiveLeave } from "./collect.js";
import type { HeaderCell } from "../lesson/statusReportLayout.js";

export interface LeaveFill {
    /** Các ô cần ghi: với mỗi dòng khớp, ô NGÀY (chữ, `numberFormat "@"`) và ô BUỔI. Không có ô nào khác. */
    headerCells: HeaderCell[];
    filled: Array<{ row: number; name: string; ngay: string; buoi: string }>;
    /** Kỳ nghỉ của người KHÔNG có trong danh sách của file: không điền gì, chỉ báo kèm gợi ý. */
    unmatched: Array<{ hoTen: string; ngay: string; suggestions: string[]; bundleId: string; rowIndex: number }>;
}

/**
 * Dựng các ô cần ghi vào file mẫu. Mỗi dòng của danh sách khớp tên (không dấu, không phân biệt hoa thường) đều được điền: một người có hai dòng (hai chức vụ)
 * được điền cả hai. Hàm thuần; không đọc file.
 */
export function buildLeaveCells(roster: RosterRow[], leaves: ActiveLeave[]): LeaveFill {
    const filled: LeaveFill["filled"] = [];
    const unmatched: LeaveFill["unmatched"] = [];
    for (const leave of leaves) {
        const p = leave.parsed;
        const ngay = ngayText(p.tu, p.den);
        const buoi = buoiNghi({ tu: p.tu, tuGio: p.tuGio, den: p.den, denGio: p.denGio });
        const rows = matchRoster(roster, leave.hoTen);
        if (rows.length === 0) {
            unmatched.push({ hoTen: leave.hoTen, ngay, suggestions: suggestNames(leave.hoTen, roster.map((r) => r.name)), bundleId: leave.bundleId, rowIndex: leave.rowIndex });
            continue;
        }
        for (const r of rows) filled.push({ row: r.row, name: r.name, ngay, buoi });
    }
    filled.sort((a, b) => a.row - b.row);
    const headerCells: HeaderCell[] = filled.flatMap((f) => [
        { ref: `${LEAVE_NGAY_COLUMN}${f.row}`, value: f.ngay, numberFormat: "@" },
        { ref: `${LEAVE_BUOI_COLUMN}${f.row}`, value: f.buoi },
    ]);
    return { headerCells, filled, unmatched };
}
