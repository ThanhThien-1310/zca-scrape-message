import type { Cell, CoSoVatChat, Report } from "../types/index.js";

/** Đọc `Thiếu`/`Lỗi` (và ghi chú của Lỗi) từ mục `soLuong` của một cơ sở vật chất; thiếu mục nào trả về null. */
function quantity(facility: CoSoVatChat | undefined, loai: "Thieu" | "Loi"): { so: number | null; ghiChu: string | null } {
    const entry = facility?.soLuong?.find((s) => s.loai === loai);
    return { so: entry?.so ?? null, ghiChu: entry?.ghiChu ?? null };
}

const findFacility = (r: Report, loai: CoSoVatChat["loai"]): CoSoVatChat | undefined => r.data.coSoVatChat.find((f) => f.loai === loai);

/** Thứ tự hiển thị XẾP LOẠI: Tốt, Bình thường, Kém — T, B, K liền nhau thay vì lẫn lộn theo thứ tự báo cáo tới. */
const GRADE_ORDER: Record<string, number> = { T: 0, B: 1, K: 2 };
function bySortedGrade<T extends { grade: string }>(entries: T[]): T[] {
    return [...entries].sort((a, b) => (GRADE_ORDER[a.grade] ?? 3) - (GRADE_ORDER[b.grade] ?? 3));
}

/** 0 máy lỗi = A (ổn định), 1-5 = B, 6-9 = C, >=10 = D — đúng bảng CHÚ GIẢI của file mẫu MÁY TÍNH. */
export function mayTinhGrade(loi: number | null): "A" | "B" | "C" | "D" | null {
    if (loi === null) return null;
    if (loi === 0) return "A";
    if (loi <= 5) return "B";
    if (loi <= 9) return "C";
    return "D";
}

export function buildBoSungRows(reports: Report[]): Array<Record<string, Cell>> {
    const rows: Array<Record<string, Cell>> = [];
    let stt = 0;
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const mayTinh = findFacility(r, "MayTinh");
        const thieu = quantity(mayTinh, "Thieu").so;
        const loi = quantity(mayTinh, "Loi").so;
        if (thieu === null || loi === null || thieu - loi <= 0) continue;
        stt++;
        rows.push({ A: stt, B: r.data.truong?.capHoc ?? "", C: r.data.truong?.tenRieng ?? "", D: r.data.khuVuc ?? "", J: r.data.phongMay, L: thieu, M: thieu });
    }
    return rows;
}

export function buildLoaRows(reports: Report[]): Array<Record<string, Cell>> {
    const entries: Array<{ grade: string; row: Record<string, Cell> }> = [];
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const amThanh = findFacility(r, "AmThanh");
        if (!amThanh || amThanh.xepLoai === null) continue;
        entries.push({ grade: amThanh.xepLoai, row: { B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", D: r.data.phongMay, G: amThanh.xepLoai } });
    }
    return bySortedGrade(entries).map((e, i) => ({ A: i + 1, ...e.row }));
}

function buildNetStatusRows(reports: Report[], facilityLoai: "Internet" | "NetSupport", category: "internet" | "netsupport", perMessage: Map<string, number>): Array<Record<string, Cell>> {
    const entries: Array<{ grade: string; row: Record<string, Cell> }> = [];
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const facility = findFacility(r, facilityLoai);
        if (!facility || facility.xepLoai === null) continue;
        const soLan = perMessage.get(`${r.maTinNhan}|${category}`) ?? 0;
        entries.push({ grade: facility.xepLoai, row: { B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", D: r.data.phongMay, G: soLan, I: facility.xepLoai } });
    }
    return bySortedGrade(entries).map((e, i) => ({ A: i + 1, ...e.row }));
}

export function buildInternetRows(reports: Report[], perMessage: Map<string, number>): Array<Record<string, Cell>> {
    return buildNetStatusRows(reports, "Internet", "internet", perMessage);
}

export function buildNetSupportRows(reports: Report[], perMessage: Map<string, number>): Array<Record<string, Cell>> {
    return buildNetStatusRows(reports, "NetSupport", "netsupport", perMessage);
}

export function buildMayTinhRows(reports: Report[]): Array<Record<string, Cell>> {
    const rows: Array<Record<string, Cell>> = [];
    let stt = 0;
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const mayTinh = findFacility(r, "MayTinh");
        if (!mayTinh) continue;
        const loi = quantity(mayTinh, "Loi");
        const thieu = quantity(mayTinh, "Thieu");
        stt++;
        // Ghi chú trong ngoặc của "Tổng số máy bị lỗi: N (...)" vào HIỆN TRẠNG, không phải GHI CHÚ (theo yêu cầu của người dùng).
        rows.push({ A: stt, B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", D: r.data.phongMay, F: loi.so, G: thieu.so, I: loi.ghiChu, K: mayTinhGrade(loi.so) });
    }
    return rows;
}
