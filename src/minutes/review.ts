import { compareReadings } from "../vision/review.js";
import type { BundleReading, Confidence, Disagreement, PhotoRule, RowReview } from "../types/index.js";

export const MINUTES_RULE_ID = "bienban";
/** Các cột của một biên bản (trùng `photo-rules/bienban.json`); người xem chỉ được sửa các cột này. */
export const MINUTES_COLUMNS = ["tieuDe", "daiDienCty", "daiDienTruong", "boPhanTruong", "laTrangTiep"] as const;
/** Các cột chữ phải có giá trị để biên bản dùng được (tiêu đề, hai bên đại diện, bộ phận bên trường). */
export const MINUTES_TEXT_COLUMNS = ["tieuDe", "daiDienCty", "daiDienTruong", "boPhanTruong"] as const;
const LABELS: Record<string, string> = { tieuDe: "tiêu đề", daiDienCty: "đại diện công ty", daiDienTruong: "đại diện trường", boPhanTruong: "bộ phận bên trường" };

const RANK: Record<Confidence, number> = { thap: 0, vua: 1, cao: 2 };

/** Các biên bản (đối tượng) của danh sách `bienBan`, GIỮ VỊ TRÍ (phần tử không phải đối tượng thành `{}`), để chỉ số khớp `bienban.bienBan[i]` của lần đọc hai. */
export function minutesRowsOf(reading: BundleReading): Array<Record<string, unknown>> {
    const v = reading.extracted[MINUTES_RULE_ID]?.bienBan?.value;
    return Array.isArray(v) ? v.map((r) => (typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Record<string, unknown>) : {})) : [];
}

/** Chuỗi đã gộp khoảng trắng thừa; rỗng khi không phải chuỗi hoặc chỉ có khoảng trắng. */
export function textOf(v: unknown): string {
    return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

export interface MinutesVerdict {
    ok: boolean;
    hard: string[];
}

/**
 * Luật cứng của MỘT biên bản: đủ tiêu đề, đại diện công ty, đại diện trường, bộ phận bên trường; ảnh không phải trang tiếp theo (chưa có cách gộp trang, để người xem).
 * Chữ viết tay có thể bỏ trống thật, khi đó người xem xác nhận để dùng dòng với ô trống.
 */
export function validateMinutesRow(raw: Record<string, unknown>): MinutesVerdict {
    const hard: string[] = [];
    if (raw.laTrangTiep === true) hard.push("ảnh là trang tiếp theo của một biên bản: chưa biết cách gộp trang, cần người xem");
    for (const col of MINUTES_TEXT_COLUMNS) if (textOf(raw[col]) === "") hard.push(`không đọc được ${LABELS[col]}`);
    return { ok: hard.length === 0, hard };
}

export interface MinutesReviewInput {
    rules: PhotoRule[];
    first: BundleReading;
    second: { ok: true; reading: BundleReading } | { ok: false; error: string } | null;
}

export interface MinutesReview {
    reasons: string[];
    rows: RowReview[];
}

/** Review các biên bản của một bộ, theo từng biên bản; null khi bộ không có ảnh nào loại `bienban`. Cùng khuôn với `reviewSpeed`. */
export function reviewMinutes(input: MinutesReviewInput): MinutesReview | null {
    const { rules, first, second } = input;
    const rule = rules.find((r) => r.id === MINUTES_RULE_ID);
    const images = first.images.filter((i) => i.loai === MINUTES_RULE_ID);
    if (!rule || images.length === 0) return null;

    const reasons: string[] = [];
    const { toiThieu, toiDa } = rule.soLuongMoiBo;
    if (images.length < toiThieu || images.length > toiDa) reasons.push(`${images.length} ảnh biên bản, cần từ ${toiThieu} đến ${toiDa}`);
    const need = RANK[rule.nguongTinCay];
    const low = images.filter((i) => RANK[i.doTinCay] < need).map((i) => `ảnh ${i.seq}`);
    if (low.length > 0) reasons.push(`độ tin cậy ảnh biên bản dưới ngưỡng "${rule.nguongTinCay}": ${low.join(", ")}`);
    const list = first.extracted[MINUTES_RULE_ID]?.bienBan;
    if (list && RANK[list.doTinCay] < need) reasons.push(`độ tin cậy của danh sách biên bản dưới ngưỡng "${rule.nguongTinCay}"`);
    const rows = minutesRowsOf(first);
    if (rows.length === 0) reasons.push("không đọc được biên bản nào");
    else if (rows.length !== images.length) reasons.push(`đọc ra ${rows.length} biên bản nhưng có ${images.length} ảnh biên bản`);

    let disagree: Disagreement[] = [];
    if (second) {
        if (second.ok) {
            disagree = compareReadings(first, second.reading).filter((d) => d.path.startsWith(`${MINUTES_RULE_ID}.`) || d.path.startsWith("anh["));
            if (disagree.some((d) => d.path === `${MINUTES_RULE_ID}.bienBan.length`)) reasons.push("hai lần đọc ra số biên bản khác nhau");
            if (disagree.some((d) => d.path.startsWith("anh["))) reasons.push("hai lần đọc phân loại ảnh khác nhau");
        } else reasons.push(`đọc lần hai lỗi: ${second.error}`);
    }

    const rowReviews: RowReview[] = rows.map((raw, index) => {
        const own = [...validateMinutesRow(raw).hard];
        for (const d of disagree) if (d.path.startsWith(`${MINUTES_RULE_ID}.bienBan[${index}].`)) own.push(`hai lần đọc lệch ở ${d.path}: ${JSON.stringify(d.first)} khác ${JSON.stringify(d.second)}`);
        const all = [...reasons, ...own];
        return { index, status: all.length > 0 ? "can_xem" : "tu_dong_dat", reasons: all, warnings: [], human: null };
    });
    return { reasons, rows: rowReviews };
}
