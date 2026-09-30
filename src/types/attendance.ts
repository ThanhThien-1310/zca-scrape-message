// VI PHẠM NỘI QUY THỰC TẬP — xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md

/** Một tin "BÁO CÁO ĐIỂM DANH" đã parse — thô, trước khi gộp theo (người, ngày). */
export interface AttendanceEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    tenNV: string;
    noiLamViec: string;
    gioDenGio: number;
    gioDenPhut: number;
}
