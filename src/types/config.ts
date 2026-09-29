// Shared config types. Import them from "../types/index.js".

/** Phần của `config` mà việc kiểm tra cần; `config.ts` thỏa mãn cấu trúc này. */
export interface ConfigShape {
    targets: string[];
    recoveryIgnoreTargets: string[];
    groupAliases: Record<string, string>;
    targetMessageCount: number;
    scrollDelayMs: { min: number; max: number };
    watch: { heartbeatSeconds: number; deadAfterSeconds: number; minBlindSeconds: number };
    runner: {
        quietSeconds: number;
        maxWaitSeconds: number;
        pollSeconds: number;
        dirtyCheckSeconds: number;
        dirtyRetrySeconds: number;
        watchWarmupSeconds: number;
        maxConsecutiveFailures: number;
        maxScrapeAttempts: number;
        queueKeepDays: number;
    };
    recovery: { marginMinutes: number };
    chat: { pollSeconds: number; heartbeatSeconds: number; skipBackoffSeconds: number; sentLedgerMinutes: number; echoWindowSeconds: number; restorePreviousConversation: boolean };
    sessions: { chieuFromHour: number; toiFromHour: number };
    phases: { morningEndFromHour: number; afternoonStartFromHour: number; afternoonEndFromHour: number; morningStartFromHour: number };
}
