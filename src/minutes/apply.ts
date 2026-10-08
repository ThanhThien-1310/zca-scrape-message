import { bundleStatus } from "../leave/review.js";
import { MINUTES_COLUMNS } from "./review.js";
import type { Review, RowReview } from "../types/index.js";

/** Người xem một BIÊN BẢN (cùng khuôn với `applyHumanSpeedRow`, trên `review.minutes.rows`). Hàm thuần: trả `Review` mới. */
export type MinutesAction = "xac_nhan" | "sua" | "bo";

/** `tieuDe=...`, `daiDienCty=...`, `laTrangTiep=true`; `null` hoặc rỗng để xoá ô chữ. Ném lỗi tiếng Việt khi cột hoặc giá trị sai. */
export function parseMinutesFix(arg: string): { column: string; value: unknown } {
    const i = arg.indexOf("=");
    if (i <= 0) throw new Error(`Sửa phải có dạng cột=giá trị (ví dụ daiDienTruong=Cao Minh Trung), nhận được "${arg}".`);
    const column = arg.slice(0, i).trim();
    if (!(MINUTES_COLUMNS as readonly string[]).includes(column)) throw new Error(`Cột "${column}" không có (các cột: ${MINUTES_COLUMNS.join(", ")}).`);
    const raw = arg.slice(i + 1).trim();
    if (column === "laTrangTiep") {
        const t = raw.toLowerCase();
        if (["true", "co", "có"].includes(t)) return { column, value: true };
        if (["false", "khong", "không"].includes(t)) return { column, value: false };
        throw new Error(`Cột "laTrangTiep" phải là true hoặc false, nhận được "${raw}".`);
    }
    return { column, value: raw === "" || raw === "null" ? null : raw };
}

export function applyHumanMinutesRow(review: Review, index: number, action: MinutesAction, corrections: Record<string, unknown>, now: number): Review {
    const minutes = review.minutes;
    const row = minutes?.rows.find((r) => r.index === index);
    if (!minutes || !row) throw new Error(`Bộ này không có biên bản ${index} (có: ${minutes?.rows.map((r) => r.index).join(", ") || "không biên bản nào"}).`);
    const count = Object.keys(corrections).length;
    if (action === "sua" && count === 0) throw new Error("Sửa cần ít nhất một --fix cột=giá trị.");
    if (action !== "sua" && count > 0) throw new Error("Xác nhận hoặc bỏ không kèm sửa; dùng --fix để sửa.");
    if (action === "xac_nhan" && row.status !== "can_xem") throw new Error(`Biên bản ${index} đang ${row.status}, không cần xác nhận.`);
    const merged = action === "sua" ? { ...(row.human?.action === "sua" ? row.human.corrections : {}), ...corrections } : {};
    const status = action === "xac_nhan" ? "da_xac_nhan" : action === "sua" ? "da_sua" : "da_bo";
    const rows = minutes.rows.map((r): RowReview => (r.index === index ? { ...r, status, human: { at: now, action, corrections: merged } } : r));
    const all = [...review.rows, ...(review.speed?.rows ?? []), ...rows];
    return { ...review, minutes: { ...minutes, rows }, status: bundleStatus(all, all.length === 0 ? review.reasons : [], review.dismissed) };
}
