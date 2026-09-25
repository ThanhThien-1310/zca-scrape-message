import type { QueueRunResult } from "../history/queueRun.js";
import { messageKey } from "../lesson/recovery.js";
import type { SourceMessage } from "../lesson/types.js";
import { affectedSessions, mergeSessions, type SessionKey } from "./affectedSessions.js";
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
    /** Snapshot the queue, scrape exactly those groups, remove exactly those (history/queueRun.ts). Throws if Zalo Desktop is unreachable. */
    scrapeQueued(): Promise<QueueRunResult>;
    syncDb(): Promise<void>;
    /** Extract one session, write its Excel, mark its messages. */
    build(session: SessionKey): Promise<BuildResult>;
    /** Sessions still owing a rebuild; kept on disk so a crash cannot lose them. */
    pending: { read(): SessionKey[]; write(list: SessionKey[]): void };
}

/**
 * One runner cycle. A failure before the sessions are known (scrape cannot run) fails the cycle
 * and leaves the queue as it was. Once known, the sessions are saved as pending before anything
 * else, and each one is removed only after its build succeeded, so a crash or a failed build
 * is retried by the next cycle even if no new message arrives. Sync runs every cycle because it
 * is idempotent and an earlier crash may have left scraped rows out of the database.
 */
export async function runCycle(deps: CycleDeps): Promise<CycleSummary> {
    const summary: CycleSummary = { kind: "cycle", at: deps.now(), ok: true, groups: [], sessions: [], reviewCount: 0, excel: [], warnings: [], errors: [] };
    try {
        const before = new Set((await deps.loadMessages()).map(messageKey));

        const recovery = await deps.recover();
        for (const e of recovery.errors) summary.warnings.push(`khôi phục: ${e}`);

        const scrape = await deps.scrapeQueued();
        if (scrape.status === "done") {
            summary.groups = scrape.targets;
            for (const t of scrape.failed) summary.warnings.push(`không cào được "${t}"`);
        }

        const after = await deps.loadMessages();
        let remaining = mergeSessions(deps.pending.read(), affectedSessions(before, after));
        deps.pending.write(remaining);
        summary.sessions = remaining;

        await deps.syncDb();

        for (const session of remaining) {
            try {
                const built = await deps.build(session);
                summary.reviewCount += built.reviewCount;
                if (built.excel) summary.excel.push(built.excel);
                summary.warnings.push(...built.warnings);
                remaining = remaining.filter((s) => s.day !== session.day || s.buoi !== session.buoi);
                deps.pending.write(remaining);
            } catch (err) {
                summary.ok = false;
                summary.errors.push(`${session.day} ${session.buoi}: ${(err as Error).message}`);
            }
        }
    } catch (err) {
        summary.ok = false;
        summary.errors.push((err as Error).message);
    }
    return summary;
}
