import { parseHour, parseIso } from "./dates.js";
import { minutesRowsOf } from "../minutes/review.js";
import { speedRowsOf } from "../speed/review.js";
import { bundleStatus, LEAVE_COLUMNS, leaveRowsOf } from "./review.js";
import type { BundleReading, Manifest, Review, RowReview } from "../types/index.js";

/**
 * Review lớp 3: người xem từng dòng nghỉ phép. Xác nhận (`da_xac_nhan`) chỉ cho dòng đang `can_xem`; sửa (`da_sua`, kèm các cột sửa) và bỏ (`da_bo`)
 * làm được với dòng bất kỳ (ví dụ sửa một tên đọc sai nhưng không lỗi), và thay thế lần xem trước của dòng đó. Hàm thuần: trả `Review` mới.
 */
export type HumanAction = "xac_nhan" | "sua" | "bo";

const DATE_COLUMNS = new Set(["tuNgay", "denNgay"]);
const HOUR_COLUMNS = new Set(["tuGio", "denGio"]);
const WEEKDAY_COLUMNS = new Set(["tuThu", "denThu"]);

/** Số nguyên thập phân chặt (không nhận 0x10, 1e2, 2.5, khoảng trắng giữa chừng). */
const intOf = (t: string): number | null => (/^-?\d+$/.test(t) ? Number(t) : null);

/** Tách `cột=giá trị` và kiểm tra NỘI DUNG giá trị theo cột (ngày thật, giờ đọc được, thứ 1..7, số ngày 0..366), để sửa của người không đưa dữ liệu hỏng vào Excel. */
export function parseFix(arg: string): { column: string; value: unknown } {
    const i = arg.indexOf("=");
    if (i <= 0) throw new Error(`Sửa phải có dạng cột=giá trị (ví dụ soNgay=2), nhận được "${arg}".`);
    const column = arg.slice(0, i).trim();
    if (!(LEAVE_COLUMNS as readonly string[]).includes(column)) throw new Error(`Cột "${column}" không có (các cột: ${LEAVE_COLUMNS.join(", ")}).`);
    const raw = arg.slice(i + 1);
    const t = raw.trim();
    if (DATE_COLUMNS.has(column)) {
        if (parseIso(t) === null) throw new Error(`Cột "${column}" phải là ngày thật dạng YYYY-MM-DD (ví dụ 2026-10-03), nhận được "${raw}".`);
        return { column, value: t };
    }
    if (HOUR_COLUMNS.has(column)) {
        if (parseHour(t) === null) throw new Error(`Cột "${column}" phải là giờ đọc được (ví dụ 8:00 hoặc 13:30), nhận được "${raw}".`);
        return { column, value: t };
    }
    if (WEEKDAY_COLUMNS.has(column)) {
        if (t === "" || t === "null") return { column, value: null };
        const n = intOf(t);
        if (n === null || n < 1 || n > 7) throw new Error(`Cột "${column}" phải là số nguyên từ 1 đến 7 (2 là thứ hai, 7 là thứ bảy) hoặc null, nhận được "${raw}".`);
        return { column, value: n };
    }
    if (column === "soNgay") {
        if (t === "" || t === "null") return { column, value: null };
        const n = intOf(t);
        if (n === null || n < 0 || n > 366) throw new Error(`Cột "${column}" phải là số nguyên từ 0 đến 366 hoặc null, nhận được "${raw}".`);
        return { column, value: n };
    }
    if (column === "hoTen") {
        if (t === "") throw new Error(`Cột "${column}" không được để trống.`);
        return { column, value: t };
    }
    return { column, value: t };
}

export function applyHumanRow(review: Review, index: number, action: HumanAction, corrections: Record<string, unknown>, now: number): Review {
    const row = review.rows.find((r) => r.index === index);
    if (!row) throw new Error(`Bộ này không có dòng ${index} (có: ${review.rows.map((r) => r.index).join(", ") || "không dòng nào"}).`);
    const count = Object.keys(corrections).length;
    if (action === "sua" && count === 0) throw new Error("Sửa cần ít nhất một --fix cột=giá trị.");
    if (action !== "sua" && count > 0) throw new Error("Xác nhận hoặc bỏ không kèm sửa; dùng --fix để sửa.");
    if (action === "xac_nhan" && row.status !== "can_xem") throw new Error(`Dòng ${index} đang ${row.status}, không cần xác nhận.`);
    const merged = action === "sua" ? { ...(row.human?.action === "sua" ? row.human.corrections : {}), ...corrections } : {};
    const status = action === "xac_nhan" ? "da_xac_nhan" : action === "sua" ? "da_sua" : "da_bo";
    const rows = review.rows.map((r): RowReview => (r.index === index ? { ...r, status, human: { at: now, action, corrections: merged } } : r));
    return { ...review, rows, status: bundleStatus([...rows, ...(review.speed?.rows ?? []), ...(review.minutes?.rows ?? [])], review.reasons, review.dismissed) };
}

/** Người xem bỏ cả bộ (ví dụ ảnh không phải bảng nghỉ phép, hoặc bộ không có dòng nào đọc được). */
export function dismissBundle(review: Review): Review {
    return { ...review, dismissed: true, status: "da_bo" };
}

/** Dòng đã đọc, đè các sửa của người xem (nếu có). */
export function finalRow(raw: Record<string, unknown>, row: RowReview): Record<string, unknown> {
    return { ...raw, ...(row.human?.corrections ?? {}) };
}

const cell = (v: unknown): string => (v === null || v === undefined || v === "" ? "?" : String(v));

export function describeBundle(manifest: Manifest, reading: BundleReading, review: Review): string[] {
    const lines = [`Bộ ${manifest.bundleId} — nhóm ${manifest.groupName}, người gửi ${manifest.sender.name || manifest.sender.id}, trạng thái ${review.status}`];
    lines.push(`Ảnh (${manifest.images.length}): ${manifest.images.map((i) => `${i.file} (${reading.images.find((r) => r.seq === i.seq)?.loai ?? "?"})`).join(", ")}`);
    for (const r of review.reasons) lines.push(`  ! cả bộ: ${r}`);
    for (const n of review.notes) lines.push(`  ~ ${n}`);
    const rows = leaveRowsOf(reading);
    for (const rr of review.rows) {
        const raw = finalRow(rows[rr.index] ?? {}, rr);
        lines.push(`Dòng ${rr.index} [${rr.status}] ${cell(raw.hoTen)}: ${cell(raw.tuNgay)} ${cell(raw.tuGio)} đến ${cell(raw.denNgay)} ${cell(raw.denGio)} | thứ ${cell(raw.tuThu)} đến ${cell(raw.denThu)} | ${cell(raw.soNgay)} ngày | ${cell(raw.lyDo)}`);
        for (const reason of rr.reasons.filter((x) => !review.reasons.includes(x))) lines.push(`    - ${reason}`);
        for (const w of rr.warnings) lines.push(`    ~ ${w}`);
    }
    const speedRows = speedRowsOf(reading);
    for (const rr of review.speed?.rows ?? []) {
        const raw = { ...(speedRows[rr.index] ?? {}), ...(rr.human?.corrections ?? {}) };
        lines.push(`Lần đo tốc độ ${rr.index} [${rr.status}]: ${cell(raw.tocDo)} ${cell(raw.donVi)}${raw.khongCoMang === true ? " (ảnh báo KHÔNG CÓ MẠNG)" : ""}`);
        for (const reason of rr.reasons.filter((x) => !(review.speed?.reasons ?? []).includes(x))) lines.push(`    - ${reason}`);
    }
    for (const r of review.speed?.reasons ?? []) lines.push(`  ! đo tốc độ, cả bộ: ${r}`);
    const minutesRows = minutesRowsOf(reading);
    for (const rr of review.minutes?.rows ?? []) {
        const raw = { ...(minutesRows[rr.index] ?? {}), ...(rr.human?.corrections ?? {}) };
        lines.push(`Biên bản ${rr.index} [${rr.status}]: ${cell(raw.tieuDe)} | công ty: ${cell(raw.daiDienCty)} | trường: ${cell(raw.daiDienTruong)} (${cell(raw.boPhanTruong)})${raw.laTrangTiep === true ? " [trang tiếp theo]" : ""}`);
        for (const reason of rr.reasons.filter((x) => !(review.minutes?.reasons ?? []).includes(x))) lines.push(`    - ${reason}`);
    }
    for (const r of review.minutes?.reasons ?? []) lines.push(`  ! biên bản, cả bộ: ${r}`);
    return lines;
}
