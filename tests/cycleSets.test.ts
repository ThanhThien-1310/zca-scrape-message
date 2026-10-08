import { test } from "node:test";
import assert from "node:assert/strict";
import { messageKey } from "../src/lesson/recovery.js";
import { resolveReportSets, type ResolvedSet } from "../src/reportSets/resolve.js";
import type { ReportKey } from "../src/reportSets/registry.js";
import { runCycle, type CycleDeps } from "../src/runner/cycle.js";
import { failedKey } from "../src/runner/failedFills.js";
import { at, COMPLETE, DAY, msg } from "./fixtures.js";
import type { BuildResult, Mark, SessionKey, SourceMessage } from "../src/types/index.js";

const MORNING: SessionKey = { day: DAY, buoi: "morningstart" };
const ALL = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"];
const setsOf = (...specs: Array<{ id: string; reports: string[] }>): ResolvedSet[] => resolveReportSets(specs).active;

function harness(opts: { sets: ResolvedSet[]; messages?: SourceMessage[]; failed?: string[]; pending?: Mark[]; build?: (set: ResolvedSet, s: SessionKey, keys: ReportKey[]) => Promise<BuildResult>; extras?: (set: ResolvedSet) => Promise<string[]>; mark?: (m: Mark[]) => Promise<void> }) {
    const messages = [...(opts.messages ?? [])];
    let built = new Map<string, Set<string>>();
    let failed = new Set(opts.failed ?? []);
    let pending: Mark[] = [...(opts.pending ?? [])];
    const calls: string[] = [];
    const marked: Mark[][] = [];
    const deps: CycleDeps = {
        now: () => 5000,
        loadMessages: async () => [...messages],
        recover: async () => ({ errors: [] }),
        scrapeQueued: async () => ({ status: "done", targets: [], failed: [], gaveUp: [], outcomes: [] }),
        syncDb: async () => undefined,
        sets: () => opts.sets,
        build:
            opts.build ??
            (async (set, s, keys) => {
                calls.push(`build:${set.id}:${s.buoi}:${keys.join("+")}`);
                return { reviewCount: 1, excel: null, warnings: [], marks: [{ maNhom: "g", maTinNhan: "1", maTrangThai: 1 }], failedKeys: [] };
            }),
        buildExtras: opts.extras ?? (async (set) => (calls.push(`extras:${set.id}`), [])),
        markMessages: opts.mark ?? (async (m) => void marked.push(m)),
        built: {
            read: (ids) => {
                for (const id of ids) if (!built.has(id)) built.set(id, new Set());
                return built;
            },
            write: (b) => void (built = new Map(b)),
        },
        failed: { read: () => new Set(failed), write: (f) => void (failed = new Set(f)) },
        pendingMarks: { read: () => [...pending], write: (m) => void (pending = [...m]) },
    };
    return { deps, calls, marked, get built() { return built; }, get failed() { return failed; }, get pending() { return pending; } };
}

test("each set builds its own unbuilt sessions with its own phase keys; the day extras run per set that has day keys", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({ sets: setsOf({ id: "A", reports: ALL }, { id: "B", reports: ["mayTinh", "cleaning"] }), messages: [a] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["build:A:morningstart:netsupport+loa+internet+mayTinh", "extras:A", "build:B:morningstart:mayTinh", "extras:B"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sets, [{ id: "A", sessions: [MORNING], failedReports: [] }, { id: "B", sessions: [MORNING], failedReports: [] }]);
    assert.deepEqual([...h.built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...h.built.get("B")!], [messageKey(a)]);
});

test("a set with only day keys never builds a session; a set with only phase keys never runs the extras", async () => {
    const h = harness({ sets: setsOf({ id: "D", reports: ["dien", "cleaning"] }, { id: "P", reports: ["loa"] }), messages: [msg(COMPLETE, at(8))] });
    await runCycle(h.deps);
    assert.deepEqual(h.calls, ["extras:D", "build:P:morningstart:loa"]);
});

test("a build that throws for one set is reported with the set's id, leaves that set's session unbuilt, and the other set still builds", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({
        sets: setsOf({ id: "A", reports: ["loa"] }, { id: "B", reports: ["loa"] }),
        messages: [a],
        build: async (set) => {
            if (set.id === "A") throw new Error("extract-reports.ts thoát mã 1");
            return { reviewCount: 0, excel: null, warnings: [], marks: [], failedKeys: [] };
        },
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.match(s.buildErrors[0], /^A 2026-09-24 morningstart: extract-reports\.ts thoát mã 1/);
    assert.deepEqual([...h.built.get("A")!], []);
    assert.deepEqual([...h.built.get("B")!], [messageKey(a)]);
});

test("a report whose file failed is recorded for a retry; the session still counts as built and the cycle is ok", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({
        sets: setsOf({ id: "A", reports: ["netsupport", "loa", "internet"] }),
        messages: [a],
        build: async () => ({ reviewCount: 0, excel: null, warnings: ["fill-status-reports: thoát mã 1"], marks: [], failedKeys: ["loa"] }),
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.deepEqual([...h.failed], [failedKey("A", MORNING, "loa")]);
    assert.deepEqual(s.sets![0].failedReports, ["2026-09-24 morningstart loa"]);
    assert.deepEqual([...h.built.get("A")!], [messageKey(a)]);
    assert.ok(s.warnings.some((w) => w.startsWith("A: ") && w.includes("fill-status-reports")), JSON.stringify(s.warnings));
});

test("the next cycle retries ONLY the failed report of the built session, and clears it when it succeeds", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({ sets: setsOf({ id: "A", reports: ["netsupport", "loa", "internet"] }), messages: [a], failed: [failedKey("A", MORNING, "loa")] });
    h.deps.built.read(["A"], [a]);
    h.built.get("A")!.add(messageKey(a));
    const s = await runCycle(h.deps);
    // Bộ A chỉ có mã theo giai đoạn nên không chạy extras; chỉ có đúng một lần dựng lại, và chỉ mã `loa`.
    assert.deepEqual(h.calls, ["build:A:morningstart:loa"]);
    assert.deepEqual([...h.failed], []);
    assert.deepEqual(s.sets![0].failedReports, []);
});

test("the marks of every set are merged and written ONCE per cycle", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({
        sets: setsOf({ id: "A", reports: ["loa"] }, { id: "B", reports: ["loa"] }),
        messages: [a],
        build: async (set) => ({ reviewCount: 0, excel: null, warnings: [], marks: [{ maNhom: "g", maTinNhan: "1", maTrangThai: set.id === "A" ? 1 : 2 }], failedKeys: [] }),
    });
    await runCycle(h.deps);
    assert.deepEqual(h.marked, [[{ maNhom: "g", maTinNhan: "1", maTrangThai: 2 }]]);
});

test("a failure to write the marks is only a warning (the cycle is still ok)", async () => {
    const h = harness({ sets: setsOf({ id: "A", reports: ["loa"] }), messages: [msg(COMPLETE, at(8))], mark: async () => { throw new Error("DB down"); } });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.ok(s.warnings.some((w) => w.includes("đánh dấu tin") && w.includes("DB down")), JSON.stringify(s.warnings));
});

test("with no active set nothing is built, no extras run, and the cycle is still ok", async () => {
    const h = harness({ sets: [], messages: [msg(COMPLETE, at(8))] });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.deepEqual(h.calls, []);
    assert.deepEqual(s.sets, []);
});

test("a failure of the day extras of one set is a warning naming the set; the other set's extras still run", async () => {
    const h = harness({
        sets: setsOf({ id: "A", reports: ["dien"] }, { id: "B", reports: ["dien"] }),
        extras: async (set) => {
            if (set.id === "A") throw new Error("Excel COM lỗi");
            return ["B: fill-điện: thoát mã 1"];
        },
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.ok(s.warnings.some((w) => w.includes("A") && w.includes("Excel COM lỗi")));
    assert.ok(s.warnings.includes("B: fill-điện: thoát mã 1"));
});

test("a failure from an earlier day is dropped from the retry list with a warning and is not rebuilt", async () => {
    const stale = failedKey("A", { day: "2026-09-23", buoi: "morningstart" }, "loa");
    const h = harness({ sets: setsOf({ id: "A", reports: ["loa"] }), failed: [stale] });
    h.deps.now = () => at(10);
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, []);
    assert.deepEqual([...h.failed], []);
    assert.ok(s.warnings.some((w) => w.includes("ngày cũ") && w.includes("1")), JSON.stringify(s.warnings));
});

test("marks that could not be written are kept and written by the next cycle, even when that cycle builds nothing", async () => {
    let attempts = 0;
    const h = harness({
        sets: setsOf({ id: "A", reports: ["loa"] }),
        messages: [msg(COMPLETE, at(8))],
        mark: async () => {
            if (++attempts === 1) throw new Error("DB down");
        },
    });
    await runCycle(h.deps);
    assert.deepEqual(h.pending, [{ maNhom: "g", maTinNhan: "1", maTrangThai: 1 }]); // survives the failure
    h.calls.length = 0;
    const second = await runCycle(h.deps); // the session is already built: nothing to build, only the pending marks
    assert.deepEqual(h.calls, []);
    assert.equal(attempts, 2);
    assert.deepEqual(h.pending, []);
    assert.equal(second.ok, true);
});

test("the marks are persisted as soon as a build finishes, before the cycle ends (a kill after the build must not lose them)", async () => {
    const h = harness({ sets: setsOf({ id: "A", reports: ["loa"] }), messages: [msg(COMPLETE, at(8))], mark: async () => { throw new Error("process killed here"); } });
    await runCycle(h.deps);
    assert.equal(h.pending.length, 1);
});
