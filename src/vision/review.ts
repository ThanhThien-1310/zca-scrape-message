import type { BundleReading, Disagreement, PhotoRule } from "../types/index.js";

/**
 * Hàm chung của review: làm phẳng kết quả đọc thành khoá `đường.dẫn`, so hai lần đọc độc lập, và biết khi nào cần đọc lần hai. Hàm thuần.
 * Khoá phẳng: `anh[<seq>].loai`, `<luật>.<trường>`, `<luật>.<trường>.length` (danh sách), `<luật>.<trường>[i].<cột>`.
 */
export const norm = (v: unknown): unknown => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").toLowerCase() : (v ?? null));

function flatValue(path: string, value: unknown, out: Map<string, unknown>): void {
    if (Array.isArray(value)) {
        out.set(`${path}.length`, value.length);
        value.forEach((row, i) => {
            if (typeof row === "object" && row !== null) for (const [k, v] of Object.entries(row)) out.set(`${path}[${i}].${k}`, v ?? null);
            else out.set(`${path}[${i}]`, row ?? null);
        });
    } else {
        out.set(path, value ?? null);
    }
}

export function flattenReading(reading: BundleReading): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (const img of reading.images) out.set(`anh[${img.seq}].loai`, img.loai);
    for (const [rule, fields] of Object.entries(reading.extracted)) for (const [field, fr] of Object.entries(fields)) flatValue(`${rule}.${field}`, fr.value, out);
    return out;
}

/** Có cần lần đọc thứ hai không: luật đặt `luon`, hoặc `khi_tin_cay_thap` mà ảnh/trường của loại đó có độ tin cậy `thap`. Bộ không có ảnh loại nào của luật thì không. */
export function needsSecondRead(rules: PhotoRule[], reading: BundleReading): boolean {
    for (const rule of rules) {
        if (!reading.images.some((i) => i.loai === rule.id)) continue;
        if (rule.docLanHai === "luon") return true;
        if (rule.docLanHai === "khi_tin_cay_thap") {
            const lowImage = reading.images.some((i) => i.loai === rule.id && i.doTinCay === "thap");
            const lowField = Object.values(reading.extracted[rule.id] ?? {}).some((f) => f.doTinCay === "thap");
            if (lowImage || lowField) return true;
        }
    }
    return false;
}

export function compareReadings(first: BundleReading, second: BundleReading): Disagreement[] {
    const a = flattenReading(first);
    const b = flattenReading(second);
    const keys = [...new Set([...a.keys(), ...b.keys()])];
    return keys.filter((k) => norm(a.get(k)) !== norm(b.get(k))).map((k) => ({ path: k, first: a.get(k) ?? null, second: b.get(k) ?? null }));
}
