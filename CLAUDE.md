# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Reads Zalo group/DM message history from **Zalo Desktop** (the Windows app, not
chat.zalo.me) by attaching to it over the Chrome DevTools Protocol — scraping
the DOM for message content, and (in watch mode) also observing Zalo Desktop's
own WebSocket connection to its chat backend via CDP's `Network` domain purely
as a fast, best-effort trigger for "something new arrived in thread X" (see
`history/realtimeListener.ts`). Read-only: no send/reply path, no separate
login flow — it reuses whatever Zalo Desktop session is already logged in on
the machine; the WS observation reuses that same session's connection rather
than opening one of its own. See `README.md` for the full design rationale
(why CDP instead of Playwright/`zca-js` web login) and detailed data-flow
walkthrough — it's kept in sync with the code and is the source of truth for
anything not covered below.

## Commands

```bash
npx tsx index.ts                              # manual scrape of the queued targets only (npm run bot:scrape); empty queue exits at once
npm run bot:watch                              # long-running detector: enqueues targets with new messages into data/.scrape-queue.json, never scrapes
npm run zalo:debug                             # just relaunch Zalo Desktop with --remote-debugging-port open, then exit (for manual CDP probing)
npx tsx history/exportExcelCli.ts <threadId> [senderName]   # export already-scraped thread to .xlsx (npm run export:excel -- <threadId> [senderName])
npm run mcp                                    # start the read-only MCP server over stdio
npm run typecheck                              # tsc --noEmit
npm test                                       # unit tests for the lesson-report extractor (node:test)
npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]   # extract one session's start/end-of-lesson reports -> output/{output,marks,review,meta}.json
npm run fill:report -- output/output.json      # fill templates/Temp_RoomFacility_rpt.xlsm, run its macro -> data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm (needs Excel)
npm run mark:messages -- output/marks.json     # set StatusId/HasRead on Zalo_CrawlMessage rows
npm run watch:status                           # is bot:watch alive? when did it last beat, which sources are up, recent gaps
npm run bot:runner                             # long-running orchestrator: queue has groups + quiet for 2 min -> scrape, sync DB, extract, refresh the session's Excel
npm run runner:status                          # is bot:runner alive? last cycle, queue, sessions still owing a rebuild (exit 2 when not alive)
npm run runner:once -- [--day D] [--buoi B]    # rebuild ONE session's outputs without scraping (after editing output/overrides.json)
npm run recover:missing -- [--day D] [--buoi B] [--dry-run]   # only if bot:watch had a gap: re-scrape just the groups missing a report, list what was missed
```

The only tests are the unit tests under tests/ (`npm test`) for the lesson-report code in lesson/; there is no lint script. `curl http://127.0.0.1:9222/json/version`
checks whether the CDP debug port is currently open (should return JSON, not
connection-refused).

**`bot:watch` and `bot:scrape` cooperate through a queue, not by running the same UI code.**
`bot:watch` only appends target names to `data/.scrape-queue.json` (see
`history/scrapeQueue.ts`); `bot:scrape` (`index.ts`, manual) snapshots that
queue, scrapes exactly those targets, then removes exactly those entries
(`history/queueRun.ts`) — a target queued mid-scrape stays. `bot:watch` never
drives Zalo Desktop's UI, so running both at once is safe. See README "Hàng chờ
giữa `bot:watch` và `bot:scrape`".

**`bot:runner` is the third process** (runner/, `bot-runner.ts`): it reads the queue, waits until it has been quiet for 2 minutes (10 minutes at most from the first group), then runs a cycle (`runner/cycle.ts`): recover a `bot:watch` gap, scrape the queue, sync the DB, and for every session that got a new start/end report extract, replace the Excel via a temp file (`runner/safeReplace.ts`) and mark the messages. Everything that drives Zalo Desktop's UI (manual `bot:scrape` and each runner cycle) holds `data/.scrape.lock` (`history/scrapeLock.ts`). Sessions still owing a rebuild live in `data/.runner-pending.json`, so a crash loses nothing. The runner never restarts Zalo Desktop or `bot:watch`. Design: `docs/superpowers/specs/2026-09-25-bot-runner-design.md`.

## Architecture

Two independent run modes share the same core scraping/storage layer:

- **`index.ts`** — manual, queue-driven: read the scrape queue, scrape only those conversations, clear the ones handled, exit. Nothing runs on a schedule.
- **`watch.ts`** — long-running detector, never scrapes: reacts to new messages from two independent sources (see `history/watch.ts`) — Zalo Desktop's own WebSocket connection to its chat backend (`history/realtimeListener.ts`, primary) and its toast-notification popup window (fallback) — and only enqueues the affected target via `history/scrapeQueue.ts`. Always restarts Zalo Desktop on startup so the WS source can observe its one-time cipher-key handshake.

Both share:

- **`history/desktopScraper.ts`** — the core logic: `ensureZaloReady()` (checks/opens the CDP debug port, killing and relaunching `Zalo.exe` with `--remote-debugging-port` if needed — safe because the login session lives in the local profile, not the process), connects to the main window, finds/opens each target conversation in the sidebar, scrolls to load history until `targetMessageCount`, `sinceTs`, or a stalled scroll height stops it.
- **`history/cdp.ts`** — a minimal hand-rolled CDP WebSocket client (`Runtime.evaluate`, `Runtime.addBinding`/`bindingCalled`). Exists because Playwright's `connectOverCDP` can't attach to Zalo Desktop's Electron build (old CDP version, `Browser.setDownloadBehavior` errors).
- **`history/scrapeSelectors.ts`** — the CSS selectors for Zalo Desktop's DOM. **This is the most fragile part of the codebase** — a Zalo UI update can silently break it (symptom: message counts drop to 0, or "sidebar item not found"). Fix by running `npm run zalo:debug`, then probing the live DOM via `Runtime.evaluate` over `history/cdp.ts` and updating selectors to match.
- **`store/messageStore.ts`** — writes/reads `data/<groupId>.json` (one pretty-printed JSON array per thread, rewritten in full — via a temp-file-then-rename — on every save), deduped by `msgId`. This is the only persisted output; there's no separate append-only log or daily export file.
- **`history/exportExcel.ts`** / **`exportExcelCli.ts`** — ad-hoc export of an already-scraped thread from the JSON store to `.xlsx`, optionally filtered to one sender.
- **`mcp/server.ts`** — read-only MCP server (`list_threads`, `get_recent_messages`, `search_messages`) exposing `store/messageStore.ts` data to MCP clients (Claude Code/Desktop). Never touches Zalo/CDP itself — just reads the JSON files the scraper already wrote, so it works whether or not the scraper is currently running.

## Config (`config.ts`) — the one file you edit for day-to-day changes

`config.targets` (exact display names as shown in the Zalo Desktop sidebar)
and the `sinceTs`/`untilTs` time window (via the `todayAt(hour, minute)`
helper, evaluated against the current day at import time) are the primary
inputs. Renaming a group in Zalo does not affect storage — `data/<groupId>.json`
is keyed by the group's real (stable) id, not its display name.
Full field-by-field reference is in `README.md` under "Cấu hình (`config.ts`)".

## Known fragile points (see README "Bảo trì" section for full detail)

Roughly by likelihood of breaking: DOM selectors (`scrapeSelectors.ts`) first,
then `config.targets` drifting from actual group names, then message-ID/timestamp
format varying by message type (e.g. album-photo messages have a different
`bb_msg_id_...` shape than plain text — only the leading numeric segment is
parsed out), then `zaloExePath` auto-detection breaking if Zalo changes its
install layout (e.g. MSIX/Store distribution). `history/realtimeListener.ts`
is a distinct, more fragile category on its own — an undocumented,
reverse-engineered wire protocol (cmd/subCmd codes, AES-GCM + gzip framing)
that could change without any visible UI symptom; it's a best-effort trigger
source only, so a break there degrades to the notification-popup fallback
rather than losing messages outright.
