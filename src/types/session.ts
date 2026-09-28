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

export interface SessionKey {
    day: string;
    buoi: Buoi;
}
