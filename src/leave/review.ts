import { vietnamDay } from "../lesson/time.js";
import { compareReadings } from "../vision/review.js";
import { compareYmd, isoOf, parseIso } from "./dates.js";
import { validateLeaveRow } from "./validate.js";
import type { BundleReading, Confidence, Disagreement, Manifest, PhotoRule, Review, ReviewStatus, RowReview } from "../types/index.js";

export const LEAVE_RULE_ID = "leave";
/** Các cột của một dòng nghỉ phép (trùng `photo-rules/leave.json`); người xem chỉ được sửa các cột này. */
export const LEAVE_COLUMNS = ["hoTen", "tuGio", "tuThu", "tuNgay", "denGio", "denThu", "denNgay", "soNgay", "lyDo"] as const;

const RANK: Record<Confidence, number> = { thap: 0, vua: 1, cao: 2 };

/**
 * Các dòng của danh sách `dong` trong kết quả đọc, GIỮ NGUYÊN vị trí: phần tử không phải đối tượng (chữ, null, số, mảng) thành dòng rỗng `{}` ở đúng chỗ
 * của nó (dòng rỗng trượt luật cứng nên `can_xem`). Nhờ vậy chỉ số ở đây (`RowReview.index`) trùng chỉ số `leave.dong[i]` của `flattenReading`.
 */
export function leaveRowsOf(reading: BundleReading): Array<Record<string, unknown>> {
    const v = reading.extracted[LEAVE_RULE_ID]?.dong?.value;
    return Array.isArray(v) ? v.map((r) => (typeof r === "object" && r !== null && !Array.isArray(r) ? (r as Record<string, unknown>) : {})) : [];
}

/**
 * Trạng thái của cả bộ = trạng thái xấu nhất của các dòng: còn dòng `can_xem` thì `can_xem`; bỏ cả bộ hoặc mọi dòng thì `da_bo`; có người sửa thì
 * `da_sua`; có người xác nhận thì `da_xac_nhan`; còn lại `tu_dong_dat`. Bộ không có dòng nào thì theo lý do cấp bộ.
 */
export function bundleStatus(rows: RowReview[], reasons: string[], dismissed = false): ReviewStatus {
    if (dismissed) return "da_bo";
    if (rows.length === 0) return reasons.length > 0 ? "can_xem" : "tu_dong_dat";
    if (rows.some((r) => r.status === "can_xem")) return "can_xem";
    if (rows.every((r) => r.status === "da_bo")) return "da_bo";
    if (rows.some((r) => r.status === "da_sua")) return "da_sua";
    if (rows.some((r) => r.status === "da_xac_nhan")) return "da_xac_nhan";
    return "tu_dong_dat";
}

export interface ReviewLeaveInput {
    rules: PhotoRule[];
    manifest: Manifest;
    first: BundleReading;
    /** `null` khi không đọc lần hai; `{ ok: false }` khi lần hai lỗi. */
    second: { ok: true; reading: BundleReading } | { ok: false; error: string } | null;
    cfg: { maxPastDays: number; maxFutureDays: number };
}

/**
 * Review của MỘT bộ ảnh nghỉ phép, theo từng dòng. Bộ không có ảnh nào loại `leave` thì không có gì để xem (`tu_dong_dat`, không dòng).
 * Lý do CẤP BỘ (số ảnh sai, độ tin cậy dưới ngưỡng, không đọc được dòng nào, hai lần đọc lệch số dòng hoặc phân loại ảnh, đọc lần hai lỗi) làm MỌI dòng
 * `can_xem`. Lý do của riêng một dòng: luật cứng của `validateLeaveRow` và các ô mà hai lần đọc lệch nhau ở đúng dòng đó.
 */
export function reviewLeave(input: ReviewLeaveInput): Review {
    const { rules, manifest, first, second, cfg } = input;
    const rule = rules.find((r) => r.id === LEAVE_RULE_ID);
    const secondRead = { ran: second !== null, disagree: [] as Disagreement[] };
    const leaveImages = first.images.filter((i) => i.loai === LEAVE_RULE_ID);
    if (!rule || leaveImages.length === 0) return { status: "tu_dong_dat", reasons: [], notes: [], rows: [], secondRead };

    const reasons: string[] = [];
    const notes: string[] = [];
    const { toiThieu, toiDa } = rule.soLuongMoiBo;
    if (leaveImages.length < toiThieu || leaveImages.length > toiDa) reasons.push(`${leaveImages.length} ảnh nghỉ phép, cần từ ${toiThieu} đến ${toiDa}`);
    const need = RANK[rule.nguongTinCay];
    const lowImages = leaveImages.filter((i) => RANK[i.doTinCay] < need).map((i) => `ảnh ${i.seq}`);
    if (lowImages.length > 0) reasons.push(`độ tin cậy ảnh dưới ngưỡng "${rule.nguongTinCay}": ${lowImages.join(", ")}`);
    const list = first.extracted[LEAVE_RULE_ID]?.dong;
    if (list && RANK[list.doTinCay] < need) reasons.push(`độ tin cậy của danh sách dòng nghỉ dưới ngưỡng "${rule.nguongTinCay}"`);
    const rows = leaveRowsOf(first);
    if (rows.length === 0) reasons.push("không đọc được dòng nghỉ phép nào");

    if (second) {
        if (second.ok) {
            secondRead.disagree = compareReadings(first, second.reading);
            if (secondRead.disagree.some((d) => d.path === "leave.dong.length")) reasons.push("hai lần đọc ra số dòng nghỉ phép khác nhau");
            if (secondRead.disagree.some((d) => d.path.startsWith("anh["))) reasons.push("hai lần đọc phân loại ảnh khác nhau");
            for (const d of secondRead.disagree) {
                if (/^leave\.(ngayBaoCao|nguoiBaoCao|boPhan)$/.test(d.path)) notes.push(`hai lần đọc lệch ở ${d.path}: ${JSON.stringify(d.first)} khác ${JSON.stringify(d.second)}`);
            }
        } else {
            reasons.push(`đọc lần hai lỗi: ${second.error}`);
        }
    }

    const sendDay = vietnamDay(manifest.firstTs);
    const report = parseIso(first.extracted[LEAVE_RULE_ID]?.ngayBaoCao?.value);
    const send = parseIso(sendDay);
    if (report && send && Math.abs(compareYmd(report, send)) > 2) notes.push(`ngày báo cáo trên ảnh (${isoOf(report)}) lệch hơn 2 ngày so với ngày gửi (${isoOf(send)})`);

    const rowReviews: RowReview[] = rows.map((raw, index) => {
        const verdict = validateLeaveRow(raw, { sendDay, ...cfg });
        const own = [...verdict.hard];
        for (const d of secondRead.disagree) {
            if (d.path.startsWith(`leave.dong[${index}].`)) own.push(`hai lần đọc lệch ở ${d.path}: ${JSON.stringify(d.first)} khác ${JSON.stringify(d.second)}`);
        }
        const all = [...reasons, ...own];
        return { index, status: all.length > 0 ? "can_xem" : "tu_dong_dat", reasons: all, warnings: verdict.warnings, human: null };
    });
    return { status: bundleStatus(rowReviews, reasons), reasons, notes, rows: rowReviews, secondRead };
}
