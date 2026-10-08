import type { FieldKey, ParsedLines, RoomInfo, TitleKind } from "../types/index.js";

export function stripDiacritics(s: string): string {
    return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export const fold = (s: string): string => stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Classifies a message by its title line; `gan_giong` = mentions a start/end report but the title is not the standard one. */
export function classifyTitle(content: string): TitleKind {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const first = fold(lines[0] ?? "");
    if (/^bao cao dau buoi day\b/.test(first)) return "DauBuoi";
    if (/^bao cao cuoi buoi day\b/.test(first)) return "CuoiBuoi";
    const all = fold(content);
    if (/bao cao/.test(all) && /(dau|cuoi) buoi/.test(all)) return "gan_giong";
    return null;
}

/** Splits a "- Label: value" line (any of `-•*+` as the bullet, or none). Returns null when there is no ":".
 * `label` is already `fold()`-ed for comparison; `value` keeps its original text (trimmed). Used by report
 * parsers that are not `parseLines` (e.g. cleaningReport.ts, attendanceReport.ts). */
export function splitLabel(line: string): { label: string; value: string } | null {
    const t = line.replace(/^\s*[-•*+]?\s*/, "");
    const colon = t.indexOf(":");
    if (colon < 0) return null;
    return { label: fold(t.slice(0, colon)), value: t.slice(colon + 1).trim() };
}

export const FIELD_KEYS: FieldKey[] = ["giaoVien", "phongMay", "loi", "thieu", "netSupport", "internet", "amThanh", "mayLanh"];

const LABELS: Array<{ key: FieldKey; re: RegExp }> = [
    { key: "giaoVien", re: /^ten giao vien$/ },
    { key: "phongMay", re: /^phong may$/ },
    { key: "tong", re: /^tong so may$/ },
    { key: "loi", re: /^tong so may bi loi$/ },
    { key: "thieu", re: /^so may con thieu cho hs$/ },
    { key: "netSupport", re: /^tinh trang netsupport$/ },
    { key: "internet", re: /^tinh trang internet$/ },
    { key: "amThanh", re: /^tinh trang loa,? am ly$/ },
    { key: "mayLanh", re: /^tinh trang may lanh,? may quat$/ },
];

// Lines that appear in real reports and are deliberately not extracted.
const IGNORED_LABEL = /^(ten tro giang|tong so may|so luong hs|ty le hoc sinh|gv quan nhiem|da tat|hs |ghe ngoi|ve sinh|tuan thu|viec tuan thu|danh sach vi pham)/;
// An unrecognised label is only worth a review when it looks like one of the 8 wanted lines.
const SUSPICIOUS_LABEL = /(tinh trang|phong|giao vien|loi|thieu|may )/;

export function parseLines(content: string): ParsedLines {
    const values: Partial<Record<FieldKey, string>> = {};
    const unknownLabels: string[] = [];
    const lines = content.normalize("NFC").split(/\r?\n/);
    const firstIdx = lines.findIndex((l) => l.trim() !== "");
    for (const line of lines.slice(firstIdx + 1)) {
        const t = line.replace(/^\s*[-•*]?\s*/, "");
        const colon = t.indexOf(":");
        if (colon < 0) continue;
        const rawLabel = t.slice(0, colon).trim();
        const label = fold(rawLabel);
        const value = t.slice(colon + 1).trim();
        const found = LABELS.find((l) => l.re.test(label));
        if (found) {
            if (!(found.key in values)) values[found.key] = value;
        } else if (SUSPICIOUS_LABEL.test(label) && !IGNORED_LABEL.test(label)) {
            unknownLabels.push(rawLabel);
        }
    }
    return { values, unknownLabels };
}

export function parseRoom(value: string | undefined): RoomInfo {
    if (value === undefined) return { phongMay: null, coSo: null };
    let v = value.replace(/\([^)]*\)/g, " ");
    let coSo: string | null = null;
    const m = /(?:^|[\s,-])(?:cs|cơ sở)\s*(\d+)(?![\p{L}\d])/iu.exec(v);
    if (m) {
        coSo = `CS${m[1]}`;
        v = v.slice(0, m.index) + v.slice(m.index + m[0].length);
    }
    v = v.replace(/^[\s,-]+/, "").replace(/^(phòng máy|phòng)\s+/iu, "").replace(/[\s,-]+$/, "").trim();
    if (v === "") return { phongMay: coSo ? "PM1" : "", coSo };
    return { phongMay: v, coSo };
}

/** Returns T/B/K upper-cased; anything else is returned as written (a caller treats it as invalid); a missing line is null. */
export function parseGrade(value: string | undefined): string | null {
    if (value === undefined) return null;
    const v = value.trim();
    return /^[tbk]$/i.test(v) ? v.toUpperCase() : v;
}

export const isValidFacilityGrade = (g: string | null): boolean => g === "T" || g === "B" || g === "K";

export function parseCount(value: string | undefined): number | null {
    if (value === undefined) return null;
    const m = /^\s*(\d+)/.exec(value);
    return m ? Number(m[1]) : null;
}

/** The text inside the first `( )`: null when there is none, "" for an empty pair. */
export function parseNote(value: string | undefined): string | null {
    if (value === undefined) return null;
    const m = /\(([^)]*)\)/.exec(value);
    return m ? m[1].trim() : null;
}

export function computerGrade(thieu: number | null, loi: number | null): string | null {
    if (thieu === null || loi === null) return null;
    if (thieu === 0) return loi === 0 ? "A" : loi <= 5 ? "B" : loi <= 9 ? "C" : "D";
    return loi >= 10 ? "D" : "C";
}
