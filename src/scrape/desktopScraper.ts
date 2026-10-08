import { resolveUntilTs } from "./scrapeWindow.js";
import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { MessageStore } from "../store/messageStore.js";
import { copyImageFromZaloCache } from "../store/imageStore.js";
import { CdpPage, connectToZaloMainPage, isCdpReachable } from "./cdp.js";
import { messageIdPrefix, selectors } from "./scrapeSelectors.js";
import { nextStableRounds } from "./scrollStability.js";
import type { NormalizedMessage, ScrapeTargetResult, ScrapedRow, TargetOutcome } from "../types/index.js";

/**
 * Browser-context JS snippet (interpolated into both `extractVisibleRows`
 * and `installLiveMessageObserver`'s injected scripts) that reads the real
 * Zalo identity behind a message row — sender id, group id, group name —
 * from React's internal fiber tree rather than the DOM's rendered text.
 * None of this is exposed as a DOM attribute or class; the CSS selectors in
 * `scrapeSelectors.ts` only ever get display names.
 *
 * Confirmed live against a real group: React attaches its fiber under a
 * `__reactFiber$<hash>` / `__reactInternalInstance$<hash>` property on the
 * DOM node itself. Walking `.return` up from the row finds an ancestor
 * fiber whose `memoizedProps.data` is the raw message object Zalo's own
 * client uses to render the bubble — it carries `fromUid` (sender's real
 * numeric id) alongside sibling props `conversation` (`isGroup`, `userId`)
 * and `groupInfo` (`groupId`, `displayName`, member list).
 *
 * One confirmed quirk: `data.fromUid` is only the real sender id for
 * *other* people's messages — for your own messages it's always the
 * placeholder `"0"`, so self messages fall back to `props.user.userId`
 * (the currently logged-in account's own id) instead.
 *
 * This is a materially more fragile dependency than the CSS selectors
 * above: it relies on undocumented React internals rather than Zalo's own
 * markup, so it can break on a React version bump alone, with no UI change
 * at all. See README "Bảo trì & giới hạn đã biết".
 */
const readMsgIdentitySrc = `
    const readMsgIdentity = (el, isSelf) => {
        const fiberKey = Object.keys(el).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
        let fiber = fiberKey ? el[fiberKey] : null;
        let props = null;
        for (let i = 0; i < 10 && fiber; i++) {
            if (fiber.memoizedProps && fiber.memoizedProps.data) { props = fiber.memoizedProps; break; }
            fiber = fiber.return;
        }
        if (!props) return { senderId: "", groupId: null, groupName: null, isGroup: false };

        const data = props.data || {};
        const conv = props.conversation || {};
        const groupInfo = props.groupInfo || null;
        const selfUserId = (props.user && props.user.userId) || "";
        const senderId = isSelf ? selfUserId : (data.fromUid != null ? String(data.fromUid) : "");
        const groupId = (groupInfo && groupInfo.groupId) || conv.userId || null;
        const groupName = (groupInfo && groupInfo.displayName) || (props.friendInfo && props.friendInfo.displayName) || null;
        return { senderId, groupId, groupName, isGroup: !!conv.isGroup };
    };
`;

/**
 * Browser-context JS snippet (interpolated into both `extractVisibleRows`
 * and `installLiveMessageObserver`'s injected scripts, alongside
 * `readMsgIdentitySrc`) that turns one `.chat-message` row into
 * one-or-more `ScrapedRow`-shaped objects.
 *
 * Confirmed live 2026-09-23: every `[data-qid]` element inside a row
 * (there can be more than one — an album's photos each get their own,
 * sharing one `.chat-message` row) carries
 * `<realMsgId>@<cliMsgId>_<uidFrom>_<groupId>`. `realMsgId` matches
 * Zalo's own numeric `msgId` exactly — cross-checked character-for-
 * character against the realtime WS payload for the same message (see
 * src/watch/realtimeListener.ts, which now saves photo rows under this same
 * id). `cliMsgId` is what the row's own `id` attribute was already using
 * as its trailing "timestamp" (close to, but not exactly, the server
 * `ts`). `uidFrom` is `"0"` for the account's own messages — same
 * placeholder convention as the WS wire format — so that case falls back
 * to the fiber-read self id. `groupId` already carries the `g` prefix for
 * groups, none for DMs, matching `NormalizedMessage.groupId`'s own
 * convention, so `isGroup` is just `groupId.startsWith("g")`. Splitting on
 * `[data-qid]` (rather than one row = one message) is what correctly
 * separates an album's individual photos, which otherwise all render
 * inside one shared `.chat-message` row with one shared id.
 *
 * Falls back to the row's own `id` (the older `bb_msg_id_<cliMsgId>[...]`
 * scheme) for a row with no `[data-qid]` descendant at all — covers
 * whatever message types this hasn't been confirmed against yet (stickers,
 * voice, system messages...), so those still get scraped, just without a
 * Zalo-native id.
 *
 * Only text and photo messages are actually kept, though — everything else
 * (video, voice, sticker, gif, file...) is dropped outright (`keepRow`),
 * since none of those have a `.text-message__container` with real text nor
 * match the photo-bubble class check, so scraping them would only ever
 * produce an empty, type-less placeholder row.
 */
const extractRowsFromMessageSrc = `
    const qidPattern = /^(\\d+)@(\\d+)_([^_]+)_([^_]+)$/;
    const idPrefix = ${JSON.stringify(messageIdPrefix)};
    const readBubble = (scopeEl, fallbackEl) => {
        const senderEl = scopeEl.querySelector(${JSON.stringify(selectors.senderName)}) || (fallbackEl && fallbackEl.querySelector(${JSON.stringify(selectors.senderName)}));
        const contentEl = scopeEl.querySelector(${JSON.stringify(selectors.messageContent)}) || (fallbackEl && fallbackEl.querySelector(${JSON.stringify(selectors.messageContent)}));
        return {
            senderName: senderEl ? senderEl.textContent.trim() : "",
            content: contentEl ? contentEl.textContent.trim() : "",
        };
    };
    // Text messages have real content via readBubble; photo bubbles are
    // identified by class name (confirmed live 2026-09-23: single photos
    // carry "photo-message-v2" / "chatImageMessage", album items carry
    // "card--group-photo"). Only these two kinds are supported — anything
    // else (video, voice, sticker, gif, file...) has neither real text nor
    // a matching photo class, so extractRowsFromMessage drops it rather
    // than saving an empty, type-less placeholder row for it.
    const isPhotoEl = (el) => /photo-message|chatImageMessage|card--group-photo/.test(el.className);
    const keepRow = (el, content) => content.length > 0 || isPhotoEl(el);

    const extractRowsFromMessage = (msgEl) => {
        const isSelf = / me /.test(" " + msgEl.className + " ");
        const qidEls = Array.from(msgEl.querySelectorAll("[data-qid]"));

        if (qidEls.length > 0) {
            return qidEls
                .map((qidEl) => {
                    const raw = qidEl.getAttribute("data-qid") || "";
                    const m = raw.match(qidPattern);
                    const identity = readMsgIdentity(qidEl, isSelf);
                    const bubble = readBubble(qidEl, msgEl);
                    if (!keepRow(qidEl, bubble.content)) return null;
                    if (!m) {
                        return {
                            externalId: msgEl.id || null,
                            senderId: identity.senderId,
                            senderName: bubble.senderName,
                            content: bubble.content,
                            ts: null,
                            isSelf,
                            groupId: identity.groupId,
                            groupName: identity.groupName,
                            isGroup: identity.isGroup,
                            isPhoto: isPhotoEl(qidEl),
                        };
                    }
                    const realMsgId = m[1], cliMsgId = m[2], uidFrom = m[3], groupIdRaw = m[4];
                    return {
                        externalId: realMsgId,
                        senderId: uidFrom === "0" ? identity.senderId : uidFrom,
                        senderName: bubble.senderName,
                        content: bubble.content,
                        ts: Number(cliMsgId),
                        isSelf,
                        groupId: groupIdRaw || identity.groupId,
                        groupName: identity.groupName,
                        isGroup: groupIdRaw.startsWith("g"),
                        isPhoto: isPhotoEl(qidEl),
                        cliMsgId,
                    };
                })
                .filter((row) => row !== null);
        }

        const id = msgEl.id || "";
        const tsPart = id.startsWith(idPrefix) ? id.slice(idPrefix.length).split("_")[0] : null;
        const ts = tsPart && /^\\d+$/.test(tsPart) ? Number(tsPart) : null;
        const identity = readMsgIdentity(msgEl, isSelf);
        const bubble = readBubble(msgEl, null);
        if (!keepRow(msgEl, bubble.content)) return [];
        return [{
            externalId: id || null,
            senderId: identity.senderId,
            senderName: bubble.senderName,
            content: bubble.content,
            ts,
            isSelf,
            groupId: identity.groupId,
            groupName: identity.groupName,
            isGroup: identity.isGroup,
            isPhoto: isPhotoEl(msgEl),
            cliMsgId: ts != null ? String(ts) : undefined,
        }];
    };
`;

/**
 * The whole bot, now: Zalo Desktop (Electron) is read over the Chrome
 * DevTools Protocol via src/scrape/cdp.ts, run on-demand or on a schedule
 * (Task Scheduler at e.g. 08:00 and 12:00). There is no separate login —
 * this reuses whatever account is already signed into the desktop app, the
 * same way a person using it normally would be. See ensureZaloReady for why
 * that sometimes means restarting the app first.
 */
/**
 * Scrapes the given conversations (default: everything in `config.targets`)
 * one after another. An error in one conversation is recorded in its outcome
 * and does not stop the rest; a failure to start (Zalo Desktop / CDP) throws.
 */
export async function runScrape(store: MessageStore, targets: string[] = config.targets, opts: { sinceTs?: number; untilTs?: number | null } = {}): Promise<TargetOutcome[]> {
    if (targets.length === 0) {
        console.log("[scrape] no targets to scrape.");
        return [];
    }

    await ensureZaloReady();
    const page = await connectToZaloMainPage(config.cdpUrl);

    const outcomes: TargetOutcome[] = [];
    try {
        await waitForSidebarLoaded(page, 30_000);
        for (const target of targets) {
            const started = Date.now();
            try {
                const r = await scrapeAndSaveTarget(page, store, target, opts.sinceTs, opts.untilTs);
                const ms = Date.now() - started;
                console.log(`[scrape] "${target}": xong trong ${(ms / 1000).toFixed(1)} s (đọc ${r.scraped}, mới ${r.written}).`);
                outcomes.push({ target, ms, scraped: r.scraped, written: r.written });
            } catch (err) {
                const ms = Date.now() - started;
                console.error(`[scrape] "${target}": failed sau ${(ms / 1000).toFixed(1)} s —`, err);
                outcomes.push({ target, error: (err as Error).message, ms });
            }
        }
    } finally {
        page.close();
    }
    return outcomes;
}

/** Scrapes one target thread's full window (scrolls back to sinceTs) and writes it to the JSON store — used by the scheduled one-shot run (bot/index.ts) and by watch.ts's on-demand control server. */
export async function scrapeAndSaveTarget(page: CdpPage, store: MessageStore, target: string, sinceTs?: number, untilTs?: number | null): Promise<ScrapeTargetResult> {
    console.log(`[scrape] scraping "${target}"...`);
    const rows = await scrapeThreadHistory(page, target, sinceTs, untilTs);
    if (rows.length === 0) {
        console.log(`[scrape] "${target}": no messages found in this window, nothing to save.`);
        return { scraped: 0, written: 0 };
    }

    const identity = resolveGroupIdentity(rows, target);
    if (!identity) {
        console.warn(`[scrape] "${target}": could not read groupId from any scraped row (React internals may have changed — see readMsgIdentitySrc) — skipping save.`);
        return { scraped: rows.length, written: 0 };
    }

    const normalized = rows.map((r) => toNormalizedMessage(r, identity.groupId, identity.groupName, identity.isGroup));
    const written = store.saveMany(normalized);
    console.log(`[scrape] "${target}": scraped ${rows.length}, ${written} new (data/${identity.groupId}.json)`);
    return { scraped: rows.length, written };
}

/**
 * Reads only whatever's currently rendered in the open thread — no
 * scrolling, no sinceTs/untilTs filtering — used by the notification
 * watcher (src/watch/watch.ts), where a new message is already visible at the
 * bottom of the pane as soon as the thread is opened, so walking back
 * through the day's history on every trigger would just be wasted work.
 * Writes to the JSON store (dedup handles overlap with prior scrapes and
 * with the fuller `scrapeAndSaveTarget` scrolls).
 */
export async function scrapeAndSaveLatest(page: CdpPage, store: MessageStore, target: string): Promise<void> {
    const opened = await clickConversationWithRetry(page, target, 15_000);
    if (!opened) return;
    await delay(1_000);

    const rows = await extractVisibleRows(page);
    if (rows.length === 0) return;

    const identity = resolveGroupIdentity(rows, target);
    if (!identity) {
        console.warn(`[watch] "${target}": could not read groupId from any visible row (React internals may have changed) — skipping save.`);
        return;
    }

    const normalized = rows.map((r) => toNormalizedMessage(r, identity.groupId, identity.groupName, identity.isGroup));
    const written = store.saveMany(normalized);
    console.log(`[watch] "${target}": saw ${rows.length} visible, ${written} new`);
}

/**
 * Zalo Desktop is single-instance (Electron's app.requestSingleInstanceLock):
 * launching it again while it's already running just hands off to the
 * existing process and exits, without opening a debug port. So if the debug
 * port isn't already up, the only way to guarantee it is to close whatever
 * instance is running (if any) and relaunch with the flag — the account
 * session lives in the local profile, not in this process, so restarting
 * doesn't sign anything out.
 */
export async function ensureZaloReady(): Promise<void> {
    if (await isCdpReachable(config.cdpUrl)) return;

    if (!config.autoLaunchZalo) {
        throw new Error(
            `Zalo Desktop's debug port (${config.cdpUrl}) isn't reachable. Launch it with --remote-debugging-port=${config.cdpPort}, or set autoLaunchZalo in bot/config.ts.`,
        );
    }
    if (!config.zaloExePath) {
        throw new Error("Could not auto-detect Zalo.exe under %LOCALAPPDATA%\\Programs\\Zalo — set zaloExePath in bot/config.ts manually.");
    }

    // Cổng có thể chỉ tạm không trả lời (Zalo đang khởi động lại, đang bận): chờ một lúc trước khi tắt Zalo, vì mỗi lần tắt làm bot:watch mất kết nối và để lại icon "ma" ở khay hệ thống.
    for (let i = 0; i < 6; i++) {
        await delay(5_000);
        if (await isCdpReachable(config.cdpUrl)) return;
    }

    console.log("[scrape] Zalo Desktop debug port not open — restarting Zalo Desktop with it enabled...");
    await killZalo("ensureZaloReady");
    spawn(config.zaloExePath, [`--remote-debugging-port=${config.cdpPort}`], {
        detached: true,
        stdio: "ignore",
    }).unref();

    await waitForCdpReady(config.cdpUrl, 30_000);
}

/**
 * Unconditionally kills and relaunches Zalo Desktop, even if its debug port
 * is already open — unlike `ensureZaloReady`, which only restarts when
 * necessary. The realtime WebSocket listener (src/watch/realtimeListener.ts)
 * needs to observe the one-time cipher-key frame sent right when Zalo
 * Desktop's own connection to its chat backend opens; if that connection
 * has been open since before we attached, the key frame already passed and
 * live message detection silently never activates. Forcing a fresh
 * connection here — right before attaching — guarantees we're listening
 * from its very first frame. Same account-session safety guarantee as
 * `ensureZaloReady`: the login lives in the local profile, not the process.
 *
 * Deliberately does NOT wait for the debug port to come up (unlike
 * `ensureZaloReady`) — the caller must race straight into
 * `connectToZaloMainPageEarly` (src/scrape/cdp.ts) right after this returns, so
 * it's already polling for the main window (and enables `Network` the
 * instant it attaches) rather than losing time to a separate readiness
 * wait first. See src/watch/watch.ts.
 */
export async function forceRestartZalo(): Promise<void> {
    if (!config.autoLaunchZalo) {
        throw new Error("forceRestartZalo requires autoLaunchZalo — the realtime WS listener needs to control when Zalo Desktop's connection is (re)established.");
    }
    if (!config.zaloExePath) {
        throw new Error("Could not auto-detect Zalo.exe under %LOCALAPPDATA%\\Programs\\Zalo — set zaloExePath in bot/config.ts manually.");
    }

    console.log("[watch] restarting Zalo Desktop to capture its WebSocket connection from the start...");
    await killZalo("forceRestartZalo");
    // Zalo Desktop's single-instance lock (app.requestSingleInstanceLock)
    // can briefly outlive the killed process — spawning immediately after
    // `taskkill` sometimes hands off to nothing and starts no new instance
    // at all. A short pause avoids that race.
    await delay(1_000);
    spawn(config.zaloExePath, [`--remote-debugging-port=${config.cdpPort}`], {
        detached: true,
        stdio: "ignore",
    }).unref();
}

const run = (command: string): Promise<string> => new Promise((resolve) => exec(command, (_err, stdout) => resolve(String(stdout ?? ""))));
const zaloRunning = async (): Promise<boolean> => /Zalo\.exe/i.test(await run('tasklist /FI "IMAGENAME eq Zalo.exe" /NH'));

/** Ghi mỗi lần Zalo bị tắt (giờ, tiến trình gọi, lý do) vào data/.zalo-kills.log để biết bot nào hay tắt Zalo. Không bao giờ ném lỗi. */
function logZaloKill(reason: string): void {
    try {
        const caller = path.basename(process.argv[1] ?? "?");
        fs.appendFileSync(path.join(config.dataDir, ".zalo-kills.log"), `${new Date().toISOString()} ${caller} ${reason}\n`);
    } catch {
        /* the log is best effort */
    }
}

/**
 * Tắt Zalo: trước hết đóng nhẹ (taskkill không /F, Zalo tự gỡ icon khỏi khay hệ thống), chờ tối đa 4 giây; chưa thoát thì buộc dừng (/F).
 * Buộc dừng ngay luôn để lại icon "ma" ở khay hệ thống mỗi lần.
 */
async function killZalo(reason: string): Promise<void> {
    logZaloKill(reason);
    await run("taskkill /IM Zalo.exe");
    for (let i = 0; i < 8; i++) {
        if (!(await zaloRunning())) return;
        await delay(500);
    }
    await run("taskkill /IM Zalo.exe /F");
}

async function waitForCdpReady(cdpUrl: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await isCdpReachable(cdpUrl)) return;
        await delay(500);
    }
    throw new Error(`Zalo Desktop's debug port never came up at ${cdpUrl} within ${timeoutMs}ms.`);
}

/** Waits for the sidebar's conversation list to actually have entries rendered. */
export async function waitForSidebarLoaded(page: CdpPage, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const count = await page.evaluate<number>(`document.querySelectorAll(${JSON.stringify(selectors.conversationItem)}).length`);
        if (count > 0) return;
        await delay(500);
    }
    throw new Error("Zalo Desktop's sidebar never loaded any conversations — check selectors.conversationItem in scrapeSelectors.ts.");
}

/**
 * Opens a conversation by its display name and scrolls its message pane
 * upward repeatedly, collecting rows as they render.
 */
async function scrapeThreadHistory(page: CdpPage, targetName: string, sinceOverride?: number, untilOverride?: number | null): Promise<ScrapedRow[]> {
    // `sinceOverride` (recover:missing) replaces config.sinceTs for this call only.
    const sinceTs = sinceOverride ?? config.sinceTs;
    // `untilOverride` (bot:runner, recovery) is an explicit null: they collect everything up to now, ignoring config.untilTs.
    const untilTs = resolveUntilTs(untilOverride, config.untilTs);
    const opened = await clickConversationWithRetry(page, targetName, 15_000);
    if (!opened) return [];
    await delay(1_500);

    const collected = new Map<string, ScrapedRow>();
    let previousHeight = -1;
    let stableRounds = 0;
    let passedCutoff = false;
    let scrollRounds = 0;

    while (collected.size < config.targetMessageCount && stableRounds < 3 && !passedCutoff) {
        const rows = await extractVisibleRows(page);
        for (const row of rows) collected.set(row.externalId, row);

        // `rows` is every message currently in the DOM, newest included — so
        // "have we scrolled far enough" means *some* row is already older than
        // the cutoff (everything from the cutoff onward is then loaded), not
        // that *every* row is older (never true while today's messages are
        // still in the DOM, which made this scroll all the way to the top).
        if (sinceTs != null && rows.some((r) => r.ts != null && r.ts < sinceTs)) {
            passedCutoff = true;
            break;
        }

        scrollRounds++;
        const height = await scrollMessagePaneToTop(page);
        await delay(randomBetween(config.scrollDelayMs.min, config.scrollDelayMs.max));

        stableRounds = nextStableRounds(height, previousHeight, stableRounds);
        previousHeight = height ?? previousHeight;
    }

    console.log(`[scrape] "${targetName}": stopped after ${scrollRounds} scroll round(s) (${passedCutoff ? "reached sinceTs" : "no older history / limit"}), ${collected.size} row(s) loaded`);

    return [...collected.values()].filter((r) => {
        if (r.ts == null) return true;
        if (sinceTs != null && r.ts < sinceTs) return false;
        if (untilTs != null && r.ts > untilTs) return false;
        return true;
    });
}

/**
 * Right after Zalo Desktop (re)starts, its contact/thread data may still be
 * loading — an immediate search can come back empty not because the thread
 * doesn't exist, but because Zalo hasn't finished loading yet — so this
 * retries for a while instead of failing on the first miss.
 */
async function clickConversationWithRetry(page: CdpPage, targetName: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    let lastCandidates: string[] = [];
    while (Date.now() < deadline) {
        const result = await clickConversation(page, targetName);
        if (result.matched) return true;
        lastCandidates = result.candidates;
        await delay(500);
    }
    console.warn(
        `[scrape] sidebar item for "${targetName}" not found after ${timeoutMs}ms — check selectors.conversationTitle.\n` +
            `  expected (normalized): ${JSON.stringify(targetName)}\n` +
            `  sidebar titles seen (raw, un-normalized): ${JSON.stringify(lastCandidates)}`,
    );
    return false;
}

/**
 * Sets Zalo Desktop's sidebar search box (`selectors.contactSearchInput`)
 * to `query` and dispatches a real `input` event. The box is a
 * React-controlled input, so a plain `input.value = query` assignment is
 * invisible to React (it overrides the native `value` setter to detect
 * genuine user input) — this instead calls through the native
 * `HTMLInputElement` setter first, the standard workaround, so React's
 * change handler actually fires and the sidebar filters.
 */
async function setSidebarSearch(page: CdpPage, query: string): Promise<void> {
    const expr = `
(() => {
    const input = document.querySelector(${JSON.stringify(selectors.contactSearchInput)});
    if (!input) return false;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeSetter.call(input, ${JSON.stringify(query)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.blur();
    return true;
})()`;
    await page.evaluate<boolean>(expr);
}

/**
 * Finds and opens a thread by display name.
 *
 * Zalo Desktop's unfiltered sidebar only renders a small "recently active"
 * window of conversations — not the full list — and that window is
 * constantly reshuffled by *other* threads' activity. A target thread with
 * no recent messages of its own can be entirely absent from the DOM, and no
 * amount of scrolling reveals it, since it isn't in the underlying data
 * either. Searching by name instead (`selectors.contactSearchInput`) finds
 * the thread directly regardless of how "recent" it is, then the exact
 * match below picks the right result out of the (small) filtered set.
 *
 * Compares by trimmed+whitespace-collapsed, NFC-normalized, zero-width-char-
 * stripped text rather than raw `===` — Vietnamese conversation names can
 * look identical to config.targets while differing in Unicode normalization form or carrying
 * invisible characters (soft-wrap zero-width spaces, NBSP), which would
 * otherwise make an exact string match fail silently forever.
 *
 * Always clears the search box before returning (even on failure), since
 * this reuses the user's own live Zalo Desktop window — leaving it stuck in
 * a filtered search state would be a visible, confusing side effect for
 * them.
 */
async function clickConversation(page: CdpPage, targetName: string): Promise<{ matched: boolean; candidates: string[] }> {
    try {
        await setSidebarSearch(page, targetName);
        await delay(1_000);

        const expr = `
(() => {
    const norm = (s) => s.normalize("NFC").replace(/[\\u200B-\\u200D\\uFEFF]/g, "").replace(/\\s+/g, " ").trim();
    const wanted = norm(${JSON.stringify(targetName)});
    const titles = Array.from(document.querySelectorAll(${JSON.stringify(selectors.conversationTitle)}));
    const target = titles.find((t) => norm(t.textContent || "") === wanted);
    if (!target) return { matched: false, candidates: titles.map((t) => t.textContent || "") };
    const item = target.closest(${JSON.stringify(selectors.conversationItem)});
    if (!item) return { matched: false, candidates: titles.map((t) => t.textContent || "") };
    item.click();
    return { matched: true, candidates: [] };
})()`;
        return await page.evaluate<{ matched: boolean; candidates: string[] }>(expr);
    } finally {
        await setSidebarSearch(page, "");
    }
}

async function extractVisibleRows(page: CdpPage): Promise<ScrapedRow[]> {
    const expr = `
(() => {
    ${readMsgIdentitySrc}
    ${extractRowsFromMessageSrc}
    const msgEls = Array.from(document.querySelectorAll(${JSON.stringify(selectors.messageRow)}));
    return msgEls.flatMap((el) => extractRowsFromMessage(el));
})()`;
    const rows = await page.evaluate<Array<Omit<ScrapedRow, "externalId"> & { externalId: string | null }>>(expr);
    return rows
        .filter((r) => r.externalId || r.content)
        .map((r) => ({ ...r, externalId: r.externalId ?? hashRow(r) }));
}

/** Walks up from the first message row to its nearest scrollable ancestor and scrolls it to the top. Returns the new scrollHeight, or null if no message row / scrollable ancestor exists yet. */
async function scrollMessagePaneToTop(page: CdpPage): Promise<number | null> {
    const expr = `
(() => {
    const msg = document.querySelector(${JSON.stringify(selectors.messageRow)});
    if (!msg) return null;
    let el = msg.parentElement;
    while (el && !(el.scrollHeight > el.clientHeight + 5)) el = el.parentElement;
    if (!el) return null;
    el.scrollTop = 0;
    return el.scrollHeight;
})()`;
    return page.evaluate<number | null>(expr);
}

/**
 * Attaches a MutationObserver directly to the currently-open thread's
 * message pane, so every new `.chat-message` row that renders gets pushed
 * to Node the instant it appears (via CDP binding) — no re-click, no
 * re-extract, no debounce needed for whichever thread is already open. Any
 * previously installed live observer on this page (from a thread opened
 * earlier) is disconnected first, since switching threads tears down and
 * replaces the message pane anyway. Caller must have already called
 * `page.addBinding(bindingName)` once (idempotent per binding name).
 *
 * The message pane container is reused by Zalo Desktop across manual thread
 * switches (only its children are swapped), so this observer keeps firing
 * for whatever thread the user has open, not just the one it was installed
 * for. Each pushed payload therefore includes `activeTarget`, the sidebar
 * display name read fresh from `.conv-item.selected` at the moment the row
 * renders — the caller must use this (not any previously-remembered "open
 * thread" state) to decide which thread a row belongs to.
 *
 * One known gap: `extractRowsFromMessage` reads every `[data-qid]` present
 * inside a `.chat-message` row at the moment that row is added to the DOM —
 * an album whose photos render progressively (row added first, individual
 * `[data-qid]` photos appended into it afterward, rather than all at once)
 * could be under-captured here, since only the *row's own* insertion is
 * observed, not each photo's. Not a practical concern today: photo content
 * for a live-arriving message already comes from the realtime WS source
 * (src/watch/realtimeListener.ts), not this observer — this path mainly
 * matters for plain text in the currently-focused thread.
 */
export async function installLiveMessageObserver(page: CdpPage, bindingName: string): Promise<boolean> {
    const expr = `
(() => {
    ${readMsgIdentitySrc}
    ${extractRowsFromMessageSrc}
    const msg = document.querySelector(${JSON.stringify(selectors.messageRow)});
    if (!msg) return false;
    let container = msg.parentElement;
    while (container && !(container.scrollHeight > container.clientHeight + 5)) container = container.parentElement;
    if (!container) return false;

    if (window.__zalobotLiveObserver) window.__zalobotLiveObserver.disconnect();
    window.__zalobotLiveSeen = window.__zalobotLiveSeen || new Set();

    const rowSelector = ${JSON.stringify(selectors.messageRow)};
    const activeTitleSelector = ${JSON.stringify(selectors.activeConversationTitle)};

    const observer = new MutationObserver((mutations) => {
        const activeTitleEl = document.querySelector(activeTitleSelector);
        const activeTarget = activeTitleEl ? activeTitleEl.textContent.trim() : null;
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                const msgEls = node.matches(rowSelector) ? [node] : Array.from(node.querySelectorAll(rowSelector));
                for (const msgEl of msgEls) {
                    for (const row of extractRowsFromMessage(msgEl)) {
                        const id = row.externalId;
                        if (id && window.__zalobotLiveSeen.has(id)) continue;
                        if (id) window.__zalobotLiveSeen.add(id);
                        window.${bindingName}(JSON.stringify({ ...row, activeTarget }));
                    }
                }
            }
        }
    });
    observer.observe(container, { childList: true, subtree: true });
    window.__zalobotLiveObserver = observer;
    return true;
})()`;
    return page.evaluate<boolean>(expr);
}

/**
 * A photo row also gets its image copied out of Zalo's local download cache
 * into this conversation's image folder (src/store/imageStore.ts) — a synchronous
 * side effect, done here because this is the one place both the batch scrape
 * and the live observer turn a scraped row into a stored one. If Zalo never
 * downloaded that image to this machine there's nothing to copy, and the row
 * is still marked `chat.photo`, just without a `url`.
 */
export function toNormalizedMessage(row: ScrapedRow, groupId: string, groupName: string, isGroup: boolean): NormalizedMessage {
    const base = {
        msgId: row.externalId,
        groupId,
        groupName,
        threadType: (isGroup ? "group" : "user") as "group" | "user",
        senderId: row.senderId,
        senderName: row.senderName,
        isSelf: row.isSelf,
        ts: row.ts ?? Date.now(),
        content: row.content,
    };
    if (!row.isPhoto) return { ...base, msgType: "desktop.text" };

    const url = row.cliMsgId ? copyImageFromZaloCache(groupId, row.externalId, row.cliMsgId) : null;
    return { ...base, msgType: "chat.photo", ...(url ? { url } : {}) };
}

/**
 * Every row in a batch belongs to the same open conversation, so its
 * `groupId`/`groupName`/`isGroup` should be identical across rows — this
 * just picks the first row where the React-fiber read (see
 * `readMsgIdentitySrc`) actually succeeded, tolerating the occasional row
 * where it doesn't (an unusual message type with a differently-shaped fiber
 * tree, say) without losing the whole batch's identity.
 */
function resolveGroupIdentity(rows: ScrapedRow[], fallbackName: string): { groupId: string; groupName: string; isGroup: boolean } | null {
    const identity = rows.find((r): r is ScrapedRow & { groupId: string } => r.groupId != null);
    if (!identity) return null;
    return { groupId: identity.groupId, groupName: identity.groupName ?? fallbackName, isGroup: identity.isGroup };
}

function hashRow(row: { senderName: string; content: string; ts: number | null }): string {
    return "scraped_" + Buffer.from(`${row.senderName}:${row.content}:${row.ts}`).toString("base64url").slice(0, 24);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number) {
    return Math.floor(min + Math.random() * (max - min));
}
