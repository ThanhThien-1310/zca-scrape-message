import { compareReadings } from "../vision/review.js";
import { toMbps } from "./units.js";
import type { BundleReading, Confidence, Disagreement, PhotoRule, RowReview } from "../types/index.js";

export const SPEED_RULE_ID = "speedtest";
/** Các cột của một lần đo tốc độ (trùng `photo-rules/speedtest.json`); người xem chỉ được sửa các cột này. */
export const SPEED_COLUMNS = ["tocDo", "donVi", "khongCoMang"] as const;

const RANK: Record<Confidence, number> = { thap: 0, vua: 1, cao: 2 };
/** Tốc độ không thể nhỏ hơn hoặc lớn hơn mức này (Mbps): ngoài khoảng là đọc sai số hoặc đơn vị. */
const MIN_MBPS = 0.01;
const MAX_MBPS = 100_000;

/** Các lần đo (đối tượng) của danh sách `lan`, GIỮ VỊ TRÍ (phần tử không phải đối tượng thành `{}`), để chỉ số khớp `speedtest.lan[i]` của lần đọc hai. */
export function speedRowsOf(reading: BundleReading): Array<Record<string, unknown>> {
    const v = reading.extracted[SPEED_RULE_ID]?.lan?.value;
    return Array.isArray(v) ? v.map((r) => (typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Record<string, unknown>) : {})) : [];
}

export interface SpeedVerdict {
    ok: boolean;
    hard: string[];
    /** Tốc độ đã đổi về Mbps; null khi không đọc được hoặc ảnh báo không có mạng. */
    mbps: number | null;
    noInternet: boolean;
}

/** Luật cứng của MỘT lần đo: ảnh báo không có mạng thì hợp lệ (xếp loại D); còn lại phải có số dương, đơn vị đổi được và Mbps trong khoảng hợp lý. */
export function validateSpeedRow(raw: Record<string, unknown>): SpeedVerdict {
    if (raw.khongCoMang === true) return { ok: true, hard: [], mbps: null, noInternet: true };
    const hard: string[] = [];
    const value = raw.tocDo;
    let mbps: number | null = null;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) hard.push(`không đọc được số tốc độ: ${JSON.stringify(value ?? null)}`);
    else {
        mbps = toMbps(value, typeof raw.donVi === "string" ? raw.donVi : null);
        if (mbps === null) hard.push(`đơn vị tốc độ không nhận ra: ${JSON.stringify(raw.donVi ?? null)}`);
        else if (mbps < MIN_MBPS || mbps > MAX_MBPS) {
            hard.push(`tốc độ ${mbps} Mbps ngoài khoảng hợp lý (${MIN_MBPS} đến ${MAX_MBPS})`);
            mbps = null;
        }
    }
    return { ok: hard.length === 0, hard, mbps, noInternet: false };
}

export interface SpeedReviewInput {
    rules: PhotoRule[];
    first: BundleReading;
    second: { ok: true; reading: BundleReading } | { ok: false; error: string } | null;
}

export interface SpeedReview {
    /** Lý do cấp bộ (số ảnh sai, độ tin cậy thấp, không đọc được lần đo nào, hai lần đọc lệch số lần đo hoặc phân loại, đọc lần hai lỗi): làm mọi lần đo `can_xem`. */
    reasons: string[];
    rows: RowReview[];
}

/** Review các lần đo tốc độ của một bộ, theo từng lần đo; null khi bộ không có ảnh nào loại `speedtest`. Cùng khuôn với `reviewLeave`. */
export function reviewSpeed(input: SpeedReviewInput): SpeedReview | null {
    const { rules, first, second } = input;
    const rule = rules.find((r) => r.id === SPEED_RULE_ID);
    const images = first.images.filter((i) => i.loai === SPEED_RULE_ID);
    if (!rule || images.length === 0) return null;

    const reasons: string[] = [];
    const { toiThieu, toiDa } = rule.soLuongMoiBo;
    if (images.length < toiThieu || images.length > toiDa) reasons.push(`${images.length} ảnh đo tốc độ, cần từ ${toiThieu} đến ${toiDa}`);
    const need = RANK[rule.nguongTinCay];
    const low = images.filter((i) => RANK[i.doTinCay] < need).map((i) => `ảnh ${i.seq}`);
    if (low.length > 0) reasons.push(`độ tin cậy ảnh đo tốc độ dưới ngưỡng "${rule.nguongTinCay}": ${low.join(", ")}`);
    const list = first.extracted[SPEED_RULE_ID]?.lan;
    if (list && RANK[list.doTinCay] < need) reasons.push(`độ tin cậy của danh sách lần đo dưới ngưỡng "${rule.nguongTinCay}"`);
    const rows = speedRowsOf(first);
    if (rows.length === 0) reasons.push("không đọc được lần đo tốc độ nào");

    let disagree: Disagreement[] = [];
    if (second) {
        if (second.ok) {
            disagree = compareReadings(first, second.reading).filter((d) => d.path.startsWith("speedtest.") || d.path.startsWith("anh["));
            if (disagree.some((d) => d.path === "speedtest.lan.length")) reasons.push("hai lần đọc ra số lần đo tốc độ khác nhau");
            if (disagree.some((d) => d.path.startsWith("anh["))) reasons.push("hai lần đọc phân loại ảnh khác nhau");
        } else reasons.push(`đọc lần hai lỗi: ${second.error}`);
    }

    const rowReviews: RowReview[] = rows.map((raw, index) => {
        const own = [...validateSpeedRow(raw).hard];
        for (const d of disagree) if (d.path.startsWith(`speedtest.lan[${index}].`)) own.push(`hai lần đọc lệch ở ${d.path}: ${JSON.stringify(d.first)} khác ${JSON.stringify(d.second)}`);
        const all = [...reasons, ...own];
        return { index, status: all.length > 0 ? "can_xem" : "tu_dong_dat", reasons: all, warnings: [], human: null };
    });
    return { reasons, rows: rowReviews };
}
