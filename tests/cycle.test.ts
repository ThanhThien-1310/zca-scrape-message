import { test } from "node:test";
import assert from "node:assert/strict";
import { messageKey } from "../src/lesson/recovery.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";
import { runCycle, type CycleDeps } from "../src/runner/cycle.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg } from "./fixtures.js";
import type { BuildResult, QueueRunResult, SessionKey, SourceMessage } from "../src/types/index.js";

// COMPLETE (DauBuoi) at 8:00 -> raw morningstart, no reroute. IT_MAINTENANCE (CuoiBuoi) at 13:00 -> afternoonstart.
const MORNING: SessionKey = { day: DAY, buoi: "morningstart" };
const AFTERNOON: SessionKey = { day: DAY, buoi: "afternoonstart" };
const SET = resolveReportSets([{ id: "A", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] }]).active;

function harness(opts: {
    messages?: SourceMessage[];
    scraped?: SourceMessage[];
    built?: string[];
    scrape?: () => Promise<QueueRunResult>;
    build?: (s: SessionKey) => Promise<BuildResult>;
    buildExtras?: () => Promise<string[]>;
} = {}) {
    const messages = [...(opts.messages ?? [])];
    let builtMap = new Map<string, Set<string>>();
    const calls: string[] = [];
    const deps: CycleDeps = {
        now: () => 5000,
        loadMessages: async () => [...messages],
        recover: async () => {
            calls.push("recover");
            return { errors: [] };
        },
        scrapeQueued:
            opts.scrape ??
            (async () => {
                calls.push("scrape");
                messages.push(...(opts.scraped ?? []));
                return { status: "done", targets: ["A"], failed: [], gaveUp: [], outcomes: [] };
            }),
        syncDb: async () => {
            calls.push("sync");
        },
        sets: () => SET,
        build: async (_set, s) => {
            if (opts.build) return opts.build(s);
            calls.push(`build:${s.day} ${s.buoi}`);
            return { reviewCount: 1, excel: `x_${s.buoi}.xlsm`, warnings: [], marks: [], failedKeys: [] };
        },
        buildExtras: async () => (opts.buildExtras ? opts.buildExtras() : []),
        markMessages: async () => undefined,
        built: {
            read: (ids) => {
                for (const id of ids) if (!builtMap.has(id)) builtMap.set(id, new Set(opts.built ?? []));
                return builtMap;
            },
            write: (b) => void (builtMap = new Map(b)),
        },
        failed: { read: () => new Set(), write: () => undefined },
        pendingMarks: { read: () => [], write: () => undefined },
    };
    return { deps, calls, get built() { return builtMap.get("A") ?? new Set<string>(); } };
}

test("a cycle recovers, scrapes, syncs, then builds each session with an unbuilt report, in that order", async () => {
    const h = harness({ scraped: [msg(COMPLETE, at(8)), msg(IT_MAINTENANCE, at(13))] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync", "build:2026-09-24 morningstart", "build:2026-09-24 afternoonstart"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sessions, [MORNING, AFTERNOON]);
    assert.deepEqual(s.groups, ["A"]);
    assert.deepEqual(s.excel, ["x_morningstart.xlsm", "x_afternoonstart.xlsm"]);
    assert.equal(s.reviewCount, 2);
    assert.equal(h.built.size, 2);
});

test("when the scrape cannot run nothing is synced or built and the cycle is a failure", async () => {
    const h = harness({
        scrape: async () => {
            throw new Error("CDP not reachable");
        },
    });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover"]);
    assert.equal(s.ok, false);
    assert.match(s.errors[0], /CDP not reachable/);
});

test("a group that failed to scrape is a warning, not a failure", async () => {
    const h = harness({ scrape: async () => ({ status: "done", targets: ["A", "B"], failed: ["B"], gaveUp: [], outcomes: [] }) });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.deepEqual(s.groups, ["A", "B"]);
    assert.match(s.warnings.join("\n"), /không cào được "B"/);
});

test("with nothing unbuilt the database is still synced (an earlier crash may have left rows unsynced) but nothing is built", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({ messages: [a], built: [messageKey(a)] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sessions, []);
});

test("a report saved by an earlier cycle that died before building is built now, although this scrape brought nothing new", async () => {
    const onDisk = msg(COMPLETE, at(8)); // scraped by a cycle that crashed, so never marked built
    const h = harness({ messages: [onDisk] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync", "build:2026-09-24 morningstart"]);
    assert.deepEqual(s.sessions, [MORNING]);
    assert.deepEqual([...h.built], [messageKey(onDisk)]);
});

test("a built report is not built again by the next cycle", async () => {
    const h = harness({ scraped: [msg(COMPLETE, at(8))] });
    await runCycle(h.deps);
    h.calls.length = 0;
    await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync"]);
});

test("a build failure is reported but does not fail the cycle; the session stays unbuilt and the others still build", async () => {
    const a = msg(COMPLETE, at(8));
    const b = msg(IT_MAINTENANCE, at(13));
    const h = harness({
        scraped: [a, b],
        build: async (s) => {
            if (s.buoi === "morningstart") throw new Error("Excel COM failed");
            return { reviewCount: 0, excel: "x_afternoonstart.xlsm", warnings: [], marks: [], failedKeys: [] };
        },
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.match(s.buildErrors[0], /A 2026-09-24 morningstart: Excel COM failed/);
    assert.deepEqual(s.errors, []);
    assert.deepEqual(s.excel, ["x_afternoonstart.xlsm"]);
    assert.deepEqual([...h.built], [messageKey(b)]);
});

test("build warnings (for example an Excel saved as _moi) reach the summary", async () => {
    const h = harness({
        scraped: [msg(COMPLETE, at(8))],
        build: async () => ({ reviewCount: 0, excel: "b_moi.xlsm", warnings: ["file đang mở, đã lưu thành b_moi.xlsm"], marks: [], failedKeys: [] }),
    });
    const s = await runCycle(h.deps);
    assert.deepEqual(s.warnings, ["A: file đang mở, đã lưu thành b_moi.xlsm"]);
});

test("a group dropped after its last attempt is a warning that says it was dropped", async () => {
    const h = harness({ scrape: async () => ({ status: "done", targets: ["A", "B"], failed: ["B"], gaveUp: ["B"], outcomes: [] }) });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.match(s.warnings.join("\n"), /bỏ "B" khỏi hàng chờ.*scrape:add/);
});

test("the cycle records how long it took, how long each step took and how long each group took to scrape", async () => {
    let clock = 10_000;
    const tick = (ms: number) => (clock += ms);
    const timings = [
        { target: "A", ms: 12_000, scraped: 40, written: 3 },
        { target: "B", ms: 8_000, error: "sidebar item not found" },
    ];
    const h = harness({
        scrape: async () => {
            tick(20_000);
            return { status: "done", targets: ["A", "B"], failed: ["B"], gaveUp: [], outcomes: timings };
        },
    });
    h.deps.now = () => clock;
    h.deps.recover = async () => {
        tick(1_000);
        return { errors: [] };
    };
    h.deps.syncDb = async () => {
        tick(3_000);
    };
    const s = await runCycle(h.deps);
    assert.equal(s.durationMs, 24_000);
    assert.deepEqual(s.stepMs, { recover: 1_000, scrape: 20_000, load: 0, sync: 3_000, build: 0 });
    assert.deepEqual(s.timings, [
        { target: "A", ms: 12_000, ok: true, scraped: 40, written: 3 },
        { target: "B", ms: 8_000, ok: false },
    ]);
});

test("a cycle that fails midway still reports the time it spent", async () => {
    let clock = 0;
    const h = harness({
        scrape: async () => {
            clock += 5_000;
            throw new Error("CDP not reachable");
        },
    });
    h.deps.now = () => clock;
    const s = await runCycle(h.deps);
    assert.equal(s.ok, false);
    assert.equal(s.durationMs, 5_000);
});

test("runCycle calls buildExtras exactly once, even with zero dirty sessions", async () => {
    let calls = 0;
    const h = harness({ buildExtras: async () => { calls++; return []; } });
    await runCycle(h.deps);
    assert.equal(calls, 1);
});

test("runCycle: a buildExtras failure becomes a warning, does not fail the cycle", async () => {
    const h = harness({ buildExtras: async () => { throw new Error("Excel COM lỗi"); } });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.ok(s.warnings.some((w) => w.includes("Excel COM lỗi")));
});

test("runCycle: buildExtras returning warnings surfaces them in summary.warnings", async () => {
    const h = harness({ buildExtras: async () => ["fill-vệ sinh: thoát mã 1"] });
    const s = await runCycle(h.deps);
    assert.ok(s.warnings.includes("fill-vệ sinh: thoát mã 1"));
});
