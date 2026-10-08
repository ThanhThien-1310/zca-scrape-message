import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every path the code derives from where the project lives, in one place. This file sits at `src/core/`, so the
 * project root is two levels up; nothing else should compute it from its own `import.meta.url`.
 * The data folder is `config.dataDir`, not here, because it is a setting.
 */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Source folder; the runner spawns the command-line scripts under `src/cli/` from here. */
export const srcDir = path.join(repoRoot, "src");

/** Extractor and runner output (`output.json`, `review*.json`, `runner-log.jsonl`, ...). */
export const outputDir = path.join(repoRoot, "output");

/** PowerShell helpers such as the Excel filler. */
export const scriptsDir = path.join(repoRoot, "scripts");

/** Excel templates live next to the project folder (`<workspace>/templates`), not inside it. */
export const templatesDir = path.resolve(repoRoot, "..", "templates");

/**
 * Folder of one day's status reports: `<root>/<yyMM>/<yyMMdd>`, `root` being `config.statusExportDir`. `day` is `YYYY-MM-DD`
 * or `yyMMdd`. Every exporter (the 4 phases and `bot:total`) goes through here so they always agree on the layout.
 */
export function statusReportDir(root: string, day: string): string {
    const yyMMdd = /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10) : day;
    return path.join(root, yyMMdd.slice(0, 4), yyMMdd);
}

/**
 * Folder of ONE person's reports for a day: `<root>/<yyMM>/<yyMMdd>/<setId>`. The person's folder sits INSIDE the day, so
 * `statusReportDir` keeps its signature and the old per-day folder is simply the parent of every person's folder.
 */
export function setReportDir(root: string, setId: string, day: string): string {
    return path.join(statusReportDir(root, day), setId);
}

/** Work folder of one report set: `output/<setId>/` holds its `output.json`, `marks.json`, `review*.json`, `meta.json`, `overrides.json`. */
export function setOutputDir(setId: string): string {
    return path.join(outputDir, setId);
}

/** The chat rules file the user edits. */
export const chatRulesPath = path.join(repoRoot, "chat-rules.json");

/** Luật cho từng loại ảnh (được commit): `photo-rules/<mã>.json`. */
export const photoRulesDir = path.join(repoRoot, "photo-rules");

/** Đáp án đúng của người dùng để đo độ chính xác (được commit): `photo-golden/<mã luật>.json`. */
export const photoGoldenDir = path.join(repoRoot, "photo-golden");

/** Các bộ ảnh dẫn xuất: `<dataDir>/photo-reports/<yyyy-MM-dd>/<mã nhóm>/<mã bộ>/`. `dataDir` là `config.dataDir`. */
export function photoReportsDir(dataDir: string): string {
    return path.join(dataDir, "photo-reports");
}
