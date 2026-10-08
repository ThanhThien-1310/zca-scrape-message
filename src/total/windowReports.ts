import { classifyAttendanceTitle, parseAttendanceMessage } from "../lesson/attendanceReport.js";
import { applyOverride, deriveReport, extractRaw } from "../lesson/build.js";
import { classifyCleaningTitle, parseCleaningMessage } from "../lesson/cleaningReport.js";
import { maintenanceEntries } from "../lesson/maintenanceReport.js";
import { classifyTitle } from "../lesson/parseReport.js";
import { inSlotWindow, type TotalSlot } from "./slots.js";
import type { AttendanceEntry, CleaningEntry, Override, Report, SourceMessage } from "../types/index.js";

/** Khung dữ liệu của một đợt (xem `inSlotWindow`). */
type Win = Pick<TotalSlot, "fromMs" | "atMs">;

/**
 * Báo cáo ĐẦU/CUỐI BUỔI DẠY của các tin văn bản gửi trong khung. Chỉ lọc theo GIỜ GỬI THẬT (không dùng luật dời giai
 * đoạn của `classifyPhase`) và không tra DB: bảng tình trạng không cần `maPhong`. Áp `overrides` như `extractAll`
 * (loại bỏ, đổi loại báo cáo, sửa trường).
 */
export function reportsInWindow(messages: SourceMessage[], overrides: Override[], win: Win): Report[] {
    const byKey = new Map(overrides.map((o) => [`${o.key.maNhom}|${o.key.maTinNhan}`, o]));
    const out: Report[] = [];
    for (const m of messages) {
        if (m.msgType !== "desktop.text" || !inSlotWindow(m.ts, win)) continue;
        const ov = byKey.get(`${m.groupId}|${m.msgId}`);
        if (ov?.sua.loaiBo) continue;
        const kind = ov?.sua.loaiBaoCao ?? classifyTitle(m.content);
        if (kind !== "DauBuoi" && kind !== "CuoiBuoi") continue;
        out.push(deriveReport(m, kind, applyOverride(extractRaw(m.content, m.groupName), ov?.sua)));
    }
    return out;
}

const hasGrade = (r: Report): boolean => r.data.coSoVatChat.some((f) => f.xepLoai !== null && f.xepLoai !== "");

/**
 * Mỗi phòng (nhóm + tên phòng IN HOA đã trim) một báo cáo: báo cáo MỚI NHẤT CÓ XẾP LOẠI. Báo cáo muộn hơn nhưng trống mọi
 * xếp loại (ví dụ "Học tại lớp") KHÔNG đè báo cáo có xếp loại trước đó của cùng phòng; nếu cả hai cùng có hoặc cùng
 * không có xếp loại thì lấy báo cáo muộn hơn. Chỉ dùng cho báo cáo tổng (4 giai đoạn vẫn dùng `latestPerRoom`).
 * Báo cáo không có tên phòng được giữ nguyên hết, không gộp với nhau.
 */
export function latestGradedPerRoom(reports: Report[]): Report[] {
    const best = new Map<string, Report>();
    const noRoom: Report[] = [];
    for (const r of reports) {
        if (!r.data.phongMay) {
            noRoom.push(r);
            continue;
        }
        const key = `${r.maNhom}|${r.data.phongMay.toUpperCase().trim()}`;
        const current = best.get(key);
        if (!current) {
            best.set(key, r);
            continue;
        }
        const rGraded = hasGrade(r);
        const currentGraded = hasGrade(current);
        if ((rGraded && !currentGraded) || (rGraded === currentGraded && r.thoiGian > current.thoiGian)) best.set(key, r);
    }
    return [...best.values(), ...noRoom];
}

/** Dòng vệ sinh của các tin "BÁO CÁO CUỐI BUỔI" (IT kỹ thuật) gửi trong khung; một tin nhiều phòng ra nhiều dòng. */
export function cleaningEntriesInWindow(messages: SourceMessage[], win: Win): CleaningEntry[] {
    const out: CleaningEntry[] = [];
    for (const m of messages) {
        if (!inSlotWindow(m.ts, win) || !classifyCleaningTitle(m.content)) continue;
        for (const room of parseCleaningMessage(m.content)) out.push({ maNhom: m.groupId, maTinNhan: m.msgId, thoiGian: m.ts, ...room });
    }
    return out;
}

/** Các trường có tin "BÁO CÁO CUỐI BUỔI" gửi trong khung, mỗi trường một dòng (file THỜI GIAN CHƯA BẢO TRÌ). */
export function maintenanceEntriesInWindow(messages: SourceMessage[], win: Win): ReturnType<typeof maintenanceEntries> {
    return maintenanceEntries(messages, (ts) => inSlotWindow(ts, win));
}

/** Tin "BÁO CÁO ĐIỂM DANH" hợp lệ gửi trong khung (giờ gửi thật quyết định sáng/chiều và đi trễ). */
export function attendanceEntriesInWindow(messages: SourceMessage[], win: Win): AttendanceEntry[] {
    const out: AttendanceEntry[] = [];
    for (const m of messages) {
        if (!inSlotWindow(m.ts, win) || !classifyAttendanceTitle(m.content)) continue;
        const parsed = parseAttendanceMessage(m.content);
        if (!parsed) continue;
        out.push({ maNhom: m.groupId, maTinNhan: m.msgId, thoiGian: m.ts, tenNV: parsed.tenNV, noiLamViec: parsed.noiLamViec });
    }
    return out;
}
