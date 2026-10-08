import path from "node:path";
import { repoRoot } from "../core/paths.js";
import { checkSkills } from "../skills/syncSkills.js";

/**
 * Kiểm các skill: SKILL.md theo chuẩn SKILLS-Agent/FORMAT.md (name trùng thư mục, description có "Dùng khi" và "KHÔNG dùng khi", tối đa 110 dòng)
 * và bản trong `.claude/skills/` khớp nguồn `SKILLS-Agent/`. Thoát mã 1 khi có vấn đề. Chỉ đọc.
 *
 *   npm run skills:check
 */
const problems = checkSkills(path.join(repoRoot, "SKILLS-Agent"), path.join(repoRoot, ".claude", "skills"));
for (const p of problems) console.error(`[skills] ${p}`);
console.log(problems.length === 0 ? "[skills] các skill hợp lệ và đã đồng bộ." : `[skills] ${problems.length} vấn đề. Sửa nguồn rồi chạy: npm run skills:sync`);
if (problems.length > 0) process.exitCode = 1;
