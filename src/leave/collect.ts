import { compareYmd, dayNumber, parseIso } from "./dates.js";
import { ngayText } from "./buoi.js";
import { normalizeName } from "./names.js";
import { validateLeaveRow, type ParsedLeave } from "./validate.js";
import type { LeaveRowSource } from "./sources.js";
import type { ReviewStatus } from "../types/index.js";

/** Một kỳ nghỉ còn hiệu lực của một người (đã chọn). `key` là tên đã chuẩn hóa. */
export interface ActiveLeave {
    key: string;
    hoTen: string;
    parsed: ParsedLeave;
    sentTs: number;
    bundleId: string;
    rowIndex: number;
}

/** Một dòng đang chờ người xem (`can_xem`), để báo; chưa dùng cho Excel. */
export interface PendingRow {
    bundleId: string;
    rowIndex: number;
    sentTs: number;
    hoTen: string;
    reasons: string[];
}

export interface CollectResult {
    leaves: ActiveLeave[];
    /** Điều cần người biết nhưng không chặn: kỳ nghỉ bị thay, bị bỏ vì một người nhiều kỳ trong một ảnh, có bản mới hơn đang chờ xem, dòng không đọc được. */
    notes: string[];
    pending: PendingRow[];
}

const USABLE = new Set<ReviewStatus>(["tu_dong_dat", "da_xac_nhan", "da_sua"]);

const period = (l: ActiveLeave): string => ngayText(l.parsed.tu, l.parsed.den);
const samePeriod = (a: ActiveLeave, b: ActiveLeave): boolean =>
    dayNumber(a.parsed.tu) === dayNumber(b.parsed.tu) && dayNumber(a.parsed.den) === dayNumber(b.parsed.den) && a.parsed.tuGio === b.parsed.tuGio && a.parsed.denGio === b.parsed.denGio;

/**
 * Chọn kỳ nghỉ của hôm nay (`today`, `YYYY-MM-DD`) từ mọi dòng đã đọc:
 *  1. chỉ dòng `tu_dong_dat`, `da_xac_nhan`, `da_sua` có ngày kết thúc từ hôm nay trở đi (kỳ nghỉ kết thúc đúng hôm nay vẫn giữ, hôm qua thì bỏ);
 *  2. một người có nhiều kỳ trong CÙNG một ảnh (file chỉ có một ô): giữ kỳ có ngày kết thúc nhỏ nhất, kỳ còn lại ghi vào `notes`;
 *  3. một người có ở nhiều ảnh: lấy ảnh mới nhất; ảnh mới thay một kỳ khác đi thì ghi `notes`; nếu ảnh mới hơn có dòng của người đó còn đang `can_xem`
 *     thì vẫn dùng kỳ tốt cũ và ghi `notes`.
 * Kết quả sắp theo tên đã chuẩn hóa. Hàm thuần.
 */
export function collectLeaves(rows: LeaveRowSource[], today: string, cfg: { maxPastDays: number; maxFutureDays: number }): CollectResult {
    const todayYmd = parseIso(today);
    if (!todayYmd) throw new Error(`collectLeaves: ngày hôm nay không hợp lệ: ${today}`);
    const notes: string[] = [];
    const pending: PendingRow[] = [];
    const candidates: ActiveLeave[] = [];

    for (const r of rows) {
        const name = typeof r.raw.hoTen === "string" ? r.raw.hoTen.trim().replace(/\s+/g, " ") : "";
        if (r.status === "can_xem") {
            pending.push({ bundleId: r.bundleId, rowIndex: r.rowIndex, sentTs: r.sentTs, hoTen: name || "?", reasons: r.reasons });
            continue;
        }
        if (!USABLE.has(r.status)) continue;
        const { parsed } = validateLeaveRow(r.raw, { sendDay: r.sendDay, ...cfg });
        if (!parsed) {
            notes.push(`bỏ dòng ${r.rowIndex} của bộ ${r.bundleId}: không đọc được tên hoặc ngày`);
            continue;
        }
        if (compareYmd(parsed.den, todayYmd) < 0) continue;
        candidates.push({ key: normalizeName(parsed.hoTen), hoTen: parsed.hoTen, parsed, sentTs: r.sentTs, bundleId: r.bundleId, rowIndex: r.rowIndex });
    }

    const perBundle = new Map<string, ActiveLeave[]>();
    for (const c of candidates) {
        const k = `${c.bundleId}|${c.key}`;
        const list = perBundle.get(k);
        if (list) list.push(c);
        else perBundle.set(k, [c]);
    }
    const afterBundle: ActiveLeave[] = [];
    for (const list of perBundle.values()) {
        list.sort((a, b) => compareYmd(a.parsed.den, b.parsed.den) || compareYmd(a.parsed.tu, b.parsed.tu) || a.rowIndex - b.rowIndex);
        afterBundle.push(list[0]);
        for (const dropped of list.slice(1)) notes.push(`${list[0].hoTen}: bộ ${list[0].bundleId} có nhiều kỳ nghỉ nhưng file chỉ có một ô: giữ ${period(list[0])}, bỏ ${period(dropped)} (cần xem)`);
    }

    const perPerson = new Map<string, ActiveLeave[]>();
    for (const c of afterBundle) {
        const list = perPerson.get(c.key);
        if (list) list.push(c);
        else perPerson.set(c.key, [c]);
    }
    const leaves: ActiveLeave[] = [];
    for (const [key, list] of perPerson) {
        list.sort((a, b) => b.sentTs - a.sentTs || b.bundleId.localeCompare(a.bundleId));
        const chosen = list[0];
        leaves.push(chosen);
        for (const older of list.slice(1)) {
            if (!samePeriod(older, chosen)) notes.push(`${chosen.hoTen}: ảnh ${chosen.bundleId} thay kỳ nghỉ ${period(older)} của ảnh ${older.bundleId} bằng ${period(chosen)}`);
        }
        if (pending.some((p) => normalizeName(p.hoTen) === key && p.sentTs > chosen.sentTs)) notes.push(`${chosen.hoTen}: có bản mới hơn đang chờ xem, tạm dùng kỳ nghỉ ${period(chosen)}`);
    }
    leaves.sort((a, b) => a.key.localeCompare(b.key));
    return { leaves, notes, pending };
}
