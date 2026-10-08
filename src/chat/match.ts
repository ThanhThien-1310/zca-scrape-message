import { extractRaw } from "../lesson/build.js";
import { classifyTitle, stripDiacritics } from "../lesson/parseReport.js";
import type { InboxEntry, RawFields, Rule, When } from "../types/index.js";

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

/**
 * Hai biến về lỗi lấy từ dòng "Tổng số máy bị lỗi" của báo cáo: `soMayLoi` là số (hoặc chữ như "IT bảo trì") và `chiTietLoi` là ghi chú
 * trong ngoặc ("máy 35 không lên; máy 41 hỏng màn hình"); không có ghi chú thì là "<n> máy lỗi". Không có lỗi hoặc không phải báo cáo thì rỗng.
 */
export function faultVariables(raw: RawFields): { soMayLoi: string; chiTietLoi: string } {
    const soMayLoi = raw.loi !== null ? String(raw.loi) : (raw.loiText ?? "").trim();
    const note = (raw.ghiChuLoi ?? "").trim();
    let chiTietLoi = "";
    if (note !== "") chiTietLoi = note;
    else if (raw.loi !== null) chiTietLoi = raw.loi > 0 ? `${raw.loi} máy lỗi` : "";
    else chiTietLoi = (raw.loiText ?? "").trim();
    return { soMayLoi, chiTietLoi };
}

export function renderReply(rule: Rule, entry: InboxEntry): string {
    let fault: ReturnType<typeof faultVariables> | undefined;
    return rule.reply.replace(/\{(senderName|soMayLoi|chiTietLoi)\}/g, (_m, key: "senderName" | "soMayLoi" | "chiTietLoi") => {
        if (key === "senderName") return entry.senderName.trim() || "bạn";
        fault ??= faultVariables(extractRaw(entry.text, entry.groupName));
        return fault[key];
    });
}
