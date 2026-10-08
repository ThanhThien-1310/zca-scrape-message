import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkSkills, syncSkills } from "../src/skills/syncSkills.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "skills-"));
const put = (root: string, rel: string, content: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, "utf8");
};
const skill = (name: string, extra = "") => `---\nname: ${name}\ndescription: Làm việc X. Dùng khi cần X. KHÔNG dùng khi cần Y.\n---\n\n# ${name}\n${extra}`;

test("syncSkills copies SKILL.md and references, leaves evals.md and loose files behind, and returns the skill names", () => {
    const src = tmp();
    const dst = tmp();
    put(src, "a/SKILL.md", skill("a"));
    put(src, "a/evals.md", "evals");
    put(src, "a/references/r.md", "ref");
    put(src, "FORMAT.md", "not a skill");
    put(src, "nodoc/readme.md", "no SKILL.md here");
    assert.deepEqual(syncSkills(src, dst), ["a"]);
    assert.equal(fs.readFileSync(path.join(dst, "a", "SKILL.md"), "utf8"), skill("a"));
    assert.equal(fs.readFileSync(path.join(dst, "a", "references", "r.md"), "utf8"), "ref");
    assert.ok(!fs.existsSync(path.join(dst, "a", "evals.md")));
    assert.ok(!fs.existsSync(path.join(dst, "FORMAT.md")));
    assert.ok(!fs.existsSync(path.join(dst, "nodoc")));
});

test("syncSkills replaces what it owns (stale files of a synced skill are removed) and never touches other skills in the destination", () => {
    const src = tmp();
    const dst = tmp();
    put(src, "a/SKILL.md", skill("a", "v2"));
    put(dst, "a/SKILL.md", skill("a", "v1"));
    put(dst, "a/references/old.md", "stale");
    put(dst, "other/SKILL.md", "someone else's skill");
    syncSkills(src, dst);
    assert.ok(fs.readFileSync(path.join(dst, "a", "SKILL.md"), "utf8").includes("v2"));
    assert.ok(!fs.existsSync(path.join(dst, "a", "references", "old.md")));
    assert.equal(fs.readFileSync(path.join(dst, "other", "SKILL.md"), "utf8"), "someone else's skill");
});

test("checkSkills: a clean sync has no problems", () => {
    const src = tmp();
    const dst = tmp();
    put(src, "a/SKILL.md", skill("a"));
    put(src, "a/references/r.md", "ref");
    syncSkills(src, dst);
    assert.deepEqual(checkSkills(src, dst), []);
});

test("checkSkills: reports a missing copy, a copy that differs, and a stale extra file", () => {
    const src = tmp();
    const dst = tmp();
    put(src, "a/SKILL.md", skill("a"));
    put(src, "b/SKILL.md", skill("b"));
    syncSkills(src, dst);
    fs.rmSync(path.join(dst, "b"), { recursive: true });
    put(dst, "a/SKILL.md", skill("a", "edited"));
    put(dst, "a/references/stale.md", "x");
    const problems = checkSkills(src, dst).join("\n");
    assert.match(problems, /b.*chưa có bản trong/);
    assert.match(problems, /a.*SKILL\.md.*khác/);
    assert.match(problems, /a.*stale\.md.*thừa/);
});

test("checkSkills: frontmatter must have name equal to the folder, a description with 'Dùng khi' and 'KHÔNG dùng khi', and the body must be at most 110 lines", () => {
    const src = tmp();
    const dst = tmp();
    put(src, "good/SKILL.md", skill("good"));
    put(src, "wrongname/SKILL.md", skill("other-name"));
    put(src, "nodesc/SKILL.md", "---\nname: nodesc\n---\n\n# x\n");
    put(src, "triggers/SKILL.md", "---\nname: triggers\ndescription: Chỉ nói làm gì.\n---\n\n# x\n");
    put(src, "long/SKILL.md", skill("long", "dòng\n".repeat(120)));
    syncSkills(src, dst);
    const problems = checkSkills(src, dst).join("\n");
    assert.doesNotMatch(problems, /good/);
    assert.match(problems, /wrongname.*name/);
    assert.match(problems, /nodesc.*description/);
    assert.match(problems, /triggers.*Dùng khi/);
    assert.match(problems, /long.*110 dòng/);
});
