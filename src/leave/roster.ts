import XLSX from "xlsx";
import { normalizeName } from "./names.js";

/** Một người trong cột NHÂN VIÊN của file mẫu: số dòng Excel (đếm từ 1) và tên. Một người có thể xuất hiện ở nhiều dòng (hai chức vụ). */
export interface RosterRow {
    row: number;
    name: string;
}

/** Dòng đầu tiên của danh sách trong mẫu LICH NGHI PHEP KY THUAT (dòng 1 đến 3 là tiêu đề). */
export const ROSTER_FIRST_ROW = 4;

/**
 * Danh sách tên đọc TRỰC TIẾP từ file mẫu mỗi lần dùng (sửa file mẫu là danh sách đổi theo, không sửa code): mọi dòng từ dòng 4 trở xuống có
 * chữ ở cột B (NHÂN VIÊN) VÀ chữ ở cột C (CHỨC VỤ). Dòng "TỔNG" (B là số) và dòng lời chào (không có chức vụ) vì thế không phải người.
 */
export function readRoster(templatePath: string, sheet: string): RosterRow[] {
    const wb = XLSX.readFile(templatePath);
    const ws = wb.Sheets[sheet];
    if (!ws || !ws["!ref"]) throw new Error(`${templatePath}: không có sheet "${sheet}".`);
    const last = XLSX.utils.decode_range(ws["!ref"]).e.r + 1;
    const text = (ref: string): string => {
        const v = ws[ref]?.v;
        return typeof v === "string" ? v.trim() : "";
    };
    const out: RosterRow[] = [];
    for (let r = ROSTER_FIRST_ROW; r <= last; r++) {
        const name = text(`B${r}`);
        if (name !== "" && text(`C${r}`) !== "") out.push({ row: r, name });
    }
    return out;
}

/** Mọi dòng của danh sách có tên khớp `name` sau khi chuẩn hóa (không dấu, không phân biệt hoa thường, gộp khoảng trắng). */
export function matchRoster(roster: RosterRow[], name: string): RosterRow[] {
    const key = normalizeName(name);
    return key === "" ? [] : roster.filter((r) => normalizeName(r.name) === key);
}
