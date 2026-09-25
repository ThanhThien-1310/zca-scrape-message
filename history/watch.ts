import { config } from "../config.js";
import { MessageStore } from "../store/messageStore.js";
import { CdpPage, connectToZaloMainPageEarly, connectToZaloNotificationPage } from "./cdp.js";
import { forceRestartZalo } from "./desktopScraper.js";
import { installRealtimeListener } from "./realtimeListener.js";
import { enqueueTarget } from "./scrapeQueue.js";

const NOTIFY_BINDING = "__zalobotNotify";

/**
 * Detector only. Stays connected indefinitely and, whenever a configured
 * conversation gets a new message, records its name in the durable scrape queue
 * (`data/.scrape-queue.json`, see history/scrapeQueue.ts). It never opens,
 * clicks, searches or scrolls anything in Zalo Desktop's UI and never writes
 * `data/<groupId>.json` — `bot:scrape` (run manually) is the only process that
 * drives the UI and scrapes, and only the queued conversations.
 *
 * Two independent detection sources, unchanged: Zalo Desktop's own WebSocket
 * connection to its chat backend (history/realtimeListener.ts, primary) and its
 * notification popup window (znotification.html, fallback).
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

    const store = new MessageStore();

    // Forces a fresh Zalo Desktop connection (rather than reusing one
    // already open), then races straight into attaching — see
    // forceRestartZalo and connectToZaloMainPageEarly for why both the
    // restart and the early, loosely-matched attach are needed to reliably
    // observe the one-time cipher-key handshake.
    await forceRestartZalo();
    const mainPage = await connectToZaloMainPageEarly(config.cdpUrl);
    await mainPage.enableNetwork();

    function enqueue(target: string, sourceTag: string): void {
        if (enqueueTarget(target)) console.log(`[watch] queued "${target}" (${sourceTag})`);
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
    installRealtimeListener(mainPage, ({ groupId }) => {
        const target = groupIdToTarget.get(groupId);
        if (!target) return;
        console.log(`[watch] realtime-ws: new message detected for "${target}" (groupId=${groupId})`);
        enqueue(target, "realtime-ws");
    });

    groupIdToTarget = await buildGroupIdMap(store);
    console.log(`[watch] realtime-ws: known group id mapping for ${groupIdToTarget.size}/${config.targets.length} configured target(s)`);

    const notifPage = await connectToZaloNotificationPage(config.cdpUrl);
    await installNotificationObserver(notifPage);

    console.log(`[watch] listening for new messages for: ${config.targets.join(", ")} — detections go to the scrape queue; run \`npm run bot:scrape\` to scrape them (Ctrl+C to stop)`);

    // Node's built-in WebSocket doesn't keep the event loop alive on its
    // own the way a normal long-lived socket would — without this, the
    // process exits right after setup even though the connections are
    // still open, since nothing else is pending.
    setInterval(() => {}, 1 << 30);

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

        console.log(`[watch] notification for "${target}": ${data.body ?? ""}`.slice(0, 160));
        enqueue(target, "notification");
    });

    const stopWatching = () => {
        console.log("\n[watch] stopping...");
        mainPage.close();
        notifPage.close();
        process.exit(0);
    };
    process.on("SIGINT", stopWatching);
    process.on("SIGTERM", stopWatching);

    notifPage.onClose(() => {
        console.error("[watch] lost connection to Zalo's notification window — exiting. Restart `npm run bot:watch` to resume.");
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
