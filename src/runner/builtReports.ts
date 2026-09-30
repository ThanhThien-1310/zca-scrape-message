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

/** null when the file is missing or unreadable; entries that are not strings are dropped. */
export function readBuilt(file: string = DEFAULT_RUNNER_FILES.built): Set<string> | null {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : null;
    } catch {
        return null;
    }
}

export function writeBuilt(keys: Set<string>, file: string = DEFAULT_RUNNER_FILES.built): void {
    writeFileAtomic(file, JSON.stringify([...keys].sort(), null, 2));
}

/**
 * First start only: the reports that already exist count as built (they were handled by the manual
 * process before the runner existed). Returns whether it created the file.
 */
export function initBuiltBaseline(messages: SourceMessage[], file: string = DEFAULT_RUNNER_FILES.built): boolean {
    if (readBuilt(file) !== null) return false;
    writeBuilt(reportKeys(messages), file);
    return true;
}
