import { hhmmVietnam, vietnamDay } from "../lesson/time.js";
import type { NormalizedMessage } from "../types/index.js";

/**
 * Cảnh báo ảnh THIẾU: tin ảnh (không phải của chính tài khoản) trong các nhóm đọc ảnh, gửi trong `day`, mà kho tin không có file ảnh (không có `url`). Ảnh như vậy không vào được
 * bộ ảnh nên không được đọc: báo cáo dựa vào ảnh sẽ thiếu chỗ đó. Thường gặp khi `bot:watch` không chạy lúc ảnh đến (ảnh gốc chỉ tải được từ khung WebSocket) và ảnh album chưa được mở
 * trong Zalo. Mỗi nhóm một dòng cảnh báo, ghi số ảnh và khoảng giờ để người dùng biết ảnh nào cần gửi lại.
 */
export function missingPhotoWarnings(messages: NormalizedMessage[], groups: string[], day: string): string[] {
    const byGroup = new Map<string, number[]>();
    for (const m of messages) {
        if (m.msgType !== "chat.photo" || m.isSelf || !groups.includes(m.groupName) || vietnamDay(m.ts) !== day) continue;
        if (typeof m.url === "string" && m.url !== "") continue;
        byGroup.set(m.groupName, [...(byGroup.get(m.groupName) ?? []), m.ts]);
    }
    return [...byGroup].map(([group, times]) => {
        const sorted = [...times].sort((a, b) => a - b);
        const hm = (ts: number): string => hhmmVietnam(ts).replace(/^(\d{2})(\d{2})$/, "$1:$2");
        const range = hm(sorted[0]) === hm(sorted[sorted.length - 1]) ? hm(sorted[0]) : `${hm(sorted[0])}-${hm(sorted[sorted.length - 1])}`;
        return `nhóm "${group}": ${sorted.length} ảnh (${range}) không có file ảnh nên không được đọc; để bot:watch chạy liên tục hoặc gửi lại ảnh`;
    });
}
