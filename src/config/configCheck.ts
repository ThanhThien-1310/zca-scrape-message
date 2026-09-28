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

    const positive: Array<[string, unknown]> = [
        ["targetMessageCount", cfg.targetMessageCount],
        ["watch.heartbeatSeconds", cfg.watch.heartbeatSeconds],
        ["watch.deadAfterSeconds", cfg.watch.deadAfterSeconds],
        ["watch.minBlindSeconds", cfg.watch.minBlindSeconds],
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
    ];
    for (const [key, value] of positive) if (!isPositiveInt(value)) errors.push(`${key} phải là số nguyên dương (đang là ${JSON.stringify(value)}).`);

    if (isPositiveInt(cfg.runner.quietSeconds) && isPositiveInt(cfg.runner.maxWaitSeconds) && cfg.runner.quietSeconds > cfg.runner.maxWaitSeconds) {
        errors.push(`runner.quietSeconds (${cfg.runner.quietSeconds}) không được lớn hơn runner.maxWaitSeconds (${cfg.runner.maxWaitSeconds}).`);
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
