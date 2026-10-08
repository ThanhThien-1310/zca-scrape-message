import fs from "node:fs";
import path from "node:path";
import { classifyTitle } from "../lesson/parseReport.js";
import { messageKey } from "../lesson/recovery.js";
import { classifyPhase } from "../lesson/time.js";
import { affectedSessions } from "./affectedSessions.js";
import { DEFAULT_RUNNER_FILES } from "./runnerState.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { LoaiBaoCao, SessionKey, SourceMessage } from "../types/index.js";

/**
 * The set of start/end-of-lesson reports (`messageKey`s) already built into an Excel. What still needs
 * building is derived from it (a report on disk that is not in the set), never from a per-cycle diff, so
 * nothing is lost when the runner dies mid-cycle and messages scraped by other means (a manual `bot:scrape`,
 * `recover:missing`) are picked up too.
 */
function reportKind(m: SourceMessage): LoaiBaoCao | null {
    const kind = classifyTitle(m.content);
    return kind === "DauBuoi" || kind === "CuoiBuoi" ? kind : null;
}

export function reportKeys(messages: SourceMessage[]): Set<string> {
    return new Set(messages.filter((m) => reportKind(m) !== null).map(messageKey));
}

/** Keys of the reports whose own (giai đoạn, ngày) — theo `classifyPhase` — khớp `session`. */
export function sessionReportKeys(messages: SourceMessage[], session: SessionKey): string[] {
    return messages
        .filter((m) => {
            const kind = reportKind(m);
            if (kind === null) return false;
            const c = classifyPhase(m.ts, kind);
            return c.day === session.day && c.phase === session.buoi;
        })
        .map(messageKey);
}

/** Sessions that have at least one report not in `built`, oldest first. */
export function dirtySessions(messages: SourceMessage[], built: Set<string>): SessionKey[] {
    return affectedSessions(built, messages);
}

/** Keys of the reports already built, per report set: `{ "<setId>": [messageKey...] }` on disk. */
export type BuiltBySet = Map<string, Set<string>>;

const stringSet = (v: unknown): Set<string> | null => (Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : null);

/** The parsed content of the built file; null when it is missing or unreadable. */
export function readBuiltRaw(file: string = DEFAULT_RUNNER_FILES.built): unknown {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

/**
 * Brings the built state in line with the sets that run now. `changed` = the result differs from what is on disk (so the caller writes it):
 * - no file (first start): every set starts with the reports that already exist counted as built (they were handled before the runner existed);
 * - the old format, ONE array: handed to every current set so an upgrade rebuilds nothing (not consumed when there is no set);
 * - a set that is new (no entry yet): the same baseline, otherwise adding a set would rebuild the whole history in the store;
 * - a set that is no longer in config keeps its keys so it can come back without a rebuild.
 */
export function loadBuiltBySet(raw: unknown, setIds: string[], messages: SourceMessage[]): { built: BuiltBySet; changed: boolean } {
    const built: BuiltBySet = new Map();
    const legacy = stringSet(raw);
    if (legacy !== null) {
        if (setIds.length === 0) return { built, changed: false };
        for (const id of setIds) built.set(id, new Set(legacy));
        return { built, changed: true };
    }
    if (typeof raw === "object" && raw !== null) {
        for (const [id, value] of Object.entries(raw)) {
            const keys = stringSet(value);
            if (keys !== null) built.set(id, keys);
        }
    }
    let changed = false;
    for (const id of setIds) {
        if (built.has(id)) continue;
        built.set(id, reportKeys(messages));
        changed = true;
    }
    return { built, changed };
}

export function writeBuiltBySet(built: BuiltBySet, file: string = DEFAULT_RUNNER_FILES.built): void {
    const obj: Record<string, string[]> = {};
    for (const [id, keys] of [...built].sort(([a], [b]) => a.localeCompare(b))) obj[id] = [...keys].sort();
    writeFileAtomic(file, JSON.stringify(obj, null, 2));
}
