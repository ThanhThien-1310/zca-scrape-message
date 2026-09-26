import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRecovered, findMissingGroups, gapsInWindow, messageKey, sessionWindow } from "../src/lesson/recovery.js";
import { runRecovery, type RecoveryDeps } from "../src/lesson/recoveryRun.js";
import type { Gap } from "../src/watch/watchState.js";
import { sessionOf } from "../src/lesson/time.js";
import type { SourceMessage } from "../src/lesson/types.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg, SPECIALIST } from "./fixtures.js";

const A = { groupId: "gA", groupName: "A" };
const B = { groupId: "gB", groupName: "B" };
const C = { groupId: "gC", groupName: "C" };
const W = sessionWindow(DAY, "sang");
const crash = (fromH: number, toH: number | null): Gap => ({ from: at(fromH), to: toH === null ? null : at(toH), reason: "crash" });

test("sessionWindow covers the Vietnam session as a half-open range", () => {
    assert.deepEqual(sessionWindow("2026-09-24", "sang"), { from: Date.UTC(2026, 8, 23, 17), to: Date.UTC(2026, 8, 24, 5) });
    assert.deepEqual(sessionWindow("2026-09-24", "chieu"), { from: Date.UTC(2026, 8, 24, 5), to: Date.UTC(2026, 8, 24, 11) });
    assert.deepEqual(sessionWindow("2026-09-24", "toi"), { from: Date.UTC(2026, 8, 24, 11), to: Date.UTC(2026, 8, 24, 17) });
});

test("sessionWindow agrees with sessionOf at both edges of every session", () => {
    for (const buoi of ["sang", "chieu", "toi"] as const) {
        const w = sessionWindow(DAY, buoi);
        assert.equal(sessionOf(w.from), buoi, `${buoi} start`);
        assert.equal(sessionOf(w.to - 1), buoi, `${buoi} last ms`);
        assert.notEqual(sessionOf(w.to), buoi, `${buoi} end is exclusive`);
    }
});

test("gapsInWindow keeps only gaps that overlap the session", () => {
    const dayBefore: Gap = { from: at(1) - 86_400_000, to: at(2) - 86_400_000, reason: "crash" };
    const gaps: Gap[] = [dayBefore, crash(9, 10), crash(13, 14), { from: at(11), to: null, reason: "stopped" }];
    assert.deepEqual(gapsInWindow(gaps, W, at(20)), [crash(9, 10), { from: at(11), to: null, reason: "stopped" }]);
});

test("findMissingGroups lists targets lacking a start or an end report in the session", () => {
    const messages: SourceMessage[] = [
        msg(COMPLETE, at(7), A), msg(IT_MAINTENANCE, at(11), A), // A: complete
        msg(COMPLETE, at(7), B), // B: no end report
        msg(SPECIALIST, at(8), C), // C: only another kind of report
        msg(IT_MAINTENANCE, at(14), B), // outside the session
        msg(COMPLETE, at(8), { groupId: "gD", groupName: "D" }), // not a target
        msg(COMPLETE, at(9), { ...C, msgType: "chat.photo" }), // not text
    ];
    assert.deepEqual(findMissingGroups(messages, ["A", "B", "C"], W), [
        { target: "B", missing: ["CuoiBuoi"] },
        { target: "C", missing: ["DauBuoi", "CuoiBuoi"] },
    ]);
});

test("diffRecovered returns only messages new since before, inside the session, oldest first", () => {
    const old = msg(COMPLETE, at(7), A);
    const late = msg(IT_MAINTENANCE, at(11), A);
    const chatter = msg("cho hỏi tí", at(9), B);
    const outside = msg(IT_MAINTENANCE, at(15), B);
    const got = diffRecovered(new Set([messageKey(old)]), [old, late, chatter, outside], W);
    assert.deepEqual(
        got.map((m) => [m.groupName, m.msgId, m.kind, m.preview]),
        [
            ["B", chatter.msgId, null, "cho hỏi tí"],
            ["A", late.msgId, "CuoiBuoi", "BÁO CÁO CUỐI BUỔI DẠY"],
        ],
    );
});

// ---------------------------------------------------------------- runRecovery
function deps(over: Partial<RecoveryDeps> & { before: SourceMessage[]; after?: SourceMessage[] }): { deps: RecoveryDeps; scraped: Array<{ targets: string[]; sinceTs: number }> } {
    const scraped: Array<{ targets: string[]; sinceTs: number }> = [];
    let loads = 0;
    const d: RecoveryDeps = {
        now: () => at(12, 30),
        targets: ["A", "B", "C"],
        ignoreTargets: [],
        loadMessages: async () => (loads++ === 0 ? over.before : (over.after ?? over.before)),
        gaps: () => [crash(8, 9)],
        scrape: async (targets, sinceTs) => {
            scraped.push({ targets, sinceTs });
            return targets.map((target) => ({ target }));
        },
        ...over,
    };
    return { deps: d, scraped };
}

test("no gap in the session: nothing is scraped", async () => {
    const { deps: d, scraped } = deps({ before: [msg(COMPLETE, at(7), A)], gaps: () => [crash(13, 14)] });
    const r = await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.equal(r.status, "no-gap");
    assert.equal(scraped.length, 0);
});

test("a gap but every expected report present: nothing is scraped", async () => {
    const full = [msg(COMPLETE, at(7), A), msg(IT_MAINTENANCE, at(11), A), msg(COMPLETE, at(7), B), msg(IT_MAINTENANCE, at(11), B), msg(COMPLETE, at(7), C), msg(IT_MAINTENANCE, at(11), C)];
    const { deps: d, scraped } = deps({ before: full });
    const r = await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.equal(r.status, "nothing-missing");
    assert.equal(scraped.length, 0);
});

test("a gap with missing reports scrapes only those groups, from just before the gap, and reports what came back", async () => {
    const startA = msg(COMPLETE, at(7), A);
    const endA = msg(IT_MAINTENANCE, at(11), A);
    const startB = msg(COMPLETE, at(7), B);
    const endB = msg(IT_MAINTENANCE, at(11), B); // arrives only through the recovery scrape
    const { deps: d, scraped } = deps({
        before: [startA, endA, startB],
        after: [startA, endA, startB, endB],
        targets: ["A", "B"],
    });
    const r = await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.equal(r.status, "recovered");
    assert.deepEqual(scraped, [{ targets: ["B"], sinceTs: at(8) - 5 * 60_000 }]);
    assert.deepEqual(r.candidates, [{ target: "B", missing: ["CuoiBuoi"] }]);
    assert.deepEqual(r.recovered.map((m) => [m.groupName, m.msgId, m.kind]), [["B", endB.msgId, "CuoiBuoi"]]);
    assert.deepEqual(r.stillMissing, []);
    assert.deepEqual(r.errors, []);
});

test("groups still lacking a report after the re-scrape are reported as still missing", async () => {
    const { deps: d } = deps({ before: [msg(COMPLETE, at(7), A)], targets: ["A"] });
    const r = await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.deepEqual(r.stillMissing, [{ target: "A", missing: ["CuoiBuoi"] }]);
    assert.deepEqual(r.recovered, []);
});

test("an unknown gap (no heartbeat history) scrapes from the start of the session", async () => {
    const { deps: d, scraped } = deps({ before: [], targets: ["A"], gaps: () => [{ from: 0, to: null, reason: "unknown" }] });
    await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.equal(scraped[0].sinceTs, W.from);
});

test("the scrape never starts before the session even when the gap did", async () => {
    const { deps: d, scraped } = deps({ before: [], targets: ["A"], gaps: () => [{ from: W.from - 3_600_000, to: at(9), reason: "stopped" }] });
    await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.equal(scraped[0].sinceTs, W.from);
});

test("ignored targets are never candidates", async () => {
    const { deps: d, scraped } = deps({ before: [], targets: ["A", "bot test"], ignoreTargets: ["bot test"] });
    const r = await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.deepEqual(scraped[0].targets, ["A"]);
    assert.deepEqual(r.candidates.map((c) => c.target), ["A"]);
});

test("dry run lists the plan and scrapes nothing", async () => {
    const { deps: d, scraped } = deps({ before: [], targets: ["A"] });
    const r = await runRecovery({ day: DAY, buoi: "sang", dryRun: true }, d);
    assert.equal(r.status, "dry-run");
    assert.equal(scraped.length, 0);
    assert.deepEqual(r.candidates.map((c) => c.target), ["A"]);
    assert.equal(r.sinceTs, at(8) - 5 * 60_000);
});

test("a group that failed to scrape is reported in errors", async () => {
    const { deps: d } = deps({ before: [], targets: ["A"], scrape: async (targets) => targets.map((target) => ({ target, error: "sidebar item not found" })) });
    const r = await runRecovery({ day: DAY, buoi: "sang" }, d);
    assert.deepEqual(r.errors, [{ target: "A", error: "sidebar item not found" }]);
});
