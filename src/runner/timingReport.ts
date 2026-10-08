import type { GroupStat, StepMs, TimingSummary } from "../types/index.js";

const STEPS: (keyof StepMs)[] = ["recover", "scrape", "load", "sync", "build"];
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/**
 * Statistics from the lines of `output/runner-log.jsonl`. Lines that are not cycles, cycles written before timings
 * existed, and garbage are skipped. `lastCycles` keeps only the newest N of the timed cycles.
 */
export function summarizeTimings(lines: unknown[], opts: { lastCycles?: number } = {}): TimingSummary {
    let cycles = lines.filter(isRecord).filter((l) => l.kind === "cycle" && typeof l.durationMs === "number");
    if (opts.lastCycles !== undefined) cycles = cycles.slice(-opts.lastCycles);

    const perGroup = new Map<string, { ms: number[]; failures: number; written: number[] }>();
    const stepSamples: Record<keyof StepMs, number[]> = { recover: [], scrape: [], load: [], sync: [], build: [] };
    for (const c of cycles) {
        if (isRecord(c.stepMs)) for (const s of STEPS) if (typeof c.stepMs[s] === "number") stepSamples[s].push(c.stepMs[s] as number);
        if (!Array.isArray(c.timings)) continue;
        for (const t of c.timings) {
            if (!isRecord(t) || typeof t.target !== "string" || typeof t.ms !== "number") continue;
            const g = perGroup.get(t.target) ?? { ms: [], failures: 0, written: [] };
            g.ms.push(t.ms);
            if (t.ok === false) g.failures++;
            if (typeof t.written === "number") g.written.push(t.written);
            perGroup.set(t.target, g);
        }
    }

    const durations = cycles.map((c) => c.durationMs as number);
    const groups: GroupStat[] = [...perGroup].map(([target, g]) => {
        const sorted = [...g.ms].sort((a, b) => a - b);
        return { target, count: g.ms.length, failures: g.failures, avgMs: avg(g.ms), p95Ms: percentile(sorted, 95), maxMs: sorted[sorted.length - 1], avgWritten: g.written.length === 0 ? null : avg(g.written) };
    });
    groups.sort((a, b) => b.avgMs - a.avgMs || (a.target < b.target ? -1 : 1));

    return {
        cycles: cycles.length,
        cycleAvgMs: avg(durations),
        cycleMaxMs: durations.length === 0 ? 0 : Math.max(...durations),
        stepAvgMs: { recover: avg(stepSamples.recover), scrape: avg(stepSamples.scrape), load: avg(stepSamples.load), sync: avg(stepSamples.sync), build: avg(stepSamples.build) },
        groups,
    };
}

/** Seconds with one decimal and a comma, e.g. `12,3 s`. */
export const seconds = (ms: number): string => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

const STEP_LABEL: Record<keyof StepMs, string> = { recover: "khôi phục", scrape: "cào", load: "nạp tin", sync: "đồng bộ DB", build: "dựng Excel" };

/** Human-readable lines for `runner:timing`. */
export function formatTimingReport(s: TimingSummary): string[] {
    if (s.cycles === 0) return ["[runner] chưa có vòng nào có ghi thời gian (chạy bot:runner bản mới cho tới khi có ít nhất một vòng)."];
    const lines = [`[runner] ${s.cycles} vòng có ghi thời gian: trung bình ${seconds(s.cycleAvgMs)}, lâu nhất ${seconds(s.cycleMaxMs)} (trong thời gian đó khóa Zalo bị giữ, bot chat không gửi được).`];
    lines.push(`  trung bình từng bước: ${STEPS.map((k) => `${STEP_LABEL[k]} ${seconds(s.stepAvgMs[k])}`).join(", ")}`);
    if (s.groups.length === 0) {
        lines.push("  chưa có nhóm nào được cào trong các vòng đó.");
        return lines;
    }
    lines.push("  thời gian cào từng nhóm (chậm nhất trước):");
    const width = Math.max(...s.groups.map((g) => g.target.length));
    for (const g of s.groups) {
        const written = g.avgWritten === null ? "" : `, tin mới TB ${g.avgWritten.toFixed(1).replace(".", ",")}`;
        const fail = g.failures > 0 ? `, LỖI ${g.failures}` : "";
        lines.push(`    ${g.target.padEnd(width)}  ${String(g.count).padStart(3)} lần: TB ${seconds(g.avgMs)}, p95 ${seconds(g.p95Ms)}, lâu nhất ${seconds(g.maxMs)}${written}${fail}`);
    }
    const all = s.groups.reduce((n, g) => n + g.count, 0);
    const mean = s.groups.reduce((n, g) => n + g.avgMs * g.count, 0) / all;
    lines.push(`  trung bình chung: ${seconds(mean)} mỗi nhóm; ước tính cào 100 nhóm một lượt: ${seconds(mean * 100)}.`);
    return lines;
}
