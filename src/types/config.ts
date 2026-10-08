// Shared config types. Import them from "../types/index.js".

/** Phần của `config` mà việc kiểm tra cần; `config.ts` thỏa mãn cấu trúc này. */
export interface ConfigShape {
    targets: string[];
    recoveryIgnoreTargets: string[];
    groupAliases: Record<string, string>;
    targetMessageCount: number;
    /** Thư mục gốc chứa báo cáo trạng thái: `<gốc>/<yyMM>/<yyMMdd>/`. Phải là đường dẫn tuyệt đối. */
    statusExportDir: string;
    scrollDelayMs: { min: number; max: number };
    watch: { heartbeatSeconds: number; deadAfterSeconds: number; minBlindSeconds: number; probeSeconds: number; silenceRestartMinutes: number; reconnectMaxSeconds: number };
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
        errorRetryMinutes: number;
        sweepMinutes: number;
    };
    recovery: { marginMinutes: number };
    chat: { pollSeconds: number; heartbeatSeconds: number; skipBackoffSeconds: number; sentLedgerMinutes: number; echoWindowSeconds: number; restorePreviousConversation: boolean };
    sessions: { chieuFromHour: number; toiFromHour: number };
    phases: { morningEndFromHour: number; afternoonStartFromHour: number; afternoonEndFromHour: number; morningStartFromHour: number };
    total: { windowStartHour: number; morningHour: number; afternoonHour: number; waitMaxMinutes: number; refreshEveryMinutes: number; refreshUntilMinutes: number; pollSeconds: number };
    print: { enabled: boolean; maxPagesPerFile: number; centerPage: boolean };
    vision: {
        enabled: boolean;
        reader: "openrouter";
        model: string;
        secondModel: string;
        timeoutSeconds: number;
        maxBundlesPerRun: number;
        bundle: { gapMinutes: number; textWindowMinutes: number };
        speed: { groups: string[] };
        leave: { groups: string[]; senders: string[]; settleSeconds: number; lookbackDays: number; maxPastDays: number; maxFutureDays: number };
    };
}

/** Một bộ báo cáo của một người phụ trách (xem `config.reportSets`). `reports` là mã nội bộ, được kiểm tra ở `src/reportSets/resolve.ts`. */
export interface ReportSetConfig {
    /** Tên thư mục của người: `<statusExportDir>/<yyMM>/<yyMMdd>/<id>/`. */
    id: string;
    reports: string[];
}
