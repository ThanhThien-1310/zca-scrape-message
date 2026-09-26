# `bot:runner` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một tiến trình `bot:runner` tự cào hàng chờ, đồng bộ DB, trích xuất và ghi đè Excel của buổi bị ảnh hưởng mỗi khi hàng chờ có nhóm (sau debounce), để agent chỉ còn giám sát.

**Architecture:** `bot:watch` giữ nguyên (chỉ phát hiện, ghi hàng chờ). `bot:runner` là bộ điều phối: hàm thuần `decide` quyết định chờ/chạy, `runCycle` (deps tiêm được, theo kiểu `history/queueRun.ts`) chạy một vòng, các bước đã có (`syncDb`, `extractLessonReports`, `fillRoomFacilityReport`, `markMessages`) được gọi như tiến trình con. Nhịp tim, nhật ký, danh sách buổi chờ dựng và một khóa chung cho mọi thứ điều khiển giao diện Zalo nằm trên đĩa.

**Tech Stack:** Node ≥22, TypeScript chạy bằng `tsx`, `node:test`, ESM (`.js` khi import), thụt lề 4 dấu cách. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-09-25-bot-runner-design.md`

## Global Constraints

- Không sửa `config.ts` (tệp CRLF). Tệp mới dùng LF; tệp có sẵn kiểm bằng `git ls-files --eol` trước khi sửa, hiện tại tất cả tệp cần sửa trong kế hoạch này là LF.
- Không thêm phụ thuộc vào `package.json`.
- `bot:runner` không bao giờ khởi động lại Zalo Desktop và không bao giờ khởi động lại `bot:watch`.
- Debounce mặc định: `QUIET_MS = 2 * 60_000`, `MAX_WAIT_MS = 10 * 60_000`. Runner dừng tự thử sau `MAX_CONSECUTIVE_FAILURES = 3` vòng lỗi liên tiếp.
- Nhịp tim mỗi 30 giây, quá 90 giây là chết (dùng lại `HEARTBEAT_INTERVAL_MS`, `STALE_AFTER_MS` của `history/watchState.ts`).
- Tệp trạng thái đều ghi nguyên tử (tệp tạm rồi đổi tên); tệp hỏng hoặc sai hình dạng đọc như "không có".
- Mọi commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Khối "Quy tắc trích xuất" của `Teach-lesson-skills-V2/SKILL.md` (từ `## Quy tắc trích xuất` đến ngay trước `## Script trích xuất và agent giám sát`) không được đổi một chữ nào.
- Chạy `npm test` và `npm run typecheck` ở thư mục `zca-scrape-message/` sau mỗi task. Hiện tại bộ test có 107 test đều đạt.

## Review Focus

1. **Runner chết giữa vòng, sau khi cào nhưng trước khi dựng Excel.** Lần sau phải vẫn dựng lại buổi đó dù không có tin mới (danh sách buổi chờ dựng `pending`). Test ở Task 7.
2. **`bot:watch` chết và hàng chờ rỗng.** Không ai kích hoạt vòng nào; runner phải tự kích hoạt một vòng khôi phục khi thấy gián đoạn mới chồng lên buổi hiện tại. Test ở Task 2 (`newRecoveryKeys`) và Task 8.
3. **Người dùng đang mở file Excel.** Đổi tên bị khóa phải ra `_moi.xlsm`, bản cũ nguyên vẹn; điền lỗi giữa chừng không để lại tệp tạm hay đè bản cũ. Test ở Task 4.
4. **Hai thứ cùng điều khiển giao diện Zalo** (runner đang cào và người chạy tay `bot:scrape`). Phải từ chối rõ ràng, và khóa của tiến trình đã chết phải bị chiếm lại. Test ở Task 5.
5. **Ranh giới buổi và qua ngày.** Tin lúc 11:59 thuộc sáng, 12:00 thuộc chiều, 23:59 thuộc tối, 00:00 thuộc sáng ngày mới; tin không phải báo cáo đầu/cuối buổi không kích hoạt dựng lại. Test ở Task 3.

## File Structure

| Tệp | Việc |
|---|---|
| `runner/schedule.ts` (mới) | `decide`, `toQueueTimes`, `newRecoveryKeys`: quyết định thuần, không I/O |
| `history/scrapeQueue.ts` (sửa) | Ghi thêm mốc thời điểm vào hàng chờ (tệp phụ `.scrape-queue-meta.json`) |
| `runner/affectedSessions.ts` (mới) | `SessionKey`, `affectedSessions`, `mergeSessions` |
| `runner/safeReplace.ts` (mới) | Ghi Excel qua tệp tạm, đổi tên đè, dự phòng `_moi` |
| `fillRoomFacilityReport.ts` (sửa) | Thêm tùy chọn `--out <path>` |
| `history/watchState.ts` (sửa) | Xuất `pidAlive` |
| `history/scrapeLock.ts` (mới) | Khóa chung `data/.scrape.lock` |
| `runner/runnerState.ts` (mới) | Nhịp tim, đếm lỗi, nhật ký, danh sách buổi chờ dựng, `runnerHealth` |
| `runner/cycle.ts` (mới) | `runCycle(deps)` |
| `runner/runnerStatusReport.ts` (mới) | `formatRunnerStatus` |
| `runner/steps.ts` (mới) | Các phụ thuộc thật: tiến trình con, `buildSession`, `loadMessages` |
| `bot-runner.ts`, `runnerOnce.ts`, `runnerStatus.ts` (mới) | Ba lệnh CLI |
| `index.ts` (sửa) | `bot:scrape` giữ khóa chung |
| `package.json`, `README.md`, `CLAUDE.md`, `docs/*`, `Teach-lesson-skills-V2/SKILL.md` | Lệnh mới và tài liệu |

## Interfaces (tổng hợp, dùng xuyên các task)

```ts
// runner/affectedSessions.ts
export interface SessionKey { day: string; buoi: Buoi }
export function mergeSessions(...lists: SessionKey[][]): SessionKey[];
export function affectedSessions(before: Set<string>, after: SourceMessage[]): SessionKey[];

// runner/runnerState.ts
export interface CycleSummary { kind: "cycle" | "rebuild"; at: number; ok: boolean; groups: string[]; sessions: SessionKey[]; reviewCount: number; excel: string[]; warnings: string[]; errors: string[] }
export type RunnerPhase = "idle" | "waiting" | "running" | "error" | "stopped";
export interface RunnerState { pid: number; startedAt: number; lastBeat: number; state: RunnerPhase; consecutiveFailures: number; lastCycle?: CycleSummary }

// runner/cycle.ts
export interface BuildResult { reviewCount: number; excel: string | null; warnings: string[] }
export interface CycleDeps { now(): number; loadMessages(): Promise<SourceMessage[]>; recover(): Promise<{ errors: string[] }>; scrapeQueued(): Promise<QueueRunResult>; syncDb(): Promise<void>; build(session: SessionKey): Promise<BuildResult>; pending: { read(): SessionKey[]; write(list: SessionKey[]): void } }
export function runCycle(deps: CycleDeps): Promise<CycleSummary>;
```

---

### Task 1: Quyết định debounce (`runner/schedule.ts`, phần `decide` và `toQueueTimes`)

**Files:**
- Create: `runner/schedule.ts`
- Test: `tests/schedule.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces: `QUIET_MS`, `MAX_WAIT_MS`, `QueueTimes`, `Decision`, `decide(q, now, quietMs?, maxWaitMs?)`, `toQueueTimes(queue, meta, fallback)`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/schedule.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, MAX_WAIT_MS, QUIET_MS, toQueueTimes } from "../runner/schedule.js";

const NOW = 1_000_000_000_000;

test("an empty queue is idle", () => {
    assert.deepEqual(decide({ count: 0, firstQueuedAt: 0, lastQueuedAt: 0 }, NOW), { action: "idle" });
});

test("a group queued a moment ago is waited for, with the time it becomes due", () => {
    const q = { count: 1, firstQueuedAt: NOW - 10_000, lastQueuedAt: NOW - 10_000 };
    assert.deepEqual(decide(q, NOW), { action: "wait", runAt: NOW - 10_000 + QUIET_MS });
});

test("the queue runs once it has been quiet for the quiet period", () => {
    const q = { count: 2, firstQueuedAt: NOW - QUIET_MS - 60_000, lastQueuedAt: NOW - QUIET_MS };
    assert.deepEqual(decide(q, NOW), { action: "run", reason: "quiet" });
});

test("a steady stream of groups still runs at the maximum wait", () => {
    const q = { count: 4, firstQueuedAt: NOW - MAX_WAIT_MS, lastQueuedAt: NOW - 5_000 };
    assert.deepEqual(decide(q, NOW), { action: "run", reason: "max-wait" });
});

test("runAt is the earlier of the quiet deadline and the maximum wait", () => {
    const q = { count: 3, firstQueuedAt: NOW - MAX_WAIT_MS + 30_000, lastQueuedAt: NOW - 1_000 };
    assert.deepEqual(decide(q, NOW), { action: "wait", runAt: NOW + 30_000 });
});

test("toQueueTimes takes the earliest and latest recorded time, and falls back for groups with none", () => {
    assert.deepEqual(toQueueTimes([], {}, NOW), { count: 0, firstQueuedAt: NOW, lastQueuedAt: NOW });
    assert.deepEqual(toQueueTimes(["A", "B"], { A: 100, B: 300 }, NOW), { count: 2, firstQueuedAt: 100, lastQueuedAt: 300 });
    assert.deepEqual(toQueueTimes(["A", "B"], { A: 100 }, NOW), { count: 2, firstQueuedAt: 100, lastQueuedAt: NOW });
    assert.deepEqual(toQueueTimes(["A"], { Z: 5 }, NOW), { count: 1, firstQueuedAt: NOW, lastQueuedAt: NOW });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/schedule.test.ts`
Expected: FAIL, không tìm thấy module `../runner/schedule.js`.

- [ ] **Step 3: Viết cài đặt tối thiểu**

Tạo `runner/schedule.ts`:

```ts
/** The queue must be quiet this long before a cycle runs (bursts of reports arrive together). */
export const QUIET_MS = 2 * 60_000;
/** A cycle runs at the latest this long after the earliest group was queued, however busy the queue stays. */
export const MAX_WAIT_MS = 10 * 60_000;

export interface QueueTimes {
    count: number;
    /** When the earliest queued group was queued. Meaningless when `count` is 0. */
    firstQueuedAt: number;
    /** When the latest queued group was queued. Meaningless when `count` is 0. */
    lastQueuedAt: number;
}

export type Decision = { action: "idle" } | { action: "wait"; runAt: number } | { action: "run"; reason: "quiet" | "max-wait" };

/** Pure: is it time to run a cycle? "Has work" is simply `count > 0`; no separate flag is stored. */
export function decide(q: QueueTimes, now: number, quietMs: number = QUIET_MS, maxWaitMs: number = MAX_WAIT_MS): Decision {
    if (q.count === 0) return { action: "idle" };
    if (now - q.lastQueuedAt >= quietMs) return { action: "run", reason: "quiet" };
    if (now - q.firstQueuedAt >= maxWaitMs) return { action: "run", reason: "max-wait" };
    return { action: "wait", runAt: Math.min(q.lastQueuedAt + quietMs, q.firstQueuedAt + maxWaitMs) };
}

/** Times of the queued groups from the sidecar `meta` file; a group without a recorded time counts as queued at `fallback`. */
export function toQueueTimes(queue: string[], meta: Record<string, number>, fallback: number): QueueTimes {
    if (queue.length === 0) return { count: 0, firstQueuedAt: fallback, lastQueuedAt: fallback };
    const times = queue.map((t) => (typeof meta[t] === "number" ? meta[t] : fallback));
    return { count: queue.length, firstQueuedAt: Math.min(...times), lastQueuedAt: Math.max(...times) };
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/schedule.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Commit**

```bash
git add runner/schedule.ts tests/schedule.test.ts
git commit -m "feat(runner): debounce decision for the scrape queue" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Mốc thời điểm của hàng chờ và khóa kích hoạt khôi phục

**Files:**
- Modify: `history/scrapeQueue.ts`
- Modify: `runner/schedule.ts` (thêm `newRecoveryKeys`)
- Test: `tests/scrapeQueue.test.ts` (thêm), `tests/schedule.test.ts` (thêm)

**Interfaces:**
- Consumes: `Gap` từ `history/watchState.ts`.
- Produces: `readQueueMeta(file?): Record<string, number>`; `enqueueTarget(target, file?, now?)` (tham số `now` mới, mặc định `Date.now()`); `newRecoveryKeys(gaps: Gap[], done: ReadonlySet<string>): string[]`.

- [ ] **Step 1: Viết test thất bại cho hàng chờ**

Thêm vào cuối `tests/scrapeQueue.test.ts` (và thêm `readQueueMeta` vào import từ `../history/scrapeQueue.js`):

```ts
test("enqueue records when a group was queued, and re-queuing does not move that time", () => {
    const file = fresh();
    enqueueTarget("A", file, 1000);
    enqueueTarget("B", file, 2000);
    enqueueTarget("A", file, 3000);
    assert.deepEqual(readQueueMeta(file), { A: 1000, B: 2000 });
});

test("removeFromQueue forgets the times of the handled groups only", () => {
    const file = fresh();
    enqueueTarget("A", file, 1000);
    enqueueTarget("B", file, 2000);
    removeFromQueue(["A"], file);
    assert.deepEqual(readQueueMeta(file), { B: 2000 });
});

test("a missing or corrupt meta file reads as empty", () => {
    const file = fresh();
    assert.deepEqual(readQueueMeta(file), {});
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const content of ["{ nope", "[]", '"x"', '{"A": "soon", "B": 5}']) {
        fs.writeFileSync(file.replace(/\.json$/, "-meta.json"), content, "utf8");
        assert.deepEqual(readQueueMeta(file), content.includes('"B": 5') ? { B: 5 } : {}, content);
    }
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/scrapeQueue.test.ts`
Expected: FAIL, `readQueueMeta` không được xuất.

- [ ] **Step 3: Sửa `history/scrapeQueue.ts`**

Thay khối từ dòng `function writeQueue` đến hết tệp bằng:

```ts
function writeJson(value: unknown, file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, file);
}

/** `.scrape-queue.json` -> `.scrape-queue-meta.json`: when each queued group was queued (epoch ms), for the runner's debounce. */
function metaPath(file: string): string {
    return file.replace(/\.json$/, "-meta.json");
}

/** A missing, unreadable or wrongly shaped file reads as empty; entries whose value is not a number are dropped. */
export function readQueueMeta(file: string = DEFAULT_QUEUE_PATH): Record<string, number> {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(metaPath(file), "utf8"));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
        return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, number] => typeof e[1] === "number"));
    } catch {
        return {};
    }
}

/** Adds `target` unless already queued; returns whether it was added. The time is recorded only when it is added. */
export function enqueueTarget(target: string, file: string = DEFAULT_QUEUE_PATH, now: number = Date.now()): boolean {
    const queue = readQueue(file);
    if (queue.includes(target)) return false;
    queue.push(target);
    writeJson(queue, file);
    writeJson({ ...readQueueMeta(file), [target]: now }, metaPath(file));
    return true;
}

/** Re-reads the file and removes only `handled`, so a target queued after the caller took its snapshot survives. */
export function removeFromQueue(handled: string[], file: string = DEFAULT_QUEUE_PATH): void {
    const drop = new Set(handled);
    const current = readQueue(file);
    const remaining = current.filter((t) => !drop.has(t));
    if (remaining.length === current.length && !fs.existsSync(file)) return;
    writeJson(remaining, file);
    const meta = readQueueMeta(file);
    writeJson(Object.fromEntries(Object.entries(meta).filter(([t]) => !drop.has(t))), metaPath(file));
}
```

Cũng cập nhật đoạn comment đầu tệp: thêm câu "Times of enqueueing live in a sidecar `.scrape-queue-meta.json` (see `readQueueMeta`)." vào cuối khối `/** ... */` ở đầu.

- [ ] **Step 4: Chạy test hàng chờ**

Run: `node --import tsx --test tests/scrapeQueue.test.ts`
Expected: PASS (5 test cũ + 3 test mới). Test cũ kiểm `${file}.tmp` không còn tồn tại vẫn đúng.

- [ ] **Step 5: Viết test thất bại cho `newRecoveryKeys`**

Thêm vào `tests/schedule.test.ts` (thêm `newRecoveryKeys` vào import):

```ts
test("newRecoveryKeys lists the gaps not yet recovered, keyed by their bounds; an open gap is keyed apart from its closed form", () => {
    const gaps = [
        { from: 100, to: 200, reason: "crash" as const },
        { from: 300, to: null, reason: "stopped" as const },
    ];
    assert.deepEqual(newRecoveryKeys(gaps, new Set()), ["100|200", "300|open"]);
    assert.deepEqual(newRecoveryKeys(gaps, new Set(["100|200"])), ["300|open"]);
    assert.deepEqual(newRecoveryKeys([{ from: 300, to: 900, reason: "stopped" as const }], new Set(["300|open"])), ["300|900"]);
    assert.deepEqual(newRecoveryKeys([], new Set()), []);
});
```

- [ ] **Step 6: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/schedule.test.ts`
Expected: FAIL, `newRecoveryKeys` không được xuất.

- [ ] **Step 7: Thêm `newRecoveryKeys` vào `runner/schedule.ts`**

Thêm import ở đầu tệp: `import type { Gap } from "../history/watchState.js";` và ở cuối tệp:

```ts
/**
 * Keys of the gaps (already restricted to the current session) that no recovery has covered yet.
 * A gap that was open and later closes gets a new key, so it is recovered once more.
 */
export function newRecoveryKeys(gaps: Gap[], done: ReadonlySet<string>): string[] {
    return gaps.map((g) => `${g.from}|${g.to ?? "open"}`).filter((key) => !done.has(key));
}
```

- [ ] **Step 8: Chạy toàn bộ test và typecheck**

Run: `npm test` rồi `npm run typecheck`
Expected: tất cả đạt; typecheck không lỗi.

- [ ] **Step 9: Commit**

```bash
git add history/scrapeQueue.ts runner/schedule.ts tests/scrapeQueue.test.ts tests/schedule.test.ts
git commit -m "feat(runner): record when groups were queued; key gaps for one-time recovery" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Buổi bị ảnh hưởng (`runner/affectedSessions.ts`)

**Files:**
- Create: `runner/affectedSessions.ts`
- Test: `tests/affectedSessions.test.ts`

**Interfaces:**
- Consumes: `messageKey` (`lesson/recovery.ts`), `classifyTitle` (`lesson/parseReport.ts`), `sessionOf`, `vietnamDay`, `Buoi` (`lesson/time.ts`), `SourceMessage` (`lesson/types.ts`).
- Produces: `SessionKey`, `mergeSessions(...lists)`, `affectedSessions(before, after)`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/affectedSessions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { affectedSessions, mergeSessions } from "../runner/affectedSessions.js";
import { messageKey } from "../lesson/recovery.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg, SPECIALIST, YESTERDAY } from "./fixtures.js";

const none = new Set<string>();

test("a new start report makes its own session affected", () => {
    assert.deepEqual(affectedSessions(none, [msg(COMPLETE, at(9))]), [{ day: DAY, buoi: "sang" }]);
});

test("messages already in the store before the scrape do not count", () => {
    const old = msg(COMPLETE, at(9));
    assert.deepEqual(affectedSessions(new Set([messageKey(old)]), [old]), []);
});

test("chat that is not a start or end report never triggers a rebuild", () => {
    assert.deepEqual(affectedSessions(none, [msg("ok em nhé", at(9)), msg(SPECIALIST, at(9, 5))]), []);
});

test("sessions follow the report's own time, sorted, one entry per session", () => {
    const list = affectedSessions(none, [
        msg(IT_MAINTENANCE, at(19)),
        msg(COMPLETE, at(9)),
        msg(COMPLETE, at(9, 30)),
        msg(IT_MAINTENANCE, at(13)),
        msg(COMPLETE, YESTERDAY),
    ]);
    assert.deepEqual(list, [
        { day: "2026-09-23", buoi: "sang" },
        { day: DAY, buoi: "sang" },
        { day: DAY, buoi: "chieu" },
        { day: DAY, buoi: "toi" },
    ]);
});

test("session boundaries: 11:59 is sáng, 12:00 chiều, 23:59 tối, 00:00 sáng of the same day", () => {
    const of = (h: number, m: number) => affectedSessions(none, [msg(COMPLETE, at(h, m))])[0];
    assert.equal(of(11, 59).buoi, "sang");
    assert.equal(of(12, 0).buoi, "chieu");
    assert.equal(of(23, 59).buoi, "toi");
    assert.deepEqual(of(0, 0), { day: DAY, buoi: "sang" });
});

test("mergeSessions dedupes and orders by day then session", () => {
    const a = [{ day: DAY, buoi: "chieu" as const }];
    const b = [{ day: DAY, buoi: "sang" as const }, { day: DAY, buoi: "chieu" as const }, { day: "2026-09-23", buoi: "toi" as const }];
    assert.deepEqual(mergeSessions(a, b), [
        { day: "2026-09-23", buoi: "toi" },
        { day: DAY, buoi: "sang" },
        { day: DAY, buoi: "chieu" },
    ]);
    assert.deepEqual(mergeSessions(), []);
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/affectedSessions.test.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết cài đặt**

Tạo `runner/affectedSessions.ts`:

```ts
import { classifyTitle } from "../lesson/parseReport.js";
import { messageKey } from "../lesson/recovery.js";
import { sessionOf, vietnamDay, type Buoi } from "../lesson/time.js";
import type { SourceMessage } from "../lesson/types.js";

export interface SessionKey {
    day: string;
    buoi: Buoi;
}

const ORDER: Record<Buoi, number> = { sang: 0, chieu: 1, toi: 2 };

/** Union of session lists, one entry per (day, buoi), oldest first. */
export function mergeSessions(...lists: SessionKey[][]): SessionKey[] {
    const seen = new Map<string, SessionKey>();
    for (const list of lists) for (const s of list) seen.set(`${s.day}|${s.buoi}`, s);
    return [...seen.values()].sort((a, b) => (a.day === b.day ? ORDER[a.buoi] - ORDER[b.buoi] : a.day < b.day ? -1 : 1));
}

/**
 * Sessions whose Excel must be rebuilt because a start/end-of-lesson report appeared that
 * was not in `before` (a set of `messageKey`s). A message's session is the one of its own
 * timestamp, not of "now", so a morning report scraped in the afternoon still rebuilds the morning.
 */
export function affectedSessions(before: Set<string>, after: SourceMessage[]): SessionKey[] {
    const found: SessionKey[] = [];
    for (const m of after) {
        if (before.has(messageKey(m))) continue;
        const kind = classifyTitle(m.content);
        if (kind !== "DauBuoi" && kind !== "CuoiBuoi") continue;
        found.push({ day: vietnamDay(m.ts), buoi: sessionOf(m.ts) });
    }
    return mergeSessions(found);
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/affectedSessions.test.ts`
Expected: PASS, 6 test. Nếu `classifyTitle` của `SPECIALIST` hoặc `"ok em nhé"` trả `DauBuoi`/`CuoiBuoi` thì test sai giả định về parser; đọc `lesson/parseReport.ts` và sửa fixture, không sửa parser.

- [ ] **Step 5: Commit**

```bash
git add runner/affectedSessions.ts tests/affectedSessions.test.ts
git commit -m "feat(runner): work out which sessions a scrape affects" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Ghi đè Excel an toàn (`runner/safeReplace.ts`) và `--out` cho `fill:report`

**Files:**
- Create: `runner/safeReplace.ts`
- Modify: `fillRoomFacilityReport.ts`
- Test: `tests/safeReplace.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces: `ReplaceResult`, `safeReplace(target, produce, io?)`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/safeReplace.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeReplace, type FsLike } from "../runner/safeReplace.js";

const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), "replace-"));
const write = (file: string, text: string) => fs.writeFileSync(file, text, "utf8");
const read = (file: string) => fs.readFileSync(file, "utf8");

test("the produced file replaces the target and leaves no temp or _moi file", async () => {
    const dir = fresh();
    const target = path.join(dir, "baocaobuoisang_250926.xlsm");
    write(target, "old");
    write(path.join(dir, "baocaobuoisang_250926_moi.xlsm"), "leftover");
    const r = await safeReplace(target, (tmp) => write(tmp, "new"));
    assert.deepEqual(r, { status: "replaced", path: target });
    assert.equal(read(target), "new");
    assert.deepEqual(fs.readdirSync(dir), ["baocaobuoisang_250926.xlsm"]);
});

test("a locked target gets the result as _moi and keeps the old file intact", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    write(target, "old");
    const locked: FsLike = {
        existsSync: fs.existsSync,
        rmSync: fs.rmSync,
        renameSync: (from, to) => {
            if (to === target) throw Object.assign(new Error("resource busy"), { code: "EBUSY" });
            fs.renameSync(from, to);
        },
    };
    const r = await safeReplace(target, (tmp) => write(tmp, "new"), locked);
    assert.equal(r.status, "fallback");
    assert.equal(r.path, path.join(dir, "b_moi.xlsm"));
    assert.equal(read(target), "old");
    assert.equal(read(path.join(dir, "b_moi.xlsm")), "new");
    assert.deepEqual(fs.readdirSync(dir).sort(), ["b.xlsm", "b_moi.xlsm"]);
});

test("when producing fails the old file stays and no temp file is left", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    write(target, "old");
    await assert.rejects(
        safeReplace(target, (tmp) => {
            write(tmp, "half");
            throw new Error("Excel crashed");
        }),
        /Excel crashed/,
    );
    assert.equal(read(target), "old");
    assert.deepEqual(fs.readdirSync(dir), ["b.xlsm"]);
});

test("producing nothing (no rows to report) changes nothing", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    write(target, "old");
    assert.deepEqual(await safeReplace(target, () => undefined), { status: "nothing", path: null });
    assert.equal(read(target), "old");
});

test("an unrelated rename error is not swallowed and cleans up the temp file", async () => {
    const dir = fresh();
    const target = path.join(dir, "b.xlsm");
    const broken: FsLike = {
        existsSync: fs.existsSync,
        rmSync: fs.rmSync,
        renameSync: () => {
            throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
        },
    };
    await assert.rejects(safeReplace(target, (tmp) => write(tmp, "new"), broken), /disk full/);
    assert.deepEqual(fs.readdirSync(dir), []);
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/safeReplace.test.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết cài đặt**

Tạo `runner/safeReplace.ts`:

```ts
import fs from "node:fs";
import path from "node:path";

export type FsLike = Pick<typeof fs, "existsSync" | "renameSync" | "rmSync">;

export interface ReplaceResult {
    status: "replaced" | "fallback" | "nothing";
    /** Where the finished file is; null when `produce` made no file. */
    path: string | null;
}

/**
 * Builds `target` without ever leaving it half-written. `produce` writes the new file to a
 * temp path; on success that file is renamed over `target` (so exactly one file remains).
 * If `target` is open in Excel the rename is refused, and the result is kept as
 * `<name>_moi<ext>` instead, leaving the old file intact; the next successful replace removes it.
 */
export async function safeReplace(target: string, produce: (tmp: string) => void | Promise<void>, io: FsLike = fs): Promise<ReplaceResult> {
    const dir = path.dirname(target);
    const ext = path.extname(target);
    const base = path.basename(target, ext);
    const tmp = path.join(dir, `.${base}.tmp${ext}`);
    const fallback = path.join(dir, `${base}_moi${ext}`);

    io.rmSync(tmp, { force: true });
    try {
        await produce(tmp);
    } catch (err) {
        io.rmSync(tmp, { force: true });
        throw err;
    }
    if (!io.existsSync(tmp)) return { status: "nothing", path: null };

    try {
        io.renameSync(tmp, target);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES") {
            io.rmSync(tmp, { force: true });
            throw err;
        }
        io.rmSync(fallback, { force: true });
        io.renameSync(tmp, fallback);
        return { status: "fallback", path: fallback };
    }
    io.rmSync(fallback, { force: true });
    return { status: "replaced", path: target };
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/safeReplace.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Thêm `--out` vào `fillRoomFacilityReport.ts`**

Đây là đường ống chỉ chạy được khi có Excel nên không có test tự động; chỉ thay đổi tối thiểu và kiểm bằng typecheck. Sửa 2 chỗ:

Trong khối comment đầu tệp, đổi dòng usage thành:
`*   npm run fill:report -- output/output.json [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--template <path>] [--out <path>]`
và thêm dòng: `* \`--out\` overrides the output path (the runner uses it to write a temp file, then swaps it in).`

Thay dòng:
```ts
    const outFile = path.join(repoRoot, "data", "export", reportFileName(day, buoi));
```
bằng:
```ts
    const outArg = option("--out");
    const outFile = outArg ? path.resolve(outArg) : path.join(repoRoot, "data", "export", reportFileName(day, buoi));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
```

Dòng Usage trong thông báo lỗi giữ nguyên.

- [ ] **Step 6: Typecheck và toàn bộ test**

Run: `npm run typecheck` rồi `npm test`
Expected: không lỗi; tất cả test đạt.

- [ ] **Step 7: Commit**

```bash
git add runner/safeReplace.ts tests/safeReplace.test.ts fillRoomFacilityReport.ts
git commit -m "feat(runner): replace the Excel report via a temp file, with a _moi fallback" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Khóa chung cho mọi thứ điều khiển giao diện Zalo

**Files:**
- Modify: `history/watchState.ts` (xuất `pidAlive`)
- Create: `history/scrapeLock.ts`
- Modify: `index.ts`
- Test: `tests/scrapeLock.test.ts`

**Interfaces:**
- Consumes: `pidAlive(pid: number): boolean` (xuất từ `history/watchState.ts`).
- Produces: `DEFAULT_LOCK_PATH`, `LockHolder { pid: number; owner: string; at: number }`, `acquireScrapeLock(owner, pid?, file?, isAlive?, now?)`, `releaseScrapeLock(pid?, file?)`.

- [ ] **Step 1: Xuất `pidAlive`**

Trong `history/watchState.ts` đổi `function pidAlive(pid: number): boolean {` thành `export function pidAlive(pid: number): boolean {`. Không đổi gì khác.

- [ ] **Step 2: Viết test thất bại**

Tạo `tests/scrapeLock.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireScrapeLock, releaseScrapeLock } from "../history/scrapeLock.js";

const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lock-")), "data", ".scrape.lock");
const alive = () => true;
const dead = () => false;

test("a free lock is acquired and released", () => {
    const file = fresh();
    assert.deepEqual(acquireScrapeLock("bot:runner", 100, file, alive, 5), { ok: true });
    assert.equal(fs.existsSync(file), true);
    releaseScrapeLock(100, file);
    assert.equal(fs.existsSync(file), false);
});

test("a lock held by a live process refuses others and says who holds it", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    assert.deepEqual(acquireScrapeLock("bot:scrape", 200, file, alive, 6), { ok: false, heldBy: { pid: 100, owner: "bot:runner", at: 5 } });
});

test("a lock left by a dead process is taken over", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    assert.deepEqual(acquireScrapeLock("bot:scrape", 200, file, dead, 6), { ok: true });
    assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).pid, 200);
});

test("the holder can re-acquire its own lock", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    assert.deepEqual(acquireScrapeLock("bot:runner", 100, file, alive, 6), { ok: true });
});

test("only the holder can release; anyone else leaves it alone", () => {
    const file = fresh();
    acquireScrapeLock("bot:runner", 100, file, alive, 5);
    releaseScrapeLock(200, file);
    assert.equal(fs.existsSync(file), true);
    releaseScrapeLock(100, file);
    assert.equal(fs.existsSync(file), false);
});

test("a corrupt lock file is treated as stale", () => {
    const file = fresh();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.deepEqual(acquireScrapeLock("bot:scrape", 200, file, alive, 6), { ok: true });
});
```

- [ ] **Step 3: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/scrapeLock.test.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 4: Viết cài đặt**

Tạo `history/scrapeLock.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { pidAlive } from "./watchState.js";

/**
 * One lock for everything that drives Zalo Desktop's UI (`bot:scrape` and every `bot:runner`
 * cycle), so two of them never click and scroll at once. The file holds who took it; a lock
 * whose process is gone (crash) is stale and is taken over.
 */
export const DEFAULT_LOCK_PATH = path.join(config.dataDir, ".scrape.lock");

export interface LockHolder {
    pid: number;
    owner: string;
    at: number;
}

export type LockResult = { ok: true } | { ok: false; heldBy: LockHolder };

function readHolder(file: string): LockHolder | null {
    try {
        const v = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<LockHolder>;
        return typeof v.pid === "number" && typeof v.owner === "string" && typeof v.at === "number" ? { pid: v.pid, owner: v.owner, at: v.at } : null;
    } catch {
        return null;
    }
}

export function acquireScrapeLock(
    owner: string,
    pid: number = process.pid,
    file: string = DEFAULT_LOCK_PATH,
    isAlive: (pid: number) => boolean = pidAlive,
    now: number = Date.now(),
): LockResult {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = JSON.stringify({ pid, owner, at: now });
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fs.writeFileSync(file, body, { flag: "wx" });
            return { ok: true };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        }
        const holder = readHolder(file);
        if (holder && holder.pid !== pid && isAlive(holder.pid)) return { ok: false, heldBy: holder };
        fs.rmSync(file, { force: true }); // stale (dead holder, corrupt file) or our own: replace it
    }
    const holder = readHolder(file);
    return holder ? { ok: false, heldBy: holder } : { ok: false, heldBy: { pid: 0, owner: "unknown", at: now } };
}

/** Removes the lock only if `pid` is the one holding it. */
export function releaseScrapeLock(pid: number = process.pid, file: string = DEFAULT_LOCK_PATH): void {
    const holder = readHolder(file);
    if (holder && holder.pid === pid) fs.rmSync(file, { force: true });
}
```

- [ ] **Step 5: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/scrapeLock.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 6: `bot:scrape` giữ khóa**

Sửa `index.ts`: thêm `import { acquireScrapeLock, releaseScrapeLock } from "./history/scrapeLock.js";` và thay thân `main` bằng:

```ts
async function main(): Promise<void> {
    const lock = acquireScrapeLock("bot:scrape");
    if (!lock.ok) {
        console.error(`[scrape] đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) điều khiển Zalo Desktop — không chạy song song. Thử lại sau khi nó xong.`);
        process.exit(1);
    }
    try {
        const store = new MessageStore();
        const result = await runQueuedScrape({
            readQueue: () => readQueue(),
            removeFromQueue: (handled) => removeFromQueue(handled),
            scrape: (targets) => runScrape(store, targets),
            log: (message) => console.log(message),
        });
        if (result.status === "done" && result.failed.length > 0) process.exitCode = 1;
    } finally {
        releaseScrapeLock();
    }
}
```

Cập nhật dòng comment đầu `index.ts` "it is the only process that ever drives Zalo Desktop's UI" thành "it and `bot:runner` are the only processes that drive Zalo Desktop's UI, and they exclude each other with history/scrapeLock.ts".

- [ ] **Step 7: Typecheck và toàn bộ test**

Run: `npm run typecheck` rồi `npm test`
Expected: không lỗi; đạt.

- [ ] **Step 8: Commit**

```bash
git add history/watchState.ts history/scrapeLock.ts index.ts tests/scrapeLock.test.ts
git commit -m "feat(runner): shared lock so only one process drives Zalo Desktop's UI" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Trạng thái runner (`runner/runnerState.ts`)

**Files:**
- Create: `runner/runnerState.ts`
- Test: `tests/runnerState.test.ts`

**Interfaces:**
- Consumes: `pidAlive`, `STALE_AFTER_MS` (`history/watchState.ts`), `SessionKey` (Task 3), `config.dataDir`.
- Produces: `MAX_CONSECUTIVE_FAILURES`, `CycleSummary`, `RunnerPhase`, `RunnerState`, `RunnerFiles`, `DEFAULT_RUNNER_FILES`, `readRunnerState`, `startRunner`, `setPhase`, `beatRunner`, `recordCycle`, `appendLog`, `stopRunner`, `readPending`, `writePending`, `runnerHealth`, `Health`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/runnerState.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STALE_AFTER_MS } from "../history/watchState.js";
import {
    appendLog,
    beatRunner,
    MAX_CONSECUTIVE_FAILURES,
    readPending,
    readRunnerState,
    recordCycle,
    runnerHealth,
    setPhase,
    startRunner,
    stopRunner,
    writePending,
    type CycleSummary,
    type RunnerFiles,
} from "../runner/runnerState.js";

function files(): RunnerFiles {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-"));
    return { state: path.join(dir, "data", ".runner-state.json"), log: path.join(dir, "output", "runner-log.jsonl"), pending: path.join(dir, "data", ".runner-pending.json") };
}
const cycle = (ok: boolean, at = 1): CycleSummary => ({ kind: "cycle", at, ok, groups: ["A"], sessions: [], reviewCount: 0, excel: [], warnings: [], errors: ok ? [] : ["boom"] });
const alive = () => true;
const dead = () => false;

test("starting writes an idle state with no failures", () => {
    const f = files();
    assert.deepEqual(startRunner(1000, 42, f, alive), { anotherInstanceAlive: false, crashed: false });
    const s = readRunnerState(f.state)!;
    assert.equal(s.pid, 42);
    assert.equal(s.state, "idle");
    assert.equal(s.consecutiveFailures, 0);
    assert.equal(s.startedAt, 1000);
});

test("a second runner is refused while the first is alive and beating", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    assert.equal(startRunner(2000, 43, f, alive).anotherInstanceAlive, true);
    assert.equal(readRunnerState(f.state)!.pid, 42);
});

test("a runner whose beat went stale or whose process is gone is replaced, and the crash is noted", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    assert.deepEqual(startRunner(1000 + STALE_AFTER_MS + 1, 43, f, alive), { anotherInstanceAlive: false, crashed: true });
    startRunner(5000, 44, f, dead);
    assert.equal(readRunnerState(f.state)!.pid, 44);
});

test("a cleanly stopped runner is not reported as crashed on the next start", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    stopRunner(2000, f);
    assert.equal(readRunnerState(f.state)!.state, "stopped");
    assert.deepEqual(startRunner(3000, 43, f, alive), { anotherInstanceAlive: false, crashed: false });
});

test("setPhase and beatRunner update the phase and the last beat", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    setPhase(2000, "waiting", f);
    assert.deepEqual([readRunnerState(f.state)!.state, readRunnerState(f.state)!.lastBeat], ["waiting", 2000]);
    beatRunner(3000, f);
    assert.deepEqual([readRunnerState(f.state)!.state, readRunnerState(f.state)!.lastBeat], ["waiting", 3000]);
});

test("recording cycles counts failures in a row, goes to error at the limit, and resets on success", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    for (let i = 1; i < MAX_CONSECUTIVE_FAILURES; i++) {
        const s = recordCycle(2000 + i, cycle(false), f);
        assert.equal(s.consecutiveFailures, i);
        assert.equal(s.state, "idle");
    }
    assert.equal(recordCycle(3000, cycle(false), f).state, "error");
    const ok = recordCycle(4000, cycle(true, 4000), f);
    assert.deepEqual([ok.consecutiveFailures, ok.state, ok.lastCycle?.at], [0, "idle", 4000]);
});

test("every cycle is appended to the log as one JSON line, and appendLog can add a rebuild entry", () => {
    const f = files();
    startRunner(1000, 42, f, alive);
    recordCycle(2000, cycle(true, 2000), f);
    appendLog({ ...cycle(true, 3000), kind: "rebuild" }, f);
    const lines = fs.readFileSync(f.log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.kind, l.at]), [["cycle", 2000], ["rebuild", 3000]]);
});

test("pending sessions round-trip and a corrupt file reads as empty", () => {
    const f = files();
    assert.deepEqual(readPending(f), []);
    writePending([{ day: "2026-09-24", buoi: "sang" }], f);
    assert.deepEqual(readPending(f), [{ day: "2026-09-24", buoi: "sang" }]);
    fs.writeFileSync(f.pending, '[{"day":1},"x",{"day":"2026-09-24","buoi":"chieu"}]', "utf8");
    assert.deepEqual(readPending(f), [{ day: "2026-09-24", buoi: "chieu" }]);
    fs.writeFileSync(f.pending, "{ nope", "utf8");
    assert.deepEqual(readPending(f), []);
});

test("runnerHealth tells none, stopped, dead, error and alive apart", () => {
    const f = files();
    assert.equal(runnerHealth(null, 1000), "none");
    startRunner(1000, 42, f, alive);
    assert.equal(runnerHealth(readRunnerState(f.state), 1000 + 10_000), "alive");
    assert.equal(runnerHealth(readRunnerState(f.state), 1000 + STALE_AFTER_MS + 1), "dead");
    for (let i = 0; i < MAX_CONSECUTIVE_FAILURES; i++) recordCycle(2000, cycle(false), f);
    assert.equal(runnerHealth(readRunnerState(f.state), 2000), "error");
    stopRunner(3000, f);
    assert.equal(runnerHealth(readRunnerState(f.state), 3000), "stopped");
});

test("a corrupt state file reads as no state", () => {
    const f = files();
    fs.mkdirSync(path.dirname(f.state), { recursive: true });
    fs.writeFileSync(f.state, '{"pid":"x"}', "utf8");
    assert.equal(readRunnerState(f.state), null);
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/runnerState.test.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết cài đặt**

Tạo `runner/runnerState.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { pidAlive, STALE_AFTER_MS } from "../history/watchState.js";
import type { SessionKey } from "./affectedSessions.js";

/**
 * What `bot:runner` leaves on disk, so that an agent (or a person) can tell whether it is alive,
 * what its last cycle did, and which sessions still owe a rebuild:
 *  - `data/.runner-state.json`   heartbeat, phase, consecutive failures, last cycle
 *  - `output/runner-log.jsonl`   one JSON line per cycle (and per `runner:once` rebuild)
 *  - `data/.runner-pending.json` sessions whose Excel must still be rebuilt (survives a crash)
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** After this many failed cycles in a row the runner stops trying until it is restarted. */
export const MAX_CONSECUTIVE_FAILURES = 3;

export interface CycleSummary {
    kind: "cycle" | "rebuild";
    at: number;
    ok: boolean;
    /** Groups scraped from the queue. */
    groups: string[];
    /** Sessions rebuilt (or attempted). */
    sessions: SessionKey[];
    reviewCount: number;
    /** Excel files written (a `_moi` path means the real one was open). */
    excel: string[];
    warnings: string[];
    errors: string[];
}

export type RunnerPhase = "idle" | "waiting" | "running" | "error" | "stopped";

export interface RunnerState {
    pid: number;
    startedAt: number;
    lastBeat: number;
    state: RunnerPhase;
    consecutiveFailures: number;
    lastCycle?: CycleSummary;
}

export interface RunnerFiles {
    state: string;
    log: string;
    pending: string;
}

export const DEFAULT_RUNNER_FILES: RunnerFiles = {
    state: path.join(config.dataDir, ".runner-state.json"),
    log: path.join(repoRoot, "output", "runner-log.jsonl"),
    pending: path.join(config.dataDir, ".runner-pending.json"),
};

function writeAtomic(file: string, value: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(tmp, file);
}

const PHASES: RunnerPhase[] = ["idle", "waiting", "running", "error", "stopped"];

/** Missing, unreadable or wrongly shaped state reads as null. */
export function readRunnerState(file: string = DEFAULT_RUNNER_FILES.state): RunnerState | null {
    try {
        const v = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<RunnerState>;
        const ok = typeof v.pid === "number" && typeof v.startedAt === "number" && typeof v.lastBeat === "number" && typeof v.consecutiveFailures === "number" && PHASES.includes(v.state as RunnerPhase);
        return ok ? (v as RunnerState) : null;
    } catch {
        return null;
    }
}

/** Refuses (changing nothing) when another runner is demonstrably alive; otherwise writes a fresh idle state. */
export function startRunner(
    now: number,
    pid: number,
    files: RunnerFiles = DEFAULT_RUNNER_FILES,
    isAlive: (pid: number) => boolean = pidAlive,
): { anotherInstanceAlive: boolean; crashed: boolean } {
    const prev = readRunnerState(files.state);
    if (prev && prev.state !== "stopped" && prev.pid !== pid && now - prev.lastBeat < STALE_AFTER_MS && isAlive(prev.pid)) {
        return { anotherInstanceAlive: true, crashed: false };
    }
    const state: RunnerState = { pid, startedAt: now, lastBeat: now, state: "idle", consecutiveFailures: 0, lastCycle: prev?.lastCycle };
    writeAtomic(files.state, state);
    return { anotherInstanceAlive: false, crashed: !!prev && prev.state !== "stopped" };
}

export function setPhase(now: number, phase: RunnerPhase, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    const s = readRunnerState(files.state);
    if (!s) return;
    s.state = phase;
    s.lastBeat = now;
    writeAtomic(files.state, s);
}

/** Heartbeat only: keeps the current phase. */
export function beatRunner(now: number, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    const s = readRunnerState(files.state);
    if (!s) return;
    s.lastBeat = now;
    writeAtomic(files.state, s);
}

export function appendLog(entry: CycleSummary, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    fs.mkdirSync(path.dirname(files.log), { recursive: true });
    fs.appendFileSync(files.log, `${JSON.stringify(entry)}\n`, "utf8");
}

/** Logs the cycle, updates the failure count and the phase (`error` at the limit), and returns the new state. */
export function recordCycle(now: number, summary: CycleSummary, files: RunnerFiles = DEFAULT_RUNNER_FILES): RunnerState {
    appendLog(summary, files);
    const s = readRunnerState(files.state) ?? { pid: process.pid, startedAt: now, lastBeat: now, state: "idle" as RunnerPhase, consecutiveFailures: 0 };
    s.consecutiveFailures = summary.ok ? 0 : s.consecutiveFailures + 1;
    s.state = s.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES ? "error" : "idle";
    s.lastBeat = now;
    s.lastCycle = summary;
    writeAtomic(files.state, s);
    return s;
}

export function stopRunner(now: number, files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    const s = readRunnerState(files.state);
    if (!s) return;
    s.state = "stopped";
    s.lastBeat = now;
    writeAtomic(files.state, s);
}

/** Entries that are not `{ day: string, buoi: "sang"|"chieu"|"toi" }` are dropped; a bad file reads as empty. */
export function readPending(files: RunnerFiles = DEFAULT_RUNNER_FILES): SessionKey[] {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(files.pending, "utf8"));
        if (!Array.isArray(v)) return [];
        return v.filter((s): s is SessionKey => !!s && typeof s.day === "string" && (s.buoi === "sang" || s.buoi === "chieu" || s.buoi === "toi"));
    } catch {
        return [];
    }
}

export function writePending(list: SessionKey[], files: RunnerFiles = DEFAULT_RUNNER_FILES): void {
    writeAtomic(files.pending, list);
}

export type Health = "none" | "stopped" | "dead" | "error" | "alive";

export function runnerHealth(state: RunnerState | null, now: number): Health {
    if (!state) return "none";
    if (state.state === "stopped") return "stopped";
    if (now - state.lastBeat > STALE_AFTER_MS) return "dead";
    if (state.state === "error") return "error";
    return "alive";
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/runnerState.test.ts`
Expected: PASS, 10 test.

- [ ] **Step 5: Typecheck và toàn bộ test**

Run: `npm run typecheck` rồi `npm test`
Expected: không lỗi; đạt.

- [ ] **Step 6: Commit**

```bash
git add runner/runnerState.ts tests/runnerState.test.ts
git commit -m "feat(runner): heartbeat, failure counter, cycle log and pending sessions" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Một vòng chạy (`runner/cycle.ts`)

**Files:**
- Create: `runner/cycle.ts`
- Test: `tests/cycle.test.ts`

**Interfaces:**
- Consumes: `QueueRunResult` (`history/queueRun.ts`), `messageKey` (`lesson/recovery.ts`), `affectedSessions`, `mergeSessions`, `SessionKey` (Task 3), `CycleSummary` (Task 6).
- Produces: `BuildResult`, `CycleDeps`, `runCycle(deps)`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/cycle.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { QueueRunResult } from "../history/queueRun.js";
import type { SourceMessage } from "../lesson/types.js";
import type { SessionKey } from "../runner/affectedSessions.js";
import { runCycle, type BuildResult, type CycleDeps } from "../runner/cycle.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg } from "./fixtures.js";

const SANG: SessionKey = { day: DAY, buoi: "sang" };
const CHIEU: SessionKey = { day: DAY, buoi: "chieu" };

function harness(opts: {
    messages?: SourceMessage[];
    scraped?: SourceMessage[];
    scrape?: () => Promise<QueueRunResult>;
    build?: (s: SessionKey) => Promise<BuildResult>;
    pending?: SessionKey[];
} = {}) {
    const messages = [...(opts.messages ?? [])];
    let pending = [...(opts.pending ?? [])];
    const calls: string[] = [];
    const deps: CycleDeps = {
        now: () => 5000,
        loadMessages: async () => [...messages],
        recover: async () => {
            calls.push("recover");
            return { errors: [] };
        },
        scrapeQueued:
            opts.scrape ??
            (async () => {
                calls.push("scrape");
                messages.push(...(opts.scraped ?? []));
                return { status: "done", targets: ["A"], failed: [] };
            }),
        syncDb: async () => {
            calls.push("sync");
        },
        build:
            opts.build ??
            (async (s) => {
                calls.push(`build:${s.day} ${s.buoi}`);
                return { reviewCount: 1, excel: `x_${s.buoi}.xlsm`, warnings: [] };
            }),
        pending: { read: () => [...pending], write: (l) => void (pending = [...l]) },
    };
    return { deps, calls, get pending() { return pending; } };
}

test("a cycle recovers, scrapes, syncs, then builds each affected session, in that order", async () => {
    const h = harness({ scraped: [msg(COMPLETE, at(9)), msg(IT_MAINTENANCE, at(13))] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync", "build:2026-09-24 sang", "build:2026-09-24 chieu"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sessions, [SANG, CHIEU]);
    assert.deepEqual(s.groups, ["A"]);
    assert.deepEqual(s.excel, ["x_sang.xlsm", "x_chieu.xlsm"]);
    assert.equal(s.reviewCount, 2);
    assert.deepEqual(h.pending, []);
});

test("when the scrape cannot run nothing is synced or built and the cycle is a failure", async () => {
    const h = harness({
        scrape: async () => {
            throw new Error("CDP not reachable");
        },
        scraped: [msg(COMPLETE, at(9))],
    });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover"]);
    assert.equal(s.ok, false);
    assert.match(s.errors[0], /CDP not reachable/);
});

test("a group that failed to scrape is a warning, not a failure; the rest is still built", async () => {
    const h = harness({ scrape: async () => ({ status: "done", targets: ["A", "B"], failed: ["B"] }) });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.deepEqual(s.groups, ["A", "B"]);
    assert.match(s.warnings.join("\n"), /không cào được "B"/);
});

test("with no new report the database is still synced (an earlier crash may have left rows unsynced) but nothing is built", async () => {
    const h = harness();
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sessions, []);
});

test("a session left pending by a crashed cycle is rebuilt even though no new message arrived", async () => {
    const h = harness({ pending: [SANG] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["recover", "scrape", "sync", "build:2026-09-24 sang"]);
    assert.deepEqual(s.sessions, [SANG]);
    assert.deepEqual(h.pending, []);
});

test("the sessions to build are saved as pending before the database sync, so a crash there loses nothing", async () => {
    const h = harness({ scraped: [msg(COMPLETE, at(9))] });
    let pendingAtSync: SessionKey[] = [];
    const sync = h.deps.syncDb;
    h.deps.syncDb = async () => {
        pendingAtSync = h.deps.pending.read();
        await sync();
    };
    await runCycle(h.deps);
    assert.deepEqual(pendingAtSync, [SANG]);
});

test("a session whose build fails stays pending and fails the cycle, while the other sessions still build", async () => {
    const h = harness({
        scraped: [msg(COMPLETE, at(9)), msg(IT_MAINTENANCE, at(13))],
        build: async (s) => {
            if (s.buoi === "sang") throw new Error("Excel COM failed");
            return { reviewCount: 0, excel: "x_chieu.xlsm", warnings: [] };
        },
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, false);
    assert.match(s.errors[0], /2026-09-24 sang: Excel COM failed/);
    assert.deepEqual(s.excel, ["x_chieu.xlsm"]);
    assert.deepEqual(h.pending, [SANG]);
});

test("build warnings (for example an Excel saved as _moi) reach the summary", async () => {
    const h = harness({
        scraped: [msg(COMPLETE, at(9))],
        build: async () => ({ reviewCount: 0, excel: "b_moi.xlsm", warnings: ["file đang mở, đã lưu thành b_moi.xlsm"] }),
    });
    const s = await runCycle(h.deps);
    assert.deepEqual(s.warnings, ["file đang mở, đã lưu thành b_moi.xlsm"]);
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/cycle.test.ts`
Expected: FAIL, không tìm thấy module `../runner/cycle.js`.

- [ ] **Step 3: Viết cài đặt**

Tạo `runner/cycle.ts`:

```ts
import type { QueueRunResult } from "../history/queueRun.js";
import { messageKey } from "../lesson/recovery.js";
import type { SourceMessage } from "../lesson/types.js";
import { affectedSessions, mergeSessions, type SessionKey } from "./affectedSessions.js";
import type { CycleSummary } from "./runnerState.js";

export interface BuildResult {
    reviewCount: number;
    /** Path of the Excel written; null when the session had no report with a known room. */
    excel: string | null;
    warnings: string[];
}

export interface CycleDeps {
    now(): number;
    loadMessages(): Promise<SourceMessage[]>;
    /** Re-scrapes groups missing reports if `bot:watch` had a gap in the current session; never throws for a single group. */
    recover(): Promise<{ errors: string[] }>;
    /** Snapshot the queue, scrape exactly those groups, remove exactly those (history/queueRun.ts). Throws if Zalo Desktop is unreachable. */
    scrapeQueued(): Promise<QueueRunResult>;
    syncDb(): Promise<void>;
    /** Extract one session, write its Excel, mark its messages. */
    build(session: SessionKey): Promise<BuildResult>;
    /** Sessions still owing a rebuild; kept on disk so a crash cannot lose them. */
    pending: { read(): SessionKey[]; write(list: SessionKey[]): void };
}

/**
 * One runner cycle. A failure before the sessions are known (scrape cannot run) fails the cycle
 * and leaves the queue as it was. Once known, the sessions are saved as pending before anything
 * else, and each one is removed only after its build succeeded, so a crash or a failed build
 * is retried by the next cycle even if no new message arrives. Sync runs every cycle because it
 * is idempotent and an earlier crash may have left scraped rows out of the database.
 */
export async function runCycle(deps: CycleDeps): Promise<CycleSummary> {
    const summary: CycleSummary = { kind: "cycle", at: deps.now(), ok: true, groups: [], sessions: [], reviewCount: 0, excel: [], warnings: [], errors: [] };
    try {
        const before = new Set((await deps.loadMessages()).map(messageKey));

        const recovery = await deps.recover();
        for (const e of recovery.errors) summary.warnings.push(`khôi phục: ${e}`);

        const scrape = await deps.scrapeQueued();
        if (scrape.status === "done") {
            summary.groups = scrape.targets;
            for (const t of scrape.failed) summary.warnings.push(`không cào được "${t}"`);
        }

        const after = await deps.loadMessages();
        let remaining = mergeSessions(deps.pending.read(), affectedSessions(before, after));
        deps.pending.write(remaining);
        summary.sessions = remaining;

        await deps.syncDb();

        for (const session of remaining) {
            try {
                const built = await deps.build(session);
                summary.reviewCount += built.reviewCount;
                if (built.excel) summary.excel.push(built.excel);
                summary.warnings.push(...built.warnings);
                remaining = remaining.filter((s) => s.day !== session.day || s.buoi !== session.buoi);
                deps.pending.write(remaining);
            } catch (err) {
                summary.ok = false;
                summary.errors.push(`${session.day} ${session.buoi}: ${(err as Error).message}`);
            }
        }
    } catch (err) {
        summary.ok = false;
        summary.errors.push((err as Error).message);
    }
    return summary;
}
```

Lưu ý: vòng `for (const session of remaining)` lặp trên mảng gốc tại thời điểm bắt đầu vì `remaining` bị gán lại (không sửa tại chỗ), nên an toàn.

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/cycle.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Typecheck và toàn bộ test**

Run: `npm run typecheck` rồi `npm test`
Expected: không lỗi; đạt.

- [ ] **Step 6: Commit**

```bash
git add runner/cycle.ts tests/cycle.test.ts
git commit -m "feat(runner): one cycle - recover, scrape, sync, rebuild affected sessions" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Báo cáo trạng thái, phụ thuộc thật và ba lệnh CLI

**Files:**
- Create: `runner/runnerStatusReport.ts`, `runner/steps.ts`, `bot-runner.ts`, `runnerOnce.ts`, `runnerStatus.ts`
- Modify: `package.json` (thêm ba script)
- Test: `tests/runnerStatusReport.test.ts`

**Interfaces:**
- Consumes: mọi thứ ở Task 1–7; `runQueuedScrape`, `runScrape`, `runRecovery`, `effectiveGaps`, `gapsInWindow`, `sessionWindow`, `currentSession`, `reportFileName`, `MessageStore`, `config`, `hhmm` (xuất từ `history/watchStatusReport.ts`).
- Produces: `formatRunnerStatus(input)`; `realDeps()` và `buildSession(session)` trong `runner/steps.ts`.

- [ ] **Step 1: Viết test thất bại cho báo cáo trạng thái**

Tạo `tests/runnerStatusReport.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { STALE_AFTER_MS } from "../history/watchState.js";
import { formatRunnerStatus } from "../runner/runnerStatusReport.js";
import type { CycleSummary, RunnerState } from "../runner/runnerState.js";
import { at, DAY } from "./fixtures.js";

const NOW = at(10, 0);
const state = (over: Partial<RunnerState> = {}): RunnerState => ({ pid: 777, startedAt: at(7, 0), lastBeat: NOW - 5_000, state: "idle", consecutiveFailures: 0, ...over });
const cycle = (over: Partial<CycleSummary> = {}): CycleSummary => ({ kind: "cycle", at: at(9, 40), ok: true, groups: ["LC_HoaSen1_TĐ"], sessions: [{ day: DAY, buoi: "sang" }], reviewCount: 2, excel: ["data/export/baocaobuoisang_240926.xlsm"], warnings: [], errors: [], ...over });
const text = (input: Partial<Parameters<typeof formatRunnerStatus>[0]> = {}) =>
    formatRunnerStatus({ state: state(), queue: [], firstQueuedAt: null, pending: [], now: NOW, ...input }).join("\n");

test("no state says the runner never ran", () => {
    assert.match(text({ state: null }), /chưa có dữ liệu.*bot:runner chưa từng chạy/);
});

test("a healthy runner shows pid, phase and the age of its last beat", () => {
    const t = text();
    assert.match(t, /ĐANG CHẠY \(pid 777\) từ 07:00/);
    assert.match(t, /trạng thái: idle/);
    assert.match(t, /nhịp tim cuối: 5 giây trước/);
});

test("a stale heartbeat is reported as probably dead", () => {
    assert.match(text({ state: state({ lastBeat: NOW - STALE_AFTER_MS - 60_000 }) }), /CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc 09:57/);
});

test("the error phase says it stopped trying and needs a restart", () => {
    const t = text({ state: state({ state: "error", consecutiveFailures: 3 }) });
    assert.match(t, /LỖI: 3 vòng liên tiếp thất bại/);
    assert.match(t, /khởi động lại/);
});

test("a stopped runner is reported with its time", () => {
    assert.match(text({ state: state({ state: "stopped", lastBeat: at(9, 0) }) }), /ĐÃ DỪNG lúc 09:00/);
});

test("the queue is described, with when its earliest group arrived", () => {
    assert.match(text(), /hàng chờ: rỗng/);
    assert.match(text({ queue: ["A", "B"], firstQueuedAt: at(9, 55) }), /hàng chờ: 2 nhóm \(A, B\), nhóm đầu tiên vào lúc 09:55/);
});

test("the last cycle shows groups, sessions, review count and the Excel written", () => {
    const t = text({ state: state({ lastCycle: cycle() }) });
    assert.match(t, /vòng gần nhất lúc 09:40: OK/);
    assert.match(t, /nhóm: LC_HoaSen1_TĐ/);
    assert.match(t, /buổi: sang 2026-09-24/);
    assert.match(t, /cần xem: 2/);
    assert.match(t, /baocaobuoisang_240926\.xlsm/);
});

test("a failed cycle lists its errors and warnings", () => {
    const t = text({ state: state({ lastCycle: cycle({ ok: false, errors: ["2026-09-24 sang: Excel COM failed"], warnings: ['không cào được "B"'] }) }) });
    assert.match(t, /vòng gần nhất lúc 09:40: LỖI/);
    assert.match(t, /lỗi: 2026-09-24 sang: Excel COM failed/);
    assert.match(t, /cảnh báo: không cào được "B"/);
});

test("sessions still owing a rebuild are listed", () => {
    assert.match(text({ pending: [{ day: DAY, buoi: "chieu" }] }), /buổi chưa dựng xong: chieu 2026-09-24/);
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/runnerStatusReport.test.ts`
Expected: FAIL, không tìm thấy module.

- [ ] **Step 3: Viết `runner/runnerStatusReport.ts`**

```ts
import { hhmm } from "../history/watchStatusReport.js";
import type { SessionKey } from "./affectedSessions.js";
import { runnerHealth, type RunnerState } from "./runnerState.js";

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

function hhmmDdMm(ts: number): string {
    const d = new Date(ts + VN_OFFSET_MS);
    return `${hhmm(ts)} ${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`;
}

function ago(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} giây`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

const label = (s: SessionKey) => `${s.buoi} ${s.day}`;

export interface RunnerStatusInput {
    state: RunnerState | null;
    queue: string[];
    /** When the earliest queued group was queued; null when the queue is empty. */
    firstQueuedAt: number | null;
    /** Sessions still owing an Excel rebuild. */
    pending: SessionKey[];
    now: number;
}

/** Human-readable lines for `runner:status` (Vietnam time). */
export function formatRunnerStatus(input: RunnerStatusInput): string[] {
    const { state, queue, firstQueuedAt, pending, now } = input;
    const lines: string[] = [];
    const health = runnerHealth(state, now);

    if (!state) {
        lines.push("[runner] chưa có dữ liệu — bot:runner chưa từng chạy.");
    } else if (health === "stopped") {
        lines.push(`[runner] ĐÃ DỪNG lúc ${hhmm(state.lastBeat)}`);
    } else if (health === "dead") {
        lines.push(`[runner] CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc ${hhmm(state.lastBeat)} (${ago(now - state.lastBeat)} trước), tiến trình pid ${state.pid} không còn báo.`);
    } else if (health === "error") {
        lines.push(`[runner] LỖI: ${state.consecutiveFailures} vòng liên tiếp thất bại (pid ${state.pid}). Runner đã ngừng tự thử — xem lỗi bên dưới rồi khởi động lại \`npm run bot:runner\`.`);
    } else {
        lines.push(`[runner] ĐANG CHẠY (pid ${state.pid}) từ ${hhmmDdMm(state.startedAt)}`);
        lines.push(`  trạng thái: ${state.state}`);
        lines.push(`  nhịp tim cuối: ${ago(now - state.lastBeat)} trước`);
    }

    lines.push(queue.length === 0 ? "  hàng chờ: rỗng" : `  hàng chờ: ${queue.length} nhóm (${queue.join(", ")})${firstQueuedAt === null ? "" : `, nhóm đầu tiên vào lúc ${hhmm(firstQueuedAt)}`}`);

    const c = state?.lastCycle;
    if (c) {
        lines.push(`  vòng gần nhất lúc ${hhmm(c.at)}: ${c.ok ? "OK" : "LỖI"}`);
        lines.push(`    nhóm: ${c.groups.length > 0 ? c.groups.join(", ") : "(không có)"}`);
        lines.push(`    buổi: ${c.sessions.length > 0 ? c.sessions.map(label).join(", ") : "(không dựng)"}, cần xem: ${c.reviewCount}`);
        for (const f of c.excel) lines.push(`    Excel: ${f}`);
        if (c.errors.length > 0) lines.push(`    lỗi: ${c.errors.join("; ")}`);
        if (c.warnings.length > 0) lines.push(`    cảnh báo: ${c.warnings.join("; ")}`);
    }
    if (pending.length > 0) lines.push(`  buổi chưa dựng xong: ${pending.map(label).join(", ")}`);
    return lines;
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/runnerStatusReport.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Viết `runner/steps.ts` (phụ thuộc thật, không có test tự động)**

Tệp này nối tiến trình con, Excel và Zalo nên không test được tự động; kiểm bằng typecheck ở bước 9 và chạy thật ở Task 9.

```ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { runScrape } from "../history/desktopScraper.js";
import { runQueuedScrape } from "../history/queueRun.js";
import { readQueue, removeFromQueue } from "../history/scrapeQueue.js";
import { effectiveGaps } from "../history/watchState.js";
import { runRecovery } from "../lesson/recoveryRun.js";
import { currentSession, reportFileName, todayVietnam } from "../lesson/time.js";
import type { SourceMessage } from "../lesson/types.js";
import { MessageStore } from "../store/messageStore.js";
import type { SessionKey } from "./affectedSessions.js";
import type { BuildResult, CycleDeps } from "./cycle.js";
import { readPending, writePending } from "./runnerState.js";
import { safeReplace } from "./safeReplace.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "output");

/** Runs one of this repo's CLI scripts (`tsx` loader) and resolves with its exit code and combined output. */
function runScript(script: string, args: string[]): Promise<{ code: number; output: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", path.join(repoRoot, script), ...args], { cwd: repoRoot });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code: code ?? 1, output }));
    });
}

const tail = (text: string) => text.trim().split(/\r?\n/).slice(-6).join(" | ");

async function mustRun(script: string, args: string[]): Promise<string> {
    const r = await runScript(script, args);
    if (r.code !== 0) throw new Error(`${script} thoát mã ${r.code}: ${tail(r.output)}`);
    return r.output;
}

export async function loadMessages(store: MessageStore = new MessageStore()): Promise<SourceMessage[]> {
    const all: SourceMessage[] = [];
    for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
    return all;
}

/** Extract one session, write its Excel (via a temp file), mark its messages. The existing CLIs are reused as they are. */
export async function buildSession(session: SessionKey): Promise<BuildResult> {
    const warnings: string[] = [];
    await mustRun("extractLessonReports.ts", ["--day", session.day, "--buoi", session.buoi]);
    const review = JSON.parse(fs.readFileSync(path.join(outDir, "review.json"), "utf8")) as unknown[];

    const target = path.join(repoRoot, "data", "export", reportFileName(session.day, session.buoi));
    const result = await safeReplace(target, async (tmp) => {
        await mustRun("fillRoomFacilityReport.ts", [path.join(outDir, "output.json"), "--day", session.day, "--buoi", session.buoi, "--out", tmp]);
    });
    if (result.status === "fallback") warnings.push(`file ${path.basename(target)} đang mở, đã lưu thành ${path.basename(result.path!)}`);

    await mustRun("markMessages.ts", [path.join(outDir, "marks.json")]);
    return { reviewCount: review.length, excel: result.path, warnings };
}

export function realDeps(): CycleDeps {
    const store = new MessageStore();
    return {
        now: () => Date.now(),
        loadMessages: () => loadMessages(store),
        recover: async () => {
            const result = await runRecovery(
                { day: todayVietnam(), buoi: currentSession() },
                {
                    now: () => Date.now(),
                    targets: config.targets,
                    ignoreTargets: config.recoveryIgnoreTargets,
                    loadMessages: () => loadMessages(store),
                    gaps: (now) => effectiveGaps(now),
                    scrape: (targets, sinceTs) => runScrape(store, targets, { sinceTs }),
                },
            );
            return { errors: result.errors.map((e) => `${e.target}: ${e.error}`) };
        },
        scrapeQueued: () =>
            runQueuedScrape({
                readQueue: () => readQueue(),
                removeFromQueue: (handled) => removeFromQueue(handled),
                scrape: (targets) => runScrape(store, targets),
                log: (m) => console.log(m),
            }),
        syncDb: async () => {
            await mustRun("syncDb.ts", ["--apply"]);
        },
        build: buildSession,
        pending: { read: () => readPending(), write: (list) => writePending(list) },
    };
}
```

- [ ] **Step 6: Viết `bot-runner.ts`**

```ts
import { acquireScrapeLock, releaseScrapeLock } from "./history/scrapeLock.js";
import { readQueue, readQueueMeta } from "./history/scrapeQueue.js";
import { effectiveGaps, HEARTBEAT_INTERVAL_MS } from "./history/watchState.js";
import { gapsInWindow, sessionWindow } from "./lesson/recovery.js";
import { currentSession, todayVietnam } from "./lesson/time.js";
import { runCycle } from "./runner/cycle.js";
import { beatRunner, readRunnerState, recordCycle, setPhase, startRunner, stopRunner } from "./runner/runnerState.js";
import { decide, newRecoveryKeys, toQueueTimes } from "./runner/schedule.js";
import { realDeps } from "./runner/steps.js";

/**
 * Long-running orchestrator. `bot:watch` only detects and queues; this process notices the queue
 * has groups, waits for a quiet spell (runner/schedule.ts), then runs a cycle: recover a
 * `bot:watch` gap if there was one, scrape the queue, sync the DB, rebuild the Excel of every
 * session that got a new report (runner/cycle.ts). It never restarts Zalo Desktop or `bot:watch`.
 *
 *   npm run bot:runner
 *
 * After 3 failed cycles in a row it stops trying (state `error`) until restarted; the queue is untouched.
 * Look at it with `npm run runner:status`.
 */
const POLL_MS = 5_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const stamp = () => new Date().toISOString();
const log = (m: string) => console.log(`${stamp()} ${m}`);

async function main(): Promise<void> {
    const started = startRunner(Date.now(), process.pid);
    if (started.anotherInstanceAlive) {
        console.error("[runner] another `bot:runner` is already running — exiting.");
        process.exit(1);
    }
    if (started.crashed) log("[runner] the previous bot:runner did not stop cleanly; unfinished sessions (data/.runner-pending.json) will be rebuilt.");

    const shutdown = (code: number) => {
        stopRunner(Date.now());
        releaseScrapeLock();
        process.exit(code);
    };
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
    process.on("uncaughtException", (err) => {
        console.error("[runner] fatal:", err);
        shutdown(1);
    });
    process.on("unhandledRejection", (err) => {
        console.error("[runner] fatal:", err);
        shutdown(1);
    });

    setInterval(() => beatRunner(Date.now()), HEARTBEAT_INTERVAL_MS);

    const deps = realDeps();
    const startedAt = Date.now();
    const recovered = new Set<string>();
    log("[runner] running. Waiting for groups in the scrape queue.");

    for (;;) {
        await sleep(POLL_MS);
        const now = Date.now();
        if (readRunnerState()?.state === "error") continue; // stopped trying; a restart clears it

        const times = toQueueTimes(readQueue(), readQueueMeta(), startedAt);
        const decision = decide(times, now);

        // bot:watch may be dead and so queue nothing at all: a gap that covers the current session and
        // has not been recovered yet triggers a cycle by itself (its recover step re-scrapes what is missing).
        const gaps = gapsInWindow(effectiveGaps(now), sessionWindow(todayVietnam(now), currentSession(now)), now);
        const freshGaps = newRecoveryKeys(gaps, recovered);

        if (decision.action !== "run" && freshGaps.length === 0) {
            setPhase(now, decision.action === "wait" ? "waiting" : "idle");
            continue;
        }

        const lock = acquireScrapeLock("bot:runner");
        if (!lock.ok) {
            log(`[runner] "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) đang điều khiển Zalo Desktop — thử lại sau.`);
            continue;
        }
        setPhase(now, "running");
        try {
            log(`[runner] bắt đầu vòng (${decision.action === "run" ? `hàng chờ: ${decision.reason}` : "khoảng gián đoạn của bot:watch"}).`);
            const summary = await runCycle(deps);
            for (const key of freshGaps) recovered.add(key);
            const state = recordCycle(Date.now(), summary);
            log(`[runner] vòng xong: ${summary.ok ? "OK" : "LỖI"} — nhóm ${summary.groups.length}, buổi ${summary.sessions.length}, cần xem ${summary.reviewCount}${summary.errors.length > 0 ? `, lỗi: ${summary.errors.join("; ")}` : ""}`);
            if (state.state === "error") log(`[runner] ${state.consecutiveFailures} vòng lỗi liên tiếp — ngừng tự thử. Sửa nguyên nhân rồi khởi động lại.`);
        } finally {
            releaseScrapeLock();
        }
    }
}

main().catch((err) => {
    console.error(err);
    stopRunner(Date.now());
    releaseScrapeLock();
    process.exit(1);
});
```

- [ ] **Step 7: Viết `runnerOnce.ts` và `runnerStatus.ts`**

`runnerOnce.ts`:

```ts
import { currentSession, isBuoi, todayVietnam, type Buoi } from "./lesson/time.js";
import { appendLog, readPending, writePending, type CycleSummary } from "./runner/runnerState.js";
import { buildSession } from "./runner/steps.js";

/**
 * Rebuilds ONE session's outputs without scraping: extract (applying output/overrides.json),
 * write the Excel (temp file then swap), mark the messages. This is what the agent runs after
 * fixing `overrides.json`. Touching neither Zalo Desktop nor the queue, it does not need the scrape lock.
 *
 *   npm run runner:once -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const day = option("--day") ?? todayVietnam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isBuoi(buoiArg)) throw new Error(`--buoi must be sang, chieu or toi, got "${buoiArg}"`);
    const buoi: Buoi = buoiArg ?? currentSession();

    const summary: CycleSummary = { kind: "rebuild", at: Date.now(), ok: true, groups: [], sessions: [{ day, buoi }], reviewCount: 0, excel: [], warnings: [], errors: [] };
    try {
        const built = await buildSession({ day, buoi });
        summary.reviewCount = built.reviewCount;
        if (built.excel) summary.excel.push(built.excel);
        summary.warnings.push(...built.warnings);
        writePending(readPending().filter((s) => s.day !== day || s.buoi !== buoi));
    } catch (err) {
        summary.ok = false;
        summary.errors.push((err as Error).message);
        process.exitCode = 1;
    }
    appendLog(summary);
    console.log(`[rebuild] ${day} ${buoi}: ${summary.ok ? "OK" : "LỖI"}, cần xem ${summary.reviewCount}${summary.excel.length > 0 ? `, Excel: ${summary.excel.join(", ")}` : ", không có Excel (không báo cáo nào có phòng trong DB)"}`);
    for (const w of summary.warnings) console.warn(`[rebuild] cảnh báo: ${w}`);
    for (const e of summary.errors) console.error(`[rebuild] lỗi: ${e}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
```

`runnerStatus.ts`:

```ts
import { readQueue, readQueueMeta } from "./history/scrapeQueue.js";
import { formatRunnerStatus } from "./runner/runnerStatusReport.js";
import { readPending, readRunnerState, runnerHealth } from "./runner/runnerState.js";
import { toQueueTimes } from "./runner/schedule.js";

/**
 * Is `bot:runner` alive, what did its last cycle do, what is queued, which sessions still owe a rebuild.
 * Read-only. Exit code 0 when the runner is alive, 2 when it is not (dead, stopped, in error, or never ran)
 * so an agent can tell it needs to be restarted by a person.
 *
 *   npm run runner:status
 */
const now = Date.now();
const state = readRunnerState();
const queue = readQueue();
const times = toQueueTimes(queue, readQueueMeta(), now);
for (const line of formatRunnerStatus({ state, queue, firstQueuedAt: queue.length > 0 ? times.firstQueuedAt : null, pending: readPending(), now })) console.log(line);
if (runnerHealth(state, now) !== "alive") process.exitCode = 2;
```

- [ ] **Step 8: Thêm script vào `package.json`**

Trong `"scripts"`, sau dòng `"watch:status": "tsx watchStatus.ts",` thêm:

```json
        "bot:runner": "tsx bot-runner.ts",
        "runner:once": "tsx runnerOnce.ts",
        "runner:status": "tsx runnerStatus.ts",
```

- [ ] **Step 9: Typecheck, toàn bộ test, kiểm tra CLI không cần Zalo**

Run: `npm run typecheck` rồi `npm test`
Expected: không lỗi; đạt (tổng số test cũ 107 cộng các test mới của Task 1–8).

Run: `npm run runner:status`
Expected: in `[runner] chưa có dữ liệu — bot:runner chưa từng chạy.` cùng dòng hàng chờ, thoát mã 2 (đúng thiết kế).

- [ ] **Step 10: Commit**

```bash
git add runner/runnerStatusReport.ts runner/steps.ts bot-runner.ts runnerOnce.ts runnerStatus.ts package.json tests/runnerStatusReport.test.ts
git commit -m "feat(runner): bot:runner, runner:once and runner:status" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Chạy thử thật từ đầu đến cuối

**Files:** không sửa mã (chỉ sửa nếu phát hiện lỗi, mỗi lỗi kèm test tái hiện trước).

Task này cần Zalo Desktop, SQL Server và Excel, và ghi vào DB thật, nên **hỏi người dùng xác nhận trước khi bắt đầu** (đúng quy tắc ghi DB của dự án); người dùng đã cho phép ghi thật ở các phiên trước nhưng phiên này chưa xác nhận lại.

- [ ] **Step 1: Chuẩn bị**

Chạy `npm run watch:status` và `npm run runner:status`. `bot:watch` phải đang chạy (nếu không, nhờ người dùng chạy `npm run bot:watch`; không tự khởi động). Hàng chờ nên rỗng: `Get-Content data/.scrape-queue.json`.

- [ ] **Step 2: Khởi động runner ở nền**

Run (nền): `npm run bot:runner`
Expected: log `[runner] running. Waiting for groups in the scrape queue.`; `npm run runner:status` in `ĐANG CHẠY`, thoát mã 0.

- [ ] **Step 3: Kiểm khóa hai tiến trình**

Run: `npm run bot:runner` lần hai.
Expected: `another \`bot:runner\` is already running — exiting.`, thoát mã 1.

- [ ] **Step 4: Gửi một báo cáo thử vào nhóm `bot test` và quan sát**

Nhờ người dùng nhắn một báo cáo đầu buổi vào nhóm `bot test`. Expected trong log runner: `bot:watch` xếp nhóm vào hàng chờ; sau khoảng 2 phút yên lặng runner in `bắt đầu vòng (hàng chờ: quiet)` rồi `vòng xong: OK`; nhóm `bot test` nằm trong `recoveryIgnoreTargets` nên không ảnh hưởng khôi phục; kiểm `output/runner-log.jsonl` có thêm một dòng, `data/export/baocaobuoi<buổi>_<ddMMyy>.xlsm` được cập nhật (đúng một tệp, không còn `.tmp`), hàng chờ rỗng.

- [ ] **Step 5: Kiểm `runner:once`**

Run: `npm run runner:once -- --day <hôm nay> --buoi <buổi vừa thử>`
Expected: `[rebuild] ... OK`, thêm một dòng `kind: "rebuild"` vào nhật ký.

- [ ] **Step 6: Kiểm Excel đang mở**

Nhờ người dùng mở file Excel của buổi đó, rồi chạy lại `npm run runner:once`. Expected: cảnh báo `đang mở, đã lưu thành ..._moi.xlsm`, file gốc vẫn nguyên; đóng file gốc và chạy lại thì `_moi` biến mất.

- [ ] **Step 7: Dừng runner, dọn**

Dừng tiến trình nền của `bot:runner` (Ctrl+C hoặc `Stop-Process` chỉ đúng pid ghi trong `data/.runner-state.json`; không dừng cây tiến trình con của Zalo). Expected: `runner:status` in `ĐÃ DỪNG`.

Nếu bước nào không đạt: dùng superpowers:systematic-debugging, viết test tái hiện lỗi (RED) trước khi sửa.

---

### Task 10: Tài liệu và skill giám sát

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/QUY-TRINH.md`, `docs/GUIDE.md`, `Teach-lesson-skills-V2/SKILL.md`, `docs/superpowers/specs/2026-09-25-bot-runner-design.md`

**Interfaces:** không có mã.

- [ ] **Step 1: Ghi các điều chỉnh so với spec vào spec**

Trong `docs/superpowers/specs/2026-09-25-bot-runner-design.md` thêm mục cuối `## 13. Điều chỉnh khi lập kế hoạch` gồm đúng các điểm:
1. Các bước `syncDb`, trích xuất, điền Excel, `markMessages` được gọi như tiến trình con (`node --import tsx <script>`), không refactor thành hàm, vì `syncDb.ts` và `markMessages.ts` là tệp của người dùng và chạy `main()` ngay khi nạp; `runScrape`, `runQueuedScrape`, `runRecovery` vẫn gọi trực tiếp.
2. Danh sách buổi chờ dựng `data/.runner-pending.json`: lưu trước khi đồng bộ DB, chỉ xóa sau khi dựng thành công, để runner chết giữa vòng không làm mất buổi cần dựng; đồng bộ DB chạy mỗi vòng vì idempotent.
3. Khi `bot:watch` chết và hàng chờ rỗng, runner tự kích hoạt một vòng khi có gián đoạn mới chồng lên buổi hiện tại (khóa `from|to`), vì nếu không sẽ không ai kích hoạt khôi phục.
4. `runner:once` chỉ dựng lại một buổi và không cào (không cần cờ `--rebuild`); `runner:status` thoát mã 2 khi runner không sống.
5. Trạng thái `error` giữ đến khi khởi động lại (không có vòng thử lại để tự thoát).
6. Khôi phục trong vòng chỉ xét buổi hiện tại; gián đoạn của buổi trước đó xử lý bằng `recover:missing` tay.

- [ ] **Step 2: README.md và CLAUDE.md**

Thêm vào danh sách lệnh của cả hai tệp: `npm run bot:runner`, `npm run runner:once -- [--day D] [--buoi B]`, `npm run runner:status`. Trong `CLAUDE.md` mục "`bot:watch` and `bot:scrape` cooperate through a queue" thêm đoạn: `bot:runner` là tiến trình thứ ba, đọc hàng chờ, chờ yên lặng 2 phút (trần 10 phút), rồi chạy cào → đồng bộ → trích xuất → Excel; mọi thứ điều khiển giao diện Zalo (`bot:scrape` tay và vòng của runner) dùng khóa `data/.scrape.lock`. Trong README thêm một mục ngắn "`bot:runner`: tự động hóa" mô tả cùng nội dung, các tệp trạng thái (`data/.runner-state.json`, `output/runner-log.jsonl`, `data/.runner-pending.json`, `data/.scrape-queue-meta.json`, `data/.scrape.lock`) và giới hạn đã biết (cào điều khiển giao diện Zalo nên có thể làm gián đoạn người đang gõ).

- [ ] **Step 3: `docs/QUY-TRINH.md` và `docs/GUIDE.md`**

`QUY-TRINH.md`: thêm mục mô tả `bot:runner` (vòng chạy 6 bước của spec mục 5, debounce, buổi chờ dựng, ghi đè Excel qua tệp tạm) và đánh dấu quy trình cũ (agent tự chạy từng bước) là "chạy tay / khi runner không chạy".
`GUIDE.md`: thêm mục hướng dẫn giữ `bot:watch` và `bot:runner` chạy 24/24 trên Windows (Task Scheduler "At log on / At startup" với hành động khởi động lại khi lỗi, hoặc PM2 chạy như dịch vụ Windows; nêu rõ đây chỉ là hướng dẫn, mã không phụ thuộc), cách kiểm bằng `watch:status` và `runner:status`, và việc runner tự dừng thử sau 3 vòng lỗi (phải khởi động lại tay).

- [ ] **Step 4: `Teach-lesson-skills-V2/SKILL.md` sang chế độ giám sát**

Sửa **chỉ** các phần: "Điều kiện kích hoạt", "Mục tiêu" (giữ nguyên câu chữ về dữ liệu cần lấy; chỉ nêu thêm rằng khi `bot:runner` chạy, agent giám sát), "Lưu ý quan trọng", "Luồng chạy" và mục "Kiểm tra `bot:watch`...". Thêm mục `## Chế độ giám sát khi bot:runner đang chạy` với các bước, theo đúng thứ tự:
1. `npm run runner:status`. Mã thoát 0: runner sống; mã 2: báo "bot:runner đang không hoạt động, cần khởi động lại `npm run bot:runner`", **không tự khởi động**, rồi làm tiếp bằng luồng chạy tay cũ (bước 0 đến 7) nếu người dùng yêu cầu.
2. Đọc dòng "vòng gần nhất" và `output/runner-log.jsonl` của buổi được yêu cầu; nếu có lỗi hoặc cảnh báo thì nêu trong báo cáo cuối.
3. Đọc `output/review.json` và xử lý như phần "Cách sửa: `output/overrides.json`" hiện có; sau khi ghi `overrides.json`, chạy `npm run runner:once -- --day <ngày> --buoi <buổi>` để dựng lại (không cào).
4. Kiểm Excel `data/export/baocaobuoi<buổi>_<ddMMyy>.xlsm`: có tệp, không có `_moi.xlsm` tồn đọng (nếu có: nhắc đóng tệp gốc rồi chạy `runner:once`).
5. Báo cáo cuối: trạng thái runner, các vòng trong buổi, số mục đã xem, Excel.

Ràng buộc: khi runner sống, agent **không** chạy `bot:scrape`, `sync:db`, `recover:missing` hay `mark:messages` riêng lẻ (runner đã làm), trừ `runner:once`.
Không chạm khối `## Quy tắc trích xuất` đến ngay trước `## Script trích xuất và agent giám sát`.

- [ ] **Step 5: Kiểm khối quy tắc trích xuất còn nguyên**

Run:
```bash
git show HEAD:Teach-lesson-skills-V2/SKILL.md | sed -n '/^## Quy tắc trích xuất/,/^## Script trích xuất và agent giám sát/p' > /tmp/before.txt
sed -n '/^## Quy tắc trích xuất/,/^## Script trích xuất và agent giám sát/p' Teach-lesson-skills-V2/SKILL.md > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt && echo IDENTICAL
```
Expected: `IDENTICAL`. Nếu khác, hoàn tác phần đã lỡ sửa trong khối đó.

- [ ] **Step 6: Toàn bộ test, typecheck và commit**

Run: `npm test` rồi `npm run typecheck`
Expected: đạt.

```bash
git add README.md CLAUDE.md docs/QUY-TRINH.md docs/GUIDE.md Teach-lesson-skills-V2/SKILL.md docs/superpowers/specs/2026-09-25-bot-runner-design.md
git commit -m "docs: bot:runner, supervision mode for the skill, adjustments to the spec" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** mục 2 debounce (Task 1); cờ không lưu riêng và mốc thời điểm (Task 2); mục 4 đơn vị `schedule`, `cycle`, `affectedSessions`, `safeReplace`, `runnerState`, `bot-runner` (Task 1–8); mục 5 vòng chạy 6 bước (Task 7, 8); mục 6 debounce chi tiết và tương thích định dạng cũ (Task 2: tệp phụ nên `.scrape-queue.json` không đổi định dạng); mục 7 trạng thái, khóa chung, 3 lần lỗi (Task 5, 6); mục 8 ghi đè an toàn (Task 4); mục 9 vai trò agent (Task 8 `runner:status`/`runner:once`, Task 10 skill); mục 10 lỗi (Task 7 cho vòng lỗi, Task 8 cho SQL/Zalo qua tiến trình con thoát mã khác 0); mục 11 kiểm thử (các test của Task 1–8). Điều chỉnh so với spec được ghi ở Task 10 bước 1.

**Placeholder scan:** không có "TBD"/"TODO"; hai lưu ý viết-thật trong Task 7 (xóa hai dòng thừa) và Task 8 (gộp import) là chỉ dẫn cụ thể.

**Type consistency:** `SessionKey` (Task 3) dùng ở Task 6, 7, 8; `CycleSummary` định nghĩa ở Task 6, dùng ở Task 7, 8; `QueueTimes`/`toQueueTimes` (Task 1) dùng ở Task 8; `newRecoveryKeys` (Task 2) dùng ở Task 8; `safeReplace` (Task 4) dùng trong `buildSession` (Task 8); `acquireScrapeLock`/`releaseScrapeLock` (Task 5) dùng ở Task 5 (`index.ts`) và Task 8 (`bot-runner.ts`); `enqueueTarget(target, file?, now?)` giữ tương thích với lời gọi `enqueueTarget(target)` trong `history/watch.ts`.

**Review Focus:** năm mục đều có test ở task được nêu.
