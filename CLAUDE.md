# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Reads Zalo group/DM message history from **Zalo Desktop** (the Windows app, not
chat.zalo.me) by attaching to it over the Chrome DevTools Protocol and scraping
the DOM. Read-only: no send/reply path, no realtime WebSocket listener, no
separate login flow — it reuses whatever Zalo Desktop session is already
logged in on the machine. See `README.md` for the full design rationale
(why CDP instead of Playwright/`zca-js` web login) and detailed data-flow
walkthrough — it's kept in sync with the code and is the source of truth for
anything not covered below.

## Commands

```bash
npx tsx index.ts                              # one-shot scrape (npm run bot:scrape)
npm run bot:watch                              # long-running, reacts to notifications in real time
npm run zalo:debug                             # just relaunch Zalo Desktop with --remote-debugging-port open, then exit (for manual CDP probing)
npx tsx history/exportExcelCli.ts <threadId> [senderName]   # export already-scraped thread to .xlsx (npm run export:excel -- <threadId> [senderName])
npm run mcp                                    # start the read-only MCP server over stdio
npm run typecheck                              # tsc --noEmit
```

There is no test suite and no lint script configured. `curl http://127.0.0.1:9222/json/version`
checks whether the CDP debug port is currently open (should return JSON, not
connection-refused).

**Never run `bot:scrape` and `bot:watch` at the same time** — both call
`ensureZaloReady()`, which may kill/relaunch `Zalo.exe`; doing so while the
other mode has an active CDP connection will sever it.

## Architecture

Two independent run modes share the same core scraping/storage layer:

- **`index.ts`** — one-shot: scrape each `config.targets` conversation once, then exit. Meant for Task Scheduler.
- **`watch.ts`** — long-running: two `MutationObserver`s (see `history/watch.ts`) — one on Zalo's toast-notification popup window, one installed on the currently-open thread's message pane (since Zalo suppresses toasts for the thread you have focused) — trigger scrapes as messages arrive, debounced 2s.

Both funnel through:

- **`history/desktopScraper.ts`** — the core logic: `ensureZaloReady()` (checks/opens the CDP debug port, killing and relaunching `Zalo.exe` with `--remote-debugging-port` if needed — safe because the login session lives in the local profile, not the process), connects to the main window, finds/opens each target conversation in the sidebar, scrolls to load history until `targetMessageCount`, `sinceTs`, or a stalled scroll height stops it.
- **`history/cdp.ts`** — a minimal hand-rolled CDP WebSocket client (`Runtime.evaluate`, `Runtime.addBinding`/`bindingCalled`). Exists because Playwright's `connectOverCDP` can't attach to Zalo Desktop's Electron build (old CDP version, `Browser.setDownloadBehavior` errors).
- **`history/scrapeSelectors.ts`** — the CSS selectors for Zalo Desktop's DOM. **This is the most fragile part of the codebase** — a Zalo UI update can silently break it (symptom: message counts drop to 0, or "sidebar item not found"). Fix by running `npm run zalo:debug`, then probing the live DOM via `Runtime.evaluate` over `history/cdp.ts` and updating selectors to match.
- **`store/messageStore.ts`** — writes/reads `data/<thread-slug>.jsonl`, append-only, deduped by `msgId`.
- **`history/exportJson.ts`** — writes `data/export/<thread-slug>_<YYYY-MM-DD>.json`, a full pretty-printed snapshot of one calendar day's run (overwritten on same-day reruns — the JSONL is the durable store, this is a per-day view).
- **`history/exportExcel.ts`** / **`exportExcelCli.ts`** — ad-hoc export of an already-scraped thread from the JSONL store to `.xlsx`, optionally filtered to one sender.
- **`mcp/server.ts`** — read-only MCP server (`list_threads`, `get_recent_messages`, `search_messages`) exposing `store/messageStore.ts` data to MCP clients (Claude Code/Desktop). Never touches Zalo/CDP itself — just reads the JSONL files the scraper already wrote, so it works whether or not the scraper is currently running.

## Config (`config.ts`) — the one file you edit for day-to-day changes

`config.targets` (exact display names as shown in the Zalo Desktop sidebar)
and the `sinceTs`/`untilTs` time window (via the `todayAt(hour, minute)`
helper, evaluated against the current day at import time) are the primary
inputs. Renaming a group in Zalo requires updating `targets` to match — old
history stays under the old slug's `.jsonl` file, there's no automatic
history migration across a rename. Full field-by-field reference is in
`README.md` under "Cấu hình (`config.ts`)".

## Known fragile points (see README "Bảo trì" section for full detail)

Roughly by likelihood of breaking: DOM selectors (`scrapeSelectors.ts`) first,
then `config.targets` drifting from actual group names, then message-ID/timestamp
format varying by message type (e.g. album-photo messages have a different
`bb_msg_id_...` shape than plain text — only the leading numeric segment is
parsed out), then `zaloExePath` auto-detection breaking if Zalo changes its
install layout (e.g. MSIX/Store distribution).
