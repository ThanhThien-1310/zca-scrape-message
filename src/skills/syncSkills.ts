import fs from "node:fs";
import path from "node:path";

/** File của skill mà Claude Code cần nạp: SKILL.md và thư mục references/ (evals.md chỉ để thử skill, không cần nạp). */
const MAX_BODY_LINES = 110;

const isSkillDir = (srcDir: string, name: string): boolean => fs.statSync(path.join(srcDir, name)).isDirectory() && fs.existsSync(path.join(srcDir, name, "SKILL.md"));

/** Tên các thư mục skill (có SKILL.md) trong `srcDir`, theo thứ tự chữ cái. File lẻ như FORMAT.md và thư mục không có SKILL.md bị bỏ qua. */
export function listSkills(srcDir: string): string[] {
    if (!fs.existsSync(srcDir)) return [];
    return fs.readdirSync(srcDir).filter((name) => isSkillDir(srcDir, name)).sort();
}

/** Đường dẫn tương đối (dùng `/`) của mọi file skill cần nạp: SKILL.md và mọi file dưới references/. */
function loadedFiles(skillDir: string): string[] {
    const files = ["SKILL.md"];
    const walk = (rel: string): void => {
        const abs = path.join(skillDir, rel);
        if (!fs.existsSync(abs)) return;
        for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
            const next = `${rel}/${entry.name}`;
            if (entry.isDirectory()) walk(next);
            else files.push(next);
        }
    };
    walk("references");
    return files;
}

/** Mọi file dưới `dir` (đường dẫn tương đối, dùng `/`). */
function allFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (rel: string): void => {
        for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
            if (entry.isDirectory()) walk(next);
            else out.push(next);
        }
    };
    if (fs.existsSync(dir)) walk("");
    return out;
}

/**
 * Chép các skill từ `srcDir` (SKILLS-Agent, nguồn chính) sang `dstDir` (.claude/skills, nơi Claude Code nạp). Mỗi skill được thay thế hoàn toàn
 * (file thừa của bản cũ bị xoá); skill khác trong `dstDir` không bị đụng tới. Trả về tên các skill đã chép.
 */
export function syncSkills(srcDir: string, dstDir: string): string[] {
    const names = listSkills(srcDir);
    for (const name of names) {
        const target = path.join(dstDir, name);
        fs.rmSync(target, { recursive: true, force: true });
        for (const rel of loadedFiles(path.join(srcDir, name))) {
            const to = path.join(target, ...rel.split("/"));
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(path.join(srcDir, name, ...rel.split("/")), to);
        }
    }
    return names;
}

function frontmatter(text: string): Record<string, string> | null {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!m) return null;
    const fields: Record<string, string> = {};
    for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(":");
        if (i > 0) fields[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return fields;
}

/** Danh sách vấn đề (tiếng Việt); rỗng nghĩa là mọi skill đã đồng bộ và theo chuẩn FORMAT.md. */
export function checkSkills(srcDir: string, dstDir: string): string[] {
    const problems: string[] = [];
    for (const name of listSkills(srcDir)) {
        const skillFile = path.join(srcDir, name, "SKILL.md");
        const text = fs.readFileSync(skillFile, "utf8");
        const fm = frontmatter(text);
        if (!fm) problems.push(`${name}: SKILL.md thiếu phần đầu (frontmatter) giữa hai dòng ---.`);
        else {
            if (fm.name !== name) problems.push(`${name}: name trong SKILL.md là "${fm.name ?? ""}", phải trùng tên thư mục "${name}".`);
            if (!fm.description) problems.push(`${name}: SKILL.md thiếu description.`);
            else {
                if (!fm.description.includes("Dùng khi")) problems.push(`${name}: description thiếu câu "Dùng khi ...".`);
                if (!fm.description.includes("KHÔNG dùng khi")) problems.push(`${name}: description thiếu câu "KHÔNG dùng khi ...".`);
            }
        }
        const lines = text.split(/\r?\n/).length;
        if (lines > MAX_BODY_LINES) problems.push(`${name}: SKILL.md dài ${lines} dòng, tối đa ${MAX_BODY_LINES} dòng (chuyển phần dài sang references/).`);

        const wanted = loadedFiles(path.join(srcDir, name));
        const target = path.join(dstDir, name);
        if (!fs.existsSync(target)) {
            problems.push(`${name}: chưa có bản trong ${dstDir}.`);
            continue;
        }
        for (const rel of wanted) {
            const copy = path.join(target, ...rel.split("/"));
            const original = path.join(srcDir, name, ...rel.split("/"));
            if (!fs.existsSync(copy)) problems.push(`${name}: thiếu ${rel} trong bản đã chép.`);
            else if (fs.readFileSync(copy, "utf8") !== fs.readFileSync(original, "utf8")) problems.push(`${name}: ${rel} khác nguồn SKILLS-Agent.`);
        }
        for (const rel of allFiles(target)) if (!wanted.includes(rel)) problems.push(`${name}: ${rel} thừa trong bản đã chép (không có ở nguồn).`);
    }
    return problems;
}
