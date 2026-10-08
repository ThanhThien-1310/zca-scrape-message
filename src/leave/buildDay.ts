import { createHash } from "node:crypto";
import { addDays } from "../lesson/time.js";
import { buildLeaveCells, type LeaveFill } from "./cells.js";
import { collectLeaves, type PendingRow } from "./collect.js";
import type { RosterRow } from "./roster.js";
import type { LeaveRowSource } from "./sources.js";
import type { HeaderCell } from "../lesson/statusReportLayout.js";

/** Mọi thứ cần từ bên ngoài (đĩa, file mẫu), truyền vào để test được. Bản thật: `realIo.ts`. */
export interface LeaveIO {
    readRoster(): RosterRow[];
    loadRows(sinceDay: string): LeaveRowSource[];
    countUnread(sinceDay: string): number;
}

export interface LeaveDayCfg {
    lookbackDays: number;
    maxPastDays: number;
    maxFutureDays: number;
}

export interface LeaveDay extends LeaveFill {
    /** Điều cần người biết (kỳ nghỉ bị thay, bị bỏ...), không phải lỗi. */
    notes: string[];
    pending: PendingRow[];
    /** Vấn đề cần người xử lý: ảnh chưa đọc, tên không có trong danh sách, dòng chờ xem. */
    warnings: string[];
    /** Chữ ký của các ô sẽ ghi; đổi khi bất kỳ ô nào đổi. */
    signature: string;
}

/** Chữ ký nội dung của các ô sẽ ghi vào file: cùng ô cùng giá trị ra cùng chữ ký; không ô nào cũng có chữ ký riêng. */
export function leaveSignature(cells: HeaderCell[]): string {
    return createHash("sha1").update(JSON.stringify(cells.map((c) => [c.ref, c.value]))).digest("hex");
}

/**
 * Mọi thứ của báo cáo nghỉ phép cho MỘT ngày `day` (`YYYY-MM-DD`): đọc danh sách tên, các dòng đã đọc trong `lookbackDays` ngày gần nhất, chọn kỳ nghỉ còn hiệu
 * lực, dựng các ô cần ghi cùng cảnh báo. Một đường duy nhất cho `fill:leave-report`, `bot:total` và `leave:show`. Có thể ném lỗi (ví dụ thiếu file mẫu): người gọi
 * quyết định coi đó là lỗi hay cảnh báo.
 */
export function leaveForDay(day: string, io: LeaveIO, cfg: LeaveDayCfg): LeaveDay {
    const roster = io.readRoster();
    const sinceDay = addDays(day, -cfg.lookbackDays);
    const collected = collectLeaves(io.loadRows(sinceDay), day, cfg);
    const fill = buildLeaveCells(roster, collected.leaves);
    const warnings: string[] = [];
    const unread = io.countUnread(sinceDay);
    if (unread > 0) warnings.push(`${unread} bộ ảnh nghỉ phép chưa đọc`);
    for (const u of fill.unmatched) {
        const near = u.suggestions.length > 0 ? `, gần giống: ${u.suggestions.join(", ")}` : "";
        warnings.push(`${u.hoTen} (${u.ngay}) không có trong danh sách của file mẫu${near}; sửa tên bằng: npm run photos:review -- --bundle ${u.bundleId} --row ${u.rowIndex} --fix hoTen=...`);
    }
    if (collected.pending.length > 0) warnings.push(`${collected.pending.length} dòng nghỉ phép đang chờ xem (npm run photos:review -- --list)`);
    return { ...fill, notes: collected.notes, pending: collected.pending, warnings, signature: leaveSignature(fill.headerCells) };
}
