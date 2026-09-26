import { classifyTitle } from "../lesson/parseReport.js";
import { messageKey } from "../lesson/recovery.js";
import { sessionOf, vietnamDay } from "../lesson/time.js";
import type { Buoi, SessionKey, SourceMessage } from "../types/index.js";

const ORDER: Record<Buoi, number> = { sang: 0, chieu: 1, toi: 2 };

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
        found.push({ day: vietnamDay(m.ts), buoi: sessionOf(m.ts) });
    }
    return mergeSessions(found);
}
