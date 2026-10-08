import path from "node:path";
import { parseGroupName } from "../lesson/schoolArea.js";
import type { ConfigShape } from "../types/index.js";

const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/**
 * Kiểm chặt các giá trị; mọi lỗi được gom lại và ném MỘT lần (bot không khởi động). Trả về danh sách cảnh báo
 * (giá trị hợp lệ nhưng đáng ngờ) để nơi gọi in ra.
 */
export function validateConfig(cfg: ConfigShape): string[] {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Các khoá cho phép 0 (= tắt) nhưng không âm.
    const nonNegative: Array<[string, unknown]> = [
        ["watch.silenceRestartMinutes", cfg.watch.silenceRestartMinutes],
        ["runner.errorRetryMinutes", cfg.runner.errorRetryMinutes],
        ["runner.sweepMinutes", cfg.runner.sweepMinutes],
    ];
    for (const [key, v] of nonNegative) if (typeof v !== "number" || !Number.isFinite(v) || v < 0) errors.push(`${key} phải là số không âm (0 là tắt), đang là ${JSON.stringify(v)}.`);

    const positive: Array<[string, unknown]> = [
        ["targetMessageCount", cfg.targetMessageCount],
        ["watch.heartbeatSeconds", cfg.watch.heartbeatSeconds],
        ["watch.deadAfterSeconds", cfg.watch.deadAfterSeconds],
        ["watch.minBlindSeconds", cfg.watch.minBlindSeconds],
        ["watch.probeSeconds", cfg.watch.probeSeconds],
        ["watch.reconnectMaxSeconds", cfg.watch.reconnectMaxSeconds],
        ["runner.quietSeconds", cfg.runner.quietSeconds],
        ["runner.maxWaitSeconds", cfg.runner.maxWaitSeconds],
        ["runner.pollSeconds", cfg.runner.pollSeconds],
        ["runner.dirtyCheckSeconds", cfg.runner.dirtyCheckSeconds],
        ["runner.dirtyRetrySeconds", cfg.runner.dirtyRetrySeconds],
        ["runner.watchWarmupSeconds", cfg.runner.watchWarmupSeconds],
        ["runner.maxConsecutiveFailures", cfg.runner.maxConsecutiveFailures],
        ["runner.maxScrapeAttempts", cfg.runner.maxScrapeAttempts],
        ["runner.queueKeepDays", cfg.runner.queueKeepDays],
        ["recovery.marginMinutes", cfg.recovery.marginMinutes],
        ["chat.pollSeconds", cfg.chat.pollSeconds],
        ["chat.heartbeatSeconds", cfg.chat.heartbeatSeconds],
        ["chat.skipBackoffSeconds", cfg.chat.skipBackoffSeconds],
        ["chat.sentLedgerMinutes", cfg.chat.sentLedgerMinutes],
        ["chat.echoWindowSeconds", cfg.chat.echoWindowSeconds],
        ["total.waitMaxMinutes", cfg.total.waitMaxMinutes],
        ["total.refreshEveryMinutes", cfg.total.refreshEveryMinutes],
        ["total.refreshUntilMinutes", cfg.total.refreshUntilMinutes],
        ["total.pollSeconds", cfg.total.pollSeconds],
        ["print.maxPagesPerFile", cfg.print.maxPagesPerFile],
        ["vision.timeoutSeconds", cfg.vision.timeoutSeconds],
        ["vision.maxBundlesPerRun", cfg.vision.maxBundlesPerRun],
        ["vision.bundle.gapMinutes", cfg.vision.bundle.gapMinutes],
        ["vision.bundle.textWindowMinutes", cfg.vision.bundle.textWindowMinutes],
        ["vision.leave.settleSeconds", cfg.vision.leave.settleSeconds],
        ["vision.leave.lookbackDays", cfg.vision.leave.lookbackDays],
        ["vision.leave.maxPastDays", cfg.vision.leave.maxPastDays],
        ["vision.leave.maxFutureDays", cfg.vision.leave.maxFutureDays],
    ];
    for (const [key, value] of positive) if (!isPositiveInt(value)) errors.push(`${key} phải là số nguyên dương (đang là ${JSON.stringify(value)}).`);

    if (isPositiveInt(cfg.runner.quietSeconds) && isPositiveInt(cfg.runner.maxWaitSeconds) && cfg.runner.quietSeconds > cfg.runner.maxWaitSeconds) {
        errors.push(`runner.quietSeconds (${cfg.runner.quietSeconds}) không được lớn hơn runner.maxWaitSeconds (${cfg.runner.maxWaitSeconds}).`);
    }

    if (isPositiveInt(cfg.vision.leave.settleSeconds) && isPositiveInt(cfg.runner.quietSeconds) && cfg.vision.leave.settleSeconds >= cfg.runner.quietSeconds) {
        warnings.push(`vision.leave.settleSeconds (${cfg.vision.leave.settleSeconds}) không nhỏ hơn runner.quietSeconds (${cfg.runner.quietSeconds}): bộ ảnh nghỉ phép có thể chưa đóng khi chu trình chạy, ảnh chỉ được đọc ở chu trình sau.`);
    }

    if (isPositiveInt(cfg.watch.heartbeatSeconds) && isPositiveInt(cfg.watch.deadAfterSeconds)) {
        if (cfg.watch.deadAfterSeconds < 2 * cfg.watch.heartbeatSeconds) {
            errors.push(`watch.deadAfterSeconds (${cfg.watch.deadAfterSeconds}) phải ít nhất gấp 2 lần watch.heartbeatSeconds (${cfg.watch.heartbeatSeconds}), nếu không một nhịp tim trễ cũng bị coi là chết.`);
        } else if (cfg.watch.deadAfterSeconds < 3 * cfg.watch.heartbeatSeconds) {
            warnings.push(`watch.deadAfterSeconds (${cfg.watch.deadAfterSeconds}) nhỏ hơn 3 lần watch.heartbeatSeconds (${cfg.watch.heartbeatSeconds}): chỉ chịu được một nhịp tim trễ.`);
        }
    }

    // bot:chat's own heartbeat is judged by `chat:status` against watch.deadAfterSeconds, so the two must fit together.
    if (isPositiveInt(cfg.chat.heartbeatSeconds) && isPositiveInt(cfg.watch.deadAfterSeconds)) {
        if (cfg.watch.deadAfterSeconds < 2 * cfg.chat.heartbeatSeconds) {
            errors.push(`chat.heartbeatSeconds (${cfg.chat.heartbeatSeconds}) quá lớn so với watch.deadAfterSeconds (${cfg.watch.deadAfterSeconds}): chat:status dùng watch.deadAfterSeconds để coi bot chat là đã chết, nên phải chứa ít nhất 2 nhịp tim của chat.`);
        } else if (cfg.watch.deadAfterSeconds < 3 * cfg.chat.heartbeatSeconds) {
            warnings.push(`chat.heartbeatSeconds (${cfg.chat.heartbeatSeconds}) gần bằng watch.deadAfterSeconds (${cfg.watch.deadAfterSeconds}): chat:status chỉ chịu được một nhịp tim của chat bị trễ.`);
        }
    }

    if (typeof cfg.chat.restorePreviousConversation !== "boolean") errors.push(`chat.restorePreviousConversation phải là true hoặc false (đang là ${JSON.stringify(cfg.chat.restorePreviousConversation)}).`);
    if (isPositiveInt(cfg.chat.sentLedgerMinutes) && isPositiveInt(cfg.chat.echoWindowSeconds) && cfg.chat.sentLedgerMinutes * 60 <= cfg.chat.echoWindowSeconds) {
        errors.push(`chat.sentLedgerMinutes (${cfg.chat.sentLedgerMinutes} phút) phải dài hơn chat.echoWindowSeconds (${cfg.chat.echoWindowSeconds} giây).`);
    }

    const { chieuFromHour, toiFromHour } = cfg.sessions;
    if (!Number.isInteger(chieuFromHour) || chieuFromHour <= 0) errors.push(`sessions.chieuFromHour phải là số nguyên lớn hơn 0 (đang là ${JSON.stringify(chieuFromHour)}).`);
    if (!Number.isInteger(toiFromHour) || toiFromHour > 23 || toiFromHour <= chieuFromHour) {
        errors.push(`sessions.toiFromHour phải là số nguyên lớn hơn chieuFromHour (${chieuFromHour}) và không quá 23 (đang là ${JSON.stringify(toiFromHour)}).`);
    }

    const { morningEndFromHour, afternoonStartFromHour, afternoonEndFromHour, morningStartFromHour } = cfg.phases;
    if (!(morningEndFromHour > 0 && morningEndFromHour < afternoonStartFromHour && afternoonStartFromHour < afternoonEndFromHour && afternoonEndFromHour < morningStartFromHour && morningStartFromHour <= 24)) {
        errors.push(`phases phải thoả 0 < morningEndFromHour < afternoonStartFromHour < afternoonEndFromHour < morningStartFromHour <= 24 (đang là ${JSON.stringify(cfg.phases)}).`);
    }

    const { windowStartHour, morningHour, afternoonHour } = cfg.total;
    if (!(windowStartHour >= 0 && windowStartHour < morningHour && morningHour < afternoonHour && afternoonHour <= 24)) {
        errors.push(`total phải thoả 0 <= windowStartHour < morningHour < afternoonHour <= 24 (đang là ${JSON.stringify({ windowStartHour, morningHour, afternoonHour })}).`);
    }

    if (typeof cfg.print.centerPage !== "boolean") errors.push(`print.centerPage phải là true hoặc false (đang là ${JSON.stringify(cfg.print.centerPage)}).`);
    if (typeof cfg.print.enabled !== "boolean") errors.push(`print.enabled phải là true hoặc false (đang là ${JSON.stringify(cfg.print.enabled)}).`);

    if (typeof cfg.vision.enabled !== "boolean") errors.push(`vision.enabled phải là true hoặc false (đang là ${JSON.stringify(cfg.vision.enabled)}).`);
    if (cfg.vision.reader !== "openrouter") errors.push(`vision.reader chỉ nhận "openrouter" (đang là ${JSON.stringify(cfg.vision.reader)}).`);
    for (const key of ["model", "secondModel"] as const) {
        if (typeof cfg.vision[key] !== "string" || cfg.vision[key].trim() === "") errors.push(`vision.${key} phải là tên một model của OpenRouter, ví dụ "google/gemini-2.5-flash" (đang là ${JSON.stringify(cfg.vision[key])}).`);
    }
    if (!Array.isArray(cfg.vision.leave.groups) || cfg.vision.leave.groups.some((g) => typeof g !== "string")) {
        errors.push(`vision.leave.groups phải là danh sách tên nhóm, ví dụ ["bot test"] (đang là ${JSON.stringify(cfg.vision.leave.groups)}).`);
    } else {
        for (const g of cfg.vision.leave.groups) if (!cfg.targets.includes(g)) errors.push(`vision.leave.groups có "${g}" không nằm trong targets.`);
    }
    if (!Array.isArray(cfg.vision.speed.groups) || cfg.vision.speed.groups.some((g) => typeof g !== "string")) {
        errors.push(`vision.speed.groups phải là danh sách tên nhóm, ví dụ ["bot test"] (đang là ${JSON.stringify(cfg.vision.speed.groups)}).`);
    } else {
        for (const g of cfg.vision.speed.groups) if (!cfg.targets.includes(g)) errors.push(`vision.speed.groups có "${g}" không nằm trong targets.`);
    }
    if (!Array.isArray(cfg.vision.leave.senders) || cfg.vision.leave.senders.some((s) => typeof s !== "string")) {
        errors.push(`vision.leave.senders phải là danh sách tên người gửi, hoặc [] (đang là ${JSON.stringify(cfg.vision.leave.senders)}).`);
    }

    if (typeof cfg.statusExportDir !== "string" || cfg.statusExportDir.trim() === "") errors.push(`statusExportDir phải là một đường dẫn thư mục (đang là ${JSON.stringify(cfg.statusExportDir)}).`);
    else if (!path.isAbsolute(cfg.statusExportDir)) errors.push(`statusExportDir phải là đường dẫn tuyệt đối, ví dụ "D:/BaoCao" (đang là ${JSON.stringify(cfg.statusExportDir)}).`);

    const { min, max } = cfg.scrollDelayMs;
    if (typeof min !== "number" || typeof max !== "number" || min < 0 || max < 0 || min > max) errors.push(`scrollDelayMs phải có 0 <= min <= max (đang là ${JSON.stringify(cfg.scrollDelayMs)}).`);

    if (cfg.targets.length === 0) errors.push("targets không được rỗng.");
    const seen = new Set<string>();
    for (const t of cfg.targets) {
        if (seen.has(t)) errors.push(`targets có tên trùng: "${t}".`);
        seen.add(t);
    }
    for (const t of cfg.recoveryIgnoreTargets) if (!cfg.targets.includes(t)) errors.push(`recoveryIgnoreTargets có "${t}" không nằm trong targets.`);

    if (typeof cfg.groupAliases !== "object" || cfg.groupAliases === null || Array.isArray(cfg.groupAliases)) {
        errors.push('groupAliases phải là một đối tượng { "tên nhóm thử": "tên nhóm trường" }.');
    } else {
        for (const [name, as] of Object.entries(cfg.groupAliases)) {
            if (!cfg.targets.includes(name)) errors.push(`groupAliases có "${name}" không nằm trong targets.`);
            if (typeof as !== "string" || as.trim() === "") errors.push(`groupAliases["${name}"] phải là tên một nhóm trường (chuỗi không rỗng).`);
            else {
                const parsed = parseGroupName(as);
                if (!parsed.truong || !parsed.khuVuc) errors.push(`groupAliases["${name}"] = "${as}" không đọc ra được trường và khu vực (đặt theo kiểu "LC_ChuVănAn_BTAN").`);
            }
        }
    }

    if (errors.length > 0) throw new Error(`config.ts không hợp lệ:\n- ${errors.join("\n- ")}`);
    return warnings;
}
