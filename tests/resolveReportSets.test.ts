import { test } from "node:test";
import assert from "node:assert/strict";
import { invalidSetIdReason, resolveReportSets } from "../src/reportSets/resolve.js";

const ALL = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"];

test("one valid set: its reports come out in registry order, split into phase and day keys", () => {
    const r = resolveReportSets([{ id: "NguyenVanA", reports: ["attendance", "loa", "netsupport", "dien"] }]);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.active, [{ id: "NguyenVanA", reports: ["netsupport", "loa", "dien", "attendance"], phaseKeys: ["netsupport", "loa"], dayKeys: ["dien", "attendance"] }]);
});

test("an id with Vietnamese letters and an inner space is valid", () => {
    const r = resolveReportSets([{ id: "Nguyễn Văn A", reports: ["loa"] }]);
    assert.deepEqual(r.problems, []);
    assert.equal(r.active[0].id, "Nguyễn Văn A");
});

test("reportSets missing, not an array or empty is a loud error and never throws", () => {
    for (const raw of [undefined, null, "x", 5, {}, []]) {
        const r = resolveReportSets(raw);
        assert.deepEqual(r.active, []);
        assert.equal(r.problems.length, 1, JSON.stringify(raw));
        assert.equal(r.problems[0].level, "error");
        assert.match(r.problems[0].message, /reportSets/);
    }
});

test("a set with no reports (missing, empty or not an array) is skipped with an error; the other sets still run", () => {
    for (const reports of [undefined, [], "loa"]) {
        const r = resolveReportSets([{ id: "A", reports }, { id: "B", reports: ["loa"] }]);
        assert.deepEqual(r.active.map((s) => s.id), ["B"]);
        assert.ok(r.problems.some((p) => p.level === "error" && p.setId === "A" && /chưa khai reports/.test(p.message)), JSON.stringify(reports));
    }
});

test("an unknown report code skips only that entry, names the code and lists the valid ones", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa", "maytinh", "dien"] }]);
    assert.deepEqual(r.active[0].reports, ["loa", "dien"]);
    const p = r.problems.find((x) => x.level === "error")!;
    assert.equal(p.setId, "A");
    assert.match(p.message, /"maytinh"/);
    assert.match(p.message, /netsupport, loa, internet, mayTinh, dien, cleaning, attendance/);
});

test("a set whose reports are all unknown is disabled", () => {
    const r = resolveReportSets([{ id: "A", reports: ["x"] }, { id: "B", reports: ["loa"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["B"]);
    assert.ok(r.problems.some((p) => p.setId === "A" && /không còn mã báo cáo hợp lệ/.test(p.message)));
});

test("a code listed twice in one set counts once, with a warning", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa", "loa"] }]);
    assert.deepEqual(r.active[0].reports, ["loa"]);
    assert.deepEqual(r.problems.map((p) => p.level), ["warning"]);
});

test("ids that differ only by case are duplicates: both sets are disabled", () => {
    const r = resolveReportSets([{ id: "NguyenVanA", reports: ["loa"] }, { id: "nguyenvana", reports: ["dien"] }, { id: "B", reports: ["loa"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["B"]);
    assert.ok(r.problems.some((p) => p.level === "error" && /trùng/.test(p.message)));
});

test("an invalid id disables only that set", () => {
    const bad = ["", " A", "A ", "A.", "a/b", "a\\b", "a:b", "a*b", 'a"b', "a<b", "a|b", "CON", "nul", "com1", "lpt9.txt", "x".repeat(101)];
    for (const id of bad) {
        const r = resolveReportSets([{ id, reports: ["loa"] }, { id: "Ok", reports: ["loa"] }]);
        assert.deepEqual(r.active.map((s) => s.id), ["Ok"], JSON.stringify(id));
        assert.ok(r.problems.some((p) => p.level === "error"), JSON.stringify(id));
    }
    assert.equal(invalidSetIdReason("Con Ga"), null);
    assert.equal(invalidSetIdReason("A-B_C 1"), null);
    assert.notEqual(invalidSetIdReason(5), null);
});

test("an entry that is not an object, or has no string id, is reported and skipped", () => {
    const r = resolveReportSets([null, "x", { reports: ["loa"] }, { id: 7, reports: ["loa"] }, { id: "Ok", reports: ["loa"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["Ok"]);
    assert.equal(r.problems.filter((p) => p.level === "error").length, 4);
});

test("the same code in two sets is allowed and only noted", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa"] }, { id: "B", reports: ["loa", "dien"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["A", "B"]);
    assert.deepEqual(r.problems.map((p) => p.level), ["warning"]);
    assert.match(r.problems[0].message, /"loa".*A, B/);
});

test("when no set survives, one extra error says the bot exports nothing", () => {
    const r = resolveReportSets([{ id: "A", reports: [] }]);
    assert.deepEqual(r.active, []);
    assert.ok(r.problems.some((p) => p.setId === null && /Không có bộ báo cáo hợp lệ nào/.test(p.message)));
});

test("all seven codes in one set is the current behaviour", () => {
    const r = resolveReportSets([{ id: "A", reports: ALL }]);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.active[0].phaseKeys, ["netsupport", "loa", "internet", "mayTinh"]);
    assert.deepEqual(r.active[0].dayKeys, ["dien", "cleaning", "attendance"]);
});
