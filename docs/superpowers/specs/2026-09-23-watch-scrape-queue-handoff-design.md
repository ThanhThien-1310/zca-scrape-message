# Queue-based handoff between `bot:watch` and `bot:scrape`

Status: draft, not yet approved for implementation.

## Context

The current codebase (committed `af87eed`) has `bot:watch` do two jobs at
once: detect new activity (via the realtime WS listener and the
notification-popup observer) **and** perform the actual scrape itself
(`scheduleScrape` → `scrapeAndSaveLatest`, plus a localhost-only HTTP
control server so an on-demand `bot:scrape` run can delegate to it instead
of opening a second, competing CDP connection to the same Zalo Desktop
window).

This spec replaces that division of labor with a different one, at the
user's request: **`bot:watch` never touches the UI or saves any data at
all.** It only detects which configured targets have new activity and
records their names in a durable queue. **`bot:scrape` becomes purely
manual** — run only when the user chooses to — and is the only process
that ever drives Zalo Desktop's UI, scraping exactly the targets currently
in the queue (not the full `config.targets` list) and clearing only the
entries it successfully handles.

This removes the UI-conflict risk (two processes fighting over one real
window) **by construction** rather than through the control-server
serialization built for the previous design — `bot:watch` simply never
drives the UI, so there is nothing for a manually-run `bot:scrape` to
conflict with.

## Goals

- `bot:watch` detects new messages for configured targets (via both
  existing detection sources, unchanged) and appends the affected target
  names to a durable queue file, deduplicated.
- `bot:watch` does not open, click, search, or scroll anything in Zalo
  Desktop's UI, and does not write to `data/<groupId>.json` at all.
- `bot:scrape`, run manually, reads the queue, scrapes exactly those
  targets (full history scroll-back, same as today's `scrapeAndSaveTarget`),
  and afterward removes only the targets it just finished from the queue —
  preserving any target `bot:watch` added to the queue *while the scrape
  was running*.
- An empty queue means `bot:scrape` has nothing to do and exits immediately
  without touching Zalo Desktop at all.

## Non-goals

- No scheduled/automatic triggering of `bot:scrape` — confirmed purely
  manual (user's explicit choice; accepted latency tradeoff).
- No change to how new activity is *detected* — the realtime WS frame
  decoding (`history/realtimeListener.ts`) and the notification-popup
  `MutationObserver` (`installNotificationObserver`) are unchanged; only
  what happens *after* detection changes.
- No fix, in this spec, for the pre-existing `groupIdToTarget` staleness
  gap (a target scraped for the first time mid-session isn't recognized by
  the realtime-WS source until the process restarts) — noted as a carried-
  over limitation in Risks below, not solved here.
- No fix, in this spec, for the separate `scrapeThreadHistory` infinite-loop
  bug on a genuinely zero-message conversation (found during this design's
  research) — real bug, independent of this redesign; tracked as a
  prerequisite fix in Risks below since it would otherwise hang a manual
  `bot:scrape` run on any queued target that turns out to have no messages.

## Architecture

### Queue file

- Path: `data/.scrape-queue.json` (under `config.dataDir`, alongside the
  per-thread `.json` files — not itself one of them).
- Format: a plain JSON array of target display name strings, matching
  `config.targets` exactly (the same identifier `scrapeAndSaveTarget`
  already takes) — e.g. `["bot test", "LC_ChuVănAn_BTAN"]`. Treated as a
  set: no duplicates, order not meaningful.
- Every write is atomic (write to a `.tmp` file, then rename) — same
  pattern already used by `store/messageStore.ts`'s `writeToDisk`, to
  avoid a reader ever observing a half-written file.
- No cap on size ("3-4 nhóm" in the original request was a typical-case
  estimate, not a hard limit — confirmed with the user). Every distinct
  target with new activity gets enqueued, however many that is.

### `bot:watch` (`history/watch.ts`) — simplified

Removed entirely, since `bot:watch` no longer drives UI or saves data:
- The localhost HTTP control server (`startControlServer`) and
  `config.watchControlPort`.
- `scheduleScrape`, its debounce timers, and the serialized `queue` /
  `runExclusive` machinery.
- `installLiveMessageObserver` and the `LIVE_MSG_BINDING` handling.
- `waitForSidebarLoaded` (nothing here needs the sidebar rendered).
- The realtime-WS photo direct-save block (`store.save({ msgType:
  "chat.photo", url, content, ... })`) — see **Risk: photo URL capture
  regression** below before treating this removal as free.

Kept, unchanged in mechanism:
- `forceRestartZalo` + `connectToZaloMainPageEarly` + `mainPage.enableNetwork()`
  — still required to observe Zalo Desktop's own WebSocket traffic at all.
- `installRealtimeListener` (`history/realtimeListener.ts`) — still decodes
  `cmd 501/521` frames and reports `{ groupId, isGroup, photoMessage? }` per
  message; `photoMessage` is simply no longer acted on.
- `connectToZaloNotificationPage` + `installNotificationObserver` +
  `resolveTarget` — unchanged.
- `buildGroupIdMap` — unchanged (see Risks: still only built once at
  startup).

New:
- `enqueueTarget(target: string): void` — reads the queue file, adds
  `target` if not already present, writes it back (atomic). Called from
  both detection sources in place of the old `scheduleScrape`/direct-save
  calls.

### `bot:scrape` (`index.ts` + `history/desktopScraper.ts`)

- `index.ts` no longer tries to delegate to a running `bot:watch` (that
  concept doesn't apply here — `bot:watch` never runs a control server in
  this design). Instead:
  1. Read the queue file. Empty or missing → log "hàng chờ rỗng, không có
     gì để cào" and exit without touching Zalo Desktop.
  2. Snapshot the current queue contents as `targetsToScrape`.
  3. Run the existing `ensureZaloReady` + connect + `waitForSidebarLoaded`
     flow (unchanged), then `scrapeAndSaveTarget` for each target in
     `targetsToScrape` (not all of `config.targets`).
  4. After scraping finishes (success or failure per target), **re-read**
     the queue file (it may have grown while the scrape was running) and
     write back only the entries that are *not* in `targetsToScrape` —
     this is what preserves a target `bot:watch` enqueued mid-scrape.
- `runScrape` (`history/desktopScraper.ts`) changes from "always scrape
  `config.targets`" to accepting an explicit target list parameter.

### Files touched

- `history/watch.ts` — large simplification (removals above); add
  `enqueueTarget`.
- New: `history/scrapeQueue.ts` — `enqueueTarget`, `readQueue`,
  `removeFromQueue(handled: string[])`, all doing the atomic
  read/modify/write against `data/.scrape-queue.json`. Shared by both
  `watch.ts` (enqueue only) and `index.ts` (read + selective removal).
- `history/desktopScraper.ts` — `runScrape` takes a target list parameter
  instead of always reading `config.targets`; fix the
  `scrapeThreadHistory` infinite-loop-on-zero-messages bug (prerequisite,
  see Risks).
- `index.ts` — replace the control-server delegation logic with the
  read-queue → scrape → selectively-clear flow above.
- `config.ts` — remove `watchControlPort` (dead once the control server is
  gone).
- `history/exportExcelCli.ts`, `README.md`, `CLAUDE.md` — update references
  to the now-removed "chạy song song qua control server" behavior.

## Additions made while planning (2026-09-25)

- **`MessageStore.listThreads()` must ignore dot-files.** It currently lists
  every `*.json` in `data/`, so `data/.scrape-queue.json` would be read as a
  conversation and break `syncDb.ts`, the lesson-report extractor, `mcp/server.ts`
  and `watch.ts`'s `buildGroupIdMap`. Fix: skip names starting with `.`.
- **Failure policy (resolves Risk 3):** a target that fails or has no messages is
  still removed from the queue and the failure is logged. If the whole run cannot
  start (Zalo Desktop unreachable, CDP connect fails) nothing is removed: that is not
  the targets' fault.
- **Per-target isolation:** `runScrape` catches an error per target so one failing
  conversation does not abort the remaining ones.
- **Photo capture (Risk 1):** this spec is followed as written (the WS photo direct
  save is removed). The lesson-report pipeline reads text only, so it is unaffected.
- **Race between the two processes** on the queue file (read-modify-write, no lock)
  is accepted: the window is a few milliseconds and the worst case is one target
  re-enqueued by the next message.

## Risks

1. **Photo real-URL capture regression (flagging prominently — please
   re-confirm this is intended).** The realtime-WS photo direct-save this
   session built (`history/realtimeListener.ts`'s `buildPhotoMessage` +
   `watch.ts`'s `store.save(...)` for `chat.photo`) is the *only* source
   this codebase has for a photo's real, publicly-reachable URL
   (`https://photo-stal-XX.zdn.vn/...`). DOM scraping — what `bot:scrape`
   exclusively falls back to in this design — was confirmed earlier in this
   session to only expose a **local file-cache path**
   (`file:///C:/Users/.../ZaloData/media/.../Cache/...`), not a usable
   remote URL, and even that requires the message to already be visible/
   loaded in the pane. Removing `bot:watch`'s direct save means photo
   messages routed through this new flow lose real-URL capture entirely,
   reverting to the same gap historical scrapes already had. If this
   wasn't the intended consequence, `bot:watch` could keep *only* this one
   UI-free save (it never touches `mainPage`'s UI — it saves straight from
   the WS payload) without reintroducing any UI-driving/conflict risk.
2. **`groupIdToTarget` staleness (pre-existing, carried over).** A target
   scraped for the first time (via `bot:scrape`) while `bot:watch` is
   already running still won't be recognized by the realtime-WS source
   until `bot:watch` restarts and rebuilds the map — same gap as the
   current design, not solved here.
3. **Failed-target requeue policy (needs a decision).** If
   `scrapeAndSaveTarget` fails or finds no messages for a queued target,
   should it still be removed from the queue (avoids a permanently-stuck
   entry retried forever, but silently drops a target that might have
   failed for a transient reason), or left in the queue for the next
   manual run to retry? Default proposed: remove regardless, but log
   failures clearly so they're not silently lost from the user's attention.
4. **Zero-message-conversation infinite loop (independent bug, found during
   this research, not yet fixed).** `scrapeThreadHistory`'s scroll loop
   never terminates for a conversation with literally zero messages ever
   rendered (`scrollMessagePaneToTop` keeps returning `null`, which resets
   the stability counter instead of counting toward it). This would hang a
   manual `bot:scrape` run on any queued target that turns out to be
   message-less. Should be fixed as a prerequisite, independent of whether
   this redesign proceeds.

## Testing plan

- Start `bot:watch`; send a message to a configured target; confirm
  `data/.scrape-queue.json` gets created/updated with that target's name,
  and that `data/<groupId>.json` is *not* touched.
- Send several more messages to the same target; confirm the queue still
  has exactly one entry for it (dedup).
- Run `bot:scrape` manually; confirm it scrapes only the queued target(s)
  and, once done, the queue file no longer contains them.
- While a manual `bot:scrape` run is in progress (multiple targets queued),
  trigger a new message to a *different*, not-yet-queued target via
  `bot:watch`; confirm that target survives in the queue after the scrape
  run's cleanup (not wiped by a blind overwrite).
- Run `bot:scrape` with an empty queue; confirm it exits immediately
  without launching/connecting to Zalo Desktop.
