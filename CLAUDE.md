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
npm run extract:reports -- [--set <id>] [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--no-db]   # extract one PHASE's start/end-of-lesson reports -> output/<id>/{output,marks,review,meta}.json
npm run fill:report -- output/output.json      # fill templates/Temp_RoomFacility_rpt.xlsm, run its macro -> data/export/baocaobuoi<phase>_<ddMMyy>.xlsm (needs Excel) -- RETIRED from bot:runner/runner:once (2026-09-29): template file missing from disk, and 4/5 of its tables (MAY TINH, INTERNET, NETSUPPORT, LOA) are superseded by fill:status-reports; still runnable by hand if the template is restored
npm run fill:status-reports -- [output/<id>/output.json] [--set <id>] [--only <codes>]   # fill the status files from the new templates in data/mau bao cao new, in this order: NETSUPPORT, ÂM THANH (key `loa`, template "01 - FORM TINH TRANG AM THANH.xlsx"), INTERNET (NETSUPPORT and INTERNET share one 2-sheet template) and MÁY TÍNH; the order of the keys of `FILE_LAYOUT` is also the export and print order of the total report (NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH, NỘI QUY) (ĐIỆN is NOT made here any more: see `fill:electric-report`), into <statusExportDir>/<yyMM>/<yyMMdd>/<id>/<title>_<yyMMdd>_T<thu>_<HHmm>.xlsx where the title is read from cell A1 of each template and HHmm is the time of the LATEST REPORT of that phase (`latestReportHhmm`: e.g. the latest report before 9:00 names the start-of-morning file; run time only when the phase has no report), so rebuilding without a new report gives the same name — and if another phase of the same set, day and title already uses that minute the next free minute is taken (`freeHhmm`), because the name has no phase in it and phases built back to back (e.g. `npm run today`) would otherwise overwrite each other; the previous file of the same phase is found via data/.status-report-files.json and deleted after the new one is written; there is no SỐ LẦN column any more; VỆ SINH and NỘI QUY are written by `fill:cleaning-report` / `fill:attendance-report` (run once per runner cycle) — see docs/superpowers/specs/2026-10-03-bo-mau-moi-7-file-design.md (needs Excel)
npm run fill:electric-report -- [--set <id>] [--now <unix ms>] [--force]   # TÌNH TRẠNG ĐIỆN of TODAY from the WHOLE DAY of "LỖI ĐIỆN" messages (any group, any hour, latest per room; Trường/Khu vực default to the group name; Tình trạng T/B/K goes to XẾP LOẠI and sorts T,B,K, other text to HIỆN TRẠNG): ONE file per day, run once per runner cycle, rebuilt (new HHmm, old one replaced) only when the rows changed since the last build (data/.electric-report.<id>.json), otherwise it does nothing
npm run mark:messages -- output/<id>/marks.json     # set StatusId/HasRead on Zalo_CrawlMessage rows
npm run watch:status                           # is bot:watch alive? when did it last beat, which sources are up, recent gaps
npm run bot:runner                             # long-running orchestrator: queue has groups + quiet for 2 min -> scrape, sync DB, extract, refresh the session's Excel
npm run runner:status                          # is bot:runner alive? last cycle (with step and per-group timings), queue, sessions still owing a rebuild (exit 2 when not alive)
npm run runner:timing -- [--last N]            # cycle and per-group scrape time statistics from output/runner-log.jsonl (avg, p95, max)
npm run runner:once -- [--set <id>] [--day D] [--buoi morningstart|morningend|afternoonstart|afternoonend]    # rebuild ONE session's outputs without scraping (after editing output/<id>/overrides.json) -- also auto-runs fill:status-reports
npm run bot:chat                               # auto-reply from chat-rules.json: reads data/.chat-inbox.jsonl (written by bot:watch), sends via Zalo Desktop's UI
npm run chat:status                            # is bot:chat alive? dry-run or live, groups, pending inbox (exit 2 when not alive)
npm run bot:total                              # long-running scheduler for the TOTAL reports: at 9:00 (messages 6:30-9:00) and 15:00 (messages 6:30-15:00) it writes the 7 status files with "-auto" appended to the name (waits up to 10 minutes for bot:runner to drain the queue, re-exports while the first export was incomplete); never scrapes, never takes data/.scrape.lock
npm run total:once -- --slot morning|afternoon [--set <id>] [--day D] [--now <unix ms>] [--print [--dry-run]]   # write one slot's 7 "-auto" files right now (no waiting) and record the slot so bot:total does not repeat it; --print also prints them on the Windows default printer (--dry-run only lists what would print)
npm run total:status                           # is bot:total alive, and what happened to today's two slots (exit 2 when not alive)
npm run config:show                            # print every tunable in config.ts by section (value, unit, default, which bot reads it); values that differ from the default are marked *
npm run reports:list                           # the valid report codes for config.reportSets[].reports: kind, source title, Excel template and whether the template exists on this machine
npm run skills:sync                            # copy the skills from SKILLS-Agent/ (source of truth) to .claude/skills/ (what Claude Code loads)
npm run skills:check                           # check the skills follow SKILLS-Agent/FORMAT.md and .claude/skills/ matches SKILLS-Agent/ (exit 1 on problems; npm test checks this too)
npm run scrape:add -- "Group name" [...]         # put group(s) from config.targets into the scrape queue by hand (a new group that was never scraped, or a forced re-scrape)
npm run today -- [--set <id>] [--no-db] [--dry-run]   # ONE command for the whole of today: scrape every group (except chat-only ones) back to 17:30 the evening before, sync the DB, then rebuild ALL of today's phases for each report set plus VỆ SINH, NỘI QUY, ĐIỆN, using the runner's own cycle (`runCycle`) with the scrape-all step and today's reports forced to "not built"; holds data/.scrape.lock (exit 2 if a cycle or scrape is running); does NOT make the total report (use `total:once`); --dry-run only lists what it would do
npm run recover:missing -- [--day D] [--buoi B] [--dry-run]   # only if bot:watch had a gap: re-scrape just the groups missing a report, list what was missed (the sáng window starts at 17:30 the evening before, `recoveryWindow`, because reports sent after 17:30 belong to the next morningstart; the runner's catch-up scrape `scrapeSinceTs` reaches back to the same time)
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

**`bot:runner` is the third process** (`src/runner/`, `src/cli/bot-runner.ts`): it reads the queue, waits until it has been quiet for 2 minutes (10 minutes at most from the first group), then runs a cycle (`src/runner/cycle.ts`): recover a `bot:watch` gap, scrape the queue, sync the DB, and for every session that got a new start/end report extract, run `fill:status-reports` (a failing report file there is a warning, recorded in `data/.runner-failed.json` and retried alone, not a build failure) and mark the messages. The old `.xlsm`-via-temp-file build (`fill:report`, `src/runner/safeReplace.ts`) is RETIRED from this pipeline as of 2026-09-29 (see the `fill:report` line above) — `BuildResult.excel` is always `null` now. Everything that drives Zalo Desktop's UI (manual `bot:scrape` and each runner cycle) holds `data/.scrape.lock` (`src/core/scrapeLock.ts`). Which sessions to build is derived from `data/.runner-built.json` (keys of reports already built): a report on disk that is not in it makes its session dirty, so a crash mid-cycle or a manual scrape loses nothing. "Session" here is a `Phase` (`morningstart|morningend|afternoonstart|afternoonend` — `src/runner/affectedSessions.ts`, `classifyPhase`), not the older sáng/chiều/tối `Buoi` still used by the gap-recovery path (`recover:missing`, `watch:status`, `src/lesson/recovery.ts`) — the two haven't been unified yet. The runner never restarts `bot:watch`; like `bot:scrape`, a scrape relaunches Zalo Desktop if its debug port is closed, so the runner does nothing while `bot:watch` is still starting. Design: `docs/superpowers/specs/2026-09-25-bot-runner-design.md`, `docs/superpowers/specs/2026-09-29-giai-doan-4-phan-design.md`.

**`bot:chat` is the fourth process** (`src/chat/`, `src/cli/bot-chat.ts`): `bot:watch` stays the only listener (only it holds the WS cipher key) and splits each message into two independent lanes via `src/chat/fanout.ts`: the scrape queue (for `bot:runner`) and the chat inbox `data/.chat-inbox.jsonl` (for `bot:chat`; only text messages of the groups named in `chat-rules.json`, never the account's own). `bot:chat` reads the inbox, matches `chat-rules.json` (`src/chat/match.ts`; `mayLoi` is derived from the report parser, not a keyword, so "Tổng số máy bị lỗi: 0" never matches), limits rate (`src/chat/limits.ts`) and sends through the UI (`src/chat/send.ts`: before every keystroke it re-checks that both the selected sidebar title and the composer placeholder name the target group). A rule's `mention` list makes it tag people first (type `@` and then the whole name so the list narrows, find the exact name in Zalo's `#mentionPopover` (else delete the typed name and use the full list), arrow-key to it, Enter, check a real tag element exists); it never tags everyone (`src/chat/mentions.ts` `isEveryone`) and sends nothing when a tag fails. Sent replies are written to `data/.chat-sent.json` BEFORE sending so `bot:watch` drops their echo from both lanes. Sending holds `data/.scrape.lock`. Design: `docs/superpowers/specs/2026-09-25-bot-chat-design.md`. A group marked `"scrape": false` in `chat-rules.json` is chat-only: `routeMessage` still feeds its text to the inbox but never queues it for scraping (`noScrapeGroups`; also skipped in the notification path of `src/watch/watch.ts`), and `recoveryIgnoreWith` (src/chat/rules.ts) adds it to the recovery ignore list.

**`bot:total` is the fifth process** (`src/total/`, `src/cli/bot-total.ts`): at 9:00 and 15:00 (`config.total`) it exports the status files (7 report types for a set that enables them all, once per report set) of the day to `data/export/trang-thai/<yyMM>/<yyMMdd>/<id>/<title>_<yyMMdd>_T<thu>_<HHmm>-auto.xlsx`, from the local message store, over the messages sent from `windowStartHour` (6:30) up to the slot hour, one report per room (the latest one that has a grade; a later all-blank report such as "Học tại lớp" does not erase an earlier graded one). It runs in parallel with `bot:runner` without touching it: it reads `data/.runner-state.json` and the scrape queue only to decide whether to wait (at most `waitMaxMinutes`; a dead runner is not waited for), keeps its own `data/.total-state.json`, `data/.total-slots.json` and `data/.total-report-files.json`, and never takes `data/.scrape.lock`, uses `output/output.json` or marks messages. A slot that was exported while the queue was not empty is exported again every `refreshEveryMinutes` (or as soon as the queue is empty) until `refreshUntilMinutes`, replacing only that slot's "-auto" files. Printing (config section 11 `print`, off by default; `src/total/printFiles.ts`, `scripts/print-xlsx.ps1`): after the FIRST successful export of a slot it sends EVERY exported file, including those with no data rows (main sheet only, at most `print.maxPagesPerFile` pages each) to the Windows default printer through Excel `PrintOut`, margins and orientation come from the templates; it only ever reports "print command sent", never "printed". A print error is a warning, never a failed slot. Design: `docs/superpowers/specs/2026-10-02-bao-cao-tong-auto-design.md`.

**Report sets (`config.reportSets`, `src/reportSets/`)**: every report belongs to a PERSON, not to a Zalo group. A set is `{ id, reports }`: `id` is the person's folder (`<statusExportDir>/<yyMM>/<yyMMdd>/<id>/`, created by the bot), `reports` are internal codes (`netsupport`, `loa`, `internet`, `mayTinh`, `dien`, `cleaning`, `attendance`; see `npm run reports:list`), with no default. All messages from every group in `config.targets` go through every set, and a code may be in several sets. `resolveReportSets` never throws: a wrong set or entry is disabled and reported loudly (startup screen of `bot:runner`/`bot:total`, `runner:status`, `total:status` (exit 2), `config:show`, cycle summary) while the others keep running. Isolation unit = (set, code): `bot:runner` loops sets, each set works in `output/<id>/` (own `output.json`, `marks.json`, `review*.json`, `meta.json`, `overrides.json`), a failed report file is written to `data/.runner-failed.json` and retried alone (every `runner.dirtyRetrySeconds`, forgotten when the day ends), built state is `{ "<id>": [...] }` in `data/.runner-built.json` (the old array is handed to the current sets; a new set starts from a baseline so it does not rebuild history), the file tracker and the electric state (`data/.electric-report.<id>.json`) are per set, and the marks (`StatusId`) of all sets are merged (needs-review > done > ignored) and written once per cycle (marks that could not be written stay in `data/.runner-marks-pending.json` for the next cycle). `bot:total` writes each set's `-auto` files into its folder. Old `output/overrides.json` must be copied by hand into `output/<id>/overrides.json` (the runner warns). Adding a NEW report type needs code (registry entry, parser, layout, tests); see `SKILLS-Agent/cau-hinh-nguoi-phu-trach/SKILL.md`. Design: `docs/superpowers/specs/2026-10-06-bo-bao-cao-theo-nguoi-design.md`.

## Project skills (`.claude/skills/`)

Edit skills in `SKILLS-Agent/` (format: `SKILLS-Agent/FORMAT.md`), then run `npm run skills:sync`; Claude Code loads the copies in `.claude/skills/`, and `npm test` fails when the two differ. Use them without being asked (each skill's `description` says when not to):

- Add or change a person's report set (`reportSets`, "thêm người phụ trách", "cấu hình cho người mới"): `cau-hinh-nguoi-phu-trach`. A report TYPE that is not in `npm run reports:list` needs code: `them-loai-bao-cao-moi`.
- Items "cần xem" in `output/<id>/review_*.json` / fixing a misread message with `overrides.json`: `xu-ly-muc-can-xem`.
- "Is the system running", bot status, gaps: `giam-sat-van-hanh` (read-only; restarting bots or any write needs the user's yes).
- Compare an exported Excel with the source messages: `kiem-tra-bao-cao-dau-ra`.
- Questions about message formats or output files: `du-lieu-nhom-truong` (school groups), `du-lieu-nhom-ky-thuat` (IT groups), `du-lieu-dau-ra` (the 7 Excel files).
- Read the text in a photo message: `doc-anh-bao-cao` (returns the reading only; nothing is saved).
- Any long task with several steps: apply `save-token` (classify each step into a model tier, show the plan with the reason for each model, wait for the user's answer). This line is the user's standing permission to delegate the steps to subagents with the model the plan names. Always check what a cheaper model returns before using it.

## Layout

Everything runnable is under `src/`: `cli/` (one file per `npm run` command), `types/` (the shared types, one door: `import type { Report } from "../types/index.js"`), `core/` (`paths.ts`, atomic writes, the Zalo lock), `scrape/`, `watch/`, `runner/`, `chat/`, `lesson/`, `reportSets/`, `store/`, `export/`, `mcp/`, `config/`. `config.ts` and `chat-rules.json` stay at the project root because they are what you edit; tests are in `tests/`. Derive paths from `src/core/paths.ts`, never from a module's own `import.meta.url`.

## Architecture

Two independent run modes share the same core scraping/storage layer:

- **`src/cli/bot-scrape.ts`** — manual, queue-driven: read the scrape queue, scrape only those conversations, clear the ones handled, exit. Nothing runs on a schedule.
- **`src/cli/bot-watch.ts`** — long-running detector, never scrapes: reacts to new messages from one source (see `src/watch/watch.ts`): Zalo Desktop's own WebSocket connection to its chat backend (`src/watch/realtimeListener.ts`; the old toast-popup fallback was removed because the toast is a Windows notification, not a Zalo window), and only enqueues the affected target via `src/scrape/scrapeQueue.ts`. Always restarts Zalo Desktop on startup so the WS source can observe its one-time cipher-key handshake.

Both share:

- **`src/scrape/desktopScraper.ts`** — the core logic: `ensureZaloReady()` (checks/opens the CDP debug port, killing and relaunching `Zalo.exe` with `--remote-debugging-port` if needed — safe because the login session lives in the local profile, not the process), connects to the main window, finds/opens each target conversation in the sidebar, scrolls to load history until `targetMessageCount`, `sinceTs`, or a stalled scroll height stops it.
- **`src/scrape/cdp.ts`** — a minimal hand-rolled CDP WebSocket client (`Runtime.evaluate`, `Runtime.addBinding`/`bindingCalled`). Exists because Playwright's `connectOverCDP` can't attach to Zalo Desktop's Electron build (old CDP version, `Browser.setDownloadBehavior` errors).
- **`src/scrape/scrapeSelectors.ts`** — the CSS selectors for Zalo Desktop's DOM. **This is the most fragile part of the codebase** — a Zalo UI update can silently break it (symptom: message counts drop to 0, or "sidebar item not found"). Fix by running `npm run zalo:debug`, then probing the live DOM via `Runtime.evaluate` over `src/scrape/cdp.ts` and updating selectors to match.
- **`src/store/messageStore.ts`** — writes/reads `data/<groupId>.json` (one pretty-printed JSON array per thread, rewritten in full — via a temp-file-then-rename — on every save), deduped by `msgId`. This is the only persisted output; there's no separate append-only log or daily export file.
- **`src/export/exportExcel.ts`** / **`src/cli/export-excel.ts`** — ad-hoc export of an already-scraped thread from the JSON store to `.xlsx`, optionally filtered to one sender.
- **`src/mcp/server.ts`** — read-only MCP server (`list_threads`, `get_recent_messages`, `search_messages`) exposing `src/store/messageStore.ts` data to MCP clients (Claude Code/Desktop). Never touches Zalo/CDP itself — just reads the JSON files the scraper already wrote, so it works whether or not the scraper is currently running.

## Config (`config.ts`) — the one file you edit for day-to-day changes

`config.ts` is the single place for every tunable, in 8 documented sections (Zalo, targets, scraping, watch, runner, recovery, chat, sessions). Modules derive their timing constants from it (they no longer hard-code numbers, e.g. `QUIET_MS = config.runner.quietSeconds * 1000`); `src/config/configCheck.ts` rejects bad values at startup with the offending key; `src/config/configDoc.ts` documents each key for `npm run config:show`. Bots read it only at startup, so restart the affected bot after editing. `statusExportDir` (section 1, default `data/export/trang-thai`, must be absolute) is the root of every status report: a day goes to `<statusExportDir>/<yyMM>/<yyMMdd>/` via `statusReportDir` in `src/core/paths.ts` (4 phases and `bot:total` alike); changing it does not move old files. Session hours (`config.sessions`) are the one source for both `sessionOf` (src/lesson/time.ts) and `sessionWindow` (src/lesson/recovery.ts).


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
that could change without any visible UI symptom; it is the only live trigger
source, so a break there leaves `bot:watch` blind (`npm run watch:status` says so)
and missed messages are caught by `recover:missing` / the runner's catch-up scrape.
