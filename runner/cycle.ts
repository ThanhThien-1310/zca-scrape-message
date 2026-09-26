import type { QueueRunResult } from "../history/queueRun.js";
import type { SourceMessage } from "../lesson/types.js";
import { type SessionKey } from "./affectedSessions.js";
import { dirtySessions, sessionReportKeys } from "./builtReports.js";
import type { CycleSummary } from "./runnerState.js";

export interface BuildResult {
    reviewCount: number;
    /** Path of the Excel written; null when the session had no report with a known room. */
    excel: string | null;
    warnings: string[];
}

export interface CycleDeps {
    now(): number;
    loadMessages(): Promise<SourceMessage[]>;
    /** Re-scrapes groups missing reports if `bot:watch` had a gap in the current session; never throws for a single group. */
    recover(): Promise<{ errors: string[] }>;
    /** Snapshot the queue, scrape exactly those groups, mark exactly those as scraped; failed groups stay queued for a retry (history/queueRun.ts). Throws if Zalo Desktop is unreachable. */
    scrapeQueued(): Promise<QueueRunResult>;
    syncDb(): Promise<void>;
    /** Extract one session, write its Excel, mark its messages. */
    build(session: SessionKey): Promise<BuildResult>;
    /** Keys of the reports already built into an Excel; kept on disk (runner/builtReports.ts). */
    built: { read(): Set<string>; write(keys: Set<string>): void };
}

/**
 * One runner cycle. A scrape or sync failure fails the cycle (`errors`) and leaves the queue as it was.
 * Which sessions to build is not a diff of this cycle: it is every session with a report that is on disk
 * but not yet in the built set, so a cycle that died after scraping, or messages scraped by hand, are
 * built now. A session is added to the built set only after its build succeeded; a build failure is
 * reported in `buildErrors`, does not fail the cycle, and is retried later. Sync runs every cycle because
 * it is idempotent and an earlier crash may have left scraped rows out of the database.
 */
export async function runCycle(deps: CycleDeps): Promise<CycleSummary> {
    const summary: CycleSummary = { kind: "cycle", at: deps.now(), ok: true, groups: [], sessions: [], reviewCount: 0, excel: [], warnings: [], errors: [], buildErrors: [] };
    try {
        const recovery = await deps.recover();
        for (const e of recovery.errors) summary.warnings.push(`khôi phục: ${e}`);

        const scrape = await deps.scrapeQueued();
        if (scrape.status === "done") {
            summary.groups = scrape.targets;
            for (const t of scrape.failed) summary.warnings.push(`không cào được "${t}"`);
            for (const t of scrape.gaveUp) summary.warnings.push(`đã bỏ "${t}" khỏi hàng chờ sau nhiều lần lỗi; cào lại bằng: npm run scrape:add -- "${t}"`);
        }

        const messages = await deps.loadMessages();
        const built = deps.built.read();
        const sessions = dirtySessions(messages, built);
        summary.sessions = sessions;

        await deps.syncDb();

        for (const session of sessions) {
            try {
                const result = await deps.build(session);
                summary.reviewCount += result.reviewCount;
                if (result.excel) summary.excel.push(result.excel);
                summary.warnings.push(...result.warnings);
                for (const key of sessionReportKeys(messages, session)) built.add(key);
                deps.built.write(built);
            } catch (err) {
                summary.buildErrors.push(`${session.day} ${session.buoi}: ${(err as Error).message}`);
            }
        }
    } catch (err) {
        summary.ok = false;
        summary.errors.push((err as Error).message);
    }
    return summary;
}
