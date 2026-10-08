# Bộ báo cáo theo người phụ trách — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mỗi người phụ trách (một "bộ" trong `config.reportSets`) có thư mục riêng `<statusExportDir>/<yyMM>/<yyMMdd>/<id>/` chứa đúng các loại báo cáo họ được giao, và một bộ (hay một file báo cáo của bộ) lỗi thì các bộ/file khác vẫn xuất bình thường.

**Architecture:** Một bảng đăng ký mã báo cáo (`src/reportSets/registry.ts`) và một hàm kiểm tra cấu hình thuần, không ném lỗi (`resolve.ts`) cho ra danh sách bộ hợp lệ + danh sách vấn đề. Các script `fill:*`/`extract:reports` nhận `--set <id>` và làm việc trong `output/<id>/` và `setReportDir(...)`. Vòng runner và `bot:total` lặp theo bộ, mỗi (bộ, mã) chạy trong `try/catch` riêng; trạng thái (đã dựng, file cũ, điện, lỗi chờ thử lại) khoá theo `id`. Việc cào, `bot:watch`, kho tin `data/<groupId>.json` giữ nguyên và dùng chung.

**Tech Stack:** TypeScript (ESM, import có đuôi `.js`), Node ≥ 22, `node:test` (`npm test`), `tsx`, Excel COM qua PowerShell (`scripts/fill-status-template.ps1`), Windows.

**Spec:** `docs/superpowers/specs/2026-10-06-bo-bao-cao-theo-nguoi-design.md` (đọc trước; kế hoạch này bám sát từng mục của nó).

## Global Constraints

- Đường dẫn xuất: `<statusExportDir>/<yyMM>/<yyMMdd>/<id người>/<file báo cáo>`; bot tự tạo thư mục của bộ (`mkdir -p`). File cũ ở chỗ cũ không tự chuyển.
- Báo cáo thuộc về **người**, không thuộc về nhóm Zalo: mọi tin từ mọi nhóm trong `config.targets` đi qua mọi bộ; không có kiểm tra theo nhóm.
- `id`: không rỗng, không chứa `\ / : * ? " < > |` hay ký tự điều khiển, không có khoảng trắng đầu/cuối, không kết thúc bằng dấu chấm, không là tên thiết bị Windows (`CON PRN AUX NUL COM1-9 LPT1-9`), tối đa 100 ký tự; không trùng giữa các bộ (không phân biệt hoa thường).
- `reports`: danh sách **mã nội bộ** (`netsupport`, `loa`, `internet`, `mayTinh`, `dien`, `cleaning`, `attendance`); **không có mặc định**; thứ tự trong bảng đăng ký là thứ tự xuất và in (NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH, NỘI QUY).
- Cấu hình sai **không làm bot dừng**: hàm kiểm tra không bao giờ ném lỗi; phần sai bị tắt và báo lỗi ồn ào (màn hình khởi động của `bot:runner`/`bot:total`, `runner:status`, `total:status`, `config:show`, tóm tắt vòng); `runner:status` và `total:status` thoát mã 2 khi có vấn đề mức `error`.
- Đơn vị cô lập lỗi là cặp **(bộ, mã báo cáo)**. File cũ của cặp lỗi được giữ; cặp lỗi được thử lại ở vòng sau với giãn cách `runner.dirtyRetrySeconds`, không phải mỗi phút.
- Mã báo cáo nằm trong hai bộ: cho phép, chỉ ghi chú (`warning`).
- Excel COM chạy tuần tự, mỗi file một tiến trình PowerShell (không đổi). Các bộ chạy tuần tự theo thứ tự trong `config.ts`.
- Tên `name` truyền cho `runFillTemplate` giữ nguyên (`netsupport`, `total-netsupport`, …): chúng chỉ đặt tên file `fill-spec-*.json`/`fill-*.log` trong `output/` và các bước chạy tuần tự nên không đè nhau.
- Phong cách: thụt lề 4 khoảng trắng, chuỗi hiển thị bằng tiếng Việt, comment giải thích "vì sao", test `node:test` + `assert/strict` trong `tests/`, import `./helpers/pinConfig.js` đầu file test khi test phụ thuộc giá trị mặc định của `config`.
- Không commit thứ không thuộc nhiệm vụ: working tree hiện có thay đổi chưa commit của việc bỏ nguồn toast (xem Task 0). Mỗi lần commit dùng `git add <đường dẫn cụ thể>`, không dùng `git add -A`.

## Review Focus

Các đầu vào mà spec ngầm ngụ ý nhưng khó nhớ tới; mỗi dòng có test ở task sở hữu mã tương ứng.

1. **`id` có dấu tiếng Việt và khoảng trắng bên trong** (ví dụ `Nguyễn Văn A`): hợp lệ, đường dẫn thư mục đúng, so trùng không phân biệt hoa thường (Task 1, Task 2).
2. **`config.reportSets` không tồn tại, không phải mảng hoặc rỗng** (config.ts cũ): hàm kiểm tra trả về lỗi ồn ào, không ném lỗi, bot vẫn chạy (Task 1).
3. **Bộ chỉ có mã theo ngày** (ví dụ chỉ `dien`): runner không chạy `extract-reports` hay `fill-status-reports` cho bộ đó (Task 3, Task 7).
4. **Một file bị Excel giữ (`Access denied`) hay mẫu thiếu**: các cặp còn lại của cùng bộ và các bộ khác vẫn xuất; cặp lỗi ghi vào danh sách thử lại, và vòng sau chỉ dựng lại đúng cặp đó, không phải mỗi phút (Task 4, Task 7).
5. **Thêm một bộ mới sau khi bot đã chạy**: không dựng lại cả lịch sử trong kho; file `.runner-built.json` cũ (mảng) chuyển cho các bộ hiện có mà không dựng lại gì (Task 3).
6. **Một tin nuôi hai bộ**: dấu `StatusId` gộp một lần (`cần xem` thắng `đã xử lý` thắng `bỏ qua`) và `mark-messages` chỉ chạy một lần mỗi vòng (Task 3, Task 7).

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/reportSets/registry.ts` (mới) | Mã báo cáo, loại (`phase`/`day`), nguồn tin, bố cục mẫu |
| `src/reportSets/resolve.ts` (mới) | `resolveReportSets` (kiểm tra thuần, không ném lỗi), `ResolvedSet`, `SetProblem` |
| `src/reportSets/cliSet.ts` (mới) | `pickSet`, `requireKey`, `describeProblem`, `loadReportSets`, `logSetProblems` — nối config với các CLI |
| `src/reportSets/legacy.ts` (mới) | Cảnh báo khi còn `output/overrides.json` cũ ở gốc |
| `src/core/paths.ts` | Thêm `setReportDir`, `setOutputDir` |
| `src/runner/builtReports.ts` | Trạng thái "đã dựng" theo bộ (`loadBuiltBySet`, `writeBuiltBySet`) + chuyển đổi định dạng cũ |
| `src/runner/failedFills.ts` (mới) | Danh sách cặp (bộ, giai đoạn, mã) lỗi chờ thử lại |
| `src/runner/mergeMarks.ts` (mới) | Gộp dấu `StatusId` của nhiều bộ |
| `src/runner/buildPlan.ts` (mới) | `planSetBuilds`, `pendingBuilds`: buổi nào của bộ nào cần dựng, với những mã nào |
| `src/lesson/statusFileTracker.ts` | `trackerKey` có `setId` |
| `src/lesson/electricState.ts` | Đường dẫn trạng thái điện theo bộ |
| `src/lesson/statusFill.ts` (mới) | `fillStatusFiles` (cô lập từng mã), đọc/ghi `fill-failed.json` |
| `src/cli/fill-status-reports.ts`, `extract-reports.ts`, `fill-cleaning-report.ts`, `fill-attendance-report.ts`, `fill-electric-report.ts` | Nhận `--set` |
| `src/types/runner.ts`, `src/runner/cycle.ts`, `src/runner/steps.ts` | Vòng runner theo bộ |
| `src/cli/bot-runner.ts`, `runner-once.ts`, `runner-status.ts`, `src/runner/runnerStatusReport.ts` | Khởi động, dựng lại tay, trạng thái |
| `src/total/runTotal.ts`, `realDeps.ts`, `tick.ts`, `src/cli/bot-total.ts`, `total-once.ts`, `src/total/totalStatusReport.ts`, `src/cli/total-status.ts` | `bot:total` theo bộ |
| `src/cli/reports-list.ts` (mới), `src/config/configDoc.ts`, `config.ts`, `src/types/config.ts`, `package.json` | `reports:list`, tài liệu config, mục `reportSets` |
| `CLAUDE.md`, `README.md`, `SKILLS-Agent/cau-hinh-nguoi-phu-trach/SKILL.md` | Tài liệu |

---

### Task 0: Điều kiện đầu (không có code)

**Files:** không.

- [ ] **Step 1: Xem working tree**

Run: `git status --short`
Expected: có các file đã sửa của việc bỏ nguồn toast (`src/watch/*`, `src/scrape/cdp.ts`, `src/types/watch.ts`, `tests/watch*.test.ts`, `tests/schedule.test.ts`, `tests/recoveryReport.test.ts`, `CLAUDE.md`, `README.md`), file spec `docs/superpowers/specs/2026-10-06-bo-bao-cao-theo-nguoi-design.md`, thư mục `SKILLS-Agent/` và file kế hoạch này.

- [ ] **Step 2: Hỏi người dùng** có muốn commit phần "bỏ toast" riêng trước không (khuyến nghị: có, một commit `refactor(watch): bỏ nguồn thông báo toast, chỉ nghe WebSocket`). Không tự commit khi chưa được đồng ý. Nếu người dùng chưa muốn commit, mọi commit của kế hoạch này chỉ `git add` đúng các file của task (CLAUDE.md và README.md chỉ sửa ở Task 10 và sẽ lẫn thay đổi toast cũ trong cùng file; khi đó báo người dùng).

- [ ] **Step 3: Chạy test nền**

Run: `npm run typecheck && npm test`
Expected: typecheck sạch, `ℹ fail 0`.

---

### Task 1: Bảng đăng ký, kiểm tra cấu hình và mục `reportSets`

**Files:**
- Create: `src/reportSets/registry.ts`
- Create: `src/reportSets/resolve.ts`
- Modify: `src/types/config.ts` (thêm `ReportSetConfig`)
- Modify: `config.ts` (thêm mục `reportSets` ngay sau `statusExportDir`)
- Modify: `src/config/configDoc.ts` (thêm entry `reportSets`)
- Test: `tests/reportRegistry.test.ts`, `tests/resolveReportSets.test.ts`

**Interfaces:**
- Consumes: `FILE_LAYOUT`, `PHASE_STATUS_KEYS` từ `src/lesson/statusReportLayout.ts`; `CLEANING_LAYOUT` từ `src/lesson/cleaningRows.ts`; `ATTENDANCE_LAYOUT` từ `src/lesson/attendanceRows.ts`.
- Produces:
  - `REPORT_KEYS: readonly ["netsupport","loa","internet","mayTinh","dien","cleaning","attendance"]`, `type ReportKey`, `type ReportKind = "phase" | "day"`, `interface ReportDef { key: ReportKey; kind: ReportKind; label: string; source: string; layout: FileLayout }`, `REPORT_DEFS: Record<ReportKey, ReportDef>`, `PHASE_REPORT_KEYS: ReportKey[]`, `DAY_REPORT_KEYS: ReportKey[]`, `isReportKey(v: unknown): v is ReportKey`.
  - `interface ResolvedSet { id: string; reports: ReportKey[]; phaseKeys: ReportKey[]; dayKeys: ReportKey[] }`, `interface SetProblem { level: "error" | "warning"; setId: string | null; message: string }`, `interface ResolveResult { active: ResolvedSet[]; problems: SetProblem[] }`, `invalidSetIdReason(id: unknown): string | null`, `resolveReportSets(raw: unknown): ResolveResult`.
  - `interface ReportSetConfig { id: string; reports: string[] }` trong `src/types/config.ts`.

- [ ] **Step 1: Viết test của bảng đăng ký**

Create `tests/reportRegistry.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_REPORT_KEYS, isReportKey, PHASE_REPORT_KEYS, REPORT_DEFS, REPORT_KEYS } from "../src/reportSets/registry.js";
import { FILE_LAYOUT, PHASE_STATUS_KEYS } from "../src/lesson/statusReportLayout.js";

test("the registry lists the 7 reports in export and print order", () => {
    assert.deepEqual([...REPORT_KEYS], ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"]);
});

test("the phase keys are exactly the files fill:status-reports writes for each phase; the rest are per-day", () => {
    assert.deepEqual(PHASE_REPORT_KEYS, PHASE_STATUS_KEYS);
    assert.deepEqual(DAY_REPORT_KEYS, ["dien", "cleaning", "attendance"]);
});

test("every key has a definition that points at the real template layout", () => {
    for (const key of REPORT_KEYS) assert.equal(REPORT_DEFS[key].key, key);
    assert.equal(REPORT_DEFS.loa.layout, FILE_LAYOUT.loa);
    assert.equal(REPORT_DEFS.dien.layout, FILE_LAYOUT.dien);
    assert.equal(REPORT_DEFS.cleaning.layout.templateFile, "04 - FORM VE SINH PHONG MAY.xlsx");
    assert.equal(REPORT_DEFS.attendance.layout.templateFile, "05 - FORM NOI QUY THUC TAP.xlsx");
});

test("isReportKey accepts only registered keys, not inherited object properties", () => {
    assert.equal(isReportKey("mayTinh"), true);
    assert.equal(isReportKey("maytinh"), false);
    assert.equal(isReportKey("toString"), false);
    assert.equal(isReportKey(5), false);
    assert.equal(isReportKey(undefined), false);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --import tsx --test tests/reportRegistry.test.ts`
Expected: FAIL (không tìm thấy `src/reportSets/registry.js`).

- [ ] **Step 3: Viết bảng đăng ký**

Create `src/reportSets/registry.ts`:

```ts
import { ATTENDANCE_LAYOUT } from "../lesson/attendanceRows.js";
import { CLEANING_LAYOUT } from "../lesson/cleaningRows.js";
import { FILE_LAYOUT, type FileLayout } from "../lesson/statusReportLayout.js";

/**
 * Mã nội bộ của từng báo cáo. Mã là DANH TÍNH ỔN ĐỊNH: tên file mẫu và tiêu đề đọc từ ô A1 của mẫu có thể đổi (LOA đã đổi thành
 * ÂM THANH) mà mã `loa` giữ nguyên, nên `config.reportSets[].reports` ghi mã, không ghi tên file hay tiêu đề.
 * THỨ TỰ Ở ĐÂY LÀ THỨ TỰ XUẤT FILE VÀ IN (NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH, NỘI QUY).
 */
export const REPORT_KEYS = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

/** `phase`: dựng theo từng giai đoạn trong ngày (4 giai đoạn). `day`: một file mỗi ngày, quét lại cả ngày. */
export type ReportKind = "phase" | "day";

export interface ReportDef {
    key: ReportKey;
    kind: ReportKind;
    /** Tên hiển thị gọn, chỉ để in trong `reports:list` và thông báo lỗi. */
    label: string;
    /** Tiêu đề dòng đầu của tin nguồn (mô tả; việc nhận diện thật nằm ở `src/lesson/*Report.ts`). */
    source: string;
    layout: FileLayout;
}

const PHASE_SOURCE = "BÁO CÁO ĐẦU/CUỐI BUỔI DẠY";

export const REPORT_DEFS: Record<ReportKey, ReportDef> = {
    netsupport: { key: "netsupport", kind: "phase", label: "TÌNH TRẠNG NETSUPPORT", source: PHASE_SOURCE, layout: FILE_LAYOUT.netsupport },
    loa: { key: "loa", kind: "phase", label: "TÌNH TRẠNG ÂM THANH", source: PHASE_SOURCE, layout: FILE_LAYOUT.loa },
    internet: { key: "internet", kind: "phase", label: "TÌNH TRẠNG INTERNET", source: PHASE_SOURCE, layout: FILE_LAYOUT.internet },
    mayTinh: { key: "mayTinh", kind: "phase", label: "TÌNH TRẠNG MÁY TÍNH", source: PHASE_SOURCE, layout: FILE_LAYOUT.mayTinh },
    dien: { key: "dien", kind: "day", label: "TÌNH TRẠNG ĐIỆN", source: "LỖI ĐIỆN", layout: FILE_LAYOUT.dien },
    cleaning: { key: "cleaning", kind: "day", label: "VỆ SINH PHÒNG MÁY", source: "BÁO CÁO CUỐI BUỔI", layout: CLEANING_LAYOUT },
    attendance: { key: "attendance", kind: "day", label: "NỘI QUY THỰC TẬP", source: "BÁO CÁO ĐIỂM DANH", layout: ATTENDANCE_LAYOUT },
};

export const PHASE_REPORT_KEYS: ReportKey[] = REPORT_KEYS.filter((k) => REPORT_DEFS[k].kind === "phase");
export const DAY_REPORT_KEYS: ReportKey[] = REPORT_KEYS.filter((k) => REPORT_DEFS[k].kind === "day");

export function isReportKey(v: unknown): v is ReportKey {
    return typeof v === "string" && (REPORT_KEYS as readonly string[]).includes(v);
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --import tsx --test tests/reportRegistry.test.ts`
Expected: 4 test PASS.

- [ ] **Step 5: Viết test của hàm kiểm tra**

Create `tests/resolveReportSets.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { invalidSetIdReason, resolveReportSets } from "../src/reportSets/resolve.js";

const ALL = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"];

test("one valid set: its reports come out in registry order, split into phase and day keys", () => {
    const r = resolveReportSets([{ id: "NguyenVanA", reports: ["attendance", "loa", "netsupport", "dien"] }]);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.active, [{ id: "NguyenVanA", reports: ["netsupport", "loa", "dien", "attendance"], phaseKeys: ["netsupport", "loa"], dayKeys: ["dien", "attendance"] }]);
});

test("an id with Vietnamese letters and an inner space is valid", () => {
    const r = resolveReportSets([{ id: "Nguyễn Văn A", reports: ["loa"] }]);
    assert.deepEqual(r.problems, []);
    assert.equal(r.active[0].id, "Nguyễn Văn A");
});

test("reportSets missing, not an array or empty is a loud error and never throws", () => {
    for (const raw of [undefined, null, "x", 5, {}, []]) {
        const r = resolveReportSets(raw);
        assert.deepEqual(r.active, []);
        assert.equal(r.problems.length, 1, JSON.stringify(raw));
        assert.equal(r.problems[0].level, "error");
        assert.match(r.problems[0].message, /reportSets/);
    }
});

test("a set with no reports (missing, empty or not an array) is skipped with an error; the other sets still run", () => {
    for (const reports of [undefined, [], "loa"]) {
        const r = resolveReportSets([{ id: "A", reports }, { id: "B", reports: ["loa"] }]);
        assert.deepEqual(r.active.map((s) => s.id), ["B"]);
        assert.ok(r.problems.some((p) => p.level === "error" && p.setId === "A" && /chưa khai reports/.test(p.message)), JSON.stringify(reports));
    }
});

test("an unknown report code skips only that entry, names the code and lists the valid ones", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa", "maytinh", "dien"] }]);
    assert.deepEqual(r.active[0].reports, ["loa", "dien"]);
    const p = r.problems.find((x) => x.level === "error")!;
    assert.equal(p.setId, "A");
    assert.match(p.message, /"maytinh"/);
    assert.match(p.message, /netsupport, loa, internet, mayTinh, dien, cleaning, attendance/);
});

test("a set whose reports are all unknown is disabled", () => {
    const r = resolveReportSets([{ id: "A", reports: ["x"] }, { id: "B", reports: ["loa"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["B"]);
    assert.ok(r.problems.some((p) => p.setId === "A" && /không còn mã báo cáo hợp lệ/.test(p.message)));
});

test("a code listed twice in one set counts once, with a warning", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa", "loa"] }]);
    assert.deepEqual(r.active[0].reports, ["loa"]);
    assert.deepEqual(r.problems.map((p) => p.level), ["warning"]);
});

test("ids that differ only by case are duplicates: both sets are disabled", () => {
    const r = resolveReportSets([{ id: "NguyenVanA", reports: ["loa"] }, { id: "nguyenvana", reports: ["dien"] }, { id: "B", reports: ["loa"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["B"]);
    assert.ok(r.problems.some((p) => p.level === "error" && /trùng/.test(p.message)));
});

test("an invalid id disables only that set", () => {
    const bad = ["", " A", "A ", "A.", "a/b", "a\\b", "a:b", "a*b", 'a"b', "a<b", "a|b", "CON", "nul", "com1", "lpt9.txt", "x".repeat(101)];
    for (const id of bad) {
        const r = resolveReportSets([{ id, reports: ["loa"] }, { id: "Ok", reports: ["loa"] }]);
        assert.deepEqual(r.active.map((s) => s.id), ["Ok"], JSON.stringify(id));
        assert.ok(r.problems.some((p) => p.level === "error"), JSON.stringify(id));
    }
    assert.equal(invalidSetIdReason("Con Ga"), null);
    assert.equal(invalidSetIdReason("A-B_C 1"), null);
    assert.notEqual(invalidSetIdReason(5), null);
});

test("an entry that is not an object, or has no string id, is reported and skipped", () => {
    const r = resolveReportSets([null, "x", { reports: ["loa"] }, { id: 7, reports: ["loa"] }, { id: "Ok", reports: ["loa"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["Ok"]);
    assert.equal(r.problems.filter((p) => p.level === "error").length, 4);
});

test("the same code in two sets is allowed and only noted", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa"] }, { id: "B", reports: ["loa", "dien"] }]);
    assert.deepEqual(r.active.map((s) => s.id), ["A", "B"]);
    assert.deepEqual(r.problems.map((p) => p.level), ["warning"]);
    assert.match(r.problems[0].message, /"loa".*A, B/);
});

test("when no set survives, one extra error says the bot exports nothing", () => {
    const r = resolveReportSets([{ id: "A", reports: [] }]);
    assert.deepEqual(r.active, []);
    assert.ok(r.problems.some((p) => p.setId === null && /Không có bộ báo cáo hợp lệ nào/.test(p.message)));
});

test("all seven codes in one set is the current behaviour", () => {
    const r = resolveReportSets([{ id: "A", reports: ALL }]);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(r.active[0].phaseKeys, ["netsupport", "loa", "internet", "mayTinh"]);
    assert.deepEqual(r.active[0].dayKeys, ["dien", "cleaning", "attendance"]);
});
```

- [ ] **Step 6: Chạy test, xác nhận fail**

Run: `node --import tsx --test tests/resolveReportSets.test.ts`
Expected: FAIL (không tìm thấy `resolve.js`).

- [ ] **Step 7: Viết hàm kiểm tra**

Create `src/reportSets/resolve.ts`:

```ts
import { isReportKey, REPORT_DEFS, REPORT_KEYS, type ReportKey } from "./registry.js";

/** Một bộ đã qua kiểm tra: chỉ chứa mã hợp lệ, theo thứ tự xuất/in của bảng đăng ký. */
export interface ResolvedSet {
    id: string;
    reports: ReportKey[];
    /** Mã dựng theo giai đoạn (đọc từ tin "báo cáo đầu/cuối buổi dạy"). */
    phaseKeys: ReportKey[];
    /** Mã dựng theo ngày (điện, vệ sinh, nội quy). */
    dayKeys: ReportKey[];
}

export interface SetProblem {
    level: "error" | "warning";
    /** Bộ liên quan; null khi vấn đề chung (không có bộ nào, id trùng...). */
    setId: string | null;
    message: string;
}

export interface ResolveResult {
    active: ResolvedSet[];
    problems: SetProblem[];
}

const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** null nếu `id` dùng được làm tên thư mục trên Windows; ngược lại là lý do (tiếng Việt). */
export function invalidSetIdReason(id: unknown): string | null {
    if (typeof id !== "string") return "id phải là chuỗi";
    if (id.trim() === "") return "id không được rỗng";
    if (id !== id.trim()) return "id không được có khoảng trắng ở đầu hoặc cuối";
    if (INVALID_CHARS.test(id)) return 'id không được chứa \\ / : * ? " < > | hay ký tự điều khiển';
    if (id.endsWith(".")) return "id không được kết thúc bằng dấu chấm";
    if (RESERVED_NAMES.test(id.split(".")[0])) return `id "${id}" là tên thiết bị dành riêng của Windows`;
    if (id.length > 100) return "id dài quá 100 ký tự";
    return null;
}

/**
 * Đọc `config.reportSets`. KHÔNG BAO GIỜ ném lỗi: phần nào sai thì bị tắt và thành một `SetProblem`, phần còn lại vẫn chạy
 * (bot không dừng vì một lỗi gõ ở bộ này). Việc đưa các vấn đề ra màn hình/`runner:status` là của nơi gọi (`cliSet.ts`).
 */
export function resolveReportSets(raw: unknown): ResolveResult {
    const problems: SetProblem[] = [];
    const error = (setId: string | null, message: string): void => void problems.push({ level: "error", setId, message });
    const warn = (setId: string | null, message: string): void => void problems.push({ level: "warning", setId, message });

    if (!Array.isArray(raw)) {
        error(null, `reportSets phải là một mảng các bộ { id, reports } (đang là ${raw === undefined ? "chưa khai" : raw === null ? "null" : typeof raw}). Bot không xuất file nào cho tới khi sửa config.ts.`);
        return { active: [], problems };
    }
    if (raw.length === 0) {
        error(null, "reportSets đang rỗng: không có bộ nào xuất file. Thêm ít nhất một bộ { id, reports } trong config.ts.");
        return { active: [], problems };
    }

    interface Candidate {
        index: number;
        id: string;
        reports: unknown;
    }
    const candidates: Candidate[] = [];
    raw.forEach((entry, index) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            error(null, `reportSets[${index}] phải là một đối tượng { id, reports }. Mục này bị bỏ qua.`);
            return;
        }
        const { id, reports } = entry as Record<string, unknown>;
        const reason = invalidSetIdReason(id);
        if (reason !== null) {
            error(typeof id === "string" ? id : null, `reportSets[${index}]: ${reason}. Bộ này bị tắt.`);
            return;
        }
        candidates.push({ index, id: id as string, reports });
    });

    // Windows không phân biệt hoa thường: "NguyenVanA" và "nguyenvana" là CÙNG một thư mục.
    const byLower = new Map<string, Candidate[]>();
    for (const c of candidates) byLower.set(c.id.toLowerCase(), [...(byLower.get(c.id.toLowerCase()) ?? []), c]);
    const unique: Candidate[] = [];
    for (const group of byLower.values()) {
        if (group.length === 1) unique.push(group[0]);
        else error(null, `id trùng nhau (không phân biệt hoa thường): ${group.map((c) => `"${c.id}"`).join(", ")}. Các bộ này đều bị tắt.`);
    }
    unique.sort((a, b) => a.index - b.index);

    const active: ResolvedSet[] = [];
    for (const c of unique) {
        if (!Array.isArray(c.reports) || c.reports.length === 0) {
            error(c.id, `bộ "${c.id}" chưa khai reports (hoặc để rỗng) nên không xuất gì. Khai các mã: ${REPORT_KEYS.join(", ")}.`);
            continue;
        }
        const wanted = new Set<ReportKey>();
        for (const item of c.reports) {
            if (!isReportKey(item)) {
                error(c.id, `bộ "${c.id}": mã báo cáo ${JSON.stringify(item)} không tồn tại, bỏ qua mục này. Mã hợp lệ: ${REPORT_KEYS.join(", ")}.`);
                continue;
            }
            if (wanted.has(item)) {
                warn(c.id, `bộ "${c.id}": mã "${item}" khai hai lần, chỉ tính một.`);
                continue;
            }
            wanted.add(item);
        }
        const reports = REPORT_KEYS.filter((k) => wanted.has(k));
        if (reports.length === 0) {
            error(c.id, `bộ "${c.id}" không còn mã báo cáo hợp lệ nào nên bị tắt.`);
            continue;
        }
        active.push({ id: c.id, reports, phaseKeys: reports.filter((k) => REPORT_DEFS[k].kind === "phase"), dayKeys: reports.filter((k) => REPORT_DEFS[k].kind === "day") });
    }

    for (const key of REPORT_KEYS) {
        const owners = active.filter((s) => s.reports.includes(key)).map((s) => s.id);
        if (owners.length > 1) warn(null, `mã "${key}" có ở nhiều bộ (${owners.join(", ")}): file được xuất ra cả các thư mục đó.`);
    }
    if (active.length === 0) error(null, "Không có bộ báo cáo hợp lệ nào: bot không xuất file nào cho tới khi sửa config.ts.");
    return { active, problems };
}
```

- [ ] **Step 8: Chạy test, xác nhận pass**

Run: `node --import tsx --test tests/resolveReportSets.test.ts tests/reportRegistry.test.ts`
Expected: tất cả PASS.

- [ ] **Step 9: Thêm kiểu cấu hình, mục `reportSets` và tài liệu config**

Edit `src/types/config.ts`, thêm cuối file:

```ts

/** Một bộ báo cáo của một người phụ trách (xem `config.reportSets`). `reports` là mã nội bộ, được kiểm tra ở `src/reportSets/resolve.ts`. */
export interface ReportSetConfig {
    /** Tên thư mục của người: `<statusExportDir>/<yyMM>/<yyMMdd>/<id>/`. */
    id: string;
    reports: string[];
}
```

Edit `config.ts`: thêm import sau dòng `import { validateConfig } from "./src/config/configCheck.js";`:

```ts
import type { ReportSetConfig } from "./src/types/index.js";
```

và thêm ngay sau dòng `statusExportDir: path.join(repoRoot, "data", "export", "trang-thai"),`:

```ts

    /**
     * Bộ báo cáo theo NGƯỜI PHỤ TRÁCH. Mỗi bộ có `id` (tên thư mục của người: <statusExportDir>/<yyMM>/<yyMMdd>/<id>/, bot tự tạo) và
     * `reports` (các loại báo cáo của người đó, theo MÃ NỘI BỘ: netsupport, loa, internet, mayTinh, dien, cleaning, attendance; xem
     * `npm run reports:list`). KHÔNG có mặc định: bộ không khai `reports` thì không xuất gì. Mọi tin từ mọi nhóm trong `targets` đi qua
     * mọi bộ; một mã có thể nằm ở nhiều bộ. Cấu hình sai không làm bot dừng: phần sai bị tắt và báo lỗi ồn ào (màn hình khởi động,
     * `runner:status`, `total:status`, `config:show`). Khởi động lại bot:runner và bot:total sau khi đổi. Đổi `id` coi như bộ mới
     * (file cũ ở thư mục cũ không bị xoá).
     */
    reportSets: [
        { id: "NguyenVanA", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] },
    ] as ReportSetConfig[],
```

Edit `src/config/configDoc.ts`: thêm entry vào `SETTINGS` ngay sau entry `statusExportDir` (dòng có `path: "statusExportDir"`):

```ts
    { section: SECTIONS[0], path: "reportSets", unit: "", defaultLabel: "một bộ NguyenVanA với đủ 7 loại", readers: ["bot:runner", "runner:once", "bot:total", "total:once", "fill:status-reports", "extract:reports"], note: "Các bộ báo cáo theo người phụ trách: id (tên thư mục) và reports (mã nội bộ). Không có mặc định; sai thì bộ/mục đó bị tắt và báo lỗi.", format: (v) => (Array.isArray(v) ? v.map((s) => { const set = s as { id?: unknown; reports?: unknown }; return `${String(set.id)} [${Array.isArray(set.reports) ? set.reports.join(", ") : "?"}]`; }).join(" | ") : String(v)) },
```

- [ ] **Step 10: Chạy toàn bộ kiểm tra**

Run: `npm run typecheck && npm test`
Expected: sạch, `ℹ fail 0` (test `configDoc` "every key of config has a documented entry" phải pass nhờ entry mới).

- [ ] **Step 11: Commit**

```bash
git add src/reportSets/registry.ts src/reportSets/resolve.ts src/types/config.ts config.ts src/config/configDoc.ts tests/reportRegistry.test.ts tests/resolveReportSets.test.ts
git commit -m "feat(reportSets): bảng đăng ký mã báo cáo và hàm kiểm tra cấu hình không ném lỗi"
```

---

### Task 2: Đường dẫn theo bộ và lớp nối với CLI

**Files:**
- Modify: `src/core/paths.ts`
- Create: `src/reportSets/cliSet.ts`
- Create: `src/reportSets/legacy.ts`
- Test: `tests/setPaths.test.ts`, `tests/cliSet.test.ts`, `tests/legacyOverrides.test.ts`

**Interfaces:**
- Consumes: `statusReportDir`, `outputDir` (`src/core/paths.ts`); `ResolvedSet`, `SetProblem`, `resolveReportSets` (Task 1); `config.reportSets`.
- Produces:
  - `setReportDir(root: string, setId: string, day: string): string`; `setOutputDir(setId: string): string`.
  - `pickSet(sets: ResolvedSet[], arg: string | undefined): ResolvedSet` (ném `Error` tiếng Việt khi không chọn được); `requireKey(set: ResolvedSet, key: ReportKey): void` (ném khi bộ không bật mã); `describeProblem(p: SetProblem): string`; `loadReportSets(raw?: unknown): ResolveResult`; `logSetProblems(problems: SetProblem[], write?: (line: string) => void): void`; `hasSetErrors(problems: SetProblem[]): boolean`.
  - `legacyOverridesWarning(sets: ResolvedSet[], exists: (file: string) => boolean): string | null`.

- [ ] **Step 1: Viết test đường dẫn**

Create `tests/setPaths.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { outputDir, setOutputDir, setReportDir, statusReportDir } from "../src/core/paths.js";

test("setReportDir puts the person's folder inside the day: <root>/<yyMM>/<yyMMdd>/<id>", () => {
    assert.equal(setReportDir("D:\\BaoCao", "NguyenVanA", "2026-10-06"), path.join("D:\\BaoCao", "2610", "261006", "NguyenVanA"));
    assert.equal(setReportDir("D:\\BaoCao", "NguyenVanA", "261006"), path.join("D:\\BaoCao", "2610", "261006", "NguyenVanA"));
});

test("setReportDir keeps Vietnamese letters and inner spaces of the id as they are", () => {
    assert.equal(setReportDir("D:\\BaoCao", "Nguyễn Văn A", "2026-10-06"), path.join(statusReportDir("D:\\BaoCao", "2026-10-06"), "Nguyễn Văn A"));
});

test("setOutputDir is output/<id>", () => {
    assert.equal(setOutputDir("NguyenVanB"), path.join(outputDir, "NguyenVanB"));
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --import tsx --test tests/setPaths.test.ts`
Expected: FAIL (`setReportDir` không được export).

- [ ] **Step 3: Thêm hàm đường dẫn**

Edit `src/core/paths.ts`, thêm ngay sau hàm `statusReportDir` (trước dòng `/** The chat rules file the user edits. */`):

```ts

/**
 * Folder of ONE person's reports for a day: `<root>/<yyMM>/<yyMMdd>/<setId>`. The person's folder sits INSIDE the day, so
 * `statusReportDir` keeps its signature and the old per-day folder is simply the parent of every person's folder.
 */
export function setReportDir(root: string, setId: string, day: string): string {
    return path.join(statusReportDir(root, day), setId);
}

/** Work folder of one report set: `output/<setId>/` holds its `output.json`, `marks.json`, `review*.json`, `meta.json`, `overrides.json`. */
export function setOutputDir(setId: string): string {
    return path.join(outputDir, setId);
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --import tsx --test tests/setPaths.test.ts`
Expected: 3 test PASS.

- [ ] **Step 5: Viết test của `cliSet` và `legacy`**

Create `tests/cliSet.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeProblem, hasSetErrors, logSetProblems, pickSet, requireKey } from "../src/reportSets/cliSet.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";

const two = resolveReportSets([{ id: "A", reports: ["loa", "dien"] }, { id: "B", reports: ["mayTinh"] }]).active;
const one = resolveReportSets([{ id: "A", reports: ["loa"] }]).active;

test("pickSet: an explicit id picks that set exactly", () => {
    assert.equal(pickSet(two, "B").id, "B");
});

test("pickSet: no id is fine with exactly one active set", () => {
    assert.equal(pickSet(one, undefined).id, "A");
});

test("pickSet: no id with several sets asks for --set and lists them", () => {
    assert.throws(() => pickSet(two, undefined), /--set.*A, B/);
});

test("pickSet: an unknown id lists the valid ones; no active set says so", () => {
    assert.throws(() => pickSet(two, "C"), /"C".*A, B/);
    assert.throws(() => pickSet([], undefined), /không có bộ báo cáo nào/);
});

test("requireKey: a set that did not enable the report is refused with its list", () => {
    assert.doesNotThrow(() => requireKey(two[0], "dien"));
    assert.throws(() => requireKey(two[1], "dien"), /"B".*"dien".*mayTinh/);
});

test("describeProblem and logSetProblems print errors and warnings, errors first-class", () => {
    const r = resolveReportSets([{ id: "A", reports: ["loa", "x"] }]);
    const lines: string[] = [];
    logSetProblems(r.problems, (l) => lines.push(l));
    assert.equal(lines.length, r.problems.length);
    assert.match(describeProblem(r.problems[0]), /^\[bộ báo cáo\] LỖI \(A\): /);
    assert.equal(hasSetErrors(r.problems), true);
    assert.equal(hasSetErrors([{ level: "warning", setId: null, message: "m" }]), false);
});
```

Create `tests/legacyOverrides.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { outputDir, setOutputDir } from "../src/core/paths.js";
import { legacyOverridesWarning } from "../src/reportSets/legacy.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";

const sets = resolveReportSets([{ id: "A", reports: ["loa"] }, { id: "B", reports: ["mayTinh"] }]).active;
const legacy = path.join(outputDir, "overrides.json");

test("no legacy overrides.json: nothing to say", () => {
    assert.equal(legacyOverridesWarning(sets, () => false), null);
});

test("a legacy overrides.json with sets that have none of their own: warns, names the sets and the copy command", () => {
    const w = legacyOverridesWarning(sets, (f) => f === legacy)!;
    assert.match(w, /output[\\/]overrides\.json/);
    assert.match(w, /"A"/);
    assert.match(w, /"B"/);
    assert.match(w, /Copy-Item/);
});

test("sets that already have their own overrides.json are not named", () => {
    const w = legacyOverridesWarning(sets, (f) => f === legacy || f === path.join(setOutputDir("A"), "overrides.json"))!;
    assert.doesNotMatch(w, /"A"/);
    assert.match(w, /"B"/);
});

test("when every set has its own file the legacy one is harmless: no warning", () => {
    assert.equal(legacyOverridesWarning(sets, () => true), null);
});
```

- [ ] **Step 6: Chạy test, xác nhận fail**

Run: `node --import tsx --test tests/cliSet.test.ts tests/legacyOverrides.test.ts`
Expected: FAIL (không tìm thấy module).

- [ ] **Step 7: Viết `cliSet.ts` và `legacy.ts`**

Create `src/reportSets/cliSet.ts`:

```ts
import { config } from "../../config.js";
import type { ReportKey } from "./registry.js";
import { resolveReportSets, type ResolveResult, type ResolvedSet, type SetProblem } from "./resolve.js";

/** Đọc và kiểm tra `config.reportSets` (hoặc một giá trị khác, để test). Không ném lỗi. */
export function loadReportSets(raw: unknown = config.reportSets): ResolveResult {
    return resolveReportSets(raw);
}

export function describeProblem(p: SetProblem): string {
    return `[bộ báo cáo] ${p.level === "error" ? "LỖI" : "cảnh báo"}${p.setId ? ` (${p.setId})` : ""}: ${p.message}`;
}

export const hasSetErrors = (problems: SetProblem[]): boolean => problems.some((p) => p.level === "error");

/** In từng vấn đề (mặc định ra stderr). Gọi lúc khởi động bot và ở đầu các CLI. */
export function logSetProblems(problems: SetProblem[], write: (line: string) => void = (l) => console.error(l)): void {
    for (const p of problems) write(describeProblem(p));
}

/**
 * Chọn bộ cho một CLI: `--set <id>` chọn đúng bộ đó; bỏ trống chỉ hợp lệ khi đang có ĐÚNG MỘT bộ hợp lệ (để lệnh chạy tay
 * không phải gõ thêm khi chỉ có một người); ngược lại ném lỗi nói rõ phải chỉ ra bộ nào.
 */
export function pickSet(sets: ResolvedSet[], arg: string | undefined): ResolvedSet {
    if (sets.length === 0) throw new Error("không có bộ báo cáo nào hợp lệ trong config.reportSets (xem lỗi ở trên hoặc `npm run config:show`).");
    const ids = sets.map((s) => s.id).join(", ");
    if (arg === undefined) {
        if (sets.length === 1) return sets[0];
        throw new Error(`có ${sets.length} bộ báo cáo nên cần --set <id>. Các bộ: ${ids}.`);
    }
    const found = sets.find((s) => s.id === arg);
    if (!found) throw new Error(`không có bộ "${arg}" đang chạy. Các bộ: ${ids}.`);
    return found;
}

/** Chặn chạy tay một báo cáo mà bộ không bật (tránh ghi file vào thư mục của người không được giao báo cáo đó). */
export function requireKey(set: ResolvedSet, key: ReportKey): void {
    if (!set.reports.includes(key)) throw new Error(`bộ "${set.id}" không bật báo cáo "${key}" (reports: ${set.reports.join(", ")}).`);
}
```

Create `src/reportSets/legacy.ts`:

```ts
import path from "node:path";
import { outputDir, setOutputDir } from "../core/paths.js";
import type { ResolvedSet } from "./resolve.js";

/**
 * Trước khi có bộ báo cáo, mọi chỉnh sửa tin nằm ở MỘT `output/overrides.json`. Giờ mỗi bộ đọc `output/<id>/overrides.json` của riêng
 * nó (sửa dữ liệu của bộ này không đụng bộ khác), nên file cũ ở gốc không còn được dùng. Không tự chép cho mọi bộ (chủ ý: mỗi người tự
 * có chỉnh sửa của mình); thay vào đó báo ồn ào kèm lệnh chép tay. null nếu không có gì cần báo.
 */
export function legacyOverridesWarning(sets: ResolvedSet[], exists: (file: string) => boolean): string | null {
    const legacy = path.join(outputDir, "overrides.json");
    if (!exists(legacy)) return null;
    const missing = sets.filter((s) => !exists(path.join(setOutputDir(s.id), "overrides.json")));
    if (missing.length === 0) return null;
    const names = missing.map((s) => `"${s.id}"`).join(", ");
    const sample = missing[0];
    return `còn file chỉnh sửa cũ ${legacy} nhưng các bộ ${names} chưa có overrides.json riêng nên chỉnh sửa đó KHÔNG còn được áp dụng. Chép tay vào đúng bộ cần, ví dụ: New-Item -ItemType Directory -Force "${setOutputDir(sample.id)}"; Copy-Item "${legacy}" "${path.join(setOutputDir(sample.id), "overrides.json")}"`;
}
```

- [ ] **Step 8: Chạy test, xác nhận pass**

Run: `node --import tsx --test tests/cliSet.test.ts tests/legacyOverrides.test.ts tests/setPaths.test.ts`
Expected: tất cả PASS.

- [ ] **Step 9: Chạy toàn bộ kiểm tra rồi commit**

Run: `npm run typecheck && npm test`
Expected: sạch.

```bash
git add src/core/paths.ts src/reportSets/cliSet.ts src/reportSets/legacy.ts tests/setPaths.test.ts tests/cliSet.test.ts tests/legacyOverrides.test.ts
git commit -m "feat(reportSets): đường dẫn theo bộ, chọn bộ cho CLI và cảnh báo overrides.json cũ"
```

---

### Task 3: Trạng thái theo bộ (đã dựng, tracker, điện, lỗi chờ thử lại, gộp dấu, kế hoạch dựng)

**Files:**
- Modify: `src/runner/builtReports.ts` (thay `readBuilt`/`writeBuilt`/`initBuiltBaseline`)
- Modify: `src/lesson/statusFileTracker.ts` (`trackerKey` có `setId`)
- Modify: `src/lesson/electricState.ts` (thêm `electricBuiltPath`)
- Create: `src/runner/failedFills.ts`, `src/runner/mergeMarks.ts`, `src/runner/buildPlan.ts`
- Test: `tests/builtReports.test.ts` (viết lại phần bị đổi), `tests/statusFileTracker.test.ts` (sửa), `tests/failedFills.test.ts`, `tests/mergeMarks.test.ts`, `tests/buildPlan.test.ts`, `tests/electricState.test.ts` (thêm 1 test)

**Interfaces:**
- Consumes: `ResolvedSet`, `ReportKey` (Task 1); `messageKey` (`src/lesson/recovery.ts`); `affectedSessions`, `mergeSessions` (`src/runner/affectedSessions.ts`); `DEFAULT_RUNNER_FILES` (`src/runner/runnerState.ts`); `writeFileAtomic`.
- Produces:
  - `type BuiltBySet = Map<string, Set<string>>`; `readBuiltRaw(file?: string): unknown`; `loadBuiltBySet(raw: unknown, setIds: string[], messages: SourceMessage[]): { built: BuiltBySet; changed: boolean }`; `writeBuiltBySet(built: BuiltBySet, file?: string): void`. Giữ `reportKeys`, `sessionReportKeys`, `dirtySessions`.
  - `trackerKey(setId: string, day: string, phase: Phase, title: string): string`.
  - `electricBuiltPath(setId: string): string`.
  - `failedKey(setId, session, key): string`; `readFailed(file?): Set<string>`; `writeFailed(failed: Set<string>, file?): void`; `interface RetryPlan { session: SessionKey; keys: ReportKey[] }`; `retryPlans(failed: Set<string>, setId: string): RetryPlan[]`; `settle(failed: Set<string>, setId: string, session: SessionKey, attempted: ReportKey[], nowFailed: ReportKey[]): void`.
  - `mergeMarks(marks: Mark[]): Mark[]`.
  - `interface SetBuildPlan { session: SessionKey; keys: ReportKey[] }`; `planSetBuilds(set: ResolvedSet, messages: SourceMessage[], built: Set<string>, failed: Set<string>): SetBuildPlan[]`; `pendingBuilds(sets: ResolvedSet[], messages: SourceMessage[], built: BuiltBySet, failed: Set<string>): SessionKey[]`.

- [ ] **Step 1: Viết lại test của `builtReports`**

Replace trong `tests/builtReports.test.ts` các test dùng `readBuilt`/`writeBuilt`/`initBuiltBaseline` (test "built keys round-trip…" và "the first start treats…") và dòng import. Dòng import đầu trở thành:

```ts
import { dirtySessions, loadBuiltBySet, readBuiltRaw, reportKeys, sessionReportKeys, writeBuiltBySet } from "../src/runner/builtReports.js";
```

Thay hai test đó bằng:

```ts
test("built state round-trips per set; a missing file or a corrupt one reads as null", () => {
    const file = fresh();
    assert.equal(readBuiltRaw(file), null);
    writeBuiltBySet(new Map([["B", new Set(["g|2", "g|1"])], ["A", new Set(["g|3"])]]), file);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { A: ["g|3"], B: ["g|1", "g|2"] });
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.equal(readBuiltRaw(file), null);
});

test("the first start (no file) counts the reports that already exist as built, for every set", () => {
    const a = msg(COMPLETE, at(9));
    const { built, changed } = loadBuiltBySet(null, ["A", "B"], [a]);
    assert.equal(changed, true);
    assert.deepEqual([...built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...built.get("B")!], [messageKey(a)]);
});

test("the old format (one array) is handed to every current set, so nothing is rebuilt", () => {
    const a = msg(COMPLETE, at(8));
    const b = msg(IT_MAINTENANCE, at(13));
    const { built, changed } = loadBuiltBySet([messageKey(a), 7, null], ["A", "B"], [a, b]);
    assert.equal(changed, true);
    assert.deepEqual([...built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...built.get("B")!], [messageKey(a)]);
    assert.deepEqual(dirtySessions([a, b], built.get("A")!), [{ day: DAY, buoi: "afternoonstart" }]);
});

test("with no active set the old array is not consumed (nothing would be kept)", () => {
    const a = msg(COMPLETE, at(8));
    const { built, changed } = loadBuiltBySet([messageKey(a)], [], [a]);
    assert.equal(changed, false);
    assert.equal(built.size, 0);
});

test("a set added later gets a baseline of the reports that exist now; the others keep their state", () => {
    const a = msg(COMPLETE, at(8));
    const b = msg(IT_MAINTENANCE, at(13));
    const { built, changed } = loadBuiltBySet({ A: [messageKey(a)] }, ["A", "New"], [a, b]);
    assert.equal(changed, true);
    assert.deepEqual([...built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...built.get("New")!].sort(), [messageKey(a), messageKey(b)].sort());
});

test("known state is returned unchanged; a set that is no longer in config keeps its keys so it can come back", () => {
    const a = msg(COMPLETE, at(8));
    const { built, changed } = loadBuiltBySet({ A: [messageKey(a)], Old: ["x|1"] }, ["A"], [a]);
    assert.equal(changed, false);
    assert.deepEqual([...built.get("Old")!], ["x|1"]);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --import tsx --test tests/builtReports.test.ts`
Expected: FAIL (không có `loadBuiltBySet`).

- [ ] **Step 3: Sửa `builtReports.ts`**

Edit `src/runner/builtReports.ts`: giữ nguyên `reportKind`, `reportKeys`, `sessionReportKeys`, `dirtySessions`; xoá ba hàm `readBuilt`, `writeBuilt`, `initBuiltBaseline` và thay bằng:

```ts
/** Keys of the reports already built, per report set: `{ "<setId>": [messageKey...] }` on disk. */
export type BuiltBySet = Map<string, Set<string>>;

const stringSet = (v: unknown): Set<string> | null => (Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : null);

/** The parsed content of the built file; null when it is missing or unreadable. */
export function readBuiltRaw(file: string = DEFAULT_RUNNER_FILES.built): unknown {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

/**
 * Brings the built state in line with the sets that run now. `changed` = the result differs from what is on disk (so the caller writes it):
 * - no file (first start): every set starts with the reports that already exist counted as built (they were handled before the runner existed);
 * - the old format, ONE array: handed to every current set so an upgrade rebuilds nothing (not consumed when there is no set);
 * - a set that is new (no entry yet): the same baseline, otherwise adding a set would rebuild the whole history in the store;
 * - a set that is no longer in config keeps its keys so it can come back without a rebuild.
 */
export function loadBuiltBySet(raw: unknown, setIds: string[], messages: SourceMessage[]): { built: BuiltBySet; changed: boolean } {
    const built: BuiltBySet = new Map();
    const legacy = stringSet(raw);
    if (legacy !== null) {
        if (setIds.length === 0) return { built, changed: false };
        for (const id of setIds) built.set(id, new Set(legacy));
        return { built, changed: true };
    }
    if (typeof raw === "object" && raw !== null) {
        for (const [id, value] of Object.entries(raw)) {
            const keys = stringSet(value);
            if (keys !== null) built.set(id, keys);
        }
    }
    let changed = false;
    for (const id of setIds) {
        if (built.has(id)) continue;
        built.set(id, reportKeys(messages));
        changed = true;
    }
    return { built, changed };
}

export function writeBuiltBySet(built: BuiltBySet, file: string = DEFAULT_RUNNER_FILES.built): void {
    const obj: Record<string, string[]> = {};
    for (const [id, keys] of [...built].sort(([a], [b]) => a.localeCompare(b))) obj[id] = [...keys].sort();
    writeFileAtomic(file, JSON.stringify(obj, null, 2));
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --import tsx --test tests/builtReports.test.ts`
Expected: PASS (các test `reportKeys`, `sessionReportKeys`, `dirtySessions` không đổi vẫn pass).

- [ ] **Step 5: Sửa test và code của tracker**

Edit `tests/statusFileTracker.test.ts`: thay toàn bộ nội dung phần dùng `trackerKey` để có tham số `setId` đầu tiên:

```ts
test("trackerKey separates the same title across sets, days and phases", () => {
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("B", "2026-09-29", "morningstart", "LOA"));
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("A", "2026-09-29", "morningend", "LOA"));
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("A", "2026-09-30", "morningstart", "LOA"));
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("A", "2026-09-29", "morningstart", "INTERNET"));
});

test("staleName: the previously recorded file is stale only when it differs from the new one", () => {
    const key = trackerKey("A", "2026-09-29", "morningstart", "LOA");
    const state: TrackerState = { [key]: "LOA_260929_T3_1042.xlsx" };
    assert.equal(staleName(state, key, "LOA_260929_T3_1105.xlsx"), "LOA_260929_T3_1042.xlsx");
    assert.equal(staleName(state, key, "LOA_260929_T3_1042.xlsx"), null); // same minute -> overwritten in place, nothing to delete
    assert.equal(staleName({}, key, "LOA_260929_T3_1105.xlsx"), null); // first run for this phase
});

test("another phase's or another set's file is never reported stale", () => {
    const a = trackerKey("A", "2026-09-29", "morningstart", "LOA");
    const state: TrackerState = { [a]: "LOA_260929_T3_0840.xlsx" };
    assert.equal(staleName(state, trackerKey("A", "2026-09-29", "morningend", "LOA"), "LOA_260929_T3_1110.xlsx"), null);
    assert.equal(staleName(state, trackerKey("B", "2026-09-29", "morningstart", "LOA"), "LOA_260929_T3_0841.xlsx"), null);
});
```

và trong test cuối ("readTracker/writeTracker round-trip…") đổi khoá mẫu thành `"A|2026-09-29|morningstart|LOA"`.

Edit `src/lesson/statusFileTracker.ts`:

```ts
export function trackerKey(setId: string, day: string, phase: Phase, title: string): string {
    return `${setId}|${day}|${phase}|${title}`;
}
```

Cập nhật comment đầu file: thêm câu "Khoá có `setId` vì mỗi bộ ghi vào thư mục riêng và có bản cũ riêng."

- [ ] **Step 6: Thêm đường dẫn trạng thái điện theo bộ (test trước)**

Append vào `tests/electricState.test.ts` (đọc đầu file trước để dùng đúng import; nếu chưa import `path` thì thêm):

```ts
test("each set has its own electric state file, named after the set", async () => {
    const { electricBuiltPath, DEFAULT_ELECTRIC_BUILT_PATH } = await import("../src/lesson/electricState.js");
    const a = electricBuiltPath("NguyenVanA");
    const b = electricBuiltPath("NguyenVanB");
    assert.notEqual(a, b);
    assert.notEqual(a, DEFAULT_ELECTRIC_BUILT_PATH);
    assert.match(a, /\.electric-report\.NguyenVanA\.json$/);
});
```

Run: `node --import tsx --test tests/electricState.test.ts`
Expected: FAIL (`electricBuiltPath` chưa có).

Edit `src/lesson/electricState.ts`, thêm sau `DEFAULT_ELECTRIC_BUILT_PATH`:

```ts

/** Trạng thái ĐIỆN của một bộ: `data/.electric-report.<id>.json` (mỗi bộ có file ĐIỆN riêng trong thư mục riêng, nên chữ ký và tên file riêng). */
export const electricBuiltPath = (setId: string): string => path.join(config.dataDir, `.electric-report.${setId}.json`);
```

Run lại: `node --import tsx --test tests/electricState.test.ts` — Expected: PASS.

- [ ] **Step 7: Viết test và code `failedFills`**

Create `tests/failedFills.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { failedKey, readFailed, retryPlans, settle, writeFailed } from "../src/runner/failedFills.js";
import type { SessionKey } from "../src/types/index.js";

const S1: SessionKey = { day: "2026-10-06", buoi: "morningstart" };
const S2: SessionKey = { day: "2026-10-06", buoi: "afternoonend" };
const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "failed-")), ".runner-failed.json");

test("failedKey is <set>|<day>|<phase>|<report>", () => {
    assert.equal(failedKey("A", S1, "loa"), "A|2026-10-06|morningstart|loa");
});

test("settle removes what was attempted and adds only what failed now", () => {
    const failed = new Set([failedKey("A", S1, "loa"), failedKey("A", S1, "internet"), failedKey("B", S1, "loa")]);
    settle(failed, "A", S1, ["loa", "internet"], ["internet"]);
    assert.deepEqual([...failed].sort(), [failedKey("A", S1, "internet"), failedKey("B", S1, "loa")].sort());
});

test("settle leaves other sessions and other reports of the same session alone", () => {
    const failed = new Set([failedKey("A", S1, "loa"), failedKey("A", S2, "loa"), failedKey("A", S1, "mayTinh")]);
    settle(failed, "A", S1, ["loa"], []);
    assert.deepEqual([...failed].sort(), [failedKey("A", S2, "loa"), failedKey("A", S1, "mayTinh")].sort());
});

test("retryPlans groups the failed reports of ONE set by session, in registry order", () => {
    const failed = new Set([failedKey("A", S2, "mayTinh"), failedKey("A", S1, "loa"), failedKey("A", S1, "netsupport"), failedKey("B", S1, "loa")]);
    assert.deepEqual(retryPlans(failed, "A"), [
        { session: S2, keys: ["mayTinh"] },
        { session: S1, keys: ["netsupport", "loa"] },
    ]);
    assert.deepEqual(retryPlans(failed, "C"), []);
});

test("retryPlans ignores entries it cannot read", () => {
    const failed = new Set(["A|2026-10-06|bogus|loa", "A|2026-10-06|morningstart|nope", "garbage", failedKey("A", S1, "loa")]);
    assert.deepEqual(retryPlans(failed, "A"), [{ session: S1, keys: ["loa"] }]);
});

test("the failed list round-trips; a missing, corrupt or wrongly shaped file reads as empty", () => {
    const file = fresh();
    assert.deepEqual([...readFailed(file)], []);
    writeFailed(new Set([failedKey("A", S1, "loa")]), file);
    assert.deepEqual([...readFailed(file)], [failedKey("A", S1, "loa")]);
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.deepEqual([...readFailed(file)], []);
    fs.writeFileSync(file, JSON.stringify({ a: 1 }), "utf8");
    assert.deepEqual([...readFailed(file)], []);
});
```

Run: `node --import tsx --test tests/failedFills.test.ts` — Expected: FAIL (module chưa có).

Create `src/runner/failedFills.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { isPhase } from "../lesson/time.js";
import { isReportKey, REPORT_KEYS, type ReportKey } from "../reportSets/registry.js";
import type { SessionKey } from "../types/index.js";

/**
 * Các cặp (bộ, giai đoạn, mã báo cáo) mà lần điền file trước bị lỗi (mẫu thiếu, file đang mở trong Excel...). Một giai đoạn
 * vẫn được coi là "đã dựng" (tin đã đọc xong) dù một file của nó lỗi, nên việc thử lại không thể suy ra từ tập "đã dựng":
 * danh sách này nhớ chính xác cái gì cần điền lại. Mã báo cáo theo ngày không cần ở đây (chúng tự quét lại mỗi vòng).
 */
export const DEFAULT_FAILED_PATH = path.join(config.dataDir, ".runner-failed.json");

export const failedKey = (setId: string, session: SessionKey, key: ReportKey): string => `${setId}|${session.day}|${session.buoi}|${key}`;

/** File thiếu, hỏng hoặc sai dạng đều đọc ra rỗng (mất nhớ chỉ khiến một file lỗi không được tự thử lại). */
export function readFailed(file: string = DEFAULT_FAILED_PATH): Set<string> {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(v) ? new Set(v.filter((k): k is string => typeof k === "string")) : new Set();
    } catch {
        return new Set();
    }
}

export function writeFailed(failed: Set<string>, file: string = DEFAULT_FAILED_PATH): void {
    writeFileAtomic(file, JSON.stringify([...failed].sort(), null, 2));
}

export interface RetryPlan {
    session: SessionKey;
    keys: ReportKey[];
}

/** Các giai đoạn có file lỗi của MỘT bộ, kèm những mã cần điền lại (theo thứ tự bảng đăng ký). Mục đọc không ra thì bỏ qua. */
export function retryPlans(failed: Set<string>, setId: string): RetryPlan[] {
    const bySession = new Map<string, { session: SessionKey; keys: Set<ReportKey> }>();
    for (const entry of failed) {
        const [id, day, phase, key] = entry.split("|");
        if (id !== setId || !day || !isPhase(phase) || !isReportKey(key)) continue;
        const k = `${day}|${phase}`;
        const slot = bySession.get(k) ?? { session: { day, buoi: phase }, keys: new Set<ReportKey>() };
        slot.keys.add(key);
        bySession.set(k, slot);
    }
    return [...bySession.values()].map((s) => ({ session: s.session, keys: REPORT_KEYS.filter((k) => s.keys.has(k)) }));
}

/** Sau một lần điền: bỏ các mã vừa thử khỏi danh sách rồi thêm lại đúng những mã còn lỗi. */
export function settle(failed: Set<string>, setId: string, session: SessionKey, attempted: ReportKey[], nowFailed: ReportKey[]): void {
    for (const key of attempted) failed.delete(failedKey(setId, session, key));
    for (const key of nowFailed) failed.add(failedKey(setId, session, key));
}
```

Run: `node --import tsx --test tests/failedFills.test.ts` — Expected: PASS.

Lưu ý thứ tự khoá trong test `retryPlans`: kết quả theo thứ tự các mục được thêm vào `failed` (S2 trước S1); test đã viết đúng theo thứ tự đó.

- [ ] **Step 8: Viết test và code `mergeMarks`**

Create `tests/mergeMarks.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMarks } from "../src/runner/mergeMarks.js";

const m = (maTinNhan: string, maTrangThai: number, maNhom = "g") => ({ maNhom, maTinNhan, maTrangThai });

test("one mark per message: 'cần xem' (2) beats 'đã xử lý' (1) beats 'bỏ qua' (-1)", () => {
    const merged = mergeMarks([m("1", -1), m("1", 1), m("1", 2), m("2", 1), m("2", -1), m("3", -1)]);
    assert.deepEqual(merged, [m("1", 2), m("2", 1), m("3", -1)]);
});

test("the same message id in two groups is two messages", () => {
    assert.equal(mergeMarks([m("1", 1, "g1"), m("1", 2, "g2")]).length, 2);
});

test("equal ranks keep the first mark; an unknown status never beats a known one", () => {
    assert.deepEqual(mergeMarks([m("1", 1), m("1", 1)]), [m("1", 1)]);
    assert.deepEqual(mergeMarks([m("1", 99), m("1", 1)]), [m("1", 1)]);
    assert.deepEqual(mergeMarks([m("1", 1), m("1", 99)]), [m("1", 1)]);
});

test("no marks gives no marks", () => {
    assert.deepEqual(mergeMarks([]), []);
});
```

Run: `node --import tsx --test tests/mergeMarks.test.ts` — Expected: FAIL.

Create `src/runner/mergeMarks.ts`:

```ts
import type { Mark } from "../types/index.js";

// 2 = cần xem, 1 = đã xử lý, -1 = bỏ qua. Mã lạ có hạng 0 nên không bao giờ thắng mã đã biết.
const RANK = new Map<number, number>([[2, 3], [1, 2], [-1, 1]]);
const rank = (status: number): number => RANK.get(status) ?? 0;

/**
 * Một tin có thể nuôi nhiều bộ báo cáo, mỗi bộ ra một dấu riêng (chỉnh sửa theo bộ có thể làm hai bộ khác nhau). Cột StatusId của tin trong DB chỉ
 * có một giá trị nên gộp: "cần xem" (một bộ chưa chắc chắn) thắng "đã xử lý" thắng "bỏ qua". Thứ tự tin giữ theo lần xuất hiện đầu.
 */
export function mergeMarks(marks: Mark[]): Mark[] {
    const best = new Map<string, Mark>();
    for (const mark of marks) {
        const key = `${mark.maNhom}|${mark.maTinNhan}`;
        const current = best.get(key);
        if (!current || rank(mark.maTrangThai) > rank(current.maTrangThai)) best.set(key, mark);
    }
    return [...best.values()];
}
```

Run: `node --import tsx --test tests/mergeMarks.test.ts` — Expected: PASS.

- [ ] **Step 9: Viết test và code `buildPlan`**

Create `tests/buildPlan.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageKey } from "../src/lesson/recovery.js";
import { resolveReportSets } from "../src/reportSets/resolve.js";
import { failedKey } from "../src/runner/failedFills.js";
import { pendingBuilds, planSetBuilds } from "../src/runner/buildPlan.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg } from "./fixtures.js";

const [A, DAY_ONLY] = resolveReportSets([{ id: "A", reports: ["netsupport", "loa", "dien"] }, { id: "D", reports: ["dien", "cleaning"] }]).active;
const MORNING = { day: DAY, buoi: "morningstart" as const };
const AFTERNOON = { day: DAY, buoi: "afternoonstart" as const };
const a = msg(COMPLETE, at(8)); // morningstart
const b = msg(IT_MAINTENANCE, at(13)); // afternoonstart

test("an unbuilt session is planned with ALL the set's phase keys (not the day keys)", () => {
    assert.deepEqual(planSetBuilds(A, [a], new Set(), new Set()), [{ session: MORNING, keys: ["netsupport", "loa"] }]);
});

test("built sessions are not planned", () => {
    assert.deepEqual(planSetBuilds(A, [a, b], new Set([messageKey(a)]), new Set()), [{ session: AFTERNOON, keys: ["netsupport", "loa"] }]);
});

test("a set with only day keys never plans a phase build", () => {
    assert.deepEqual(planSetBuilds(DAY_ONLY, [a, b], new Set(), new Set([failedKey("D", MORNING, "loa")])), []);
});

test("a failed report of a built session is planned again with only the failed keys", () => {
    const failed = new Set([failedKey("A", MORNING, "loa")]);
    assert.deepEqual(planSetBuilds(A, [a], new Set([messageKey(a)]), failed), [{ session: MORNING, keys: ["loa"] }]);
});

test("a session that is both unbuilt and has failures is planned once with every phase key; sessions come out oldest first", () => {
    const failed = new Set([failedKey("A", MORNING, "loa")]);
    assert.deepEqual(planSetBuilds(A, [b, a], new Set([messageKey(a)]), failed), [
        { session: MORNING, keys: ["loa"] },
        { session: AFTERNOON, keys: ["netsupport", "loa"] },
    ]);
    assert.deepEqual(planSetBuilds(A, [a], new Set(), new Set([failedKey("A", MORNING, "loa")])), [{ session: MORNING, keys: ["netsupport", "loa"] }]);
});

test("failures of another set do not plan anything for this set; keys the set no longer enables are dropped", () => {
    assert.deepEqual(planSetBuilds(A, [a], new Set([messageKey(a)]), new Set([failedKey("D", MORNING, "loa")])), []);
    assert.deepEqual(planSetBuilds(A, [a], new Set([messageKey(a)]), new Set([failedKey("A", MORNING, "mayTinh")])), []);
});

test("pendingBuilds is the union of every set's planned sessions, oldest first", () => {
    const built = new Map([["A", new Set([messageKey(a)])], ["D", new Set<string>()]]);
    assert.deepEqual(pendingBuilds([A, DAY_ONLY], [a, b], built, new Set()), [AFTERNOON]);
});
```

Run: `node --import tsx --test tests/buildPlan.test.ts` — Expected: FAIL.

Create `src/runner/buildPlan.ts`:

```ts
import type { ReportKey } from "../reportSets/registry.js";
import type { ResolvedSet } from "../reportSets/resolve.js";
import type { SessionKey, SourceMessage } from "../types/index.js";
import { mergeSessions } from "./affectedSessions.js";
import { dirtySessions, type BuiltBySet } from "./builtReports.js";
import { retryPlans } from "./failedFills.js";

export interface SetBuildPlan {
    session: SessionKey;
    keys: ReportKey[];
}

/**
 * Việc dựng theo giai đoạn của MỘT bộ: mọi giai đoạn còn báo cáo chưa dựng (đủ mã theo giai đoạn của bộ) cộng các giai đoạn có file
 * lỗi cần điền lại (chỉ những mã lỗi). Bộ không có mã theo giai đoạn nào thì không có gì để dựng. Cũ nhất trước.
 */
export function planSetBuilds(set: ResolvedSet, messages: SourceMessage[], built: Set<string>, failed: Set<string>): SetBuildPlan[] {
    if (set.phaseKeys.length === 0) return [];
    const keysBySession = new Map<string, Set<ReportKey>>();
    const sessionKey = (s: SessionKey): string => `${s.day}|${s.buoi}`;
    const add = (session: SessionKey, keys: ReportKey[]): void => {
        const slot = keysBySession.get(sessionKey(session)) ?? new Set<ReportKey>();
        for (const k of keys) slot.add(k);
        keysBySession.set(sessionKey(session), slot);
    };
    const unbuilt = dirtySessions(messages, built);
    for (const session of unbuilt) add(session, set.phaseKeys);
    const retries = retryPlans(failed, set.id).map((r) => ({ session: r.session, keys: r.keys.filter((k) => set.phaseKeys.includes(k)) })).filter((r) => r.keys.length > 0);
    for (const r of retries) add(r.session, r.keys);
    return mergeSessions(unbuilt, retries.map((r) => r.session)).map((session) => ({
        session,
        keys: set.phaseKeys.filter((k) => keysBySession.get(sessionKey(session))!.has(k)),
    }));
}

/** Các giai đoạn còn việc dựng ở BẤT KỲ bộ nào (để runner biết có nên chạy một vòng). */
export function pendingBuilds(sets: ResolvedSet[], messages: SourceMessage[], built: BuiltBySet, failed: Set<string>): SessionKey[] {
    return mergeSessions(...sets.map((set) => planSetBuilds(set, messages, built.get(set.id) ?? new Set(), failed).map((p) => p.session)));
}
```

Run: `node --import tsx --test tests/buildPlan.test.ts` — Expected: PASS.

- [ ] **Step 10: Cập nhật chỗ gọi cũ để typecheck còn sạch tạm thời**

`readBuilt`, `writeBuilt`, `initBuiltBaseline` và `trackerKey` (3 tham số) còn được dùng ở `src/runner/steps.ts`, `src/cli/bot-runner.ts`, `src/cli/runner-once.ts`, `src/cli/runner-status.ts`, `src/cli/fill-status-reports.ts`, `src/total/runTotal.ts`. Chúng được sửa ở Task 4, 7 và 8; **typecheck sẽ lỗi cho tới hết Task 8**, nên Task 3 không chạy `npm run typecheck` toàn bộ mà chỉ chạy các test của chính nó:

Run: `node --import tsx --test tests/builtReports.test.ts tests/statusFileTracker.test.ts tests/failedFills.test.ts tests/mergeMarks.test.ts tests/buildPlan.test.ts tests/electricState.test.ts`
Expected: tất cả PASS.

(Lý do: `node --import tsx --test` không kiểm tra kiểu nên các test này chạy được trong khi các file CLI chưa sửa. Nếu người thực thi muốn mỗi commit đều typecheck sạch, làm Task 3 + Task 4 + Task 7 + Task 8 trên một nhánh và chỉ yêu cầu `npm run typecheck` sạch ở cuối Task 8.)

- [ ] **Step 11: Commit**

```bash
git add src/runner/builtReports.ts src/lesson/statusFileTracker.ts src/lesson/electricState.ts src/runner/failedFills.ts src/runner/mergeMarks.ts src/runner/buildPlan.ts tests/builtReports.test.ts tests/statusFileTracker.test.ts tests/electricState.test.ts tests/failedFills.test.ts tests/mergeMarks.test.ts tests/buildPlan.test.ts
git commit -m "feat(reportSets): trạng thái theo bộ (đã dựng, tracker, điện, lỗi chờ thử lại), gộp dấu và kế hoạch dựng"
```

---

### Task 4: `fill:status-reports` cô lập từng mã và nhận `--set`

**Files:**
- Create: `src/lesson/statusFill.ts`
- Modify: `src/cli/fill-status-reports.ts` (viết lại `main`)
- Test: `tests/statusFill.test.ts`

**Interfaces:**
- Consumes: `FillTemplateArgs` (`src/lesson/excelFill.ts`); `FileFillSpec`, `freeFormFileName`, `buildFillSpecs` (`src/lesson/statusReportLayout.ts`); `trackerKey`, `staleName`, `TrackerState` (Task 3); `ReportKey` (Task 1); `pickSet`, `loadReportSets`, `logSetProblems` (Task 2); `setOutputDir`, `setReportDir`.
- Produces:
  - `interface StatusFillDeps { templatesSrc: string; outDir: string; fill(args: FillTemplateArgs): string; readTitle(templatePath: string, sheet: string): string; removeFile(file: string): void; log(message: string): void; warn(message: string): void }`.
  - `interface StatusFillInput { setId: string; day: string; buoi: Phase; hhmm: string; keys: ReportKey[]; specs: Partial<Record<ReportKey, FileFillSpec>>; tracker: TrackerState }`.
  - `interface StatusFillResult { ok: ReportKey[]; failed: Array<{ key: ReportKey; message: string }> }`; `fillStatusFiles(input, deps): StatusFillResult`.
  - `FILL_FAILED_FILE = "fill-failed.json"`; `writeFillFailed(dir: string, keys: ReportKey[]): void`; `readFillFailed(dir: string): string[] | null`; `clearFillFailed(dir: string): void`.

- [ ] **Step 1: Viết test**

Create `tests/statusFill.test.ts`:

```ts
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { FillTemplateArgs } from "../src/lesson/excelFill.js";
import { clearFillFailed, fillStatusFiles, readFillFailed, writeFillFailed, type StatusFillDeps } from "../src/lesson/statusFill.js";
import { trackerKey } from "../src/lesson/statusFileTracker.js";
import { buildFillSpecs } from "../src/lesson/statusReportLayout.js";
import { DAY, at } from "./fixtures.js";

const specs = buildFillSpecs([], DAY, at(9, 0));
const KEYS = ["netsupport", "loa", "internet", "mayTinh"] as const;
const titleOf = (templatePath: string, sheet: string) => `T:${path.basename(templatePath, ".xlsx")}:${sheet}`;

function harness(over: Partial<StatusFillDeps> = {}) {
    const calls: string[] = [];
    const removed: string[] = [];
    const warnings: string[] = [];
    const deps: StatusFillDeps = {
        templatesSrc: "C:\\mau",
        outDir: "C:\\out\\A",
        fill: (a: FillTemplateArgs) => (calls.push(a.name), ""),
        readTitle: titleOf,
        removeFile: (f) => void removed.push(f),
        log: () => undefined,
        warn: (m) => void warnings.push(m),
        ...over,
    };
    return { deps, calls, removed, warnings };
}
const input = (tracker: Record<string, string> = {}, keys: Array<(typeof KEYS)[number]> = [...KEYS]) => ({ setId: "A", day: DAY, buoi: "morningstart" as const, hhmm: "0907", keys, specs, tracker });

test("every key is filled, in the given order, and recorded in the tracker under the set's key", () => {
    const { deps, calls } = harness();
    const tracker: Record<string, string> = {};
    const r = fillStatusFiles(input(tracker), deps);
    assert.deepEqual(calls, ["netsupport", "loa", "internet", "mayTinh"]);
    assert.deepEqual(r.ok, ["netsupport", "loa", "internet", "mayTinh"]);
    assert.deepEqual(r.failed, []);
    const k = trackerKey("A", DAY, "morningstart", titleOf("C:\\mau\\01 - FORM TINH TRANG AM THANH.xlsx", "1209"));
    assert.match(tracker[k], /_0907\.xlsx$/);
});

test("a key whose template title cannot be read (missing template) fails alone: the others after it still run", () => {
    const { deps, calls } = harness({
        readTitle: (p, s) => {
            if (p.includes("AM THANH")) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
            return titleOf(p, s);
        },
    });
    const r = fillStatusFiles(input(), deps);
    assert.deepEqual(r.ok, ["netsupport", "internet", "mayTinh"]);
    assert.deepEqual(r.failed.map((f) => f.key), ["loa"]);
    assert.match(r.failed[0].message, /ENOENT.*AM THANH/);
    assert.deepEqual(calls, ["netsupport", "internet", "mayTinh"]);
});

test("a failing fill keeps the old file and the old tracker entry, and drops the half-written new file", () => {
    const loaTitle = titleOf("C:\\mau\\01 - FORM TINH TRANG AM THANH.xlsx", "1209");
    const { deps, removed } = harness({ fill: (a) => { if (a.name === "loa") throw new Error("Access to the path is denied"); return ""; } });
    const tracker = { [trackerKey("A", DAY, "morningstart", loaTitle)]: "OLD-LOA.xlsx" };
    const r = fillStatusFiles(input(tracker), deps);
    assert.deepEqual(r.failed.map((f) => f.key), ["loa"]);
    assert.equal(tracker[trackerKey("A", DAY, "morningstart", loaTitle)], "OLD-LOA.xlsx");
    assert.ok(removed.includes(path.join("C:\\out\\A", `${loaTitle}_${DAY.slice(2, 4)}${DAY.slice(5, 7)}${DAY.slice(8, 10)}_T5_0907.xlsx`)), JSON.stringify(removed));
    assert.ok(!removed.some((f) => f.endsWith("OLD-LOA.xlsx")));
});

test("when removing the half-written file also fails (Excel holds it), the loop still goes on", () => {
    const { deps } = harness({
        fill: (a) => { if (a.name === "netsupport") throw new Error("denied"); return ""; },
        removeFile: () => { throw new Error("EBUSY"); },
    });
    const r = fillStatusFiles(input(), deps);
    assert.deepEqual(r.failed.map((f) => f.key), ["netsupport"]);
    assert.deepEqual(r.ok, ["loa", "internet", "mayTinh"]);
});

test("the old file of the same phase is removed AFTER the new one is written; failing to remove it is only a warning", () => {
    const loaTitle = titleOf("C:\\mau\\01 - FORM TINH TRANG AM THANH.xlsx", "1209");
    const { deps, warnings } = harness({ removeFile: () => { throw new Error("EBUSY"); } });
    const tracker = { [trackerKey("A", DAY, "morningstart", loaTitle)]: "OLD-LOA.xlsx" };
    const r = fillStatusFiles(input(tracker), deps);
    assert.deepEqual(r.failed, []);
    assert.ok(warnings.some((w) => w.includes("OLD-LOA.xlsx") && w.includes("EBUSY")), JSON.stringify(warnings));
});

test("another set's tracker entry is never touched", () => {
    const loaTitle = titleOf("C:\\mau\\01 - FORM TINH TRANG AM THANH.xlsx", "1209");
    const { deps, removed } = harness();
    const tracker = { [trackerKey("B", DAY, "morningstart", loaTitle)]: "B-LOA.xlsx" };
    fillStatusFiles(input(tracker), deps);
    assert.equal(tracker[trackerKey("B", DAY, "morningstart", loaTitle)], "B-LOA.xlsx");
    assert.ok(!removed.some((f) => f.endsWith("B-LOA.xlsx")));
});

test("only the requested keys are filled (a retry of one failed report)", () => {
    const { deps, calls } = harness();
    const r = fillStatusFiles(input({}, ["mayTinh"]), deps);
    assert.deepEqual(calls, ["mayTinh"]);
    assert.deepEqual(r.ok, ["mayTinh"]);
});

test("the failed-keys file round-trips, reads null when absent or malformed, and can be cleared", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fill-failed-"));
    assert.equal(readFillFailed(dir), null);
    writeFillFailed(dir, ["loa", "mayTinh"]);
    assert.deepEqual(readFillFailed(dir), ["loa", "mayTinh"]);
    clearFillFailed(dir);
    assert.equal(readFillFailed(dir), null);
    fs.writeFileSync(path.join(dir, "fill-failed.json"), "{ nope", "utf8");
    assert.equal(readFillFailed(dir), null);
    clearFillFailed(path.join(dir, "does-not-exist"));
});
```

- [ ] **Step 2: Chạy test, xác nhận fail**

Run: `node --import tsx --test tests/statusFill.test.ts`
Expected: FAIL (không tìm thấy `statusFill.js`).

- [ ] **Step 3: Viết `statusFill.ts`**

Create `src/lesson/statusFill.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import type { ReportKey } from "../reportSets/registry.js";
import type { Phase } from "../types/index.js";
import type { FillTemplateArgs } from "./excelFill.js";
import { staleName, trackerKey, type TrackerState } from "./statusFileTracker.js";
import { freeFormFileName, type FileFillSpec } from "./statusReportLayout.js";

/** Mọi thứ việc điền cần từ bên ngoài, để test được mà không cần Excel hay đĩa thật (bản thật nằm ở `src/cli/fill-status-reports.ts`). */
export interface StatusFillDeps {
    templatesSrc: string;
    outDir: string;
    fill(args: FillTemplateArgs): string;
    readTitle(templatePath: string, sheet: string): string;
    removeFile(file: string): void;
    log(message: string): void;
    warn(message: string): void;
}

export interface StatusFillInput {
    setId: string;
    day: string;
    buoi: Phase;
    /** Giờ chạy thực tế, dạng "HHmm", đóng dấu vào tên file. */
    hhmm: string;
    keys: ReportKey[];
    specs: Partial<Record<ReportKey, FileFillSpec>>;
    /** Sổ tên file mới nhất của từng (bộ, ngày, giai đoạn, tiêu đề); hàm này cập nhật nó tại chỗ. */
    tracker: TrackerState;
}

export interface StatusFillResult {
    ok: ReportKey[];
    failed: Array<{ key: ReportKey; message: string }>;
}

/**
 * Điền từng mã báo cáo theo giai đoạn của MỘT bộ. Mỗi mã nằm trong `try` riêng: việc đọc tiêu đề mẫu (mẫu thiếu), dựng tên, điền file, xoá
 * bản cũ và dọn bản ghi dở đều có thể lỗi mà không được làm dừng các mã còn lại. Mã lỗi: bản cũ và dòng tracker của nó được giữ nguyên.
 * Bản cũ của mã thành công chỉ bị xoá SAU khi bản mới ghi xong; xoá không được (đang mở trong Excel) thì chỉ cảnh báo.
 */
export function fillStatusFiles(input: StatusFillInput, deps: StatusFillDeps): StatusFillResult {
    const result: StatusFillResult = { ok: [], failed: [] };
    for (const key of input.keys) {
        let outName: string | undefined;
        try {
            const spec = input.specs[key];
            if (!spec) throw new Error(`không có dữ liệu dựng cho mã "${key}"`);
            const title = deps.readTitle(path.join(deps.templatesSrc, spec.templateFile), spec.sheet);
            outName = freeFormFileName(title, input.day, input.hhmm);
            const log = deps.fill({ name: key, templatesSrc: deps.templatesSrc, layout: spec, outDir: deps.outDir, outName, rows: spec.rows, headerCells: spec.headerCells, formulaCells: spec.formulaCells });
            if (log) deps.log(log);
            const k = trackerKey(input.setId, input.day, input.buoi, title);
            const old = staleName(input.tracker, k, outName);
            if (old) {
                try {
                    deps.removeFile(path.join(deps.outDir, old));
                } catch (err) {
                    deps.warn(`không xoá được bản cũ "${old}" (đang mở trong Excel?): ${(err as Error).message}`);
                }
            }
            input.tracker[k] = outName;
            result.ok.push(key);
        } catch (err) {
            result.failed.push({ key, message: (err as Error).message });
            // Bản mới ghi dở (mới chỉ chép từ file mẫu): bỏ đi. Xoá không được (file đang bị Excel giữ — chính là lý do "Access denied") thì bỏ qua.
            if (outName) {
                try {
                    deps.removeFile(path.join(deps.outDir, outName));
                } catch {
                    /* giữ nguyên file */
                }
            }
        }
    }
    return result;
}

/** File báo cho runner biết những mã nào của lần chạy này bị lỗi (script thoát mã 1 chỉ cho biết "có lỗi"). */
export const FILL_FAILED_FILE = "fill-failed.json";

export function writeFillFailed(dir: string, keys: ReportKey[]): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, FILL_FAILED_FILE), JSON.stringify(keys), "utf8");
}

/** null khi không có file hoặc file hỏng: người gọi coi là "không biết mã nào lỗi" và thử lại tất cả. */
export function readFillFailed(dir: string): string[] | null {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(path.join(dir, FILL_FAILED_FILE), "utf8"));
        return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : null;
    } catch {
        return null;
    }
}

export function clearFillFailed(dir: string): void {
    fs.rmSync(path.join(dir, FILL_FAILED_FILE), { force: true });
}
```

- [ ] **Step 4: Chạy test, xác nhận pass**

Run: `node --import tsx --test tests/statusFill.test.ts`
Expected: 8 test PASS. (Test "a failing fill keeps…" dựa vào `DAY = 2026-09-24` là thứ Năm nên `T5`; nếu `freeFormFileName` cho ra thứ khác thì sửa số trong assert theo kết quả thật của `freeFormFileName(title, DAY, "0907")` — không đổi hàm.)

- [ ] **Step 5: Viết lại `main` của `fill-status-reports.ts`**

Replace toàn bộ nội dung `src/cli/fill-status-reports.ts` bằng:

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { outputDir, setOutputDir, setReportDir } from "../core/paths.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { readTracker, writeTracker } from "../lesson/statusFileTracker.js";
import { clearFillFailed, fillStatusFiles, writeFillFailed } from "../lesson/statusFill.js";
import { buildFillSpecs, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { latestPerRoom } from "../lesson/statusRows.js";
import { hhmmVietnam, isPhase, todayVietnam } from "../lesson/time.js";
import { isReportKey, type ReportKey } from "../reportSets/registry.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
import type { Report } from "../types/index.js";

/**
 * Điền các file báo cáo tình trạng THEO GIAI ĐOẠN của MỘT bộ (`--set <id>`; bỏ trống khi chỉ có một bộ hợp lệ) từ `output/<id>/output.json`
 * (đã áp override, mỗi phòng chỉ lấy báo cáo MỚI NHẤT trong buổi): trong số NETSUPPORT, ÂM THANH (khoá `loa`), INTERNET và MÁY TÍNH, chỉ các mã
 * mà bộ bật (`--only a,b` thu hẹp thêm, dùng để thử lại đúng mã lỗi). ĐIỆN, VỆ SINH, NỘI QUY là báo cáo theo ngày với script riêng.
 * File ra `<config.statusExportDir>/<yyMM>/<yyMMdd>/<id>/<tiêu đề đọc từ ô A1 file mẫu>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` với HHmm là GIỜ CHẠY
 * THỰC TẾ. Vì tên không chứa giai đoạn, bản cũ của CÙNG (bộ, giai đoạn) được tìm bằng `data/.status-report-files.json` và xoá SAU khi bản mới
 * ghi xong. Mỗi mã chạy trong try riêng (xem `fillStatusFiles`): một mã lỗi — mẫu thiếu, file đang mở trong Excel — không làm dừng các mã còn
 * lại. Các mã lỗi được ghi vào `output/<id>/fill-failed.json` (runner đọc để thử lại đúng mã đó) và script thoát mã 1 SAU khi thử hết.
 * Mỗi file gọi PowerShell trong MỘT TIẾN TRÌNH RIÊNG (xử lý nhiều file Excel COM trong một tiến trình làm file sau lỗi "Specified cast is not
 * valid"). Không có macro, không qua Zalo — chỉ cần Excel cài trên máy.
 * Xem thiết kế: docs/superpowers/specs/2026-10-06-bo-bao-cao-theo-nguoi-design.md
 *
 *   npm run fill:status-reports -- [output.json] [--set <id>] [--only <mã,mã>] [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--now <unix ms>]
 *
 * Ngày/giai đoạn mặc định lấy từ `meta.json` cạnh `output.json` (do extract:reports ghi).
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    const workDir = setOutputDir(set.id);

    const inputPath = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--"))) ?? path.join(workDir, "output.json");
    // Mỗi phòng (maNhom+phongMay) chỉ giữ báo cáo mới nhất trong buổi: một phòng có cả báo cáo đầu và cuối buổi không còn ra 2 dòng (dupe giả),
    // và tình trạng thiết bị lấy đúng số liệu MỚI NHẤT thay vì luôn cố định theo đầu buổi.
    const reports = latestPerRoom(JSON.parse(fs.readFileSync(inputPath, "utf8")) as Report[]);

    const metaFile = path.join(path.dirname(path.resolve(inputPath)), "meta.json");
    const meta: { day?: string; buoi?: string } = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8").replace(/^﻿/, "")) : {};
    const day = option("--day") ?? meta.day ?? todayVietnam();
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isPhase(buoi)) throw new Error("Cần --buoi morningstart|morningend|afternoonstart|afternoonend hoặc meta.json do extract:reports tạo.");

    const only = option("--only");
    const keys: ReportKey[] = only === undefined ? set.phaseKeys : only.split(",").map((k) => k.trim()).filter((k) => k !== "").map((k) => {
        if (!isReportKey(k) || !set.phaseKeys.includes(k)) throw new Error(`--only "${k}": bộ "${set.id}" không bật mã theo giai đoạn này (có: ${set.phaseKeys.join(", ") || "không có"}).`);
        return k;
    });

    const outDir = setReportDir(config.statusExportDir, set.id, day);
    fs.mkdirSync(outDir, { recursive: true });
    clearFillFailed(workDir);

    const now = Number(option("--now") ?? Date.now());
    const tracker = readTracker();
    // ĐIỆN không làm ở đây: nó lấy từ tin "LỖI ĐIỆN" của cả ngày nên có chu trình riêng (fill-electric-report.ts).
    const specs = buildFillSpecs(reports, day, now);
    const result = fillStatusFiles(
        { setId: set.id, day, buoi, hhmm: hhmmVietnam(now), keys, specs, tracker },
        {
            templatesSrc: path.join(config.dataDir, "mau bao cao new"),
            outDir,
            fill: runFillTemplate,
            readTitle: readTemplateTitle,
            removeFile: (file) => fs.rmSync(file, { force: true }),
            log: (m) => console.log(m),
            warn: (m) => console.warn(`[fill-status] ${m}`),
        },
    );
    writeTracker(tracker);

    for (const f of result.failed) {
        console.error(`[fill-status] bộ "${set.id}", báo cáo "${f.key}" lỗi: ${f.message}`);
        // `runFillTemplate` ghi log PowerShell của từng mã ở output/fill-<mã>.log (thư mục output gốc; các bước chạy tuần tự nên không đè nhau).
        const logFile = path.join(outputDir, `fill-${f.key}.log`);
        if (fs.existsSync(logFile)) console.error(fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd());
    }
    if (result.failed.length > 0) writeFillFailed(workDir, result.failed.map((f) => f.key));

    console.log(`[fill-status] bộ ${set.id}: ${keys.map((k) => `${k}: ${specs[k]?.rows.length ?? 0}`).join(", ")}, buổi ${buoi} ngày ${day} -> ${outDir}${result.failed.length > 0 ? ` (LỖI: ${result.failed.map((f) => f.key).join(", ")})` : ""}`);
    if (result.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
```

Lưu ý: `runFillTemplate` ghi `fill-spec-<mã>.json` và `fill-<mã>.log` trong `output/` gốc (không phải `output/<id>/`); phần in lỗi ở trên đọc đúng chỗ đó.

- [ ] **Step 6: Chạy test của task**

Run: `node --import tsx --test tests/statusFill.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lesson/statusFill.ts src/cli/fill-status-reports.ts tests/statusFill.test.ts
git commit -m "feat(reportSets): fill:status-reports cô lập từng mã báo cáo và nhận --set"
```

---

### Task 5: `extract-reports` theo bộ

**Files:**
- Modify: `src/cli/extract-reports.ts`

**Interfaces:**
- Consumes: `loadReportSets`, `logSetProblems`, `pickSet` (Task 2); `setOutputDir` (Task 2).
- Produces: `extract-reports.ts` ghi `output.json`, `marks.json`, `review.json`, `meta.json` vào `output/<id>/` và đọc `output/<id>/overrides.json`.

- [ ] **Step 1: Sửa script**

Edit `src/cli/extract-reports.ts`:

(a) Thay dòng import `import { outputDir } from "../core/paths.js";` bằng:

```ts
import { setOutputDir } from "../core/paths.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
```

(b) Trong khối comment đầu, thay đoạn "writes, into `output/`:" và dòng lệnh để phản ánh bộ:

```
 * writes, into `output/<id>/` (`<id>` = the report set, `--set <id>`; omit it when exactly one set is active):
 *   output.json  — the valid reports (input of `fill:status-reports`)
 *   marks.json   — StatusId for every message considered (input of `mark:messages`)
 *   review.json  — reports the agent should check against the raw text
 *   meta.json    — { day, buoi } so `fill:status-reports` can name the files
 * `output/<id>/overrides.json`, when present, holds the agent's corrections for THAT set (editing one set's data never touches another's).
 *
 *   npm run extract:reports -- [--set <id>] [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--no-db]
```

(c) Xoá dòng `const outDir = outputDir;` và thay hàm `writeJson` bằng:

```ts
function writeJson(dir: string, file: string, value: unknown): void {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2), "utf8");
}
```

(d) Trong `main()`, ngay dòng đầu (trước `const day = ...`) thêm:

```ts
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    const outDir = setOutputDir(set.id);
```

(e) Thay bốn lệnh ghi:

```ts
    writeJson(outDir, "output.json", result.reports);
    writeJson(outDir, "marks.json", result.marks);
    writeJson(outDir, "review.json", result.review);
    writeJson(outDir, "meta.json", { day, buoi });
```

(f) Dòng log đầu ra: thay `console.log(\`[extract] ngày ${day}, buổi ${buoi}: ...` giữ nguyên nhưng thêm `bộ ${set.id}, ` ngay sau `[extract] `:

```ts
    console.log(`[extract] bộ ${set.id}, ngày ${day}, buổi ${buoi}: xét ${s.xet} tin, ${s.baoCao} báo cáo, ${s.boQua} tin bỏ qua (-1), ${s.canXem} mục cần xem${noDb ? " (không tra DB)" : ""}`);
```

và dòng cảnh báo `unknownOverrides` / dòng cuối đổi `output/overrides.json` thành `${path.join(outDir, "overrides.json")}`:

```ts
    for (const k of result.unknownOverrides) console.warn(`[extract] CẢNH BÁO: override cho maNhom=${k.maNhom} maTinNhan=${k.maTinNhan} không khớp tin nhắn nào — kiểm tra lại key trong ${path.join(outDir, "overrides.json")}.`);
    if (s.canXem > 0) console.log(`[extract] xem ${path.join(outDir, "review.json")}, sửa bằng ${path.join(outDir, "overrides.json")} rồi chạy lại lệnh này.`);
```

(g) `readOverrides(path.join(outDir, "overrides.json"))` đã dùng `outDir`; giữ.

- [ ] **Step 2: Typecheck riêng file này**

Run: `npx tsc --noEmit 2>&1 | findstr /i "extract-reports"`
Expected: không có lỗi nào nhắc `extract-reports.ts` (các lỗi ở file khác của Task 3 chưa sửa là bình thường).

- [ ] **Step 3: Chạy thật (không đụng DB)**

Run: `npx tsx src/cli/extract-reports.ts --no-db --day 2026-10-05 --buoi morningend`
Expected: in `[extract] bộ NguyenVanA, ngày 2026-10-05, buổi morningend: …`; các file `output/NguyenVanA/{output,marks,review,meta}.json` được tạo; `output/output.json` ở gốc **không** bị ghi lại (xem `git status`/thời gian file).

- [ ] **Step 4: Commit**

```bash
git add src/cli/extract-reports.ts
git commit -m "feat(reportSets): extract-reports ghi và đọc overrides trong output/<id>/"
```

---

### Task 6: Báo cáo theo ngày (điện, vệ sinh, nội quy) theo bộ

**Files:**
- Modify: `src/cli/fill-cleaning-report.ts`, `src/cli/fill-attendance-report.ts`, `src/cli/fill-electric-report.ts`

**Interfaces:**
- Consumes: `loadReportSets`, `logSetProblems`, `pickSet`, `requireKey` (Task 2); `setReportDir` (Task 2); `electricBuiltPath` (Task 3).
- Produces: ba script nhận `--set <id>` và ghi vào `setReportDir(config.statusExportDir, set.id, day)`; ĐIỆN dùng trạng thái `electricBuiltPath(set.id)`.

Các script này gọi `runFillReplacingSameDay(…, prefix)`, mà `pruneSiblings` chỉ quét thư mục đích — vì thư mục đích giờ là của bộ nên việc "mỗi ngày chỉ một file" tự áp dụng riêng cho từng bộ, không cần sửa `excelFill.ts`.

- [ ] **Step 1: `fill-cleaning-report.ts`**

(a) Thay import `import { statusReportDir } from "../core/paths.js";` bằng:

```ts
import { setReportDir } from "../core/paths.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
```

(b) Trong comment lệnh cuối khối doc: `npm run fill:cleaning-report -- [--now <unix ms>]` → `npm run fill:cleaning-report -- [--set <id>] [--now <unix ms>]`.

(c) Ở đầu `main()` (trước `const now = ...`) thêm:

```ts
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    requireKey(set, "cleaning");
```

(d) Thay `const outDir = statusReportDir(config.statusExportDir, day);` bằng `const outDir = setReportDir(config.statusExportDir, set.id, day);`.

(e) Dòng log cuối: `[fill-cleaning-report] bộ ${set.id}, ngày ${day}: ...` (thêm `bộ ${set.id}, `).

- [ ] **Step 2: `fill-attendance-report.ts`**

Làm đúng các thay đổi (a)–(e) như Step 1 nhưng với `requireKey(set, "attendance")`, lệnh `npm run fill:attendance-report -- [--set <id>] [--now <unix ms>]` và log `[fill-attendance-report] bộ ${set.id}, ngày ${day}: ...`. `option` đã được định nghĩa trong file trước `main`; `main()` hiện bắt đầu bằng `const now = Number(option("--now") ?? Date.now());`.

- [ ] **Step 3: `fill-electric-report.ts`**

(a) Import: thay `import { statusReportDir } from "../core/paths.js";` bằng:

```ts
import { setReportDir } from "../core/paths.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
```

và dòng import `electricState` thành:

```ts
import { electricBuiltPath, electricNeedsRebuild, electricSignature, readElectricBuilt, writeElectricBuilt } from "../lesson/electricState.js";
```

(b) Lệnh trong comment: `npm run fill:electric-report -- [--set <id>] [--now <unix ms>] [--force]`.

(c) Đầu `main()` thêm:

```ts
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    requireKey(set, "dien");
    const stateFile = electricBuiltPath(set.id);
```

(d) `const outDir = statusReportDir(config.statusExportDir, day);` → `const outDir = setReportDir(config.statusExportDir, set.id, day);`.

(e) `const prev = readElectricBuilt();` → `const prev = readElectricBuilt(stateFile);` và `writeElectricBuilt({ day, signature, file: outName });` → `writeElectricBuilt({ day, signature, file: outName }, stateFile);`.

(f) Hai dòng log thêm `bộ ${set.id}, `: `[fill-electric-report] bộ ${set.id}, ngày ${day}: ...`.

- [ ] **Step 4: Typecheck riêng ba file**

Run: `npx tsc --noEmit 2>&1 | findstr /i "fill-cleaning fill-attendance fill-electric"`
Expected: không có lỗi nhắc ba file này.

- [ ] **Step 5: Chạy thật một script (an toàn: ghi vào thư mục bộ, có Excel)**

Hỏi người dùng trước (script ghi file Excel thật vào thư mục xuất). Nếu được đồng ý:

Run: `npx tsx src/cli/fill-electric-report.ts --force`
Expected: `[fill-electric-report] bộ NguyenVanA, ngày <hôm nay>: N dòng -> …\<yyMM>\<yyMMdd>\NguyenVanA\TÌNH TRẠNG ĐIỆN_…xlsx`; file `data/.electric-report.NguyenVanA.json` được tạo.

- [ ] **Step 6: Commit**

```bash
git add src/cli/fill-cleaning-report.ts src/cli/fill-attendance-report.ts src/cli/fill-electric-report.ts
git commit -m "feat(reportSets): điện, vệ sinh và nội quy ghi vào thư mục của bộ"
```

---

### Task 7: Vòng runner theo bộ

**Files:**
- Modify: `src/types/runner.ts`
- Modify: `src/runner/cycle.ts`
- Modify: `src/runner/steps.ts`
- Modify: `src/cli/bot-runner.ts`, `src/cli/runner-once.ts`
- Modify: `tests/cycle.test.ts`
- Test: `tests/cycleSets.test.ts` (mới)

**Interfaces:**
- Consumes: `ResolvedSet`, `ReportKey`; `planSetBuilds`, `pendingBuilds` (Task 3); `loadBuiltBySet`, `readBuiltRaw`, `writeBuiltBySet`, `sessionReportKeys`, `BuiltBySet`; `readFailed`, `writeFailed`, `settle`; `mergeMarks`; `readFillFailed`; `setOutputDir`; `loadReportSets`, `logSetProblems`, `pickSet`, `legacyOverridesWarning`.
- Produces:
  - `BuildResult { reviewCount: number; excel: string | null; warnings: string[]; marks: Mark[]; failedKeys: string[] }`; `SetSummary { id: string; sessions: SessionKey[]; failedReports: string[] }`; `CycleSummary.sets?: SetSummary[]`.
  - `CycleDeps` mới: `sets(): ResolvedSet[]`, `build(set, session, keys): Promise<BuildResult>`, `buildExtras(set): Promise<string[]>`, `markMessages(marks: Mark[]): Promise<void>`, `built: { read(setIds: string[], messages: SourceMessage[]): BuiltBySet; write(built: BuiltBySet): void }`, `failed: { read(): Set<string>; write(failed: Set<string>): void }`.
  - `buildSet(set, session, keys): Promise<BuildResult>`, `markMerged(marks: Mark[]): Promise<void>` (export từ `steps.ts`); `realDeps(opts: { freshGaps: () => Gap[]; sets: () => ResolvedSet[] }): CycleDeps`.

- [ ] **Step 1: Sửa kiểu**

Edit `src/types/runner.ts`:

(a) thêm import đầu file (sau dòng `import type { SessionKey } from "./session.js";`):

```ts
import type { Mark } from "./report.js";
```

(b) thay `BuildResult`:

```ts
export interface BuildResult {
    reviewCount: number;
    /** Path of the Excel written; null when the session had no report with a known room. */
    excel: string | null;
    warnings: string[];
    /** The marks of this build's extract, merged across report sets before they are written to the database (src/runner/mergeMarks.ts). */
    marks: Mark[];
    /** Report codes of this build whose file failed (template missing, file open in Excel...); retried by a later cycle. */
    failedKeys: string[];
}

/** What a report set did in one cycle. */
export interface SetSummary {
    id: string;
    /** Sessions built (or attempted) for this set. */
    sessions: SessionKey[];
    /** `<day> <phase> <code>` of every report file that failed in this cycle. */
    failedReports: string[];
}
```

(c) trong `CycleSummary`, thêm trường sau `buildErrors`:

```ts
    /** Per report set: sessions built and report files that failed. Absent in log lines written before report sets existed. */
    sets?: SetSummary[];
```

- [ ] **Step 2: Viết test mới của vòng theo bộ (fail trước)**

Create `tests/cycleSets.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { messageKey } from "../src/lesson/recovery.js";
import { resolveReportSets, type ResolvedSet } from "../src/reportSets/resolve.js";
import type { ReportKey } from "../src/reportSets/registry.js";
import { runCycle, type CycleDeps } from "../src/runner/cycle.js";
import { failedKey } from "../src/runner/failedFills.js";
import { at, COMPLETE, DAY, msg } from "./fixtures.js";
import type { BuildResult, Mark, SessionKey, SourceMessage } from "../src/types/index.js";

const MORNING: SessionKey = { day: DAY, buoi: "morningstart" };
const ALL = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"];
const setsOf = (...specs: Array<{ id: string; reports: string[] }>): ResolvedSet[] => resolveReportSets(specs).active;

function harness(opts: { sets: ResolvedSet[]; messages?: SourceMessage[]; failed?: string[]; build?: (set: ResolvedSet, s: SessionKey, keys: ReportKey[]) => Promise<BuildResult>; extras?: (set: ResolvedSet) => Promise<string[]>; mark?: (m: Mark[]) => Promise<void> }) {
    const messages = [...(opts.messages ?? [])];
    let built = new Map<string, Set<string>>();
    let failed = new Set(opts.failed ?? []);
    const calls: string[] = [];
    const marked: Mark[][] = [];
    const deps: CycleDeps = {
        now: () => 5000,
        loadMessages: async () => [...messages],
        recover: async () => ({ errors: [] }),
        scrapeQueued: async () => ({ status: "done", targets: [], failed: [], gaveUp: [], outcomes: [] }),
        syncDb: async () => undefined,
        sets: () => opts.sets,
        build:
            opts.build ??
            (async (set, s, keys) => {
                calls.push(`build:${set.id}:${s.buoi}:${keys.join("+")}`);
                return { reviewCount: 1, excel: null, warnings: [], marks: [{ maNhom: "g", maTinNhan: "1", maTrangThai: 1 }], failedKeys: [] };
            }),
        buildExtras: opts.extras ?? (async (set) => (calls.push(`extras:${set.id}`), [])),
        markMessages: opts.mark ?? (async (m) => void marked.push(m)),
        built: {
            read: (ids) => {
                for (const id of ids) if (!built.has(id)) built.set(id, new Set());
                return built;
            },
            write: (b) => void (built = new Map(b)),
        },
        failed: { read: () => new Set(failed), write: (f) => void (failed = new Set(f)) },
    };
    return { deps, calls, marked, get built() { return built; }, get failed() { return failed; } };
}

test("each set builds its own unbuilt sessions with its own phase keys; the day extras run per set that has day keys", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({ sets: setsOf({ id: "A", reports: ALL }, { id: "B", reports: ["mayTinh", "cleaning"] }), messages: [a] });
    const s = await runCycle(h.deps);
    assert.deepEqual(h.calls, ["build:A:morningstart:netsupport+loa+internet+mayTinh", "extras:A", "build:B:morningstart:mayTinh", "extras:B"]);
    assert.equal(s.ok, true);
    assert.deepEqual(s.sets, [{ id: "A", sessions: [MORNING], failedReports: [] }, { id: "B", sessions: [MORNING], failedReports: [] }]);
    assert.deepEqual([...h.built.get("A")!], [messageKey(a)]);
    assert.deepEqual([...h.built.get("B")!], [messageKey(a)]);
});

test("a set with only day keys never builds a session; a set with only phase keys never runs the extras", async () => {
    const h = harness({ sets: setsOf({ id: "D", reports: ["dien", "cleaning"] }, { id: "P", reports: ["loa"] }), messages: [msg(COMPLETE, at(8))] });
    await runCycle(h.deps);
    assert.deepEqual(h.calls, ["extras:D", "build:P:morningstart:loa"]);
});

test("a build that throws for one set is reported with the set's id, leaves that set's session unbuilt, and the other set still builds", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({
        sets: setsOf({ id: "A", reports: ["loa"] }, { id: "B", reports: ["loa"] }),
        messages: [a],
        build: async (set) => {
            if (set.id === "A") throw new Error("extract-reports.ts thoát mã 1");
            return { reviewCount: 0, excel: null, warnings: [], marks: [], failedKeys: [] };
        },
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.match(s.buildErrors[0], /^A 2026-09-24 morningstart: extract-reports\.ts thoát mã 1/);
    assert.deepEqual([...h.built.get("A")!], []);
    assert.deepEqual([...h.built.get("B")!], [messageKey(a)]);
});

test("a report whose file failed is recorded for a retry; the session still counts as built and the cycle is ok", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({
        sets: setsOf({ id: "A", reports: ["netsupport", "loa", "internet"] }),
        messages: [a],
        build: async () => ({ reviewCount: 0, excel: null, warnings: ["fill-status-reports: thoát mã 1"], marks: [], failedKeys: ["loa"] }),
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.deepEqual([...h.failed], [failedKey("A", MORNING, "loa")]);
    assert.deepEqual(s.sets![0].failedReports, ["2026-09-24 morningstart loa"]);
    assert.deepEqual([...h.built.get("A")!], [messageKey(a)]);
    assert.ok(s.warnings.some((w) => w.startsWith("A: ") && w.includes("fill-status-reports")), JSON.stringify(s.warnings));
});

test("the next cycle retries ONLY the failed report of the built session, and clears it when it succeeds", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({ sets: setsOf({ id: "A", reports: ["netsupport", "loa", "internet"] }), messages: [a], failed: [failedKey("A", MORNING, "loa")] });
    h.deps.built.read(["A"], [a]);
    h.built.get("A")!.add(messageKey(a));
    const s = await runCycle(h.deps);
    // Bộ A chỉ có mã theo giai đoạn nên không chạy extras; chỉ có đúng một lần dựng lại, và chỉ mã `loa`.
    assert.deepEqual(h.calls, ["build:A:morningstart:loa"]);
    assert.deepEqual([...h.failed], []);
    assert.deepEqual(s.sets![0].failedReports, []);
});

test("the marks of every set are merged and written ONCE per cycle", async () => {
    const a = msg(COMPLETE, at(8));
    const h = harness({
        sets: setsOf({ id: "A", reports: ["loa"] }, { id: "B", reports: ["loa"] }),
        messages: [a],
        build: async (set) => ({ reviewCount: 0, excel: null, warnings: [], marks: [{ maNhom: "g", maTinNhan: "1", maTrangThai: set.id === "A" ? 1 : 2 }], failedKeys: [] }),
    });
    await runCycle(h.deps);
    assert.deepEqual(h.marked, [[{ maNhom: "g", maTinNhan: "1", maTrangThai: 2 }]]);
});

test("a failure to write the marks is only a warning (the cycle is still ok)", async () => {
    const h = harness({ sets: setsOf({ id: "A", reports: ["loa"] }), messages: [msg(COMPLETE, at(8))], mark: async () => { throw new Error("DB down"); } });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.ok(s.warnings.some((w) => w.includes("đánh dấu tin") && w.includes("DB down")), JSON.stringify(s.warnings));
});

test("with no active set nothing is built, no extras run, and the cycle is still ok", async () => {
    const h = harness({ sets: [], messages: [msg(COMPLETE, at(8))] });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.deepEqual(h.calls, []);
    assert.deepEqual(s.sets, []);
});

test("a failure of the day extras of one set is a warning naming the set; the other set's extras still run", async () => {
    const h = harness({
        sets: setsOf({ id: "A", reports: ["dien"] }, { id: "B", reports: ["dien"] }),
        extras: async (set) => {
            if (set.id === "A") throw new Error("Excel COM lỗi");
            return ["B: fill-điện: thoát mã 1"];
        },
    });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.ok(s.warnings.some((w) => w.includes("A") && w.includes("Excel COM lỗi")));
    assert.ok(s.warnings.includes("B: fill-điện: thoát mã 1"));
});
```

Run: `node --import tsx --test tests/cycleSets.test.ts`
Expected: FAIL (`CycleDeps` chưa có `sets`...; test chạy không kiểm tra kiểu nên sẽ fail ở hành vi).

- [ ] **Step 3: Viết lại `cycle.ts`**

Replace toàn bộ nội dung `src/runner/cycle.ts`:

```ts
import { mergeSessions } from "./affectedSessions.js";
import { planSetBuilds } from "./buildPlan.js";
import { sessionReportKeys, type BuiltBySet } from "./builtReports.js";
import { settle } from "./failedFills.js";
import { mergeMarks } from "./mergeMarks.js";
import type { ReportKey } from "../reportSets/registry.js";
import type { ResolvedSet } from "../reportSets/resolve.js";
import type { BuildResult, CycleSummary, Mark, QueueRunResult, SessionKey, SetSummary, SourceMessage, StepMs } from "../types/index.js";

export interface CycleDeps {
    now(): number;
    loadMessages(): Promise<SourceMessage[]>;
    /** Re-scrapes groups missing reports if `bot:watch` had a gap in the current session; never throws for a single group. */
    recover(): Promise<{ errors: string[] }>;
    /** Snapshot the queue, scrape exactly those groups, mark exactly those as scraped; failed groups stay queued for a retry (src/scrape/queueRun.ts). Throws if Zalo Desktop is unreachable. */
    scrapeQueued(): Promise<QueueRunResult>;
    syncDb(): Promise<void>;
    /** The report sets that run (already checked: `resolveReportSets`). */
    sets(): ResolvedSet[];
    /**
     * Extract one session for one set and fill the set's per-phase files `keys` (all of them for a new session, only the failed ones for a
     * retry). A file that fails does NOT throw: its code comes back in `failedKeys`. Throws only when the extract itself fails.
     */
    build(set: ResolvedSet, session: SessionKey, keys: ReportKey[]): Promise<BuildResult>;
    /** The per-day reports (điện, vệ sinh, nội quy) of ONE set; runs once per cycle for every set that has day keys. NEVER throws: every error becomes a warning in the returned array. */
    buildExtras(set: ResolvedSet): Promise<string[]>;
    /** Writes StatusId/HasRead for the merged marks of the whole cycle, in one go. */
    markMessages(marks: Mark[]): Promise<void>;
    /** Keys of the reports already built, per set; kept on disk (src/runner/builtReports.ts). `read` also gives a new set its baseline. */
    built: { read(setIds: string[], messages: SourceMessage[]): BuiltBySet; write(built: BuiltBySet): void };
    /** (set, session, report) triples whose file failed last time; kept on disk (src/runner/failedFills.ts). */
    failed: { read(): Set<string>; write(failed: Set<string>): void };
}

const label = (s: SessionKey): string => `${s.day} ${s.buoi}`;

/**
 * One runner cycle. A scrape or sync failure fails the cycle (`errors`) and leaves the queue as it was. What to build is not a diff
 * of this cycle: for every report set it is every session with a report that is on disk but not yet in the set's built keys, plus the
 * report files that failed last time (so a cycle that died after scraping, or messages scraped by hand, are built now). A session is
 * added to the set's built keys only after its extract succeeded; an extract failure goes to `buildErrors`, does not fail the cycle and
 * is retried later. A report FILE that fails is recorded in the failed list and retried alone. Sets run one after another and each
 * is isolated: one set's failure never stops another. Sync runs every cycle because it is idempotent and an earlier crash may have
 * left scraped rows out of the database. The marks of all sets are merged and written once at the end.
 */
export async function runCycle(deps: CycleDeps): Promise<CycleSummary> {
    const startedAt = deps.now();
    const summary: CycleSummary = { kind: "cycle", at: startedAt, ok: true, groups: [], sessions: [], reviewCount: 0, excel: [], warnings: [], errors: [], buildErrors: [], sets: [] };
    const stepMs: StepMs = { recover: 0, scrape: 0, load: 0, sync: 0, build: 0 };
    let mark = startedAt;
    const lap = (step: keyof StepMs) => {
        const t = deps.now();
        stepMs[step] += t - mark;
        mark = t;
    };
    try {
        const recovery = await deps.recover();
        lap("recover");
        for (const e of recovery.errors) summary.warnings.push(`khôi phục: ${e}`);

        const scrape = await deps.scrapeQueued();
        lap("scrape");
        if (scrape.status === "done") {
            summary.groups = scrape.targets;
            summary.timings = scrape.outcomes
                .filter((o) => typeof o.ms === "number")
                .map((o) => ({ target: o.target, ms: o.ms as number, ok: o.error === undefined, ...(o.scraped !== undefined ? { scraped: o.scraped } : {}), ...(o.written !== undefined ? { written: o.written } : {}) }));
            for (const t of scrape.failed) summary.warnings.push(`không cào được "${t}"`);
            for (const t of scrape.gaveUp) summary.warnings.push(`đã bỏ "${t}" khỏi hàng chờ sau nhiều lần lỗi; cào lại bằng: npm run scrape:add -- "${t}"`);
        }

        const messages = await deps.loadMessages();
        const sets = deps.sets();
        const built = deps.built.read(sets.map((s) => s.id), messages);
        const failed = deps.failed.read();
        lap("load");

        await deps.syncDb();
        lap("sync");

        const marks: Mark[] = [];
        const touched: SessionKey[][] = [];
        for (const set of sets) {
            const setSummary: SetSummary = { id: set.id, sessions: [], failedReports: [] };
            summary.sets!.push(setSummary);
            try {
                const builtKeys = built.get(set.id) ?? new Set<string>();
                built.set(set.id, builtKeys);
                for (const plan of planSetBuilds(set, messages, builtKeys, failed)) {
                    try {
                        const result = await deps.build(set, plan.session, plan.keys);
                        setSummary.sessions.push(plan.session);
                        summary.reviewCount += result.reviewCount;
                        if (result.excel) summary.excel.push(result.excel);
                        summary.warnings.push(...result.warnings.map((w) => `${set.id}: ${w}`));
                        marks.push(...result.marks);
                        settle(failed, set.id, plan.session, plan.keys, result.failedKeys as ReportKey[]);
                        for (const key of result.failedKeys) setSummary.failedReports.push(`${label(plan.session)} ${key}`);
                        for (const key of sessionReportKeys(messages, plan.session)) builtKeys.add(key);
                        deps.built.write(built);
                        deps.failed.write(failed);
                    } catch (err) {
                        summary.buildErrors.push(`${set.id} ${label(plan.session)}: ${(err as Error).message}`);
                    }
                    lap("build");
                }
                touched.push(setSummary.sessions);
                if (set.dayKeys.length > 0) {
                    try {
                        summary.warnings.push(...(await deps.buildExtras(set)));
                    } catch (err) {
                        // Hợp đồng buildExtras() là không throw; bọc thêm phòng khi cài đặt tương lai vi phạm hợp đồng đó.
                        summary.warnings.push(`${set.id}: buildExtras: ${(err as Error).message}`);
                    }
                    lap("build");
                }
            } catch (err) {
                summary.buildErrors.push(`${set.id}: ${(err as Error).message}`);
            }
        }
        summary.sessions = mergeSessions(...touched);

        if (marks.length > 0) {
            try {
                await deps.markMessages(mergeMarks(marks));
            } catch (err) {
                summary.warnings.push(`đánh dấu tin: ${(err as Error).message}`);
            }
            lap("build");
        }
    } catch (err) {
        summary.ok = false;
        summary.errors.push((err as Error).message);
    }
    summary.durationMs = deps.now() - startedAt;
    summary.stepMs = stepMs;
    return summary;
}
```

- [ ] **Step 4: Chạy test của vòng theo bộ**

Run: `node --import tsx --test tests/cycleSets.test.ts`
Expected: tất cả PASS (sau khi `cycle.ts` ở Step 3 đã viết xong).

- [ ] **Step 5: Cập nhật `tests/cycle.test.ts` theo `CycleDeps` mới**

Edit `tests/cycle.test.ts`:

(a) Import: thêm
```ts
import { resolveReportSets } from "../src/reportSets/resolve.js";
```
và đổi dòng type import thành:
```ts
import type { BuildResult, QueueRunResult, SessionKey, SourceMessage } from "../src/types/index.js";
```

(b) Thêm hằng ngay sau khai báo `AFTERNOON`:

```ts
const SET = resolveReportSets([{ id: "A", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] }]).active;
```

(c) Trong `harness(...)`: đổi kiểu tham số `build` và `buildExtras`, dựng `deps` mới:

```ts
    build?: (s: SessionKey) => Promise<BuildResult>;
    buildExtras?: () => Promise<string[]>;
```
(giữ chữ ký tham số đơn giản của test; harness bọc lại), và trong `deps`:

```ts
        sets: () => SET,
        build: async (_set, s) => {
            if (opts.build) return opts.build(s);
            calls.push(`build:${s.day} ${s.buoi}`);
            return { reviewCount: 1, excel: `x_${s.buoi}.xlsm`, warnings: [], marks: [], failedKeys: [] };
        },
        buildExtras: async () => (opts.buildExtras ? opts.buildExtras() : []),
        markMessages: async () => undefined,
        built: {
            read: (ids) => {
                for (const id of ids) if (!builtMap.has(id)) builtMap.set(id, new Set(opts.built ?? []));
                return builtMap;
            },
            write: (b) => void (builtMap = new Map(b)),
        },
        failed: { read: () => new Set(), write: () => undefined },
```
và khai báo `let builtMap = new Map<string, Set<string>>();` thay cho `let built = new Set(opts.built ?? []);`, và getter `get built() { return builtMap.get("A") ?? new Set<string>(); }`.

(d) Sửa các assert bị đổi:
- Test đầu: `assert.deepEqual(h.calls, ["recover", "scrape", "sync", "build:2026-09-24 morningstart", "build:2026-09-24 afternoonstart"]);` — `calls` giờ không chứa `recover/scrape/sync` thứ tự cũ? Giữ nguyên: harness vẫn `calls.push("recover")` v.v. trong `recover`/`scrapeQueued`/`syncDb`; `build` vẫn push `build:...` (như trên). Không đổi.
- Test "build warnings … reach the summary": `build` trả `{ reviewCount: 0, excel: "b_moi.xlsm", warnings: ["file đang mở, đã lưu thành b_moi.xlsm"] }` → thêm `marks: [], failedKeys: []` vào object, và assert thành `assert.deepEqual(s.warnings, ["A: file đang mở, đã lưu thành b_moi.xlsm"]);`.
- Test "a build failure is reported…": hai chỗ `return { reviewCount: 0, excel: "x_afternoonstart.xlsm", warnings: [] }` thêm `marks: [], failedKeys: []`; assert `assert.match(s.buildErrors[0], /A 2026-09-24 morningstart: Excel COM failed/);`.
- Mọi object `BuildResult` khác trong file thêm `marks: [], failedKeys: []`.
- Test "runCycle calls buildExtras exactly once…": giữ nguyên (một bộ có khoá theo ngày nên đúng một lần).
- Test "runCycle: a buildExtras failure becomes a warning": assert `s.warnings.some((w) => w.includes("Excel COM lỗi"))` vẫn đúng (cảnh báo có tiền tố `A: buildExtras: Excel COM lỗi`).
- Test "runCycle: buildExtras returning warnings…": `assert.ok(s.warnings.includes("fill-vệ sinh: thoát mã 1"))` vẫn đúng vì `buildExtras` trả nguyên (tiền tố `A:` do `steps.ts` thêm, không phải cycle).

Run: `node --import tsx --test tests/cycle.test.ts tests/cycleSets.test.ts`
Expected: tất cả PASS.

- [ ] **Step 6: Viết lại `steps.ts`**

Edit `src/runner/steps.ts`:

(a) Imports: thay các dòng import liên quan bằng (giữ các import không nhắc tới):

```ts
import { outputDir, repoRoot, setOutputDir, srcDir } from "../core/paths.js";
import { readFillFailed } from "../lesson/statusFill.js";
import type { ReportKey } from "../reportSets/registry.js";
import type { ResolvedSet } from "../reportSets/resolve.js";
import { loadBuiltBySet, readBuiltRaw, writeBuiltBySet } from "./builtReports.js";
import { readFailed, writeFailed } from "./failedFills.js";
import type { BuildResult, Gap, Mark, SessionKey, SourceMessage } from "../types/index.js";
```
(xoá `readBuilt`, `writeBuilt` khỏi import `./builtReports.js` cũ; dòng `import { readBuilt, writeBuilt } from "./builtReports.js";` bị thay.)

(b) Thay hàm `buildSession` (toàn bộ, kể cả comment phía trên nó) bằng:

```ts
/**
 * Extract ONE session for ONE report set into `output/<id>/` and fill the set's per-phase files `keys`. The extract must succeed (it
 * throws otherwise); a file that fails is NOT an error of the build: its code goes to `failedKeys` and the runner retries it alone.
 * Marking the messages is not done here: the runner merges the marks of all sets and writes them once (`markMerged`).
 * The old `.xlsm`-via-temp-file build (`fill:report`) is RETIRED from this pipeline as of 2026-09-29 (its template disappeared and the
 * tables it made are superseded by `fill:status-reports`), so `BuildResult.excel` is always `null`.
 */
export async function buildSet(set: ResolvedSet, session: SessionKey, keys: ReportKey[]): Promise<BuildResult> {
    const dir = setOutputDir(set.id);
    const warnings: string[] = [];
    await mustRun("extract-reports.ts", ["--day", session.day, "--buoi", session.buoi, "--set", set.id]);
    const review = JSON.parse(fs.readFileSync(path.join(dir, "review.json"), "utf8")) as unknown[];
    // review.json belongs to whichever session was built last; keep one per session for the agent.
    fs.copyFileSync(path.join(dir, "review.json"), path.join(dir, `review_${session.day}_${session.buoi}.json`));
    const marks = JSON.parse(fs.readFileSync(path.join(dir, "marks.json"), "utf8")) as Mark[];

    // Nếu Excel đang mở sẵn 1 file (ai đó đang xem) thì mã đó lỗi, KHÔNG được làm hỏng cả phiên build — chỉ ghi cảnh báo và nhớ để thử lại.
    let failedKeys: string[] = [];
    try {
        await mustRun("fill-status-reports.ts", [path.join(dir, "output.json"), "--day", session.day, "--buoi", session.buoi, "--set", set.id, "--only", keys.join(",")]);
    } catch (err) {
        warnings.push(`fill-status-reports: ${(err as Error).message}`);
        // Script không kịp ghi danh sách mã lỗi (chết giữa chừng) thì coi như mọi mã đều lỗi.
        failedKeys = readFillFailed(dir) ?? [...keys];
    }
    return { reviewCount: review.length, excel: null, warnings, marks, failedKeys };
}

/** Writes StatusId/HasRead for already-merged marks with `mark-messages.ts` (one transaction). */
export async function markMerged(marks: Mark[]): Promise<void> {
    if (marks.length === 0) return;
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, "marks-merged.json");
    fs.writeFileSync(file, JSON.stringify(marks), "utf8");
    await mustRun("mark-messages.ts", [file]);
}
```

(c) Đổi chữ ký và phần thân của `realDeps`:

```ts
export function realDeps(opts: { freshGaps: () => Gap[]; sets: () => ResolvedSet[] }): CycleDeps {
```
và bên trong object trả về: sau `syncDb: ...` thay `build: buildSession, buildExtras: ..., built: ...` bằng:

```ts
        sets: opts.sets,
        build: buildSet,
        buildExtras: async (set) => {
            const warnings: string[] = [];
            const scripts: Array<[ReportKey, string, string]> = [
                ["cleaning", "fill-cleaning-report.ts", "vệ sinh"],
                ["attendance", "fill-attendance-report.ts", "vi phạm"],
                ["dien", "fill-electric-report.ts", "điện"],
            ];
            for (const [key, script, label] of scripts) {
                if (!set.dayKeys.includes(key)) continue;
                const r = await runScript(script, ["--set", set.id]);
                if (r.code !== 0) warnings.push(`${set.id}: fill-${label}: thoát mã ${r.code}: ${tail(r.output)}`);
            }
            return warnings;
        },
        markMessages: markMerged,
        built: {
            read: (setIds, messages) => {
                const { built, changed } = loadBuiltBySet(readBuiltRaw(), setIds, messages);
                if (changed && setIds.length > 0) writeBuiltBySet(built);
                return built;
            },
            write: (built) => writeBuiltBySet(built),
        },
        failed: { read: () => readFailed(), write: (failed) => writeFailed(failed) },
```

- [ ] **Step 7: Sửa `bot-runner.ts`**

Edit `src/cli/bot-runner.ts`:

(a) Imports: thay `import { dirtySessions, initBuiltBaseline, readBuilt } from "../runner/builtReports.js";` bằng:

```ts
import { loadBuiltBySet, readBuiltRaw, writeBuiltBySet } from "../runner/builtReports.js";
import { pendingBuilds } from "../runner/buildPlan.js";
import { readFailed } from "../runner/failedFills.js";
import { legacyOverridesWarning } from "../reportSets/legacy.js";
import { loadReportSets, logSetProblems } from "../reportSets/cliSet.js";
```
và thêm `import fs from "node:fs";` ở đầu file (file hiện chưa import `fs`).

(b) Trong `main()`, ngay sau khối `process.on(...)` và `setInterval(...)`, thay khối `if (initBuiltBaseline(...)) log(...)` bằng:

```ts
    const { active: sets, problems } = loadReportSets();
    logSetProblems(problems, log);
    if (sets.length === 0) log("[runner] KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: vẫn cào và đồng bộ DB nhưng không xuất file nào. Sửa config.reportSets rồi khởi động lại.");
    const legacy = legacyOverridesWarning(sets, (file) => fs.existsSync(file));
    if (legacy) log(`[runner] CẢNH BÁO: ${legacy}`);
    const baseline = loadBuiltBySet(readBuiltRaw(), sets.map((s) => s.id), await loadMessages());
    if (baseline.changed && sets.length > 0) {
        writeBuiltBySet(baseline.built);
        log("[runner] bộ mới hoặc lần chạy đầu: các báo cáo đã có coi như đã dựng (dựng lại một buổi bằng `npm run runner:once`).");
    }
```
và đổi `const deps = realDeps({ freshGaps: () => plan.gaps });` thành `const deps = realDeps({ freshGaps: () => plan.gaps, sets: () => sets });`.

(c) Trong vòng lặp, thay khối kiểm "dirty":

```ts
        let dirty = false;
        if (now >= nextDirtyCheck) {
            dirty = dirtySessions(await loadMessages(), readBuilt() ?? new Set<string>()).length > 0;
            nextDirtyCheck = now + DIRTY_CHECK_MS;
        }
```
bằng:

```ts
        let dirty = false;
        if (now >= nextDirtyCheck) {
            const messages = await loadMessages();
            const { built } = loadBuiltBySet(readBuiltRaw(), sets.map((s) => s.id), messages);
            dirty = pendingBuilds(sets, messages, built, readFailed()).length > 0;
            nextDirtyCheck = now + DIRTY_CHECK_MS;
        }
```

(d) Sau `const summary = await runCycle(deps);` thay dòng `if (summary.buildErrors.length > 0) nextDirtyCheck = Date.now() + DIRTY_RETRY_MS;` bằng:

```ts
            // Cặp (bộ, mã) lỗi cũng chờ DIRTY_RETRY_MS: nếu không, một mẫu thiếu sẽ làm runner chạy cả một vòng mỗi phút.
            const failedReports = (summary.sets ?? []).flatMap((s) => s.failedReports.map((r) => `${s.id} ${r}`));
            if (summary.buildErrors.length > 0 || failedReports.length > 0) nextDirtyCheck = Date.now() + DIRTY_RETRY_MS;
```
và trong dòng log kết thúc vòng (`log(\`[runner] vòng xong ...`) thêm vào cuối chuỗi, trước dấu `)` đóng của `log(...)`: `${failedReports.length > 0 ? `, file lỗi: ${failedReports.join("; ")}` : ""}` — tức nối thêm một đoạn nữa vào template string hiện có.

- [ ] **Step 8: Sửa `runner-once.ts`**

Replace phần thân từ `const lock = acquireScrapeLock(...)` đến hết `finally` bằng bản dưới (giữ nguyên `option`, kiểm `--day`/`--buoi`, import `acquireScrapeLock`...). Thay import `import { readBuilt, sessionReportKeys, writeBuilt } from "../runner/builtReports.js";` và `import { buildSession, loadMessages } from "../runner/steps.js";` bằng:

```ts
import { loadBuiltBySet, readBuiltRaw, sessionReportKeys, writeBuiltBySet } from "../runner/builtReports.js";
import { readFailed, settle, writeFailed } from "../runner/failedFills.js";
import { mergeMarks } from "../runner/mergeMarks.js";
import { buildSet, loadMessages, markMerged } from "../runner/steps.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
import type { CycleSummary, Mark, Phase } from "../types/index.js";
```
(thay luôn dòng import `type { CycleSummary, Phase }` hiện có). Thân mới:

```ts
    const loaded = loadReportSets();
    logSetProblems(loaded.problems);
    const chosen = option("--set") === undefined ? loaded.active : [pickSet(loaded.active, option("--set"))];
    if (chosen.length === 0) {
        console.error("[rebuild] không có bộ báo cáo nào để dựng.");
        process.exit(2);
    }

    const lock = acquireScrapeLock("runner:once");
    if (!lock.ok) {
        console.error(`[rebuild] đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) chạy và dùng chung thư mục output/ — thử lại sau ít phút.`);
        process.exit(2);
    }
    try {
        const summary: CycleSummary = { kind: "rebuild", at: Date.now(), ok: true, groups: [], sessions: [{ day, buoi }], reviewCount: 0, excel: [], warnings: [], errors: [], buildErrors: [], sets: [] };
        const messages = await loadMessages();
        const { built } = loadBuiltBySet(readBuiltRaw(), loaded.active.map((s) => s.id), messages);
        const failed = readFailed();
        const marks: Mark[] = [];
        for (const set of chosen.filter((s) => s.phaseKeys.length > 0)) {
            const setSummary = { id: set.id, sessions: [{ day, buoi }], failedReports: [] as string[] };
            summary.sets!.push(setSummary);
            try {
                const result = await buildSet(set, { day, buoi }, set.phaseKeys);
                summary.reviewCount += result.reviewCount;
                summary.warnings.push(...result.warnings.map((w) => `${set.id}: ${w}`));
                marks.push(...result.marks);
                settle(failed, set.id, { day, buoi }, set.phaseKeys, result.failedKeys as ReportKey[]);
                setSummary.failedReports.push(...result.failedKeys.map((k) => `${day} ${buoi} ${k}`));
                const keys = built.get(set.id) ?? new Set<string>();
                for (const key of sessionReportKeys(messages, { day, buoi })) keys.add(key);
                built.set(set.id, keys);
            } catch (err) {
                summary.ok = false;
                summary.errors.push(`${set.id}: ${(err as Error).message}`);
                process.exitCode = 1;
            }
        }
        writeBuiltBySet(built);
        writeFailed(failed);
        try {
            await markMerged(mergeMarks(marks));
        } catch (err) {
            summary.warnings.push(`đánh dấu tin: ${(err as Error).message}`);
        }
        appendLog(summary);
        console.log(`[rebuild] ${day} ${buoi}: ${summary.ok ? "OK" : "LỖI"}, ${chosen.map((s) => s.id).join(", ")}, cần xem ${summary.reviewCount} (output/<bộ>/review_${day}_${buoi}.json) -- xem file trạng thái thiết bị ở thư mục của từng bộ trong statusExportDir`);
        for (const w of summary.warnings) console.warn(`[rebuild] cảnh báo: ${w}`);
        for (const e of summary.errors) console.error(`[rebuild] lỗi: ${e}`);
    } finally {
        releaseScrapeLock();
    }
```

Thêm vào danh sách import của `runner-once.ts`: `import type { ReportKey } from "../reportSets/registry.js";`. Cập nhật comment đầu file: thêm `[--set <id>]` vào dòng lệnh và câu "(bỏ trống = mọi bộ)".

- [ ] **Step 9: Typecheck (còn lỗi ở runner-status/total)**

Run: `npx tsc --noEmit 2>&1 | findstr /i "runner\\ cycle steps bot-runner runner-once"`
Expected: không còn lỗi ở `src/runner/cycle.ts`, `steps.ts`, `bot-runner.ts`, `runner-once.ts`. (`runner-status.ts` và `src/total/*` được sửa ở Task 8–9.)

- [ ] **Step 10: Chạy test**

Run: `node --import tsx --test tests/cycle.test.ts tests/cycleSets.test.ts tests/buildPlan.test.ts`
Expected: tất cả PASS.

- [ ] **Step 11: Commit**

```bash
git add src/types/runner.ts src/runner/cycle.ts src/runner/steps.ts src/cli/bot-runner.ts src/cli/runner-once.ts tests/cycle.test.ts tests/cycleSets.test.ts
git commit -m "feat(reportSets): vòng runner theo bộ, cô lập lỗi từng cặp (bộ, mã) và thử lại tự động"
```

---

### Task 8: `bot:total` theo bộ

**Files:**
- Modify: `src/total/runTotal.ts`, `src/total/realDeps.ts`, `src/total/tick.ts`
- Modify: `src/cli/bot-total.ts`, `src/cli/total-once.ts`
- Modify: `tests/totalRun.test.ts`, `tests/totalTick.test.ts`
- Test: thêm test vào `tests/totalRun.test.ts`

**Interfaces:**
- Consumes: `ResolvedSet`, `ReportKey` (Task 1); `setReportDir`, `setOutputDir` (Task 2); `loadReportSets`, `logSetProblems` (Task 2).
- Produces:
  - `TotalDeps.readOverrides(setId: string): Override[]`; `TotalDeps.outDirFor(day: string, setId: string): string`.
  - `totalTrackerKey(setId: string, day: string, slot: SlotName, title: string): string`.
  - `runTotalOnce(opts: { slot: TotalSlot; now: number; set: ResolvedSet }, deps: TotalDeps): Promise<TotalRunResult>` (chỉ các mã trong `set.reports`).
  - `runTotalForSets(opts: { slot: TotalSlot; now: number; sets: ResolvedSet[] }, deps: TotalDeps): Promise<TotalRunResult>` (gộp, cô lập lỗi theo bộ).
  - `TotalRunResult` thêm `setId?: string` và `expected?: number` (tuỳ chọn để các chỗ dựng thủ công trong test không phải đổi); `qualify(setId: string, key: string): string` = `${setId}-${key}`.

- [ ] **Step 1: Cập nhật test hiện có của `runTotalOnce` (fail trước)**

Edit `tests/totalRun.test.ts`:

(a) Import: thêm
```ts
import { resolveReportSets } from "../src/reportSets/resolve.js";
```
và sau khai báo `NAMES` thêm:
```ts
const SET = resolveReportSets([{ id: "A", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] }]).active[0];
```

(b) Trong `setup(...)`: đổi hai dep:
```ts
        readOverrides: () => [],
        ...
        outDirFor: () => dir,
```
thành giữ nguyên dạng (hàm bỏ qua tham số) — TypeScript cho phép hàm ít tham số hơn; không cần đổi.

(c) Áp dụng thay thế cơ học: mọi lời gọi `runTotalOnce({ slot: X, now: Y }, deps)` thêm `set: SET`. Lệnh:

Run (từ gốc dự án, Git Bash): `sed -i -E 's/runTotalOnce\(\{ slot: ([a-z]+), now: ([^}]+) \}/runTotalOnce({ slot: \1, now: \2, set: SET }/g' tests/totalRun.test.ts`
Kiểm: `grep -n "runTotalOnce(" tests/totalRun.test.ts` — mọi dòng phải chứa `set: SET`.

(d) Cập nhật các chỗ dùng `totalTrackerKey`: mọi `totalTrackerKey(DAY, "morning", X)` → `totalTrackerKey("A", DAY, "morning", X)`, tương tự `"afternoon"`. Và test "totalTrackerKey is <day>|total-<slot>|<title>" đổi thành:

```ts
test("totalTrackerKey is <set>|<day>|total-<slot>|<title>", () => {
    assert.equal(totalTrackerKey("A", "2026-10-03", "afternoon", "TÌNH TRẠNG LOA"), "A|2026-10-03|total-afternoon|TÌNH TRẠNG LOA");
});
```

(e) Thêm các test mới ở cuối file:

```ts
test("only the reports the set enabled are written, still in the required order", async () => {
    const only = resolveReportSets([{ id: "B", reports: ["attendance", "loa", "dien"] }]).active[0];
    const { calls, deps } = setup([msg(COMPLETE, at(7, 0))]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5), set: only }, deps);
    assert.deepEqual(calls.map((c) => c.name), ["total-loa", "total-dien", "total-attendance"]);
    assert.deepEqual(result.written.map((w) => w.name), ["loa", "dien", "attendance"]);
    assert.deepEqual(Object.keys(result.counts), ["loa", "dien", "attendance"]);
});

test("the output folder and the overrides come from the set", async () => {
    const asked: string[] = [];
    const { deps } = setup([], { outDirFor: (day, setId) => (asked.push(`${setId}:${day}`), fs.mkdtempSync(path.join(os.tmpdir(), "total-set-"))), readOverrides: (setId) => (asked.push(`ov:${setId}`), []) });
    await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, deps);
    assert.deepEqual(asked, [`ov:A`, `A:${DAY}`]);
});

test("tracker entries are per set: another set's file of the same slot is neither replaced nor removed", async () => {
    const { deps, removed } = setup([]);
    const loaTitle = fakeTitle("01 - FORM TINH TRANG AM THANH.xlsx", "1209");
    fs.writeFileSync(deps.trackerFile, JSON.stringify({ [totalTrackerKey("B", DAY, "morning", loaTitle)]: "B-LOA.xlsx" }));
    await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    const tracker = JSON.parse(fs.readFileSync(deps.trackerFile, "utf8")) as Record<string, string>;
    assert.equal(tracker[totalTrackerKey("B", DAY, "morning", loaTitle)], "B-LOA.xlsx");
    assert.ok(!removed.some((f) => f.endsWith("B-LOA.xlsx")));
});
```

(f) Thêm test của `runTotalForSets` (cần import `runTotalForSets`):

```ts
test("runTotalForSets runs every set; one set throwing is a failure of that set only, and the messages are loaded once", async () => {
    const two = resolveReportSets([{ id: "A", reports: ["loa"] }, { id: "B", reports: ["mayTinh", "dien"] }]).active;
    let loads = 0;
    const calls: string[] = [];
    const { deps } = setup([msg(COMPLETE, at(7, 0))], {
        loadMessages: async () => (loads++, []),
        outDirFor: (day, setId) => {
            if (setId === "A") throw new Error("không tạo được thư mục A");
            return fs.mkdtempSync(path.join(os.tmpdir(), "total-all-"));
        },
        fill: (a) => (calls.push(a.name), ""),
    });
    const result = await runTotalForSets({ slot: morning, now: at(9, 5), sets: two }, deps);
    assert.equal(loads, 1);
    assert.deepEqual(calls, ["total-mayTinh", "total-dien"]);
    assert.deepEqual(result.failed, ["A"]);
    assert.ok(result.warnings.some((w) => w.startsWith("A: ") && w.includes("không tạo được thư mục A")), JSON.stringify(result.warnings));
    assert.deepEqual(result.written.map((w) => w.name), ["B-mayTinh", "B-dien"]);
    assert.deepEqual(Object.keys(result.counts), ["B-mayTinh", "B-dien"]);
    assert.equal(result.expected, 3);
    assert.equal(result.files.length, 2);
});

test("runTotalForSets qualifies the failed file names with the set, and the print names contain no path separators", async () => {
    const two = resolveReportSets([{ id: "Nguyễn Văn A", reports: ["loa", "mayTinh"] }]).active;
    const { deps } = setup([], { fill: (a) => { if (a.name === "total-mayTinh") throw new Error("Excel đang mở file"); return ""; } });
    const result = await runTotalForSets({ slot: morning, now: at(9, 5), sets: two }, deps);
    assert.deepEqual(result.failed, ["Nguyễn Văn A-mayTinh"]);
    assert.ok(result.written.every((w) => !/[\\/:]/.test(w.name)), JSON.stringify(result.written.map((w) => w.name)));
});
```

Run: `node --import tsx --test tests/totalRun.test.ts`
Expected: FAIL (chữ ký mới chưa có).

- [ ] **Step 2: Sửa `runTotal.ts`**

Edit `src/total/runTotal.ts`:

(a) Imports thêm:
```ts
import type { ReportKey } from "../reportSets/registry.js";
import type { ResolvedSet } from "../reportSets/resolve.js";
```

(b) `TotalDeps`: đổi hai dòng:
```ts
    readOverrides(setId: string): Override[];
    ...
    outDirFor(day: string, setId: string): string;
```

(c) `TotalRunResult`: thêm hai trường tuỳ chọn sau `day: string;`:
```ts
    /** Bộ báo cáo của kết quả này; vắng mặt ở kết quả gộp nhiều bộ (`runTotalForSets`). */
    setId?: string;
    /** Số file dự kiến (tổng số mã báo cáo của các bộ); vắng mặt thì coi là 7 (một bộ đủ 7 loại). */
    expected?: number;
```

(d) Thay `totalTrackerKey`:
```ts
/** Khoá tracker của file `-auto`: có `setId` (mỗi bộ ghi vào thư mục riêng) và tách khỏi khoá của 4 giai đoạn (`<bộ>|<ngày>|<giai đoạn>|<tiêu đề>`). */
export const totalTrackerKey = (setId: string, day: string, slot: SlotName, title: string): string => `${setId}|${day}|total-${slot}|${title}`;

/** Tên đầu ra gắn bộ (`<bộ>-<mã>`) cho kết quả gộp; không chứa dấu phân cách đường dẫn nên dùng được làm tên file tạm của bước in. */
export const qualify = (setId: string, key: string): string => `${setId}-${key}`;
```

(e) `runTotalOnce` đổi chữ ký và các chỗ liên quan:

```ts
export async function runTotalOnce(opts: { slot: TotalSlot; now: number; set: ResolvedSet }, deps: TotalDeps): Promise<TotalRunResult> {
    const { slot, now, set } = opts;
```
đổi `deps.readOverrides()` → `deps.readOverrides(set.id)`; sau khi dựng mảng `outputs`, lọc:
```ts
    const wanted = outputs.filter((o) => set.reports.includes(o.name as ReportKey));
```
và vòng `for (const o of outputs)` đổi thành `for (const o of wanted)`; `const outDir = deps.outDirFor(day);` → `deps.outDirFor(day, set.id)`; `const key = totalTrackerKey(day, slot.name, title);` → `totalTrackerKey(set.id, day, slot.name, title)`; khởi tạo `result` thêm `setId: set.id, expected: wanted.length`.

(f) Thêm cuối file hàm gộp:

```ts
/**
 * Dựng các file `-auto` của đợt cho MỌI bộ, lần lượt theo thứ tự cấu hình. Mỗi bộ chạy trong try riêng: một bộ lỗi (không tạo được thư mục
 * của nó, kho tin hỏng...) chỉ là một mục `failed` mang id của bộ, các bộ khác vẫn xuất. Kho tin chỉ nạp MỘT lần cho cả đợt.
 */
export async function runTotalForSets(opts: { slot: TotalSlot; now: number; sets: ResolvedSet[] }, deps: TotalDeps): Promise<TotalRunResult> {
    let cached: Promise<SourceMessage[]> | null = null;
    const shared: TotalDeps = { ...deps, loadMessages: () => (cached ??= deps.loadMessages()) };
    const combined: TotalRunResult = { slot: opts.slot.name, day: opts.slot.day, files: [], counts: {}, failed: [], warnings: [], written: [], expected: 0 };
    for (const set of opts.sets) {
        combined.expected = (combined.expected ?? 0) + set.reports.length;
        try {
            const r = await runTotalOnce({ slot: opts.slot, now: opts.now, set }, shared);
            combined.files.push(...r.files);
            for (const [key, n] of Object.entries(r.counts)) combined.counts[qualify(set.id, key)] = n;
            combined.failed.push(...r.failed.map((key) => qualify(set.id, key)));
            combined.warnings.push(...r.warnings.map((w) => `${set.id}: ${w}`));
            combined.written.push(...r.written.map((w) => ({ ...w, name: qualify(set.id, w.name) })));
        } catch (err) {
            combined.failed.push(set.id);
            combined.warnings.push(`${set.id}: ${(err as Error).message}`);
        }
    }
    return combined;
}
```
Kiểm `SourceMessage` đã được import ở đầu file (có: `import type { Cell, Override, SourceMessage } from "../types/index.js";`).

Run: `node --import tsx --test tests/totalRun.test.ts`
Expected: tất cả PASS. (Test cũ về thứ tự `result.written.map((w) => w.name)` cho một bộ vẫn là tên không có tiền tố vì `runTotalOnce` không gộp.)

- [ ] **Step 3: Sửa `realDeps.ts`**

Edit `src/total/realDeps.ts`:

```ts
import { outputDir, setOutputDir, setReportDir } from "../core/paths.js";
```
(thay import `outputDir, statusReportDir`; `outputDir` bỏ nếu không còn dùng) và hai dep:

```ts
        readOverrides: (setId) => readOverrides(path.join(setOutputDir(setId), "overrides.json")),
        ...
        outDirFor: (day, setId) => {
            const dir = setReportDir(config.statusExportDir, setId, day);
            fs.mkdirSync(dir, { recursive: true });
            return dir;
        },
```
Cập nhật comment đầu hàm: "thư mục xuất của từng bộ".

- [ ] **Step 4: Sửa `tick.ts` và cập nhật test tick**

Edit `src/total/tick.ts`, dòng log kết thúc đợt: thay `${result.files.length}/7 file` bằng `${result.files.length}/${result.expected ?? 7} file`.

`tests/totalTick.test.ts` dựng `TotalRunResult` thủ công (không có `expected`) nên vẫn đúng với `?? 7`; không cần đổi.

- [ ] **Step 5: Sửa `bot-total.ts` và `total-once.ts`**

Edit `src/cli/bot-total.ts`:

(a) Import: thay `import { runTotalOnce } from "../total/runTotal.js";` bằng `import { runTotalForSets } from "../total/runTotal.js";` và thêm:
```ts
import { loadReportSets, logSetProblems } from "../reportSets/cliSet.js";
```

(b) Trong `main()`, sau dòng `setInterval(() => beatTotal(Date.now()), HEARTBEAT_INTERVAL_MS);` thêm:
```ts
    const { active: sets, problems } = loadReportSets();
    logSetProblems(problems, log);
    if (sets.length === 0) log("[total] KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: các đợt sẽ không xuất file nào. Sửa config.reportSets rồi khởi động lại.");
```
(c) `runTotal: (slot, now) => runTotalOnce({ slot, now }, totalDeps),` → `runTotal: (slot, now) => runTotalForSets({ slot, now, sets }, totalDeps),`.

(d) Dòng `log("[total] running...` không đổi. Cập nhật comment đầu file: "xuất các file `-auto` của đợt cho từng bộ báo cáo".

Edit `src/cli/total-once.ts`:

(a) Import `runTotalForSets` thay `runTotalOnce`; thêm `import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";`.

(b) Thêm tham số `--set`: trong comment lệnh `npm run total:once -- --slot morning|afternoon [--set <id>] [--day …]...` (bỏ trống = mọi bộ).

(c) Trong `main()` sau khi tính `slot`: 
```ts
    const loaded = loadReportSets();
    logSetProblems(loaded.problems);
    const sets = option("--set") === undefined ? loaded.active : [pickSet(loaded.active, option("--set"))];
    if (sets.length === 0) throw new Error("không có bộ báo cáo nào để xuất.");
```
và `const result = await runTotalForSets({ slot, now, sets }, realTotalDeps());`. Dòng log tổng `result.files.length}/7 file` → `${result.files.length}/${result.expected ?? 7} file`.

- [ ] **Step 6: Typecheck toàn bộ (lần đầu sau Task 3)**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: chỉ còn lỗi ở `src/cli/runner-status.ts` (dùng `readBuilt`/`dirtySessions` cũ) và nếu có `tests/*` chưa cập nhật — sửa ở Task 9 (runner-status) ngay. Nếu còn lỗi khác (ví dụ `tests/totalPrint.test.ts`), đọc và sửa tối thiểu.

- [ ] **Step 7: Chạy test và commit**

Run: `node --import tsx --test tests/totalRun.test.ts tests/totalTick.test.ts tests/totalPrint.test.ts tests/totalDecide.test.ts`
Expected: tất cả PASS.

```bash
git add src/total/runTotal.ts src/total/realDeps.ts src/total/tick.ts src/cli/bot-total.ts src/cli/total-once.ts tests/totalRun.test.ts
git commit -m "feat(reportSets): bot:total xuất các file -auto theo từng bộ"
```

---

### Task 9: Hiển thị lỗi và `reports:list`

**Files:**
- Modify: `src/runner/runnerStatusReport.ts`, `src/cli/runner-status.ts`
- Modify: `src/total/totalStatusReport.ts`, `src/cli/total-status.ts`
- Create: `src/cli/reports-list.ts`
- Modify: `package.json`
- Test: `tests/runnerStatusReport.test.ts` (thêm), `tests/totalStatusReport.test.ts` (thêm), `tests/reportsList.test.ts`

**Interfaces:**
- Consumes: `SetProblem`, `ResolvedSet` (Task 1); `describeProblem`, `hasSetErrors`, `loadReportSets` (Task 2); `pendingBuilds`, `readFailed`, `loadBuiltBySet`, `readBuiltRaw` (Task 3); `REPORT_DEFS`, `REPORT_KEYS` (Task 1).
- Produces:
  - `RunnerStatusInput.sets?: { active: ResolvedSet[]; problems: SetProblem[]; failed: string[] }`.
  - `TotalStatusInput.sets?: { active: ResolvedSet[]; problems: SetProblem[] }`.
  - `formatReportsList(templateExists: (file: string) => boolean): string[]` trong `src/cli/reports-list.ts` — để test, đặt hàm này ở `src/reportSets/reportsList.ts` và để CLI chỉ gọi nó.

- [ ] **Step 1: Viết test của trạng thái runner (fail trước)**

Append vào `tests/runnerStatusReport.test.ts`:

```ts
import { resolveReportSets } from "../src/reportSets/resolve.js";

const goodSets = resolveReportSets([{ id: "A", reports: ["loa", "dien"] }, { id: "B", reports: ["mayTinh"] }]);
const badSets = resolveReportSets([{ id: "A", reports: ["loa", "nope"] }]);

test("the report sets that run are listed with their number of reports; no set is called out loudly", () => {
    const t = text({ sets: { active: goodSets.active, problems: goodSets.problems, failed: [] } });
    assert.match(t, /bộ báo cáo: A \(2 loại\), B \(1 loại\)/);
    const none = text({ sets: { active: [], problems: resolveReportSets([]).problems, failed: [] } });
    assert.match(none, /KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY/);
});

test("set problems and report files waiting for a retry are shown", () => {
    const t = text({ sets: { active: badSets.active, problems: badSets.problems, failed: ["A 2026-09-24 morningstart loa"] } });
    assert.match(t, /\[bộ báo cáo\] LỖI \(A\)/);
    assert.match(t, /file báo cáo đang lỗi, sẽ thử lại: A 2026-09-24 morningstart loa/);
});

test("the cycle's per-set results are shown when present", () => {
    const t = text({ state: state({ lastCycle: cycle({ sets: [{ id: "A", sessions: [{ day: DAY, buoi: "morningstart" }], failedReports: ["2026-09-24 morningstart loa"] }] }) }) });
    assert.match(t, /bộ A: buổi morningstart 2026-09-24; lỗi file: 2026-09-24 morningstart loa/);
});
```

Run: `node --import tsx --test tests/runnerStatusReport.test.ts`
Expected: FAIL.

- [ ] **Step 2: Sửa `runnerStatusReport.ts`**

Edit `src/runner/runnerStatusReport.ts`:

(a) Imports thêm:
```ts
import { describeProblem } from "../reportSets/cliSet.js";
import type { ResolvedSet, SetProblem } from "../reportSets/resolve.js";
```

(b) `RunnerStatusInput` thêm:
```ts
    /** The report sets (Task: reportSets): the ones that run, the problems found in `config.reportSets`, and the report files waiting for a retry. */
    sets?: { active: ResolvedSet[]; problems: SetProblem[]; failed: string[] };
```

(c) Trong `formatRunnerStatus`, destructure `sets` cùng `{ state, queue, firstQueuedAt, dirty, now }` (thêm `sets`), và ngay trước dòng `if (dirty.length > 0) lines.push(...)` cuối hàm thêm:

```ts
    if (sets) {
        lines.push(sets.active.length === 0 ? "  KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: bot không xuất file nào (sửa config.reportSets rồi khởi động lại)." : `  bộ báo cáo: ${sets.active.map((s) => `${s.id} (${s.reports.length} loại)`).join(", ")}`);
        for (const p of sets.problems) lines.push(`  ${describeProblem(p)}`);
        if (sets.failed.length > 0) lines.push(`  file báo cáo đang lỗi, sẽ thử lại: ${sets.failed.join("; ")}`);
    }
```

và trong khối `const c = state?.lastCycle; if (c) {...}`, sau dòng `lỗi dựng`, thêm:

```ts
        for (const s of c.sets ?? []) lines.push(`    bộ ${s.id}: ${s.sessions.length > 0 ? `buổi ${s.sessions.map((x) => `${x.buoi} ${x.day}`).join(", ")}` : "không có buổi nào cần dựng"}${s.failedReports.length > 0 ? `; lỗi file: ${s.failedReports.join(", ")}` : ""}`);
```

Run: `node --import tsx --test tests/runnerStatusReport.test.ts`
Expected: PASS.

- [ ] **Step 3: Sửa `runner-status.ts`**

Replace `src/cli/runner-status.ts` bằng:

```ts
import { readQueue, readQueueMeta, readQueueSeen } from "../scrape/scrapeQueue.js";
import { loadBuiltBySet, readBuiltRaw } from "../runner/builtReports.js";
import { pendingBuilds } from "../runner/buildPlan.js";
import { readFailed } from "../runner/failedFills.js";
import { formatRunnerStatus } from "../runner/runnerStatusReport.js";
import { readRunnerState, runnerHealth } from "../runner/runnerState.js";
import { toQueueTimes } from "../runner/schedule.js";
import { loadMessages } from "../runner/steps.js";
import { hasSetErrors, loadReportSets } from "../reportSets/cliSet.js";

/**
 * Is `bot:runner` alive, what did its last cycle do, what is queued, which sessions have a report not built into an Excel yet, which report
 * sets run and what is wrong with `config.reportSets`. Read-only. Exit code 0 when the runner is alive and the report sets have no error,
 * 2 otherwise (dead, stopped, in error, never ran, or a set disabled by a configuration error) so an agent can tell a person must look.
 *
 *   npm run runner:status
 */
const now = Date.now();
const state = readRunnerState();
const queue = readQueue();
const times = toQueueTimes(queue, readQueueMeta(), now, readQueueSeen());
const loaded = loadReportSets();
const failed = readFailed();
const messages = await loadMessages();
const raw = readBuiltRaw();
const dirty = raw === null ? [] : pendingBuilds(loaded.active, messages, loadBuiltBySet(raw, loaded.active.map((s) => s.id), messages).built, failed);
for (const line of formatRunnerStatus({ state, queue, firstQueuedAt: queue.length > 0 ? times.firstQueuedAt : null, dirty, now, sets: { active: loaded.active, problems: loaded.problems, failed: [...failed].map((k) => k.split("|").join(" ")) } })) console.log(line);
if (runnerHealth(state, now) !== "alive" || hasSetErrors(loaded.problems)) process.exitCode = 2;
```

- [ ] **Step 4: Trạng thái `bot:total`**

Append vào `tests/totalStatusReport.test.ts` (đọc đầu file để dùng đúng helper; nếu chưa có `resolveReportSets` thì import):

```ts
test("total:status lists the sets and the problems of config.reportSets", async () => {
    const { resolveReportSets } = await import("../src/reportSets/resolve.js");
    const r = resolveReportSets([{ id: "A", reports: ["loa", "x"] }]);
    const lines = formatTotalStatus({ state: null, slots: {}, day: "2026-10-06", schedule: [], now: Date.UTC(2026, 9, 6, 3, 0), sets: { active: r.active, problems: r.problems } });
    const t = lines.join("\n");
    assert.match(t, /bộ báo cáo: A \(1 loại\)/);
    assert.match(t, /\[bộ báo cáo\] LỖI \(A\)/);
});
```

Run: `node --import tsx --test tests/totalStatusReport.test.ts` — Expected: FAIL.

Edit `src/total/totalStatusReport.ts`:

Imports thêm:
```ts
import { describeProblem } from "../reportSets/cliSet.js";
import type { ResolvedSet, SetProblem } from "../reportSets/resolve.js";
```
`TotalStatusInput` thêm `sets?: { active: ResolvedSet[]; problems: SetProblem[] };`, destructure `sets`, và sau dòng `lines.push(\`[total] hôm nay ${day}:\`)` + vòng `for (const slot ...)` thêm:

```ts
    if (sets) {
        lines.push(sets.active.length === 0 ? "[total] KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: các đợt không xuất file nào." : `[total] bộ báo cáo: ${sets.active.map((s) => `${s.id} (${s.reports.length} loại)`).join(", ")}`);
        for (const p of sets.problems) lines.push(`  ${describeProblem(p)}`);
    }
```

Edit `src/cli/total-status.ts` (đọc file trước): thêm `import { hasSetErrors, loadReportSets } from "../reportSets/cliSet.js";`, gọi `const loaded = loadReportSets();`, truyền `sets: { active: loaded.active, problems: loaded.problems }` vào `formatTotalStatus({...})`, và thêm `|| hasSetErrors(loaded.problems)` vào điều kiện đặt `process.exitCode = 2` (nếu hiện chỉ dựa vào `totalHealth`, thêm một dòng `if (hasSetErrors(loaded.problems)) process.exitCode = 2;` sau điều kiện cũ).

Run: `node --import tsx --test tests/totalStatusReport.test.ts` — Expected: PASS.

- [ ] **Step 5: `reports:list` (test trước)**

Create `tests/reportsList.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReportsList } from "../src/reportSets/reportsList.js";

test("every code is listed with its kind, source title, template, and whether the template exists", () => {
    const lines = formatReportsList((file) => !file.includes("AM THANH"));
    const text = lines.join("\n");
    for (const code of ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"]) assert.match(text, new RegExp(`\\b${code}\\b`));
    assert.match(text, /loa .*theo giai đoạn.*BÁO CÁO ĐẦU\/CUỐI BUỔI DẠY.*01 - FORM TINH TRANG AM THANH\.xlsx.*THIẾU/);
    assert.match(text, /dien .*theo ngày.*LỖI ĐIỆN.*có sẵn/);
});

test("the order is the export and print order", () => {
    const codes = formatReportsList(() => true).filter((l) => /^ {2}\w/.test(l)).map((l) => l.trim().split(" ")[0]);
    assert.deepEqual(codes, ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"]);
});
```

Run: `node --import tsx --test tests/reportsList.test.ts` — Expected: FAIL.

Create `src/reportSets/reportsList.ts`:

```ts
import { REPORT_DEFS, REPORT_KEYS } from "./registry.js";

/** Các dòng của `npm run reports:list`: mã, loại, tiêu đề tin nguồn, mẫu Excel và mẫu có trên máy này không (đúng thứ tự xuất/in). */
export function formatReportsList(templateExists: (file: string) => boolean): string[] {
    const lines = ["Mã báo cáo hợp lệ cho config.reportSets[].reports (đúng thứ tự xuất và in):"];
    for (const key of REPORT_KEYS) {
        const d = REPORT_DEFS[key];
        const kind = d.kind === "phase" ? "theo giai đoạn" : "theo ngày";
        lines.push(`  ${key} (${d.label}) | ${kind} | tin nguồn: ${d.source} | mẫu: ${d.layout.templateFile} | ${templateExists(d.layout.templateFile) ? "có sẵn" : "THIẾU (chép mẫu vào data/mau bao cao new/)"}`);
    }
    return lines;
}
```

Điều chỉnh để regex trong test khớp: dòng phải là `loa (TÌNH TRẠNG ÂM THANH) | theo giai đoạn | …`; test viết `loa .*theo giai đoạn` — khớp vì `loa ` rồi `(…) | theo giai đoạn`. Nếu regex không khớp, chỉnh regex trong test chứ không đổi định dạng dòng (định dạng trên là chủ ý).

Create `src/cli/reports-list.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { formatReportsList } from "../reportSets/reportsList.js";

/**
 * In các mã báo cáo hợp lệ để điền vào config.reportSets[].reports, kèm loại, tiêu đề tin nguồn, mẫu Excel và việc mẫu có trên máy này
 * không. Chỉ đọc.
 *
 *   npm run reports:list
 */
const templatesSrc = path.join(config.dataDir, "mau bao cao new");
for (const line of formatReportsList((file) => fs.existsSync(path.join(templatesSrc, file)))) console.log(line);
```

Edit `package.json`: thêm vào `scripts` (sau `"config:show": ...`):

```json
        "reports:list": "tsx src/cli/reports-list.ts",
```

Run: `node --import tsx --test tests/reportsList.test.ts` — Expected: PASS.

- [ ] **Step 6: Typecheck toàn bộ và test toàn bộ**

Run: `npm run typecheck && npm test`
Expected: typecheck sạch; `ℹ fail 0`.

- [ ] **Step 7: Chạy thử các lệnh chỉ đọc**

Run: `npm run reports:list && npm run config:show 2>&1 | findstr /i "reportSets" && npm run runner:status`
Expected: `reports:list` in 7 mã với mẫu "có sẵn" (nếu mẫu có trên máy); `config:show` hiện dòng `reportSets = NguyenVanA [netsupport, loa, ...]`; `runner:status` in dòng `bộ báo cáo: NguyenVanA (7 loại)`.

- [ ] **Step 8: Commit**

```bash
git add src/runner/runnerStatusReport.ts src/cli/runner-status.ts src/total/totalStatusReport.ts src/cli/total-status.ts src/reportSets/reportsList.ts src/cli/reports-list.ts package.json tests/runnerStatusReport.test.ts tests/totalStatusReport.test.ts tests/reportsList.test.ts
git commit -m "feat(reportSets): hiển thị bộ và lỗi cấu hình ở runner:status, total:status, config:show và thêm reports:list"
```

---

### Task 10: Tài liệu và kiểm chứng cuối

**Files:**
- Modify: `CLAUDE.md`, `README.md`, `SKILLS-Agent/cau-hinh-nguoi-phu-trach/SKILL.md`

**Interfaces:** không.

- [ ] **Step 1: `CLAUDE.md`**

Cập nhật các mục sau (sửa đúng chỗ, giữ phong cách; mỗi mục một lần `Edit`):

1. Khối Commands: dòng `extract:reports` → thêm `[--set <id>]` và đổi `-> output/{output,marks,review,meta}.json` thành `-> output/<id>/{output,marks,review,meta}.json`; dòng `fill:status-reports` → thêm `[--set <id>] [--only <mã,mã>]`, đổi đường dẫn đích thành `<statusExportDir>/<yyMM>/<yyMMdd>/<id>/<title>_<yyMMdd>_T<thu>_<HHmm>.xlsx`, ghi rõ chỉ các mã theo giai đoạn của bộ và mỗi mã lỗi cô lập; `fill:electric-report`, `fill:cleaning-report`, `fill:attendance-report` → thêm `[--set <id>]`; `total:once` → thêm `[--set <id>]`; thêm dòng mới: `npm run reports:list   # các mã báo cáo hợp lệ cho config.reportSets[].reports, loại, tiêu đề tin nguồn, mẫu Excel và mẫu có trên máy không`.
2. Đoạn `bot:runner`: ghi vòng dựng giờ lặp theo bộ báo cáo (`config.reportSets`), mỗi (bộ, mã) cô lập, danh sách thử lại `data/.runner-failed.json`, trạng thái "đã dựng" theo bộ trong `data/.runner-built.json` (dạng `{ "<id>": [...] }`; mảng cũ được chuyển cho các bộ hiện có), overrides riêng `output/<id>/overrides.json`.
3. Đoạn `bot:total`: các file `-auto` ra `<ngày>/<id>/`, lặp theo bộ, tracker `<id>|<ngày>|total-<slot>|<tiêu đề>`.
4. Mục Config: thêm một đoạn về `reportSets` (mỗi bộ `{ id, reports }`, mã nội bộ, không mặc định, cấu hình sai không dừng bot nhưng báo lỗi ồn ào, `statusExportDir` vẫn là gốc, bot tự tạo thư mục của bộ).
5. Mục "What this project is"/Layout: thêm thư mục `src/reportSets/`.

- [ ] **Step 2: `README.md`**

Thêm một mục ngắn "Bộ báo cáo theo người phụ trách" (cạnh phần cấu hình `config.ts`): ví dụ cấu hình, bố cục thư mục, cách thêm người mới (trỏ tới skill `SKILLS-Agent/cau-hinh-nguoi-phu-trach`), `npm run reports:list`, các tình huống lỗi cấu hình và cách bot xử lý, và nhắc `output/overrides.json` cũ phải chép vào `output/<id>/overrides.json`. Cập nhật mọi chỗ README nhắc `statusExportDir/<yyMM>/<yyMMdd>/` thành có thêm cấp `<id>/` (tìm bằng `grep -n "yyMMdd" README.md`) và chỗ nhắc `output/overrides.json`, `output/output.json`.

- [ ] **Step 3: Cập nhật skill**

Trong `SKILLS-Agent/cau-hinh-nguoi-phu-trach/SKILL.md`:
- Bước 0: đổi "Thiết kế `reportSets` được viết trước khi có code" thành ghi chú rằng tính năng đã được cài đặt (2026-10-06, kế hoạch `docs/superpowers/plans/2026-10-06-bo-bao-cao-theo-nguoi.md`) và vẫn phải kiểm tra thật trên máy hiện tại.
- Bước 3A: ghi lại các ràng buộc `id` đã cài (tên thiết bị Windows, tối đa 100 ký tự, không trùng không phân biệt hoa thường) và lệnh kiểm tra `npm run reports:list`, `npm run config:show`, `npm run runner:status`.
- Bước 3B: thay các đường dẫn "(theo spec)" bằng đường dẫn thật (`src/reportSets/registry.ts` thêm một dòng vào `REPORT_KEYS` và `REPORT_DEFS`; việc xuất/in theo thứ tự `REPORT_KEYS`; nơi dựng dòng cho loại `phase` là `buildFillSpecs` trong `src/lesson/statusReportLayout.ts`, cho loại `day` là script `fill-*-report.ts` riêng và mục tương ứng trong `buildExtras` ở `src/runner/steps.ts` và `runTotalOnce` ở `src/total/runTotal.ts`); nói rõ thêm một loại MỚI còn phải sửa các chỗ đó, không chỉ bảng đăng ký.

- [ ] **Step 4: Kiểm chứng cuối**

Run: `npm run typecheck && npm test`
Expected: typecheck sạch, `ℹ fail 0`.

Run (chỉ đọc, không ghi file Excel): `npm run reports:list`, `npm run config:show`, `npm run runner:status`
Expected: `reports:list` in 7 mã; `config:show` có dòng `reportSets`; `runner:status` có `bộ báo cáo: NguyenVanA (7 loại)`.

Kiểm chứng có ghi file (**hỏi người dùng trước**, vì ghi Excel thật vào thư mục xuất): chạy `npx tsx src/cli/extract-reports.ts --no-db --day <ngày có tin> --buoi <giai đoạn>` rồi `npx tsx src/cli/fill-status-reports.ts --day <ngày> --buoi <giai đoạn>`; kỳ vọng: 4 file xuất hiện trong `<statusExportDir>/<yyMM>/<yyMMdd>/NguyenVanA/`; thử tạm đổi tên một file mẫu (ví dụ `01 - FORM TINH TRANG AM THANH.xlsx`) và chạy lại: script thoát mã 1, `output/NguyenVanA/fill-failed.json` chứa `["loa"]`, **3 file còn lại vẫn xuất**; trả lại tên file mẫu ngay sau đó. Xác nhận thêm rằng thông báo lỗi của script có in nội dung `output/fill-loa.log`.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md SKILLS-Agent/cau-hinh-nguoi-phu-trach/SKILL.md
git commit -m "docs(reportSets): mô tả bộ báo cáo theo người phụ trách và cập nhật skill cấu hình"
```

---

## Self-Review

**1. Spec coverage**

| Spec | Task |
|---|---|
| §1 Mục tiêu 1–4 (thư mục người, báo cáo thuộc người, cô lập, config sai không dừng) | Task 1, 2, 4, 7, 8 |
| §2 Cấu hình (`id`, `reports`, tự tạo thư mục, trùng mã cho phép) | Task 1 (`resolve.ts`, `config.ts`), Task 2 (`setReportDir`), `fill-*`/`outDirFor` có `mkdirSync` |
| §2 Kiểm tra (bảng các tình huống) | Task 1 (`resolveReportSets` + test từng dòng) |
| §2 Nơi hiển thị vấn đề | Task 2 (`logSetProblems`), Task 7 (khởi động runner), Task 8 (khởi động total), Task 9 (`runner:status`, `total:status`, `config:show` qua entry `reportSets`) |
| §3 Bảng đăng ký, `reports:list` | Task 1, Task 9 |
| §4 Đường dẫn | Task 2 |
| §5.1 Thư mục làm việc riêng, `--set`, `runner:once --set` | Task 4, 5, 6, 7 |
| §5.2 Mỗi (bộ, mã) độc lập, `try` cho đọc tiêu đề, dọn bản ghi dở | Task 4 (`fillStatusFiles`) |
| §5.3 Trạng thái theo bộ + di chuyển (`.runner-built.json`, tracker, điện, baseline bộ mới, `overrides.json` cũ) | Task 3, Task 2 (`legacy.ts`), Task 7 |
| §5.4 Thử lại | Task 3 (`failedFills`, `buildPlan`), Task 7 (cycle, `bot-runner` giãn cách) |
| §6 `StatusId` gộp | Task 3 (`mergeMarks`), Task 7 (`markMessages` một lần/vòng) |
| §7 `bot:total` | Task 8 |
| §8 Hiển thị | Task 7 (`CycleSummary.sets`), Task 9 |
| §9 Kiểm thử | các test ở từng task |
| §10 Rủi ro | Review Focus + Task 10 Step 4 (log PowerShell) |

Khoảng trống đã biết (đúng với spec §10, không phải thiếu sót của kế hoạch): bản ghi lại `total:status` "danh sách (bộ, mã) lỗi trong bản ghi đợt (`.total-slots.json`)" ở spec §7 — `recordAfterRun` hiện lưu `warnings` của kết quả (mà `runTotalForSets` đã gắn tiền tố bộ và mã lỗi) nên các cặp lỗi hiện ra qua `record.warnings` ở `total:status`; không thêm trường mới. Nếu người dùng muốn trường riêng, thêm ở một kế hoạch sau.

**2. Placeholder scan:** không có "TBD/TODO"; các bước "đọc đầu file để dùng đúng import" ở Task 9 Step 4 là chỉ dẫn kiểm tra thật, kèm code cụ thể. Task 7 Step 7/8 mô tả chỉnh sửa theo từng khối kèm mã đầy đủ cho phần mới.

**3. Type consistency:** `ResolvedSet`/`ReportKey` dùng thống nhất; `BuildResult.failedKeys: string[]` (ép `as ReportKey[]` ở cycle và runner-once); `SetBuildPlan`; `CycleDeps.built.read(setIds, messages)` khớp `realDeps` và harness; `totalTrackerKey(setId, day, slot, title)` khớp mọi chỗ gọi; `TotalDeps.outDirFor(day, setId)` và `readOverrides(setId)` khớp `realDeps` và test; `qualify` dùng cho `counts`, `failed`, `written.name`. Tên hàm `buildSet`/`markMerged` nhất quán giữa `steps.ts`, `bot-runner` (qua `realDeps`) và `runner-once`.

**4. Review Focus:** mỗi dòng có test: (1) Task 1 + Task 2; (2) Task 1; (3) Task 3 `buildPlan`, Task 7 `cycleSets`; (4) Task 4 `statusFill`, Task 7 `cycleSets` (thử lại chỉ mã lỗi) và `bot-runner` Step 7(d) (giãn cách); (5) Task 3 `builtReports`; (6) Task 3 `mergeMarks`, Task 7 `cycleSets`.

## Execution Handoff

Xem bên dưới trong câu trả lời.
