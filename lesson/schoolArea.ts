import type { Truong } from "./types.js";

export interface SchoolArea {
    truong: Truong | null;
    khuVuc: string | null;
}

const AREAS: Array<{ code: string; names: string[] }> = [
    { code: "TP HCM", names: ["TP Hồ Chí Minh", "TP. HCM", "TP.HCM"] },
    { code: "BD", names: ["Bình Dương"] },
    { code: "VT", names: ["Vũng Tàu", "BRVT"] },
    { code: "BC", names: ["Bình Chánh"] },
    { code: "BTAN", names: ["Bình Tân"] },
    { code: "BTH", names: ["Bình Thạnh"] },
    { code: "CC", names: ["Củ Chi"] },
    { code: "GV", names: ["Gò Vấp"] },
    { code: "HM", names: ["Hóc Môn"] },
    { code: "NB", names: ["Nhà Bè"] },
    { code: "PN", names: ["Phú Nhuận"] },
    { code: "Q1", names: ["Quận 1", "Q.1"] },
    { code: "Q3", names: ["Quận 3", "Q.3"] },
    { code: "Q4", names: ["Quận 4", "Q.4"] },
    { code: "Q5", names: ["Quận 5", "Q.5"] },
    { code: "Q6", names: ["Quận 6", "Q.6"] },
    { code: "Q7", names: ["Quận 7", "Q.7"] },
    { code: "Q8", names: ["Quận 8", "Q.8"] },
    { code: "Q10", names: ["Quận 10", "Q.10"] },
    { code: "Q11", names: ["Quận 11", "Q.11"] },
    { code: "Q12", names: ["Quận 12", "Q.12"] },
    { code: "TB", names: ["Tân Bình"] },
    { code: "TP", names: ["Tân Phú"] },
    { code: "TĐ", names: ["Thủ Đức", "Q2", "Q.2", "Q9", "Q.9"] },
    { code: "TDM", names: ["Thủ Dầu Một"] },
    { code: "TA", names: ["Thuận An"] },
    { code: "DA", names: ["Dĩ An"] },
    { code: "BCAT", names: ["Bến Cát"] },
    { code: "TU", names: ["Tân Uyên"] },
    { code: "BB", names: ["Bàu Bàng"] },
    { code: "PG", names: ["Phú Giáo"] },
    { code: "DT", names: ["Dầu Tiếng"] },
    { code: "BTU", names: ["Bắc Tân Uyên"] },
];

// Longest text first so "TP HCM" wins over "TP", "Bắc Tân Uyên" over "Tân Uyên".
const AREA_CANDIDATES = AREAS.flatMap((a) => [a.code, ...a.names].map((text) => ({ text: text.toLowerCase(), code: a.code }))).sort((a, b) => b.text.length - a.text.length);

const LEVEL_CODES: Record<string, string> = {
    "tiểu học": "TH",
    "mầm non": "MN",
    "trung học cơ sở": "THCS",
    "trung học phổ thông": "THPT",
    "cao đẳng": "CĐ",
    "đại học": "ĐH",
    "liên cấp": "LC",
    "liên cấp 1": "LC1",
    "liên cấp 2": "LC2",
    "liên cấp 3": "LC3",
};
const LEVEL_TOKEN = "(?:THCS|THPT|TH|MN|LC[123]?|CĐ|ĐH|Tiểu học|Mầm non|Trung học cơ sở|Trung học phổ thông|Liên cấp(?: [123])?|Cao đẳng|Đại học)";
const LEVEL_RE = new RegExp(`^(${LEVEL_TOKEN}(?:\\s*-\\s*${LEVEL_TOKEN})*)(?![\\p{L}\\d])`, "iu");
const VALID_LEVELS = new Set(["MN", "TH", "THCS", "THPT", "LC", "LC1", "LC2", "LC3", "TH - THCS", "THCS - THPT", "TH - THCS - THPT", "CĐ", "ĐH"]);
const BRANCH_RE = /(?:^|[\s_,-])(?:cs|cơ sở)\s*(\d+)\s*$/iu;
const SEPARATOR = /[\s_,-]/;
const TRAILING_JUNK = /[\s_,.-]+$/;
const LEADING_JUNK = /^[\s_,.-]+/;

function toLevelCode(token: string): string {
    const t = token.trim().toLowerCase().replace(/\s+/g, " ");
    return LEVEL_CODES[t] ?? token.trim().toUpperCase();
}

function matchArea(s: string): { code: string; rest: string } | null {
    const lower = s.toLowerCase();
    for (const c of AREA_CANDIDATES) {
        if (!lower.endsWith(c.text)) continue;
        const start = s.length - c.text.length;
        if (start === 0 || SEPARATOR.test(s[start - 1])) return { code: c.code, rest: s.slice(0, start) };
    }
    return null;
}

function normalizeBaseName(raw: string): string {
    return raw
        .replace(/[_,-]+/g, " ")
        .replace(/(\p{Ll}|\d)(\p{Lu})/gu, "$1 $2")
        .replace(/(\p{L})(\d)/gu, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

/** Splits a Zalo group name such as `LC_HoaSen1_TĐ` into school and area, following skills/school-and-area-extraction. */
export function parseGroupName(input: string): SchoolArea {
    let s = input.normalize("NFC").trim().replace(TRAILING_JUNK, "");

    let khuVuc: string | null = null;
    const area = matchArea(s);
    if (area) {
        khuVuc = area.code;
        s = area.rest.replace(TRAILING_JUNK, "");
    }

    let coSo: string | null = null;
    const branch = BRANCH_RE.exec(s);
    if (branch) {
        coSo = `CS${branch[1]}`;
        s = s.slice(0, branch.index).replace(TRAILING_JUNK, "");
    }

    s = s.replace(LEADING_JUNK, "");
    let capHoc: string | null = null;
    const level = LEVEL_RE.exec(s);
    if (level) {
        const code = level[1].split("-").map(toLevelCode).join(" - ");
        if (VALID_LEVELS.has(code)) {
            capHoc = code;
            s = s.slice(level[0].length);
        }
    }

    const tenRieng = normalizeBaseName(s);
    return { truong: tenRieng ? { capHoc, tenRieng, coSo } : null, khuVuc };
}
