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
    sources: { ws: SourceStatus };
    /** Since when the WebSocket source has not been active; cleared when it comes back. */
    blindSince?: number;
    /** Lần gần nhất bot:watch tự tắt và mở lại Zalo để nối lại (runner chờ ổn định sau đó như sau khi khởi động). */
    restartedAt?: number;
    /** Số lần tự nối lại từ lúc bot:watch khởi động. */
    reconnects?: number;
    /** Lúc nhận khung WebSocket gần nhất của Zalo. */
    lastFrameAt?: number;
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
