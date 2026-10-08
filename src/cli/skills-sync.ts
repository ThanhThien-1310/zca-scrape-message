import path from "node:path";
import { repoRoot } from "../core/paths.js";
import { syncSkills } from "../skills/syncSkills.js";

/**
 * Chép các skill từ `SKILLS-Agent/` (nguồn chính, sửa ở đây) sang `.claude/skills/` (nơi Claude Code nạp để tự dùng skill theo `description`).
 * Chạy lại sau mỗi lần sửa skill; `npm test` sẽ báo nếu hai bên lệch nhau.
 *
 *   npm run skills:sync
 */
const names = syncSkills(path.join(repoRoot, "SKILLS-Agent"), path.join(repoRoot, ".claude", "skills"));
console.log(names.length === 0 ? "[skills] không có skill nào trong SKILLS-Agent/." : `[skills] đã chép ${names.length} skill sang .claude/skills/: ${names.join(", ")}`);
