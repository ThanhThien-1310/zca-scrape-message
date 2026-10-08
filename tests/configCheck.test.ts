import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { validateConfig } from "../src/config/configCheck.js";
import type { ConfigShape } from "../src/types/index.js";

const good = (): ConfigShape => ({
    targets: ["bot test", "LC_HoaSen1_TĐ"],
    recoveryIgnoreTargets: ["bot test"],
    groupAliases: {},
    targetMessageCount: 2000,
    statusExportDir: path.resolve("export-root"),
    scrollDelayMs: { min: 500, max: 1200 },
    watch: { heartbeatSeconds: 30, deadAfterSeconds: 90, minBlindSeconds: 60, probeSeconds: 30, silenceRestartMinutes: 0, reconnectMaxSeconds: 300 },
    runner: { quietSeconds: 120, maxWaitSeconds: 600, pollSeconds: 5, dirtyCheckSeconds: 60, dirtyRetrySeconds: 300, watchWarmupSeconds: 90, maxConsecutiveFailures: 3, maxScrapeAttempts: 3, queueKeepDays: 3, errorRetryMinutes: 10, sweepMinutes: 60 },
    recovery: { marginMinutes: 5 },
    chat: { pollSeconds: 3, heartbeatSeconds: 30, skipBackoffSeconds: 45, sentLedgerMinutes: 10, echoWindowSeconds: 120, restorePreviousConversation: false },
    sessions: { chieuFromHour: 12, toiFromHour: 18 },
    phases: { morningEndFromHour: 9, afternoonStartFromHour: 12.5, afternoonEndFromHour: 15, morningStartFromHour: 17.5 },
    total: { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15, waitMaxMinutes: 10, refreshEveryMinutes: 10, refreshUntilMinutes: 60, pollSeconds: 5 },
    print: { enabled: false, maxPagesPerFile: 5, centerPage: true },
    vision: { enabled: false, reader: "openrouter", model: "google/gemini-2.5-flash", secondModel: "google/gemini-2.5-flash", timeoutSeconds: 180, maxBundlesPerRun: 3, bundle: { gapMinutes: 3, textWindowMinutes: 10 }, speed: { groups: ["bot test"] }, leave: { groups: ["bot test"], senders: [], settleSeconds: 20, lookbackDays: 60, maxPastDays: 7, maxFutureDays: 120 } },
});
const bad = (mutate: (c: ConfigShape) => void) => {
    const c = good();
    mutate(c);
    return () => validateConfig(c);
};

test("the default values are valid and produce no warning", () => {
    assert.deepEqual(validateConfig(good()), []);
});

test("every seconds/minutes value must be a positive whole number, and the error names the key", () => {
    assert.throws(bad((c) => (c.runner.quietSeconds = 0)), /runner\.quietSeconds/);
    assert.throws(bad((c) => (c.runner.pollSeconds = -5)), /runner\.pollSeconds/);
    assert.throws(bad((c) => (c.watch.heartbeatSeconds = 1.5)), /watch\.heartbeatSeconds/);
    assert.throws(bad((c) => (c.recovery.marginMinutes = Number.NaN)), /recovery\.marginMinutes/);
    assert.throws(bad((c) => (c.chat.skipBackoffSeconds = "45" as unknown as number)), /chat\.skipBackoffSeconds/);
    assert.throws(bad((c) => (c.runner.maxConsecutiveFailures = 0)), /runner\.maxConsecutiveFailures/);
    assert.throws(bad((c) => (c.runner.queueKeepDays = 0)), /runner.queueKeepDays/);
    assert.throws(bad((c) => (c.chat.restorePreviousConversation = "yes" as unknown as boolean)), /chat.restorePreviousConversation.*true hoặc false/);
    assert.throws(bad((c) => (c.runner.maxScrapeAttempts = 0)), /runner.maxScrapeAttempts/);
    assert.throws(bad((c) => (c.targetMessageCount = 0)), /targetMessageCount/);
});

test("statusExportDir must be an absolute path: a relative one would depend on where the bot was started", () => {
    assert.deepEqual(bad((c) => (c.statusExportDir = "D:/BaoCao"))(), []);
    assert.throws(bad((c) => (c.statusExportDir = "")), /statusExportDir/);
    assert.throws(bad((c) => (c.statusExportDir = "   ")), /statusExportDir/);
    assert.throws(bad((c) => (c.statusExportDir = "BaoCao/2610")), /statusExportDir.*tuyệt đối/);
    assert.throws(bad((c) => (c.statusExportDir = 5 as unknown as string)), /statusExportDir/);
});

test("groupAliases: keys must be tracked groups and values must read as a real school group", () => {
    assert.deepEqual(bad((c) => (c.groupAliases = { "bot test": "LC_ChuVănAn_BTAN" }))(), []);
    assert.throws(bad((c) => (c.groupAliases = { "nhóm lạ": "LC_ChuVănAn_BTAN" })), /groupAliases.*"nhóm lạ".*targets/);
    assert.throws(bad((c) => (c.groupAliases = { "bot test": "bot test" })), /groupAliases.*"bot test".*trường/);
    assert.throws(bad((c) => (c.groupAliases = { "bot test": "" })), /groupAliases/);
    assert.throws(bad((c) => (c.groupAliases = { "bot test": 5 as unknown as string })), /groupAliases/);
    assert.throws(bad((c) => (c.groupAliases = [] as unknown as Record<string, string>)), /groupAliases phải là/);
});

test("quietSeconds may equal maxWaitSeconds but not exceed it", () => {
    assert.deepEqual(bad((c) => (c.runner.quietSeconds = 600))(), []);
    assert.throws(bad((c) => (c.runner.quietSeconds = 601)), /quietSeconds.*maxWaitSeconds/);
});

test("a watcher is declared dead only after at least two missed beats; fewer than three is only a warning", () => {
    assert.throws(bad((c) => (c.watch.deadAfterSeconds = 45)), /deadAfterSeconds/);
    const warnings = bad((c) => (c.watch.deadAfterSeconds = 60))().filter((w) => /watch\.heartbeatSeconds/.test(w));
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /deadAfterSeconds/);
});

test("the sent-reply ledger must outlive the echo window", () => {
    assert.throws(bad((c) => ((c.chat.sentLedgerMinutes = 1), (c.chat.echoWindowSeconds = 120))), /sentLedgerMinutes.*echoWindowSeconds/);
    assert.deepEqual(bad((c) => ((c.chat.sentLedgerMinutes = 3), (c.chat.echoWindowSeconds = 120)))(), []);
});

test("session hours must satisfy 0 < chieuFromHour < toiFromHour <= 23", () => {
    assert.throws(bad((c) => (c.sessions.chieuFromHour = 0)), /chieuFromHour/);
    assert.throws(bad((c) => ((c.sessions.chieuFromHour = 18), (c.sessions.toiFromHour = 18))), /toiFromHour/);
    assert.throws(bad((c) => (c.sessions.toiFromHour = 24)), /toiFromHour/);
    assert.throws(bad((c) => (c.sessions.chieuFromHour = 11.5)), /chieuFromHour/);
    assert.deepEqual(bad((c) => (c.sessions.toiFromHour = 17))(), []);
});

test("phases hours must satisfy 0 < morningEndFromHour < afternoonStartFromHour < afternoonEndFromHour < morningStartFromHour <= 24", () => {
    assert.throws(bad((c) => (c.phases.morningEndFromHour = 0)), /phases/);
    assert.throws(bad((c) => (c.phases.morningStartFromHour = c.phases.afternoonEndFromHour)), /phases/);
    assert.throws(bad((c) => (c.phases.morningStartFromHour = 25)), /phases/);
    assert.deepEqual(bad((c) => (c.phases.morningStartFromHour = 18))(), []);
});

test("scroll delay: both non-negative and min <= max", () => {
    assert.throws(bad((c) => (c.scrollDelayMs.min = 2000)), /scrollDelayMs/);
    assert.throws(bad((c) => (c.scrollDelayMs.min = -1)), /scrollDelayMs/);
    assert.deepEqual(bad((c) => ((c.scrollDelayMs.min = 800), (c.scrollDelayMs.max = 800)))(), []);
});

test("targets: not empty, no duplicates; recoveryIgnoreTargets must be among them", () => {
    assert.throws(bad((c) => (c.targets = [])), /targets/);
    assert.throws(bad((c) => (c.targets = ["A", "A"])), /trùng/);
    assert.throws(bad((c) => (c.recoveryIgnoreTargets = ["Nhóm lạ"])), /recoveryIgnoreTargets.*Nhóm lạ/);
});

test("every problem is reported at once", () => {
    const fn = bad((c) => {
        c.runner.quietSeconds = 0;
        c.sessions.toiFromHour = 30;
        c.targets = [];
    });
    assert.throws(fn, (e: Error) => /quietSeconds/.test(e.message) && /toiFromHour/.test(e.message) && /targets/.test(e.message));
});

test("bot:chat's own heartbeat is judged against watch.deadAfterSeconds (chat:status uses it): two beats must fit, fewer than three only warns", () => {
    assert.throws(bad((c) => (c.chat.heartbeatSeconds = 60)), /chat\.heartbeatSeconds.*watch\.deadAfterSeconds/);
    assert.throws(bad((c) => (c.chat.heartbeatSeconds = 46)), /chat\.heartbeatSeconds/);
    const warnings = bad((c) => (c.chat.heartbeatSeconds = 40))();
    assert.equal(warnings.filter((w) => /chat\.heartbeatSeconds/.test(w)).length, 1);
    assert.deepEqual(bad((c) => (c.chat.heartbeatSeconds = 30))(), []);
});
test("total hours must satisfy 0 <= windowStartHour < morningHour < afternoonHour <= 24", () => {
    assert.throws(bad((c) => (c.total.windowStartHour = 9)), /total/);
    assert.throws(bad((c) => (c.total.afternoonHour = 9)), /total/);
    assert.throws(bad((c) => (c.total.afternoonHour = 25)), /total/);
    assert.throws(bad((c) => (c.total.windowStartHour = -1)), /total/);
    assert.deepEqual(bad((c) => (c.total.windowStartHour = 0))(), []);
    assert.deepEqual(bad((c) => (c.total.afternoonHour = 24))(), []);
});

test("total minutes and seconds must be positive whole numbers, and the error names the key", () => {
    assert.throws(bad((c) => (c.total.waitMaxMinutes = 0)), /total\.waitMaxMinutes/);
    assert.throws(bad((c) => (c.total.refreshEveryMinutes = 1.5)), /total\.refreshEveryMinutes/);
    assert.throws(bad((c) => (c.total.refreshUntilMinutes = -1)), /total\.refreshUntilMinutes/);
    assert.throws(bad((c) => (c.total.pollSeconds = 0)), /total\.pollSeconds/);
    assert.deepEqual(bad((c) => (c.total.pollSeconds = 1))(), []);
});

test("print.enabled must be true or false and print.maxPagesPerFile a positive whole number, and the error names the key", () => {
    assert.throws(bad((c) => ((c.print as { enabled: unknown }).enabled = "yes")), /print\.enabled/);
    assert.throws(bad((c) => (c.print.maxPagesPerFile = 0)), /print\.maxPagesPerFile/);
    assert.throws(bad((c) => (c.print.maxPagesPerFile = 2.5)), /print\.maxPagesPerFile/);
    assert.deepEqual(bad((c) => ((c.print.enabled = true), (c.print.maxPagesPerFile = 1)))(), []);
    assert.throws(bad((c) => ((c.print as { centerPage: unknown }).centerPage = "yes")), /print\.centerPage/);
    assert.deepEqual(bad((c) => (c.print.centerPage = false))(), []);
});

test("vision settings are validated and the error names the key", () => {
    assert.throws(bad((c) => (c.vision.timeoutSeconds = 0)), /vision\.timeoutSeconds/);
    assert.throws(bad((c) => (c.vision.maxBundlesPerRun = -1)), /vision\.maxBundlesPerRun/);
    assert.throws(bad((c) => (c.vision.bundle.gapMinutes = 1.5)), /vision\.bundle\.gapMinutes/);
    assert.throws(bad((c) => (c.vision.bundle.textWindowMinutes = 0)), /vision\.bundle\.textWindowMinutes/);
    assert.throws(bad((c) => (c.vision.model = "  ")), /vision\.model/);
    assert.throws(bad((c) => (c.vision.secondModel = "")), /vision\.secondModel/);
    assert.throws(bad((c) => (c.vision.reader = "claude-p" as "openrouter")), /vision\.reader/);
    assert.throws(bad((c) => (c.vision.enabled = "yes" as unknown as boolean)), /vision\.enabled/);
    assert.throws(bad((c) => (c.vision.leave.settleSeconds = 0)), /vision\.leave\.settleSeconds/);
    assert.throws(bad((c) => (c.vision.leave.lookbackDays = 0)), /vision\.leave\.lookbackDays/);
    assert.throws(bad((c) => (c.vision.leave.maxPastDays = -1)), /vision\.leave\.maxPastDays/);
    assert.throws(bad((c) => (c.vision.leave.maxFutureDays = 2.5)), /vision\.leave\.maxFutureDays/);
    assert.throws(bad((c) => (c.vision.leave.senders = [1 as unknown as string])), /vision\.leave\.senders/);
});

test("vision.leave.groups must be names that are in targets", () => {
    assert.throws(bad((c) => (c.vision.leave.groups = ["Nhóm lạ"])), /vision\.leave\.groups.*Nhóm lạ/);
    assert.throws(bad((c) => (c.vision.leave.groups = "bot test" as unknown as string[])), /vision\.leave\.groups/);
    assert.deepEqual(validateConfig({ ...good(), vision: { ...good().vision, leave: { ...good().vision.leave, groups: [] } } }), []);
});

test("a leave settle time that is not shorter than the runner quiet time is only a warning", () => {
    const c = good();
    c.vision.leave.settleSeconds = c.runner.quietSeconds;
    const warnings = validateConfig(c);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /vision\.leave\.settleSeconds/);
});
