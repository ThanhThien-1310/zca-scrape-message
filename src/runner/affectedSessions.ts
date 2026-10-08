import { classifyTitle } from "../lesson/parseReport.js";
import { messageKey } from "../lesson/recovery.js";
import { classifyPhase } from "../lesson/time.js";
import type { Phase, SessionKey, SourceMessage } from "../types/index.js";

const ORDER: Record<Phase, number> = { morningstart: 0, morningend: 1, afternoonstart: 2, afternoonend: 3 };

/** Union of session lists, one entry per (day, buoi), oldest first. */
export function mergeSessions(...lists: SessionKey[][]): SessionKey[] {
    const seen = new Map<string, SessionKey>();
    for (const list of lists) for (const s of list) seen.set(`${s.day}|${s.buoi}`, s);
    return [...seen.values()].sort((a, b) => (a.day === b.day ? ORDER[a.buoi] - ORDER[b.buoi] : a.day < b.day ? -1 : 1));
}

/**
 * Sessions whose Excel must be rebuilt because a start/end-of-lesson report appeared that
 * was not in `before` (a set of `messageKey`s). A message's session is the one of its own
 * timestamp, not of "now", so a morning report scraped in the afternoon still rebuilds the morning.
 */
export function affectedSessions(before: Set<string>, after: SourceMessage[]): SessionKey[] {
    const found: SessionKey[] = [];
    for (const m of after) {
        if (before.has(messageKey(m))) continue;
        const kind = classifyTitle(m.content);
        if (kind !== "DauBuoi" && kind !== "CuoiBuoi") continue;
        const { day, phase } = classifyPhase(m.ts, kind);
        found.push({ day, buoi: phase });
    }
    return mergeSessions(found);
}
