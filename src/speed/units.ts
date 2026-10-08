/**
 * Đổi tốc độ mạng đọc từ ảnh về Mbps (đơn vị của báo cáo TRẠNG THÁI KẾT NỐI INTERNET). Agent chỉ chép số và đơn vị đúng như trong ảnh; việc quy đổi do mã làm,
 * để không phụ thuộc agent tính nhẩm: Kbps chia 1000, Mbps giữ nguyên, Gbps nhân 1000. Chấp nhận cách viết "Kbps", "kb/s", "Kbit/s", "Mb/s", "Mbit/s", "gbps"
 * (không phân biệt hoa thường và khoảng trắng). Đơn vị lạ (kể cả MB/s hay KB/s tính bằng byte, vốn khác bit) hoặc thiếu thì trả null để dòng chờ xem.
 */
const FACTOR: Record<string, number> = { kbps: 0.001, mbps: 1, gbps: 1000 };

function unitKey(unit: string | null | undefined): string | null {
    if (typeof unit !== "string") return null;
    // "MB/s", "KB/s", "GB/s" (chữ B HOA, có "/s") là BYTE trên giây (Windows hiện kiểu này), gấp 8 lần bit: không tự đổi, để dòng chờ xem. "Mbps", "MBPS", "Mb/s" là bit.
    if (/^[KMG]B\/s$/.test(unit.trim())) return null;
    const u = unit.toLowerCase().replace(/\s+/g, "").replace(/bit/g, "b").replace(/\/s$/, "ps");
    return u in FACTOR ? u : null;
}

/** Số Mbps (làm tròn 2 chữ số thập phân), hoặc null khi không đổi được. */
export function toMbps(value: number, unit: string | null | undefined): number | null {
    const key = unitKey(unit);
    if (key === null || !Number.isFinite(value) || value < 0) return null;
    return Math.round(value * FACTOR[key] * 100) / 100;
}

export type SpeedGrade = "A" | "B" | "C" | "D";

/** A từ 20 Mbps trở lên, B từ 10, C dưới 10. (D = không có internet, không suy ra từ tốc độ.) */
export function gradeOfMbps(mbps: number): "A" | "B" | "C" {
    return mbps >= 20 ? "A" : mbps >= 10 ? "B" : "C";
}
