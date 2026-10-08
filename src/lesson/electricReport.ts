import { config } from "../../config.js";
import { fold, splitLabel } from "./parseReport.js";
import { parseGroupName } from "./schoolArea.js";
import { vietnamDay } from "./time.js";
import type { ElectricEntry, SourceMessage } from "../types/index.js";

export interface ElectricRoomResult {
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    tinhTrang: string;
}

/** Dòng đầu tin phải đúng "LỖI ĐIỆN" (không phân biệt hoa thường và dấu), không có gì thêm sau. */
export function classifyElectricTitle(content: string): boolean {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return fold(lines[0] ?? "") === "loi dien";
}

/**
 * Tin có dạng:
 *   LỖI ĐIỆN
 *   - Trường: <tên trường, có thể để trống>
 *   - Khu vực: <khu vực, có thể để trống>
 *   - Phòng Máy: PM1
 *   - Tình trạng: <T, B hoặc K (xếp loại); chữ khác vẫn đọc được, có thể để trống hoặc xuống dòng>
 * "Trường" và "Khu vực" dùng chung cho cả tin. Mỗi dòng "Phòng Máy" mở một khối mới (một tin có thể báo nhiều phòng) và "Tình
 * trạng" thuộc khối đang mở; dòng không có nhãn ngay sau "Tình trạng" được nối vào tình trạng đó. Khối không có tên phòng bị bỏ.
 * Chỗ Trường/Khu vực trống do `electricEntriesOfMessage` điền từ tên nhóm.
 */
export function parseElectricMessage(content: string): ElectricRoomResult[] {
    const lines = content.normalize("NFC").split(/\r?\n/);
    let tenTruong = "";
    let khuVuc = "";
    const results: Array<{ phongMay: string; tinhTrang: string }> = [];
    let current: { phongMay: string; tinhTrang: string } | null = null;
    let inStatus = false;

    for (const line of lines.slice(1)) {
        const parsed = splitLabel(line);
        if (!parsed) {
            const text = line.trim();
            if (inStatus && current && text !== "") current.tinhTrang = current.tinhTrang === "" ? text : `${current.tinhTrang} ${text}`;
            continue;
        }
        inStatus = false;
        if (parsed.label === "truong") tenTruong = parsed.value;
        else if (parsed.label === "khu vuc") khuVuc = parsed.value;
        else if (parsed.label === "phong may") {
            current = { phongMay: parsed.value, tinhTrang: "" };
            results.push(current);
        } else if (parsed.label === "tinh trang" && current) {
            current.tinhTrang = parsed.value;
            inStatus = true;
        }
    }
    return results.filter((r) => r.phongMay !== "").map((r) => ({ tenTruong, khuVuc, ...r }));
}

/**
 * Các dòng điện của một tin nhắn (rỗng nếu không phải tin "LỖI ĐIỆN"). Trường/Khu vực để trống trong tin thì lấy từ TÊN NHÓM,
 * qua `aliases` (mặc định `config.groupAliases`) như báo cáo buổi dạy, nên tin gửi ở nhóm thử có trường như nhóm thật.
 */
export function electricEntriesOfMessage(m: SourceMessage, aliases: Record<string, string> = config.groupAliases): ElectricEntry[] {
    if (!classifyElectricTitle(m.content)) return [];
    const fromGroup = parseGroupName(aliases[m.groupName] ?? m.groupName);
    return parseElectricMessage(m.content).map((r) => ({
        maNhom: m.groupId,
        maTinNhan: m.msgId,
        thoiGian: m.ts,
        tenTruong: r.tenTruong || (fromGroup.truong?.tenRieng ?? ""),
        khuVuc: r.khuVuc || (fromGroup.khuVuc ?? ""),
        phongMay: r.phongMay,
        tinhTrang: r.tinhTrang,
    }));
}

/** Mỗi phòng (nhóm + tên phòng IN HOA đã trim) giữ tin MỚI NHẤT: báo lại sau thì thay cho báo trước. */
export function latestElectricPerRoom(entries: ElectricEntry[]): ElectricEntry[] {
    const latest = new Map<string, ElectricEntry>();
    for (const e of entries) {
        const key = `${e.maNhom}|${e.phongMay.toUpperCase().trim()}`;
        const current = latest.get(key);
        if (!current || e.thoiGian > current.thoiGian) latest.set(key, e);
    }
    return [...latest.values()];
}

/**
 * Dòng điện của CẢ MỘT NGÀY (giờ Việt Nam `day`, YYYY-MM-DD), KHÔNG giới hạn theo buổi, giai đoạn hay đợt: lỗi điện là sự cố phát
 * sinh nên báo cáo nào (tổng 9h/15h hay 4 giai đoạn) cũng lấy hết tin của ngày đó. Mỗi phòng giữ tin mới nhất trong ngày.
 */
export function electricEntriesOfDay(messages: SourceMessage[], day: string, aliases: Record<string, string> = config.groupAliases): ElectricEntry[] {
    const out: ElectricEntry[] = [];
    for (const m of messages) {
        if (vietnamDay(m.ts) !== day) continue;
        out.push(...electricEntriesOfMessage(m, aliases));
    }
    return latestElectricPerRoom(out);
}
