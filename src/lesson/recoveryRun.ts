import { config } from "../../config.js";
import { diffRecovered, findMissingGroups, gapsInWindow, messageKey, recoveryWindow } from "./recovery.js";
import type { Buoi, Gap, MissingGroup, RecoveredMessage, SourceMessage, Window } from "../types/index.js";

/** Scrape from this long before a gap starts, to catch messages that arrived just as the watcher went down. */
export const SINCE_MARGIN_MS = config.recovery.marginMinutes * 60_000;

export interface RecoveryDeps {
    now(): number;
    /** Every conversation the watcher is responsible for (`config.targets`). */
    targets: string[];
    /** Conversations that never send lesson reports (test groups...). */
    ignoreTargets: string[];
    loadMessages(): Promise<SourceMessage[]>;
    /** Gaps in the watcher's coverage as known at `now` (recorded ones plus a dead/blind watcher right now). */
    gaps(now: number): Gap[];
    scrape(targets: string[], sinceTs: number): Promise<Array<{ target: string; error?: string }>>;
}

export interface RecoveryResult {
    status: "no-gap" | "nothing-missing" | "dry-run" | "recovered";
    day: string;
    buoi: Buoi;
    window: Window;
    /** Gaps overlapping the session. */
    gaps: Gap[];
    /** Groups that lacked a report when the check started (the ones that are re-scraped). */
    candidates: MissingGroup[];
    sinceTs: number | null;
    /** Messages of the session that appeared only because of the re-scrape: what the watcher missed. */
    recovered: RecoveredMessage[];
    /** Groups still lacking a report after the re-scrape. */
    stillMissing: MissingGroup[];
    errors: Array<{ target: string; error: string }>;
}

/**
 * Only does anything when the watcher's coverage had a hole in the session: it
 * then re-scrapes just the groups that are missing a start/end report, from
 * shortly before the hole, and reports which messages that brought back.
 */
export async function runRecovery(opts: { day: string; buoi: Buoi; dryRun?: boolean }, deps: RecoveryDeps): Promise<RecoveryResult> {
    const window = recoveryWindow(opts.day, opts.buoi);
    const now = deps.now();
    const base = { day: opts.day, buoi: opts.buoi, window, candidates: [] as MissingGroup[], sinceTs: null as number | null, recovered: [] as RecoveredMessage[], stillMissing: [] as MissingGroup[], errors: [] as Array<{ target: string; error: string }> };

    const gaps = gapsInWindow(deps.gaps(now), window, now);
    if (gaps.length === 0) return { ...base, status: "no-gap", gaps };

    const expected = deps.targets.filter((t) => !deps.ignoreTargets.includes(t));
    const before = await deps.loadMessages();
    const candidates = findMissingGroups(before, expected, window);
    if (candidates.length === 0) return { ...base, status: "nothing-missing", gaps };

    const sinceTs = Math.max(window.from, Math.min(...gaps.map((g) => g.from)) - SINCE_MARGIN_MS);
    if (opts.dryRun) return { ...base, status: "dry-run", gaps, candidates, sinceTs };

    const outcomes = await deps.scrape(candidates.map((c) => c.target), sinceTs);
    const errors = outcomes.filter((o) => o.error !== undefined).map((o) => ({ target: o.target, error: o.error! }));

    const after = await deps.loadMessages();
    const recovered = diffRecovered(new Set(before.map(messageKey)), after, window);
    const stillMissing = findMissingGroups(after, expected, window);
    return { ...base, status: "recovered", gaps, candidates, sinceTs, recovered, stillMissing, errors };
}
