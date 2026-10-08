import { todayVietnam } from "../lesson/time.js";
import { mergeSessions } from "./affectedSessions.js";
import { planSetBuilds } from "./buildPlan.js";
import { sessionReportKeys, type BuiltBySet } from "./builtReports.js";
import { dropStaleFailed, settle } from "./failedFills.js";
import { mergeMarks } from "./mergeMarks.js";
import type { ReportKey } from "../reportSets/registry.js";
import type { ResolvedSet } from "../reportSets/resolve.js";
import type { BuildResult, CycleSummary, Mark, QueueRunResult, SessionKey, SetSummary, SourceMessage, StepMs } from "../types/index.js";

export interface CycleDeps {
    now(): number;
    loadMessages(): Promise<SourceMessage[]>;
    /** Re-scrapes groups missing reports if `bot:watch` had a gap in the current session; never throws for a single group. */
    recover(): Promise<{ errors: string[] }>;
    /** Snapshot the queue, scrape exactly those groups, mark exactly those as scraped; failed groups stay queued for a retry (src/scrape/queueRun.ts). Throws if Zalo Desktop is unreachable. */
    scrapeQueued(): Promise<QueueRunResult>;
    syncDb(): Promise<void>;
    /** The report sets that run (already checked: `resolveReportSets`). */
    sets(): ResolvedSet[];
    /**
     * Extract one session for one set and fill the set's per-phase files `keys` (all of them for a new session, only the failed ones for a
     * retry). A file that fails does NOT throw: its code comes back in `failedKeys`. Throws only when the extract itself fails.
     */
    build(set: ResolvedSet, session: SessionKey, keys: ReportKey[]): Promise<BuildResult>;
    /** The per-day reports (điện, vệ sinh, nội quy) of ONE set; runs once per cycle for every set that has day keys. NEVER throws: every error becomes a warning in the returned array. */
    buildExtras(set: ResolvedSet): Promise<string[]>;
    /** Writes StatusId/HasRead for the merged marks of the whole cycle, in one go. */
    markMessages(marks: Mark[]): Promise<void>;
    /** Keys of the reports already built, per set; kept on disk (src/runner/builtReports.ts). `read` also gives a new set its baseline. */
    built: { read(setIds: string[], messages: SourceMessage[]): BuiltBySet; write(built: BuiltBySet): void };
    /** (set, session, report) triples whose file failed last time; kept on disk (src/runner/failedFills.ts). */
    failed: { read(): Set<string>; write(failed: Set<string>): void };
    /** Marks computed but not yet written to the database; kept on disk until `markMessages` succeeds (src/runner/pendingMarks.ts). */
    pendingMarks: { read(): Mark[]; write(marks: Mark[]): void };
}

const label = (s: SessionKey): string => `${s.day} ${s.buoi}`;

/**
 * One runner cycle. A scrape or sync failure fails the cycle (`errors`) and leaves the queue as it was. What to build is not a diff
 * of this cycle: for every report set it is every session with a report that is on disk but not yet in the set's built keys, plus the
 * report files that failed last time (so a cycle that died after scraping, or messages scraped by hand, are built now). A session is
 * added to the set's built keys only after its extract succeeded; an extract failure goes to `buildErrors`, does not fail the cycle and
 * is retried later. A report FILE that fails is recorded in the failed list and retried alone. Sets run one after another and each
 * is isolated: one set's failure never stops another. Sync runs every cycle because it is idempotent and an earlier crash may have
 * left scraped rows out of the database. The marks of all sets are merged and written once at the end; marks that could not be written (or were left by a killed cycle) stay in the pending file and are written by the next cycle.
 */
export async function runCycle(deps: CycleDeps): Promise<CycleSummary> {
    const startedAt = deps.now();
    const summary: CycleSummary = { kind: "cycle", at: startedAt, ok: true, groups: [], sessions: [], reviewCount: 0, excel: [], warnings: [], errors: [], buildErrors: [], sets: [] };
    const stepMs: StepMs = { recover: 0, scrape: 0, load: 0, sync: 0, build: 0 };
    let mark = startedAt;
    const lap = (step: keyof StepMs) => {
        const t = deps.now();
        stepMs[step] += t - mark;
        mark = t;
    };
    try {
        const recovery = await deps.recover();
        lap("recover");
        for (const e of recovery.errors) summary.warnings.push(`khôi phục: ${e}`);

        const scrape = await deps.scrapeQueued();
        lap("scrape");
        if (scrape.status === "done") {
            summary.groups = scrape.targets;
            summary.timings = scrape.outcomes
                .filter((o) => typeof o.ms === "number")
                .map((o) => ({ target: o.target, ms: o.ms as number, ok: o.error === undefined, ...(o.scraped !== undefined ? { scraped: o.scraped } : {}), ...(o.written !== undefined ? { written: o.written } : {}) }));
            for (const t of scrape.failed) summary.warnings.push(`không cào được "${t}"`);
            for (const t of scrape.gaveUp) summary.warnings.push(`đã bỏ "${t}" khỏi hàng chờ sau nhiều lần lỗi; cào lại bằng: npm run scrape:add -- "${t}"`);
        }

        const messages = await deps.loadMessages();
        const sets = deps.sets();
        const built = deps.built.read(sets.map((s) => s.id), messages);
        const failed = deps.failed.read();
        const forgotten = dropStaleFailed(failed, todayVietnam(deps.now()));
        if (forgotten > 0) {
            deps.failed.write(failed);
            summary.warnings.push(`đã bỏ ${forgotten} file lỗi của ngày cũ khỏi danh sách thử lại (không thử lại vô hạn); dựng lại bằng \`npm run runner:once\` nếu cần`);
        }
        lap("load");

        await deps.syncDb();
        lap("sync");

        const marks: Mark[] = deps.pendingMarks.read();
        const touched: SessionKey[][] = [];
        for (const set of sets) {
            const setSummary: SetSummary = { id: set.id, sessions: [], failedReports: [] };
            summary.sets!.push(setSummary);
            try {
                const builtKeys = built.get(set.id) ?? new Set<string>();
                built.set(set.id, builtKeys);
                for (const plan of planSetBuilds(set, messages, builtKeys, failed)) {
                    try {
                        const result = await deps.build(set, plan.session, plan.keys);
                        setSummary.sessions.push(plan.session);
                        summary.reviewCount += result.reviewCount;
                        if (result.excel) summary.excel.push(result.excel);
                        summary.warnings.push(...result.warnings.map((w) => `${set.id}: ${w}`));
                        marks.push(...result.marks);
                        deps.pendingMarks.write(marks); // BEFORE the built keys: a kill between the two must not lose the marks
                        settle(failed, set.id, plan.session, plan.keys, result.failedKeys as ReportKey[]);
                        for (const key of result.failedKeys) setSummary.failedReports.push(`${label(plan.session)} ${key}`);
                        for (const key of sessionReportKeys(messages, plan.session)) builtKeys.add(key);
                        deps.built.write(built);
                        deps.failed.write(failed);
                    } catch (err) {
                        summary.buildErrors.push(`${set.id} ${label(plan.session)}: ${(err as Error).message}`);
                    }
                    lap("build");
                }
                touched.push(setSummary.sessions);
                if (set.dayKeys.length > 0) {
                    try {
                        summary.warnings.push(...(await deps.buildExtras(set)));
                    } catch (err) {
                        // Hợp đồng buildExtras() là không throw; bọc thêm phòng khi cài đặt tương lai vi phạm hợp đồng đó.
                        summary.warnings.push(`${set.id}: buildExtras: ${(err as Error).message}`);
                    }
                    lap("build");
                }
            } catch (err) {
                summary.buildErrors.push(`${set.id}: ${(err as Error).message}`);
            }
        }
        summary.sessions = mergeSessions(...touched);

        if (marks.length > 0) {
            try {
                await deps.markMessages(mergeMarks(marks));
                deps.pendingMarks.write([]);
            } catch (err) {
                summary.warnings.push(`đánh dấu tin: ${(err as Error).message}`);
            }
            lap("build");
        }
    } catch (err) {
        summary.ok = false;
        summary.errors.push((err as Error).message);
    }
    summary.durationMs = deps.now() - startedAt;
    summary.stepMs = stepMs;
    return summary;
}
