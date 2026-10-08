import type { OutgoingReply } from "../types/index.js";

/** Tên để so sánh: chuẩn hóa dạng mã hóa của chữ có dấu, bỏ ký tự vô hình, gộp khoảng trắng, hạ chữ thường (dấu vẫn giữ). */
export const nameKey = (s: string): string => s.normalize("NFC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Mục "Báo cho cả nhóm @All" (hoặc tên tự đặt là All): gắn thẻ cả nhóm là việc bot không bao giờ làm,
 * nên nó không bao giờ được chọn và không được ghi trong `mention` của chat-rules.json.
 */
export function isEveryone(text: string): boolean {
    const k = nameKey(text);
    return /(^|\s)@?all$/.test(k) || k.includes("cả nhóm");
}

/** Câu như sẽ hiện trong nhóm, gồm cả các thẻ ("@Tên câu trả lời"): đây là thứ ghi vào sổ tin dội lại và vào log. */
export function echoText(reply: OutgoingReply): string {
    return [...reply.mentions.map((n) => `@${n}`), reply.text].join(" ");
}
