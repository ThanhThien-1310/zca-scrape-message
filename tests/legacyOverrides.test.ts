import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { outputDir, setOutputDir } from "../src/core/paths.js";
import { legacyOverridesWarning } from "../src/reportSets/legacy.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";

const sets = resolveReportSets([{ id: "A", reports: ["loa"] }, { id: "B", reports: ["mayTinh"] }]).active;
const legacy = path.join(outputDir, "overrides.json");

test("no legacy overrides.json: nothing to say", () => {
    assert.equal(legacyOverridesWarning(sets, () => false), null);
});

test("a legacy overrides.json with sets that have none of their own: warns, names the sets and the copy command", () => {
    const w = legacyOverridesWarning(sets, (f) => f === legacy)!;
    assert.ok(w.includes(path.join("output", "overrides.json")), w);
    assert.match(w, /"A"/);
    assert.match(w, /"B"/);
    assert.match(w, /Copy-Item/);
});

test("sets that already have their own overrides.json are not named", () => {
    const w = legacyOverridesWarning(sets, (f) => f === legacy || f === path.join(setOutputDir("A"), "overrides.json"))!;
    assert.doesNotMatch(w, /"A"/);
    assert.match(w, /"B"/);
});

test("when every set has its own file the legacy one is harmless: no warning", () => {
    assert.equal(legacyOverridesWarning(sets, () => true), null);
});
