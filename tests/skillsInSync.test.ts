import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { repoRoot } from "../src/core/paths.js";
import { checkSkills } from "../src/skills/syncSkills.js";

test("the skills Claude Code loads (.claude/skills) match SKILLS-Agent and follow FORMAT.md; fix with `npm run skills:sync`", () => {
    const problems = checkSkills(path.join(repoRoot, "SKILLS-Agent"), path.join(repoRoot, ".claude", "skills"));
    assert.deepEqual(problems, [], `\n${problems.join("\n")}\nChạy: npm run skills:sync`);
});
