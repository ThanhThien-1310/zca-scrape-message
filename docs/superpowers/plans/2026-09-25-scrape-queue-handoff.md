# Scrape Queue Handoff (`bot:watch` → queue → `bot:scrape`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `bot:watch` chỉ phát hiện nhóm có tin mới và ghi tên nhóm vào một hàng chờ bền vững; `bot:scrape` (chạy tay hoặc do skill gọi) đọc hàng chờ, chỉ cào đúng các nhóm đó rồi xóa đúng những nhóm vừa xử lý.

**Architecture:** Một module nhỏ `history/scrapeQueue.ts` (đọc/ghi nguyên tử `data/.scrape-queue.json`) dùng chung cho hai tiến trình. `history/queueRun.ts` chứa luồng "đọc hàng chờ → cào → xóa có chọn lọc" với các phụ thuộc được truyền vào để test được. `history/watch.ts` bị rút gọn: bỏ toàn bộ phần điều khiển giao diện Zalo và control server.

**Tech Stack:** Node >= 22, TypeScript chạy bằng `tsx`, `node:test`, CDP hiện có (`history/cdp.ts`).

**Spec:** `docs/superpowers/specs/2026-09-23-watch-scrape-queue-handoff-design.md` (gồm mục "Additions made while planning (2026-09-25)"). Đọc cả hai phần trước khi làm.

## Global Constraints

- Thư mục làm việc của mọi lệnh: `zca-scrape-message/` (repo git riêng). Repo đang có nhiều file sửa dở không thuộc plan này: **chỉ `git add` đúng các file của task**, không dùng `git add -A`.
- ESM + `moduleResolution: NodeNext`: import nội bộ có đuôi `.js`. Thụt lề 4 dấu cách, dấu nháy kép.
- Hàng chờ: `data/.scrape-queue.json` (dưới `config.dataDir`), mảng JSON các chuỗi là tên nhóm đúng như trong `config.targets`, coi như tập hợp (không trùng, thứ tự không quan trọng); mọi lần ghi phải nguyên tử (ghi file `.tmp` rồi `rename`), không giới hạn kích thước.
- `bot:watch` không mở, click, tìm kiếm hay cuộn bất cứ thứ gì trong giao diện Zalo Desktop và không ghi `data/<groupId>.json`.
- `bot:scrape` chỉ cào các nhóm trong hàng chờ; hàng chờ rỗng hoặc chưa có file thì thoát ngay, không đụng Zalo Desktop, và in dòng chứa `hàng chờ rỗng` (skill dựa vào dòng này).
- Chính sách lỗi: nhóm lỗi hoặc không có tin nhắn vẫn bị xóa khỏi hàng chờ và ghi log rõ; nếu cả lần chạy không khởi động được (không kết nối được Zalo Desktop/CDP) thì **không xóa gì**.
- Không đổi cách phát hiện tin mới: `history/realtimeListener.ts` và `installNotificationObserver` giữ nguyên cơ chế; chỉ đổi việc làm sau khi phát hiện.
- Các hàm `scrapeAndSaveLatest`, `installLiveMessageObserver`, `toNormalizedMessage` trong `history/desktopScraper.ts` giữ nguyên (không xóa), dù `watch.ts` không còn dùng.

## Review Focus

1. File hàng chờ nằm cạnh các file hội thoại: mọi nơi dùng `MessageStore.listThreads()` (`syncDb.ts`, `extractLessonReports.ts`, `mcp/server.ts`, `buildGroupIdMap`) không được coi `.scrape-queue.json` là một nhóm (test ở Task 1).
2. File hàng chờ hỏng hoặc rỗng (JSON sai, không phải mảng, có phần tử không phải chuỗi): đọc ra hàng chờ rỗng chứ không làm sập `bot:watch` (test ở Task 2).
3. Nhóm được thêm vào hàng chờ **trong lúc** `bot:scrape` đang chạy phải còn nguyên sau khi dọn dẹp (test ở Task 4).
4. Nhóm không có tin nào (hội thoại rỗng) không được làm `bot:scrape` treo vô hạn (test ở Task 3).
5. Một nhóm lỗi không được làm hỏng các nhóm còn lại; lỗi kết nối toàn cục không được xóa hàng chờ (test ở Task 4).

---

### Task 1: `MessageStore.listThreads()` bỏ qua file bắt đầu bằng dấu chấm

**Files:**
- Modify: `store/messageStore.ts:199-205`
- Modify: `package.json` (chỉ nếu chưa có script `test`)
- Test: `tests/messageStore.test.ts`

**Interfaces:**
- Consumes: `MessageStore` (`new MessageStore(dataDir?: string)`, `listThreads(): string[]`).
- Produces: `listThreads()` chỉ trả về tên các file `<id>.json` không bắt đầu bằng `.`.

- [ ] **Step 1: Viết test thất bại**

Nếu `package.json` chưa có script `test`, thêm vào `"scripts"`: `"test": "node --import tsx --test \"tests/**/*.test.ts\""`.

Tạo `tests/messageStore.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MessageStore } from "../store/messageStore.js";

test("listThreads ignores dot-files such as the scrape queue", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "store-"));
    fs.writeFileSync(path.join(dir, "g111.json"), "[]", "utf8");
    fs.writeFileSync(path.join(dir, "222.json"), "[]", "utf8");
    fs.writeFileSync(path.join(dir, ".scrape-queue.json"), '["LC_HoaSen1_TĐ"]', "utf8");
    fs.writeFileSync(path.join(dir, "notes.txt"), "x", "utf8");

    const store = new MessageStore(dir);
    assert.deepEqual(store.listThreads().sort(), ["222", "g111"]);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/messageStore.test.ts`
Expected: FAIL — kết quả có thêm phần tử `.scrape-queue`.

- [ ] **Step 3: Sửa `listThreads`**

Trong `store/messageStore.ts`, thay thân hàm:

```ts
    listThreads(): string[] {
        if (!fs.existsSync(this.dataDir)) return [];
        return fs
            .readdirSync(this.dataDir)
            .filter((f) => f.endsWith(".json") && !f.startsWith("."))
            .map((f) => f.slice(0, -".json".length));
    }
```

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/messageStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add store/messageStore.ts tests/messageStore.test.ts package.json
git commit -m "fix(store): listThreads ignores dot-files so the scrape queue is not read as a thread"
```

---

### Task 2: Module hàng chờ `history/scrapeQueue.ts`

**Files:**
- Create: `history/scrapeQueue.ts`
- Test: `tests/scrapeQueue.test.ts`

**Interfaces:**
- Consumes: `config.dataDir` từ `config.ts`.
- Produces (tất cả nhận `file` tùy chọn, mặc định `DEFAULT_QUEUE_PATH`): `DEFAULT_QUEUE_PATH: string`, `readQueue(file?): string[]` (file thiếu/hỏng/không phải mảng chuỗi → `[]`), `enqueueTarget(target: string, file?): boolean` (`true` nếu vừa thêm, `false` nếu đã có), `removeFromQueue(handled: string[], file?): void` (đọc lại file rồi ghi lại phần không nằm trong `handled`).

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/scrapeQueue.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enqueueTarget, readQueue, removeFromQueue } from "../history/scrapeQueue.js";

const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "queue-")), "data", ".scrape-queue.json");

test("a missing file is an empty queue", () => {
    assert.deepEqual(readQueue(fresh()), []);
});

test("enqueue creates the file (and its folder), dedupes, and reports whether it added", () => {
    const file = fresh();
    assert.equal(enqueueTarget("A", file), true);
    assert.equal(enqueueTarget("B", file), true);
    assert.equal(enqueueTarget("A", file), false);
    assert.deepEqual(readQueue(file), ["A", "B"]);
    assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("removeFromQueue drops only the handled targets and keeps the ones added meanwhile", () => {
    const file = fresh();
    enqueueTarget("A", file);
    enqueueTarget("B", file);
    const snapshot = readQueue(file);
    enqueueTarget("C", file); // arrives while the scrape of A and B is running
    removeFromQueue(snapshot, file);
    assert.deepEqual(readQueue(file), ["C"]);
});

test("a corrupt or wrongly shaped file reads as an empty queue instead of throwing", () => {
    const file = fresh();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const content of ["{ not json", "{}", '"A"', '["A", 3, null]', ""]) {
        fs.writeFileSync(file, content, "utf8");
        assert.deepEqual(readQueue(file), content === '["A", 3, null]' ? ["A"] : [], content);
    }
});

test("removing from a missing queue is a no-op", () => {
    const file = fresh();
    removeFromQueue(["A"], file);
    assert.deepEqual(readQueue(file), []);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/scrapeQueue.test.ts`
Expected: FAIL (`Cannot find module '../history/scrapeQueue.js'`).

- [ ] **Step 3: Viết `history/scrapeQueue.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Durable set of target names (as in `config.targets`) that `bot:watch` saw new
 * activity for and `bot:scrape` has not scraped yet. Two processes use it:
 * `bot:watch` only adds, `bot:scrape` reads a snapshot and later removes the
 * targets it handled. Every write is atomic (temp file + rename); the
 * read-modify-write itself is not locked — the worst case of the tiny race
 * between the two processes is one target enqueued again by its next message.
 */
export const DEFAULT_QUEUE_PATH = path.join(config.dataDir, ".scrape-queue.json");

/** A missing, unreadable or wrongly shaped file reads as an empty queue; non-string entries are dropped. */
export function readQueue(file: string = DEFAULT_QUEUE_PATH): string[] {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return [];
    }
}

function writeQueue(list: string[], file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
    fs.renameSync(tmp, file);
}

/** Adds `target` unless already queued; returns whether it was added. */
export function enqueueTarget(target: string, file: string = DEFAULT_QUEUE_PATH): boolean {
    const queue = readQueue(file);
    if (queue.includes(target)) return false;
    queue.push(target);
    writeQueue(queue, file);
    return true;
}

/** Re-reads the file and removes only `handled`, so a target queued after the caller took its snapshot survives. */
export function removeFromQueue(handled: string[], file: string = DEFAULT_QUEUE_PATH): void {
    const drop = new Set(handled);
    const current = readQueue(file);
    const remaining = current.filter((t) => !drop.has(t));
    if (remaining.length === current.length && !fs.existsSync(file)) return;
    writeQueue(remaining, file);
}
```

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/scrapeQueue.test.ts`
Expected: PASS, `tests 5`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add history/scrapeQueue.ts tests/scrapeQueue.test.ts
git commit -m "feat(queue): atomic scrape queue shared by bot:watch and bot:scrape"
```

---

### Task 3: Sửa vòng lặp vô hạn khi hội thoại không có tin nhắn nào

**Files:**
- Create: `history/scrollStability.ts`
- Modify: `history/desktopScraper.ts` (trong `scrapeThreadHistory`, khoảng dòng 359-405)
- Test: `tests/scrollStability.test.ts`

**Interfaces:**
- Produces: `nextStableRounds(height: number | null, previousHeight: number, stableRounds: number): number` — trả `stableRounds + 1` khi `height` là `null` hoặc bằng `previousHeight`, ngược lại `0`. Vòng lặp cuộn dừng khi kết quả đạt 3.

Bối cảnh: `scrollMessagePaneToTop` trả `null` khi khung tin nhắn không có gì; điều kiện cũ `height != null && height === previousHeight` khiến bộ đếm luôn về 0 nên vòng lặp không bao giờ dừng.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/scrollStability.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextStableRounds } from "../history/scrollStability.js";

test("progress resets the counter", () => {
    assert.equal(nextStableRounds(1200, 800, 2), 0);
});

test("an unchanged height counts as a stable round", () => {
    assert.equal(nextStableRounds(800, 800, 0), 1);
    assert.equal(nextStableRounds(800, 800, 2), 3);
});

test("a pane with no height (no messages rendered) counts as stable, so the loop ends", () => {
    let rounds = 0;
    for (let i = 0; i < 3; i++) rounds = nextStableRounds(null, -1, rounds);
    assert.equal(rounds, 3);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/scrollStability.test.ts`
Expected: FAIL (`Cannot find module '../history/scrollStability.js'`).

- [ ] **Step 3: Viết `history/scrollStability.ts` và nối vào `scrapeThreadHistory`**

`history/scrollStability.ts`:

```ts
/**
 * Consecutive scroll rounds that revealed nothing new; the scroll loop stops at 3.
 * A null height (the message pane has nothing rendered — a conversation with no
 * messages) counts as "no progress", otherwise such a conversation loops forever.
 */
export function nextStableRounds(height: number | null, previousHeight: number, stableRounds: number): number {
    return height === null || height === previousHeight ? stableRounds + 1 : 0;
}
```

Trong `history/desktopScraper.ts`, thêm import ở đầu file (cùng khối import hiện có):

```ts
import { nextStableRounds } from "./scrollStability.js";
```

và trong `scrapeThreadHistory` thay dòng

```ts
        stableRounds = height != null && height === previousHeight ? stableRounds + 1 : 0;
```

bằng

```ts
        stableRounds = nextStableRounds(height, previousHeight, stableRounds);
```

(giữ nguyên dòng ngay sau nó `previousHeight = height ?? previousHeight;`).

- [ ] **Step 4: Chạy test và typecheck**

Run: `node --import tsx --test tests/scrollStability.test.ts` → PASS.
Run: `npm run typecheck` → không lỗi.

- [ ] **Step 5: Commit**

```bash
git add history/scrollStability.ts history/desktopScraper.ts tests/scrollStability.test.ts
git commit -m "fix(scrape): stop scrolling a conversation that has no messages"
```

---

### Task 4: `runScrape` nhận danh sách nhóm, luồng hàng chờ và `index.ts` mới

**Files:**
- Create: `history/queueRun.ts`
- Modify: `history/desktopScraper.ts:188-208` (`runScrape`)
- Modify: `index.ts` (viết lại toàn bộ)
- Test: `tests/queueRun.test.ts`

**Interfaces:**
- Consumes: `readQueue`, `removeFromQueue` (Task 2); `runScrape` mới.
- Produces:
  - `history/desktopScraper.ts`: `type TargetOutcome = { target: string; error?: string }` và `runScrape(store: MessageStore, targets: string[] = config.targets): Promise<TargetOutcome[]>` — cào từng nhóm, lỗi của một nhóm được bắt và ghi vào kết quả, không làm dừng các nhóm sau; lỗi khởi động (`ensureZaloReady`, kết nối CDP) vẫn ném ra.
  - `history/queueRun.ts`: `QueueRunDeps { readQueue(): string[]; removeFromQueue(handled: string[]): void; scrape(targets: string[]): Promise<TargetOutcome[]>; log(message: string): void }`, `QueueRunResult = { status: "empty" } | { status: "done"; targets: string[]; failed: string[] }`, `runQueuedScrape(deps): Promise<QueueRunResult>`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/queueRun.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runQueuedScrape, type QueueRunDeps } from "../history/queueRun.js";

function harness(initial: string[], scrape: QueueRunDeps["scrape"]) {
    let queue = [...initial];
    const logs: string[] = [];
    const deps: QueueRunDeps = {
        readQueue: () => [...queue],
        removeFromQueue: (handled) => {
            queue = queue.filter((t) => !handled.includes(t));
        },
        scrape,
        log: (m) => logs.push(m),
    };
    return { deps, logs, get queue() { return queue; }, push: (t: string) => queue.push(t) };
}

test("an empty queue exits without scraping", async () => {
    let called = false;
    const h = harness([], async () => {
        called = true;
        return [];
    });
    assert.deepEqual(await runQueuedScrape(h.deps), { status: "empty" });
    assert.equal(called, false);
    assert.ok(h.logs.some((l) => l.includes("hàng chờ rỗng")));
});

test("only the queued targets are scraped and then removed", async () => {
    let seen: string[] = [];
    const h = harness(["A", "B"], async (targets) => {
        seen = targets;
        return targets.map((target) => ({ target }));
    });
    const r = await runQueuedScrape(h.deps);
    assert.deepEqual(seen, ["A", "B"]);
    assert.deepEqual(r, { status: "done", targets: ["A", "B"], failed: [] });
    assert.deepEqual(h.queue, []);
});

test("a target queued while the scrape runs survives the cleanup", async () => {
    const h = harness(["A"], async (targets) => {
        h.push("C");
        return targets.map((target) => ({ target }));
    });
    await runQueuedScrape(h.deps);
    assert.deepEqual(h.queue, ["C"]);
});

test("a failed target is still removed, reported and logged", async () => {
    const h = harness(["A", "B"], async () => [{ target: "A", error: "sidebar item not found" }, { target: "B" }]);
    const r = await runQueuedScrape(h.deps);
    assert.deepEqual(r, { status: "done", targets: ["A", "B"], failed: ["A"] });
    assert.deepEqual(h.queue, []);
    assert.ok(h.logs.some((l) => l.includes('"A"') && l.includes("lỗi")));
});

test("if the whole run cannot start nothing is removed and the error propagates", async () => {
    const h = harness(["A", "B"], async () => {
        throw new Error("CDP not reachable");
    });
    await assert.rejects(runQueuedScrape(h.deps), /CDP not reachable/);
    assert.deepEqual(h.queue, ["A", "B"]);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/queueRun.test.ts`
Expected: FAIL (`Cannot find module '../history/queueRun.js'`).

- [ ] **Step 3: Viết `history/queueRun.ts`, sửa `runScrape`, viết lại `index.ts`**

`history/queueRun.ts`:

```ts
import type { TargetOutcome } from "./desktopScraper.js";

export interface QueueRunDeps {
    readQueue(): string[];
    /** Must re-read the queue itself, so targets queued during the scrape survive. */
    removeFromQueue(handled: string[]): void;
    scrape(targets: string[]): Promise<TargetOutcome[]>;
    log(message: string): void;
}

export type QueueRunResult = { status: "empty" } | { status: "done"; targets: string[]; failed: string[] };

/**
 * Snapshot the queue, scrape exactly those targets, then remove exactly those
 * targets. A failed target is removed too (and logged) so it cannot stay stuck
 * forever; if `scrape` itself throws (Zalo Desktop unreachable) nothing is
 * removed, since that failure is not the targets' fault.
 */
export async function runQueuedScrape(deps: QueueRunDeps): Promise<QueueRunResult> {
    const snapshot = deps.readQueue();
    if (snapshot.length === 0) {
        deps.log("[scrape] hàng chờ rỗng, không có gì để cào.");
        return { status: "empty" };
    }

    deps.log(`[scrape] hàng chờ có ${snapshot.length} nhóm: ${snapshot.join(", ")}`);
    const outcomes = await deps.scrape(snapshot);
    deps.removeFromQueue(snapshot);

    const failed = outcomes.filter((o) => o.error !== undefined).map((o) => o.target);
    for (const target of failed) deps.log(`[scrape] "${target}" lỗi, đã bỏ khỏi hàng chờ — chạy lại nếu cần cào lại.`);
    return { status: "done", targets: snapshot, failed };
}
```

Trong `history/desktopScraper.ts`, thay toàn bộ hàm `runScrape` hiện có (khối bắt đầu từ comment ngay trước `export async function runScrape(store: MessageStore): Promise<void>` tới hết hàm) bằng:

```ts
export type TargetOutcome = { target: string; error?: string };

/**
 * Scrapes the given conversations (default: everything in `config.targets`)
 * one after another. An error in one conversation is recorded in its outcome
 * and does not stop the rest; a failure to start (Zalo Desktop / CDP) throws.
 */
export async function runScrape(store: MessageStore, targets: string[] = config.targets): Promise<TargetOutcome[]> {
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
            try {
                await scrapeAndSaveTarget(page, store, target);
                outcomes.push({ target });
            } catch (err) {
                console.error(`[scrape] "${target}": failed —`, err);
                outcomes.push({ target, error: (err as Error).message });
            }
        }
    } finally {
        page.close();
    }
    return outcomes;
}
```

(Giữ nguyên khối doc-comment dài phía trên `runScrape` nếu có; chỉ thay chữ ký và thân hàm. Câu trong comment nói "scrapes config.targets" đổi thành "scrapes the given targets".)

Ghi đè `index.ts`:

```ts
import { runScrape } from "./history/desktopScraper.js";
import { runQueuedScrape } from "./history/queueRun.js";
import { readQueue, removeFromQueue } from "./history/scrapeQueue.js";
import { MessageStore } from "./store/messageStore.js";

/**
 * Manual, queue-driven scrape. `bot:watch` never scrapes: it only records which
 * configured conversations saw new activity in `data/.scrape-queue.json`. This
 * script reads that queue, scrapes exactly those conversations (full scroll-back
 * to `config.sinceTs`), then removes just those entries — anything `bot:watch`
 * queued in the meantime stays. An empty queue exits at once without touching
 * Zalo Desktop. Nothing here talks to `bot:watch`; it is the only process that
 * ever drives Zalo Desktop's UI. See history/scrapeQueue.ts and history/queueRun.ts.
 */
async function main(): Promise<void> {
    const store = new MessageStore();
    const result = await runQueuedScrape({
        readQueue: () => readQueue(),
        removeFromQueue: (handled) => removeFromQueue(handled),
        scrape: (targets) => runScrape(store, targets),
        log: (message) => console.log(message),
    });
    if (result.status === "done" && result.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
```

- [ ] **Step 4: Chạy test và typecheck**

Run: `npm test` → PASS toàn bộ.
Run: `npm run typecheck` → có thể báo `history/watch.ts` và `config.ts` còn dùng `watchControlPort` hoặc gọi `runScrape` theo chữ ký cũ: `history/watch.ts` không gọi `runScrape` (chỉ `scrapeAndSaveTarget`), nên không lỗi mới; nếu có lỗi khác thì sửa trước khi commit.

- [ ] **Step 5: Chạy thử hàng chờ rỗng (không cần Zalo)**

Run: `npm run bot:scrape`
Expected: in `[scrape] hàng chờ rỗng, không có gì để cào.`, thoát mã 0 ngay, không khởi động Zalo Desktop. (Nếu `data/.scrape-queue.json` đang có nội dung thì xóa/đổi tên file này trước khi chạy.)

- [ ] **Step 6: Commit**

```bash
git add history/queueRun.ts history/desktopScraper.ts index.ts tests/queueRun.test.ts
git commit -m "feat(queue): bot:scrape scrapes only the queued targets and clears just those"
```

---

### Task 5: Rút gọn `bot:watch` thành bộ phát hiện chỉ đưa vào hàng chờ

**Files:**
- Modify: `history/watch.ts` (ghi đè toàn bộ)
- Modify: `watch.ts` (chỉ comment)
- Modify: `config.ts` (bỏ `watchControlPort`)

**Interfaces:**
- Consumes: `enqueueTarget` (Task 2); `forceRestartZalo` từ `history/desktopScraper.ts`; `installRealtimeListener` từ `history/realtimeListener.ts`; `connectToZaloMainPageEarly`, `connectToZaloNotificationPage`, `CdpPage` từ `history/cdp.ts`.
- Produces: `watch(): Promise<void>` như cũ nhưng: không có control server, không debounce/scrape, không observer trong nhóm đang mở, không lưu ảnh từ WebSocket, không chờ sidebar. Mỗi lần phát hiện tin mới (WebSocket hoặc popup thông báo) gọi `enqueueTarget(target)`.

Không có test tự động (cần Zalo Desktop thật); xác nhận bằng `typecheck` và các bước thủ công của Task 6. Đây là quyết định của spec: bỏ khối lưu ảnh trực tiếp từ WebSocket (Risk 1), nghĩa là ảnh không còn nhận URL thật qua `bot:watch`.

- [ ] **Step 1: Ghi đè `history/watch.ts`**

```ts
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
```

- [ ] **Step 2: Cập nhật comment của `watch.ts` (gốc) và bỏ `watchControlPort` khỏi `config.ts`**

Trong `watch.ts` (file gốc, không phải `history/watch.ts`), thay comment thành:

```ts
/**
 * Continuous detector — stays running and records which configured
 * conversations got new messages in the scrape queue (data/.scrape-queue.json).
 * It never scrapes: run `npm run bot:scrape` to scrape what is queued.
 * See history/watch.ts.
 */
```

Trong `config.ts`, xóa nguyên khối sau (bao gồm comment) và dòng trống theo sau:

```ts
    /**
     * Localhost-only port `bot:watch` listens on for on-demand scrape
     * requests, so `bot:scrape` can delegate to an already-running
     * `bot:watch` instead of opening its own competing CDP connection —
     * see history/watch.ts's control server and index.ts's delegate-or-
     * run-standalone logic. Never bound to anything but 127.0.0.1.
     */
    watchControlPort: 8765,
```

- [ ] **Step 3: Typecheck và test**

Run: `npm run typecheck`
Expected: không lỗi. Nếu báo còn chỗ nào dùng `watchControlPort` hoặc các import đã bỏ, chạy `grep -rn "watchControlPort" --include=*.ts . | grep -v node_modules` và sửa cho hết (sau Task 4, `index.ts` không còn dùng nó).
Run: `npm test` → PASS toàn bộ.

- [ ] **Step 4: Commit**

```bash
git add history/watch.ts watch.ts config.ts
git commit -m "feat(watch): bot:watch only enqueues targets with new activity"
```

---

### Task 6: Cập nhật tài liệu và kiểm thử thủ công với Zalo Desktop

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

**Interfaces:** không.

- [ ] **Step 1: Cập nhật `README.md`**

Áp dụng lần lượt các thay thế sau (mỗi chuỗi cũ khớp nguyên văn trong file):

1. Bảng tính năng: thay hai dòng bảng `Quét theo lịch` và `Theo dõi thời gian thực` bằng:

```markdown
| Quét theo hàng chờ | `npm run bot:scrape` | Chạy tay: đọc hàng chờ `data/.scrape-queue.json`, chỉ mở các nhóm đang có trong đó, cuộn lấy lịch sử theo khung giờ cấu hình, rồi xóa các nhóm vừa xử lý khỏi hàng chờ và thoát. Hàng chờ rỗng thì thoát ngay, không đụng Zalo Desktop. |
| Theo dõi thời gian thực | `npm run bot:watch` | Đứng chạy liên tục, **chỉ phát hiện** nhóm nào có tin mới (WebSocket nội bộ của Zalo Desktop — xem `history/realtimeListener.ts` — và popup thông báo) rồi ghi tên nhóm vào hàng chờ. Không cào, không ghi `data/`. |
```

2. Đoạn văn ngay dưới bảng (từ `Cả 2 chế độ quét đều ghi vào cùng 1 kho` đến hết `thực](#chế-độ-theo-dõi-thời-gian-thực-watch).`) thay bằng:

```markdown
Chỉ `bot:scrape` ghi vào kho `data/<groupId>.json` (1 file JSON dạng mảng cho
mỗi cuộc trò chuyện, dedupe theo `msgId`). `bot:watch` và `bot:scrape` phối hợp
qua **hàng chờ** `data/.scrape-queue.json` (danh sách tên nhóm, không trùng):
`bot:watch` thêm vào, `bot:scrape` đọc, cào đúng các nhóm đó rồi xóa đúng các
nhóm vừa xử lý (nhóm được thêm trong lúc đang cào vẫn còn). Vì `bot:watch`
không bao giờ điều khiển giao diện Zalo Desktop nên chạy song song 2 script là
an toàn — xem mục [Hàng chờ giữa `bot:watch` và
`bot:scrape`](#hàng-chờ-giữa-botwatch-và-botscrape).
```

3. Đầu mục `### Chế độ theo dõi thời gian thực (`watch`)`: thay đoạn từ `` `npm run bot:watch` đứng chạy liên tục và phản ứng ngay khi có tin mới, từ `` đến hết dòng `theo nguồn nào kích hoạt:` bằng:

```markdown
`npm run bot:watch` đứng chạy liên tục và phát hiện ngay khi có tin mới, từ
**2 nguồn** độc lập (`history/watch.ts`); mỗi lần phát hiện chỉ ghi tên nhóm
vào hàng chờ (không mở giao diện, không cào, không lưu tin):
```

4. Trong nguồn #1, thay `(qua `bot:scrape` hoặc nguồn #2/#3 dưới đây)` bằng `(qua `bot:scrape`)`, và thay `rồi kích hoạt quét đúng nhóm đó — kể cả khi` bằng `rồi đưa đúng nhóm đó vào hàng chờ — kể cả khi`.

5. Xóa nguyên mục nguồn `3. **Observer trong nhóm đang mở (dự phòng)** ...` (từ dòng bắt đầu bằng `3. **Observer trong nhóm đang mở` đến hết câu `không bị lẫn vào nhóm trước đó.`).

6. Thay toàn bộ mục `### Chạy song song `bot:scrape` và `bot:watch`` (từ tiêu đề đến hết khối `> [!NOTE]` đầu tiên kết thúc bằng `tại một thời điểm.`) bằng:

```markdown
### Hàng chờ giữa `bot:watch` và `bot:scrape`

- File: `data/.scrape-queue.json` — mảng JSON tên nhóm đúng như `config.targets`, không trùng. Ghi nguyên tử (file tạm rồi đổi tên).
- `bot:watch` chỉ **thêm** tên nhóm khi phát hiện tin mới. Không bao giờ chạm vào giao diện Zalo Desktop.
- `bot:scrape` (chạy tay hoặc do skill gọi) chụp lại hàng chờ, cào đúng các nhóm đó rồi xóa đúng các nhóm vừa xử lý; nhóm `bot:watch` thêm trong lúc đang cào vẫn còn cho lần sau. Hàng chờ rỗng: thoát ngay, in `hàng chờ rỗng`.
- Nhóm lỗi hoặc không có tin vẫn bị xóa khỏi hàng chờ và được ghi log; nếu không kết nối được Zalo Desktop thì không xóa gì.
- Vì chỉ `bot:scrape` điều khiển giao diện nên không còn nguy cơ 2 tiến trình cùng click/cuộn 1 cửa sổ Zalo.
```

7. Mục `## Sử dụng`: thay hai dòng `npm run bot:scrape          # quét 1 lần theo config.targets` và `npm run bot:watch           # theo dõi liên tục, phản ứng theo thông báo` bằng:

```bash
npm run bot:scrape          # cào các nhóm đang trong hàng chờ (rỗng thì thoát ngay)
npm run bot:watch           # theo dõi liên tục, chỉ đưa nhóm có tin mới vào hàng chờ
```

- [ ] **Step 2: Cập nhật `CLAUDE.md`**

1. Trong khối `## Commands`, thay hai dòng `npx tsx index.ts ... # one-shot scrape (npm run bot:scrape)` và `npm run bot:watch ... # long-running, reacts to notifications in real time` bằng:

```bash
npx tsx index.ts                              # manual scrape of the queued targets only (npm run bot:scrape); empty queue exits at once
npm run bot:watch                              # long-running detector: enqueues targets with new messages into data/.scrape-queue.json, never scrapes
```

2. Thay đoạn `**Running `bot:scrape` and `bot:watch` at the same time is safe** — ... See README "Chạy song song `bot:scrape` và `bot:watch`".` (cả đoạn văn 6 dòng) bằng:

```markdown
**`bot:watch` and `bot:scrape` cooperate through a queue, not by running the same UI code.**
`bot:watch` only appends target names to `data/.scrape-queue.json` (see
`history/scrapeQueue.ts`); `bot:scrape` (`index.ts`, manual) snapshots that
queue, scrapes exactly those targets, then removes exactly those entries
(`history/queueRun.ts`) — a target queued mid-scrape stays. `bot:watch` never
drives Zalo Desktop's UI, so running both at once is safe. See README "Hàng chờ
giữa `bot:watch` và `bot:scrape`".
```

3. Trong `## Architecture`: thay hai bullet `**`index.ts`** — one-shot: ...` và `**`watch.ts`** — long-running: ...` bằng:

```markdown
- **`index.ts`** — manual, queue-driven: read the scrape queue, scrape only those conversations, clear the ones handled, exit. Nothing runs on a schedule.
- **`watch.ts`** — long-running detector, never scrapes: reacts to new messages from two independent sources (see `history/watch.ts`) — Zalo Desktop's own WebSocket connection to its chat backend (`history/realtimeListener.ts`, primary) and its toast-notification popup window (fallback) — and only enqueues the affected target via `history/scrapeQueue.ts`. Always restarts Zalo Desktop on startup so the WS source can observe its one-time cipher-key handshake.
```

và đổi câu `Both funnel through:` thành `Both share:` (nếu tệp có câu này).

- [ ] **Step 3: Kiểm thử thủ công với Zalo Desktop (theo spec, mục Testing plan)**

Cần Zalo Desktop đăng nhập sẵn và ít nhất một nhóm trong `config.targets`.

1. Xóa `data/.scrape-queue.json` nếu có. Chạy `npm run bot:watch`, gửi một tin nhắn vào một nhóm trong `config.targets` từ tài khoản khác. Expected: log `[watch] queued "<tên nhóm>"`; `data/.scrape-queue.json` chứa đúng tên nhóm đó; `data/<groupId>.json` **không** đổi (kiểm tra thời gian sửa file).
2. Gửi thêm vài tin vào cùng nhóm. Expected: hàng chờ vẫn chỉ có 1 mục cho nhóm đó.
3. Trong khi `bot:watch` còn chạy, chạy `npm run bot:scrape` ở terminal khác. Expected: chỉ cào nhóm trong hàng chờ; xong thì `data/.scrape-queue.json` là `[]`; `data/<groupId>.json` có tin mới.
4. Đưa vào hàng chờ hai nhóm, chạy `npm run bot:scrape`, và trong lúc đang cào gửi tin vào một nhóm thứ ba chưa có trong hàng chờ. Expected: sau khi xong, hàng chờ chỉ còn nhóm thứ ba.
5. Chạy `npm run bot:scrape` khi hàng chờ rỗng. Expected: in `hàng chờ rỗng`, thoát ngay, Zalo Desktop không bị mở/khởi động lại.
6. Thêm tên một nhóm không tồn tại vào hàng chờ (sửa tay file), chạy `npm run bot:scrape`. Expected: log `sidebar item ... not found` và `lỗi, đã bỏ khỏi hàng chờ`; các nhóm khác vẫn được cào; tiến trình không treo.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: describe the watch -> queue -> scrape flow"
```

---

## Self-Review

**Spec coverage** (`2026-09-23-watch-scrape-queue-handoff-design.md` + phần bổ sung)
- Queue file, định dạng, tập hợp không trùng, ghi nguyên tử, không giới hạn → Task 2.
- `bot:watch` không chạm UI, không ghi `data/<groupId>.json`, bỏ control server/debounce/live observer/lưu ảnh WS/`waitForSidebarLoaded`, thêm `enqueueTarget` → Task 5.
- `bot:scrape` thủ công, đọc hàng chờ, cào đúng các nhóm đó, xóa có chọn lọc (giữ nhóm thêm giữa chừng), rỗng thì thoát ngay → Task 4.
- `runScrape` nhận danh sách nhóm → Task 4.
- Sửa lỗi vòng lặp vô hạn hội thoại rỗng (Risk 4) → Task 3.
- `listThreads` bỏ dot-file (phần bổ sung) → Task 1.
- Chính sách lỗi từng nhóm và lỗi toàn cục (Risk 3 + bổ sung) → Task 4 (`runQueuedScrape`, `runScrape`).
- Bỏ `watchControlPort` khỏi `config.ts`; cập nhật README/CLAUDE.md → Task 5, Task 6. `history/exportExcelCli.ts` được liệt kê trong spec để "cập nhật tham chiếu tới control server": đã kiểm tra bằng `grep`, file này không nhắc control server nên không cần sửa.
- Kế hoạch kiểm thử của spec (5 kịch bản) → Task 6 Step 3 (kịch bản 1–5) cộng thêm kịch bản nhóm lỗi.
- Risk 1 (mất URL ảnh thật) làm đúng theo spec (bỏ khối lưu ảnh), nêu rõ ở Task 5 để người dùng xác nhận lại.

**Placeholder scan:** không có TBD/TODO; các thay thế README/CLAUDE.md có chuỗi cũ và mới đầy đủ.

**Type consistency:** `TargetOutcome` định nghĩa ở `history/desktopScraper.ts` và được `queueRun.ts` import; `QueueRunDeps.scrape` trả `Promise<TargetOutcome[]>` khớp với `runScrape`; `readQueue`/`removeFromQueue`/`enqueueTarget` dùng cùng chữ ký ở Task 2, 4, 5.

**Review Focus:** mục 1 → Task 1; mục 2 → test "corrupt file" ở Task 2; mục 3 → test "queued while scraping" ở Task 2 và Task 4; mục 4 → Task 3; mục 5 → test cuối và test "failed target" ở Task 4.
