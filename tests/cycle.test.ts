import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueRunResult } from "../history/queueRun.js";
import type { SourceMessage } from "../lesson/types.js";
import type { SessionKey } from "../runner/affectedSessions.js";
import { runCycle, type BuildResult, type CycleDeps } from "../runner/cycle.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg } from "./fixtures.js";

const SANG: SessionKey = { day: DAY, buoi: "sang" };
const CHIEU: SessionKey = { day: DAY, buoi: "chieu" };

function harness(opts: {
    messages?: SourceMessage[];
    scraped?: SourceMessage[];
    scrape?: () => Promise<QueueRunResult>;
    build?: (s: SessionKey) => Promise<BuildResult>;
    pending?: SessionKey[];
} = {}) {
    const messages = [...(opts.messages ?? [])];
    let pending = [...(opts.pending ?? [])];
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
                return { status: "done", targets: ["A"], failed: [] };
            }),
        syncDb: async () => {
            calls.push("sync");
        },
        build:
            opts.build ??
            (async (s) => {
                calls.push(`build:${s.day} ${s.buoi}`);
                return { reviewCount: 1, excel: `x_${s.buoi}.xlsm`, warnings: [] };
            }),
        pending: { read: () => [...pending], write: (l) => void (pending = [...l]) },
    };
    return { deps, calls, get pending() { return pending; } };
}

test("a cycle recovers, scrapes, syncs, then builds each affected session, in that order", async () => {
    const h = harness({ scraped: [msg(COMPLETE, at(9)), msg(IT_MAINTENANCE, at(13))] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync", "build:2026-09-24 sang", "build:2026-09-24 chieu"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sessions, [SANG, CHIEU]);
    assert.deepEqual(s.groups, ["A"]);
    assert.deepEqual(s.excel, ["x_sang.xlsm", "x_chieu.xlsm"]);
    assert.equal(s.reviewCount, 2);
    assert.deepEqual(h.pending, []);
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

test("a group that failed to scrape is a warning, not a failure; the rest is still built", async () => {
    const h = harness({ scrape: async () => ({ status: "done", targets: ["A", "B"], failed: ["B"] }) });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.deepEqual(s.groups, ["A", "B"]);
    assert.match(s.warnings.join("\n"), /không cào được "B"/);
});

test("with no new report the database is still synced (an earlier crash may have left rows unsynced) but nothing is built", async () => {
    const h = harness();
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sessions, []);
});

test("a session left pending by a crashed cycle is rebuilt even though no new message arrived", async () => {
    const h = harness({ pending: [SANG] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync", "build:2026-09-24 sang"]);
    assert.deepEqual(s.sessions, [SANG]);
    assert.deepEqual(h.pending, []);
});

test("the sessions to build are saved as pending before the database sync, so a crash there loses nothing", async () => {
    const h = harness({ scraped: [msg(COMPLETE, at(9))] });
    let pendingAtSync: SessionKey[] = [];
    const sync = h.deps.syncDb;
    h.deps.syncDb = async () => {
        pendingAtSync = h.deps.pending.read();
        await sync();
    };
    await runCycle(h.deps);
    assert.deepEqual(pendingAtSync, [SANG]);
});

test("a session whose build fails stays pending and fails the cycle, while the other sessions still build", async () => {
    const h = harness({
        scraped: [msg(COMPLETE, at(9)), msg(IT_MAINTENANCE, at(13))],
        build: async (s) => {
            if (s.buoi === "sang") throw new Error("Excel COM failed");
            return { reviewCount: 0, excel: "x_chieu.xlsm", warnings: [] };
        },
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, false);
    assert.match(s.errors[0], /2026-09-24 sang: Excel COM failed/);
    assert.deepEqual(s.excel, ["x_chieu.xlsm"]);
    assert.deepEqual(h.pending, [SANG]);
});

test("build warnings (for example an Excel saved as _moi) reach the summary", async () => {
    const h = harness({
        scraped: [msg(COMPLETE, at(9))],
        build: async () => ({ reviewCount: 0, excel: "b_moi.xlsm", warnings: ["file đang mở, đã lưu thành b_moi.xlsm"] }),
    });
    const s = await runCycle(h.deps);
    assert.deepEqual(s.warnings, ["file đang mở, đã lưu thành b_moi.xlsm"]);
});
