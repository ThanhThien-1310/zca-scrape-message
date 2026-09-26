import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LoaiBaoCao } from "../lesson/types.js";

/** Điều kiện của một tình huống: mọi khóa có mặt phải cùng khớp. */
export interface When {
    loaiBaoCao?: LoaiBaoCao[];
    mayLoi?: true;
    keywords?: string[];
}

export interface Rule {
    id: string;
    when: When;
    reply: string;
}

export interface Limits {
    maxRepliesPerMinute: number;
    maxReplyDelaySeconds: number;
    cooldownSecondsPerRule: number;
}

export interface ChatRules {
    version: 1;
    dryRun: boolean;
    limits: Limits;
    /** `scrape: false` = chat-only group: never queued for scraping, never recovered (default true). */
    groups: Record<string, { rules: Rule[]; scrape: boolean }>;
}

export const DEFAULT_LIMITS: Limits = { maxRepliesPerMinute: 6, maxReplyDelaySeconds: 180, cooldownSecondsPerRule: 60 };

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_RULES_PATH = path.join(repoRoot, "chat-rules.json");

const WHEN_KEYS = ["loaiBaoCao", "mayLoi", "keywords"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function parseRule(r: unknown, where: string, seen: Set<string>, errors: string[]): Rule | null {
    if (!isObj(r)) {
        errors.push(`${where}: phải là một đối tượng.`);
        return null;
    }
    const before = errors.length;

    if (typeof r.id !== "string" || r.id.trim() === "") errors.push(`${where}: thiếu "id".`);
    else if (seen.has(r.id)) errors.push(`${where}: "id" "${r.id}" bị trùng trong nhóm.`);
    else seen.add(r.id);

    const when: When = {};
    if (!isObj(r.when) || Object.keys(r.when).length === 0) {
        errors.push(`${where}: "when" phải có ít nhất một điều kiện.`);
    } else {
        const w = r.when;
        for (const k of Object.keys(w)) if (!WHEN_KEYS.includes(k)) errors.push(`${where}: "when" có khóa lạ "${k}".`);
        if ("loaiBaoCao" in w) {
            const v = w.loaiBaoCao;
            if (!Array.isArray(v) || v.length === 0 || !v.every((x) => x === "DauBuoi" || x === "CuoiBuoi")) errors.push(`${where}: "loaiBaoCao" phải là mảng gồm "DauBuoi" và/hoặc "CuoiBuoi".`);
            else when.loaiBaoCao = v as LoaiBaoCao[];
        }
        if ("mayLoi" in w) {
            if (w.mayLoi !== true) errors.push(`${where}: "mayLoi" chỉ nhận true.`);
            else when.mayLoi = true;
        }
        if ("keywords" in w) {
            const v = w.keywords;
            if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === "string" && x.trim() !== "")) errors.push(`${where}: "keywords" phải là mảng chuỗi không rỗng.`);
            else when.keywords = v as string[];
        }
    }

    if (typeof r.reply !== "string" || r.reply.trim() === "") errors.push(`${where}: thiếu "reply".`);
    else for (const m of r.reply.matchAll(/\{([^}]*)\}/g)) if (m[1] !== "senderName") errors.push(`${where}: "reply" có biến lạ {${m[1]}} (chỉ có {senderName}).`);

    return errors.length > before ? null : { id: r.id as string, when, reply: r.reply as string };
}

/** Kiểm chặt: mọi lỗi được gom lại và ném một lần. `targets` là `config.targets`. */
export function parseRules(json: unknown, targets: string[]): ChatRules {
    if (!isObj(json)) throw new Error("chat-rules.json phải là một đối tượng JSON.");
    const errors: string[] = [];

    if (json.version !== 1) errors.push(`"version" phải là 1 (đang là ${JSON.stringify(json.version)}).`);

    const dryRun = json.dryRun === undefined ? false : json.dryRun;
    if (typeof dryRun !== "boolean") errors.push('"dryRun" phải là true hoặc false.');

    const limits: Limits = { ...DEFAULT_LIMITS };
    if (json.limits !== undefined) {
        if (!isObj(json.limits)) {
            errors.push('"limits" phải là một đối tượng.');
        } else {
            for (const k of Object.keys(json.limits)) if (!(k in DEFAULT_LIMITS)) errors.push(`limits có khóa lạ "${k}".`);
            for (const k of Object.keys(DEFAULT_LIMITS) as Array<keyof Limits>) {
                const v = json.limits[k];
                if (v === undefined) continue;
                if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) errors.push(`limits.${k} phải là số dương.`);
                else limits[k] = v;
            }
        }
    }

    const groups: ChatRules["groups"] = {};
    if (!isObj(json.groups)) {
        errors.push('"groups" phải là một đối tượng (tên nhóm -> { rules }).');
    } else {
        for (const [name, g] of Object.entries(json.groups)) {
            if (!targets.includes(name)) {
                errors.push(`nhóm "${name}" không có trong config.targets.`);
                continue;
            }
            if (!isObj(g) || !Array.isArray(g.rules) || g.rules.length === 0) {
                errors.push(`nhóm "${name}" cần "rules" là mảng không rỗng.`);
                continue;
            }
            const seen = new Set<string>();
            const rules: Rule[] = [];
            g.rules.forEach((r, i) => {
                const rule = parseRule(r, `nhóm "${name}", quy tắc #${i + 1}`, seen, errors);
                if (rule) rules.push(rule);
            });
            let scrape = true;
            if (g.scrape !== undefined) {
                if (typeof g.scrape !== "boolean") errors.push(`nhóm "${name}": "scrape" phải là true hoặc false.`);
                else scrape = g.scrape;
            }
            groups[name] = { rules, scrape };
        }
    }

    if (errors.length > 0) throw new Error(`chat-rules.json không hợp lệ:\n- ${errors.join("\n- ")}`);
    return { version: 1, dryRun: dryRun as boolean, limits, groups };
}

export function loadRules(file: string, targets: string[]): ChatRules {
    let text: string;
    try {
        text = fs.readFileSync(file, "utf8");
    } catch (err) {
        throw new Error(`không đọc được ${file}: ${(err as Error).message}`);
    }
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch (err) {
        throw new Error(`${file} không phải JSON hợp lệ: ${(err as Error).message}`);
    }
    return parseRules(json, targets);
}

/** Đọc dễ dãi cho `bot:watch`: không bao giờ ném lỗi; tệp thiếu hoặc hỏng thì coi như không có nhóm nào. */
export function groupNamesFromFile(file: string = DEFAULT_RULES_PATH): string[] {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return isObj(v) && isObj(v.groups) ? Object.keys(v.groups) : [];
    } catch {
        return [];
    }
}

/** Trả về hàm đọc tập tên nhóm, chỉ đọc lại tệp khi thời điểm sửa đổi thay đổi. */
export function makeGroupNameReader(file: string = DEFAULT_RULES_PATH): () => ReadonlySet<string> {
    let mtime = -1;
    let cached: Set<string> = new Set();
    return () => {
        let m: number;
        try {
            m = fs.statSync(file).mtimeMs;
        } catch {
            m = -2;
        }
        if (m !== mtime) {
            mtime = m;
            cached = new Set(m === -2 ? [] : groupNamesFromFile(file));
        }
        return cached;
    };
}

/** Names of the groups marked `"scrape": false`. Forgiving like `groupNamesFromFile`: never throws, a bad file means none. */
export function noScrapeGroupsFromFile(file: string = DEFAULT_RULES_PATH): string[] {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!isObj(v) || !isObj(v.groups)) return [];
        return Object.entries(v.groups)
            .filter(([, g]) => isObj(g) && g.scrape === false)
            .map(([name]) => name);
    } catch {
        return [];
    }
}

/** Like `makeGroupNameReader` but also returns the chat-only groups; re-reads the file only when it changed. */
export function makeChatGroupsReader(file: string = DEFAULT_RULES_PATH): () => { allowed: ReadonlySet<string>; noScrape: ReadonlySet<string> } {
    let mtime = -1;
    let cached = { allowed: new Set<string>(), noScrape: new Set<string>() };
    return () => {
        let m: number;
        try {
            m = fs.statSync(file).mtimeMs;
        } catch {
            m = -2;
        }
        if (m !== mtime) {
            mtime = m;
            cached = m === -2 ? { allowed: new Set(), noScrape: new Set() } : { allowed: new Set(groupNamesFromFile(file)), noScrape: new Set(noScrapeGroupsFromFile(file)) };
        }
        return cached;
    };
}

/** `config.recoveryIgnoreTargets` plus every chat-only group, so recovery never scrapes a group the user chose not to scrape. */
export function recoveryIgnoreWith(base: string[], file: string = DEFAULT_RULES_PATH): string[] {
    return [...new Set([...base, ...noScrapeGroupsFromFile(file)])];
}
