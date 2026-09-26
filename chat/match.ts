import { extractRaw, type RawFields } from "../lesson/build.js";
import { classifyTitle, stripDiacritics } from "../lesson/parseReport.js";
import type { InboxEntry } from "./inbox.js";
import type { Rule, When } from "./rules.js";

/** Bỏ dấu, hạ chữ thường, gộp khoảng trắng: dùng để so từ khóa. */
export const foldText = (s: string): string => stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Báo cáo có máy lỗi: số máy lỗi > 0, hoặc dòng đó có chữ nhưng không phải số (ví dụ "IT bảo trì").
 * "Tổng số máy bị lỗi: 0" và dòng bị thiếu thì không.
 */
export function hasMayLoi(raw: RawFields): boolean {
    if (raw.loi !== null) return raw.loi > 0;
    return raw.loiText !== null && raw.loiText.trim() !== "";
}

/** Mọi khóa có mặt trong `when` phải cùng khớp. */
export function matches(when: When, entry: InboxEntry): boolean {
    if (when.loaiBaoCao) {
        const kind = classifyTitle(entry.text);
        if ((kind !== "DauBuoi" && kind !== "CuoiBuoi") || !when.loaiBaoCao.includes(kind)) return false;
    }
    if (when.mayLoi && !hasMayLoi(extractRaw(entry.text, entry.groupName))) return false;
    if (when.keywords) {
        const text = foldText(entry.text);
        if (!when.keywords.some((k) => text.includes(foldText(k)))) return false;
    }
    return true;
}

/** Tình huống đầu tiên khớp (theo thứ tự khai báo), hoặc null. */
export function pickRule(rules: Rule[], entry: InboxEntry): Rule | null {
    return rules.find((r) => matches(r.when, entry)) ?? null;
}

export function renderReply(rule: Rule, entry: InboxEntry): string {
    return rule.reply.replace(/\{senderName\}/g, entry.senderName.trim() || "bạn");
}
