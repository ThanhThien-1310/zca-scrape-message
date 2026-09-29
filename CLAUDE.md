# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

Reads Zalo group/DM message history from **Zalo Desktop** (the Windows app, not
chat.zalo.me) by attaching to it over the Chrome DevTools Protocol — scraping
the DOM for message content, and (in watch mode) also observing Zalo Desktop's
own WebSocket connection to its chat backend via CDP's `Network` domain purely
as a fast, best-effort trigger for "something new arrived in thread X" (see
`src/watch/realtimeListener.ts`). Read-only: no send/reply path, no separate
login flow — it reuses whatever Zalo Desktop session is already logged in on
the machine; the WS observation reuses that same session's connection rather
than opening one of its own. See `README.md` for the full design rationale
(why CDP instead of Playwright/`zca-js` web login) and detailed data-flow
walkthrough — it's kept in sync with the code and is the source of truth for
anything not covered below.

## Commands

```bash
npx tsx src/cli/bot-scrape.ts                              # manual scrape of the queued targets only (npm run bot:scrape); empty queue exits at once
npm run bot:watch                              # long-running detector: appends targets with new messages to data/.scrape-events-<day>.jsonl (the scrape queue), never scrapes
npm run zalo:debug                             # just relaunch Zalo Desktop with --remote-debugging-port open, then exit (for manual CDP probing)
npx tsx src/cli/export-excel.ts <threadId> [senderName]   # export already-scraped thread to .xlsx (npm run export:excel -- <threadId> [senderName])
npm run mcp                                    # start the read-only MCP server over stdio
npm run typecheck                              # tsc --noEmit
npm test                                       # unit tests for the lesson-report extractor (node:test)
npm run extract:reports -- [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--no-db]   # extract one PHASE's start/end-of-lesson reports -> output/{output,marks,review,meta}.json
npm run fill:report -- output/output.json      # fill templates/Temp_RoomFacility_rpt.xlsm, run its macro -> data/export/baocaobuoi<phase>_<ddMMyy>.xlsm (needs Excel) -- RETIRED from bot:runner/runner:once (2026-09-29): template file missing from disk, and 4/5 of its tables (MAY TINH, INTERNET, NETSUPPORT, LOA) are superseded by fill:status-reports; still runnable by hand if the template is restored
npm run fill:status-reports -- output/output.json   # fill 5 non-macro status templates (BO SUNG MAY TINH, LOA, INTERNET, NETSUPPORT, MÁY TÍNH) from output/output.json, copy the other 5 as-is (except VI PHAM NOI QUY THUC TAP), into data/export/trang-thai/<yyMM>/<yyMMdd>/<title>_<yyMMdd>_T<thu>_<HHmm>.xlsx (needs Excel)
npm run mark:messages -- output/marks.json     # set StatusId/HasRead on Zalo_CrawlMessage rows
npm run watch:status                           # is bot:watch alive? when did it last beat, which sources are up, recent gaps
npm run bot:runner                             # long-running orchestrator: queue has groups + quiet for 2 min -> scrape, sync DB, extract, refresh the session's Excel
npm run runner:status                          # is bot:runner alive? last cycle (with step and per-group timings), queue, sessions still owing a rebuild (exit 2 when not alive)
npm run runner:timing -- [--last N]            # cycle and per-group scrape time statistics from output/runner-log.jsonl (avg, p95, max)
npm run runner:once -- [--day D] [--buoi morningstart|morningend|afternoonstart|afternoonend]    # rebuild ONE session's outputs without scraping (after editing output/overrides.json) -- also auto-runs fill:status-reports
npm run bot:chat                               # auto-reply from chat-rules.json: reads data/.chat-inbox.jsonl (written by bot:watch), sends via Zalo Desktop's UI
npm run chat:status                            # is bot:chat alive? dry-run or live, groups, pending inbox (exit 2 when not alive)
npm run config:show                            # print every tunable in config.ts by section (value, unit, default, which bot reads it); values that differ from the default are marked *
npm run scrape:add -- "Group name" [...]         # put group(s) from config.targets into the scrape queue by hand (a new group that was never scraped, or a forced re-scrape)
npm run recover:missing -- [--day D] [--buoi B] [--dry-run]   # only if bot:watch had a gap: re-scrape just the groups missing a report, list what was missed
```

The only tests are the unit tests under tests/ (`npm test`) for the lesson-report code in lesson/; there is no lint script. `curl http://127.0.0.1:9222/json/version`
checks whether the CDP debug port is currently open (should return JSON, not
connection-refused).

**`bot:watch` and `bot:scrape` cooperate through a queue, not by running the same UI code.**
`bot:watch` only appends one line per message to `data/.scrape-events-<day>.jsonl` (see
`src/scrape/scrapeQueue.ts`: append-only, no shared read-modify-write file, so watch and runner cannot overwrite each other); `bot:scrape` (`src/cli/bot-scrape.ts`, manual) and the runner take a snapshot of the
queue (its groups plus how many bytes of each event file were read), scrape exactly those targets, then append a record to `.scrape-events.handled.jsonl`
(`src/scrape/queueRun.ts`) — a target queued mid-scrape sits after that mark and stays; a target whose scrape failed stays queued and is retried up to `runner.maxScrapeAttempts` times. `bot:watch` never
drives Zalo Desktop's UI, so running both at once is safe. See README "Hàng chờ
giữa `bot:watch` và `bot:scrape`".

**`bot:runner` is the third process** (`src/runner/`, `src/cli/bot-runner.ts`): it reads the queue, waits until it has been quiet for 2 minutes (10 minutes at most from the first group), then runs a cycle (`src/runner/cycle.ts`): recover a `bot:watch` gap, scrape the queue, sync the DB, and for every session that got a new start/end report extract, run `fill:status-reports` (a failure there is a warning, not a build failure) and mark the messages. The old `.xlsm`-via-temp-file build (`fill:report`, `src/runner/safeReplace.ts`) is RETIRED from this pipeline as of 2026-09-29 (see the `fill:report` line above) — `BuildResult.excel` is always `null` now. Everything that drives Zalo Desktop's UI (manual `bot:scrape` and each runner cycle) holds `data/.scrape.lock` (`src/core/scrapeLock.ts`). Which sessions to build is derived from `data/.runner-built.json` (keys of reports already built): a report on disk that is not in it makes its session dirty, so a crash mid-cycle or a manual scrape loses nothing. "Session" here is a `Phase` (`morningstart|morningend|afternoonstart|afternoonend` — `src/runner/affectedSessions.ts`, `classifyPhase`), not the older sáng/chiều/tối `Buoi` still used by the gap-recovery path (`recover:missing`, `watch:status`, `src/lesson/recovery.ts`) — the two haven't been unified yet. The runner never restarts `bot:watch`; like `bot:scrape`, a scrape relaunches Zalo Desktop if its debug port is closed, so the runner does nothing while `bot:watch` is still starting. Design: `docs/superpowers/specs/2026-09-25-bot-runner-design.md`, `docs/superpowers/specs/2026-09-29-giai-doan-4-phan-design.md`.

**`bot:chat` is the fourth process** (`src/chat/`, `src/cli/bot-chat.ts`): `bot:watch` stays the only listener (only it holds the WS cipher key) and splits each message into two independent lanes via `src/chat/fanout.ts`: the scrape queue (for `bot:runner`) and the chat inbox `data/.chat-inbox.jsonl` (for `bot:chat`; only text messages of the groups named in `chat-rules.json`, never the account's own). `bot:chat` reads the inbox, matches `chat-rules.json` (`src/chat/match.ts`; `mayLoi` is derived from the report parser, not a keyword, so "Tổng số máy bị lỗi: 0" never matches), limits rate (`src/chat/limits.ts`) and sends through the UI (`src/chat/send.ts`: before every keystroke it re-checks that both the selected sidebar title and the composer placeholder name the target group). A rule's `mention` list makes it tag people first (type `@` and then the whole name so the list narrows, find the exact name in Zalo's `#mentionPopover` (else delete the typed name and use the full list), arrow-key to it, Enter, check a real tag element exists); it never tags everyone (`src/chat/mentions.ts` `isEveryone`) and sends nothing when a tag fails. Sent replies are written to `data/.chat-sent.json` BEFORE sending so `bot:watch` drops their echo from both lanes. Sending holds `data/.scrape.lock`. Design: `docs/superpowers/specs/2026-09-25-bot-chat-design.md`. A group marked `"scrape": false` in `chat-rules.json` is chat-only: `routeMessage` still feeds its text to the inbox but never queues it for scraping (`noScrapeGroups`; also skipped in the notification path of `src/watch/watch.ts`), and `recoveryIgnoreWith` (src/chat/rules.ts) adds it to the recovery ignore list.

## Layout

Everything runnable is under `src/`: `cli/` (one file per `npm run` command), `types/` (the shared types, one door: `import type { Report } from "../types/index.js"`), `core/` (`paths.ts`, atomic writes, the Zalo lock), `scrape/`, `watch/`, `runner/`, `chat/`, `lesson/`, `store/`, `export/`, `mcp/`, `config/`. `config.ts` and `chat-rules.json` stay at the project root because they are what you edit; tests are in `tests/`. Derive paths from `src/core/paths.ts`, never from a module's own `import.meta.url`.

## Architecture

Two independent run modes share the same core scraping/storage layer:

- **`src/cli/bot-scrape.ts`** — manual, queue-driven: read the scrape queue, scrape only those conversations, clear the ones handled, exit. Nothing runs on a schedule.
- **`src/cli/bot-watch.ts`** — long-running detector, never scrapes: reacts to new messages from two independent sources (see `src/watch/watch.ts`) — Zalo Desktop's own WebSocket connection to its chat backend (`src/watch/realtimeListener.ts`, primary) and its toast-notification popup window (fallback) — and only enqueues the affected target via `src/scrape/scrapeQueue.ts`. Always restarts Zalo Desktop on startup so the WS source can observe its one-time cipher-key handshake.

Both share:

- **`src/scrape/desktopScraper.ts`** — the core logic: `ensureZaloReady()` (checks/opens the CDP debug port, killing and relaunching `Zalo.exe` with `--remote-debugging-port` if needed — safe because the login session lives in the local profile, not the process), connects to the main window, finds/opens each target conversation in the sidebar, scrolls to load history until `targetMessageCount`, `sinceTs`, or a stalled scroll height stops it.
- **`src/scrape/cdp.ts`** — a minimal hand-rolled CDP WebSocket client (`Runtime.evaluate`, `Runtime.addBinding`/`bindingCalled`). Exists because Playwright's `connectOverCDP` can't attach to Zalo Desktop's Electron build (old CDP version, `Browser.setDownloadBehavior` errors).
- **`src/scrape/scrapeSelectors.ts`** — the CSS selectors for Zalo Desktop's DOM. **This is the most fragile part of the codebase** — a Zalo UI update can silently break it (symptom: message counts drop to 0, or "sidebar item not found"). Fix by running `npm run zalo:debug`, then probing the live DOM via `Runtime.evaluate` over `src/scrape/cdp.ts` and updating selectors to match.
- **`src/store/messageStore.ts`** — writes/reads `data/<groupId>.json` (one pretty-printed JSON array per thread, rewritten in full — via a temp-file-then-rename — on every save), deduped by `msgId`. This is the only persisted output; there's no separate append-only log or daily export file.
- **`src/export/exportExcel.ts`** / **`src/cli/export-excel.ts`** — ad-hoc export of an already-scraped thread from the JSON store to `.xlsx`, optionally filtered to one sender.
- **`src/mcp/server.ts`** — read-only MCP server (`list_threads`, `get_recent_messages`, `search_messages`) exposing `src/store/messageStore.ts` data to MCP clients (Claude Code/Desktop). Never touches Zalo/CDP itself — just reads the JSON files the scraper already wrote, so it works whether or not the scraper is currently running.

## Config (`config.ts`) — the one file you edit for day-to-day changes

`config.ts` is the single place for every tunable, in 8 documented sections (Zalo, targets, scraping, watch, runner, recovery, chat, sessions). Modules derive their timing constants from it (they no longer hard-code numbers, e.g. `QUIET_MS = config.runner.quietSeconds * 1000`); `src/config/configCheck.ts` rejects bad values at startup with the offending key; `src/config/configDoc.ts` documents each key for `npm run config:show`. Bots read it only at startup, so restart the affected bot after editing. Session hours (`config.sessions`) are the one source for both `sessionOf` (src/lesson/time.ts) and `sessionWindow` (src/lesson/recovery.ts).


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
install layout (e.g. MSIX/Store distribution). `src/watch/realtimeListener.ts`
is a distinct, more fragile category on its own — an undocumented,
reverse-engineered wire protocol (cmd/subCmd codes, AES-GCM + gzip framing)
that could change without any visible UI symptom; it's a best-effort trigger
source only, so a break there degrades to the notification-popup fallback
rather than losing messages outright.
