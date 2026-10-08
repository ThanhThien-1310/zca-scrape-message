import type { Mark } from "../types/index.js";

// 2 = cần xem, 1 = đã xử lý, -1 = bỏ qua. Mã lạ có hạng 0 nên không bao giờ thắng mã đã biết.
const RANK = new Map<number, number>([[2, 3], [1, 2], [-1, 1]]);
const rank = (status: number): number => RANK.get(status) ?? 0;

/**
 * Một tin có thể nuôi nhiều bộ báo cáo, mỗi bộ ra một dấu riêng (chỉnh sửa theo bộ có thể làm hai bộ khác nhau). Cột StatusId của tin trong DB chỉ
 * có một giá trị nên gộp: "cần xem" (một bộ chưa chắc chắn) thắng "đã xử lý" thắng "bỏ qua". Thứ tự tin giữ theo lần xuất hiện đầu.
 */
export function mergeMarks(marks: Mark[]): Mark[] {
    const best = new Map<string, Mark>();
    for (const mark of marks) {
        const key = `${mark.maNhom}|${mark.maTinNhan}`;
        const current = best.get(key);
        if (!current || rank(mark.maTrangThai) > rank(current.maTrangThai)) best.set(key, mark);
    }
    return [...best.values()];
}
