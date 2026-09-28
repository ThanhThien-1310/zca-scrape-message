// Shared watch types. Import them from "../types/index.js".

export type SourceStatus = "connecting" | "active" | "down";

export interface WatchState {
    pid: number;
    startedAt: number;
    lastBeat: number;
    state: "running" | "stopped";
    stoppedAt?: number;
    lastDetectionAt?: number;
    detections: number;
    sources: { ws: SourceStatus; notification: SourceStatus };
    /** Since when neither source has been active; cleared when one comes back. */
    blindSince?: number;
}

export type GapReason = "crash" | "stopped" | "blind" | "fatal" | "unknown";

/** A period during which new messages could have gone unnoticed. `to: null` = still going on. */
export interface Gap {
    from: number;
    to: number | null;
    reason: GapReason;
}

export interface WatchFiles {
    state: string;
    gaps: string;
}
