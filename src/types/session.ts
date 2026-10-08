// Shared session types. Import them from "../types/index.js".

import type { LoaiBaoCao } from "./report.js";

/** A half-open range [from, to) of epoch milliseconds. */
export interface Window {
    from: number;
    to: number;
}

export interface MissingGroup {
    target: string;
    missing: LoaiBaoCao[];
}

export interface RecoveredMessage {
    groupName: string;
    msgId: string;
    ts: number;
    /** Set when the message is a start/end-of-lesson report. */
    kind: LoaiBaoCao | null;
    /** First non-empty line of the message. */
    preview: string;
}

export type Buoi = "sang" | "chieu" | "toi";

/** Hours (Vietnam time) at which the afternoon and the evening start; the morning runs from 00:00 to `chieuFromHour`. */
export interface SessionHours {
    chieuFromHour: number;
    toiFromHour: number;
}

/** `buoi` là `Phase` (4 giai đoạn mới) — dùng cho hệ theo dõi "phiên nào cần dựng lại Excel" (`affectedSessions.ts`,
 *  `builtReports.ts`, `runner/steps.ts`). Hệ khôi phục khi `bot:watch` gián đoạn (`recoveryRun.ts` và các CLI liên
 *  quan) vẫn dùng `Buoi` cũ riêng, chưa migrate — xem Chặng 2 phần "khôi phục" trong spec. */
export interface SessionKey {
    day: string;
    buoi: Phase;
}

export type Phase = "morningstart" | "morningend" | "afternoonstart" | "afternoonend";

/** Mốc giờ (24h, có thể lẻ như 12.5 = 12h30) chia ngày thành 4 giai đoạn — xem `phaseOf`/`classifyPhase` trong time.ts. */
export interface PhaseHours {
    morningEndFromHour: number;
    afternoonStartFromHour: number;
    afternoonEndFromHour: number;
    morningStartFromHour: number;
}
