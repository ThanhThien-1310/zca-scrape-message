import { fold, splitLabel } from "./parseReport.js";
import { todayVietnam } from "./time.js";

export interface CleaningRoomResult {
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    tenIT: string;
    veSinhSach: boolean;
}

/** Dòng đầu tin phải khớp CHÍNH XÁC "BÁO CÁO CUỐI BUỔI" — không có gì thêm sau (kể cả "DẠY"), để không lẫn
 * với báo cáo cuối buổi dạy của trường học (classifyTitle trong parseReport.ts yêu cầu "DẠY", nên tiêu đề này
 * không còn bị 2 bên cùng nhận nữa, nhưng vẫn giữ so khớp CHÍNH XÁC ở đây làm rào chắn thứ 2). */
export function classifyCleaningTitle(content: string): boolean {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return fold(lines[0] ?? "") === "bao cao cuoi buoi";
}

export function splitSchoolKhuVuc(value: string): { tenTruong: string; khuVuc: string } {
    const idx = value.lastIndexOf(" - ");
    if (idx < 0) return { tenTruong: value.trim(), khuVuc: "" };
    return { tenTruong: value.slice(0, idx).trim(), khuVuc: value.slice(idx + 3).trim() };
}

/**
 * Một tin có thể báo NHIỀU phòng máy (nhiều khối "- Phòng máy: ..." nối tiếp nhau) — mỗi khối ra 1 phần tử.
 * "Tên trường"/"Tên IT" dùng chung cho cả tin (đọc 1 lần, áp cho mọi khối). Một khối không có dòng "Vệ sinh
 * sạch sẽ" bị bỏ qua (không đủ dữ liệu để xếp loại). Giá trị "Phòng máy" giữ NGUYÊN VĂN như trong tin (kể cả
 * phần trong ngoặc) — không cố tách mã phòng, vì cách IT ghi không nhất quán giữa các tin thật (có tin mã
 * phòng nằm trong ngoặc, có tin không ghi mã phòng nào).
 */
export function parseCleaningMessage(content: string): CleaningRoomResult[] {
    const lines = content.normalize("NFC").split(/\r?\n/);
    let tenTruong = "";
    let khuVuc = "";
    let tenIT = "";
    const results: CleaningRoomResult[] = [];
    let current: { phongMay: string; veSinhSach: boolean | null } | null = null;

    const flush = () => {
        if (current && current.veSinhSach !== null && tenTruong) {
            results.push({ tenTruong, khuVuc, phongMay: current.phongMay, tenIT, veSinhSach: current.veSinhSach });
        }
        current = null;
    };

    for (const line of lines) {
        const parsed = splitLabel(line);
        if (!parsed) continue;
        if (parsed.label === "ten truong") {
            ({ tenTruong, khuVuc } = splitSchoolKhuVuc(parsed.value));
        } else if (parsed.label === "ten it") {
            tenIT = parsed.value;
        } else if (parsed.label === "phong may") {
            flush();
            current = { phongMay: parsed.value, veSinhSach: null };
        } else if (parsed.label === "ve sinh sach se" && current) {
            current.veSinhSach = fold(parsed.value) === "co";
        }
    }
    flush();
    return results;
}

/**
 * Ngày dữ liệu vệ sinh nói về. TẠM THỜI (theo yêu cầu 2026-10-01): lấy CHÍNH NGÀY HÔM NAY — tin nhắn của ngày nào thì xuất
 * báo cáo của ngày đó, không lùi ngày. Quy tắc cũ theo hướng dẫn nghiệp vụ (báo cáo làm lùi 1 ngày so với ngày hiện tại,
 * riêng Thứ 2 lấy Thứ 7 vì Chủ nhật không có ghi nhận) đã bỏ khỏi code; muốn khôi phục thì sửa duy nhất hàm này
 * (hôm nay Thứ 2 -> addDays(today, -2), ngày khác -> addDays(today, -1)). KHÔNG dùng Phase/phaseDay.
 */
export function cleaningReportDay(now: number): string {
    return todayVietnam(now);
}
