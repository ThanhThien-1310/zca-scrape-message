import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProblem, hasSetErrors, logSetProblems, pickSet, requireKey } from "../src/reportSets/cliSet.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";

const two = resolveReportSets([{ id: "A", reports: ["loa", "dien"] }, { id: "B", reports: ["mayTinh"] }]).active;
const one = resolveReportSets([{ id: "A", reports: ["loa"] }]).active;

test("pickSet: an explicit id picks that set exactly", () => {
    assert.equal(pickSet(two, "B").id, "B");
});

test("pickSet: no id is fine with exactly one active set", () => {
    assert.equal(pickSet(one, undefined).id, "A");
});

test("pickSet: no id with several sets asks for --set and lists them", () => {
    assert.throws(() => pickSet(two, undefined), /--set.*A, B/);
});

test("pickSet: an unknown id lists the valid ones; no active set says so", () => {
    assert.throws(() => pickSet(two, "C"), /"C".*A, B/);
    assert.throws(() => pickSet([], undefined), /không có bộ báo cáo nào/);
});

test("requireKey: a set that did not enable the report is refused with its list", () => {
    assert.doesNotThrow(() => requireKey(two[0], "dien"));
    assert.throws(() => requireKey(two[1], "dien"), /"B".*"dien".*mayTinh/);
});

test("describeProblem and logSetProblems print errors and warnings, errors first-class", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa", "x"] }]);
    const lines: string[] = [];
    logSetProblems(r.problems, (l) => lines.push(l));
    assert.equal(lines.length, r.problems.length);
    assert.match(describeProblem(r.problems[0]), /^\[bộ báo cáo\] LỖI \(A\): /);
    assert.equal(hasSetErrors(r.problems), true);
    assert.equal(hasSetErrors([{ level: "warning", setId: null, message: "m" }]), false);
});

test("formatSetsReport lists the sets that run and every problem, so config:show can show a disabled set and why", async () => {
    const { formatSetsReport } = await import("../src/reportSets/cliSet.js");
    const good = formatSetsReport(resolveReportSets([{ id: "A", reports: ["loa", "dien"] }, { id: "B", reports: ["mayTinh"] }])).join("\n");
    assert.match(good, /A: loa, dien/);
    assert.match(good, /B: mayTinh/);
    const bad = formatSetsReport(resolveReportSets([{ id: "A", reports: ["loa", "nope"] }, { id: "A/B", reports: ["loa"] }])).join("\n");
    assert.match(bad, /A: loa/);
    assert.match(bad, /\[bộ báo cáo\] LỖI \(A\)/);
    assert.match(bad, /A\/B/);
    const none = formatSetsReport(resolveReportSets(undefined)).join("\n");
    assert.match(none, /KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY/);
});
