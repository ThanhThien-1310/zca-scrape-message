import { splitSchoolKhuVuc } from "./cleaningReport.js";
import { parseInternetMessage } from "./internetSpeedReport.js";
import { fold, splitLabel } from "./parseReport.js";
import { vietnamDay } from "./time.js";
import type { MinutesForMessage, MinutesItem } from "../minutes/measures.js";
import type { SourceMessage } from "../types/index.js";

/** Một biên bản của một trường (một dòng của file QUẢN LÝ BIÊN BẢN). */
export interface MinutesEntry {
    /** Tên trường như ghi trong tin ("THCS Vĩnh Lộc B"), giống báo cáo vệ sinh (mẫu không có cột CẤP). */
    tenTruong: string;
    khuVuc: string;
    /** Các phòng máy của tin, nối bằng dấu phẩy ("PM1,PM3"). */
    pm: string;
    /** Ngày của tin báo cáo (YYYY-MM-DD). */
    ngay: string;
    item: MinutesItem;
    thoiGian: number;
}

/** Tên trường và khu vực đúng như dòng "Tên trường: ..." của tin (tách ở dấu " - "), hoặc null khi tin không có dòng đó. */
function rawSchool(content: string): { tenTruong: string; khuVuc: string } | null {
    for (const line of content.normalize("NFC").split(/\r?\n/)) {
        const parsed = splitLabel(line);
        if (!parsed || parsed.label !== "ten truong") continue;
        const school = splitSchoolKhuVuc(parsed.value);
        return school.tenTruong ? { tenTruong: school.tenTruong, khuVuc: school.khuVuc.trim().toUpperCase() } : null;
    }
    return null;
}

/**
 * Mỗi BIÊN BẢN một dòng, từ các tin "BÁO CÁO CUỐI BUỔI" thỏa `include(ts)` có ảnh biên bản đã đọc (`minutes`: msgId của tin -> các biên bản). Một biên bản được tính MỘT lần dù bộ
 * ảnh gắn vào nhiều tin của cùng trường (gửi lại tin báo cáo): tin MUỚI hơn quyết định PM và ngày. Tin không có ảnh biên bản thì không cho dòng nào. Thứ tự là thứ tự tin gửi, rồi
 * thứ tự ảnh.
 */
export function minutesEntries(messages: SourceMessage[], include: (ts: number) => boolean, minutes: Map<string, MinutesForMessage>): MinutesEntry[] {
    const byKey = new Map<string, MinutesEntry>();
    for (const m of [...messages].sort((a, b) => a.ts - b.ts)) {
        if (!include(m.ts)) continue;
        const found = minutes.get(m.msgId);
        const parsed = parseInternetMessage(m.content);
        const school = rawSchool(m.content);
        if (!found || !parsed || !school) continue;
        const pm = parsed.rooms.map((r) => r.phongMay).join(",");
        for (const item of found.items) {
            const key = `${fold(school.tenTruong)}|${fold(school.khuVuc)}|${item.key}`;
            byKey.set(key, { ...school, pm, ngay: vietnamDay(m.ts), item, thoiGian: m.ts });
        }
    }
    return [...byKey.values()];
}
