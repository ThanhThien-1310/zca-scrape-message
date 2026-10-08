import type { ReportKey } from "../reportSets/registry.js";
import type { ResolvedSet } from "../reportSets/resolve.js";
import type { SessionKey, SourceMessage } from "../types/index.js";
import { mergeSessions } from "./affectedSessions.js";
import { dirtySessions, type BuiltBySet } from "./builtReports.js";
import { retryPlans } from "./failedFills.js";

export interface SetBuildPlan {
    session: SessionKey;
    keys: ReportKey[];
}

/**
 * Việc dựng theo giai đoạn của MỘT bộ: mọi giai đoạn còn báo cáo chưa dựng (đủ mã theo giai đoạn của bộ) cộng các giai đoạn có file
 * lỗi cần điền lại (chỉ những mã lỗi). Bộ không có mã theo giai đoạn nào thì không có gì để dựng. Cũ nhất trước.
 */
export function planSetBuilds(set: ResolvedSet, messages: SourceMessage[], built: Set<string>, failed: Set<string>): SetBuildPlan[] {
    if (set.phaseKeys.length === 0) return [];
    const keysBySession = new Map<string, Set<ReportKey>>();
    const sessionKey = (s: SessionKey): string => `${s.day}|${s.buoi}`;
    const add = (session: SessionKey, keys: ReportKey[]): void => {
        const slot = keysBySession.get(sessionKey(session)) ?? new Set<ReportKey>();
        for (const k of keys) slot.add(k);
        keysBySession.set(sessionKey(session), slot);
    };
    const unbuilt = dirtySessions(messages, built);
    for (const session of unbuilt) add(session, set.phaseKeys);
    const retries = retryPlans(failed, set.id).map((r) => ({ session: r.session, keys: r.keys.filter((k) => set.phaseKeys.includes(k)) })).filter((r) => r.keys.length > 0);
    for (const r of retries) add(r.session, r.keys);
    return mergeSessions(unbuilt, retries.map((r) => r.session)).map((session) => ({
        session,
        keys: set.phaseKeys.filter((k) => keysBySession.get(sessionKey(session))!.has(k)),
    }));
}

/** Các giai đoạn còn việc dựng ở BẤT KỲ bộ nào (để runner biết có nên chạy một vòng). */
export function pendingBuilds(sets: ResolvedSet[], messages: SourceMessage[], built: BuiltBySet, failed: Set<string>): SessionKey[] {
    return mergeSessions(...sets.map((set) => planSetBuilds(set, messages, built.get(set.id) ?? new Set(), failed).map((p) => p.session)));
}
