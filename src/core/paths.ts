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

/** The chat rules file the user edits. */
export const chatRulesPath = path.join(repoRoot, "chat-rules.json");
