import { config } from "../../config.js";
import { MessageStore } from "../store/messageStore.js";
import { CdpPage, connectToZaloMainPageEarly, connectToZaloNotificationPage } from "../scrape/cdp.js";
import { forceRestartZalo } from "../scrape/desktopScraper.js";
import { routeMessageSafe } from "../chat/fanout.js";
import { appendInbox } from "../chat/inbox.js";
import { makeChatGroupsReader } from "../chat/rules.js";
import { consumeEcho } from "../chat/state.js";
import { installRealtimeListener } from "./realtimeListener.js";
import { swallow } from "../core/atomicWrite.js";
import { enqueueTarget, importLegacyQueue } from "../scrape/scrapeQueue.js";
import { beat, HEARTBEAT_INTERVAL_MS, startWatching, stopWatching as recordStop } from "./watchState.js";
import type { SourceStatus } from "../types/index.js";

const NOTIFY_BINDING = "__zalobotNotify";

/**
 * Detector only. Stays connected indefinitely and, whenever a configured
 * conversation gets a new message, records its name in the durable scrape queue
 * (`data/.scrape-events-<day>.jsonl`, append-only, see history/scrapeQueue.ts). It never opens,
 * clicks, searches or scrolls anything in Zalo Desktop's UI and never writes
 * `data/<groupId>.json` — `bot:scrape` (run manually) is the only process that
 * drives the UI and scrapes, and only the queued conversations.
 *
 * Two independent detection sources, unchanged: Zalo Desktop's own WebSocket
 * connection to its chat backend (history/realtimeListener.ts, primary) and its
 * notification popup window (znotification.html, fallback).
 *
 * It also copies plain text messages of the groups listed in chat-rules.json into the chat inbox
 * (chat/inbox.ts) for `bot:chat`, and ignores the replies `bot:chat` itself sent (chat/state.ts).
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

    // Leave evidence of when this watcher was alive (see history/watchState.ts) and
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

    const sources: { ws: SourceStatus; notification: SourceStatus } = { ws: "connecting", notification: "connecting" };
    const setSource = (name: "ws" | "notification", status: SourceStatus) => {
        sources[name] = status;
        // A heartbeat that cannot be written (Windows EPERM while another process reads the file) must never kill the watcher.
        swallow("ghi trạng thái nguồn", () => beat(Date.now(), { sources: { [name]: status } }));
    };

    const store = new MessageStore();

    // Forces a fresh Zalo Desktop connection (rather than reusing one
    // already open), then races straight into attaching — see
    // forceRestartZalo and connectToZaloMainPageEarly for why both the
    // restart and the early, loosely-matched attach are needed to reliably
    // observe the one-time cipher-key handshake.
    const imported = importLegacyQueue();
    if (imported > 0) console.log(`[watch] đã nhập ${imported} nhóm từ hàng chờ cũ (.scrape-queue.json) sang hàng chờ mới.`);
    await forceRestartZalo();
    const mainPage = await connectToZaloMainPageEarly(config.cdpUrl);
    await mainPage.enableNetwork();
    mainPage.onClose(() => setSource("ws", "down"));

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
    installRealtimeListener(mainPage, (event) => {
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
        if (!route.queue || !target) return;
        console.log(`[watch] realtime-ws: new message detected for "${target}" (groupId=${event.groupId})`);
        enqueue(target, "realtime-ws");
    }, () => setSource("ws", "active"));

    groupIdToTarget = await buildGroupIdMap(store);
    console.log(`[watch] realtime-ws: known group id mapping for ${groupIdToTarget.size}/${config.targets.length} configured target(s)`);

    const notifPage = await connectToZaloNotificationPage(config.cdpUrl);
    await installNotificationObserver(notifPage);
    setSource("notification", "active");

    console.log(`[watch] listening for new messages for: ${config.targets.join(", ")} — detections go to the scrape queue; run \`npm run bot:scrape\` to scrape them (Ctrl+C to stop)`);

    // Node's built-in WebSocket doesn't keep the event loop alive on its
    // own the way a normal long-lived socket would — without this, the
    // process exits right after setup even though the connections are
    // still open, since nothing else is pending.
    setInterval(() => swallow("ghi nhịp tim", () => beat(Date.now(), {})), HEARTBEAT_INTERVAL_MS);

    notifPage.onBindingCalled((name, payload) => {
        if (name !== NOTIFY_BINDING) return;
        let data: { name: string | null; body: string | null };
        try {
            data = JSON.parse(payload);
        } catch {
            return;
        }

        const target = resolveTarget(data.name);
        if (!target) return;
        if (chatGroups().noScrape.has(target)) return; // chat-only group (chat-rules.json "scrape": false): nothing to scrape

        console.log(`[watch] notification for "${target}": ${data.body ?? ""}`.slice(0, 160));
        enqueue(target, "notification");
    });

    const stopWatching = () => {
        console.log("\n[watch] stopping...");
        recordStop(Date.now(), "stopped");
        mainPage.close();
        notifPage.close();
        process.exit(0);
    };
    process.on("SIGINT", stopWatching);
    process.on("SIGTERM", stopWatching);

    notifPage.onClose(() => {
        console.error("[watch] lost connection to Zalo's notification window — exiting. Restart `npm run bot:watch` to resume.");
        recordStop(Date.now(), "fatal");
        process.exit(1);
    });
}

/**
 * Builds a `groupId -> target name` lookup from the JSON store — each
 * thread file is named by its real groupId and every row already carries
 * `groupName` (see store/messageStore.ts), so this needs no fresh DOM read.
 * Only covers targets that have been scraped at least once before; a target
 * with no prior data has no known groupId yet and simply won't be
 * recognized by the realtime WS source until its first scrape (via
 * bot:scrape) records one and `bot:watch` is restarted — the notification
 * source still covers it meanwhile.
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

/**
 * Zalo's notification popup shows a group's name as "Nhóm: <name>" but a
 * direct message's sender name with no prefix — only confirmed for the
 * group case so far. Only reacts to names that match config.targets
 * exactly (after stripping the group prefix), so unrelated
 * conversations/DMs never get queued.
 */
function resolveTarget(notificationName: string | null): string | null {
    if (!notificationName) return null;
    const groupPrefix = "Nhóm: ";
    const candidate = notificationName.startsWith(groupPrefix) ? notificationName.slice(groupPrefix.length) : notificationName;
    return config.targets.includes(candidate) ? candidate : null;
}

/**
 * Installs a MutationObserver in the notification page that calls back into
 * Node (via the CDP binding) with the current #zname/#zbody every time the
 * popup's content changes — this is a real push, not polling.
 */
async function installNotificationObserver(page: CdpPage): Promise<void> {
    await page.addBinding(NOTIFY_BINDING);
    await page.evaluate(`
(() => {
    if (window.__zalobotObserverInstalled) return;
    window.__zalobotObserverInstalled = true;
    const notify = () => {
        const nameEl = document.getElementById("zname");
        const bodyEl = document.getElementById("zbody");
        window.${NOTIFY_BINDING}(JSON.stringify({
            name: nameEl ? nameEl.textContent : null,
            body: bodyEl ? bodyEl.textContent : null,
        }));
    };
    new MutationObserver(notify).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
    });
})()`);
}
