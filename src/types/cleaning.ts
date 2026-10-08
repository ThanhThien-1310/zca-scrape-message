// VỆ SINH PHÒNG MÁY — xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md

/** Một dòng dữ liệu vệ sinh (= một "Phòng máy" trong một tin "BÁO CÁO CUỐI BUỔI"). */
export interface CleaningEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    tenIT: string;
    veSinhSach: boolean;
}
