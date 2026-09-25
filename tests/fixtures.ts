import type { SourceMessage } from "../lesson/types.js";

export const DAY = "2026-09-24";
/** Epoch ms of hour:minute on 2026-09-24 in Vietnam (UTC+7). */
export const at = (hour: number, minute = 0): number => Date.UTC(2026, 8, 24, hour - 7, minute);
export const YESTERDAY = Date.UTC(2026, 8, 23, 1, 0);

const base = { groupId: "g1", groupName: "LC_HoaSen1_TĐ", senderId: "u1", msgType: "desktop.text" };

let seq = 0;
export function msg(content: string, ts: number, extra: Partial<SourceMessage> = {}): SourceMessage {
    seq += 1;
    return { ...base, msgId: `m${seq}`, ts, content, ...extra };
}

export const COMPLETE = [
    "BÁO CÁO ĐẦU BUỔI DẠY",
    "- Tên Giáo Viên: Nguyễn Văn A",
    "- Tên Trợ Giảng: Trần Thị B",
    "- Phòng Máy: PM1",
    "- Tổng số máy: 36",
    "- Tổng số máy bị lỗi: 0",
    "- Số máy còn thiếu cho HS: 0",
    "- Tình trạng Netsupport: T",
    "- Tình trạng Internet:T",
    "- Tình trạng Loa, Âm ly: B",
    "- Tình trạng máy lạnh, máy quạt: K",
].join("\n");

export const IT_MAINTENANCE = COMPLETE.replace("BÁO CÁO ĐẦU BUỔI DẠY", "BÁO CÁO CUỐI BUỔI DẠY").replace("Tổng số máy bị lỗi: 0", "Tổng số máy bị lỗi: IT bảo trì");

export const NO_INTERNET_LINE = COMPLETE.replace("- Tình trạng Internet:T\n", "");

export const COLLEGE_ROOM = COMPLETE.replace("Phòng Máy: PM1", "Phòng Máy: Học tại lớp");

export const FAULTY_WITH_NOTE = COMPLETE.replace("Tổng số máy bị lỗi: 0", "Tổng số máy bị lỗi: 3(máy 35 không lên; máy 41 hỏng màn hình)");

export const SPECIALIST = "BÁO CÁO CHUYÊN MÔN\n- Tên Giáo Viên: Nguyễn Văn A\n- Lớp: 9A";
