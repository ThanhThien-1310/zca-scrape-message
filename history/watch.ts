import { config } from "../config.js";
import { MessageStore } from "../store/messageStore.js";
import { CdpPage, connectToZaloMainPageEarly, connectToZaloNotificationPage } from "./cdp.js";
import { forceRestartZalo, installLiveMessageObserver, scrapeAndSaveLatest, toNormalizedMessage, waitForSidebarLoaded } from "./desktopScraper.js";
import { installRealtimeListener } from "./realtimeListener.js";
import type { ScrapedRow } from "./scrapeSelectors.js";

const NOTIFY_BINDING = "__zalobotNotify";
const LIVE_MSG_BINDING = "__zalobotLiveMsg";

/**
 * Alternative to the scheduled one-shot run (bot/index.ts): stays connected
 * indefinitely and reacts to new messages as they arrive, from two
 * independent sources — Zalo Desktop's own WebSocket connection to its chat
 * backend (see history/realtimeListener.ts, the primary/fastest source) and
 * its notification popup window (znotification.html, the fallback, in case
 * the WS source never activates for a given target) — instead of waiting
 * for the next scheduled time.
 *
 * Always restarts Zalo Desktop on startup (forceRestartZalo, not
 * ensureZaloReady) so the realtime WS source can observe its connection
 * from the very first frame — see forceRestartZalo's own comment.
 *
 * Do not run this at the same time as a scheduled `bot:scrape` run — both
 * can kill and relaunch Zalo Desktop; a scheduled run doing that mid-watch
 * would tear down this process's live CDP connections. Pick one operating
 * mode.
 */
export async function watch(): Promise<void> {
    if (config.targets.length === 0) {
        console.log("[watch] config.targets is empty — nothing to watch. Add conversation names to bot/config.ts.");
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

    // Serializes triggered scrapes so two near-simultaneous triggers (from
    // either source below) never drive the shared mainPage (click / scroll)
    // concurrently. Shared across both trigger sources so a WS-detected and
    // a notification-detected message for the same target collapse into one
    // debounced scrape instead of racing each other. Declared before the
    // realtime listener below (not after) so nothing has to wait for the
    // rest of setup to be schedulable.
    let queue: Promise<void> = Promise.resolve();
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

    function scheduleScrape(target: string, sourceTag: string): void {
        const existing = debounceTimers.get(target);
        if (existing) clearTimeout(existing);
        debounceTimers.set(
            target,
            setTimeout(() => {
                debounceTimers.delete(target);
                queue = queue
                    .then(() => scrapeAndSaveLatest(mainPage, store, target))
                    .then(async () => {
                        // Now that `target` is the open thread, attach a live
                        // observer to it so further messages there are caught
                        // the instant they render — no more waiting on this
                        // thread's own notification, which may well have gone
                        // quiet now that it's the focused/open conversation.
                        await installLiveMessageObserver(mainPage, LIVE_MSG_BINDING);
                    })
                    .catch((err) => console.error(`[watch] scrape failed for "${target}" (${sourceTag}):`, err));
            }, 2_000),
        );
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
    installRealtimeListener(mainPage, ({ groupId, isGroup, photoMessage }) => {
        const target = groupIdToTarget.get(groupId);
        if (!target) return;
        console.log(`[watch] realtime-ws: new message detected for "${target}" (groupId=${groupId})`);

        // Photo messages carry their image URL + caption directly in this
        // WS frame (see realtimeListener.ts) — the DOM scrape triggered
        // below can't read either (the caption isn't in
        // `.text-message__container`, and there's no image-URL reading at
        // all), so save this one directly instead of leaving it to that
        // scrape. store.save() dedupes by msgId, so if the DOM scrape below
        // does end up seeing the same row too, it's a harmless no-op.
        if (photoMessage) {
            const saved = store.save({
                msgId: photoMessage.msgId,
                groupId,
                groupName: target,
                threadType: isGroup ? "group" : "user",
                senderId: photoMessage.senderId,
                senderName: photoMessage.senderName,
                isSelf: photoMessage.isSelf,
                ts: photoMessage.ts,
                msgType: "chat.photo",
                content: photoMessage.content,
                url: photoMessage.url,
            });
            if (saved) console.log(`[watch] realtime-ws: saved photo message for "${target}" (${photoMessage.url})`);
        }

        scheduleScrape(target, "realtime-ws");
    });

    groupIdToTarget = await buildGroupIdMap(store);
    console.log(`[watch] realtime-ws: known group id mapping for ${groupIdToTarget.size}/${config.targets.length} configured target(s)`);

    await waitForSidebarLoaded(mainPage, 30_000);

    const notifPage = await connectToZaloNotificationPage(config.cdpUrl);
    await installNotificationObserver(notifPage);

    // Each LIVE_MSG_BINDING payload carries `activeTarget`, the sidebar name
    // read fresh from `.conv-item.selected` at the moment the row rendered
    // (see installLiveMessageObserver) — the message pane container is
    // reused across manual thread switches, so the observer keeps firing
    // for whatever thread the user actually has open, not just the one it
    // was installed for. Using this per-message value (instead of
    // remembering "the target we last opened") is what stops messages from
    // a manually-opened thread being attributed to a previous one.
    await mainPage.addBinding(LIVE_MSG_BINDING);
    mainPage.onBindingCalled((name, payload) => {
        if (name !== LIVE_MSG_BINDING) return;
        let row: ScrapedRow & { activeTarget: string | null };
        try {
            row = JSON.parse(payload);
        } catch {
            return;
        }
        if (!row.externalId) return;

        const activeTarget = row.activeTarget;
        if (!activeTarget || !config.targets.includes(activeTarget)) return;

        if (!row.groupId) {
            console.warn(`[watch] "${activeTarget}": could not read groupId for a live message (React internals may have changed) — skipping save.`);
            return;
        }

        const normalized = toNormalizedMessage(row, row.groupId, row.groupName ?? activeTarget, row.isGroup);
        if (store.save(normalized)) {
            const who = normalized.isSelf ? "bạn" : normalized.senderName || "(cùng người vừa nhắn)";
            console.log(`[watch] "${activeTarget}" live: ${who}: ${String(normalized.content).slice(0, 120)}`);
        }
    });

    console.log(`[watch] listening for new-message notifications for: ${config.targets.join(", ")} (Ctrl+C to stop)`);

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
        scheduleScrape(target, "notification");
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
 * bot:scrape or a notification-triggered scrape) records one.
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
 * conversations/DMs never trigger a scrape.
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
