import { classifyCleaningTitle, splitSchoolKhuVuc } from "./cleaningReport.js";
import { fold, splitLabel } from "./parseReport.js";
import { parseGroupName } from "./schoolArea.js";
import type { SourceMessage } from "../types/index.js";

/** Một trường có báo cáo trong ngày (một dòng của file THỜI GIAN CHƯA BẢO TRÌ). */
export interface MaintenanceEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    /** Cấp học tách từ tên trường ("THCS", "TH", "THPT"...), rỗng khi tên không bắt đầu bằng một cấp hợp lệ. */
    cap: string;
    /** Tên riêng của trường, viết hoa, không kèm cấp và khu vực (như các báo cáo trạng thái khác). */
    tenTruong: string;
    khuVuc: string;
}

/**
 * Nguồn của file THỜI GIAN CHƯA BẢO TRÌ là chính tin "BÁO CÁO CUỐI BUỔI" mà báo cáo VỆ SINH dùng (cùng tiêu đề, cùng dòng "Tên trường: THCS Vĩnh Lộc B - BC").
 * Chỉ cần dòng "Tên trường"; tin thiếu dòng đó trả về null. Khu vực lấy sau dấu " - " của dòng đó.
 */
export function parseMaintenanceMessage(content: string): { cap: string; tenTruong: string; khuVuc: string } | null {
    if (!classifyCleaningTitle(content)) return null;
    for (const line of content.normalize("NFC").split(/\r?\n/)) {
        const parsed = splitLabel(line);
        if (!parsed || parsed.label !== "ten truong") continue;
        const { tenTruong, khuVuc } = splitSchoolKhuVuc(parsed.value);
        if (!tenTruong) return null;
        const school = parseGroupName(tenTruong).truong;
        return { cap: school?.capHoc ?? "", tenTruong: school?.tenRieng || tenTruong.toUpperCase(), khuVuc: khuVuc.trim().toUpperCase() };
    }
    return null;
}

/**
 * Mỗi TRƯỜNG một dòng (ngày báo cáo của trường là ngày hôm nay, các cột PM chưa có nguồn): các tin "BÁO CÁO CUỐI BUỔI" thỏa `include(ts)` được gom theo (tên trường,
 * khu vực); một trường báo nhiều lần hay nhiều phòng chỉ ra một dòng, giữ tin SỚM NHẤT. Thứ tự là thứ tự tin gửi.
 */
export function maintenanceEntries(messages: SourceMessage[], include: (ts: number) => boolean): MaintenanceEntry[] {
    const byKey = new Map<string, MaintenanceEntry>();
    for (const m of [...messages].sort((a, b) => a.ts - b.ts)) {
        if (!include(m.ts)) continue;
        const parsed = parseMaintenanceMessage(m.content);
        if (!parsed) continue;
        const key = `${fold(parsed.tenTruong)}|${fold(parsed.khuVuc)}`;
        if (!byKey.has(key)) byKey.set(key, { maNhom: m.groupId, maTinNhan: m.msgId, thoiGian: m.ts, ...parsed });
    }
    return [...byKey.values()];
}
