import type { LeaveDay } from "./buildDay.js";

/** Các dòng của `npm run leave:show`: những gì sẽ được điền, những gì chưa khớp danh sách, dòng chờ xem, ghi chú và cảnh báo. Hàm thuần. */
export function formatLeaveDay(day: string, d: LeaveDay): string[] {
    const lines: string[] = [];
    if (d.filled.length === 0) lines.push(`Ngày ${day}: không có kỳ nghỉ nào còn hiệu lực để điền.`);
    else {
        lines.push(`Ngày ${day}: ${d.filled.length} dòng sẽ được điền:`);
        for (const f of d.filled) lines.push(`  dòng ${f.row} ${f.name}: NGÀY ${f.ngay} | BUỔI ${f.buoi}`);
    }
    if (d.unmatched.length > 0) {
        lines.push("Chưa khớp danh sách (không điền):");
        for (const u of d.unmatched) lines.push(`  ${u.hoTen} (${u.ngay})${u.suggestions.length > 0 ? `, gần giống: ${u.suggestions.join(", ")}` : ""} (bộ ${u.bundleId}, dòng ${u.rowIndex})`);
    }
    if (d.pending.length > 0) {
        lines.push("Đang chờ xem (chưa điền):");
        for (const p of d.pending) lines.push(`  ${p.hoTen} (bộ ${p.bundleId}, dòng ${p.rowIndex}): ${p.reasons[0] ?? "chờ người xem"}`);
    }
    for (const n of d.notes) lines.push(`Ghi chú: ${n}`);
    for (const w of d.warnings) lines.push(`Cảnh báo: ${w}`);
    return lines;
}
