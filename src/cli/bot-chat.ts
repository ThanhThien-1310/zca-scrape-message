import fs from "node:fs";
import path from "node:path";
import { runChatCycle } from "../chat/cycle.js";
import { CHAT_HEARTBEAT_MS, CHAT_POLL_MS } from "../chat/timing.js";
import { DEFAULT_CURSOR_PATH, DEFAULT_INBOX_PATH, readInbox, writeCursor } from "../chat/inbox.js";
import { createLimiter } from "../chat/limits.js";
import { DEFAULT_RULES_PATH, loadRules } from "../chat/rules.js";
import { sendReply, toSendPage } from "../chat/send.js";
import { loadDone, markDone, recordSent } from "../chat/state.js";
import { config } from "../../config.js";
import { connectToZaloMainPage } from "../scrape/cdp.js";
import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { ChatRules } from "../types/index.js";

/**
 * Trả lời tự động theo kịch bản `chat-rules.json`. Chỉ ĐỌC hộp thư `data/.chat-inbox.jsonl` (do `bot:watch` ghi)
 * và GỬI qua giao diện Zalo Desktop; không nghe WebSocket, không cào. Mỗi lần gửi giữ khóa `data/.scrape.lock`
 * chung với `bot:runner`. `dryRun: true` trong tệp kịch bản chỉ ghi log. Tạo tệp `data/.chat-off` để dừng gửi ngay.
 *
 *   npm run bot:chat
 */
const STATE_PATH = path.join(config.dataDir, ".chat-state.json");
const OFF_PATH = path.join(config.dataDir, ".chat-off");
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

function writeState(value: object): void {
    writeFileAtomic(STATE_PATH, JSON.stringify(value, null, 2));
}

function rulesMtime(): number {
    try {
        return fs.statSync(DEFAULT_RULES_PATH).mtimeMs;
    } catch {
        return -1;
    }
}

async function main(): Promise<void> {
    let rules: ChatRules;
    try {
        rules = loadRules(DEFAULT_RULES_PATH, config.targets);
    } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
    }
    let mtime = rulesMtime();
    let limiter = createLimiter(rules.limits);
    const startedAt = Date.now();
    let lastSummary: object | undefined;

    const beat = () => writeState({ pid: process.pid, startedAt, lastBeat: Date.now(), dryRun: rules.dryRun, groups: Object.keys(rules.groups), lastSummary });
    beat();
    setInterval(beat, CHAT_HEARTBEAT_MS);
    let inCycle = false;
    let stopping = false;
    const deferUntil = new Map<string, number>();
    const finish = () => {
        writeState({ pid: process.pid, startedAt, lastBeat: Date.now(), stopped: true, dryRun: rules.dryRun });
        releaseScrapeLock();
        process.exit(0);
    };
    const stop = () => {
        stopping = true;
        if (!inCycle) finish(); // a send in flight is allowed to finish first (see the loop)
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);

    log(`[chat] chạy: ${Object.keys(rules.groups).join(", ") || "(chưa có nhóm nào)"} | dryRun=${rules.dryRun}`);

    for (;;) {
        await delay(CHAT_POLL_MS);

        const m = rulesMtime();
        if (m !== mtime) {
            mtime = m;
            try {
                rules = loadRules(DEFAULT_RULES_PATH, config.targets);
                limiter = createLimiter(rules.limits);
                log(`[chat] đã nạp lại kịch bản: ${Object.keys(rules.groups).join(", ")} | dryRun=${rules.dryRun}`);
            } catch (err) {
                log(`[chat] kịch bản mới không hợp lệ, giữ bản cũ:\n${(err as Error).message}`);
            }
        }

        const done = loadDone();
        inCycle = true;
        const summary = await runChatCycle({
            now: () => Date.now(),
            deferUntil,
            rules,
            limiter,
            readNew: () => readInbox(DEFAULT_INBOX_PATH, DEFAULT_CURSOR_PATH),
            commit: (end) => writeCursor(end, DEFAULT_CURSOR_PATH),
            isDone: (id) => done.has(id),
            markDone: (id) => {
                done.add(id);
                markDone(id);
            },
            recordSent: (g, t, at) => recordSent(g, t, at),
            withLock: async (fn) => {
                const lock = acquireScrapeLock("bot:chat");
                if (!lock.ok) return { acquired: false };
                try {
                    return { acquired: true, result: await fn() };
                } finally {
                    releaseScrapeLock();
                }
            },
            send: async (group, reply, hooks) => {
                const page = await connectToZaloMainPage(config.cdpUrl);
                try {
                    return await sendReply(toSendPage(page), group, reply, { delay, log, restorePrevious: config.chat.restorePreviousConversation, ...hooks });
                } finally {
                    page.close();
                }
            },
            off: () => fs.existsSync(OFF_PATH),
            log,
        });
        inCycle = false;
        if (stopping) finish(); // SIGINT/SIGTERM arrived during the cycle: exit only now, never in the middle of a send
        if (summary.sent + summary.dryRun + summary.failed + summary.deferred > 0) {
            lastSummary = { at: Date.now(), ...summary };
            log(`[chat] vòng xong: ${JSON.stringify(summary)}`);
        }
    }
}

main().catch((err) => {
    console.error(err);
    releaseScrapeLock();
    process.exit(1);
});
