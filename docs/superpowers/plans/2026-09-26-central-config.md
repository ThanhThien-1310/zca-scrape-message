# Central Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom mọi thông số chỉnh được (thời gian chờ của runner, nhịp tim, giờ chia buổi, giới hạn chat...) vào `config.ts`, chia 8 mục có ghi chú ý nghĩa và ví dụ; giá trị sai bị từ chối khi khởi động; `npm run config:show` in cấu hình. Mặc định giữ đúng như hiện tại.

**Architecture:** `config.ts` được mở rộng (giữ mọi khóa cũ) với các đối tượng mới `watch`, `runner`, `recovery`, `chat`, `sessions`. `configCheck.ts` kiểm giá trị (hàm thuần, `config.ts` gọi khi nạp). `configDoc.ts` là bảng mô tả từng thông số (mục, đơn vị, mặc định, bot nào đọc, ghi chú) và `formatConfig` in ra; `configShow.ts` là lệnh. Các module thay hằng số ghi cứng bằng giá trị tính từ `config`; tên hằng đang được test dùng vẫn được xuất.

**Tech Stack:** Node ≥22, TypeScript chạy bằng `tsx`, `node:test`, ESM (`.js` khi import), thụt lề 4 dấu cách. Không thêm thư viện.

**Spec:** `docs/superpowers/specs/2026-09-26-central-config-design.md`

## Global Constraints

- `config.ts` là tệp CRLF trong cây làm việc: khi ghi lại phải giữ CRLF (Task 2 có bước chuyển). Mọi tệp khác dùng LF (đã kiểm bằng `git ls-files --eol`).
- Không thêm phụ thuộc vào `package.json`; không đổi tên hay chuyển khóa cũ của `config` (`cdpPort`, `cdpUrl`, `zaloExePath`, `autoLaunchZalo`, `dataDir`, `targets`, `recoveryIgnoreTargets`, `sinceTs`, `untilTs`, `targetMessageCount`, `scrollDelayMs`).
- Giá trị mặc định (giữ đúng hiện tại): `watch.heartbeatSeconds 30`, `watch.deadAfterSeconds 90`, `watch.minBlindSeconds 60`; `runner.quietSeconds 120`, `maxWaitSeconds 600`, `pollSeconds 5`, `dirtyCheckSeconds 60`, `dirtyRetrySeconds 300`, `watchWarmupSeconds 90`, `maxConsecutiveFailures 3`; `recovery.marginMinutes 5`; `chat.pollSeconds 3`, `heartbeatSeconds 30`, `skipBackoffSeconds 45`, `sentLedgerMinutes 10`, `echoWindowSeconds 120`; `sessions.chieuFromHour 12`, `toiFromHour 18`.
- Không gom: mã giao thức Zalo (`CMD_...`), `VN_OFFSET_MS`, `DAY_MS`, `GROUP_NAME_MAX`, `chat-rules.json`.
- Không chạy `bot:watch`, `bot:runner`, `bot:chat`, hay bất cứ thứ gì chạm vào Zalo Desktop trong lúc thực hiện kế hoạch này.
- Chỉ stage các tệp của kế hoạch này. Mọi commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Sau mỗi task chạy `npm test` và `npm run typecheck` ở `zca-scrape-message/`. Hiện tại có 263 test đạt.

## Review Focus

1. **Gom xong hành vi mặc định phải y như cũ.** Test ghim các số mặc định (Task 3) và `npm run config:show` không được có dấu `*` nào (Task 7).
2. **Giá trị sai phải dừng bot với thông báo rõ, không chạy sai âm thầm**: `quietSeconds` bằng hoặc lớn hơn `maxWaitSeconds`, số âm hoặc không nguyên, giờ buổi không tăng dần. Test ở Task 1.
3. **Mọi khóa của `config` đều có ghi chú** trong bảng mô tả và ngược lại (không khóa mồ côi). Test ở Task 3.
4. **Giờ chia buổi**: `sessionOf` và `sessionWindow` không bao giờ mâu thuẫn nhau, kể cả khi đổi `toiFromHour` thành 17 (ranh giới 16:59/17:00). Test ở Task 6.
5. **Giá trị trong config thật sự được các module dùng** (không còn hằng số ghi cứng bỏ sót): test dùng tiến trình con đổi giá trị rồi đọc lại hằng số ở Task 4, 5, 6.

## File Structure

| Tệp | Việc |
|---|---|
| `configCheck.ts` (mới) | `validateConfig(cfg)`: kiểm giá trị, ném lỗi có tên khóa, trả về cảnh báo |
| `config.ts` (viết lại, CRLF) | 8 mục có ghi chú; gọi `validateConfig` khi nạp |
| `configDoc.ts` (mới) | Bảng `SETTINGS` và `formatConfig` |
| `configShow.ts` (mới) | Lệnh `npm run config:show` |
| `history/watchState.ts`, `runner/schedule.ts`, `runner/runnerState.ts`, `lesson/recoveryRun.ts`, `bot-runner.ts` | Dùng `config.watch` / `config.runner` / `config.recovery` |
| `chat/timing.ts` (mới), `chat/cycle.ts`, `chat/state.ts`, `bot-chat.ts` | Dùng `config.chat` |
| `lesson/time.ts`, `lesson/recovery.ts` | Dùng `config.sessions`; hàm nhận tham số giờ tùy chọn |
| `package.json`, `README.md`, `CLAUDE.md`, `docs/GUIDE.md` | Lệnh mới và tài liệu |

## Interfaces (tổng hợp)

```ts
// configCheck.ts
export interface ConfigShape { targets: string[]; recoveryIgnoreTargets: string[]; targetMessageCount: number; scrollDelayMs: { min: number; max: number }; watch: {...}; runner: {...}; recovery: { marginMinutes: number }; chat: {...}; sessions: { chieuFromHour: number; toiFromHour: number } }
export function validateConfig(cfg: ConfigShape): string[]; // returns warnings, throws Error listing every problem

// configDoc.ts
export interface Setting { section: string; path: string; unit: string; default?: unknown; defaultLabel?: string; readers: string[]; note: string; format?: (value: unknown) => string }
export const SECTIONS: string[]; export const SETTINGS: Setting[];
export function formatConfig(cfg: object, settings?: Setting[]): string[];

// lesson/time.ts, lesson/recovery.ts
export interface SessionHours { chieuFromHour: number; toiFromHour: number }
export function sessionOf(ts: number, hours?: SessionHours): Buoi;
export function currentSession(now?: number, hours?: SessionHours): Buoi;
export function sessionWindow(day: string, buoi: Buoi, hours?: SessionHours): Window;
```

---

### Task 1: Kiểm tra giá trị `configCheck.ts`

**Files:**
- Create: `configCheck.ts`
- Test: `tests/configCheck.test.ts`

**Interfaces:**
- Consumes: không có.
- Produces: `ConfigShape`, `validateConfig(cfg): string[]`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/configCheck.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, type ConfigShape } from "../configCheck.js";

const good = (): ConfigShape => ({
    targets: ["bot test", "LC_HoaSen1_TĐ"],
    recoveryIgnoreTargets: ["bot test"],
    targetMessageCount: 2000,
    scrollDelayMs: { min: 500, max: 1200 },
    watch: { heartbeatSeconds: 30, deadAfterSeconds: 90, minBlindSeconds: 60 },
    runner: { quietSeconds: 120, maxWaitSeconds: 600, pollSeconds: 5, dirtyCheckSeconds: 60, dirtyRetrySeconds: 300, watchWarmupSeconds: 90, maxConsecutiveFailures: 3 },
    recovery: { marginMinutes: 5 },
    chat: { pollSeconds: 3, heartbeatSeconds: 30, skipBackoffSeconds: 45, sentLedgerMinutes: 10, echoWindowSeconds: 120 },
    sessions: { chieuFromHour: 12, toiFromHour: 18 },
});
const bad = (mutate: (c: ConfigShape) => void) => {
    const c = good();
    mutate(c);
    return () => validateConfig(c);
};

test("the default values are valid and produce no warning", () => {
    assert.deepEqual(validateConfig(good()), []);
});

test("every seconds/minutes value must be a positive whole number, and the error names the key", () => {
    assert.throws(bad((c) => (c.runner.quietSeconds = 0)), /runner\.quietSeconds/);
    assert.throws(bad((c) => (c.runner.pollSeconds = -5)), /runner\.pollSeconds/);
    assert.throws(bad((c) => (c.watch.heartbeatSeconds = 1.5)), /watch\.heartbeatSeconds/);
    assert.throws(bad((c) => (c.recovery.marginMinutes = Number.NaN)), /recovery\.marginMinutes/);
    assert.throws(bad((c) => (c.chat.skipBackoffSeconds = "45" as unknown as number)), /chat\.skipBackoffSeconds/);
    assert.throws(bad((c) => (c.runner.maxConsecutiveFailures = 0)), /runner\.maxConsecutiveFailures/);
    assert.throws(bad((c) => (c.targetMessageCount = 0)), /targetMessageCount/);
});

test("quietSeconds may equal maxWaitSeconds but not exceed it", () => {
    assert.deepEqual(bad((c) => (c.runner.quietSeconds = 600))(), []);
    assert.throws(bad((c) => (c.runner.quietSeconds = 601)), /quietSeconds.*maxWaitSeconds/);
});

test("a watcher is declared dead only after at least two missed beats; fewer than three is only a warning", () => {
    assert.throws(bad((c) => (c.watch.deadAfterSeconds = 45)), /deadAfterSeconds/);
    const warnings = bad((c) => (c.watch.deadAfterSeconds = 60))();
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /deadAfterSeconds/);
});

test("the sent-reply ledger must outlive the echo window", () => {
    assert.throws(bad((c) => ((c.chat.sentLedgerMinutes = 1), (c.chat.echoWindowSeconds = 120))), /sentLedgerMinutes.*echoWindowSeconds/);
    assert.deepEqual(bad((c) => ((c.chat.sentLedgerMinutes = 3), (c.chat.echoWindowSeconds = 120)))(), []);
});

test("session hours must satisfy 0 < chieuFromHour < toiFromHour <= 23", () => {
    assert.throws(bad((c) => (c.sessions.chieuFromHour = 0)), /chieuFromHour/);
    assert.throws(bad((c) => ((c.sessions.chieuFromHour = 18), (c.sessions.toiFromHour = 18))), /toiFromHour/);
    assert.throws(bad((c) => (c.sessions.toiFromHour = 24)), /toiFromHour/);
    assert.throws(bad((c) => (c.sessions.chieuFromHour = 11.5)), /chieuFromHour/);
    assert.deepEqual(bad((c) => (c.sessions.toiFromHour = 17))(), []);
});

test("scroll delay: both non-negative and min <= max", () => {
    assert.throws(bad((c) => (c.scrollDelayMs.min = 2000)), /scrollDelayMs/);
    assert.throws(bad((c) => (c.scrollDelayMs.min = -1)), /scrollDelayMs/);
    assert.deepEqual(bad((c) => ((c.scrollDelayMs.min = 800), (c.scrollDelayMs.max = 800)))(), []);
});

test("targets: not empty, no duplicates; recoveryIgnoreTargets must be among them", () => {
    assert.throws(bad((c) => (c.targets = [])), /targets/);
    assert.throws(bad((c) => (c.targets = ["A", "A"])), /trùng/);
    assert.throws(bad((c) => (c.recoveryIgnoreTargets = ["Nhóm lạ"])), /recoveryIgnoreTargets.*Nhóm lạ/);
});

test("every problem is reported at once", () => {
    const fn = bad((c) => {
        c.runner.quietSeconds = 0;
        c.sessions.toiFromHour = 30;
        c.targets = [];
    });
    assert.throws(fn, (e: Error) => /quietSeconds/.test(e.message) && /toiFromHour/.test(e.message) && /targets/.test(e.message));
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/configCheck.test.ts`
Expected: FAIL, không tìm thấy module `../configCheck.js`.

- [ ] **Step 3: Viết cài đặt**

Tạo `configCheck.ts`:

```ts
/** Phần của `config` mà việc kiểm tra cần; `config.ts` thỏa mãn cấu trúc này. */
export interface ConfigShape {
    targets: string[];
    recoveryIgnoreTargets: string[];
    targetMessageCount: number;
    scrollDelayMs: { min: number; max: number };
    watch: { heartbeatSeconds: number; deadAfterSeconds: number; minBlindSeconds: number };
    runner: {
        quietSeconds: number;
        maxWaitSeconds: number;
        pollSeconds: number;
        dirtyCheckSeconds: number;
        dirtyRetrySeconds: number;
        watchWarmupSeconds: number;
        maxConsecutiveFailures: number;
    };
    recovery: { marginMinutes: number };
    chat: { pollSeconds: number; heartbeatSeconds: number; skipBackoffSeconds: number; sentLedgerMinutes: number; echoWindowSeconds: number };
    sessions: { chieuFromHour: number; toiFromHour: number };
}

const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/**
 * Kiểm chặt các giá trị; mọi lỗi được gom lại và ném MỘT lần (bot không khởi động). Trả về danh sách cảnh báo
 * (giá trị hợp lệ nhưng đáng ngờ) để nơi gọi in ra.
 */
export function validateConfig(cfg: ConfigShape): string[] {
    const errors: string[] = [];
    const warnings: string[] = [];

    const positive: Array<[string, unknown]> = [
        ["targetMessageCount", cfg.targetMessageCount],
        ["watch.heartbeatSeconds", cfg.watch.heartbeatSeconds],
        ["watch.deadAfterSeconds", cfg.watch.deadAfterSeconds],
        ["watch.minBlindSeconds", cfg.watch.minBlindSeconds],
        ["runner.quietSeconds", cfg.runner.quietSeconds],
        ["runner.maxWaitSeconds", cfg.runner.maxWaitSeconds],
        ["runner.pollSeconds", cfg.runner.pollSeconds],
        ["runner.dirtyCheckSeconds", cfg.runner.dirtyCheckSeconds],
        ["runner.dirtyRetrySeconds", cfg.runner.dirtyRetrySeconds],
        ["runner.watchWarmupSeconds", cfg.runner.watchWarmupSeconds],
        ["runner.maxConsecutiveFailures", cfg.runner.maxConsecutiveFailures],
        ["recovery.marginMinutes", cfg.recovery.marginMinutes],
        ["chat.pollSeconds", cfg.chat.pollSeconds],
        ["chat.heartbeatSeconds", cfg.chat.heartbeatSeconds],
        ["chat.skipBackoffSeconds", cfg.chat.skipBackoffSeconds],
        ["chat.sentLedgerMinutes", cfg.chat.sentLedgerMinutes],
        ["chat.echoWindowSeconds", cfg.chat.echoWindowSeconds],
    ];
    for (const [key, value] of positive) if (!isPositiveInt(value)) errors.push(`${key} phải là số nguyên dương (đang là ${JSON.stringify(value)}).`);

    if (isPositiveInt(cfg.runner.quietSeconds) && isPositiveInt(cfg.runner.maxWaitSeconds) && cfg.runner.quietSeconds > cfg.runner.maxWaitSeconds) {
        errors.push(`runner.quietSeconds (${cfg.runner.quietSeconds}) không được lớn hơn runner.maxWaitSeconds (${cfg.runner.maxWaitSeconds}).`);
    }

    if (isPositiveInt(cfg.watch.heartbeatSeconds) && isPositiveInt(cfg.watch.deadAfterSeconds)) {
        if (cfg.watch.deadAfterSeconds < 2 * cfg.watch.heartbeatSeconds) {
            errors.push(`watch.deadAfterSeconds (${cfg.watch.deadAfterSeconds}) phải ít nhất gấp 2 lần watch.heartbeatSeconds (${cfg.watch.heartbeatSeconds}), nếu không một nhịp tim trễ cũng bị coi là chết.`);
        } else if (cfg.watch.deadAfterSeconds < 3 * cfg.watch.heartbeatSeconds) {
            warnings.push(`watch.deadAfterSeconds (${cfg.watch.deadAfterSeconds}) nhỏ hơn 3 lần watch.heartbeatSeconds (${cfg.watch.heartbeatSeconds}): chỉ chịu được một nhịp tim trễ.`);
        }
    }

    if (isPositiveInt(cfg.chat.sentLedgerMinutes) && isPositiveInt(cfg.chat.echoWindowSeconds) && cfg.chat.sentLedgerMinutes * 60 <= cfg.chat.echoWindowSeconds) {
        errors.push(`chat.sentLedgerMinutes (${cfg.chat.sentLedgerMinutes} phút) phải dài hơn chat.echoWindowSeconds (${cfg.chat.echoWindowSeconds} giây).`);
    }

    const { chieuFromHour, toiFromHour } = cfg.sessions;
    if (!Number.isInteger(chieuFromHour) || chieuFromHour <= 0) errors.push(`sessions.chieuFromHour phải là số nguyên lớn hơn 0 (đang là ${JSON.stringify(chieuFromHour)}).`);
    if (!Number.isInteger(toiFromHour) || toiFromHour > 23 || toiFromHour <= chieuFromHour) {
        errors.push(`sessions.toiFromHour phải là số nguyên lớn hơn chieuFromHour (${chieuFromHour}) và không quá 23 (đang là ${JSON.stringify(toiFromHour)}).`);
    }

    const { min, max } = cfg.scrollDelayMs;
    if (typeof min !== "number" || typeof max !== "number" || min < 0 || max < 0 || min > max) errors.push(`scrollDelayMs phải có 0 <= min <= max (đang là ${JSON.stringify(cfg.scrollDelayMs)}).`);

    if (cfg.targets.length === 0) errors.push("targets không được rỗng.");
    const seen = new Set<string>();
    for (const t of cfg.targets) {
        if (seen.has(t)) errors.push(`targets có tên trùng: "${t}".`);
        seen.add(t);
    }
    for (const t of cfg.recoveryIgnoreTargets) if (!cfg.targets.includes(t)) errors.push(`recoveryIgnoreTargets có "${t}" không nằm trong targets.`);

    if (errors.length > 0) throw new Error(`config.ts không hợp lệ:\n- ${errors.join("\n- ")}`);
    return warnings;
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/configCheck.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Typecheck, toàn bộ test, commit**

Run: `npm run typecheck` rồi `npm test`. Expected: đạt.

```bash
git add configCheck.ts tests/configCheck.test.ts
git commit -m "feat(config): validate config values with clear per-key errors" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Viết lại `config.ts` thành 8 mục có ghi chú

**Files:**
- Modify (viết lại): `config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Consumes: `validateConfig` (Task 1).
- Produces: `config` với các khóa cũ (giữ nguyên) và `config.watch`, `config.runner`, `config.recovery`, `config.chat`, `config.sessions`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/config.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";

test("the old keys are all still there with the same types", () => {
    assert.equal(typeof config.cdpPort, "number");
    assert.equal(config.cdpUrl, `http://127.0.0.1:${config.cdpPort}`);
    assert.equal(typeof config.autoLaunchZalo, "boolean");
    assert.equal(typeof config.dataDir, "string");
    assert.ok(Array.isArray(config.targets) && config.targets.length > 0);
    assert.ok(Array.isArray(config.recoveryIgnoreTargets));
    assert.ok(config.sinceTs === null || typeof config.sinceTs === "number");
    assert.ok(config.untilTs === null || typeof config.untilTs === "number");
    assert.equal(typeof config.targetMessageCount, "number");
    assert.equal(typeof config.scrollDelayMs.min, "number");
    assert.equal(typeof config.scrollDelayMs.max, "number");
});

test("the new sections exist and hold numbers", () => {
    for (const section of [config.watch, config.runner, config.recovery, config.chat, config.sessions]) {
        assert.ok(Object.keys(section).length > 0);
        for (const value of Object.values(section)) assert.equal(typeof value, "number");
    }
    for (const key of ["quietSeconds", "maxWaitSeconds", "pollSeconds", "dirtyCheckSeconds", "dirtyRetrySeconds", "watchWarmupSeconds", "maxConsecutiveFailures"]) {
        assert.equal(typeof (config.runner as Record<string, unknown>)[key], "number", key);
    }
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/config.test.ts`
Expected: FAIL, `config.watch` là `undefined` (TypeError khi đọc `Object.keys`).

- [ ] **Step 3: Viết `config.ts` mới**

Ghi đè `config.ts` bằng nội dung sau (giữ hai hàm `todayAt` và `findZaloExe` như cũ):

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "./configCheck.js";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/** Unix ms for today at the given local hour:minute. */
function todayAt(hour: number, minute: number): number {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
}

/**
 * Zalo Desktop installs as C:\Users\<you>\AppData\Local\Programs\Zalo\Zalo-<version>\Zalo.exe
 * — the version segment changes on every auto-update, so this picks the
 * newest Zalo-* folder instead of hardcoding a version.
 */
function findZaloExe(): string | null {
    const programsDir = path.join(os.homedir(), "AppData", "Local", "Programs", "Zalo");
    if (!fs.existsSync(programsDir)) return null;

    const versionDirs = fs
        .readdirSync(programsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith("Zalo-"))
        .map((d) => d.name)
        .sort();
    const newest = versionDirs.at(-1);
    if (!newest) return null;

    const exePath = path.join(programsDir, newest, "Zalo.exe");
    return fs.existsSync(exePath) ? exePath : null;
}

/**
 * ĐÂY LÀ FILE DUY NHẤT CẦN SỬA để chỉnh cách các bot chạy. Chia 8 mục; mỗi thông số có ghi chú ý nghĩa, đơn vị và ví dụ.
 * Đổi giá trị xong thì KHỞI ĐỘNG LẠI bot liên quan (bot chỉ đọc file này lúc khởi động).
 * Xem toàn bộ giá trị hiện tại (khóa khác mặc định có dấu *): `npm run config:show`.
 * Giá trị sai bị từ chối khi khởi động, kèm tên khóa sai (xem configCheck.ts).
 */
export const config = {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. ZALO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Cổng gỡ lỗi (Chrome DevTools) mà Zalo Desktop được mở ra để bot điều khiển.
     * Đổi khi cổng này bị chương trình khác chiếm. Ví dụ: 9333 thì Zalo được mở với --remote-debugging-port=9333.
     * Đọc bởi: mọi bot.
     */
    cdpPort: 9222,

    /** Địa chỉ suy ra từ cdpPort — http://127.0.0.1:<cdpPort>. Không sửa. */
    get cdpUrl(): string {
        return `http://127.0.0.1:${this.cdpPort}`;
    },

    /**
     * Đường dẫn Zalo.exe, tự dò (thư mục Zalo-<phiên bản> mới nhất). Chỉ đặt tay khi tự dò sai,
     * ví dụ "C:\\Users\\Admin\\AppData\\Local\\Programs\\Zalo\\Zalo-25.1.1\\Zalo.exe".
     * Zalo Desktop dựa trên Electron nên DOM đọc được qua CDP như trình duyệt; bot dùng lại phiên đăng nhập đang có,
     * không có bước quét QR nào.
     */
    zaloExePath: findZaloExe(),

    /**
     * Nếu Zalo chưa chạy với cổng gỡ lỗi thì tự tắt và mở lại. Cần cho chạy tự động không người trông; phiên đăng nhập
     * không mất vì cùng hồ sơ cục bộ. Đặt false nếu bạn muốn tự mở Zalo (bot sẽ báo lỗi thay vì mở lại giúp).
     */
    autoLaunchZalo: true,

    /** Nơi lưu tin đã cào (mỗi nhóm một file JSON) và các tệp trạng thái của bot. */
    dataDir: path.join(repoRoot, "data"),

    // ═══════════════════════════════════════════════════════════════════════
    // 2. NHÓM THEO DÕI
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Tên nhóm ĐÚNG NHƯ HIỆN Ở THANH BÊN Zalo. Chỉ nhóm nằm ở đây mới được theo dõi, cào và (nếu có trong
     * chat-rules.json) trả lời. Ví dụ thêm một nhóm: ["bot test", "LC_HoaSen1_TĐ", "LC_MoiThem_Q1"].
     * Đổi tên nhóm trong Zalo thì phải sửa ở đây. Không được trùng tên.
     */
    targets: ["bot test", "LC_ChuVănAn_BTAN", "LC_HoaSen1_TĐ", "LC_TríTuệViệt_BTAN", "LC_QuangTrungNguyễnHuệ_Q5"] as string[],

    /**
     * Nhóm KHÔNG BAO GIỜ gửi báo cáo buổi dạy (nhóm thử). Khôi phục không coi chúng là "thiếu báo cáo" và không cào lại
     * chúng. Phải là tập con của targets. Ví dụ: ["bot test"].
     */
    recoveryIgnoreTargets: ["bot test"] as string[],

    // ═══════════════════════════════════════════════════════════════════════
    // 3. CÀO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Chỉ giữ tin từ mốc này trở đi (unix ms) và ngừng cuộn khi cuộn qua mốc.
     * Ví dụ: todayAt(0, 0) cào từ đầu ngày; todayAt(7, 30) từ 07:30; null là không giới hạn (cuộn đến targetMessageCount).
     * LƯU Ý: giá trị này chỉ được tính MỘT LẦN lúc bot khởi động, nên bot chạy qua đêm giữ mốc của ngày hôm qua
     * (bot:runner không dùng nó mà tự tính lại mỗi vòng: từ đầu ngày hôm nay).
     */
    sinceTs: todayAt(6, 0) as number | null,

    /**
     * Chỉ giữ tin đến mốc này (unix ms); chỉ là bộ lọc kết quả, không ảnh hưởng việc cuộn.
     * Ví dụ: todayAt(12, 0) để chốt đúng buổi sáng. null là đến lúc chạy.
     */
    untilTs: null as number | null,

    /**
     * Trần an toàn số tin mỗi nhóm mỗi lần cào, kể cả khi chưa chạm sinceTs. Nhóm nhắn nhiều thì tăng lên
     * (đổi lại lần cào lâu hơn).
     */
    targetMessageCount: 2000,

    /**
     * Nghỉ ngẫu nhiên giữa hai bước cuộn (mili giây) để không dồn dập vào giao diện.
     * Cách tính: trung bình (500 + 1200) / 2 = 850 ms mỗi bước, cuộn 100 bước mất khoảng 85 giây.
     * Muốn cào nhanh hơn thì giảm (nhưng dễ làm Zalo giật). Yêu cầu 0 <= min <= max.
     */
    scrollDelayMs: { min: 500, max: 1200 },

    // ═══════════════════════════════════════════════════════════════════════
    // 4. WATCH (bot:watch). heartbeatSeconds và deadAfterSeconds cũng là nhịp tim và ngưỡng "chết" mà
    //    runner:status, chat:status và việc chống chạy trùng bot:runner dùng.
    // ═══════════════════════════════════════════════════════════════════════
    watch: {
        /**
         * Bao lâu watch ghi "tôi còn sống" vào data/.watch-state.json (cũng là nhịp tim của bot:runner).
         * Nhỏ hơn thì phát hiện chết nhanh hơn nhưng ghi file nhiều hơn. Đơn vị: giây.
         */
        heartbeatSeconds: 30,

        /**
         * Quá bấy nhiêu giây không có nhịp tim thì coi bot đã chết. NÊN BẰNG ÍT NHẤT 3 LẦN heartbeatSeconds
         * (cho phép trễ 2 nhịp); dưới 2 lần bị từ chối. Ví dụ: nhịp 30 thì đặt 90. Đơn vị: giây.
         */
        deadAfterSeconds: 90,

        /**
         * Khoảng "mù" (cả hai nguồn phát hiện cùng mất) ngắn hơn bấy nhiêu giây bị coi là nhiễu lúc khởi động,
         * không ghi thành gián đoạn. Đơn vị: giây.
         */
        minBlindSeconds: 60,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 5. RUNNER (bot:runner)
    // ═══════════════════════════════════════════════════════════════════════
    runner: {
        /**
         * Hàng chờ có nhóm thì chờ YÊN LẶNG bấy nhiêu giây rồi mới cào, để gom nhiều nhóm vào một vòng. "Yên lặng" tính từ tin
         * MỚI NHẤT của nhóm nằm trong hàng chờ. Ví dụ: nhóm A nhắn lúc 08:00:00 và tin cuối 08:00:20, đặt 120 thì cào lúc 08:02:20;
         * đặt 30 thì cào lúc 08:00:50 (nhanh hơn nhưng nhiều vòng nhỏ chiếm giao diện Zalo hơn). Đơn vị: giây.
         */
        quietSeconds: 120,

        /**
         * Trần chờ tính từ lúc nhóm ĐẦU TIÊN vào hàng chờ, để nhóm nhắn liên tục không bị hoãn mãi. Ví dụ: nhóm vào hàng chờ
         * 08:00:00 và nhắn liên tục, đặt 600 thì chắc chắn cào lúc 08:10:00. PHẢI >= quietSeconds. Đơn vị: giây.
         */
        maxWaitSeconds: 600,

        /**
         * Runner xem lại hàng chờ mỗi bấy nhiêu giây. Độ trễ tối đa xấp xỉ quietSeconds + pollSeconds. Nhỏ quá thì đọc file
         * dồn dập (dễ đụng lỗi EPERM trên Windows). Đơn vị: giây.
         */
        pollSeconds: 5,

        /**
         * Bao lâu kiểm một lần xem có báo cáo đã nằm trên đĩa mà chưa dựng vào Excel (do crash hoặc cào tay). Đơn vị: giây.
         */
        dirtyCheckSeconds: 60,

        /**
         * Sau khi một buổi DỰNG LỖI, đợi bấy nhiêu giây mới thử lại (tránh chiếm giao diện liên tục). Ví dụ: 300 là thử lại
         * mỗi 5 phút. Đơn vị: giây.
         */
        dirtyRetrySeconds: 300,

        /**
         * Sau khi bot:watch khởi động (nó tắt và mở lại Zalo), runner không đụng vào Zalo trong bấy nhiêu giây. Đặt đủ lâu để
         * watch gắn xong (thường 60 đến 90 giây). Đơn vị: giây.
         */
        watchWarmupSeconds: 90,

        /**
         * Sau bấy nhiêu vòng lỗi LIÊN TIẾP (lỗi cào hoặc đồng bộ; lỗi dựng của một buổi không tính) runner ngừng tự thử và
         * báo LỖI; hàng chờ vẫn giữ nguyên, phải khởi động lại tay. Đơn vị: số vòng.
         */
        maxConsecutiveFailures: 3,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 6. KHÔI PHỤC (cào lại sau khi bot:watch từng chết)
    // ═══════════════════════════════════════════════════════════════════════
    recovery: {
        /**
         * Cào lại từ TRƯỚC lúc watch chết bấy nhiêu phút, để bắt tin đến sát lúc watch sập. Ví dụ: watch chết lúc 10:12 thì cào
         * từ 10:07 (nhưng không lùi quá đầu buổi). Đơn vị: phút.
         */
        marginMinutes: 5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 7. CHAT (bot:chat). Kịch bản trả lời nằm ở chat-rules.json, không nằm ở đây.
    // ═══════════════════════════════════════════════════════════════════════
    chat: {
        /** Bao lâu bot chat kiểm hộp thư một lần. Độ trễ trả lời tối thiểu xấp xỉ giá trị này cộng thời gian gửi. Đơn vị: giây. */
        pollSeconds: 3,

        /** Nhịp tim của bot chat (data/.chat-state.json), dùng cho chat:status. Đơn vị: giây. */
        heartbeatSeconds: 30,

        /**
         * Khi một lần gửi bị hoãn (ô soạn tin đang có chữ dở, chưa mở được nhóm), không đụng vào Zalo lại trong bấy nhiêu giây.
         * Cách tính: với maxReplyDelaySeconds là 180 trong chat-rules.json, đặt 45 cho tối đa khoảng 4 lần thử trước khi tin
         * bị bỏ vì quá hạn. Đơn vị: giây.
         */
        skipBackoffSeconds: 45,

        /** Sổ các câu bot vừa gửi được giữ bấy nhiêu phút rồi xóa (để bot:watch nhận ra tin dội lại). PHẢI dài hơn echoWindowSeconds. Đơn vị: phút. */
        sentLedgerMinutes: 10,

        /**
         * Một tin của chính tài khoản khớp một câu trong sổ, xuất hiện trong khoảng này thì được coi là tin dội lại của bot.
         * Tin cùng nội dung do người gõ sau khoảng này thì không bị nuốt. Đơn vị: giây.
         */
        echoWindowSeconds: 120,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 8. BUỔI HỌC (giờ Việt Nam). Sáng là từ 00:00 đến trước chieuFromHour.
    // ═══════════════════════════════════════════════════════════════════════
    sessions: {
        /** Giờ bắt đầu buổi chiều (0 đến 23). Ví dụ 12 nghĩa là chiều bắt đầu lúc 12:00. Đơn vị: giờ. */
        chieuFromHour: 12,

        /**
         * Giờ bắt đầu buổi tối; buổi chiều là từ chieuFromHour đến trước giờ này, buổi tối đến hết 24:00. Ví dụ đổi thành 17:
         * chiều 12:00 đến 17:00, tối từ 17:00; nhớ dời lịch chạy buổi chiều thành 17:05. Yêu cầu 0 < chieuFromHour < toiFromHour <= 23.
         * Đổi giờ chỉ ảnh hưởng dữ liệu mới; báo cáo đã dựng theo ranh giới cũ không tự dựng lại. Đơn vị: giờ.
         */
        toiFromHour: 18,
    },
};

export type BotConfig = typeof config;

for (const warning of validateConfig(config)) console.warn(`[config] ${warning}`);
```

- [ ] **Step 4: Chuyển `config.ts` sang CRLF (giữ kiểu xuống dòng cũ của tệp)**

Tạo tệp tạm `crlf-tmp.cjs` ở gốc `zca-scrape-message/`:

```js
const fs = require("fs");
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const text = fs.readFileSync("config.ts", "utf8").split(CR + LF).join(LF).split(LF).join(CR + LF);
fs.writeFileSync("config.ts", text, "utf8");
console.log("config.ts is CRLF:", text.includes(CR + LF));
```

Run: `node crlf-tmp.cjs` rồi xóa `crlf-tmp.cjs`. Expected: in `config.ts is CRLF: true`.

- [ ] **Step 5: Chạy test, typecheck, toàn bộ test**

Run: `node --import tsx --test tests/config.test.ts` → Expected: PASS, 2 test.
Run: `npm run typecheck` → Expected: không lỗi (nếu báo `Type ... is not assignable to ConfigShape` thì tên khóa trong `config.ts` lệch với `configCheck.ts`; sửa cho khớp).
Run: `npm test` → Expected: đạt (263 test cũ + 9 của Task 1 + 2 của Task 2 = 274).
Run: `git diff --stat config.ts | tail -1` → Expected: chỉ `config.ts` đổi, không có cảnh báo lỗi xuống dòng bất thường.

- [ ] **Step 6: Commit**

```bash
git add config.ts tests/config.test.ts
git commit -m "feat(config): 8 documented sections in config.ts (old keys unchanged, new watch/runner/recovery/chat/sessions)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Bảng mô tả, `formatConfig` và `npm run config:show`

**Files:**
- Create: `configDoc.ts`, `configShow.ts`
- Modify: `package.json`
- Test: `tests/configDoc.test.ts`

**Interfaces:**
- Consumes: `config` (Task 2), `validateConfig`, `ConfigShape` (Task 1).
- Produces: `Setting`, `SECTIONS`, `SETTINGS`, `formatConfig(cfg, settings?)`, lệnh `config:show`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/configDoc.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";
import { validateConfig, type ConfigShape } from "../configCheck.js";
import { formatConfig, SECTIONS, SETTINGS } from "../configDoc.js";

/** Leaf paths of `config`: scalars, arrays and `scrollDelayMs` (a {min,max} pair shown as one line). */
function leafPaths(obj: Record<string, unknown>, prefix = ""): string[] {
    const out: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (key === "cdpUrl") continue; // derived from cdpPort
        const p = prefix + key;
        if (value !== null && typeof value === "object" && !Array.isArray(value) && key !== "scrollDelayMs") out.push(...leafPaths(value as Record<string, unknown>, `${p}.`));
        else out.push(p);
    }
    return out;
}
const get = (obj: unknown, p: string): unknown => p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
const set = (obj: Record<string, unknown>, p: string, value: unknown): void => {
    const keys = p.split(".");
    let o = obj;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    o[keys.at(-1)!] = value;
};

test("every key of config has a documented entry, and every entry points at a real key", () => {
    const real = leafPaths(config as unknown as Record<string, unknown>).sort();
    const documented = SETTINGS.map((s) => s.path).sort();
    assert.deepEqual(documented, real);
});

test("every entry belongs to one of the 8 sections and names who reads it and what it means", () => {
    assert.equal(SECTIONS.length, 8);
    for (const s of SETTINGS) {
        assert.ok(SECTIONS.includes(s.section), `${s.path}: unknown section ${s.section}`);
        assert.ok(s.readers.length > 0, `${s.path}: readers`);
        assert.ok(s.note.length > 10, `${s.path}: note`);
        assert.ok(s.unit !== undefined, `${s.path}: unit`);
    }
});

test("the documented defaults are exactly what the code used before the config was centralised", () => {
    const pinned: Record<string, number> = {
        "watch.heartbeatSeconds": 30, "watch.deadAfterSeconds": 90, "watch.minBlindSeconds": 60,
        "runner.quietSeconds": 120, "runner.maxWaitSeconds": 600, "runner.pollSeconds": 5, "runner.dirtyCheckSeconds": 60,
        "runner.dirtyRetrySeconds": 300, "runner.watchWarmupSeconds": 90, "runner.maxConsecutiveFailures": 3,
        "recovery.marginMinutes": 5,
        "chat.pollSeconds": 3, "chat.heartbeatSeconds": 30, "chat.skipBackoffSeconds": 45, "chat.sentLedgerMinutes": 10, "chat.echoWindowSeconds": 120,
        "sessions.chieuFromHour": 12, "sessions.toiFromHour": 18,
        "targetMessageCount": 2000,
    };
    for (const [path, value] of Object.entries(pinned)) assert.equal(SETTINGS.find((s) => s.path === path)?.default, value, path);
    assert.deepEqual(SETTINGS.find((s) => s.path === "scrollDelayMs")?.default, { min: 500, max: 1200 });
});

test("the documented defaults together form a valid config", () => {
    const cfg: Record<string, unknown> = { targets: ["a", "bot test"], recoveryIgnoreTargets: ["bot test"] };
    for (const s of SETTINGS) if (s.default !== undefined) set(cfg, s.path, s.default);
    assert.deepEqual(validateConfig(cfg as unknown as ConfigShape), []);
});

test("formatConfig prints every section and marks with * only the values that differ from the default", () => {
    const cfg = JSON.parse(JSON.stringify({ ...config })) as Record<string, unknown>;
    for (const s of SETTINGS) if (s.default !== undefined) set(cfg, s.path, s.default);
    const plain = formatConfig(cfg).join("\n");
    for (const name of SECTIONS) assert.ok(plain.includes(name), name);
    assert.doesNotMatch(plain, /^ \* /m);

    set(cfg, "runner.quietSeconds", 30);
    const changed = formatConfig(cfg);
    const line = changed.find((l) => l.includes("runner.quietSeconds"))!;
    assert.match(line, /^ \* runner\.quietSeconds = 30 giây/);
    assert.match(line, /mặc định 120/);
    assert.match(line, /bot:runner/);
    assert.equal(changed.filter((l) => l.startsWith(" * ")).length, 1);
});

test("formatConfig shows the scroll delay as a range and lists arrays readably", () => {
    const text = formatConfig(config as unknown as Record<string, unknown>).join("\n");
    assert.match(text, /scrollDelayMs = 500–1200 ms/);
    assert.match(text, /targets = bot test, /);
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/configDoc.test.ts`
Expected: FAIL, không tìm thấy module `../configDoc.js`.

- [ ] **Step 3: Viết `configDoc.ts`**

```ts
/** 8 mục theo thứ tự trong config.ts. */
export const SECTIONS = ["1. ZALO", "2. NHÓM THEO DÕI", "3. CÀO", "4. WATCH (bot:watch)", "5. RUNNER (bot:runner)", "6. KHÔI PHỤC", "7. CHAT (bot:chat)", "8. BUỔI HỌC"];

export interface Setting {
    section: string;
    /** Đường dẫn khóa trong `config`, ví dụ "runner.quietSeconds". */
    path: string;
    unit: string;
    /** Giá trị mặc định (để đánh dấu * khi bạn đã đổi); bỏ trống với giá trị phụ thuộc máy hoặc ngày. */
    default?: unknown;
    /** Mô tả mặc định khi nó không cố định (ví dụ "06:00 hôm nay"). */
    defaultLabel?: string;
    /** Bot nào đọc thông số này. */
    readers: string[];
    /** Một dòng ý nghĩa; bản đầy đủ kèm ví dụ nằm ở chú thích trong config.ts. */
    note: string;
    format?: (value: unknown) => string;
}

const ALL = ["bot:watch", "bot:runner", "bot:chat", "bot:scrape"];
const hhmm = (ts: unknown): string => {
    if (ts === null) return "không giới hạn";
    const d = new Date(ts as number);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const SETTINGS: Setting[] = [
    { section: SECTIONS[0], path: "cdpPort", unit: "", default: 9222, readers: ALL, note: "Cổng gỡ lỗi mà Zalo Desktop được mở ra để bot điều khiển." },
    { section: SECTIONS[0], path: "zaloExePath", unit: "", defaultLabel: "tự dò", readers: ALL, note: "Đường dẫn Zalo.exe; chỉ đặt tay khi tự dò sai." },
    { section: SECTIONS[0], path: "autoLaunchZalo", unit: "", default: true, readers: ALL, note: "Tự tắt và mở lại Zalo khi chưa có cổng gỡ lỗi." },
    { section: SECTIONS[0], path: "dataDir", unit: "", defaultLabel: "./data", readers: ALL, note: "Nơi lưu tin đã cào và các tệp trạng thái." },

    { section: SECTIONS[1], path: "targets", unit: "", defaultLabel: "theo máy bạn", readers: ["bot:watch", "bot:runner", "bot:chat", "bot:scrape"], note: "Tên nhóm đúng như thanh bên Zalo; chỉ nhóm ở đây mới được theo dõi." },
    { section: SECTIONS[1], path: "recoveryIgnoreTargets", unit: "", defaultLabel: "bot test", readers: ["bot:runner", "recover:missing"], note: "Nhóm không gửi báo cáo buổi dạy; khôi phục không cào lại chúng." },

    { section: SECTIONS[2], path: "sinceTs", unit: "mốc giờ", defaultLabel: "06:00 hôm nay", readers: ["bot:scrape", "recover:missing"], note: "Chỉ giữ tin từ mốc này; tính một lần lúc bot khởi động.", format: hhmm },
    { section: SECTIONS[2], path: "untilTs", unit: "mốc giờ", default: null, readers: ["bot:scrape"], note: "Chỉ giữ tin đến mốc này (bộ lọc kết quả).", format: hhmm },
    { section: SECTIONS[2], path: "targetMessageCount", unit: "tin", default: 2000, readers: ["bot:scrape", "bot:runner"], note: "Trần an toàn số tin mỗi nhóm mỗi lần cào." },
    { section: SECTIONS[2], path: "scrollDelayMs", unit: "ms", default: { min: 500, max: 1200 }, readers: ["bot:scrape", "bot:runner"], note: "Nghỉ ngẫu nhiên giữa hai bước cuộn.", format: (v) => `${(v as { min: number }).min}–${(v as { max: number }).max} ms` },

    { section: SECTIONS[3], path: "watch.heartbeatSeconds", unit: "giây", default: 30, readers: ["bot:watch", "bot:runner"], note: "Bao lâu ghi nhịp tim (cũng là nhịp tim của bot:runner)." },
    { section: SECTIONS[3], path: "watch.deadAfterSeconds", unit: "giây", default: 90, readers: ["bot:watch", "bot:runner", "bot:chat"], note: "Quá bấy nhiêu giây không có nhịp tim thì coi bot đã chết." },
    { section: SECTIONS[3], path: "watch.minBlindSeconds", unit: "giây", default: 60, readers: ["bot:watch", "bot:runner"], note: "Khoảng mù ngắn hơn giá trị này bị coi là nhiễu khởi động." },

    { section: SECTIONS[4], path: "runner.quietSeconds", unit: "giây", default: 120, readers: ["bot:runner"], note: "Hàng chờ yên lặng bấy nhiêu giây rồi mới cào." },
    { section: SECTIONS[4], path: "runner.maxWaitSeconds", unit: "giây", default: 600, readers: ["bot:runner"], note: "Trần chờ tính từ nhóm đầu tiên vào hàng chờ." },
    { section: SECTIONS[4], path: "runner.pollSeconds", unit: "giây", default: 5, readers: ["bot:runner"], note: "Bao lâu xem lại hàng chờ một lần." },
    { section: SECTIONS[4], path: "runner.dirtyCheckSeconds", unit: "giây", default: 60, readers: ["bot:runner"], note: "Bao lâu kiểm báo cáo chưa dựng vào Excel." },
    { section: SECTIONS[4], path: "runner.dirtyRetrySeconds", unit: "giây", default: 300, readers: ["bot:runner"], note: "Thử lại một buổi dựng lỗi sau bấy nhiêu giây." },
    { section: SECTIONS[4], path: "runner.watchWarmupSeconds", unit: "giây", default: 90, readers: ["bot:runner"], note: "Không đụng vào Zalo trong bấy nhiêu giây sau khi bot:watch khởi động." },
    { section: SECTIONS[4], path: "runner.maxConsecutiveFailures", unit: "vòng", default: 3, readers: ["bot:runner"], note: "Bấy nhiêu vòng lỗi liên tiếp thì runner ngừng tự thử." },

    { section: SECTIONS[5], path: "recovery.marginMinutes", unit: "phút", default: 5, readers: ["bot:runner", "recover:missing"], note: "Cào lại từ trước lúc watch chết bấy nhiêu phút." },

    { section: SECTIONS[6], path: "chat.pollSeconds", unit: "giây", default: 3, readers: ["bot:chat"], note: "Bao lâu kiểm hộp thư chat một lần." },
    { section: SECTIONS[6], path: "chat.heartbeatSeconds", unit: "giây", default: 30, readers: ["bot:chat"], note: "Nhịp tim của bot chat." },
    { section: SECTIONS[6], path: "chat.skipBackoffSeconds", unit: "giây", default: 45, readers: ["bot:chat"], note: "Sau một lần gửi bị hoãn, không đụng vào Zalo lại trong bấy nhiêu giây." },
    { section: SECTIONS[6], path: "chat.sentLedgerMinutes", unit: "phút", default: 10, readers: ["bot:chat", "bot:watch"], note: "Giữ sổ câu bot vừa gửi bấy nhiêu phút." },
    { section: SECTIONS[6], path: "chat.echoWindowSeconds", unit: "giây", default: 120, readers: ["bot:watch"], note: "Cửa sổ nhận ra tin dội lại của bot." },

    { section: SECTIONS[7], path: "sessions.chieuFromHour", unit: "giờ", default: 12, readers: ["bot:runner", "extract:reports", "recover:missing"], note: "Giờ bắt đầu buổi chiều." },
    { section: SECTIONS[7], path: "sessions.toiFromHour", unit: "giờ", default: 18, readers: ["bot:runner", "extract:reports", "recover:missing"], note: "Giờ bắt đầu buổi tối." },
];

const getPath = (obj: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o === undefined || o === null ? undefined : (o as Record<string, unknown>)[k]), obj);

function show(setting: Setting, value: unknown): string {
    if (setting.format) return setting.format(value);
    if (Array.isArray(value)) return value.join(", ");
    if (value === null || value === undefined) return String(value);
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return setting.unit && typeof value === "number" ? `${text} ${setting.unit}` : text;
}

/** In từng mục với giá trị hiện tại, mặc định, bot nào đọc. Khóa khác mặc định có dấu `*` ở đầu dòng. */
export function formatConfig(cfg: object, settings: Setting[] = SETTINGS): string[] {
    const lines: string[] = [];
    for (const section of SECTIONS) {
        lines.push("", `── ${section} ──`);
        for (const s of settings.filter((x) => x.section === section)) {
            const value = getPath(cfg, s.path);
            const differs = s.default !== undefined && JSON.stringify(value) !== JSON.stringify(s.default);
            const def = s.default !== undefined ? show(s, s.default) : (s.defaultLabel ?? "-");
            lines.push(`${differs ? " * " : "   "}${s.path} = ${show(s, value)}   (mặc định ${def}) | đọc bởi: ${s.readers.join(", ")} | ${s.note}`);
        }
    }
    return lines;
}
```

- [ ] **Step 4: Viết `configShow.ts` và thêm script**

Tạo `configShow.ts`:

```ts
import { config } from "./config.js";
import { formatConfig } from "./configDoc.js";

/**
 * In toàn bộ cấu hình theo mục: giá trị hiện tại, mặc định, bot nào đọc, ý nghĩa. Khóa khác mặc định có dấu * ở đầu dòng.
 * Chỉ đọc; không kết nối gì.
 *
 *   npm run config:show
 */
console.log("Cấu hình hiện tại (sửa ở config.ts; đổi giá trị thì khởi động lại bot liên quan). Dấu * = khác mặc định.");
for (const line of formatConfig(config)) console.log(line);
```

Trong `package.json`, ngay sau dòng `"chat:status": "tsx chatStatus.ts",` thêm:

```json
        "config:show": "tsx configShow.ts",
```

- [ ] **Step 5: Chạy test, thấy đạt**

Run: `node --import tsx --test tests/configDoc.test.ts`
Expected: PASS, 6 test. Nếu test đầu (mọi khóa có mục mô tả) báo thiếu hoặc thừa đường dẫn, sửa `SETTINGS` cho khớp `config.ts` (không sửa test).

- [ ] **Step 6: Kiểm lệnh thật (không cần Zalo)**

Run: `npm run config:show`
Expected: in 8 mục; **không dòng nào bắt đầu bằng ` * `** (mặc định giữ đúng như cũ). Nếu có dấu `*` là giá trị trong `config.ts` lệch mặc định đã ghi: sửa `config.ts` về đúng mặc định.

- [ ] **Step 7: Typecheck, toàn bộ test, commit**

Run: `npm run typecheck` rồi `npm test`. Expected: đạt.

```bash
git add configDoc.ts configShow.ts package.json tests/configDoc.test.ts
git commit -m "feat(config): per-key documentation table, formatConfig and npm run config:show" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Watch, runner và khôi phục đọc từ config

**Files:**
- Modify: `history/watchState.ts`, `runner/schedule.ts`, `runner/runnerState.ts`, `lesson/recoveryRun.ts`, `bot-runner.ts`
- Create: `tests/helpers/configProbe.ts`
- Test: `tests/configWiring.test.ts`

**Interfaces:**
- Consumes: `config.watch`, `config.runner`, `config.recovery` (Task 2).
- Produces: xuất thêm `MIN_BLIND_GAP_MS` (`history/watchState.ts`), `WARMUP_MS`, `MIN_BLIND_MS`, `POLL_MS`, `DIRTY_CHECK_MS`, `DIRTY_RETRY_MS` (`runner/schedule.ts`), `SINCE_MARGIN_MS` (`lesson/recoveryRun.ts`); các hằng cũ (`HEARTBEAT_INTERVAL_MS`, `STALE_AFTER_MS`, `QUIET_MS`, `MAX_WAIT_MS`, `MAX_CONSECUTIVE_FAILURES`) tính từ config.

- [ ] **Step 1: Viết helper chạy tiến trình con và test thất bại**

Tạo `tests/helpers/configProbe.ts`:

```ts
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Chạy `body` trong một tiến trình Node riêng, SAU khi đổi giá trị của `config` (mã trong `mutate`), rồi trả về
 * giá trị `body` trả ra. Cần vì các hằng số của module được tính một lần lúc nạp: đây là cách kiểm chúng thật sự lấy từ config.
 * Trong `mutate` và `body`, `config` đã có sẵn; nạp module bằng `await import("../history/watchState.js")` (đường dẫn tính từ thư mục tests/).
 */
export function probe(mutate: string, body: string): unknown {
    const file = path.join(testsDir, `.config-probe-${process.pid}-${Date.now()}.ts`);
    const code = `import { config } from "../config.js";\n${mutate}\nconst result = await (async () => {\n${body}\n})();\nconsole.log("__PROBE__" + JSON.stringify(result));\n`;
    fs.writeFileSync(file, code, "utf8");
    try {
        const r = spawnSync(process.execPath, ["--import", "tsx", file], { encoding: "utf8", cwd: path.resolve(testsDir, "..") });
        const line = r.stdout.split("\n").find((l) => l.startsWith("__PROBE__"));
        if (!line) throw new Error(`probe failed (exit ${r.status}): ${r.stderr.slice(0, 600)}`);
        return JSON.parse(line.slice("__PROBE__".length));
    } finally {
        fs.rmSync(file, { force: true });
    }
}
```

Tạo `tests/configWiring.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { probe } from "./helpers/configProbe.js";

test("watch, runner and recovery timings come from config, not from constants in the modules", () => {
    const out = probe(
        `
config.watch.heartbeatSeconds = 11; config.watch.deadAfterSeconds = 33; config.watch.minBlindSeconds = 22;
config.runner.quietSeconds = 31; config.runner.maxWaitSeconds = 301; config.runner.pollSeconds = 7;
config.runner.dirtyCheckSeconds = 41; config.runner.dirtyRetrySeconds = 61; config.runner.watchWarmupSeconds = 51;
config.runner.maxConsecutiveFailures = 4;
config.recovery.marginMinutes = 9;
`,
        `
const w = await import("../history/watchState.js");
const s = await import("../runner/schedule.js");
const r = await import("../runner/runnerState.js");
const rr = await import("../lesson/recoveryRun.js");
return { hb: w.HEARTBEAT_INTERVAL_MS, dead: w.STALE_AFTER_MS, blind: w.MIN_BLIND_GAP_MS, quiet: s.QUIET_MS, max: s.MAX_WAIT_MS, warm: s.WARMUP_MS, sblind: s.MIN_BLIND_MS, poll: s.POLL_MS, dc: s.DIRTY_CHECK_MS, dr: s.DIRTY_RETRY_MS, fails: r.MAX_CONSECUTIVE_FAILURES, margin: rr.SINCE_MARGIN_MS };
`,
    );
    assert.deepEqual(out, { hb: 11000, dead: 33000, blind: 22000, quiet: 31000, max: 301000, warm: 51000, sblind: 22000, poll: 7000, dc: 41000, dr: 61000, fails: 4, margin: 540000 });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/configWiring.test.ts`
Expected: FAIL: `probe` báo lỗi hoặc giá trị lệch (ví dụ `MIN_BLIND_GAP_MS` chưa được xuất nên `blind` là `undefined`).

- [ ] **Step 3: Sửa `history/watchState.ts`**

Thêm `import { config } from "../config.js";` (đã có sẵn ở đầu tệp thì bỏ qua) và thay ba dòng hằng số:

```ts
export const HEARTBEAT_INTERVAL_MS = 30_000;
```
thành
```ts
export const HEARTBEAT_INTERVAL_MS = config.watch.heartbeatSeconds * 1000;
```

```ts
export const STALE_AFTER_MS = 90_000;
```
thành
```ts
export const STALE_AFTER_MS = config.watch.deadAfterSeconds * 1000;
```

```ts
const MIN_BLIND_GAP_MS = 60_000;
```
thành
```ts
export const MIN_BLIND_GAP_MS = config.watch.minBlindSeconds * 1000;
```

- [ ] **Step 4: Sửa `runner/schedule.ts`**

Thêm `import { config } from "../config.js";` và thay:

```ts
export const QUIET_MS = 2 * 60_000;
```
thành `export const QUIET_MS = config.runner.quietSeconds * 1000;`

```ts
export const MAX_WAIT_MS = 10 * 60_000;
```
thành `export const MAX_WAIT_MS = config.runner.maxWaitSeconds * 1000;`

```ts
const WARMUP_MS = 90_000;
const MIN_BLIND_MS = 60_000;
```
thành
```ts
export const WARMUP_MS = config.runner.watchWarmupSeconds * 1000;
export const MIN_BLIND_MS = config.watch.minBlindSeconds * 1000;

/** Runner: how often it looks at the queue, checks for unbuilt reports, and retries a session whose build failed. */
export const POLL_MS = config.runner.pollSeconds * 1000;
export const DIRTY_CHECK_MS = config.runner.dirtyCheckSeconds * 1000;
export const DIRTY_RETRY_MS = config.runner.dirtyRetrySeconds * 1000;
```

- [ ] **Step 5: Sửa `runner/runnerState.ts`, `lesson/recoveryRun.ts`, `bot-runner.ts`**

`runner/runnerState.ts`: thêm `import { config } from "../config.js";` (đã có `config` được import sẵn, dùng lại) và thay `export const MAX_CONSECUTIVE_FAILURES = 3;` bằng `export const MAX_CONSECUTIVE_FAILURES = config.runner.maxConsecutiveFailures;`.

`lesson/recoveryRun.ts`: thêm `import { config } from "../config.js";` và thay `const SINCE_MARGIN_MS = 5 * 60_000;` bằng `export const SINCE_MARGIN_MS = config.recovery.marginMinutes * 60_000;`.

`bot-runner.ts`: xóa ba dòng `const POLL_MS = 5_000;`, `const DIRTY_CHECK_MS = 60_000;`, `const DIRTY_RETRY_MS = 5 * 60_000;` và đổi dòng import từ `./runner/schedule.js` thành:

```ts
import { decide, DIRTY_CHECK_MS, DIRTY_RETRY_MS, POLL_MS, settledGaps, toQueueTimes, watchWarmingUp } from "./runner/schedule.js";
```

(Sau bước `git diff bot-runner.ts`, phải thấy đúng ba dòng hằng số bị xóa và một dòng import đổi.)

- [ ] **Step 6: Chạy test, typecheck, toàn bộ test**

Run: `node --import tsx --test tests/configWiring.test.ts` → Expected: PASS.
Run: `npm run typecheck` → Expected: không lỗi.
Run: `npm test` → Expected: đạt (mọi test cũ vẫn đạt vì mặc định không đổi).

- [ ] **Step 7: Commit**

```bash
git add history/watchState.ts runner/schedule.ts runner/runnerState.ts lesson/recoveryRun.ts bot-runner.ts tests/helpers/configProbe.ts tests/configWiring.test.ts
git commit -m "refactor(config): watch, runner and recovery timings read from config" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Bot chat đọc từ config

**Files:**
- Create: `chat/timing.ts`
- Modify: `chat/cycle.ts`, `chat/state.ts`, `bot-chat.ts`
- Test: `tests/configWiring.test.ts` (thêm)

**Interfaces:**
- Consumes: `config.chat` (Task 2).
- Produces: `chat/timing.ts` xuất `CHAT_POLL_MS`, `CHAT_HEARTBEAT_MS`, `SKIP_BACKOFF_MS`, `KEEP_SENT_MS`, `ECHO_WINDOW_MS`; `chat/cycle.ts` vẫn xuất lại `SKIP_BACKOFF_MS`.

- [ ] **Step 1: Thêm test thất bại**

Thêm vào cuối `tests/configWiring.test.ts`:

```ts
test("chat timings come from config", () => {
    const out = probe(
        `config.chat.pollSeconds = 4; config.chat.heartbeatSeconds = 31; config.chat.skipBackoffSeconds = 46; config.chat.sentLedgerMinutes = 11; config.chat.echoWindowSeconds = 121;`,
        `
const t = await import("../chat/timing.js");
const c = await import("../chat/cycle.js");
return { poll: t.CHAT_POLL_MS, hb: t.CHAT_HEARTBEAT_MS, skip: t.SKIP_BACKOFF_MS, cycleSkip: c.SKIP_BACKOFF_MS, keep: t.KEEP_SENT_MS, echo: t.ECHO_WINDOW_MS };
`,
    );
    assert.deepEqual(out, { poll: 4000, hb: 31000, skip: 46000, cycleSkip: 46000, keep: 660000, echo: 121000 });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/configWiring.test.ts`
Expected: test mới FAIL (`chat/timing.js` chưa tồn tại); test của Task 4 vẫn đạt.

- [ ] **Step 3: Tạo `chat/timing.ts`**

```ts
import { config } from "../config.js";

/** Thời gian của bot chat, tính từ `config.chat` (config.ts mục 7). Các mô-đun chat không tự khai báo số nào. */
export const CHAT_POLL_MS = config.chat.pollSeconds * 1000;
export const CHAT_HEARTBEAT_MS = config.chat.heartbeatSeconds * 1000;
/** Sau một lần gửi bị hoãn (ô soạn tin đang có chữ dở, chưa mở được nhóm) không chạm vào Zalo lại trong khoảng này. */
export const SKIP_BACKOFF_MS = config.chat.skipBackoffSeconds * 1000;
/** Sổ các câu bot vừa gửi được giữ bấy lâu. */
export const KEEP_SENT_MS = config.chat.sentLedgerMinutes * 60_000;
/** Tin của chính tài khoản khớp một câu trong sổ trong khoảng này được coi là tin dội lại của bot. */
export const ECHO_WINDOW_MS = config.chat.echoWindowSeconds * 1000;
```

- [ ] **Step 4: Sửa `chat/cycle.ts`, `chat/state.ts`, `bot-chat.ts`**

`chat/cycle.ts`: xóa dòng `export const SKIP_BACKOFF_MS = 45_000;` cùng chú thích ngay trên nó, và thêm sau các dòng import:

```ts
import { SKIP_BACKOFF_MS } from "./timing.js";

export { SKIP_BACKOFF_MS };
```

`chat/state.ts`: xóa hai dòng `const KEEP_SENT_MS = 10 * 60_000;` và `const ECHO_WINDOW_MS = 2 * 60_000;`, thêm `import { ECHO_WINDOW_MS, KEEP_SENT_MS } from "./timing.js";` cạnh các import khác.

`bot-chat.ts`: xóa hai dòng `const POLL_MS = 3_000;` và `const HEARTBEAT_MS = 30_000;`, thêm `import { CHAT_HEARTBEAT_MS, CHAT_POLL_MS } from "./chat/timing.js";`, rồi thay `setInterval(beat, HEARTBEAT_MS);` bằng `setInterval(beat, CHAT_HEARTBEAT_MS);` và `await delay(POLL_MS);` bằng `await delay(CHAT_POLL_MS);`.

- [ ] **Step 5: Chạy test, typecheck, toàn bộ test**

Run: `node --import tsx --test tests/configWiring.test.ts` → Expected: PASS, 2 test.
Run: `npm run typecheck` rồi `npm test`. Expected: đạt (mặc định không đổi nên mọi test chat cũ vẫn đạt).

- [ ] **Step 6: Commit**

```bash
git add chat/timing.ts chat/cycle.ts chat/state.ts bot-chat.ts tests/configWiring.test.ts
git commit -m "refactor(config): chat timings read from config" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Giờ chia buổi từ config (một nguồn duy nhất)

**Files:**
- Modify: `lesson/time.ts`, `lesson/recovery.ts`
- Test: `tests/sessions.test.ts` (mới), `tests/configWiring.test.ts` (thêm)

**Interfaces:**
- Consumes: `config.sessions` (Task 2).
- Produces: `SessionHours`, `sessionOf(ts, hours?)`, `currentSession(now?, hours?)`, `sessionWindow(day, buoi, hours?)`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/sessions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionWindow } from "../lesson/recovery.js";
import { sessionOf, type Buoi } from "../lesson/time.js";

const DAY = "2026-09-24";
const vn = (h: number, m = 0, s = 0) => Date.UTC(2026, 8, 24, h - 7, m, s);
const DEFAULT = { chieuFromHour: 12, toiFromHour: 18 };
const EARLY_TOI = { chieuFromHour: 12, toiFromHour: 17 };

test("default hours split the day at 12:00 and 18:00", () => {
    assert.equal(sessionOf(vn(11, 59, 59), DEFAULT), "sang");
    assert.equal(sessionOf(vn(12), DEFAULT), "chieu");
    assert.equal(sessionOf(vn(17, 59, 59), DEFAULT), "chieu");
    assert.equal(sessionOf(vn(18), DEFAULT), "toi");
});

test("with the evening starting at 17:00 the boundary moves (16:59 chiều, 17:00 tối)", () => {
    assert.equal(sessionOf(vn(16, 59, 59), EARLY_TOI), "chieu");
    assert.equal(sessionOf(vn(17), EARLY_TOI), "toi");
    assert.equal(sessionOf(vn(17, 30), EARLY_TOI), "toi");
});

test("sessionWindow follows the hours: the chiều window ends where the tối window starts", () => {
    assert.deepEqual(sessionWindow(DAY, "chieu", DEFAULT), { from: Date.UTC(2026, 8, 24, 5), to: Date.UTC(2026, 8, 24, 11) });
    assert.deepEqual(sessionWindow(DAY, "chieu", EARLY_TOI), { from: Date.UTC(2026, 8, 24, 5), to: Date.UTC(2026, 8, 24, 10) });
    assert.deepEqual(sessionWindow(DAY, "toi", EARLY_TOI), { from: Date.UTC(2026, 8, 24, 10), to: Date.UTC(2026, 8, 24, 17) });
});

test("sessionOf and sessionWindow agree at both edges of every session, for any valid hours", () => {
    for (const hours of [DEFAULT, EARLY_TOI, { chieuFromHour: 6, toiFromHour: 20 }]) {
        for (const buoi of ["sang", "chieu", "toi"] as Buoi[]) {
            const w = sessionWindow(DAY, buoi, hours);
            assert.equal(sessionOf(w.from, hours), buoi, `${JSON.stringify(hours)} ${buoi} start`);
            assert.equal(sessionOf(w.to - 1, hours), buoi, `${JSON.stringify(hours)} ${buoi} last ms`);
        }
    }
});
```

Thêm vào cuối `tests/configWiring.test.ts`:

```ts
test("session hours come from config.sessions", () => {
    const out = probe(
        `config.sessions.toiFromHour = 17;`,
        `
const t = await import("../lesson/time.js");
const r = await import("../lesson/recovery.js");
const at = (h) => Date.UTC(2026, 8, 24, h - 7, 0);
return { at1659: t.sessionOf(at(17) - 1), at17: t.sessionOf(at(17)), toiFrom: r.sessionWindow("2026-09-24", "toi").from - Date.UTC(2026, 8, 23, 17) };
`,
    );
    assert.deepEqual(out, { at1659: "chieu", at17: "toi", toiFrom: 17 * 3600_000 });
});
```

- [ ] **Step 2: Chạy test, thấy thất bại**

Run: `node --import tsx --test tests/sessions.test.ts tests/configWiring.test.ts`
Expected: FAIL (`sessionOf` bỏ qua tham số thứ hai nên các test giờ 17 sai; test dò cấu hình báo `at17: "chieu"`).

- [ ] **Step 3: Sửa `lesson/time.ts`**

Thêm ở đầu tệp: `import { config } from "../config.js";`. Thay khối `sessionOf` và `currentSession`:

```ts
/** Session of the Vietnam day: sáng 00:00-11:59, chiều 12:00-17:59, tối 18:00-23:59. */
export function sessionOf(ts: number): Buoi {
    const hour = new Date(ts + VN_OFFSET_MS).getUTCHours();
    return hour < 12 ? "sang" : hour < 18 ? "chieu" : "toi";
}

export function currentSession(now: number = Date.now()): Buoi {
    return sessionOf(now);
}
```

bằng:

```ts
/** Hours (Vietnam time) at which the afternoon and the evening start; the morning runs from 00:00 to `chieuFromHour`. */
export interface SessionHours {
    chieuFromHour: number;
    toiFromHour: number;
}

/**
 * Session of the Vietnam day. With the defaults (config.ts, mục 8): sáng 00:00-11:59, chiều 12:00-17:59, tối 18:00-23:59.
 * `hours` defaults to `config.sessions`; tests pass fixed hours.
 */
export function sessionOf(ts: number, hours: SessionHours = config.sessions): Buoi {
    const hour = new Date(ts + VN_OFFSET_MS).getUTCHours();
    return hour < hours.chieuFromHour ? "sang" : hour < hours.toiFromHour ? "chieu" : "toi";
}

export function currentSession(now: number = Date.now(), hours: SessionHours = config.sessions): Buoi {
    return sessionOf(now, hours);
}
```

- [ ] **Step 4: Sửa `lesson/recovery.ts`**

Thêm `import { config } from "../config.js";` và đổi dòng import `import type { Buoi } from "./time.js";` thành `import type { Buoi, SessionHours } from "./time.js";`. Thay:

```ts
// Must agree with `sessionOf` in ./time.ts (a test pins them together).
const SESSION_HOURS: Record<Buoi, [number, number]> = { sang: [0, 12], chieu: [12, 18], toi: [18, 24] };

/** The session `buoi` of Vietnam calendar day `day` (`YYYY-MM-DD`) as an epoch-ms window. */
export function sessionWindow(day: string, buoi: Buoi): Window {
    const [y, m, d] = day.split("-").map(Number);
    const midnight = Date.UTC(y, m - 1, d) - VN_OFFSET_MS;
    const [startHour, endHour] = SESSION_HOURS[buoi];
```

bằng:

```ts
/** [start, end) hours of each session; derived from the same hours `sessionOf` (./time.ts) uses, so the two always agree. */
function sessionHours(hours: SessionHours): Record<Buoi, [number, number]> {
    return { sang: [0, hours.chieuFromHour], chieu: [hours.chieuFromHour, hours.toiFromHour], toi: [hours.toiFromHour, 24] };
}

/** The session `buoi` of Vietnam calendar day `day` (`YYYY-MM-DD`) as an epoch-ms window. */
export function sessionWindow(day: string, buoi: Buoi, hours: SessionHours = config.sessions): Window {
    const [y, m, d] = day.split("-").map(Number);
    const midnight = Date.UTC(y, m - 1, d) - VN_OFFSET_MS;
    const [startHour, endHour] = sessionHours(hours)[buoi];
```

- [ ] **Step 5: Chạy test, typecheck, toàn bộ test**

Run: `node --import tsx --test tests/sessions.test.ts tests/configWiring.test.ts` → Expected: PASS (4 test giờ chia buổi, 3 test dò cấu hình).
Run: `npm run typecheck` → Expected: không lỗi.
Run: `npm test` → Expected: đạt. Lưu ý: các test cũ (`tests/time.test.ts`, `tests/recovery.test.ts`, fixtures ở 09:00 và 13:00) dùng giờ mặc định của `config`; chúng ghim logic chia buổi và sẽ báo lỗi nếu bạn đổi `config.sessions` sang giá trị khác mặc định. Đó là chủ ý; `tests/sessions.test.ts` là bộ test không phụ thuộc giá trị bạn chỉnh.

- [ ] **Step 6: Commit**

```bash
git add lesson/time.ts lesson/recovery.ts tests/sessions.test.ts tests/configWiring.test.ts
git commit -m "refactor(config): session hours come from config.sessions, one source for sessionOf and sessionWindow" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Tài liệu và kiểm tra cuối

**Files:**
- Modify: `README.md`, `CLAUDE.md`, `docs/GUIDE.md`

**Interfaces:** không có mã.

- [ ] **Step 1: README.md, CLAUDE.md, docs/GUIDE.md**

- `README.md`: trong mục "Cấu hình (`config.ts`)" thêm đoạn đầu mục: `config.ts` là **nơi duy nhất** chỉnh thông số vận hành, chia 8 mục (Zalo, Nhóm theo dõi, Cào, Watch, Runner, Khôi phục, Chat, Buổi học), mỗi thông số có chú thích ý nghĩa, đơn vị và ví dụ; đổi giá trị xong khởi động lại bot liên quan; `npm run config:show` in toàn bộ giá trị (khóa khác mặc định có dấu `*`); giá trị sai làm bot từ chối chạy và báo tên khóa; `chat-rules.json` là kịch bản trả lời riêng, không thuộc `config.ts`. Thêm vào bảng khóa các đối tượng `watch`, `runner`, `recovery`, `chat`, `sessions` với một dòng mô tả mỗi khóa (lấy từ chú thích trong `config.ts`).
- `CLAUDE.md`: thêm dòng lệnh `npm run config:show` vào khối Commands (`# print every tunable in config.ts by section, marking values that differ from the default`), và thay câu mở đầu mục "Config (`config.ts`)" thành: "`config.ts` is the single place for every tunable, in 8 documented sections (Zalo, targets, scraping, watch, runner, recovery, chat, sessions); modules derive their timing constants from it (they no longer hard-code numbers); `configCheck.ts` rejects bad values at startup; `configDoc.ts` documents each key for `npm run config:show`. Restart the affected bot after editing."
- `docs/GUIDE.md`: thêm mục "### Chỉnh cấu hình" (ngay trước mục 8 "Chạy tự động"): cách xem (`npm run config:show`), cách sửa (`config.ts`, khởi động lại bot liên quan), ví dụ ba tình huống thường gặp (đổi thời gian chờ của runner: `runner.quietSeconds`; đổi ranh giới buổi chiều: `sessions.toiFromHour` kèm dời lịch cron; thêm nhóm mới: `targets`, rồi khởi động lại `bot:watch`), và lưu ý `sinceTs` chỉ tính một lần lúc khởi động.

- [ ] **Step 2: Kiểm tra cuối (không cần Zalo)**

Run: `npm run typecheck` → Expected: không lỗi.
Run: `npm test` → Expected: tất cả đạt (263 cũ cộng các test mới của Task 1 đến 6).
Run: `npm run config:show` → Expected: 8 mục, **không dòng nào bắt đầu bằng ` * `** (gom xong mặc định giữ đúng như cũ).
Run: `git ls-files --eol config.ts` → Expected: `w/crlf` (giữ kiểu xuống dòng cũ).
Run: `grep -rnE "(2|10) \* 60_000|= 30_000|= 90_000|= 60_000|= 5_000|= 3_000|= 45_000" --include=*.ts chat runner history lesson bot-chat.ts bot-runner.ts` → Expected: các hằng số đã gom (`QUIET_MS`, `MAX_WAIT_MS`, `HEARTBEAT_INTERVAL_MS`, `STALE_AFTER_MS`, `SKIP_BACKOFF_MS`, `POLL_MS`, `SINCE_MARGIN_MS`...) không còn được gán bằng số ghi cứng; xem lại từng kết quả (một số dòng khác như `setTimeout` hoặc so sánh với `60_000` trong `chat/limits.ts` là hợp lệ và không thuộc phạm vi gom).

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md docs/GUIDE.md
git commit -m "docs(config): central config sections, config:show and how to change common settings" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Bàn giao (KHÔNG tự làm)**

Người thực hiện in cho người dùng: (1) các bot đang chạy (`bot:watch`, `bot:runner`, `bot:chat`) vẫn dùng mã cũ, cần **khởi động lại** để nạp bản mới (khởi động lại `bot:watch` mở lại Zalo Desktop: làm lúc không dùng Zalo); (2) mở `config.ts` để xem và chỉnh, `npm run config:show` để xem giá trị; (3) đổi giờ chia buổi (nếu muốn chiều đến 17:00) thì dời lịch chạy buổi chiều thành 17:05; (4) các test cũ ghim giờ chia buổi mặc định 12/18 nên sẽ báo lỗi nếu đổi `sessions`, đó là chủ ý.

---

## Self-Review

**Spec coverage:** mục 3 (8 mục cấu trúc, ghi chú và ví dụ từng khóa): Task 2 (chú thích trong `config.ts`) và Task 3 (bảng `SETTINGS`, `config:show`). Mục 4 kiểm tra giá trị: Task 1 (mọi luật) và Task 2 (gọi khi nạp). Mục 5 cách module dùng config: Task 4 (watch, runner, khôi phục), Task 5 (chat), Task 6 (giờ chia buổi, một nguồn). Mục 6 `config:show`: Task 3. Mục 8 kiểm thử: Task 1 (`validateConfig`), Task 3 (ghim mặc định, độ phủ khóa, `formatConfig`), Task 4 đến 6 (dò cấu hình bằng tiến trình con, giờ chia buổi kể cả 17:00). Mục 7 ngoài phạm vi: không có nạp lại nóng, không gom `chat-rules.json`, không đổi tên khóa cũ. Mục 9 giả định CRLF: Task 2 bước 4 và Task 7 bước 2.

**Placeholder scan:** không có "TBD"/"TODO"; mọi bước có mã hoặc lệnh cụ thể. Task 7 bước 1 mô tả nội dung tài liệu bằng văn xuôi cụ thể (không phải mã).

**Type consistency:** `ConfigShape` (Task 1) khớp cấu trúc `config` (Task 2); `SETTINGS`/`SECTIONS`/`formatConfig` (Task 3) dùng ở `configShow.ts`; các hằng xuất mới ở Task 4 (`MIN_BLIND_GAP_MS`, `WARMUP_MS`, `MIN_BLIND_MS`, `POLL_MS`, `DIRTY_CHECK_MS`, `DIRTY_RETRY_MS`, `SINCE_MARGIN_MS`) khớp với `probe` trong test; `SessionHours` (Task 6) dùng ở cả `lesson/time.ts` và `lesson/recovery.ts`; `chat/timing.ts` (Task 5) dùng ở `chat/cycle.ts`, `chat/state.ts`, `bot-chat.ts`.

**Review Focus:** năm mục đều có test hoặc bước kiểm ở task được nêu (1 ở Task 3 và 7; 2 ở Task 1; 3 ở Task 3; 4 ở Task 6; 5 ở Task 4, 5, 6).
