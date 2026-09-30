# Giai đoạn 4 buổi — Chặng 1 (extract:reports, fill:report, fill:status-reports) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (execution method already chosen: Native). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay khái niệm "buổi" (sáng/chiều/tối) bằng 4 "giai đoạn" cố định (`morningstart`/`morningend`/`afternoonstart`/`afternoonend`) cho 3 lệnh tay `extract:reports`, `fill:report`, `fill:status-reports`; đổi định dạng thư mục/tên file xuất của `fill:status-reports`; đổi map cột CẤP ở BO SUNG MAY TINH sang số La Mã.

**Architecture:** Thêm `Phase`/`PhaseHours`/`config.phases` cùng 4 hàm mới (`phaseOf`, `phaseDay`, `classifyPhase`, `isPhase`) trong `src/lesson/time.ts`, song song với `Buoi`/`sessionOf`/`config.sessions` hiện có (không sửa/xoá — `bot:runner`/`bot:chat` đang chạy thật vẫn dùng `Buoi` nguyên vẹn, chưa bị đụng tới trong plan này). `extractAll` đổi từ "lọc tin nhắn theo buổi trước khi parse" sang "lọc theo cửa sổ 2 ngày rộng, parse hết, rồi lọc lại report/mark/review theo `classifyPhase` sau khi đã biết `loaiBaoCao`". `fill-report.ts`/`fill-status-reports.ts` đổi cờ `--buoi` sang nhận `Phase`; `fill-status-reports.ts` đổi cấu trúc thư mục xuất và cách đặt tên file.

**Tech Stack:** TypeScript (tsx), Node test runner (`node:test`), không thêm thư viện mới.

**Spec:** `docs/superpowers/specs/2026-09-29-giai-doan-4-phan-design.md`

**Phạm vi plan này:** CHỈ Chặng 1 của spec (3 lệnh tay). Chặng 2 (`bot:runner`, `bot:chat`, `recover:missing`, `mark:messages`, `watch:status`, `src/lesson/recovery.ts`) và Chặng 3 (xoá `Buoi` cũ) cần đọc kỹ 8+ file chưa được khảo sát trong phiên làm việc này (`src/runner/schedule.ts`, `src/runner/affectedSessions.ts`, `src/runner/builtReports.ts`, `src/chat/rules.ts`, `src/chat/match.ts`, `src/lesson/recovery.ts`, `src/lesson/recoveryReport.ts`, `src/lesson/recoveryRun.ts`) — viết plan cho 2 chặng đó SAU, khi khảo sát xong, để tránh đoán mò (vi phạm nguyên tắc "không đặt chỗ trống" của quy trình viết plan). Chặng 2 dù sao cũng cần bạn tự dừng `bot:runner`/`bot:chat` trước, nên không gấp bằng Chặng 1.

## Global Constraints

- Mọi identifier MỚI trong code đặt bằng tiếng Anh (`Phase`, `PhaseHours`, `phaseOf`, `phaseDay`, `classifyPhase`, `isPhase`, `addDays`, giá trị `morningstart|morningend|afternoonstart|afternoonend`) — không thêm field/giá trị tiếng Việt mới. Identifier tiếng Việt đã có sẵn (`loaiBaoCao`, `phongMay`, `truong`, ...) giữ nguyên.
- Không sửa, không xoá `Buoi`, `sessionOf`, `sessionWindow`, `currentSession`, `isBuoi`, `config.sessions`, `reportFileName` (bản `Buoi` cũ nếu còn dùng ở nơi khác) trong plan này — Chặng 2 sẽ dọn.
- 4 mốc giờ mặc định (giờ VN, decimal): `morningEndFromHour: 9`, `afternoonStartFromHour: 12.5`, `afternoonEndFromHour: 15`, `morningStartFromHour: 17.5`.
- `npm test` và `npm run typecheck` phải sạch sau MỖI task, không chỉ ở cuối.
- Làm việc trong worktree `.worktrees/giai-doan-4-phan` (nhánh `feature/giai-doan-4-phan`), không đổi sang thư mục repo chính.

## Review Focus

1. Báo cáo ĐẦU BUỔI lỡ **cả 2** khung đầu-buổi trong ngày (gửi sau 17h30) — phải đẩy sang `morningstart` NGÀY MAI, không phải giữ nguyên ngày hôm nay hay rơi vào `afternoonend`.
2. Báo cáo CUỐI BUỔI gửi rất sớm (trước 9h) — phải nhận đúng `morningstart` (giai đoạn thô), không có ngoại lệ nào "sửa" nó về `morningend`.
3. Tin nhắn "đêm hôm trước" (sau 17h30 của NGÀY TRƯỚC opts.day) khi chạy `extract:reports --day <hôm nay> --buoi morningstart` — phải được đưa vào kết quả (không bị lọc mất ở bước lọc thô ban đầu vì nằm ở calendar-day khác `opts.day`).
4. Tin nhắn bị bỏ qua (không parse được / ảnh / thu hồi — không có `loaiBaoCao`) vẫn phải được đếm đúng vào `summary.xet`/`marks` của đúng giai đoạn dựa trên giờ thô, không bị rớt khỏi kết quả hay lẫn sang giai đoạn khác.
5. File mẫu Excel không đọc được tiêu đề ở ô A1 dòng 2 (file hỏng, sai định dạng) — phải báo lỗi rõ tên file, không được âm thầm dùng chuỗi rỗng làm tên file xuất.

---

### Task 1: `Phase`, `PhaseHours`, `config.phases` và 4 hàm phân loại mới trong `time.ts`

**Files:**
- Modify: `src/types/session.ts` (thêm `Phase`, `PhaseHours`)
- Modify: `src/types/config.ts` (thêm `phases` vào `ConfigShape`)
- Modify: `src/lesson/time.ts` (thêm `addDays`, `phaseOf`, `phaseDay`, `classifyPhase`, `isPhase`)
- Modify: `config.ts` (thêm section `phases`)
- Modify: `src/config/configCheck.ts` (validate `phases`)
- Modify: `src/config/configDoc.ts` (thêm section `9. GIAI ĐOẠN BÁO CÁO` + 4 `Setting`)
- Modify: `tests/helpers/pinConfig.js` (thêm `"phases."` vào `SECTIONS`)
- Test: `tests/time.test.ts`, `tests/configCheck.test.ts`, `tests/configDoc.test.ts`

**Interfaces:**
- Produces: `Phase = "morningstart" | "morningend" | "afternoonstart" | "afternoonend"`; `PhaseHours { morningEndFromHour: number; afternoonStartFromHour: number; afternoonEndFromHour: number; morningStartFromHour: number }`; `phaseOf(ts: number, hours?: PhaseHours): Phase`; `phaseDay(ts: number, hours?: PhaseHours): string`; `classifyPhase(ts: number, loaiBaoCao: LoaiBaoCao, hours?: PhaseHours): { phase: Phase; day: string }`; `isPhase(value: string | undefined): value is Phase`; `addDays(day: string, n: number): string`. Tất cả dùng ở Task 3 (`extract.ts`), Task 4 (`fill-report.ts`), Task 5 (`fill-status-reports.ts`).

- [ ] **Step 1: Thêm `Phase`/`PhaseHours` vào `src/types/session.ts`**

Thêm vào cuối file `src/types/session.ts`:

```ts
export type Phase = "morningstart" | "morningend" | "afternoonstart" | "afternoonend";

/** Mốc giờ (24h, có thể lẻ như 12.5 = 12h30) chia ngày thành 4 giai đoạn — xem `phaseOf`/`classifyPhase` trong time.ts. */
export interface PhaseHours {
    morningEndFromHour: number;
    afternoonStartFromHour: number;
    afternoonEndFromHour: number;
    morningStartFromHour: number;
}
```

- [ ] **Step 2: Viết test THẤT BẠI cho `phaseOf`/`phaseDay`/`classifyPhase`/`isPhase`/`addDays`**

Thêm vào cuối `tests/time.test.ts` (giữ nguyên import cũ, thêm `addDays, classifyPhase, isPhase, phaseDay, phaseOf` vào dòng import từ `../src/lesson/time.js`):

```ts
test("addDays adds/subtracts calendar days, crossing month/year boundaries", () => {
    assert.equal(addDays("2026-09-29", 1), "2026-09-30");
    assert.equal(addDays("2026-09-30", 1), "2026-10-01");
    assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("phaseOf splits the Vietnam day into 4 phases at 9:00, 12:30, 15:00, 17:30", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.equal(phaseOf(vn(0)), "morningstart");
    assert.equal(phaseOf(vn(8, 59)), "morningstart");
    assert.equal(phaseOf(vn(9)), "morningend");
    assert.equal(phaseOf(vn(12, 29)), "morningend");
    assert.equal(phaseOf(vn(12, 30)), "afternoonstart");
    assert.equal(phaseOf(vn(14, 59)), "afternoonstart");
    assert.equal(phaseOf(vn(15)), "afternoonend");
    assert.equal(phaseOf(vn(17, 29)), "afternoonend");
    assert.equal(phaseOf(vn(17, 30)), "morningstart");
    assert.equal(phaseOf(vn(23, 59)), "morningstart");
});

test("phaseDay: early-morning morningstart (before 9h) stays on the same day; late-night morningstart (after 17h30) rolls to tomorrow", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.equal(phaseDay(vn(3)), "2026-09-24");
    assert.equal(phaseDay(vn(8, 59)), "2026-09-24");
    assert.equal(phaseDay(vn(17, 30)), "2026-09-25");
    assert.equal(phaseDay(vn(23, 59)), "2026-09-25");
    assert.equal(phaseDay(vn(12)), "2026-09-24");
});

test("classifyPhase: a CuoiBuoi report always keeps its raw phase/day, even when that raw phase is a morning-report slot", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.deepEqual(classifyPhase(vn(3), "CuoiBuoi"), { phase: "morningstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(11), "CuoiBuoi"), { phase: "morningend", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(13), "CuoiBuoi"), { phase: "afternoonstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(18), "CuoiBuoi"), { phase: "morningstart", day: "2026-09-25" });
});

test("classifyPhase: a late DauBuoi report is pushed forward to the next dau-buoi slot, never into a cuoi-buoi slot", () => {
    const vn = (h: number, m = 0) => Date.UTC(2026, 8, 24, h - 7, m);
    assert.deepEqual(classifyPhase(vn(9, 48), "DauBuoi"), { phase: "afternoonstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(16), "DauBuoi"), { phase: "morningstart", day: "2026-09-25" });
    assert.deepEqual(classifyPhase(vn(3), "DauBuoi"), { phase: "morningstart", day: "2026-09-24" });
    assert.deepEqual(classifyPhase(vn(13), "DauBuoi"), { phase: "afternoonstart", day: "2026-09-24" });
});

test("isPhase accepts only the 4 phase values", () => {
    assert.equal(isPhase("morningstart"), true);
    assert.equal(isPhase("afternoonend"), true);
    assert.equal(isPhase("sang"), false);
    assert.equal(isPhase(undefined), false);
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL vì chưa có hàm**

Run: `node --import tsx --test tests/time.test.ts`
Expected: FAIL — `addDays`/`phaseOf`/`phaseDay`/`classifyPhase`/`isPhase` không tồn tại (lỗi import hoặc `is not a function`).

- [ ] **Step 4a: Thêm `phases` vào `ConfigShape` (`src/types/config.ts`)**

Ngay sau dòng `sessions: { chieuFromHour: number; toiFromHour: number };` trong `src/types/config.ts`, thêm:
```ts
    phases: { morningEndFromHour: number; afternoonStartFromHour: number; afternoonEndFromHour: number; morningStartFromHour: number };
```

- [ ] **Step 4b: Thêm `phases` vào `config.ts`**

Trong `config.ts`, ngay sau khối `sessions: { ... },` hiện có (trước dấu `};` đóng `config`), thêm:

```ts
    /** Giai đoạn báo cáo trạng thái thiết bị (thay cho buổi sáng/chiều/tối cũ) — xem `phaseOf`/`classifyPhase` trong src/lesson/time.ts. */
    phases: {
        /** Giờ bắt đầu "cuối buổi sáng" (0-24, có thể lẻ). */
        morningEndFromHour: 9,
        /** Giờ bắt đầu "đầu buổi chiều". */
        afternoonStartFromHour: 12.5,
        /** Giờ bắt đầu "cuối buổi chiều". */
        afternoonEndFromHour: 15,
        /** Giờ bắt đầu "đầu buổi sáng NGÀY MAI" (wrap qua nửa đêm). Yêu cầu morningEndFromHour < afternoonStartFromHour < afternoonEndFromHour < morningStartFromHour. */
        morningStartFromHour: 17.5,
    },
```

- [ ] **Step 5: Thêm `addDays`, `phaseOf`, `phaseDay`, `classifyPhase`, `isPhase` vào `src/lesson/time.ts`**

Thêm vào cuối `src/lesson/time.ts` (giữ nguyên mọi hàm cũ), sửa dòng import đầu file từ:
```ts
import type { Buoi, SessionHours } from "../types/index.js";
```
thành:
```ts
import type { Buoi, LoaiBaoCao, Phase, PhaseHours, SessionHours } from "../types/index.js";
```

rồi thêm cuối file:

```ts
/** `YYYY-MM-DD` cộng/trừ `n` ngày lịch (không phụ thuộc múi giờ — thao tác thuần trên ngày/tháng/năm). */
export function addDays(day: string, n: number): string {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function hourOfDayVN(ts: number): number {
    const d = new Date(ts + VN_OFFSET_MS);
    return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
}

/**
 * Giai đoạn THÔ của một mốc thời gian, chỉ theo giờ đồng hồ (giờ Việt Nam), không xét loại báo cáo.
 * Mặc định 4 mốc: 9:00, 12:30, 15:00, 17:30 (config.phases). `morningstart` bao trùm cả sáng sớm (giờ < mốc đầu)
 * lẫn đêm khuya (giờ >= mốc cuối, khi đó thuộc "đầu buổi sáng NGÀY MAI" — xem `phaseDay`).
 */
export function phaseOf(ts: number, hours: PhaseHours = config.phases): Phase {
    const h = hourOfDayVN(ts);
    if (h < hours.morningEndFromHour) return "morningstart";
    if (h < hours.afternoonStartFromHour) return "morningend";
    if (h < hours.afternoonEndFromHour) return "afternoonstart";
    if (h < hours.morningStartFromHour) return "afternoonend";
    return "morningstart";
}

/** Ngày ứng với giai đoạn THÔ (`phaseOf`) của một mốc thời gian — cộng 1 ngày khi rơi vào phần "đêm khuya" của `morningstart`. */
export function phaseDay(ts: number, hours: PhaseHours = config.phases): string {
    const day = vietnamDay(ts);
    return hourOfDayVN(ts) >= hours.morningStartFromHour ? addDays(day, 1) : day;
}

/**
 * Phân loại một tin nhắn vào đúng (giai đoạn, ngày) theo `loaiBaoCao` VÀ giờ gửi — xem
 * "Quy tắc phân loại" trong spec. Báo cáo CUỐI BUỔI luôn nhận nguyên giai đoạn/ngày thô (kể cả khi đó là
 * một khung "đầu buổi"). Báo cáo ĐẦU BUỔI lỡ hẹn (giai đoạn thô ra "cuối buổi") bị đẩy sang khung đầu-buổi
 * KẾ TIẾP: lỡ đầu-sáng (giai đoạn thô `morningend`) -> `afternoonstart` cùng ngày; lỡ đầu-chiều (giai đoạn
 * thô `afternoonend`) -> `morningstart` NGÀY MAI (ngày phải cộng thêm 1 thủ công vì giờ gửi thật luôn < mốc
 * wrap nên `phaseDay` không tự cộng được).
 */
export function classifyPhase(ts: number, loaiBaoCao: LoaiBaoCao, hours: PhaseHours = config.phases): { phase: Phase; day: string } {
    const raw = phaseOf(ts, hours);
    const day = phaseDay(ts, hours);
    if (loaiBaoCao !== "DauBuoi") return { phase: raw, day };
    if (raw === "morningend") return { phase: "afternoonstart", day };
    if (raw === "afternoonend") return { phase: "morningstart", day: addDays(day, 1) };
    return { phase: raw, day };
}

export function isPhase(value: string | undefined): value is Phase {
    return value === "morningstart" || value === "morningend" || value === "afternoonstart" || value === "afternoonend";
}
```

- [ ] **Step 6: Chạy test, xác nhận PASS**

Run: `node --import tsx --test tests/time.test.ts`
Expected: PASS, tất cả test (cũ và mới) đều xanh.

- [ ] **Step 7: Validate `config.phases` trong `configCheck.ts`**

Trong `src/config/configCheck.ts`, ngay sau khối validate `sessions` hiện có (2 dòng `chieuFromHour`/`toiFromHour`), thêm:

```ts
    const { morningEndFromHour, afternoonStartFromHour, afternoonEndFromHour, morningStartFromHour } = cfg.phases;
    if (!(morningEndFromHour > 0 && morningEndFromHour < afternoonStartFromHour && afternoonStartFromHour < afternoonEndFromHour && afternoonEndFromHour < morningStartFromHour && morningStartFromHour <= 24)) {
        errors.push(`phases phải thoả 0 < morningEndFromHour < afternoonStartFromHour < afternoonEndFromHour < morningStartFromHour <= 24 (đang là ${JSON.stringify(cfg.phases)}).`);
    }
```

- [ ] **Step 8: Thêm `phases` vào fixture `good()` và test validate mới trong `tests/configCheck.test.ts`**

`tests/configCheck.test.ts` dựng config hợp lệ qua hàm `good(): ConfigShape` (đầu file) và mutate bằng `bad((c) => ...)`. Thêm field `phases` vào `good()`, ngay sau dòng `sessions: { chieuFromHour: 12, toiFromHour: 18 },`:
```ts
    phases: { morningEndFromHour: 9, afternoonStartFromHour: 12.5, afternoonEndFromHour: 15, morningStartFromHour: 17.5 },
```

Thêm test mới ngay sau test `"session hours must satisfy 0 < chieuFromHour < toiFromHour <= 23"` đã có, cùng khuôn mẫu `bad(...)`:
```ts
test("phases hours must satisfy 0 < morningEndFromHour < afternoonStartFromHour < afternoonEndFromHour < morningStartFromHour <= 24", () => {
    assert.throws(bad((c) => (c.phases.morningEndFromHour = 0)), /phases/);
    assert.throws(bad((c) => (c.phases.morningStartFromHour = c.phases.afternoonEndFromHour)), /phases/);
    assert.throws(bad((c) => (c.phases.morningStartFromHour = 25)), /phases/);
    assert.deepEqual(bad((c) => (c.phases.morningStartFromHour = 18))(), []);
});
```

- [ ] **Step 9: Chạy test, xác nhận PASS**

Run: `node --import tsx --test tests/configCheck.test.ts`
Expected: PASS.

- [ ] **Step 10: Thêm 4 `Setting` cho `phases` vào `configDoc.ts`**

Trong `src/config/configDoc.ts`:
1. Đổi dòng đầu (comment + mảng `SECTIONS`):
```ts
/** 9 mục theo thứ tự trong config.ts. */
export const SECTIONS = ["1. ZALO", "2. NHÓM THEO DÕI", "3. CÀO", "4. WATCH (bot:watch)", "5. RUNNER (bot:runner)", "6. KHÔI PHỤC", "7. CHAT (bot:chat)", "8. BUỔI HỌC", "9. GIAI ĐOẠN BÁO CÁO"];
```
2. Ngay sau 2 dòng `Setting` của `sessions.chieuFromHour`/`sessions.toiFromHour` (tìm bằng `grep -n "sessions.toiFromHour" src/config/configDoc.ts`), thêm:
```ts
    { section: SECTIONS[8], path: "phases.morningEndFromHour", unit: "giờ", default: 9, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"cuối buổi sáng\"." },
    { section: SECTIONS[8], path: "phases.afternoonStartFromHour", unit: "giờ", default: 12.5, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"đầu buổi chiều\"." },
    { section: SECTIONS[8], path: "phases.afternoonEndFromHour", unit: "giờ", default: 15, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"cuối buổi chiều\"." },
    { section: SECTIONS[8], path: "phases.morningStartFromHour", unit: "giờ", default: 17.5, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"đầu buổi sáng NGÀY MAI\" (wrap qua nửa đêm)." },
```

- [ ] **Step 11: Thêm `"phases."` vào `tests/helpers/pinConfig.js`**

Sửa dòng `const SECTIONS = ["watch.", "runner.", "recovery.", "chat.", "sessions."];` thành:
```js
const SECTIONS = ["watch.", "runner.", "recovery.", "chat.", "sessions.", "phases."];
```

- [ ] **Step 12: Chạy `npm run config:show` bằng tay, xác nhận section mới hiện ra**

Run: `npm run config:show`
Expected: có dòng `9. GIAI ĐOẠN BÁO CÁO` với 4 dòng `phases.*`, không có dòng nào đánh dấu `*` (chưa đổi khỏi mặc định).

- [ ] **Step 13: Chạy toàn bộ test + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS toàn bộ, không lỗi kiểu.

- [ ] **Step 14: Commit**

```bash
git add src/types/session.ts src/lesson/time.ts config.ts src/config/configCheck.ts src/config/configDoc.ts tests/helpers/pinConfig.js tests/time.test.ts tests/configCheck.test.ts
git commit -m "feat: thêm Phase/config.phases và phaseOf/phaseDay/classifyPhase song song với Buoi cũ"
```

---

### Task 2: Cột CẤP (BO SUNG MAY TINH) đổi sang số La Mã

**Files:**
- Modify: `src/lesson/statusRows.ts`
- Test: `tests/statusRows.test.ts`

**Interfaces:**
- Consumes: không phụ thuộc Task 1.
- Produces: `capToRoman(capHoc: string): string` (hàm mới, export để test trực tiếp), dùng trong `buildBoSungRows`.

- [ ] **Step 1: Viết test thất bại**

Trong `tests/statusRows.test.ts`, thêm import `capToRoman` vào dòng import đầu file (cùng dòng với `buildBoSungRows, ...`), rồi thêm test (đặt trước test `"BO SUNG: a room with thieu - loi > 0..."`):

```ts
test("capToRoman: TH/THCS/THPT map to Roman numerals, LC and unknown values pass through unchanged", () => {
    assert.equal(capToRoman("TH"), "I");
    assert.equal(capToRoman("THCS"), "II");
    assert.equal(capToRoman("THPT"), "III");
    assert.equal(capToRoman("LC"), "LC");
    assert.equal(capToRoman("XYZ"), "XYZ");
});
```

Sửa test `"BO SUNG: a room with thieu - loi > 0 gets a row naming the room, quantities equal to thieu"` — đổi input `capHoc` từ mặc định "LC" (đã có sẵn trong helper `report()`) sang "TH" để chốt hành vi map, và cập nhật assertion:

```ts
test("BO SUNG: a room with thieu - loi > 0 gets a row naming the room, quantities equal to thieu", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 3 }, { loai: "Loi", so: 1 }])], { truong: { capHoc: "TH", tenRieng: "CHU VĂN AN", coSo: null } });
    const rows = buildBoSungRows([r]);
    assert.deepEqual(rows, [{ A: 1, B: "I", C: "CHU VĂN AN", D: "BTAN", J: "PM1", L: 3, M: 3 }]);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/statusRows.test.ts`
Expected: FAIL — `capToRoman is not a function`, và test BO SUNG cũ fail vì `B: "TH"` thay vì `B: "I"`.

- [ ] **Step 3: Implement `capToRoman`, dùng trong `buildBoSungRows`**

Trong `src/lesson/statusRows.ts`, thêm hàm (đặt cạnh `mayTinhGrade`):

```ts
/** Cột CẤP ở BO SUNG MAY TINH: TH/THCS/THPT hiển thị số La Mã, LC và mọi giá trị khác giữ nguyên. */
export function capToRoman(capHoc: string): string {
    const map: Record<string, string> = { TH: "I", THCS: "II", THPT: "III" };
    return map[capHoc] ?? capHoc;
}
```

Sửa dòng trong `buildBoSungRows`:
```ts
rows.push({ A: stt, B: r.data.truong?.capHoc ?? "", C: r.data.truong?.tenRieng ?? "", D: r.data.khuVuc ?? "", J: r.data.phongMay, L: thieu, M: thieu });
```
thành:
```ts
rows.push({ A: stt, B: r.data.truong?.capHoc ? capToRoman(r.data.truong.capHoc) : "", C: r.data.truong?.tenRieng ?? "", D: r.data.khuVuc ?? "", J: r.data.phongMay, L: thieu, M: thieu });
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `node --import tsx --test tests/statusRows.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Kiểm tra test khác dùng `report()` helper mặc định "LC" không bị vỡ**

Run: `npm test`
Expected: PASS — các test BO SUNG khác (STT, no-phongMay, ...) dùng `report()` mặc định `capHoc: "LC"` nên `capToRoman("LC")` trả về `"LC"` y hệt trước, không đổi hành vi.

- [ ] **Step 6: Commit**

```bash
git add src/lesson/statusRows.ts tests/statusRows.test.ts
git commit -m "feat: cột CẤP ở BO SUNG MAY TINH dùng số La Mã (TH/THCS/THPT), LC giữ nguyên"
```

---

### Task 3: `extractAll` lọc theo `Phase` thay vì `Buoi` khi `opts.buoi` là giá trị mới

**Files:**
- Modify: `src/lesson/extract.ts`
- Modify: `src/cli/extract-reports.ts`
- Test: `tests/extract.test.ts`

**Interfaces:**
- Consumes: `phaseOf`, `phaseDay`, `classifyPhase`, `isPhase`, `addDays`, `Phase` từ Task 1 (`src/lesson/time.js`).
- Produces: `ExtractOptions.buoi` đổi type từ `Buoi` sang `Phase`. `extractAll` không đổi signature, chỉ đổi hành vi lọc bên trong. Task 4/5 KHÔNG phụ thuộc task này (chúng chỉ dùng `Phase`/`phaseOf` trực tiếp từ Task 1, không gọi `extractAll`).

- [ ] **Step 1: Viết test thất bại cho hành vi lọc theo `Phase` — tin "đêm hôm trước" phải được gộp vào**

Thêm vào `tests/extract.test.ts` (sau import hiện có, thêm `at` đã có sẵn từ `./fixtures.js`; các test dùng `msg`, `DAY`, `at`, `COMPLETE` đã import sẵn):

```ts
test("extractAll with a Phase buoi: a message sent the night before (after 17:30) for tomorrow's morningstart is included", async () => {
    const lateLastNight = msg(COMPLETE, Date.UTC(2026, 8, 23, 11, 0)); // 18:00 VN on 2026-09-23 (the day BEFORE DAY)
    const r = await extractAll([lateLastNight], { day: DAY, buoi: "morningstart" });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].maTinNhan, lateLastNight.msgId);
});

test("extractAll with a Phase buoi: a late DauBuoi report (after 9h) lands in afternoonstart, not morningend", async () => {
    const late = msg(COMPLETE, at(9, 48));
    const inMorningEnd = await extractAll([late], { day: DAY, buoi: "morningend" });
    assert.equal(inMorningEnd.reports.length, 0);
    const inAfternoonStart = await extractAll([late], { day: DAY, buoi: "afternoonstart" });
    assert.equal(inAfternoonStart.reports.length, 1);
});

test("extractAll with a Phase buoi: a CuoiBuoi report sent before 9h stays in morningstart, not corrected", async () => {
    const cuoiBuoiEarly = msg(COMPLETE.replace("BÁO CÁO ĐẦU BUỔI DẠY", "BÁO CÁO CUỐI BUỔI DẠY"), at(3));
    const r = await extractAll([cuoiBuoiEarly], { day: DAY, buoi: "morningstart" });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].loaiBaoCao, "CuoiBuoi");
});

test("extractAll with a Phase buoi: a skipped (-1) message with no loaiBaoCao is counted by raw phase/day, not lost", async () => {
    const photo = msg(COMPLETE, at(10), { msgType: "desktop.image" });
    const r = await extractAll([photo], { day: DAY, buoi: "morningend" }); // 10h -> raw phaseOf = morningend
    assert.equal(r.summary.xet, 1);
    assert.equal(r.marks.length, 1);
    assert.equal(r.marks[0].maTrangThai, -1);
    const wrongPhase = await extractAll([photo], { day: DAY, buoi: "afternoonstart" });
    assert.equal(wrongPhase.summary.xet, 0);
});

test("extractAll without buoi (undefined) still returns every report of the day, unaffected by Phase filtering", async () => {
    const m = msg(COMPLETE, at(9, 48));
    const r = await extractAll([m], { day: DAY });
    assert.equal(r.reports.length, 1);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/extract.test.ts`
Expected: FAIL — hoặc lỗi kiểu TypeScript (`buoi: "morningstart"` không gán được cho `Buoi`) hoặc test đầu tiên fail vì tin "đêm hôm trước" bị lọc mất bởi `vietnamDay(m.ts) === opts.day` (ngày khác).

- [ ] **Step 3: Đổi `ExtractOptions.buoi` sang `Phase`, viết lại phần lọc trong `extractAll`**

Trong `src/lesson/extract.ts`, sửa dòng import:
```ts
import { sessionOf, vietnamDay } from "./time.js";
import type { Buoi, LyDo, Mark, MessageKey, Override, RawFields, Report, ReviewItem, RoomKey, RoomLookup, SourceMessage } from "../types/index.js";
```
thành:
```ts
import { addDays, classifyPhase, phaseDay, phaseOf, vietnamDay } from "./time.js";
import type { LyDo, Mark, MessageKey, Override, Phase, RawFields, Report, ReviewItem, RoomKey, RoomLookup, SourceMessage } from "../types/index.js";
```

Sửa field trong `ExtractOptions`:
```ts
    /** Only messages sent in this session of that day; omit to consider the whole day. */
    buoi?: Buoi;
```
thành:
```ts
    /** Only messages classified into this phase of that day (see `classifyPhase`); omit to consider the whole day. */
    buoi?: Phase;
```

Sửa dòng lọc `dayMessages` (hiện là dòng 67-69):
```ts
    const dayMessages = messages
        .filter((m) => vietnamDay(m.ts) === opts.day && (opts.buoi === undefined || sessionOf(m.ts) === opts.buoi))
        .sort((a, b) => a.ts - b.ts);
```
thành:
```ts
    // Cửa sổ RỘNG (hôm qua + hôm nay) khi lọc theo giai đoạn: một tin "đêm hôm trước" (sau 17h30) có thể thuộc
    // "đầu buổi sáng" của opts.day dù calendar-day của nó là ngày trước. Lọc chính xác theo (opts.day, opts.buoi)
    // chỉ làm được SAU KHI parse (cần loaiBaoCao) — xem bước lọc report/mark/review cuối hàm.
    const scoped = messages
        .filter((m) => (opts.buoi === undefined ? vietnamDay(m.ts) === opts.day : vietnamDay(m.ts) === opts.day || vietnamDay(m.ts) === addDays(opts.day, -1)))
        .sort((a, b) => a.ts - b.ts);
    const dayMessages = scoped;
```

(Giữ tên `dayMessages` cho phần còn lại của hàm không phải sửa gì thêm — chỉ thêm biến `scoped` làm alias để tên phản ánh đúng "cửa sổ rộng" khi đọc lại code; có thể dùng thẳng `dayMessages` nếu muốn đổi ít dòng hơn, miễn giữ đúng logic lọc rộng ở trên.)

Ở cuối hàm, ngay trước dòng `return { reports, ... }` hiện có, chèn bước lọc theo `Phase` khi `opts.buoi` được truyền:

```ts
    let finalReports = reports;
    let finalMarks = marks;
    let finalReview = review;
    let xet = dayMessages.length;

    if (opts.buoi !== undefined) {
        const buoi = opts.buoi;
        const tsOf = new Map(dayMessages.map((m) => [keyOf(m.groupId, m.msgId), m.ts]));
        const inTarget = (ts: number, loaiBaoCao: Report["loaiBaoCao"] | null): boolean => {
            if (loaiBaoCao !== null) {
                const c = classifyPhase(ts, loaiBaoCao);
                return c.day === opts.day && c.phase === buoi;
            }
            return phaseDay(ts) === opts.day && phaseOf(ts) === buoi;
        };

        finalReports = reports.filter((r) => inTarget(r.thoiGian, r.loaiBaoCao));
        const reportKeys = new Set(finalReports.map((r) => keyOf(r.maNhom, r.maTinNhan)));

        finalMarks = marks.filter((mk) => {
            const key = keyOf(mk.maNhom, mk.maTinNhan);
            if (reportKeys.has(key)) return true;
            const ts = tsOf.get(key);
            return ts !== undefined && inTarget(ts, null);
        });

        finalReview = review.filter((rv) => {
            const key = keyOf(rv.key.maNhom, rv.key.maTinNhan);
            if (rv.draft) return reportKeys.has(key);
            const ts = tsOf.get(key);
            return ts !== undefined && inTarget(ts, null);
        });

        // Mọi tin trong dayMessages đều được mark() đúng 1 lần (kể cả tin có report), nên số mark sau khi lọc
        // chính là số tin thuộc đúng (day, buoi) — không cần gộp thêm với review (review luôn là tập con của mark).
        xet = finalMarks.length;
    }
```

Rồi sửa khối `return` cuối hàm (thay `reports`/`marks`/`review`/`dayMessages.length` bằng bản đã lọc):
```ts
    const theoLyDo: Partial<Record<LyDo, number>> = {};
    for (const r of finalReview) for (const l of r.lyDo) theoLyDo[l] = (theoLyDo[l] ?? 0) + 1;
    return {
        reports: finalReports,
        marks: finalMarks,
        review: finalReview,
        unknownOverrides,
        summary: { xet, baoCao: finalReports.length, boQua: finalMarks.filter((x) => x.maTrangThai === -1).length, canXem: finalReview.length, theoLyDo },
    };
```

(Xoá khối `const theoLyDo` cũ ngay phía trên nếu còn — chỉ giữ 1 bản duy nhất, dùng `finalReview`.)

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `node --import tsx --test tests/extract.test.ts`
Expected: PASS toàn bộ (cũ và mới).

- [ ] **Step 5: Đổi cờ `--buoi` trong `extract-reports.ts`**

Trong `src/cli/extract-reports.ts`, sửa import:
```ts
import { currentSession, isBuoi, todayVietnam } from "../lesson/time.js";
...
import type { Buoi, SourceMessage } from "../types/index.js";
```
thành:
```ts
import { isPhase, phaseOf, todayVietnam } from "../lesson/time.js";
...
import type { Phase, SourceMessage } from "../types/index.js";
```

Sửa khối:
```ts
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isBuoi(buoiArg)) throw new Error(`--buoi must be sang, chieu or toi, got "${buoiArg}"`);
    const buoi: Buoi = buoiArg ?? currentSession();
```
thành:
```ts
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isPhase(buoiArg)) throw new Error(`--buoi must be morningstart, morningend, afternoonstart or afternoonend, got "${buoiArg}"`);
    const buoi: Phase = buoiArg ?? phaseOf(Date.now());
```

Sửa docblock ở đầu file (dòng `--buoi sang|chieu|toi` và `Chỉ tin nhắn được gửi trong buổi này`) đổi thành `--buoi morningstart|morningend|afternoonstart|afternoonend`.

- [ ] **Step 6: Chạy typecheck**

Run: `npm run typecheck`
Expected: sạch — `writeJson("meta.json", { day, buoi })` vẫn hợp lệ vì `buoi` giờ là `Phase` (string), JSON không quan tâm type.

- [ ] **Step 7: Test tay bằng dữ liệu thật**

Run: `node --import tsx src/cli/extract-reports.ts --day 2026-09-23 --buoi afternoonstart --no-db`
Expected: chạy không lỗi, in ra dòng `[extract] ngày 2026-09-23, buổi afternoonstart: xét N tin...`. Đối chiếu: trước đây (khi test buổi chiều = cả `dauChieu`+`cuoiChieu` gộp) ra 2 báo cáo Chu Văn An (msg 8295522365194 lỗi=2 thiếu=4). Giờ với `--buoi afternoonstart`, msg đó (giờ VN 14:10, giai đoạn thô `afternoonstart`, loại `DauBuoi`, không lỡ hẹn) vẫn phải xuất hiện trong `output.json`.

- [ ] **Step 8: Chạy toàn bộ test + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS toàn bộ.

- [ ] **Step 9: Commit**

```bash
git add src/lesson/extract.ts src/cli/extract-reports.ts tests/extract.test.ts
git commit -m "feat: extractAll lọc theo Phase (giai đoạn) thay cho Buoi khi --buoi là giá trị mới"
```

---

### Task 4: `fill-report.ts` (.xlsm) đổi `--buoi` sang `Phase`

**Files:**
- Modify: `src/lesson/time.ts` (thêm `reportFileNameV2`, KHÔNG sửa `reportFileName` cũ)
- Modify: `src/cli/fill-report.ts`
- Test: `tests/time.test.ts`

**Interfaces:**
- Consumes: `Phase`, `isPhase` từ Task 1.
- Produces: `reportFileNameV2(day: string, buoi: Phase): string` — dùng ở `fill-report.ts`.

- [ ] **Step 1: Viết test thất bại**

Thêm vào `tests/time.test.ts` (thêm `reportFileNameV2` vào import):

```ts
test("reportFileNameV2 is baocaobuoi<phase>_<ddMMyy>.xlsm", () => {
    assert.equal(reportFileNameV2("2026-09-29", "morningstart"), "baocaobuoimorningstart_290926.xlsm");
    assert.equal(reportFileNameV2("2026-01-05", "afternoonend"), "baocaobuoiafternoonend_050126.xlsm");
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/time.test.ts`
Expected: FAIL — `reportFileNameV2 is not a function`.

- [ ] **Step 3: Thêm `reportFileNameV2` vào `time.ts`**

Thêm vào cuối `src/lesson/time.ts`:

```ts
/** `baocaobuoimorningstart_290926.xlsm`: bản Phase mới của `reportFileName` — buoi là 1 trong 4 giai đoạn. */
export function reportFileNameV2(day: string, buoi: Phase): string {
    const [y, m, d] = day.split("-");
    return `baocaobuoi${buoi}_${d}${m}${y.slice(2)}.xlsm`;
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `node --import tsx --test tests/time.test.ts`
Expected: PASS.

- [ ] **Step 5: Đổi `fill-report.ts` sang dùng `Phase`/`reportFileNameV2`**

Trong `src/cli/fill-report.ts`, sửa import:
```ts
import { isBuoi, reportFileName, todayVietnam } from "../lesson/time.js";
```
thành:
```ts
import { isPhase, reportFileNameV2, todayVietnam } from "../lesson/time.js";
```

Sửa khối:
```ts
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isBuoi(buoi)) throw new Error("Cần --buoi sang|chieu|toi hoặc output/meta.json do extract:reports tạo.");
```
thành:
```ts
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isPhase(buoi)) throw new Error("Cần --buoi morningstart|morningend|afternoonstart|afternoonend hoặc output/meta.json do extract:reports tạo.");
```

Sửa dòng dùng `reportFileName`:
```ts
    const outFile = outArg ? path.resolve(outArg) : path.join(repoRoot, "data", "export", reportFileName(day, buoi));
```
thành:
```ts
    const outFile = outArg ? path.resolve(outArg) : path.join(repoRoot, "data", "export", reportFileNameV2(day, buoi));
```

Sửa docblock đầu file (`--buoi sang|chieu|toi` → `--buoi morningstart|morningend|afternoonstart|afternoonend`, và dòng mô tả tên file output).

- [ ] **Step 6: Chạy typecheck + test**

Run: `npm run typecheck && npm test`
Expected: sạch, PASS toàn bộ.

- [ ] **Step 7: Test tay (cần Excel, có thể bỏ qua nếu máy không có Excel lúc này — ghi rõ trong log nếu bỏ qua)**

Run: `node --import tsx src/cli/fill-report.ts output/output.json --day 2026-09-23 --buoi afternoonstart`
Expected: nếu có `RoomId` hợp lệ trong `output/output.json` của bước trước, tạo ra `data/export/baocaobuoiafternoonstart_230926.xlsm`.

- [ ] **Step 8: Commit**

```bash
git add src/lesson/time.ts src/cli/fill-report.ts tests/time.test.ts
git commit -m "feat: fill-report.ts (.xlsm) đổi --buoi sang nhận Phase, thêm reportFileNameV2"
```

---

### Task 5: `fill:status-reports` — thư mục `<yyMM>/<yyMMdd>/`, tên file mới, HHmm cố định theo giai đoạn

**Files:**
- Modify: `src/lesson/statusReportLayout.ts` (đổi `WEEKDAY_EXCEL_TYPE1`/thêm hàm đọc tiêu đề + tính HHmm; KHÔNG đổi `FILE_LAYOUT`/`buildFillSpecs` hiện có nếu không cần)
- Modify: `src/cli/fill-status-reports.ts`
- Test: `tests/statusReportLayout.test.ts`

**Interfaces:**
- Consumes: `Phase`, `isPhase`, `phaseOf`, `classifyPhase` (Task 1); `latestPerRoom` (đã có, không đổi).
- Produces: `readTemplateTitle(templatePath: string): string` (đọc dòng 2 ô A1); `PHASE_HHMM: Record<Phase, string>` (map hằng); `statusFileName(title: string, day: string, buoi: Phase): string`.

- [ ] **Step 1: Viết test thất bại cho `statusFileName`**

Thêm vào `tests/statusReportLayout.test.ts` (thêm `PHASE_HHMM, statusFileName` vào dòng import từ `../src/lesson/statusReportLayout.js`):

```ts
test("statusFileName: <title>_<yyMMdd>_T<thu>_<HHmm cố định theo giai đoạn>.xlsx", () => {
    // 2026-09-29 là thứ Ba -> Excel WEEKDAY(d,1) = 3.
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "morningstart"), "TÌNH TRẠNG LOA_260929_T3_0900.xlsx");
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "morningend"), "TÌNH TRẠNG LOA_260929_T3_1230.xlsx");
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "afternoonstart"), "TÌNH TRẠNG LOA_260929_T3_1500.xlsx");
    assert.equal(statusFileName("TÌNH TRẠNG LOA", "2026-09-29", "afternoonend"), "TÌNH TRẠNG LOA_260929_T3_1730.xlsx");
});

test("PHASE_HHMM has the fixed end-of-phase clock time for all 4 phases", () => {
    assert.deepEqual(PHASE_HHMM, { morningstart: "0900", morningend: "1230", afternoonstart: "1500", afternoonend: "1730" });
});
```

Thêm test cho `readTemplateTitle` (bỏ qua nếu thư mục mẫu không có trên máy — theo đúng khuôn mẫu `templatesPresent` đã có sẵn cuối file):

```ts
test(
    "readTemplateTitle reads the exact second line of cell A1 in a real template",
    { skip: templatesPresent ? false : `${templatesDir} không có trên máy này — bỏ qua` },
    () => {
        assert.equal(readTemplateTitle(path.join(templatesDir, "TINH TRANG LOA.xlsx"), "1209"), "TÌNH TRẠNG LOA");
        assert.equal(readTemplateTitle(path.join(templatesDir, "TINH TRANG LOI MAY TINH.xlsx"), "2409"), "TÌNH TRẠNG LỖI MÁY TÍNH");
    },
);
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/statusReportLayout.test.ts`
Expected: FAIL — `statusFileName`/`PHASE_HHMM`/`readTemplateTitle` không tồn tại.

- [ ] **Step 3: Implement trong `src/lesson/statusReportLayout.ts`**

Thêm import `XLSX` (đã dùng ở test, cần dùng ở source giờ) và `Phase` ở đầu file:
```ts
import XLSX from "xlsx";
import type { Phase } from "../types/index.js";
```

Thêm cuối file (sau `buildFillSpecs`):

```ts
export const PHASE_HHMM: Record<Phase, string> = {
    morningstart: "0900",
    morningend: "1230",
    afternoonstart: "1500",
    afternoonend: "1730",
};

/**
 * Đọc dòng 2 của ô A1 (gộp 2 dòng, vd "TIN HỌC ĐẠI DƯƠNG\nTÌNH TRẠNG LOA") trong file mẫu — đây là tiêu đề
 * hiển thị dùng làm tên file xuất, KHÔNG hard-code danh sách tên vì mỗi file mẫu tự có sẵn dòng này.
 */
export function readTemplateTitle(templatePath: string, sheet: string): string {
    const wb = XLSX.readFile(templatePath);
    const ws = wb.Sheets[sheet];
    const cell = ws?.["A1"];
    const raw = typeof cell?.v === "string" ? cell.v : "";
    const lines = raw.split("\n");
    if (lines.length < 2 || !lines[1].trim()) throw new Error(`${templatePath}: không đọc được dòng tiêu đề (dòng 2) ở ô A1 sheet "${sheet}".`);
    return lines[1].trim();
}

/** `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm cố định của giai đoạn>.xlsx` — xem spec "fill:status-reports". */
export function statusFileName(title: string, day: string, buoi: Phase): string {
    const [y, m, d] = day.split("-");
    const yyMMdd = `${y.slice(2)}${m}${d}`;
    const weekday = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
    return `${title}_${yyMMdd}_T${WEEKDAY_EXCEL_TYPE1(weekday)}_${PHASE_HHMM[buoi]}.xlsx`;
}
```

(`WEEKDAY_EXCEL_TYPE1` đã tồn tại trong file này — dùng lại nguyên hàm, không viết lại.)

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `node --import tsx --test tests/statusReportLayout.test.ts`
Expected: PASS toàn bộ (`readTemplateTitle` có thể bị skip nếu không có `data/mau bao cao new` trên máy chạy test — trong worktree này CÓ vì `data` đã symlink, nên phải PASS thật, không skip).

- [ ] **Step 5: Đổi `fill-status-reports.ts` sang cấu trúc thư mục/tên file mới**

Đọc lại toàn bộ `src/cli/fill-status-reports.ts` hiện có trước khi sửa (đã đổi nhiều lần trong phiên làm việc trước, đảm bảo diff khớp bản mới nhất trên nhánh `feature/giai-doan-4-phan`, không phải bản trong tóm tắt này).

Đổi:
1. Import: thêm `isPhase, phaseOf, phaseDay, classifyPhase` (dùng cái cần) từ `../lesson/time.js`; thêm `PHASE_HHMM, readTemplateTitle, statusFileName` từ `../lesson/statusReportLayout.js`; đổi kiểu `buoi` từ chuỗi bất kỳ sang `Phase`.
2. Validate `--buoi`/`meta.buoi` bằng `isPhase` thay vì `isBuoi`.
3. Loại bỏ dòng lọc `loaiBaoCao === "DauBuoi"` / gọi `latestPerRoom` — GIỮ NGUYÊN `latestPerRoom(reports)` như hiện tại (không đổi, đã đúng theo commit trước — chỉ đổi PHẦN THƯ MỤC/TÊN FILE, không đổi lại logic chọn báo cáo).
4. Đổi `outDir`:
```ts
const outDir = path.join(config.dataDir, "export", "trang-thai", buoi);
```
thành:
```ts
const yyMM = day.slice(2, 4) + day.slice(5, 7);
const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
const outDir = path.join(config.dataDir, "export", "trang-thai", yyMM, yyMMdd);
```
5. Với MỖI trong 5 file có dữ liệu (vòng lặp `Object.keys(FILE_LAYOUT)`), tính tên file xuất bằng `statusFileName(readTemplateTitle(path.join(templatesSrc, layout.templateFile), spec.sheet), day, buoi)` thay vì `layout.templateFile`, và truyền tên đó làm `out` trong `psSpec.files[0].out` (giữ `template` là `layout.templateFile` gốc để COPY từ, chỉ đổi tên FILE ĐÍCH).
6. Với vòng lặp copy 5 file `OTHER_TEMPLATE_FILES` (trừ `VI PHAM NOI QUY THUC TAP.xlsx` — đọc kỹ ghi chú "Ngoài phạm vi" trong spec, file này KHÔNG đổi tên, copy y nguyên tên + vào `outDir` MỚI như các file khác), tính tên đích bằng `statusFileName(readTemplateTitle(path.join(templatesSrc, file), <tên sheet đầu tiên đọc được qua wb.SheetNames[0]>), day, buoi)`.

Vì bước 6 cần đọc sheet đầu tiên của 4 file (không phải VI PHAM) bằng `XLSX.readFile(...).SheetNames[0]` (các file này không có trong `FILE_LAYOUT` nên không có `sheet` sẵn) — viết rõ trong code:
```ts
for (const file of OTHER_TEMPLATE_FILES) {
    const src = path.join(templatesSrc, file);
    if (file === "VI PHAM NOI QUY THUC TAP.xlsx") {
        fs.copyFileSync(src, path.join(outDir, file));
        continue;
    }
    const wb = XLSX.readFile(src);
    const title = readTemplateTitle(src, wb.SheetNames[0]);
    fs.copyFileSync(src, path.join(outDir, statusFileName(title, day, buoi)));
}
```
(Thêm `import XLSX from "xlsx";` vào đầu `fill-status-reports.ts` nếu chưa có.)

- [ ] **Step 6: Chạy typecheck**

Run: `npm run typecheck`
Expected: sạch.

- [ ] **Step 7: Test tay bằng dữ liệu thật (đã có `output/output.json` từ Task 3 Step 7)**

Run: `node --import tsx src/cli/fill-status-reports.ts output/output.json --day 2026-09-23 --buoi afternoonstart`
Expected:
- Thư mục `data/export/trang-thai/2609/260923/` được tạo.
- 5 file có dữ liệu mang tên đúng format, ví dụ `TÌNH TRẠNG LOA_260923_T4_1500.xlsx` (2026-09-23 là thứ Tư → WEEKDAY=4; giai đoạn `afternoonstart` → HHmm=`1500`).
- 4 file copy nguyên trạng (trừ VI PHAM) cũng mang tên mới đúng format.
- `VI PHAM NOI QUY THUC TAP.xlsx` copy với TÊN GỐC, không đổi.
- Mở 1 file bằng script dump có sẵn từ phiên trước (`node <script>.cjs "<đường dẫn file mới>" "<sheet>"`), xác nhận formula `TỔNG`/CHÚ GIẢI vẫn hợp lệ (không `#REF!`), dữ liệu đúng.

- [ ] **Step 8: Chạy toàn bộ test + typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS toàn bộ.

- [ ] **Step 9: Commit**

```bash
git add src/lesson/statusReportLayout.ts src/cli/fill-status-reports.ts tests/statusReportLayout.test.ts
git commit -m "feat: fill-status-reports xuất vào data/export/trang-thai/<yyMM>/<yyMMdd>/ với tên file mới theo giai đoạn"
```

---

### Task 6: Cập nhật tài liệu (`CLAUDE.md`, `Teach-lesson-skills-V2/SKILL.md`)

**Files:**
- Modify: `CLAUDE.md` (dòng lệnh `extract:reports`/`fill:report`/`fill:status-reports` trong "Commands")
- Modify: `Teach-lesson-skills-V2/SKILL.md` (mục "Báo cáo tình trạng thiết bị" — KHÔNG đụng khối `## Quy tắc trích xuất` .. `## Script trích xuất và agent giám sát`)

**Interfaces:**
- Consumes: không có, chỉ cập nhật văn bản mô tả các thay đổi từ Task 1-5.

- [ ] **Step 1: Sửa `CLAUDE.md`**

Đổi 3 dòng lệnh trong "Commands":
```
npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]   # extract one session's start/end-of-lesson reports -> output/{output,marks,review,meta}.json
npm run fill:report -- output/output.json      # fill templates/Temp_RoomFacility_rpt.xlsm, run its macro -> data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm (needs Excel)
npm run fill:status-reports -- output/output.json   # fill 5 non-macro status templates (BO SUNG MAY TINH, LOA, INTERNET, NETSUPPORT, MÁY TÍNH) from output/output.json, copy the other 5 as-is, into data/export/trang-thai/ (needs Excel)
```
thành:
```
npm run extract:reports -- [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--no-db]   # extract one PHASE's start/end-of-lesson reports -> output/{output,marks,review,meta}.json
npm run fill:report -- output/output.json      # fill templates/Temp_RoomFacility_rpt.xlsm, run its macro -> data/export/baocaobuoi<phase>_<ddMMyy>.xlsm (needs Excel)
npm run fill:status-reports -- output/output.json   # fill 5 non-macro status templates (BO SUNG MAY TINH, LOA, INTERNET, NETSUPPORT, MÁY TÍNH) from output/output.json, copy the other 5 as-is (except VI PHAM NOI QUY THUC TAP), into data/export/trang-thai/<yyMM>/<yyMMdd>/<title>_<yyMMdd>_T<thu>_<HHmm>.xlsx (needs Excel)
```

- [ ] **Step 2: Sửa `Teach-lesson-skills-V2/SKILL.md`**

Trong mục "## Báo cáo tình trạng thiết bị (thêm, không thuộc quy trình bắt buộc ở trên)":
- Đổi mô tả "buổi sang/chieu/toi" thành "giai đoạn morningstart/morningend/afternoonstart/afternoonend".
- Cập nhật câu về thư mục xuất: `data/export/trang-thai/<yyMM>/<yyMMdd>/` thay vì `data/export/trang-thai/<buoi>/`.
- Cập nhật câu về tên file: `<tiêu đề đọc từ ô A1>_<yyMMdd>_T<thứ>_<HHmm cố định theo giai đoạn>.xlsx`, và ghi rõ `VI PHAM NOI QUY THUC TAP.xlsx` là ngoại lệ, giữ tên gốc.
- Giữ nguyên mọi bullet khác (PM, SỐ LẦN, XẾP LOẠI, cột CẤP — chỉ thêm 1 dòng mới về Roman numeral: "Cột CẤP: TH→I, THCS→II, THPT→III, LC giữ nguyên.").

Sau khi sửa, diff xác nhận khối `## Quy tắc trích xuất` .. `## Script trích xuất và agent giám sát` KHÔNG đổi 1 ký tự nào:
```bash
git show HEAD:"Teach-lesson-skills-V2/SKILL.md" | awk '/^## Quy tắc trích xuất/{f=1} /^## Script trích xuất và agent giám sát/{f=0} f' > /tmp/before.txt
awk '/^## Quy tắc trích xuất/{f=1} /^## Script trích xuất và agent giám sát/{f=0} f' "Teach-lesson-skills-V2/SKILL.md" > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt && echo "PROTECTED BLOCK IDENTICAL"
```
Expected: `PROTECTED BLOCK IDENTICAL`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md "Teach-lesson-skills-V2/SKILL.md"
git commit -m "docs: cập nhật CLAUDE.md và skill theo giai đoạn 4 buổi mới (Chặng 1)"
```
