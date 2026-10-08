import type { FileLayout } from "../lesson/statusReportLayout.js";

/**
 * Mẫu LỊCH NGHỈ PHÉP KỸ THUẬT (`data/mau bao cao new/LICH NGHI PHEP KY THUAT.xlsx`, sheet `BAO CAO`): danh sách tên ở cột B từ dòng 4, dòng TỔNG ở
 * dòng 16. Điền TẠI CHỖ (`inPlace`): bot chỉ ghi cột NGÀY (F, chữ) và BUỔI (E) của dòng khớp tên; mọi ô khác (STT, SỐ NGÀY, XẾP LOẠI, K/C và
 * `H2 =TODAY()` đều là công thức hay chữ có sẵn) giữ nguyên. Giá trị dòng/cột đo trực tiếp trên mẫu; có test đối chiếu với file thật.
 */
export const LEAVE_LAYOUT: FileLayout = {
    templateFile: "LICH NGHI PHEP KY THUAT.xlsx",
    sheet: "BAO CAO",
    firstDataRow: 4,
    totalRowBefore: 16,
    lastColumn: "M",
    inPlace: true,
};

export const LEAVE_NGAY_COLUMN = "F";
export const LEAVE_BUOI_COLUMN = "E";
