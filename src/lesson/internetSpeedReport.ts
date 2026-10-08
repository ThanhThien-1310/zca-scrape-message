import { fold, parseRoom, splitLabel } from "./parseReport.js";
import { parseMaintenanceMessage } from "./maintenanceReport.js";
import type { SpeedForMessage, SpeedPoint } from "../speed/measures.js";
import type { SourceMessage } from "../types/index.js";

/** Một khối "* Phòng máy: ..." trong tin và dòng "- Internet: Có/Không" của khối đó (null khi khối không có dòng Internet). */
export interface InternetRoom {
    phongMay: string;
    internet: "co" | "khong" | null;
}

export interface InternetMessage {
    cap: string;
    tenTruong: string;
    khuVuc: string;
    rooms: InternetRoom[];
}

/**
 * Tin "BÁO CÁO CUỐI BUỔI" (cùng nguồn với VỆ SINH và BẢO TRÌ): trường, khu vực và từng khối phòng máy với dòng "Internet". Tin không có dòng "Tên trường" hoặc không có khối phòng
 * máy nào thì trả null. Tên phòng lấy mã trước phần trong ngoặc ("PM1 (P. Vi Tính 1)" thành "PM1").
 */
export function parseInternetMessage(content: string): InternetMessage | null {
    const school = parseMaintenanceMessage(content);
    if (!school) return null;
    const rooms: InternetRoom[] = [];
    let current: InternetRoom | null = null;
    for (const line of content.normalize("NFC").split(/\r?\n/)) {
        const parsed = splitLabel(line);
        if (!parsed) continue;
        if (parsed.label === "phong may") {
            current = { phongMay: parseRoom(parsed.value).phongMay?.trim() || parsed.value.trim(), internet: null };
            rooms.push(current);
        } else if (parsed.label === "internet" && current) {
            const v = fold(parsed.value);
            current.internet = v === "co" ? "co" : v === "khong" ? "khong" : null;
        }
    }
    return rooms.length > 0 ? { ...school, rooms } : null;
}

/** Một dòng của file TRẠNG THÁI KẾT NỐI INTERNET: một phòng máy của một trường. */
export interface InternetSpeedEntry {
    cap: string;
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    internet: "co" | "khong" | null;
    /** Tốc độ Mbps từ ảnh đo; null khi chưa có ảnh dùng được. */
    mbps: number | null;
    /** Ảnh đo báo không có mạng. */
    noInternet: boolean;
    thoiGian: number;
    maTinNhan: string;
}

/**
 * Tốc độ của từng phòng trong MỘT tin: số lần đo bằng số phòng thì theo thứ tự (lần đo thứ i của phòng thứ i); đúng MỘT lần đo thì dùng chung cho mọi phòng (các phòng
 * lồng trong một tin là cùng một trường, cùng đường truyền); số lần đo khác thì không ghép (chỗ trống, người xem xử lý).
 */
function pointsPerRoom(roomCount: number, found: SpeedForMessage | undefined): Array<SpeedPoint | null> {
    const pts = found?.points ?? [];
    if (pts.length === roomCount) return pts;
    if (pts.length === 1) return Array.from({ length: roomCount }, () => pts[0]);
    return Array.from({ length: roomCount }, () => null);
}

/**
 * Mỗi (trường, khu vực, phòng máy) một dòng, từ các tin thỏa `include(ts)`: cờ Internet lấy từ tin MỚI NHẤT của phòng đó; tốc độ lấy từ tin mới nhất CÓ lần đo dùng được (tin mới
 * hơn không có ảnh thì không xoá tốc độ của tin trước). Thứ tự là thứ tự tin gửi (việc xếp D, C, B, A làm ở `buildInternetSpeedRows`).
 */
export function internetSpeedEntries(messages: SourceMessage[], include: (ts: number) => boolean, speed: Map<string, SpeedForMessage>): InternetSpeedEntry[] {
    const byKey = new Map<string, InternetSpeedEntry>();
    for (const m of [...messages].sort((a, b) => a.ts - b.ts)) {
        if (!include(m.ts)) continue;
        const parsed = parseInternetMessage(m.content);
        if (!parsed) continue;
        const points = pointsPerRoom(parsed.rooms.length, speed.get(m.msgId));
        parsed.rooms.forEach((room, i) => {
            const key = `${fold(parsed.tenTruong)}|${fold(parsed.khuVuc)}|${fold(room.phongMay)}`;
            const prev = byKey.get(key);
            const point = points[i];
            const entry: InternetSpeedEntry = {
                cap: parsed.cap,
                tenTruong: parsed.tenTruong,
                khuVuc: parsed.khuVuc,
                phongMay: room.phongMay,
                internet: room.internet ?? prev?.internet ?? null,
                mbps: point?.usable ? point.mbps : (prev?.mbps ?? null),
                noInternet: point?.usable ? point.noInternet : (prev?.noInternet ?? false),
                thoiGian: m.ts,
                maTinNhan: m.msgId,
            };
            byKey.set(key, entry);
        });
    }
    return [...byKey.values()];
}
