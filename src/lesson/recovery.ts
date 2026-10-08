import { config } from "../../config.js";
import { gapOverlaps } from "../watch/watchState.js";
import { classifyTitle } from "./parseReport.js";
import type { Buoi, Gap, LoaiBaoCao, MissingGroup, RecoveredMessage, SessionHours, SourceMessage, Window } from "../types/index.js";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** [start, end) hours of each session; derived from the same hours `sessionOf` (./time.ts) uses, so the two always agree. */
function sessionHours(hours: SessionHours): Record<Buoi, [number, number]> {
    return { sang: [0, hours.chieuFromHour], chieu: [hours.chieuFromHour, hours.toiFromHour], toi: [hours.toiFromHour, 24] };
}

/** The session `buoi` of Vietnam calendar day `day` (`YYYY-MM-DD`) as an epoch-ms window. */
export function sessionWindow(day: string, buoi: Buoi, hours: SessionHours = config.sessions): Window {
    const [y, m, d] = day.split("-").map(Number);
    const midnight = Date.UTC(y, m - 1, d) - VN_OFFSET_MS;
    const [startHour, endHour] = sessionHours(hours)[buoi];
    return { from: midnight + startHour * HOUR_MS, to: midnight + endHour * HOUR_MS };
}

/**
 * The window recovery and the runner's catch-up scrape work on. Same as `sessionWindow`, except the sáng session also reaches back
 * to `morningStartFromHour` (17:30) the evening before: a report sent after that hour belongs to the NEXT day's `morningstart`
 * phase (`phaseDay` in ./time.ts), so a hole in the watcher's coverage that begins the evening before has to be covered too.
 */
export function recoveryWindow(day: string, buoi: Buoi, hours: SessionHours = config.sessions, morningStartFromHour: number = config.phases.morningStartFromHour): Window {
    const window = sessionWindow(day, buoi, hours);
    return buoi === "sang" ? { from: window.from - (24 - morningStartFromHour) * HOUR_MS, to: window.to } : window;
}

export function gapsInWindow(gaps: Gap[], window: Window, now: number): Gap[] {
    return gaps.filter((g) => gapOverlaps(g, window, now));
}

/** Targets that have no start and/or no end-of-lesson report in the window, in `targets` order. */
export function findMissingGroups(messages: SourceMessage[], targets: string[], window: Window): MissingGroup[] {
    const seen = new Map<string, Set<LoaiBaoCao>>();
    for (const m of messages) {
        if (m.msgType !== "desktop.text" || m.ts < window.from || m.ts >= window.to) continue;
        const kind = classifyTitle(m.content);
        if (kind !== "DauBuoi" && kind !== "CuoiBuoi") continue;
        let kinds = seen.get(m.groupName);
        if (!kinds) seen.set(m.groupName, (kinds = new Set()));
        kinds.add(kind);
    }

    const result: MissingGroup[] = [];
    for (const target of targets) {
        const kinds = seen.get(target);
        const missing = (["DauBuoi", "CuoiBuoi"] as const).filter((k) => !kinds?.has(k));
        if (missing.length > 0) result.push({ target, missing });
    }
    return result;
}

export const messageKey = (m: Pick<SourceMessage, "groupId" | "msgId">): string => `${m.groupId}|${m.msgId}`;

function firstLine(content: string): string {
    const line = content.split(/\r?\n/).map((l) => l.trim()).find((l) => l !== "") ?? "";
    return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

/** Messages of the window that were not in the store before a re-scrape, oldest first. */
export function diffRecovered(before: Set<string>, after: SourceMessage[], window: Window): RecoveredMessage[] {
    return after
        .filter((m) => !before.has(messageKey(m)) && m.ts >= window.from && m.ts < window.to)
        .sort((a, b) => a.ts - b.ts)
        .map((m) => {
            const kind = classifyTitle(m.content);
            return { groupName: m.groupName, msgId: m.msgId, ts: m.ts, kind: kind === "DauBuoi" || kind === "CuoiBuoi" ? kind : null, preview: firstLine(m.content) };
        });
}
