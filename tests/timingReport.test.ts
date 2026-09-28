import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTimingReport, summarizeTimings } from "../src/runner/timingReport.js";

const cycle = (at: number, durationMs: number | undefined, timings: { target: string; ms: number; ok: boolean }[], stepMs?: Record<string, number>) => ({
    kind: "cycle",
    at,
    ok: true,
    groups: timings.map((t) => t.target),
    durationMs,
    stepMs,
    timings,
});

test("per-group statistics come from every cycle that has timings", () => {
    const s = summarizeTimings([
        cycle(1, 30_000, [{ target: "A", ms: 10_000, ok: true }, { target: "B", ms: 20_000, ok: true }]),
        cycle(2, 40_000, [{ target: "A", ms: 30_000, ok: true }, { target: "B", ms: 5_000, ok: false }]),
    ]);
    assert.equal(s.cycles, 2);
    const a = s.groups.find((g) => g.target === "A")!;
    assert.deepEqual({ count: a.count, failures: a.failures, avgMs: a.avgMs, maxMs: a.maxMs }, { count: 2, failures: 0, avgMs: 20_000, maxMs: 30_000 });
    const b = s.groups.find((g) => g.target === "B")!;
    assert.deepEqual({ count: b.count, failures: b.failures, avgMs: b.avgMs }, { count: 2, failures: 1, avgMs: 12_500 });
    assert.deepEqual(s.groups.map((g) => g.target), ["A", "B"]); // slowest average first
    assert.equal(s.cycleAvgMs, 35_000);
    assert.equal(s.cycleMaxMs, 40_000);
});

test("old log lines without timings, other kinds and garbage are ignored", () => {
    const s = summarizeTimings([
        { kind: "cycle", at: 1, ok: true, groups: ["A"] },
        { kind: "rebuild", at: 2 },
        "junk",
        null,
        cycle(3, 10_000, [{ target: "A", ms: 4_000, ok: true }]),
    ]);
    assert.equal(s.cycles, 1);
    assert.equal(s.groups.length, 1);
    assert.equal(s.groups[0].avgMs, 4_000);
});

test("only the last N cycles count when asked", () => {
    const s = summarizeTimings(
        [cycle(1, 1000, [{ target: "A", ms: 100_000, ok: true }]), cycle(2, 1000, [{ target: "A", ms: 2_000, ok: true }]), cycle(3, 1000, [{ target: "A", ms: 4_000, ok: true }])],
        { lastCycles: 2 },
    );
    assert.equal(s.cycles, 2);
    assert.equal(s.groups[0].avgMs, 3_000);
});

test("p95 is the slowest few, not the average", () => {
    const times = Array.from({ length: 20 }, (_, i) => ({ target: "A", ms: (i + 1) * 1000, ok: true }));
    const s = summarizeTimings(times.map((t, i) => cycle(i, 1000, [t])));
    assert.equal(s.groups[0].p95Ms, 19_000); // nearest rank: 19th of 20 samples
});

test("step averages are summed per step over the cycles that recorded them", () => {
    const s = summarizeTimings([
        cycle(1, 100, [], { recover: 0, scrape: 60_000, load: 1_000, sync: 10_000, build: 20_000 }),
        cycle(2, 100, [], { recover: 0, scrape: 40_000, load: 3_000, sync: 20_000, build: 0 }),
    ]);
    assert.deepEqual(s.stepAvgMs, { recover: 0, scrape: 50_000, load: 2_000, sync: 15_000, build: 10_000 });
});

test("the report says plainly when nothing has been timed yet", () => {
    assert.match(formatTimingReport(summarizeTimings([])).join("\n"), /chưa có vòng nào có ghi thời gian/);
});

test("the report lists each group with its average, p95 and slowest time in seconds", () => {
    const out = formatTimingReport(summarizeTimings([cycle(1, 30_000, [{ target: "LC_A", ms: 12_300, ok: true }])])).join("\n");
    assert.match(out, /LC_A/);
    assert.match(out, /12,3/);
});
