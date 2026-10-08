import { config } from "../../config.js";
import { MessageStore } from "../store/messageStore.js";
import fs from "node:fs";
import path from "node:path";
import { connectToZaloMainPageEarly, type CdpPage } from "../scrape/cdp.js";
import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import type { RealtimeMessageEvent } from "../types/index.js";
import { forceRestartZalo } from "../scrape/desktopScraper.js";
import { routeMessageSafe } from "../chat/fanout.js";
import { appendInbox } from "../chat/inbox.js";
import { makeChatGroupsReader } from "../chat/rules.js";
import { consumeEcho } from "../chat/state.js";
import { installRealtimeListener } from "./realtimeListener.js";
import { swallow } from "../core/atomicWrite.js";
import { enqueueTarget, importLegacyQueue } from "../scrape/scrapeQueue.js";
import { downloadImageFromUrl } from "../store/imageStore.js";
import { visionGroups } from "../vision/groups.js";
import { beat, HEARTBEAT_INTERVAL_MS, startWatching, stopWatching as recordStop } from "./watchState.js";
import type { SourceStatus } from "../types/index.js";

/**
 * Detector only. Stays connected indefinitely and, whenever a configured
 * conversation gets a new message, records its name in the durable scrape queue
 * (`data/.scrape-events-<day>.jsonl`, append-only, see src/scrape/scrapeQueue.ts). It never opens,
 * clicks, searches or scrolls anything in Zalo Desktop's UI and never writes
 * `data/<groupId>.json` — `bot:scrape` (run manually) is the only process that
 * drives the UI and scrapes, and only the queued conversations.
 *
 * One detection source: Zalo Desktop's own WebSocket connection to its chat
 * backend (src/watch/realtimeListener.ts). The old toast-popup fallback
 * (znotification.html) was removed: the toast is a Windows notification rather than
 * something Zalo's window exposes, so it never fired, and its CDP target closing
 * killed the watcher.
 *
 * It also copies plain text messages of the groups listed in chat-rules.json into the chat inbox
 * (src/chat/inbox.ts) for `bot:chat`, and ignores the replies `bot:chat` itself sent (src/chat/state.ts).
 *
 * Always restarts Zalo Desktop on startup (forceRestartZalo, not
 * ensureZaloReady) so the realtime WS source can observe its connection from
 * the very first frame — see forceRestartZalo's own comment.
 */
export async function watch(): Promise<void> {
    if (config.targets.length === 0) {
        console.log("[watch] config.targets is empty — nothing to watch. Add conversation names to config.ts.");
        return;
    }

    // Leave evidence of when this watcher was alive (see src/watch/watchState.ts) and
    // refuse to run next to another one, before touching Zalo Desktop.
    const started = startWatching(Date.now(), process.pid);
    if (started.anotherInstanceAlive) {
        console.error("[watch] another `bot:watch` is already running — exiting so two watchers do not fight over Zalo Desktop.");
        process.exit(1);
    }
    if (started.crashed) {
        console.warn("[watch] the previous bot:watch did not shut down cleanly. Its downtime is recorded in data/.watch-gaps.json — run `npm run recover:missing` if reports may have been missed.");
    }
    const fatal = (err: unknown) => {
        console.error("[watch] fatal error:", err);
        recordStop(Date.now(), "fatal");
        process.exit(1);
    };
    process.on("uncaughtException", fatal);
    process.on("unhandledRejection", fatal);

    const setWsSource = (status: SourceStatus) => {
        // A heartbeat that cannot be written (Windows EPERM while another process reads the file) must never kill the watcher.
        swallow("ghi trạng thái nguồn", () => beat(Date.now(), { sources: { ws: status } }));
    };

    const store = new MessageStore();

    // Forces a fresh Zalo Desktop connection (rather than reusing one
    // already open), then races straight into attaching — see
    // forceRestartZalo and connectToZaloMainPageEarly for why both the
    // restart and the early, loosely-matched attach are needed to reliably
    // observe the one-time cipher-key handshake.
    const imported = importLegacyQueue();
    if (imported > 0) console.log(`[watch] đã nhập ${imported} nhóm từ hàng chờ cũ (.scrape-queue.json) sang hàng chờ mới.`);

    function enqueue(target: string, sourceTag: string): void {
        swallow("ghi nhịp phát hiện", () => beat(Date.now(), { detection: true }));
        try {
            if (enqueueTarget(target)) console.log(`[watch] queued "${target}" (${sourceTag})`);
        } catch (err) {
            // Do not lose the trigger silently: say so loudly (the next message for this group queues it again).
            console.error(`[watch] KHÔNG xếp được "${target}" vào hàng chờ (${sourceTag}): ${(err as Error).message}`);
        }
    }

    // `groupIdToTarget` starts empty and is filled in just below — the
    // listener is registered against this outer binding (not a snapshot)
    // so it still sees the real mapping once buildGroupIdMap resolves.
    // Registering the listener here, immediately after enableNetwork and
    // before any other await, is what actually matters: CDP does not
    // buffer/replay frames for a listener registered after the fact, so
    // every await before this line is a frame-loss window (this cost us
    // the cipher-key frame entirely in an earlier version of this file).
    let groupIdToTarget = new Map<string, string>();
    const chatGroups = makeChatGroupsReader();
    const onEvent = (event: RealtimeMessageEvent): void => {
        const target = groupIdToTarget.get(event.groupId);
        const groups = chatGroups();
        const route = routeMessageSafe(
            {
                event,
                target,
                allowedGroups: groups.allowed,
                noScrapeGroups: groups.noScrape,
                consumeEcho: (t, text) => consumeEcho(t, text, Date.now()),
            },
            (err) => console.warn(`[watch] chat routing failed, the group is still queued for scraping: ${err.message}`),
        );
        if (route.inbox) {
            try {
                appendInbox(route.inbox);
                console.log(`[watch] chat inbox: "${route.inbox.groupName}" message ${route.inbox.msgId}`);
            } catch (err) {
                console.warn(`[watch] could not write the chat inbox: ${(err as Error).message}`); // never let chat break detection
            }
        }
        // Ảnh của nhóm đọc ảnh (nghỉ phép, đo tốc độ): tải ngay từ đường dẫn ảnh gốc trong khung WS. Zalo chỉ lưu ảnh gốc vào bộ nhớ tạm khi ảnh được mở; ảnh trong ALBUM chỉ có
        // bản thu nhỏ nên lần cào sau không lấy được gì. File lưu cùng tên với bản cào (msgId) nên lần cào sau thấy ảnh đã có và gắn đường dẫn vào dòng tin. Lỗi chỉ ghi cảnh báo.
        const photo = event.photoMessage;
        if (photo && !photo.isSelf && target && visionGroups().includes(target)) {
            void downloadImageFromUrl(event.groupId, photo.msgId, photo.url).catch((err) => console.warn(`[watch] could not save the photo ${photo.msgId}: ${(err as Error).message}`));
        }
        if (!route.queue || !target) return;
        console.log(`[watch] realtime-ws: new message detected for "${target}" (groupId=${event.groupId})`);
        enqueue(target, "realtime-ws");
    };

    groupIdToTarget = await buildGroupIdMap(store);
    console.log(`[watch] realtime-ws: known group id mapping for ${groupIdToTarget.size}/${config.targets.length} configured target(s)`);

    // ── Gắn vào Zalo, và TỰ NỐI LẠI khi mất (chạy 24/24 không cần ai khởi động lại tay) ──────────────────────────────────────────────────────────────
    // Zalo chỉ gửi khoá giải mã một lần lúc nó mở kết nối WebSocket, nên "nối lại" luôn là tắt rồi mở lại Zalo rồi gắn ngay (attach). Không tắt Zalo khi bot khác đang
    // điều khiển giao diện (giữ khoá cào), và chờ giãn dần giữa các lần thử.
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    let page: CdpPage | null = null;
    let attachedAt = 0;
    let reconnecting = false;
    let reconnects = 0;

    async function attach(): Promise<void> {
        await forceRestartZalo();
        const p = await connectToZaloMainPageEarly(config.cdpUrl);
        await p.enableNetwork();
        page = p;
        attachedAt = Date.now();
        p.onClose(() => {
            if (page !== p) return; // an old connection we already replaced
            setWsSource("down");
            console.warn("[watch] kết nối CDP tới Zalo đã đóng — tự nối lại.");
            void reconnect("kết nối CDP tới Zalo đã đóng");
        });
        installRealtimeListener(p, onEvent, () => setWsSource("active"));
    }

    async function reconnect(reason: string): Promise<void> {
        if (reconnecting) return;
        reconnecting = true;
        setWsSource("down");
        let delayMs = 5_000;
        for (;;) {
            const lock = acquireScrapeLock("bot:watch");
            if (!lock.ok) {
                await sleep(5_000); // another bot is clicking in Zalo: do not kill it under its feet
                continue;
            }
            try {
                console.warn(`[watch] nối lại (${reason}): tắt và mở lại Zalo...`);
                try {
                    page?.close();
                } catch {
                    /* already closed */
                }
                reconnects += 1;
                swallow("ghi lần nối lại", () => beat(Date.now(), { restartedAt: Date.now(), reconnects }));
                groupIdToTarget = await buildGroupIdMap(store);
                setWsSource("connecting");
                await attach();
                console.log("[watch] đã nối lại Zalo, đang chờ khoá giải mã.");
                reconnecting = false;
                return;
            } catch (err) {
                console.error(`[watch] nối lại thất bại: ${(err as Error).message} — thử lại sau ${Math.round(delayMs / 1000)} giây.`);
                setWsSource("down");
            } finally {
                releaseScrapeLock();
            }
            await sleep(delayMs);
            delayMs = Math.min(delayMs * 2, config.watch.reconnectMaxSeconds * 1000);
        }
    }

    try {
        await attach();
    } catch (err) {
        // Không thoát khi lần gắn đầu thất bại (Zalo chưa kịp mở...): vòng nối lại thử tiếp với thời gian chờ giãn dần.
        console.error(`[watch] gắn vào Zalo lần đầu thất bại: ${(err as Error).message}`);
        await reconnect("gắn lần đầu thất bại");
    }

    // Kiểm tra sức khoẻ: Zalo còn trả lời cổng gỡ lỗi không, và (nếu bật) còn nhận được khung WebSocket nào không. Cũng ghi số khung vào data/.watch-frames.log mỗi 5 phút
    // để biết ban đêm Zalo có gửi khung nhịp hay không (cơ sở chọn watch.silenceRestartMinutes).
    const framesLog = path.join(config.dataDir, ".watch-frames.log");
    let pingFailures = 0;
    let lastLoggedFrames = 0;
    let nextFramesLog = Date.now() + 5 * 60_000;
    setInterval(() => {
        void (async () => {
            if (reconnecting || !page) return;
            const stats = page.frameStats;
            swallow("ghi khung cuối", () => beat(Date.now(), { lastFrameAt: stats.lastFrameAt }));
            if (Date.now() >= nextFramesLog) {
                nextFramesLog = Date.now() + 5 * 60_000;
                swallow("ghi số khung", () => fs.appendFileSync(framesLog, `${new Date().toISOString()} ${stats.frames - lastLoggedFrames} khung trong 5 phút, tổng ${stats.frames}\n`));
                lastLoggedFrames = stats.frames;
            }
            try {
                await page.ping();
                pingFailures = 0;
            } catch (err) {
                pingFailures += 1;
                console.warn(`[watch] Zalo không trả lời (lần ${pingFailures}): ${(err as Error).message}`);
                if (pingFailures >= 2) {
                    pingFailures = 0;
                    await reconnect("Zalo không trả lời trên cổng gỡ lỗi");
                }
                return;
            }
            const silenceMs = config.watch.silenceRestartMinutes * 60_000;
            if (silenceMs > 0 && Date.now() - Math.max(stats.lastFrameAt, attachedAt) > silenceMs) {
                await reconnect(`không nhận khung WebSocket nào trong ${config.watch.silenceRestartMinutes} phút`);
            }
        })();
    }, config.watch.probeSeconds * 1000);

    console.log(`[watch] listening for new messages for: ${config.targets.join(", ")} — detections go to the scrape queue; run \`npm run bot:scrape\` to scrape them (Ctrl+C to stop)`);

    // Node's built-in WebSocket doesn't keep the event loop alive on its
    // own the way a normal long-lived socket would — without this, the
    // process exits right after setup even though the connections are
    // still open, since nothing else is pending.
    setInterval(() => swallow("ghi nhịp tim", () => beat(Date.now(), {})), HEARTBEAT_INTERVAL_MS);

    const stopWatching = () => {
        console.log("\n[watch] stopping...");
        recordStop(Date.now(), "stopped");
        page?.close();
        process.exit(0);
    };
    process.on("SIGINT", stopWatching);
    process.on("SIGTERM", stopWatching);
}

/**
 * Builds a `groupId -> target name` lookup from the JSON store — each
 * thread file is named by its real groupId and every row already carries
 * `groupName` (see src/store/messageStore.ts), so this needs no fresh DOM read.
 * Only covers targets that have been scraped at least once before; a target
 * with no prior data has no known groupId yet and simply won't be
 * recognized by the realtime WS source until its first scrape (via
 * bot:scrape) records one and `bot:watch` is restarted — so a newly added target
 * needs `npm run scrape:add -- "<name>"` once.
 */
async function buildGroupIdMap(store: MessageStore): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    for (const groupId of store.listThreads()) {
        const [sample] = await store.getRecent(groupId, 1);
        if (sample && config.targets.includes(sample.groupName)) {
            map.set(groupId, sample.groupName);
        }
    }
    return map;
}
