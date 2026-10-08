import { bundleStatus } from "../leave/review.js";
import { SPEED_COLUMNS } from "./review.js";
import { toMbps } from "./units.js";
import type { Review, RowReview } from "../types/index.js";

/** Người xem một LẦN ĐO tốc độ (cùng khuôn với `applyHumanRow` của nghỉ phép, nhưng trên `review.speed.rows`). Hàm thuần: trả `Review` mới. */
export type SpeedAction = "xac_nhan" | "sua" | "bo";

/** `tocDo=95.4`, `donVi=Mbps`, `khongCoMang=true`; ném lỗi tiếng Việt khi giá trị sai (số phải dương, đơn vị phải là Kbps, Mbps hoặc Gbps). */
export function parseSpeedFix(arg: string): { column: string; value: unknown } {
    const i = arg.indexOf("=");
    if (i <= 0) throw new Error(`Sửa phải có dạng cột=giá trị (ví dụ tocDo=95), nhận được "${arg}".`);
    const column = arg.slice(0, i).trim();
    if (!(SPEED_COLUMNS as readonly string[]).includes(column)) throw new Error(`Cột "${column}" không có (các cột: ${SPEED_COLUMNS.join(", ")}).`);
    const raw = arg.slice(i + 1).trim();
    if (column === "tocDo") {
        if (raw === "" || raw === "null") return { column, value: null };
        if (!/^\d+(\.\d+)?$/.test(raw) || Number(raw) <= 0) throw new Error(`Cột "tocDo" phải là số dương (ví dụ 95.4) hoặc null, nhận được "${raw}".`);
        return { column, value: Number(raw) };
    }
    if (column === "donVi") {
        if (toMbps(1, raw) === null) throw new Error(`Cột "donVi" phải là Kbps, Mbps hoặc Gbps, nhận được "${raw}".`);
        return { column, value: raw };
    }
    const t = raw.toLowerCase();
    if (["true", "co", "có"].includes(t)) return { column, value: true };
    if (["false", "khong", "không"].includes(t)) return { column, value: false };
    throw new Error(`Cột "khongCoMang" phải là true hoặc false, nhận được "${raw}".`);
}

export function applyHumanSpeedRow(review: Review, index: number, action: SpeedAction, corrections: Record<string, unknown>, now: number): Review {
    const speed = review.speed;
    const row = speed?.rows.find((r) => r.index === index);
    if (!speed || !row) throw new Error(`Bộ này không có lần đo tốc độ ${index} (có: ${speed?.rows.map((r) => r.index).join(", ") || "không lần đo nào"}).`);
    const count = Object.keys(corrections).length;
    if (action === "sua" && count === 0) throw new Error("Sửa cần ít nhất một --fix cột=giá trị.");
    if (action !== "sua" && count > 0) throw new Error("Xác nhận hoặc bỏ không kèm sửa; dùng --fix để sửa.");
    if (action === "xac_nhan" && row.status !== "can_xem") throw new Error(`Lần đo ${index} đang ${row.status}, không cần xác nhận.`);
    const merged = action === "sua" ? { ...(row.human?.action === "sua" ? row.human.corrections : {}), ...corrections } : {};
    const status = action === "xac_nhan" ? "da_xac_nhan" : action === "sua" ? "da_sua" : "da_bo";
    const rows = speed.rows.map((r): RowReview => (r.index === index ? { ...r, status, human: { at: now, action, corrections: merged } } : r));
    const all = [...review.rows, ...rows, ...(review.minutes?.rows ?? [])];
    return { ...review, speed: { ...speed, rows }, status: bundleStatus(all, all.length === 0 ? review.reasons : [], review.dismissed) };
}
