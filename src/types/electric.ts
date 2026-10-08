// TÌNH TRẠNG ĐIỆN — tin "LỖI ĐIỆN" của IT, xem src/lesson/electricReport.ts

/** Một dòng dữ liệu điện (= một "Phòng Máy" trong một tin "LỖI ĐIỆN"). */
export interface ElectricEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    /** Nội dung "Tình trạng" như IT viết, có thể rỗng. */
    tinhTrang: string;
}
