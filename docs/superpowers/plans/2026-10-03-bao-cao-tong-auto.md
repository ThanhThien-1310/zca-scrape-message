# Báo cáo tổng tự động (bot:total) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm bot `bot:total` (cùng lõi `total:once` và `total:status`) tự xuất 7 file báo cáo tổng `-auto` lúc 9:00 (tin 6:30 đến 9:00) và 15:00 (tin 6:30 đến 15:00), chạy song song `bot:runner` mà không sửa gì ở 4 giai đoạn.

**Architecture:** Lõi `runTotalOnce` (nhận phụ thuộc để test được) đọc kho tin cục bộ, lọc khung giờ, lấy mỗi phòng một báo cáo mới nhất có xếp loại, dựng 7 file bằng đúng các hàm dựng dòng và `runFillTemplate` của dự án A, ghi tracker riêng. Vỏ `bot:total` là vòng hẹn giờ gọi hàm thuần `decideTotal` (đợi runner có thời hạn, chạy bù, xuất lại) rồi gọi lõi; kết quả từng đợt lưu ở `data/.total-slots.json`. Bot không lấy khoá cào, không đụng `output/output.json`, không đánh dấu tin trong DB.

**Tech Stack:** TypeScript (Node 22, `tsx`), `node:test`, Excel COM qua PowerShell (đã có), thư viện `xlsx` (chỉ trong script kiểm tra).

**Spec:** `docs/superpowers/specs/2026-10-02-bao-cao-tong-auto-design.md` (bộ mẫu 7 file: `docs/superpowers/specs/2026-10-03-bo-mau-moi-7-file-design.md`)

## Global Constraints

- Giờ Việt Nam (UTC+7) cho mọi mốc giờ; khung dữ liệu nửa mở `fromMs <= ts < atMs` (6:30 tính, 9:00 hoặc 15:00 không tính cho đợt đó).
- Đúng **7 file** mỗi đợt: LOA, MÁY TÍNH, NETSUPPORT, INTERNET, ĐIỆN (rỗng tạm), VỆ SINH, NỘI QUY. Tên file `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>-auto.xlsx`, `HHmm` là giờ xuất thực tế, cùng thư mục `data/export/trang-thai/<yyMM>/<yyMMdd>/` với 4 giai đoạn.
- Cấu hình mới mục `total`: `windowStartHour` 6.5, `morningHour` 9, `afternoonHour` 15, `waitMaxMinutes` 10, `refreshEveryMinutes` 10, `refreshUntilMinutes` 60, `pollSeconds` 5; kiểm tra ở `configCheck.ts` và mô tả ở `configDoc.ts`.
- Bot total **không** dùng `acquireScrapeLock`, **không** đọc/ghi `output/output.json`, `data/.runner-built.json`, **không** gọi `mark:messages`; file riêng: `data/.total-state.json`, `data/.total-slots.json`, `data/.total-report-files.json`; tên spec/log Excel có tiền tố `total-`.
- Không in ở plan này (phần C). Không thêm thư viện mới.
- Identifier mới bằng tiếng Anh; chú thích và thông báo cho người dùng bằng tiếng Việt, theo giọng văn các file hiện có.
- File nguồn và test của dự án dùng CRLF: sau khi tạo file mới bằng công cụ Write, chạy `sed -i 's/\r$//; s/$/\r/' <file>` để đồng nhất.
- Test: `node --import tsx --test <file>`; test phụ thuộc giá trị mặc định của config phải `import "./helpers/pinConfig.js"` ĐẦU TIÊN. Kiểm kiểu: `npm run typecheck`.
- Chỉ commit khi người dùng đã cho phép commit; nếu chưa, bỏ qua các bước commit (các bước commit ghi sẵn để dùng khi được phép).

## Preflight

Cây làm việc đang có nhiều thay đổi **chưa commit** của dự án A (bộ mẫu 7 file). Nên commit dự án A thành một commit riêng TRƯỚC khi bắt đầu để diff của B sạch (nếu người dùng cho phép commit). Kiểm tra nền: `npm run typecheck` sạch và `npm test` xanh (483 test).

## Review Focus

Những đầu vào mà spec ngụ ý nhưng không task nào kiểm tra tự nhiên; mỗi dòng có test ở task sở hữu mã:

1. **Mốc biên của khung giờ** (6:29:59.999, 6:30:00, 8:59:59.999, 9:00:00, 14:59, 15:00:00) và tin của NGÀY KHÁC cùng giờ: không lọt vào khung → Task 2 và Task 3.
2. **Báo cáo muộn hơn nhưng trống mọi xếp loại** không được xoá báo cáo có xếp loại trước đó của cùng phòng; phòng lỗi lúc 10h rồi bình thường lúc 14h ra một dòng bình thường ở đợt chiều và vẫn lỗi ở đợt sáng → Task 3 và Task 6.
3. **Runner chết khi hàng chờ còn nhóm**: xuất ngay (chưa đủ), không xuất lại vô ích khi runner vẫn chết, sống lại và rảnh thì xuất lại đủ; lỗi lặp lại không tạo vòng thử vô hạn → Task 4.
4. **Khởi động lại bot**: đợt đã `final` không xuất lại; bot bật muộn chạy bù đúng 1 lần với khung kết thúc ở giờ đợt (không phải giờ chạy bù); dữ liệu cũ hơn 3 ngày bị dọn → Task 4 và Task 5.
5. **Một file điền lỗi** (ví dụ đang mở trong Excel): 6 file còn lại vẫn xuất, bản cũ của file lỗi được GIỮ (không bị xoá), đợt đó bị đánh dấu lỗi để thử lại → Task 6.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `config.ts`, `src/types/config.ts`, `src/config/configCheck.ts`, `src/config/configDoc.ts` | mục cấu hình `total` (Task 1) |
| `src/total/slots.ts` | toán khung giờ, khoá đợt, tên file `-auto` (Task 2) |
| `src/total/windowReports.ts` | lọc tin theo khung, dựng báo cáo, mỗi phòng một báo cáo, gom tin vệ sinh/điểm danh (Task 3) |
| `src/total/decide.ts` | `decideTotal` và các hàm tạo kết quả đợt (thuần, Task 4) |
| `src/total/totalState.ts` | trạng thái và nhịp tim của bot, kết quả từng đợt (Task 5) |
| `src/total/runnerSnapshot.ts` | đọc sức khoẻ và trạng thái runner (Task 5) |
| `src/total/runTotal.ts` | lõi `runTotalOnce` (Task 6) |
| `src/total/totalStatusReport.ts` | `formatTotalStatus` (Task 7) |
| `src/total/realDeps.ts` | phụ thuộc thật của lõi (Task 7) |
| `src/cli/total-once.ts`, `src/cli/bot-total.ts`, `src/cli/total-status.ts`, `package.json`, `CLAUDE.md` | lệnh chạy và tài liệu (Task 7) |
| `tests/total*.test.ts` (6 file), `tests/configCheck.test.ts`, `tests/configDoc.test.ts`, `tests/helpers/pinConfig.ts` | test |

---

### Task 1: Mục cấu hình `total`

**Files:**
- Modify: `config.ts` (thêm mục 10 sau `phases`)
- Modify: `src/types/config.ts`
- Modify: `src/config/configCheck.ts`
- Modify: `src/config/configDoc.ts`
- Modify: `tests/helpers/pinConfig.ts`
- Test: `tests/configCheck.test.ts`, `tests/configDoc.test.ts`

**Interfaces:**
- Consumes: `ConfigShape`, `validateConfig(cfg: ConfigShape): string[]` (ném khi có lỗi), `SETTINGS`, `SECTIONS`.
- Produces: `config.total: { windowStartHour: number; morningHour: number; afternoonHour: number; waitMaxMinutes: number; refreshEveryMinutes: number; refreshUntilMinutes: number; pollSeconds: number }` (các task sau đọc `config.total.*`); `ConfigShape.total` cùng dạng.

- [ ] **Step 1: Viết test lỗi trước**

Trong `tests/configCheck.test.ts`: thêm dòng sau vào object trả về của `good()`, ngay sau dòng `phases: {...},`:

```typescript
    total: { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15, waitMaxMinutes: 10, refreshEveryMinutes: 10, refreshUntilMinutes: 60, pollSeconds: 5 },
```

Thêm vào CUỐI file `tests/configCheck.test.ts`:

```typescript
test("total hours must satisfy 0 <= windowStartHour < morningHour < afternoonHour <= 24", () => {
    assert.throws(bad((c) => (c.total.windowStartHour = 9)), /total/);
    assert.throws(bad((c) => (c.total.afternoonHour = 9)), /total/);
    assert.throws(bad((c) => (c.total.afternoonHour = 25)), /total/);
    assert.throws(bad((c) => (c.total.windowStartHour = -1)), /total/);
    assert.deepEqual(bad((c) => (c.total.windowStartHour = 0))(), []);
    assert.deepEqual(bad((c) => (c.total.afternoonHour = 24))(), []);
});

test("total minutes and seconds must be positive whole numbers, and the error names the key", () => {
    assert.throws(bad((c) => (c.total.waitMaxMinutes = 0)), /total\.waitMaxMinutes/);
    assert.throws(bad((c) => (c.total.refreshEveryMinutes = 1.5)), /total\.refreshEveryMinutes/);
    assert.throws(bad((c) => (c.total.refreshUntilMinutes = -1)), /total\.refreshUntilMinutes/);
    assert.throws(bad((c) => (c.total.pollSeconds = 0)), /total\.pollSeconds/);
    assert.deepEqual(bad((c) => (c.total.pollSeconds = 1))(), []);
});
```

Trong `tests/configDoc.test.ts`: đổi `of the 9 sections` thành `of the 10 sections` (nếu đang ghi 9) và `assert.equal(SECTIONS.length, 9);` thành `assert.equal(SECTIONS.length, 10);`.

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `node --import tsx --test tests/configCheck.test.ts tests/configDoc.test.ts`
Expected: FAIL (`validateConfig` chưa kiểm `total`; `SECTIONS.length` còn 9).

- [ ] **Step 3: Cài đặt**

`config.ts` — thay đoạn cuối file:

```typescript
        morningStartFromHour: 17.5,
    },
};

export type BotConfig = typeof config;
```

bằng:

```typescript
        morningStartFromHour: 17.5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 10. BÁO CÁO TỔNG (bot:total, giờ Việt Nam) — hai đợt mỗi ngày xuất 7 file `-auto`.
    // ═══════════════════════════════════════════════════════════════════════
    total: {
        /** Giờ bắt đầu khung dữ liệu của MỌI đợt (0-24, có thể lẻ). Ví dụ 6.5 là 6:30; tin gửi trước mốc này không được tính. */
        windowStartHour: 6.5,
        /** Giờ chạy đợt sáng, cũng là cuối khung dữ liệu của đợt: lấy tin từ windowStartHour đến trước giờ này. Ví dụ 9 là 9:00. */
        morningHour: 9,
        /** Giờ chạy đợt chiều: lấy tin từ windowStartHour đến trước giờ này (cộng dồn cả buổi sáng). Yêu cầu 0 <= windowStartHour < morningHour < afternoonHour <= 24. */
        afternoonHour: 15,
        /** Tới giờ đợt mà runner còn bận (hàng chờ chưa rỗng), đợi tối đa bấy nhiêu phút rồi vẫn xuất bằng dữ liệu có sẵn kèm cảnh báo. Đơn vị: phút. */
        waitMaxMinutes: 10,
        /** Lần xuất đầu thiếu dữ liệu vì runner bận thì xuất lại mỗi bấy nhiêu phút (hoặc ngay khi hàng chờ rỗng). Đơn vị: phút. */
        refreshEveryMinutes: 10,
        /** Ngừng xuất lại sau bấy nhiêu phút kể từ giờ đợt. Đơn vị: phút. */
        refreshUntilMinutes: 60,
        /** Bao lâu bot xem lại một lần xem đã tới giờ đợt chưa. Đơn vị: giây. */
        pollSeconds: 5,
    },
};

export type BotConfig = typeof config;
```

`src/types/config.ts` — thêm sau dòng `phases: {...};`:

```typescript
    total: { windowStartHour: number; morningHour: number; afternoonHour: number; waitMaxMinutes: number; refreshEveryMinutes: number; refreshUntilMinutes: number; pollSeconds: number };
```

`src/config/configCheck.ts` — trong mảng `positive`, thay:

```typescript
        ["chat.echoWindowSeconds", cfg.chat.echoWindowSeconds],
    ];
```

bằng:

```typescript
        ["chat.echoWindowSeconds", cfg.chat.echoWindowSeconds],
        ["total.waitMaxMinutes", cfg.total.waitMaxMinutes],
        ["total.refreshEveryMinutes", cfg.total.refreshEveryMinutes],
        ["total.refreshUntilMinutes", cfg.total.refreshUntilMinutes],
        ["total.pollSeconds", cfg.total.pollSeconds],
    ];
```

và thay dòng `    const { min, max } = cfg.scrollDelayMs;` bằng:

```typescript
    const { windowStartHour, morningHour, afternoonHour } = cfg.total;
    if (!(windowStartHour >= 0 && windowStartHour < morningHour && morningHour < afternoonHour && afternoonHour <= 24)) {
        errors.push(`total phải thoả 0 <= windowStartHour < morningHour < afternoonHour <= 24 (đang là ${JSON.stringify({ windowStartHour, morningHour, afternoonHour })}).`);
    }

    const { min, max } = cfg.scrollDelayMs;
```

`src/config/configDoc.ts` — thay dòng `export const SECTIONS = [...]` bằng bản có thêm phần tử cuối `"10. BÁO CÁO TỔNG (bot:total)"`:

```typescript
export const SECTIONS = ["1. ZALO", "2. NHÓM THEO DÕI", "3. CÀO", "4. WATCH (bot:watch)", "5. RUNNER (bot:runner)", "6. KHÔI PHỤC", "7. CHAT (bot:chat)", "8. BUỔI HỌC", "9. GIAI ĐOẠN BÁO CÁO", "10. BÁO CÁO TỔNG (bot:total)"];
```

và thêm vào cuối mảng `SETTINGS`, ngay trước dấu `];` (sau dòng `phases.morningStartFromHour`):

```typescript

    { section: SECTIONS[9], path: "total.windowStartHour", unit: "giờ", default: 6.5, readers: ["bot:total", "total:once"], note: "Giờ bắt đầu khung dữ liệu của mọi đợt báo cáo tổng; tin gửi trước mốc này không được tính." },
    { section: SECTIONS[9], path: "total.morningHour", unit: "giờ", default: 9, readers: ["bot:total", "total:once"], note: "Giờ chạy đợt sáng, cũng là cuối khung dữ liệu của đợt." },
    { section: SECTIONS[9], path: "total.afternoonHour", unit: "giờ", default: 15, readers: ["bot:total", "total:once"], note: "Giờ chạy đợt chiều (khung dữ liệu cộng dồn từ windowStartHour)." },
    { section: SECTIONS[9], path: "total.waitMaxMinutes", unit: "phút", default: 10, readers: ["bot:total"], note: "Đợi runner rảnh tối đa bấy nhiêu phút kể từ giờ đợt, rồi vẫn xuất kèm cảnh báo." },
    { section: SECTIONS[9], path: "total.refreshEveryMinutes", unit: "phút", default: 10, readers: ["bot:total"], note: "Lần xuất đầu thiếu dữ liệu thì xuất lại mỗi bấy nhiêu phút (hoặc ngay khi hàng chờ rỗng)." },
    { section: SECTIONS[9], path: "total.refreshUntilMinutes", unit: "phút", default: 60, readers: ["bot:total"], note: "Ngừng xuất lại sau bấy nhiêu phút kể từ giờ đợt." },
    { section: SECTIONS[9], path: "total.pollSeconds", unit: "giây", default: 5, readers: ["bot:total"], note: "Bao lâu xem lại một lần xem đã tới giờ đợt chưa." },
```

`tests/helpers/pinConfig.ts` — đổi dòng `const SECTIONS = [...]` thành:

```typescript
const SECTIONS = ["watch.", "runner.", "recovery.", "chat.", "sessions.", "phases.", "total."];
```

Sau khi sửa, chuẩn hoá CRLF cho các file đã sửa nếu công cụ ghi LF: `sed -i 's/\r$//; s/$/\r/' config.ts src/types/config.ts src/config/configCheck.ts src/config/configDoc.ts tests/helpers/pinConfig.ts tests/configCheck.test.ts tests/configDoc.test.ts`.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/configCheck.test.ts tests/configDoc.test.ts` rồi `npm run typecheck`
Expected: PASS, typecheck sạch. (Test "every key of config has a documented entry" cũng phải đạt: `total.*` đã có đủ 7 mục.)

- [ ] **Step 5: Commit**

```bash
git add config.ts src/types/config.ts src/config/configCheck.ts src/config/configDoc.ts tests/helpers/pinConfig.ts tests/configCheck.test.ts tests/configDoc.test.ts
git commit -m "feat(total): mục cấu hình total cho báo cáo tổng 9h và 15h"
```

---

### Task 2: Khung giờ, khoá đợt và tên file `-auto`

**Files:**
- Create: `src/total/slots.ts`
- Test: `tests/totalSlots.test.ts`

**Interfaces:**
- Consumes: `config.total` (Task 1), `freeFormFileName(title, day, hhmm)` (`src/lesson/statusReportLayout.ts`).
- Produces:
  - `type SlotName = "morning" | "afternoon"`
  - `interface TotalSlot { name: SlotName; day: string; fromMs: number; atMs: number }`
  - `interface SlotHours { windowStartHour: number; morningHour: number; afternoonHour: number }`
  - `vietnamHourToMs(day: string, hour: number): number`
  - `slotsOfDay(day: string, hours?: SlotHours): TotalSlot[]` (thứ tự: sáng rồi chiều)
  - `inSlotWindow(ts: number, slot: Pick<TotalSlot, "fromMs" | "atMs">): boolean`
  - `slotKey(slot: Pick<TotalSlot, "day" | "name">): string` (dạng `2026-10-03|morning`)
  - `autoFileName(title: string, day: string, hhmm: string): string`
  - `isSlotName(v: string | undefined): v is SlotName`

- [ ] **Step 1: Viết test lỗi trước**

Tạo `tests/totalSlots.test.ts`:

```typescript
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { autoFileName, inSlotWindow, isSlotName, slotKey, slotsOfDay, vietnamHourToMs } from "../src/total/slots.js";

const HOURS = { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 };
/** Mốc UTC-ms của giờ:phút:giây GIỜ VIỆT NAM ngày 2026-10-03. */
const vn = (h: number, m = 0, s = 0, ms = 0): number => Date.UTC(2026, 9, 3, h - 7, m, s, ms);

test("vietnamHourToMs reads fractional hours on the Vietnam clock", () => {
    assert.equal(vietnamHourToMs("2026-10-03", 6.5), vn(6, 30));
    assert.equal(vietnamHourToMs("2026-10-03", 9), vn(9));
    assert.equal(vietnamHourToMs("2026-10-03", 0), vn(0));
    assert.equal(vietnamHourToMs("2026-10-03", 24), vn(24));
});

test("slotsOfDay: both slots share the window start and end at their own hour", () => {
    const [morning, afternoon] = slotsOfDay("2026-10-03", HOURS);
    assert.deepEqual(morning, { name: "morning", day: "2026-10-03", fromMs: vn(6, 30), atMs: vn(9) });
    assert.deepEqual(afternoon, { name: "afternoon", day: "2026-10-03", fromMs: vn(6, 30), atMs: vn(15) });
});

test("slotsOfDay uses config.total when no hours are given", () => {
    assert.deepEqual(slotsOfDay("2026-10-03"), slotsOfDay("2026-10-03", HOURS));
});

test("inSlotWindow is half-open: 6:30:00 in, 6:29:59.999 out, the slot hour itself out of its own slot but in the later one", () => {
    const [morning, afternoon] = slotsOfDay("2026-10-03", HOURS);
    assert.equal(inSlotWindow(vn(6, 29, 59, 999), morning), false);
    assert.equal(inSlotWindow(vn(6, 30), morning), true);
    assert.equal(inSlotWindow(vn(8, 59, 59, 999), morning), true);
    assert.equal(inSlotWindow(vn(9), morning), false);
    assert.equal(inSlotWindow(vn(9), afternoon), true);
    assert.equal(inSlotWindow(vn(14, 59), afternoon), true);
    assert.equal(inSlotWindow(vn(15), afternoon), false);
});

test("inSlotWindow: the same clock time on ANOTHER day is outside", () => {
    const [morning] = slotsOfDay("2026-10-03", HOURS);
    assert.equal(inSlotWindow(Date.UTC(2026, 9, 2, 0, 0), morning), false); // 07:00 ngày 02/10
    assert.equal(inSlotWindow(Date.UTC(2026, 9, 4, 0, 0), morning), false); // 07:00 ngày 04/10
});

test("slotKey joins the day and the slot name", () => {
    assert.equal(slotKey({ day: "2026-10-03", name: "morning" }), "2026-10-03|morning");
    assert.equal(slotKey({ day: "2026-10-03", name: "afternoon" }), "2026-10-03|afternoon");
});

test("autoFileName keeps <title>_<yyMMdd>_T<thu>_<HHmm> and puts -auto before .xlsx", () => {
    // 2026-10-03 là thứ Bảy -> Excel WEEKDAY(d,1) = 7.
    assert.equal(autoFileName("TÌNH TRẠNG LOA", "2026-10-03", "0907"), "TÌNH TRẠNG LOA_261003_T7_0907-auto.xlsx");
});

test("isSlotName accepts only the two slot names", () => {
    assert.equal(isSlotName("morning"), true);
    assert.equal(isSlotName("afternoon"), true);
    assert.equal(isSlotName("evening"), false);
    assert.equal(isSlotName(undefined), false);
});
```

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `node --import tsx --test tests/totalSlots.test.ts`
Expected: FAIL (không tìm thấy `src/total/slots.js`).

- [ ] **Step 3: Cài đặt**

Tạo `src/total/slots.ts`:

```typescript
import { config } from "../../config.js";
import { freeFormFileName } from "../lesson/statusReportLayout.js";

/** Hai đợt báo cáo tổng mỗi ngày: sáng (đến 9:00) và chiều (đến 15:00, cộng dồn). */
export type SlotName = "morning" | "afternoon";

export interface TotalSlot {
    name: SlotName;
    /** Ngày của đợt, YYYY-MM-DD theo giờ Việt Nam. */
    day: string;
    /** Đầu khung dữ liệu (epoch ms), tính cả mốc này. */
    fromMs: number;
    /** Giờ chạy của đợt, cũng là cuối khung dữ liệu (epoch ms), KHÔNG tính mốc này. */
    atMs: number;
}

export interface SlotHours {
    windowStartHour: number;
    morningHour: number;
    afternoonHour: number;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Mốc epoch-ms của `hour` giờ (có thể lẻ, vd 6.5 là 6:30) trên đồng hồ Việt Nam của ngày `day` (YYYY-MM-DD). */
export function vietnamHourToMs(day: string, hour: number): number {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d) - VN_OFFSET_MS + Math.round(hour * HOUR_MS);
}

/** Hai đợt của một ngày, theo thứ tự sáng rồi chiều; cùng đầu khung `windowStartHour`, cuối khung là giờ đợt. */
export function slotsOfDay(day: string, hours: SlotHours = config.total): TotalSlot[] {
    const fromMs = vietnamHourToMs(day, hours.windowStartHour);
    return [
        { name: "morning", day, fromMs, atMs: vietnamHourToMs(day, hours.morningHour) },
        { name: "afternoon", day, fromMs, atMs: vietnamHourToMs(day, hours.afternoonHour) },
    ];
}

/** Tin gửi trong khung của đợt: `fromMs <= ts < atMs` (nửa mở, nên tin đúng 9:00:00 thuộc đợt chiều). */
export function inSlotWindow(ts: number, slot: Pick<TotalSlot, "fromMs" | "atMs">): boolean {
    return ts >= slot.fromMs && ts < slot.atMs;
}

/** Khoá của một đợt trong `data/.total-slots.json`, vd `2026-10-03|morning`. */
export function slotKey(slot: Pick<TotalSlot, "day" | "name">): string {
    return `${slot.day}|${slot.name}`;
}

/** Tên file báo cáo tổng: như `freeFormFileName` (giờ xuất thực tế) nhưng thêm `-auto` trước `.xlsx`. */
export function autoFileName(title: string, day: string, hhmm: string): string {
    return freeFormFileName(title, day, hhmm).replace(/\.xlsx$/, "-auto.xlsx");
}

export function isSlotName(value: string | undefined): value is SlotName {
    return value === "morning" || value === "afternoon";
}
```

Chuẩn hoá CRLF: `sed -i 's/\r$//; s/$/\r/' src/total/slots.ts tests/totalSlots.test.ts`.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/totalSlots.test.ts` rồi `npm run typecheck`
Expected: PASS, typecheck sạch.

- [ ] **Step 5: Commit**

```bash
git add src/total/slots.ts tests/totalSlots.test.ts
git commit -m "feat(total): toán khung giờ của hai đợt và tên file -auto"
```

---

### Task 3: Báo cáo trong khung giờ, mỗi phòng một báo cáo

**Files:**
- Create: `src/total/windowReports.ts`
- Test: `tests/totalWindowReports.test.ts`

**Interfaces:**
- Consumes: `TotalSlot`, `inSlotWindow` (Task 2); `extractRaw`, `applyOverride`, `deriveReport` (`src/lesson/build.ts`); `classifyTitle` (`src/lesson/parseReport.ts`); `classifyCleaningTitle`, `parseCleaningMessage` (`src/lesson/cleaningReport.ts`); `classifyAttendanceTitle`, `parseAttendanceMessage` (`src/lesson/attendanceReport.ts`); kiểu `SourceMessage`, `Override`, `Report`, `CleaningEntry`, `AttendanceEntry`.
- Produces (khung `Win = Pick<TotalSlot, "fromMs" | "atMs">`):
  - `reportsInWindow(messages: SourceMessage[], overrides: Override[], win: Win): Report[]`
  - `latestGradedPerRoom(reports: Report[]): Report[]`
  - `cleaningEntriesInWindow(messages: SourceMessage[], win: Win): CleaningEntry[]`
  - `attendanceEntriesInWindow(messages: SourceMessage[], win: Win): AttendanceEntry[]`

- [ ] **Step 1: Viết test lỗi trước**

Tạo `tests/totalWindowReports.test.ts`:

```typescript
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceEntriesInWindow, cleaningEntriesInWindow, latestGradedPerRoom, reportsInWindow } from "../src/total/windowReports.js";
import { slotsOfDay } from "../src/total/slots.js";
import { COMPLETE, DAY, at, msg } from "./fixtures.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

const HOURS = { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 };
const [morning, afternoon] = slotsOfDay(DAY, HOURS);
const ids = (rs: Report[]): string[] => rs.map((r) => r.maTinNhan).sort();

test("reportsInWindow keeps only text report messages sent inside [from, at)", () => {
    const inside = msg(COMPLETE, at(7, 0));
    const early = msg(COMPLETE, at(6, 29));
    const atNine = msg(COMPLETE, at(9, 0));
    const chat = msg("ok anh", at(8, 0));
    const photo = msg(COMPLETE, at(8, 0), { msgType: "chat.photo" });
    const otherDay = msg(COMPLETE, at(7, 0) - 24 * 3_600_000);
    const all = [inside, early, atNine, chat, photo, otherDay];
    assert.deepEqual(ids(reportsInWindow(all, [], morning)), [inside.msgId]);
    assert.deepEqual(ids(reportsInWindow(all, [], afternoon)), ids([{ maTinNhan: inside.msgId }, { maTinNhan: atNine.msgId }] as Report[]));
});

test("reportsInWindow applies overrides: loaiBo drops a message, a phongMay correction is used", () => {
    const a = msg(COMPLETE, at(7, 0));
    const b = msg(COMPLETE, at(7, 5));
    const overrides = [
        { key: { maNhom: a.groupId, maTinNhan: a.msgId }, sua: { loaiBo: true } },
        { key: { maNhom: b.groupId, maTinNhan: b.msgId }, sua: { phongMay: "PM9" } },
    ];
    const reports = reportsInWindow([a, b], overrides, morning);
    assert.deepEqual(reports.map((r) => [r.maTinNhan, r.data.phongMay]), [[b.msgId, "PM9"]]);
});

function rep(id: string, thoiGian: number, phongMay: string | null, facilities: CoSoVatChat[], maNhom = "g1"): Report {
    return {
        maTinNhan: id, maNguoiGui: "u", maNhom, thoiGian, loaiBaoCao: "CuoiBuoi",
        data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "X", coSo: null }, khuVuc: "K", phongMay, giaoVien: "GV", coSoVatChat: facilities },
    };
}
const graded = (g: string): CoSoVatChat[] => [{ loai: "Internet", xepLoai: g }];
const blank: CoSoVatChat[] = [{ loai: "Internet", xepLoai: "" }, { loai: "AmThanh", xepLoai: null }];

test("latestGradedPerRoom: of two graded reports of one room the LATER wins (lỗi lúc 10h, bình thường lúc 14h)", () => {
    const k = rep("k", at(10, 0), "PM1", graded("K"));
    const t = rep("t", at(14, 0), "PM1", graded("T"));
    assert.deepEqual(ids(latestGradedPerRoom([k, t])), ["t"]);
    assert.deepEqual(ids(latestGradedPerRoom([t, k])), ["t"]);
});

test("latestGradedPerRoom: a LATER report with every grade blank does not erase an earlier graded one", () => {
    const earlier = rep("earlier", at(10, 0), "PM1", graded("K"));
    const laterBlank = rep("laterBlank", at(14, 0), "PM1", blank);
    assert.deepEqual(ids(latestGradedPerRoom([earlier, laterBlank])), ["earlier"]);
    assert.deepEqual(ids(latestGradedPerRoom([laterBlank, earlier])), ["earlier"]);
});

test("latestGradedPerRoom: an earlier blank report is replaced by a later graded one, and two blank ones keep the later", () => {
    assert.deepEqual(ids(latestGradedPerRoom([rep("b", at(8, 0), "PM1", blank), rep("g", at(9, 0), "PM1", graded("T"))])), ["g"]);
    assert.deepEqual(ids(latestGradedPerRoom([rep("b1", at(8, 0), "PM1", blank), rep("b2", at(9, 0), "PM1", blank)])), ["b2"]);
});

test("latestGradedPerRoom: different rooms and groups stay apart, rooms match ignoring case and spaces, no-room reports are all kept", () => {
    const a = rep("a", at(8, 0), "PM1", graded("T"));
    const b = rep("b", at(8, 0), "PM2", graded("T"));
    const c = rep("c", at(8, 0), "PM1", graded("T"), "g2");
    const d = rep("d", at(9, 0), " pm1 ", graded("K"));
    const n1 = rep("n1", at(8, 0), null, graded("T"));
    const n2 = rep("n2", at(8, 0), null, graded("T"));
    assert.deepEqual(ids(latestGradedPerRoom([a, b, c, d, n1, n2])), ["b", "c", "d", "n1", "n2"]);
});

// Mẫu tin vệ sinh thật (giống tests/cleaningReport.test.ts).
const CLEANING = [
    "BÁO CÁO CUỐI BUỔI",
    "- Tên trường: THCS Tân Đông Hiệp - DA",
    "- Tổng số PM: 4 (PM1, PM2 Cty, PM3, PM4 trường)",
    "- Tên IT: Quyền",
    "",
    "- Phòng máy: Tin Học (PM2 kế cận tin)",
    "- Tổng số máy: 51 (tính cả máy GV)",
    "- Netsupport: Có",
    "- Internet: Có",
    "- Vệ sinh sạch sẽ: có",
].join("\n");

test("cleaningEntriesInWindow keeps cleaning reports sent inside the window only", () => {
    const inside = msg(CLEANING, at(8, 30));
    const outside = msg(CLEANING, at(6, 0));
    const school = msg(COMPLETE.replace("ĐẦU", "CUỐI"), at(8, 30));
    const entries = cleaningEntriesInWindow([inside, outside, school], morning);
    assert.deepEqual(entries.map((e) => [e.maTinNhan, e.tenTruong, e.khuVuc, e.phongMay, e.tenIT, e.veSinhSach]), [[inside.msgId, "THCS Tân Đông Hiệp", "DA", "Tin Học (PM2 kế cận tin)", "Quyền", true]]);
    assert.equal(entries[0].thoiGian, at(8, 30));
});

const ATTENDANCE = "BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: Lưu Đình Phong\n- Thời gian đến nơi: 8h25\n- Nơi làm việc: LC QUANG TRUNG NGUYỄN HUỆ Q5";

test("attendanceEntriesInWindow: the afternoon window includes the morning check-in, the morning window excludes an afternoon one", () => {
    const am = msg(ATTENDANCE, at(8, 25));
    const pm = msg(ATTENDANCE, at(14, 10));
    const junk = msg("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A", at(8, 0));
    assert.deepEqual(attendanceEntriesInWindow([am, pm, junk], morning).map((e) => e.maTinNhan), [am.msgId]);
    assert.deepEqual(attendanceEntriesInWindow([am, pm, junk], afternoon).map((e) => e.maTinNhan), [am.msgId, pm.msgId]);
    assert.deepEqual(attendanceEntriesInWindow([am], morning)[0], { maNhom: am.groupId, maTinNhan: am.msgId, thoiGian: at(8, 25), tenNV: "Lưu Đình Phong", noiLamViec: "LC QUANG TRUNG NGUYỄN HUỆ Q5" });
});
```

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `node --import tsx --test tests/totalWindowReports.test.ts`
Expected: FAIL (không tìm thấy `src/total/windowReports.js`).

- [ ] **Step 3: Cài đặt**

Tạo `src/total/windowReports.ts`:

```typescript
import { classifyAttendanceTitle, parseAttendanceMessage } from "../lesson/attendanceReport.js";
import { applyOverride, deriveReport, extractRaw } from "../lesson/build.js";
import { classifyCleaningTitle, parseCleaningMessage } from "../lesson/cleaningReport.js";
import { classifyTitle } from "../lesson/parseReport.js";
import { inSlotWindow, type TotalSlot } from "./slots.js";
import type { AttendanceEntry, CleaningEntry, Override, Report, SourceMessage } from "../types/index.js";

/** Khung dữ liệu của một đợt (xem `inSlotWindow`). */
type Win = Pick<TotalSlot, "fromMs" | "atMs">;

/**
 * Báo cáo ĐẦU/CUỐI BUỔI DẠY của các tin văn bản gửi trong khung. Chỉ lọc theo GIỜ GỬI THẬT (không dùng luật dời giai
 * đoạn của `classifyPhase`) và không tra DB: bảng tình trạng không cần `maPhong`. Áp `overrides` như `extractAll`
 * (loại bỏ, đổi loại báo cáo, sửa trường).
 */
export function reportsInWindow(messages: SourceMessage[], overrides: Override[], win: Win): Report[] {
    const byKey = new Map(overrides.map((o) => [`${o.key.maNhom}|${o.key.maTinNhan}`, o]));
    const out: Report[] = [];
    for (const m of messages) {
        if (m.msgType !== "desktop.text" || !inSlotWindow(m.ts, win)) continue;
        const ov = byKey.get(`${m.groupId}|${m.msgId}`);
        if (ov?.sua.loaiBo) continue;
        const kind = ov?.sua.loaiBaoCao ?? classifyTitle(m.content);
        if (kind !== "DauBuoi" && kind !== "CuoiBuoi") continue;
        out.push(deriveReport(m, kind, applyOverride(extractRaw(m.content, m.groupName), ov?.sua)));
    }
    return out;
}

const hasGrade = (r: Report): boolean => r.data.coSoVatChat.some((f) => f.xepLoai !== null && f.xepLoai !== "");

/**
 * Mỗi phòng (nhóm + tên phòng IN HOA đã trim) một báo cáo: báo cáo MỚI NHẤT CÓ XẾP LOẠI. Báo cáo muộn hơn nhưng trống mọi
 * xếp loại (ví dụ "Học tại lớp") KHÔNG đè báo cáo có xếp loại trước đó của cùng phòng; nếu cả hai cùng có hoặc cùng
 * không có xếp loại thì lấy báo cáo muộn hơn. Chỉ dùng cho báo cáo tổng (4 giai đoạn vẫn dùng `latestPerRoom`).
 * Báo cáo không có tên phòng được giữ nguyên hết, không gộp với nhau.
 */
export function latestGradedPerRoom(reports: Report[]): Report[] {
    const best = new Map<string, Report>();
    const noRoom: Report[] = [];
    for (const r of reports) {
        if (!r.data.phongMay) {
            noRoom.push(r);
            continue;
        }
        const key = `${r.maNhom}|${r.data.phongMay.toUpperCase().trim()}`;
        const current = best.get(key);
        if (!current) {
            best.set(key, r);
            continue;
        }
        const rGraded = hasGrade(r);
        const currentGraded = hasGrade(current);
        if ((rGraded && !currentGraded) || (rGraded === currentGraded && r.thoiGian > current.thoiGian)) best.set(key, r);
    }
    return [...best.values(), ...noRoom];
}

/** Dòng vệ sinh của các tin "BÁO CÁO CUỐI BUỔI" (IT kỹ thuật) gửi trong khung; một tin nhiều phòng ra nhiều dòng. */
export function cleaningEntriesInWindow(messages: SourceMessage[], win: Win): CleaningEntry[] {
    const out: CleaningEntry[] = [];
    for (const m of messages) {
        if (!inSlotWindow(m.ts, win) || !classifyCleaningTitle(m.content)) continue;
        for (const room of parseCleaningMessage(m.content)) out.push({ maNhom: m.groupId, maTinNhan: m.msgId, thoiGian: m.ts, ...room });
    }
    return out;
}

/** Tin "BÁO CÁO ĐIỂM DANH" hợp lệ gửi trong khung (giờ gửi thật quyết định sáng/chiều và đi trễ). */
export function attendanceEntriesInWindow(messages: SourceMessage[], win: Win): AttendanceEntry[] {
    const out: AttendanceEntry[] = [];
    for (const m of messages) {
        if (!inSlotWindow(m.ts, win) || !classifyAttendanceTitle(m.content)) continue;
        const parsed = parseAttendanceMessage(m.content);
        if (!parsed) continue;
        out.push({ maNhom: m.groupId, maTinNhan: m.msgId, thoiGian: m.ts, tenNV: parsed.tenNV, noiLamViec: parsed.noiLamViec });
    }
    return out;
}
```

Chuẩn hoá CRLF: `sed -i 's/\r$//; s/$/\r/' src/total/windowReports.ts tests/totalWindowReports.test.ts`.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/totalWindowReports.test.ts` rồi `npm run typecheck`
Expected: PASS, typecheck sạch.

- [ ] **Step 5: Commit**

```bash
git add src/total/windowReports.ts tests/totalWindowReports.test.ts
git commit -m "feat(total): lọc báo cáo theo khung giờ, mỗi phòng một báo cáo mới nhất có xếp loại"
```

---

### Task 4: Quyết định khi nào xuất (đợi runner, xuất lại, bỏ cuộc)

**Files:**
- Create: `src/total/decide.ts`
- Test: `tests/totalDecide.test.ts`

**Interfaces:**
- Consumes: `TotalSlot` (Task 2); `config.total`; kiểu `Health`, `RunnerPhase` (`../types/index.js`).
- Produces:
  - `interface SlotRecord { firstRunAt: number; lastRunAt: number; complete: boolean; final: boolean; pending: string[]; files: string[]; warnings: string[]; failures: number }`
  - `interface RunnerSnapshot { health: Health; phase: RunnerPhase | null }`
  - `interface DecideInput { now: number; slot: TotalSlot; record: SlotRecord | undefined; runner: RunnerSnapshot; queue: string[]; waitMaxMs?: number; refreshEveryMs?: number; refreshUntilMs?: number; maxFailures?: number }`
  - `type TotalDecision = { action: "idle" } | { action: "wait"; reason: "runner-busy" | "refresh-later" } | { action: "run"; kind: "first" | "refresh"; reason: "runner-idle" | "runner-down" | "wait-expired" | "queue-drained" | "refresh-due"; complete: boolean; final: boolean; pending: string[] } | { action: "give-up" }`
  - `decideTotal(input: DecideInput): TotalDecision`
  - `interface RunFlags { complete: boolean; final: boolean; pending: string[] }`
  - `recordAfterRun(prev: SlotRecord | undefined, flags: RunFlags, result: { files: string[]; failed: string[]; warnings: string[] }, now: number): SlotRecord`
  - `recordAfterCrash(prev: SlotRecord | undefined, now: number, message: string): SlotRecord`
  - `giveUp(prev: SlotRecord, reason: string): SlotRecord`
  - hằng `WAIT_MAX_MS`, `REFRESH_EVERY_MS`, `REFRESH_UNTIL_MS`, `POLL_MS`, `MAX_FAILURES` (= 3), tính từ `config.total`.

- [ ] **Step 1: Viết test lỗi trước**

Tạo `tests/totalDecide.test.ts`:

```typescript
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideTotal, giveUp, recordAfterCrash, recordAfterRun, type RunnerSnapshot, type SlotRecord } from "../src/total/decide.js";
import { slotsOfDay } from "../src/total/slots.js";

const [morning] = slotsOfDay("2026-10-03", { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const MIN = 60_000;
const T = { waitMaxMs: 10 * MIN, refreshEveryMs: 10 * MIN, refreshUntilMs: 60 * MIN, maxFailures: 3 };
const at = (minutesAfterSlot: number): number => morning.atMs + minutesAfterSlot * MIN;

const idle: RunnerSnapshot = { health: "alive", phase: "idle" };
const busy: RunnerSnapshot = { health: "alive", phase: "running" };
const waiting: RunnerSnapshot = { health: "alive", phase: "waiting" };
const dead: RunnerSnapshot = { health: "dead", phase: "running" };
const errored: RunnerSnapshot = { health: "error", phase: "error" };

const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: at(10), lastRunAt: at(10), complete: false, final: false, pending: ["A"], files: [], warnings: [], failures: 0, ...over });

test("before the slot hour nothing happens", () => {
    assert.deepEqual(decideTotal({ now: at(-1), slot: morning, record: undefined, runner: idle, queue: [], ...T }), { action: "idle" });
});

test("first run: runner idle and queue empty -> export now, complete and final", () => {
    assert.deepEqual(decideTotal({ now: at(0), slot: morning, record: undefined, runner: idle, queue: [], ...T }), { action: "run", kind: "first", reason: "runner-idle", complete: true, final: true, pending: [] });
});

test("first run: runner busy or waiting, or queue not empty -> wait; at the deadline export anyway as incomplete", () => {
    for (const runner of [busy, waiting]) assert.deepEqual(decideTotal({ now: at(5), slot: morning, record: undefined, runner, queue: ["A"], ...T }), { action: "wait", reason: "runner-busy" });
    assert.deepEqual(decideTotal({ now: at(5), slot: morning, record: undefined, runner: idle, queue: ["A"], ...T }), { action: "wait", reason: "runner-busy" });
    assert.deepEqual(decideTotal({ now: at(10), slot: morning, record: undefined, runner: busy, queue: ["A", "B"], ...T }), { action: "run", kind: "first", reason: "wait-expired", complete: false, final: false, pending: ["A", "B"] });
});

test("first run: runner dead, stopped or in error -> export immediately without waiting", () => {
    assert.deepEqual(decideTotal({ now: at(0), slot: morning, record: undefined, runner: dead, queue: ["A"], ...T }), { action: "run", kind: "first", reason: "runner-down", complete: false, final: false, pending: ["A"] });
    assert.deepEqual(decideTotal({ now: at(0), slot: morning, record: undefined, runner: errored, queue: [], ...T }), { action: "run", kind: "first", reason: "runner-down", complete: true, final: true, pending: [] });
    assert.equal(decideTotal({ now: at(0), slot: morning, record: undefined, runner: { health: "stopped", phase: "stopped" }, queue: ["A"], ...T }).action, "run");
    assert.equal(decideTotal({ now: at(0), slot: morning, record: undefined, runner: { health: "none", phase: null }, queue: [], ...T }).action, "run");
});

test("a bot that starts late catches up the slot once the hour has passed", () => {
    assert.deepEqual(decideTotal({ now: at(180), slot: morning, record: undefined, runner: idle, queue: [], ...T }), { action: "run", kind: "first", reason: "runner-idle", complete: true, final: true, pending: [] });
});

test("a final record never runs again", () => {
    assert.deepEqual(decideTotal({ now: at(30), slot: morning, record: record({ complete: true, final: true, pending: [] }), runner: idle, queue: [], ...T }), { action: "idle" });
    assert.deepEqual(decideTotal({ now: at(30), slot: morning, record: record({ complete: false, final: true }), runner: idle, queue: [], ...T }), { action: "idle" });
});

test("refresh: as soon as the queue is drained and the runner idle, run the last (complete, final) export", () => {
    assert.deepEqual(decideTotal({ now: at(12), slot: morning, record: record({ lastRunAt: at(10) }), runner: idle, queue: [], ...T }), { action: "run", kind: "refresh", reason: "queue-drained", complete: true, final: true, pending: [] });
});

test("refresh: not drained -> wait until refreshEvery has passed since the last run, then refresh as incomplete", () => {
    assert.deepEqual(decideTotal({ now: at(15), slot: morning, record: record({ lastRunAt: at(10) }), runner: busy, queue: ["A"], ...T }), { action: "wait", reason: "refresh-later" });
    assert.deepEqual(decideTotal({ now: at(20), slot: morning, record: record({ lastRunAt: at(10) }), runner: busy, queue: ["A"], ...T }), { action: "run", kind: "refresh", reason: "refresh-due", complete: false, final: false, pending: ["A"] });
});

test("refresh: a dead runner makes nothing new, so wait (no useless re-export) until it is back or the deadline passes", () => {
    assert.deepEqual(decideTotal({ now: at(30), slot: morning, record: record({ lastRunAt: at(10) }), runner: dead, queue: ["A"], ...T }), { action: "wait", reason: "refresh-later" });
    assert.deepEqual(decideTotal({ now: at(61), slot: morning, record: record({ lastRunAt: at(10) }), runner: dead, queue: ["A"], ...T }), { action: "give-up" });
});

test("give up after refreshUntil even when the runner is alive and busy", () => {
    assert.deepEqual(decideTotal({ now: at(60), slot: morning, record: record({ lastRunAt: at(50) }), runner: busy, queue: ["A"], ...T }), { action: "give-up" });
});

test("failures: retry only after refreshEvery (even if drained), and give up after maxFailures", () => {
    const failed = record({ failures: 1, lastRunAt: at(10), pending: [] });
    assert.deepEqual(decideTotal({ now: at(12), slot: morning, record: failed, runner: idle, queue: [], ...T }), { action: "wait", reason: "refresh-later" });
    assert.equal(decideTotal({ now: at(21), slot: morning, record: failed, runner: idle, queue: [], ...T }).action, "run");
    assert.deepEqual(decideTotal({ now: at(21), slot: morning, record: record({ failures: 3 }), runner: idle, queue: [], ...T }), { action: "give-up" });
});

test("recordAfterRun: a clean run stores the flags; a run with a failed file is neither complete nor final and counts a failure", () => {
    const flags = { complete: true, final: true, pending: [] };
    assert.deepEqual(recordAfterRun(undefined, flags, { files: ["a", "b"], failed: [], warnings: [] }, 1000), { firstRunAt: 1000, lastRunAt: 1000, complete: true, final: true, pending: [], files: ["a", "b"], warnings: [], failures: 0 });
    const after = recordAfterRun(record({ firstRunAt: 500, failures: 1 }), flags, { files: ["a"], failed: ["mayTinh"], warnings: ["mayTinh: lỗi"] }, 2000);
    assert.deepEqual(after, { firstRunAt: 500, lastRunAt: 2000, complete: false, final: false, pending: [], files: ["a"], warnings: ["mayTinh: lỗi"], failures: 2 });
    assert.equal(recordAfterRun(record({ failures: 2 }), flags, { files: ["a"], failed: [], warnings: [] }, 3000).failures, 0);
});

test("recordAfterCrash keeps what was known, counts a failure and explains it; giveUp makes the record final", () => {
    const crashed = recordAfterCrash(undefined, 1000, "không đọc được kho tin");
    assert.deepEqual(crashed, { firstRunAt: 1000, lastRunAt: 1000, complete: false, final: false, pending: [], files: [], warnings: ["lỗi: không đọc được kho tin"], failures: 1 });
    assert.equal(recordAfterCrash(crashed, 2000, "x").failures, 2);
    const done = giveUp(record({ warnings: ["w"] }), "hết hạn xuất lại");
    assert.equal(done.final, true);
    assert.deepEqual(done.warnings, ["w", "hết hạn xuất lại"]);
});
```

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `node --import tsx --test tests/totalDecide.test.ts`
Expected: FAIL (không tìm thấy `src/total/decide.js`).

- [ ] **Step 3: Cài đặt**

Tạo `src/total/decide.ts`:

```typescript
import { config } from "../../config.js";
import type { Health, RunnerPhase } from "../types/index.js";
import type { TotalSlot } from "./slots.js";

/** Đợi runner rảnh tối đa chừng này kể từ giờ đợt, rồi xuất bằng dữ liệu có sẵn. */
export const WAIT_MAX_MS = config.total.waitMaxMinutes * 60_000;
/** Lần xuất đầu thiếu dữ liệu thì xuất lại sau chừng này. */
export const REFRESH_EVERY_MS = config.total.refreshEveryMinutes * 60_000;
/** Ngừng xuất lại sau chừng này kể từ giờ đợt. */
export const REFRESH_UNTIL_MS = config.total.refreshUntilMinutes * 60_000;
/** Bot xem lại lịch chừng này một lần. */
export const POLL_MS = config.total.pollSeconds * 1000;
/** Số lần lỗi liên tiếp của một đợt trước khi bỏ cuộc. */
export const MAX_FAILURES = 3;

/** Kết quả đã lưu của một đợt (data/.total-slots.json). */
export interface SlotRecord {
    firstRunAt: number;
    lastRunAt: number;
    /** Lần xuất gần nhất đã thấy hàng chờ rỗng và runner rảnh (hoặc runner không có gì để cào). */
    complete: boolean;
    /** Không xuất lại nữa. */
    final: boolean;
    /** Nhóm còn trong hàng chờ cào lúc xuất. */
    pending: string[];
    files: string[];
    warnings: string[];
    /** Số lần lỗi liên tiếp. */
    failures: number;
}

export interface RunnerSnapshot {
    health: Health;
    phase: RunnerPhase | null;
}

export interface DecideInput {
    now: number;
    slot: TotalSlot;
    record: SlotRecord | undefined;
    runner: RunnerSnapshot;
    queue: string[];
    waitMaxMs?: number;
    refreshEveryMs?: number;
    refreshUntilMs?: number;
    maxFailures?: number;
}

export type TotalDecision =
    | { action: "idle" }
    | { action: "wait"; reason: "runner-busy" | "refresh-later" }
    | { action: "run"; kind: "first" | "refresh"; reason: "runner-idle" | "runner-down" | "wait-expired" | "queue-drained" | "refresh-due"; complete: boolean; final: boolean; pending: string[] }
    | { action: "give-up" };

function run(kind: "first" | "refresh", reason: Extract<TotalDecision, { action: "run" }>["reason"], complete: boolean, final: boolean, pending: string[]): TotalDecision {
    return { action: "run", kind, reason, complete, final, pending };
}

/**
 * Hàm THUẦN quyết định, mỗi lần bot xem lịch, đợt `slot` cần làm gì:
 * - chưa tới giờ hoặc đã `final`: không làm gì;
 * - chưa có kết quả: runner rảnh (còn sống, `idle`, hàng chờ rỗng) thì xuất ngay và đủ; runner không chạy (chết, dừng, lỗi)
 *   thì KHÔNG đợi, xuất ngay (đủ nếu hàng chờ rỗng); runner bận thì đợi tới `waitMaxMs` rồi xuất bằng dữ liệu có sẵn (chưa đủ);
 * - đã xuất nhưng chưa đủ: bỏ cuộc khi quá `refreshUntilMs` hoặc lỗi quá `maxFailures` lần; đợi `refreshEveryMs` giữa các lần
 *   thử sau lỗi; hàng chờ rỗng và runner rảnh thì xuất lại lần cuối (đủ); runner không chạy thì đợi (không xuất lại vô ích);
 *   còn lại xuất lại mỗi `refreshEveryMs`.
 */
export function decideTotal(input: DecideInput): TotalDecision {
    const { now, slot, record, runner, queue } = input;
    const waitMaxMs = input.waitMaxMs ?? WAIT_MAX_MS;
    const refreshEveryMs = input.refreshEveryMs ?? REFRESH_EVERY_MS;
    const refreshUntilMs = input.refreshUntilMs ?? REFRESH_UNTIL_MS;
    const maxFailures = input.maxFailures ?? MAX_FAILURES;

    if (now < slot.atMs) return { action: "idle" };
    if (record?.final) return { action: "idle" };

    const down = runner.health !== "alive";
    const drained = !down && runner.phase === "idle" && queue.length === 0;
    const since = now - slot.atMs;

    if (!record) {
        if (drained) return run("first", "runner-idle", true, true, []);
        if (down) return run("first", "runner-down", queue.length === 0, queue.length === 0, queue);
        if (since >= waitMaxMs) return run("first", "wait-expired", false, false, queue);
        return { action: "wait", reason: "runner-busy" };
    }

    if (record.failures >= maxFailures || since >= refreshUntilMs) return { action: "give-up" };
    if (record.failures > 0 && now - record.lastRunAt < refreshEveryMs) return { action: "wait", reason: "refresh-later" };
    if (drained) return run("refresh", "queue-drained", true, true, []);
    if (down) return { action: "wait", reason: "refresh-later" };
    if (now - record.lastRunAt >= refreshEveryMs) return run("refresh", "refresh-due", false, false, queue);
    return { action: "wait", reason: "refresh-later" };
}

export interface RunFlags {
    complete: boolean;
    final: boolean;
    pending: string[];
}

/** Kết quả đợt sau một lần chạy xong: file nào lỗi thì đợt chưa đủ, chưa final và tính một lần lỗi. */
export function recordAfterRun(prev: SlotRecord | undefined, flags: RunFlags, result: { files: string[]; failed: string[]; warnings: string[] }, now: number): SlotRecord {
    const failed = result.failed.length > 0;
    return {
        firstRunAt: prev?.firstRunAt ?? now,
        lastRunAt: now,
        complete: flags.complete && !failed,
        final: flags.final && !failed,
        pending: flags.pending,
        files: result.files,
        warnings: result.warnings,
        failures: failed ? (prev?.failures ?? 0) + 1 : 0,
    };
}

/** Kết quả đợt khi cả lần chạy ném lỗi (ví dụ không đọc được kho tin): giữ những gì đã biết và tính một lần lỗi. */
export function recordAfterCrash(prev: SlotRecord | undefined, now: number, message: string): SlotRecord {
    return {
        firstRunAt: prev?.firstRunAt ?? now,
        lastRunAt: now,
        complete: false,
        final: false,
        pending: prev?.pending ?? [],
        files: prev?.files ?? [],
        warnings: [`lỗi: ${message}`],
        failures: (prev?.failures ?? 0) + 1,
    };
}

/** Đánh dấu đợt không xuất lại nữa, kèm lý do trong cảnh báo. */
export function giveUp(prev: SlotRecord, reason: string): SlotRecord {
    return { ...prev, final: true, warnings: [...prev.warnings, reason] };
}
```

Chuẩn hoá CRLF: `sed -i 's/\r$//; s/$/\r/' src/total/decide.ts tests/totalDecide.test.ts`.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/totalDecide.test.ts` rồi `npm run typecheck`
Expected: PASS, typecheck sạch.

- [ ] **Step 5: Commit**

```bash
git add src/total/decide.ts tests/totalDecide.test.ts
git commit -m "feat(total): hàm thuần quyết định đợi runner, xuất lại, chạy bù và bỏ cuộc"
```

---

### Task 5: Trạng thái bot, kết quả từng đợt và ảnh chụp runner

**Files:**
- Create: `src/total/totalState.ts`
- Create: `src/total/runnerSnapshot.ts`
- Test: `tests/totalState.test.ts`

**Interfaces:**
- Consumes: `SlotRecord`, `RunnerSnapshot` (Task 4); `writeFileAtomic` (`src/core/atomicWrite.ts`); `pidAlive`, `STALE_AFTER_MS` (`src/watch/watchState.ts`); `readRunnerState`, `runnerHealth` (`src/runner/runnerState.ts`); `todayVietnam`, `addDays` (`src/lesson/time.ts`); kiểu `Health`, `RunnerState`.
- Produces:
  - `type TotalPhase = "idle" | "waiting" | "running" | "stopped"`
  - `interface TotalState { pid: number; startedAt: number; lastBeat: number; state: TotalPhase }`
  - `interface TotalFiles { state: string; slots: string; tracker: string }`; `DEFAULT_TOTAL_FILES: TotalFiles`
  - `readTotalState(file?: string): TotalState | null`
  - `startTotal(now: number, pid: number, file?: string, isAlive?: (pid: number) => boolean): { anotherInstanceAlive: boolean; crashed: boolean }`
  - `beatTotal(now: number, file?: string): void`; `setTotalPhase(now: number, phase: TotalPhase, file?: string): void`; `stopTotal(now: number, file?: string): void`
  - `totalHealth(state: TotalState | null, now: number): Health` (`none` | `stopped` | `dead` | `alive`)
  - `type SlotMap = Record<string, SlotRecord>`; `readSlots(file?: string): SlotMap`; `writeSlots(slots: SlotMap, file?: string): void`; `pruneSlots(slots: SlotMap, now: number, keepDays?: number): SlotMap`; `saveSlot(key: string, record: SlotRecord, now: number, file?: string): void`
  - `takeRunnerSnapshot(now: number, state?: RunnerState | null): RunnerSnapshot`

- [ ] **Step 1: Viết test lỗi trước**

Tạo `tests/totalState.test.ts`:

```typescript
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { STALE_AFTER_MS } from "../src/watch/watchState.js";
import { takeRunnerSnapshot } from "../src/total/runnerSnapshot.js";
import { beatTotal, pruneSlots, readSlots, readTotalState, saveSlot, setTotalPhase, startTotal, stopTotal, totalHealth, writeSlots } from "../src/total/totalState.js";
import type { SlotRecord } from "../src/total/decide.js";
import type { RunnerState } from "../src/types/index.js";

const dir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), "total-state-"));
const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: 1, lastRunAt: 2, complete: true, final: true, pending: [], files: ["a.xlsx"], warnings: [], failures: 0, ...over });

test("startTotal writes an idle state; beat and phase changes keep the pid and start time", () => {
    const file = path.join(dir(), "state.json");
    assert.deepEqual(startTotal(1000, 42, file), { anotherInstanceAlive: false, crashed: false });
    assert.deepEqual(readTotalState(file), { pid: 42, startedAt: 1000, lastBeat: 1000, state: "idle" });
    beatTotal(2000, file);
    setTotalPhase(3000, "running", file);
    assert.deepEqual(readTotalState(file), { pid: 42, startedAt: 1000, lastBeat: 3000, state: "running" });
    stopTotal(4000, file);
    assert.deepEqual(readTotalState(file), { pid: 42, startedAt: 1000, lastBeat: 4000, state: "stopped" });
});

test("startTotal refuses while another live bot is running, takes over a dead or stale one, and reports a crash", () => {
    const file = path.join(dir(), "state.json");
    startTotal(1000, 42, file);
    assert.deepEqual(startTotal(1500, 99, file, () => true), { anotherInstanceAlive: true, crashed: false });
    assert.equal(readTotalState(file)?.pid, 42); // không bị đè
    assert.deepEqual(startTotal(1500, 99, file, () => false), { anotherInstanceAlive: false, crashed: true }); // tiến trình cũ đã chết
    startTotal(1000, 7, file, () => false);
    assert.deepEqual(startTotal(1000 + STALE_AFTER_MS + 1, 99, file, () => true), { anotherInstanceAlive: false, crashed: true }); // nhịp tim quá cũ
    stopTotal(5000, file);
    assert.deepEqual(startTotal(6000, 100, file, () => true), { anotherInstanceAlive: false, crashed: false }); // dừng sạch
});

test("readTotalState reads a missing or corrupt file as null, and beat on a missing state does nothing", () => {
    const d = dir();
    assert.equal(readTotalState(path.join(d, "none.json")), null);
    fs.writeFileSync(path.join(d, "bad.json"), "{not json");
    assert.equal(readTotalState(path.join(d, "bad.json")), null);
    fs.writeFileSync(path.join(d, "shape.json"), JSON.stringify({ pid: "x" }));
    assert.equal(readTotalState(path.join(d, "shape.json")), null);
    beatTotal(1, path.join(d, "none.json"));
    assert.equal(fs.existsSync(path.join(d, "none.json")), false);
});

test("totalHealth: none, stopped, dead after a stale heartbeat, alive otherwise", () => {
    const base = { pid: 1, startedAt: 0, lastBeat: 10_000, state: "idle" as const };
    assert.equal(totalHealth(null, 0), "none");
    assert.equal(totalHealth({ ...base, state: "stopped" }, 10_001), "stopped");
    assert.equal(totalHealth(base, 10_000 + STALE_AFTER_MS), "alive");
    assert.equal(totalHealth(base, 10_000 + STALE_AFTER_MS + 1), "dead");
});

test("slot records round-trip, missing or corrupt files read as empty, and invalid entries are dropped", () => {
    const d = dir();
    const file = path.join(d, "slots.json");
    assert.deepEqual(readSlots(file), {});
    writeSlots({ "2026-10-03|morning": record() }, file);
    assert.deepEqual(readSlots(file), { "2026-10-03|morning": record() });
    fs.writeFileSync(file, JSON.stringify({ "2026-10-03|morning": record(), "2026-10-03|afternoon": { firstRunAt: "x" } }));
    assert.deepEqual(Object.keys(readSlots(file)), ["2026-10-03|morning"]);
    fs.writeFileSync(file, "{not json");
    assert.deepEqual(readSlots(file), {});
});

test("pruneSlots drops entries older than keepDays (by the day in the key) and keeps recent ones", () => {
    const now = Date.UTC(2026, 9, 10, 3, 0); // 10/10/2026 10:00 VN
    const slots = { "2026-10-10|morning": record(), "2026-10-07|afternoon": record(), "2026-10-06|morning": record() };
    assert.deepEqual(Object.keys(pruneSlots(slots, now, 3)).sort(), ["2026-10-07|afternoon", "2026-10-10|morning"]);
});

test("saveSlot adds or replaces one slot and prunes old ones in the same write", () => {
    const file = path.join(dir(), "slots.json");
    const now = Date.UTC(2026, 9, 10, 3, 0);
    writeSlots({ "2026-09-01|morning": record(), "2026-10-10|morning": record({ failures: 1 }) }, file);
    saveSlot("2026-10-10|morning", record({ failures: 0 }), now, file);
    saveSlot("2026-10-10|afternoon", record({ complete: false, final: false }), now, file);
    const slots = readSlots(file);
    assert.deepEqual(Object.keys(slots).sort(), ["2026-10-10|afternoon", "2026-10-10|morning"]);
    assert.equal(slots["2026-10-10|morning"].failures, 0);
});

test("takeRunnerSnapshot reads the runner's health and phase", () => {
    const now = 1_000_000;
    const state = (over: Partial<RunnerState> = {}): RunnerState => ({ pid: 1, startedAt: 0, lastBeat: now, state: "idle", consecutiveFailures: 0, ...over });
    assert.deepEqual(takeRunnerSnapshot(now, null), { health: "none", phase: null });
    assert.deepEqual(takeRunnerSnapshot(now, state()), { health: "alive", phase: "idle" });
    assert.deepEqual(takeRunnerSnapshot(now, state({ state: "running" })), { health: "alive", phase: "running" });
    assert.deepEqual(takeRunnerSnapshot(now, state({ state: "stopped" })), { health: "stopped", phase: "stopped" });
    assert.deepEqual(takeRunnerSnapshot(now, state({ state: "error" })), { health: "error", phase: "error" });
    assert.deepEqual(takeRunnerSnapshot(now + STALE_AFTER_MS + 1, state()), { health: "dead", phase: "idle" });
});
```

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `node --import tsx --test tests/totalState.test.ts`
Expected: FAIL (không tìm thấy `src/total/totalState.js`).

- [ ] **Step 3: Cài đặt**

Tạo `src/total/totalState.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { addDays, todayVietnam } from "../lesson/time.js";
import { pidAlive, STALE_AFTER_MS } from "../watch/watchState.js";
import type { Health } from "../types/index.js";
import type { SlotRecord } from "./decide.js";

/**
 * Những gì `bot:total` để lại trên đĩa, để người (hoặc agent) biết nó còn sống không và hai đợt hôm nay ra sao:
 *  - `data/.total-state.json`        nhịp tim, trạng thái hiện tại
 *  - `data/.total-slots.json`        kết quả từng đợt (khoá `<ngày>|<morning|afternoon>`), nhờ đó khởi động lại không xuất trùng
 *  - `data/.total-report-files.json` tên file `-auto` mới nhất của từng (ngày, đợt, tiêu đề), để xoá đúng bản cũ của đợt đó
 */
export type TotalPhase = "idle" | "waiting" | "running" | "stopped";

export interface TotalState {
    pid: number;
    startedAt: number;
    lastBeat: number;
    state: TotalPhase;
}

export interface TotalFiles {
    state: string;
    slots: string;
    tracker: string;
}

export const DEFAULT_TOTAL_FILES: TotalFiles = {
    state: path.join(config.dataDir, ".total-state.json"),
    slots: path.join(config.dataDir, ".total-slots.json"),
    tracker: path.join(config.dataDir, ".total-report-files.json"),
};

const PHASES: TotalPhase[] = ["idle", "waiting", "running", "stopped"];

function writeAtomic(file: string, value: unknown): void {
    writeFileAtomic(file, JSON.stringify(value, null, 2));
}

/** File thiếu, hỏng hoặc sai dạng đều đọc ra null. */
export function readTotalState(file: string = DEFAULT_TOTAL_FILES.state): TotalState | null {
    try {
        const v = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<TotalState>;
        const ok = typeof v.pid === "number" && typeof v.startedAt === "number" && typeof v.lastBeat === "number" && PHASES.includes(v.state as TotalPhase);
        return ok ? (v as TotalState) : null;
    } catch {
        return null;
    }
}

/** Từ chối (không đổi gì) khi một `bot:total` khác chắc chắn còn sống; ngược lại ghi trạng thái `idle` mới. */
export function startTotal(
    now: number,
    pid: number,
    file: string = DEFAULT_TOTAL_FILES.state,
    isAlive: (pid: number) => boolean = pidAlive,
): { anotherInstanceAlive: boolean; crashed: boolean } {
    const prev = readTotalState(file);
    if (prev && prev.state !== "stopped" && prev.pid !== pid && now - prev.lastBeat < STALE_AFTER_MS && isAlive(prev.pid)) {
        return { anotherInstanceAlive: true, crashed: false };
    }
    writeAtomic(file, { pid, startedAt: now, lastBeat: now, state: "idle" } satisfies TotalState);
    return { anotherInstanceAlive: false, crashed: !!prev && prev.state !== "stopped" };
}

/** Chỉ ghi nhịp tim, giữ nguyên trạng thái. */
export function beatTotal(now: number, file: string = DEFAULT_TOTAL_FILES.state): void {
    const s = readTotalState(file);
    if (!s) return;
    s.lastBeat = now;
    writeAtomic(file, s);
}

export function setTotalPhase(now: number, phase: TotalPhase, file: string = DEFAULT_TOTAL_FILES.state): void {
    const s = readTotalState(file);
    if (!s) return;
    s.state = phase;
    s.lastBeat = now;
    writeAtomic(file, s);
}

export function stopTotal(now: number, file: string = DEFAULT_TOTAL_FILES.state): void {
    setTotalPhase(now, "stopped", file);
}

export function totalHealth(state: TotalState | null, now: number): Health {
    if (!state) return "none";
    if (state.state === "stopped") return "stopped";
    if (now - state.lastBeat > STALE_AFTER_MS) return "dead";
    return "alive";
}

export type SlotMap = Record<string, SlotRecord>;

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function isSlotRecord(v: unknown): v is SlotRecord {
    if (typeof v !== "object" || v === null) return false;
    const r = v as Record<string, unknown>;
    return (
        typeof r.firstRunAt === "number" &&
        typeof r.lastRunAt === "number" &&
        typeof r.complete === "boolean" &&
        typeof r.final === "boolean" &&
        typeof r.failures === "number" &&
        isStringArray(r.pending) &&
        isStringArray(r.files) &&
        isStringArray(r.warnings)
    );
}

/** File thiếu hoặc hỏng đọc ra rỗng; mục sai dạng bị bỏ (mất nhớ chỉ khiến một đợt được xuất lại, không hỏng gì). */
export function readSlots(file: string = DEFAULT_TOTAL_FILES.slots): SlotMap {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
        return Object.fromEntries(Object.entries(v).filter(([, record]) => isSlotRecord(record))) as SlotMap;
    } catch {
        return {};
    }
}

export function writeSlots(slots: SlotMap, file: string = DEFAULT_TOTAL_FILES.slots): void {
    writeAtomic(file, slots);
}

/** Giữ các đợt trong `keepDays` ngày gần nhất (theo ngày ở đầu khoá), bỏ phần cũ hơn. */
export function pruneSlots(slots: SlotMap, now: number, keepDays = 3): SlotMap {
    const oldest = addDays(todayVietnam(now), -keepDays);
    return Object.fromEntries(Object.entries(slots).filter(([key]) => key.split("|")[0] >= oldest));
}

/** Thêm hoặc thay kết quả của một đợt, dọn các đợt cũ trong cùng lần ghi. */
export function saveSlot(key: string, record: SlotRecord, now: number, file: string = DEFAULT_TOTAL_FILES.slots): void {
    const slots = pruneSlots(readSlots(file), now);
    slots[key] = record;
    writeSlots(slots, file);
}
```

Tạo `src/total/runnerSnapshot.ts`:

```typescript
import { readRunnerState, runnerHealth } from "../runner/runnerState.js";
import type { RunnerState } from "../types/index.js";
import type { RunnerSnapshot } from "./decide.js";

/**
 * Sức khoẻ và trạng thái của `bot:runner` tại thời điểm `now`, đọc từ `data/.runner-state.json` (không gọi vào mã của runner,
 * không đụng khoá cào). `state` chỉ truyền vào khi test.
 */
export function takeRunnerSnapshot(now: number, state: RunnerState | null = readRunnerState()): RunnerSnapshot {
    return { health: runnerHealth(state, now), phase: state?.state ?? null };
}
```

Chuẩn hoá CRLF: `sed -i 's/\r$//; s/$/\r/' src/total/totalState.ts src/total/runnerSnapshot.ts tests/totalState.test.ts`.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/totalState.test.ts` rồi `npm run typecheck`
Expected: PASS, typecheck sạch.

- [ ] **Step 5: Commit**

```bash
git add src/total/totalState.ts src/total/runnerSnapshot.ts tests/totalState.test.ts
git commit -m "feat(total): trạng thái bot, kết quả từng đợt và ảnh chụp runner"
```

---

### Task 6: Lõi `runTotalOnce`

**Files:**
- Create: `src/total/runTotal.ts`
- Test: `tests/totalRun.test.ts`

**Interfaces:**
- Consumes: `TotalSlot`, `autoFileName` (Task 2); `reportsInWindow`, `latestGradedPerRoom`, `cleaningEntriesInWindow`, `attendanceEntriesInWindow` (Task 3); `buildFillSpecs`, `FILE_LAYOUT`, `legendFormulaCells`, `excelDateSerialForDay`, kiểu `FileLayout`, `HeaderCell`, `FormulaCell` (`src/lesson/statusReportLayout.ts`); `buildCleaningRows`, `CLEANING_LAYOUT`, `CLEANING_DATE_CELLS` (`cleaningRows.ts`); `buildAttendanceRows`, `ATTENDANCE_LAYOUT`, `ATTENDANCE_DATE_REF` (`attendanceRows.ts`); `groupAttendanceByDay` (`attendanceDays.ts`); `FillTemplateArgs` (`excelFill.ts`); `readTracker`, `writeTracker`, `staleName` (`statusFileTracker.ts`, nhận tham số đường dẫn file); `hhmmVietnam` (`time.ts`).
- Produces:
  - `interface TotalDeps { loadMessages(): Promise<SourceMessage[]>; readOverrides(): Override[]; fill(args: FillTemplateArgs): string; templateTitle(templatePath: string, sheet: string): string; templatesSrc: string; outDirFor(day: string): string; trackerFile: string; removeFile(file: string): void }`
  - `interface TotalRunResult { slot: SlotName; day: string; files: string[]; counts: Record<string, number>; failed: string[]; warnings: string[] }`
  - `totalTrackerKey(day: string, slot: SlotName, title: string): string` (dạng `<ngày>|total-<đợt>|<tiêu đề>`)
  - `runTotalOnce(opts: { slot: TotalSlot; now: number }, deps: TotalDeps): Promise<TotalRunResult>`; thứ tự 7 đầu ra (tên `name` truyền vào `fill` là `total-<key>`): `loa`, `mayTinh`, `netsupport`, `internet`, `dien`, `cleaning`, `attendance`.

- [ ] **Step 1: Viết test lỗi trước**

Tạo `tests/totalRun.test.ts`:

```typescript
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runTotalOnce, totalTrackerKey, type TotalDeps } from "../src/total/runTotal.js";
import { autoFileName, slotsOfDay } from "../src/total/slots.js";
import { COMPLETE, DAY, at, msg } from "./fixtures.js";
import type { FillTemplateArgs } from "../src/lesson/excelFill.js";
import type { SourceMessage } from "../src/types/index.js";

const [morning, afternoon] = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const NAMES = ["total-loa", "total-mayTinh", "total-netsupport", "total-internet", "total-dien", "total-cleaning", "total-attendance"];

/** Tiêu đề giả theo (file mẫu, sheet): hai file vệ sinh và nội quy cùng sheet "HANG NGAY" nên phải có file mẫu trong tiêu đề. */
const fakeTitle = (templatePath: string, sheet: string): string => `T:${path.basename(templatePath, ".xlsx")}:${sheet}`;

function setup(messages: SourceMessage[], over: Partial<TotalDeps> = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "total-run-"));
    const calls: FillTemplateArgs[] = [];
    const removed: string[] = [];
    const deps: TotalDeps = {
        loadMessages: async () => messages,
        readOverrides: () => [],
        fill: (a) => (calls.push(a), ""),
        templateTitle: fakeTitle,
        templatesSrc: "C:\\mau",
        outDirFor: () => dir,
        trackerFile: path.join(dir, "tracker.json"),
        removeFile: (f) => void removed.push(f),
        ...over,
    };
    return { dir, calls, removed, deps };
}
const rowsOf = (calls: FillTemplateArgs[], name: string) => calls.find((c) => c.name === name)!.rows;

test("a slot writes the 7 files in order, each named with -auto and stamped with the run time", async () => {
    const { calls, deps } = setup([msg(COMPLETE, at(7, 0))]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 7) }, deps);
    assert.deepEqual(calls.map((c) => c.name), NAMES);
    assert.ok(calls.every((c) => c.outName.endsWith("_0907-auto.xlsx")), JSON.stringify(calls.map((c) => c.outName)));
    assert.deepEqual(result.files, calls.map((c) => c.outName));
    assert.deepEqual(result.failed, []);
    assert.equal(result.slot, "morning");
    assert.equal(result.day, DAY);
});

test("the header time of the status files is the run time", async () => {
    const { calls, deps } = setup([]);
    await runTotalOnce({ slot: morning, now: at(9, 7) }, deps);
    assert.deepEqual(calls.find((c) => c.name === "total-loa")!.headerCells.map((h) => h.value), ["Thứ: 5", "Ngày: 24/09/2026", "Thời gian: 09:07"]);
});

test("no messages still writes all 7 files, with 0 rows and a valid legend", async () => {
    const { calls, deps } = setup([]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 1) }, deps);
    assert.equal(calls.length, 7);
    assert.deepEqual(Object.values(result.counts), [0, 0, 0, 0, 0, 0, 0]);
    assert.ok(calls.find((c) => c.name === "total-loa")!.formulaCells!.length > 0);
});

test("the afternoon slot takes the later report of a room (lỗi lúc 7h, bình thường lúc 14h); the morning slot only sees the early one", async () => {
    const early = msg(COMPLETE.replace("Internet:T", "Internet: K"), at(7, 0));
    const later = msg(COMPLETE.replace("Internet:T", "Internet: T"), at(14, 0));
    const morningRun = setup([early, later]);
    await runTotalOnce({ slot: morning, now: at(9, 5) }, morningRun.deps);
    assert.deepEqual(rowsOf(morningRun.calls, "total-internet").map((r) => r.F), ["K"]);
    const afternoonRun = setup([early, later]);
    await runTotalOnce({ slot: afternoon, now: at(15, 5) }, afternoonRun.deps);
    assert.deepEqual(rowsOf(afternoonRun.calls, "total-internet").map((r) => r.F), ["T"]);
});

test("a later report with every grade blank does not erase the earlier graded one", async () => {
    const BLANK = ["BÁO CÁO CUỐI BUỔI DẠY", "- Tên Giáo Viên: Nguyễn Văn A", "- Phòng Máy: PM1", "- Tình trạng Netsupport:", "- Tình trạng Internet:", "- Tình trạng Loa, Âm ly:", "- Tình trạng máy lạnh, máy quạt:"].join("\n");
    const { calls, deps } = setup([msg(COMPLETE, at(7, 0)), msg(BLANK, at(14, 0))]);
    await runTotalOnce({ slot: afternoon, now: at(15, 5) }, deps);
    assert.deepEqual(rowsOf(calls, "total-internet").map((r) => r.F), ["T"]);
});

test("messages outside the window are ignored: 6:29 and 9:00 for the morning slot, and a report of another day", async () => {
    const { calls, deps } = setup([msg(COMPLETE, at(6, 29)), msg(COMPLETE, at(9, 0)), msg(COMPLETE, at(7, 0) - 24 * 3_600_000)]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5) }, deps);
    assert.equal(result.counts["loa"], 0);
    assert.equal(rowsOf(calls, "total-loa").length, 0);
});

test("cleaning and attendance rows come from the same window", async () => {
    const CLEANING = ["BÁO CÁO CUỐI BUỔI", "- Tên trường: THCS Tân Đông Hiệp - DA", "- Tổng số PM: 4 (PM1, PM2 Cty, PM3, PM4 trường)", "- Tên IT: Quyền", "", "- Phòng máy: Tin Học (PM2 kế cận tin)", "- Tổng số máy: 51 (tính cả máy GV)", "- Netsupport: Có", "- Internet: Có", "- Vệ sinh sạch sẽ: có"].join("\n");
    const ATTENDANCE = "BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: Lưu Đình Phong\n- Thời gian đến nơi: 8h25\n- Nơi làm việc: LC QUANG TRUNG NGUYỄN HUỆ Q5";
    const { calls, deps } = setup([msg(CLEANING, at(8, 30)), msg(CLEANING, at(6, 0)), msg(ATTENDANCE, at(8, 25)), msg(ATTENDANCE, at(7, 0))]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5) }, deps);
    assert.equal(result.counts["cleaning"], 1);
    assert.equal(result.counts["attendance"], 1); // cùng một người cùng buổi sáng: giữ tin gửi MUỘN NHẤT (8:25, trễ vì sau 8:00), nên tin 7:00 không thành dòng riêng
    assert.equal(rowsOf(calls, "total-cleaning")[0].G, "A");
    assert.equal(rowsOf(calls, "total-attendance")[0].F, "8:25");
});

test("the tracker replaces the old file of THIS slot only; the other slot's file and the 4-phase files are untouched", async () => {
    const { dir, deps, removed } = setup([]);
    const loaTitle = fakeTitle("01 - FORM TINH TRANG LOA.xlsx", "1209");
    fs.writeFileSync(deps.trackerFile, JSON.stringify({
        [totalTrackerKey(DAY, "morning", loaTitle)]: "OLD-MORNING-LOA.xlsx",
        [totalTrackerKey(DAY, "afternoon", loaTitle)]: "OTHER-SLOT-LOA.xlsx",
    }));
    const result = await runTotalOnce({ slot: morning, now: at(9, 7) }, deps);
    assert.deepEqual(removed, [path.join(dir, "OLD-MORNING-LOA.xlsx")]);
    const tracker = JSON.parse(fs.readFileSync(deps.trackerFile, "utf8")) as Record<string, string>;
    assert.equal(tracker[totalTrackerKey(DAY, "morning", loaTitle)], autoFileName(loaTitle, DAY, "0907"));
    assert.equal(tracker[totalTrackerKey(DAY, "afternoon", loaTitle)], "OTHER-SLOT-LOA.xlsx");
    assert.equal(Object.keys(tracker).length, 8); // 7 file của đợt sáng + khoá của đợt chiều
    assert.equal(result.files.length, 7);
});

test("one failing file does not stop the other six, and its previous file is KEPT", async () => {
    const calls: FillTemplateArgs[] = [];
    const mayTinhTitle = fakeTitle("02 - FORM TINH TRANG MAY TINH.xlsx", "2409");
    const { dir, deps, removed } = setup([], {
        fill: (a) => {
            if (a.name === "total-mayTinh") throw new Error("Excel đang mở file");
            calls.push(a);
            return "";
        },
    });
    fs.writeFileSync(deps.trackerFile, JSON.stringify({ [totalTrackerKey(DAY, "morning", mayTinhTitle)]: "OLD-MAYTINH.xlsx" }));
    const result = await runTotalOnce({ slot: morning, now: at(9, 7) }, deps);
    assert.deepEqual(result.failed, ["mayTinh"]);
    assert.equal(result.files.length, 6);
    assert.equal(calls.length, 6);
    assert.ok(result.warnings.some((w) => w.includes("mayTinh") && w.includes("Excel đang mở file")), JSON.stringify(result.warnings));
    const partial = path.join(dir, autoFileName(mayTinhTitle, DAY, "0907"));
    assert.ok(removed.includes(partial), "bản ghi dở của file lỗi phải bị bỏ");
    assert.ok(!removed.includes(path.join(dir, "OLD-MAYTINH.xlsx")), "bản cũ của file lỗi phải được giữ");
    const tracker = JSON.parse(fs.readFileSync(deps.trackerFile, "utf8")) as Record<string, string>;
    assert.equal(tracker[totalTrackerKey(DAY, "morning", mayTinhTitle)], "OLD-MAYTINH.xlsx");
});

test("a failure to delete an old file is only a warning", async () => {
    const { deps } = setup([], {
        removeFile: () => {
            throw new Error("EBUSY");
        },
    });
    const loaTitle = fakeTitle("01 - FORM TINH TRANG LOA.xlsx", "1209");
    fs.writeFileSync(deps.trackerFile, JSON.stringify({ [totalTrackerKey(DAY, "morning", loaTitle)]: "OLD.xlsx" }));
    const result = await runTotalOnce({ slot: morning, now: at(9, 7) }, deps);
    assert.deepEqual(result.failed, []);
    assert.ok(result.warnings.some((w) => w.includes("OLD.xlsx") && w.includes("EBUSY")), JSON.stringify(result.warnings));
});

test("totalTrackerKey is <day>|total-<slot>|<title>", () => {
    assert.equal(totalTrackerKey("2026-10-03", "afternoon", "TÌNH TRẠNG LOA"), "2026-10-03|total-afternoon|TÌNH TRẠNG LOA");
});
```

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `node --import tsx --test tests/totalRun.test.ts`
Expected: FAIL (không tìm thấy `src/total/runTotal.js`).

- [ ] **Step 3: Cài đặt**

Tạo `src/total/runTotal.ts`:

```typescript
import path from "node:path";
import { groupAttendanceByDay } from "../lesson/attendanceDays.js";
import { ATTENDANCE_DATE_REF, ATTENDANCE_LAYOUT, buildAttendanceRows } from "../lesson/attendanceRows.js";
import { buildCleaningRows, CLEANING_DATE_CELLS, CLEANING_LAYOUT } from "../lesson/cleaningRows.js";
import type { FillTemplateArgs } from "../lesson/excelFill.js";
import { readTracker, staleName, writeTracker } from "../lesson/statusFileTracker.js";
import { buildFillSpecs, excelDateSerialForDay, FILE_LAYOUT, legendFormulaCells, type FileLayout, type FormulaCell, type HeaderCell } from "../lesson/statusReportLayout.js";
import { hhmmVietnam } from "../lesson/time.js";
import { autoFileName, type SlotName, type TotalSlot } from "./slots.js";
import { attendanceEntriesInWindow, cleaningEntriesInWindow, latestGradedPerRoom, reportsInWindow } from "./windowReports.js";
import type { Cell, Override, SourceMessage } from "../types/index.js";

/** Mọi thứ lõi cần từ bên ngoài, truyền vào để test được mà không cần Excel hay đĩa thật (bản thật: `realDeps.ts`). */
export interface TotalDeps {
    loadMessages(): Promise<SourceMessage[]>;
    readOverrides(): Override[];
    fill(args: FillTemplateArgs): string;
    templateTitle(templatePath: string, sheet: string): string;
    templatesSrc: string;
    outDirFor(day: string): string;
    trackerFile: string;
    removeFile(file: string): void;
}

export interface TotalRunResult {
    slot: SlotName;
    day: string;
    /** Tên các file đã ghi (theo thứ tự đầu ra). */
    files: string[];
    /** Số dòng dữ liệu của từng đầu ra, theo khoá `loa`, `mayTinh`, `netsupport`, `internet`, `dien`, `cleaning`, `attendance`. */
    counts: Record<string, number>;
    /** Khoá các đầu ra điền lỗi. */
    failed: string[];
    warnings: string[];
}

/** Khoá tracker của file `-auto`: tách khỏi khoá của 4 giai đoạn (`<ngày>|<giai đoạn>|<tiêu đề>`) nên không đè nhau. */
export const totalTrackerKey = (day: string, slot: SlotName, title: string): string => `${day}|total-${slot}|${title}`;

interface Output {
    name: string;
    layout: FileLayout;
    rows: Array<Record<string, Cell>>;
    headerCells: HeaderCell[];
    formulaCells: FormulaCell[];
}

/**
 * Lõi của báo cáo tổng: dựng 7 file `-auto` của đợt `slot` từ kho tin hiện có (KHÔNG cào, KHÔNG đụng khoá cào, KHÔNG dùng
 * `output/output.json`). Mỗi file điền trong một tiến trình Excel riêng (`deps.fill`); file lỗi chỉ ghi cảnh báo, bản cũ của
 * nó được giữ và 6 file còn lại vẫn xuất. Sau khi file mới ghi xong mới xoá bản cũ CỦA ĐÚNG ĐỢT NÀY (qua tracker riêng).
 */
export async function runTotalOnce(opts: { slot: TotalSlot; now: number }, deps: TotalDeps): Promise<TotalRunResult> {
    const { slot, now } = opts;
    const day = slot.day;
    const messages = await deps.loadMessages();

    const reports = latestGradedPerRoom(reportsInWindow(messages, deps.readOverrides(), slot));
    const specs = buildFillSpecs(reports, day, now);
    const dateSerial = excelDateSerialForDay(day);
    const cleaningRows = buildCleaningRows(cleaningEntriesInWindow(messages, slot), day);
    const attendanceRows = buildAttendanceRows(groupAttendanceByDay(attendanceEntriesInWindow(messages, slot)), day);

    const outputs: Output[] = [
        ...(Object.keys(FILE_LAYOUT) as Array<keyof typeof FILE_LAYOUT>).map((key) => ({
            name: key,
            layout: FILE_LAYOUT[key],
            rows: specs[key].rows,
            headerCells: specs[key].headerCells,
            formulaCells: specs[key].formulaCells,
        })),
        {
            name: "cleaning",
            layout: CLEANING_LAYOUT,
            rows: cleaningRows,
            headerCells: CLEANING_DATE_CELLS.map((c) => ({ ...c, value: dateSerial, numberFormat: "dd/mm/yyyy" })),
            formulaCells: legendFormulaCells(CLEANING_LAYOUT, cleaningRows.length),
        },
        {
            name: "attendance",
            layout: ATTENDANCE_LAYOUT,
            rows: attendanceRows,
            headerCells: [{ ref: ATTENDANCE_DATE_REF, value: dateSerial, numberFormat: "dd/mm/yyyy" }],
            formulaCells: [],
        },
    ];

    const outDir = deps.outDirFor(day);
    const hhmm = hhmmVietnam(now);
    const tracker = readTracker(deps.trackerFile);
    const result: TotalRunResult = { slot: slot.name, day, files: [], counts: {}, failed: [], warnings: [] };

    for (const o of outputs) {
        result.counts[o.name] = o.rows.length;
        const title = deps.templateTitle(path.join(deps.templatesSrc, o.layout.templateFile), o.layout.sheet);
        const outName = autoFileName(title, day, hhmm);
        const key = totalTrackerKey(day, slot.name, title);
        try {
            deps.fill({ name: `total-${o.name}`, templatesSrc: deps.templatesSrc, layout: o.layout, outDir, outName, rows: o.rows, headerCells: o.headerCells, formulaCells: o.formulaCells });
        } catch (err) {
            result.failed.push(o.name);
            result.warnings.push(`${o.name}: ${(err as Error).message}`);
            try {
                deps.removeFile(path.join(outDir, outName)); // bản mới ghi dở: bỏ đi, giữ nguyên bản cũ
            } catch {
                // bản ghi dở đang bị khoá thì để đó, lần sau ghi đè
            }
            continue;
        }
        const old = staleName(tracker, key, outName);
        if (old) {
            try {
                deps.removeFile(path.join(outDir, old));
            } catch (err) {
                result.warnings.push(`không xoá được bản cũ "${old}" (đang mở trong Excel?): ${(err as Error).message}`);
            }
        }
        tracker[key] = outName;
        result.files.push(outName);
    }

    writeTracker(tracker, deps.trackerFile);
    return result;
}
```

Chuẩn hoá CRLF: `sed -i 's/\r$//; s/$/\r/' src/total/runTotal.ts tests/totalRun.test.ts`.

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/totalRun.test.ts` rồi `npm run typecheck`
Expected: PASS, typecheck sạch. Nếu typecheck báo `readonly` không gán được cho `FileLayout` ở `layout: FILE_LAYOUT[key]`, ép kiểu tường minh: `layout: FILE_LAYOUT[key] as FileLayout`.

- [ ] **Step 5: Commit**

```bash
git add src/total/runTotal.ts tests/totalRun.test.ts
git commit -m "feat(total): lõi runTotalOnce dựng 7 file -auto của một đợt"
```

---

### Task 7: Hiển thị trạng thái, ba lệnh, tài liệu và chạy thật

**Files:**
- Create: `src/total/totalStatusReport.ts`
- Create: `src/total/realDeps.ts`
- Create: `src/cli/total-once.ts`, `src/cli/bot-total.ts`, `src/cli/total-status.ts`
- Modify: `package.json` (3 script), `CLAUDE.md`
- Test: `tests/totalStatusReport.test.ts`

**Interfaces:**
- Consumes: `TotalState`, `SlotMap`, `totalHealth`, `readTotalState`, `readSlots`, `saveSlot`, `startTotal`, `beatTotal`, `setTotalPhase`, `stopTotal`, `DEFAULT_TOTAL_FILES` (Task 5); `takeRunnerSnapshot` (Task 5); `decideTotal`, `recordAfterRun`, `recordAfterCrash`, `giveUp`, `POLL_MS` (Task 4); `runTotalOnce`, `TotalDeps` (Task 6); `slotsOfDay`, `slotKey`, `isSlotName` (Task 2); `readQueue` (`src/scrape/scrapeQueue.ts`); `HEARTBEAT_INTERVAL_MS` (`src/watch/watchState.ts`); `hhmm` (`src/watch/watchStatusReport.ts`); `runFillTemplate` (`excelFill.ts`); `readOverrides`; `readTemplateTitle`; `MessageStore`.
- Produces:
  - `formatTotalStatus(input: { state: TotalState | null; slots: SlotMap; day: string; schedule: TotalSlot[]; now: number }): string[]`
  - `realTotalDeps(): TotalDeps`
  - lệnh `npm run total:once -- --slot morning|afternoon [--day YYYY-MM-DD] [--now <unix ms>]`, `npm run bot:total`, `npm run total:status` (thoát mã 2 khi bot không chạy).

- [ ] **Step 1: Viết test lỗi trước cho phần hiển thị**

Tạo `tests/totalStatusReport.test.ts`:

```typescript
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTotalStatus } from "../src/total/totalStatusReport.js";
import { slotKey, slotsOfDay } from "../src/total/slots.js";
import type { SlotRecord } from "../src/total/decide.js";
import type { TotalState } from "../src/total/totalState.js";

const DAY = "2026-10-03";
const schedule = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const vn = (h: number, m = 0): number => Date.UTC(2026, 9, 3, h - 7, m);
const record = (over: Partial<SlotRecord> = {}): SlotRecord => ({ firstRunAt: vn(9, 7), lastRunAt: vn(9, 7), complete: true, final: true, pending: [], files: new Array(7).fill("f.xlsx"), warnings: [], failures: 0, ...over });
const state = (over: Partial<TotalState> = {}): TotalState => ({ pid: 123, startedAt: vn(8, 32), lastBeat: vn(9, 10) - 5000, state: "idle", ...over });
const text = (lines: string[]): string => lines.join("\n");

test("never ran: says so and still lists today's two slots as not due yet", () => {
    const out = text(formatTotalStatus({ state: null, slots: {}, day: DAY, schedule, now: vn(8, 0) }));
    assert.match(out, /chưa từng chạy/);
    assert.match(out, /sáng 09:00: chưa tới giờ/);
    assert.match(out, /chiều 15:00: chưa tới giờ/);
});

test("alive bot with a complete morning slot", () => {
    const out = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record() }, day: DAY, schedule, now: vn(9, 10) }));
    assert.match(out, /ĐANG CHẠY \(pid 123\)/);
    assert.match(out, /sáng 09:00: đã xuất lúc 09:07 \(7 file\) — đủ dữ liệu/);
    assert.match(out, /chiều 15:00: chưa tới giờ/);
});

test("an incomplete slot shows the groups still queued and whether it will be exported again", () => {
    const again = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ complete: false, final: false, pending: ["A", "B"] }) }, day: DAY, schedule, now: vn(9, 20) }));
    assert.match(again, /chưa đủ, sẽ xuất lại/);
    assert.match(again, /còn 2 nhóm chưa cào: A, B/);
    const stopped = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ complete: false, final: true, pending: ["A"], warnings: ["hết hạn xuất lại"] }) }, day: DAY, schedule, now: vn(10, 30) }));
    assert.match(stopped, /CHƯA ĐỦ, không xuất lại nữa/);
    assert.match(stopped, /cảnh báo: hết hạn xuất lại/);
});

test("a due slot with no record, failures, a dead heartbeat and a clean stop", () => {
    const due = text(formatTotalStatus({ state: state(), slots: {}, day: DAY, schedule, now: vn(9, 3) }));
    assert.match(due, /sáng 09:00: đến giờ, chưa xuất/);
    const failing = text(formatTotalStatus({ state: state(), slots: { [slotKey(schedule[0])]: record({ complete: false, final: false, failures: 2 }) }, day: DAY, schedule, now: vn(9, 30) }));
    assert.match(failing, /lỗi 2 lần liên tiếp/);
    assert.match(text(formatTotalStatus({ state: state({ lastBeat: vn(8, 0) }), slots: {}, day: DAY, schedule, now: vn(9, 30) })), /CÓ VẺ ĐÃ CHẾT/);
    assert.match(text(formatTotalStatus({ state: state({ state: "stopped" }), slots: {}, day: DAY, schedule, now: vn(9, 30) })), /ĐÃ DỪNG/);
});
```

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `node --import tsx --test tests/totalStatusReport.test.ts`
Expected: FAIL (không tìm thấy `src/total/totalStatusReport.js`).

- [ ] **Step 3: Cài đặt phần hiển thị**

Tạo `src/total/totalStatusReport.ts`:

```typescript
import { hhmm } from "../watch/watchStatusReport.js";
import type { SlotRecord } from "./decide.js";
import { slotKey, type SlotName, type TotalSlot } from "./slots.js";
import { totalHealth, type SlotMap, type TotalState } from "./totalState.js";

const SLOT_LABEL: Record<SlotName, string> = { morning: "sáng", afternoon: "chiều" };

function ago(ms: number): string {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s} giây`;
    const m = Math.floor(s / 60);
    return m < 60 ? `${m} phút` : `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

function slotLines(slot: TotalSlot, record: SlotRecord | undefined, now: number): string[] {
    const head = `  ${SLOT_LABEL[slot.name]} ${hhmm(slot.atMs)}:`;
    if (!record) return [now < slot.atMs ? `${head} chưa tới giờ` : `${head} đến giờ, chưa xuất (đang đợi runner hoặc bot:total chưa chạy)`];
    const verdict = record.complete ? "đủ dữ liệu" : record.final ? "CHƯA ĐỦ, không xuất lại nữa" : "chưa đủ, sẽ xuất lại";
    const lines = [`${head} đã xuất lúc ${hhmm(record.lastRunAt)} (${record.files.length} file) — ${verdict}`];
    if (record.pending.length > 0) lines.push(`    còn ${record.pending.length} nhóm chưa cào: ${record.pending.join(", ")}`);
    if (record.failures > 0) lines.push(`    lỗi ${record.failures} lần liên tiếp`);
    for (const w of record.warnings) lines.push(`    cảnh báo: ${w}`);
    return lines;
}

export interface TotalStatusInput {
    state: TotalState | null;
    slots: SlotMap;
    day: string;
    schedule: TotalSlot[];
    now: number;
}

/** Các dòng chữ cho `total:status` (giờ Việt Nam). */
export function formatTotalStatus(input: TotalStatusInput): string[] {
    const { state, slots, day, schedule, now } = input;
    const lines: string[] = [];
    const health = totalHealth(state, now);
    if (!state) {
        lines.push("[total] chưa có dữ liệu — bot:total chưa từng chạy.");
    } else if (health === "stopped") {
        lines.push(`[total] ĐÃ DỪNG lúc ${hhmm(state.lastBeat)}`);
    } else if (health === "dead") {
        lines.push(`[total] CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc ${hhmm(state.lastBeat)} (${ago(now - state.lastBeat)} trước)`);
    } else {
        lines.push(`[total] ĐANG CHẠY (pid ${state.pid}) từ ${hhmm(state.startedAt)}`);
        lines.push(`  trạng thái: ${state.state}`);
        lines.push(`  nhịp tim cuối: ${ago(now - state.lastBeat)} trước`);
    }
    lines.push(`[total] hôm nay ${day}:`);
    for (const slot of schedule) lines.push(...slotLines(slot, slots[slotKey(slot)], now));
    return lines;
}
```

Chuẩn hoá CRLF: `sed -i 's/\r$//; s/$/\r/' src/total/totalStatusReport.ts tests/totalStatusReport.test.ts`.

Run: `node --import tsx --test tests/totalStatusReport.test.ts` rồi `npm run typecheck`
Expected: PASS, typecheck sạch.

- [ ] **Step 4: Cài đặt phụ thuộc thật và ba lệnh**

Tạo `src/total/realDeps.ts`:

```typescript
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { outputDir } from "../core/paths.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { readOverrides } from "../lesson/overrides.js";
import { readTemplateTitle } from "../lesson/statusReportLayout.js";
import { MessageStore } from "../store/messageStore.js";
import type { SourceMessage } from "../types/index.js";
import type { TotalDeps } from "./runTotal.js";
import { DEFAULT_TOTAL_FILES } from "./totalState.js";

/** Phụ thuộc thật của `runTotalOnce`: kho tin cục bộ, Excel COM, mẫu ở `data/mau bao cao new`, thư mục xuất của 4 giai đoạn. */
export function realTotalDeps(): TotalDeps {
    return {
        loadMessages: async () => {
            const store = new MessageStore();
            const all: SourceMessage[] = [];
            for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
            return all;
        },
        readOverrides: () => readOverrides(path.join(outputDir, "overrides.json")),
        fill: runFillTemplate,
        templateTitle: readTemplateTitle,
        templatesSrc: path.join(config.dataDir, "mau bao cao new"),
        outDirFor: (day) => {
            const yyMM = day.slice(2, 4) + day.slice(5, 7);
            const dir = path.join(config.dataDir, "export", "trang-thai", yyMM, yyMM + day.slice(8, 10));
            fs.mkdirSync(dir, { recursive: true });
            return dir;
        },
        trackerFile: DEFAULT_TOTAL_FILES.tracker,
        removeFile: (file) => fs.rmSync(file, { force: true }),
    };
}
```

Tạo `src/cli/total-once.ts`:

```typescript
import { todayVietnam } from "../lesson/time.js";
import { readQueue } from "../scrape/scrapeQueue.js";
import { recordAfterCrash, recordAfterRun } from "../total/decide.js";
import { realTotalDeps } from "../total/realDeps.js";
import { runTotalOnce } from "../total/runTotal.js";
import { isSlotName, slotKey, slotsOfDay } from "../total/slots.js";
import { readSlots, saveSlot } from "../total/totalState.js";

/**
 * Xuất 7 file báo cáo tổng `-auto` của MỘT đợt ngay bây giờ (không đợi runner), rồi ghi kết quả đợt vào
 * `data/.total-slots.json` để `bot:total` (nếu đang chạy) không xuất trùng. Lần chạy tay luôn là `final`.
 *
 *   npm run total:once -- --slot morning|afternoon [--day YYYY-MM-DD] [--now <unix ms>]
 *
 * Khung dữ liệu: morning = 6:30 đến 9:00, afternoon = 6:30 đến 15:00 của ngày `--day` (mặc định hôm nay).
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const slotName = option("--slot");
    if (!isSlotName(slotName)) throw new Error("Cần --slot morning hoặc --slot afternoon.");
    const now = Number(option("--now") ?? Date.now());
    if (!Number.isFinite(now)) throw new Error("--now phải là số mili giây (unix ms).");
    const day = option("--day") ?? todayVietnam(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day phải có dạng YYYY-MM-DD, nhận được "${day}".`);

    const slot = slotsOfDay(day).find((s) => s.name === slotName)!;
    const key = slotKey(slot);
    const prev = readSlots()[key];
    try {
        const result = await runTotalOnce({ slot, now }, realTotalDeps());
        const queue = readQueue();
        saveSlot(key, recordAfterRun(prev, { complete: queue.length === 0, final: true, pending: queue }, result, Date.now()), Date.now());
        for (const w of result.warnings) console.warn(`[total] cảnh báo: ${w}`);
        console.log(`[total] ${day} đợt ${slotName}: ${result.files.length}/7 file -> ${Object.entries(result.counts).map(([k, n]) => `${k}: ${n}`).join(", ")}`);
        if (queue.length > 0) console.log(`[total] lưu ý: hàng chờ cào còn ${queue.length} nhóm (${queue.join(", ")}), báo cáo có thể chưa đủ.`);
        if (result.failed.length > 0) process.exitCode = 1;
    } catch (err) {
        saveSlot(key, recordAfterCrash(prev, Date.now(), (err as Error).message), Date.now());
        throw err;
    }
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
```

Tạo `src/cli/bot-total.ts`:

```typescript
import { todayVietnam } from "../lesson/time.js";
import { readQueue } from "../scrape/scrapeQueue.js";
import { decideTotal, giveUp, POLL_MS, recordAfterCrash, recordAfterRun } from "../total/decide.js";
import { realTotalDeps } from "../total/realDeps.js";
import { takeRunnerSnapshot } from "../total/runnerSnapshot.js";
import { runTotalOnce } from "../total/runTotal.js";
import { slotKey, slotsOfDay } from "../total/slots.js";
import { beatTotal, readSlots, saveSlot, setTotalPhase, startTotal, stopTotal, type TotalPhase } from "../total/totalState.js";
import { HEARTBEAT_INTERVAL_MS } from "../watch/watchState.js";

/**
 * Bot hẹn giờ của báo cáo tổng: tới 9:00 và 15:00 (config.total) thì xuất 7 file `-auto` của đợt đó (src/total/runTotal.ts).
 * Nó KHÔNG cào, KHÔNG lấy khoá cào, KHÔNG dùng file của runner: chỉ đọc trạng thái runner và hàng chờ để quyết định có nên
 * đợi (src/total/decide.ts). Đợt hôm nay chưa có kết quả mà đã qua giờ thì chạy bù ngay khi bot bật. Kết quả từng đợt lưu ở
 * data/.total-slots.json nên khởi động lại không xuất trùng. Xem bằng `npm run total:status`.
 *
 *   npm run bot:total
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function main(): Promise<void> {
    const started = startTotal(Date.now(), process.pid);
    if (started.anotherInstanceAlive) {
        console.error("[total] another `bot:total` is already running — exiting.");
        process.exit(1);
    }
    if (started.crashed) log("[total] bản bot:total trước không dừng sạch; kết quả từng đợt đã lưu nên không xuất trùng.");

    const shutdown = (code: number) => {
        stopTotal(Date.now());
        process.exit(code);
    };
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
    process.on("uncaughtException", (err) => {
        console.error("[total] fatal:", err);
        shutdown(1);
    });
    process.on("unhandledRejection", (err) => {
        console.error("[total] fatal:", err);
        shutdown(1);
    });

    setInterval(() => beatTotal(Date.now()), HEARTBEAT_INTERVAL_MS);

    const deps = realTotalDeps();
    let phase: TotalPhase = "idle";
    const setPhase = (next: TotalPhase) => {
        if (next === phase) return;
        phase = next;
        setTotalPhase(Date.now(), next);
    };
    log("[total] running. Waiting for the next slot.");

    for (;;) {
        await sleep(POLL_MS);
        const now = Date.now();
        const slots = readSlots();
        let busy = false;
        for (const slot of slotsOfDay(todayVietnam(now))) {
            const key = slotKey(slot);
            const prev = slots[key];
            const decision = decideTotal({ now, slot, record: prev, runner: takeRunnerSnapshot(now), queue: readQueue() });
            if (decision.action === "idle") continue;
            if (decision.action === "wait") {
                setPhase("waiting");
                busy = true;
                break;
            }
            if (decision.action === "give-up") {
                saveSlot(key, giveUp(prev!, "đã hết thời hạn xuất lại hoặc lỗi quá nhiều lần: không xuất lại nữa"), now);
                log(`[total] đợt ${slot.name}: bỏ cuộc, không xuất lại nữa.`);
                continue;
            }
            setPhase("running");
            busy = true;
            log(`[total] xuất đợt ${slot.name} (${decision.kind}, ${decision.reason}).`);
            try {
                const result = await runTotalOnce({ slot, now }, deps);
                saveSlot(key, recordAfterRun(prev, decision, result, Date.now()), Date.now());
                for (const w of result.warnings) log(`[total] cảnh báo: ${w}`);
                log(`[total] đợt ${slot.name} xong: ${result.files.length}/7 file${decision.complete ? "" : `, CHƯA ĐỦ (còn ${decision.pending.length} nhóm chưa cào)`}${result.failed.length > 0 ? `, lỗi: ${result.failed.join(", ")}` : ""}.`);
            } catch (err) {
                saveSlot(key, recordAfterCrash(prev, Date.now(), (err as Error).message), Date.now());
                log(`[total] đợt ${slot.name} lỗi: ${(err as Error).message}`);
            }
            setPhase("idle");
            break;
        }
        if (!busy) setPhase("idle");
    }
}

main().catch((err) => {
    console.error(err);
    stopTotal(Date.now());
    process.exit(1);
});
```

Tạo `src/cli/total-status.ts`:

```typescript
import { todayVietnam } from "../lesson/time.js";
import { slotsOfDay } from "../total/slots.js";
import { formatTotalStatus } from "../total/totalStatusReport.js";
import { readSlots, readTotalState, totalHealth } from "../total/totalState.js";

/**
 * `bot:total` còn sống không, và hai đợt hôm nay đã xuất chưa, đủ dữ liệu chưa. Chỉ đọc. Thoát mã 0 khi bot đang chạy, mã 2
 * khi không (đã chết, đã dừng hoặc chưa từng chạy).
 *
 *   npm run total:status
 */
const now = Date.now();
const day = todayVietnam(now);
const state = readTotalState();
for (const line of formatTotalStatus({ state, slots: readSlots(), day, schedule: slotsOfDay(day), now })) console.log(line);
if (totalHealth(state, now) !== "alive") process.exitCode = 2;
```

Chuẩn hoá CRLF: `sed -i 's/\r$//; s/$/\r/' src/total/realDeps.ts src/cli/total-once.ts src/cli/bot-total.ts src/cli/total-status.ts`.

Trong `package.json`, thay dòng `"chat:status": "tsx src/cli/chat-status.ts",` bằng (giữ nguyên dấu phẩy cuối đúng vị trí trong file):

```json
        "chat:status": "tsx src/cli/chat-status.ts",
        "bot:total": "tsx src/cli/bot-total.ts",
        "total:once": "tsx src/cli/total-once.ts",
        "total:status": "tsx src/cli/total-status.ts",
```

Trong `CLAUDE.md`: thêm vào danh sách lệnh ngay sau dòng `npm run chat:status ...` ba dòng:

```
npm run bot:total                              # long-running scheduler for the TOTAL reports: at 9:00 (messages 6:30-9:00) and 15:00 (messages 6:30-15:00) it writes the 7 status files with "-auto" appended to the name (waits up to 10 minutes for bot:runner to drain the queue, re-exports while the first export was incomplete); never scrapes, never takes data/.scrape.lock
npm run total:once -- --slot morning|afternoon [--day D] [--now <unix ms>]   # write one slot's 7 "-auto" files right now (no waiting) and record the slot so bot:total does not repeat it
npm run total:status                           # is bot:total alive, and what happened to today's two slots (exit 2 when not alive)
```

và thêm một đoạn sau đoạn "**`bot:chat` is the fourth process**":

```
**`bot:total` is the fifth process** (`src/total/`, `src/cli/bot-total.ts`): at 9:00 and 15:00 (`config.total`) it exports the 7 status files of the day to `data/export/trang-thai/<yyMM>/<yyMMdd>/<title>_<yyMMdd>_T<thu>_<HHmm>-auto.xlsx`, from the local message store, over the messages sent from `windowStartHour` (6:30) up to the slot hour, one report per room (the latest one that has a grade; a later all-blank report such as "Học tại lớp" does not erase an earlier graded one). It runs in parallel with `bot:runner` without touching it: it reads `data/.runner-state.json` and the scrape queue only to decide whether to wait (at most `waitMaxMinutes`; a dead runner is not waited for), keeps its own `data/.total-state.json`, `data/.total-slots.json` and `data/.total-report-files.json`, and never takes `data/.scrape.lock`, uses `output/output.json` or marks messages. A slot that was exported while the queue was not empty is exported again every `refreshEveryMinutes` (or as soon as the queue is empty) until `refreshUntilMinutes`, replacing only that slot's "-auto" files. Printing is not part of it yet. Design: `docs/superpowers/specs/2026-10-02-bao-cao-tong-auto-design.md`.
```

Chuẩn hoá CRLF cho `package.json` và `CLAUDE.md` nếu công cụ ghi LF (kiểm tra bằng `file`).

- [ ] **Step 5: Kiểm kiểu và toàn bộ test**

Run: `npm run typecheck` rồi `npm test`
Expected: typecheck sạch; toàn bộ test xanh (483 test cũ cộng các test mới của B), không test nào của 4 giai đoạn bị đổi.

- [ ] **Step 6: Chạy thật bằng Excel**

Run (ngày có tin điểm danh trễ và báo cáo nhiều phòng): `npm run total:once -- --slot afternoon --day 2026-10-02`
Expected: in `[total] 2026-10-02 đợt afternoon: 7/7 file -> loa: N, mayTinh: N, ..., attendance: 1` (khoảng 1 phút); không có dòng cảnh báo lỗi.

Kiểm tra file bằng script chỉ đọc (tạo rồi xoá `_check.ts` ở thư mục gốc dự án):

```typescript
import fs from "node:fs";
import XLSX from "xlsx";
const dir = "data/export/trang-thai/2610/261002";
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith("-auto.xlsx") && !x.startsWith("~$")).sort()) {
    const wb = XLSX.readFile(`${dir}/${f}`);
    const errs: string[] = [];
    for (const name of wb.SheetNames) for (const a of Object.keys(wb.Sheets[name])) { if (a[0] === "!") continue; const c = wb.Sheets[name][a] as { t?: string; v?: unknown }; if (c.t === "e") errs.push(`${name}!${a}=${c.v}`); }
    const ws = wb.Sheets[wb.SheetNames.includes("HANG NGAY") ? "HANG NGAY" : wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
    console.log(f, "| sheets:", wb.SheetNames.join(","), "| lỗi công thức:", errs.length ? errs.join(",") : "không có");
    for (const r of rows.slice(3, 9)) { const c = (r as unknown[]).slice(0, 12).map((x) => String(x).trim()); while (c.length && !c[c.length - 1]) c.pop(); if (c.length) console.log("   ", JSON.stringify(c)); }
}
```

Run: `npx tsx ./_check.ts` rồi `rm ./_check.ts`
Expected: đúng 7 file `-auto` (tên như `TÌNH TRẠNG LOA_261002_T6_<HHmm>-auto.xlsx`), không lỗi công thức; LOA, MÁY TÍNH, NETSUPPORT, INTERNET có các phòng báo cáo trong 6:30 đến 15:00 ngày 02/10 (mỗi phòng một dòng); NỘI QUY có 1 dòng (người đi trễ 8:04); VỆ SINH có 2 sheet; ĐIỆN rỗng.

Chạy lại cùng đợt vài phút sau để kiểm tra bản cũ bị thay (không đợi: dùng `--now` lớn hơn): `npm run total:once -- --slot afternoon --day 2026-10-02 --now <unix ms cách lần trước vài phút>`
Expected: sau lần chạy thứ hai, mỗi tiêu đề chỉ còn ĐÚNG một file `-auto` của đợt đó (file `_<HHmm>-auto` cũ biến mất), các file của 4 giai đoạn và của đợt `morning` không bị đụng.

Run: `npm run total:status`
Expected: dòng `bot:total chưa từng chạy` (hoặc `ĐÃ DỪNG`), và `chiều 15:00` của ngày hôm nay (nếu chưa tới 15:00 thì `chưa tới giờ`); thoát mã 2.

- [ ] **Step 7: Chạy thử bot một lúc ngắn**

Run `npm run bot:total` ở nền (hoặc cửa sổ khác) khoảng 15 giây, rồi `npm run total:status`.
Expected: `[total] ĐANG CHẠY (pid N)`; nếu hôm nay đã qua 9:00 và đợt sáng chưa có kết quả, log của bot cho thấy nó chạy bù đợt sáng (xuất 7 file `-auto` của hôm nay) hoặc đang đợi runner theo bảng trong spec. Dừng bot bằng Ctrl+C (log `stopped`), `npm run total:status` báo `ĐÃ DỪNG`. Nếu bot bị kill thay vì Ctrl+C thì status báo `CÓ VẺ ĐÃ CHẾT` sau khi nhịp tim quá cũ, là bình thường.

- [ ] **Step 8: Commit**

```bash
git add src/total/totalStatusReport.ts src/total/realDeps.ts src/cli/total-once.ts src/cli/bot-total.ts src/cli/total-status.ts tests/totalStatusReport.test.ts package.json CLAUDE.md docs/superpowers/specs/2026-10-02-bao-cao-tong-auto-design.md docs/superpowers/plans/2026-10-03-bao-cao-tong-auto.md
git commit -m "feat(total): bot:total, total:once và total:status xuất 7 file báo cáo tổng -auto lúc 9h và 15h"
```

---

## Self-Review

**1. Spec coverage**

| Mục trong spec | Task |
|---|---|
| Hai đợt 9:00 (6:30 đến 9:00) và 15:00 (6:30 đến 15:00), nửa mở, giờ gửi thật | Task 2 (`slotsOfDay`, `inSlotWindow`), Task 3 (`reportsInWindow`) |
| 7 file, tên `-auto`, giờ xuất thực tế, cùng thư mục | Task 2 (`autoFileName`), Task 6 (`runTotalOnce`, `outDirFor`), Task 7 (`realDeps`) |
| Mỗi phòng một báo cáo mới nhất có xếp loại, trống không đè | Task 3 (`latestGradedPerRoom`), Task 6 |
| Vệ sinh và điểm danh trong cùng khung; áp overrides | Task 3, Task 6, Task 7 (`readOverrides`) |
| Cô lập khỏi runner (khoá cào, `output.json`, DB), file riêng, tiền tố `total-` | Task 5 (file riêng), Task 6 (`total-` và tracker riêng), Task 7 (không import khoá) |
| Bảng runner rảnh / bận / chết / treo | Task 4 (`decideTotal`) |
| Xuất lại, chạy bù, bỏ cuộc, lỗi thử lại tối đa 3 lần | Task 4, Task 5 (`SlotRecord` lưu bền), Task 7 (`bot-total.ts`) |
| `total:once`, `total:status`, nhịp tim | Task 5, Task 7 |
| Cấu hình `total` | Task 1 |
| Một file lỗi không chặn 6 file còn lại, giữ bản cũ | Task 6 |
| In (phần C) — chỉ ghi nhận | không có task (ngoài phạm vi, spec đã ghi) |

**2. Placeholder scan:** không có "TBD", "TODO", "tương tự Task N"; mọi bước có mã đầy đủ.

**3. Type consistency:** `TotalSlot`, `SlotName`, `slotKey`, `autoFileName` (Task 2) khớp cách dùng ở Task 3, 4, 6, 7; `SlotRecord`, `RunnerSnapshot`, `decideTotal`, `recordAfterRun(prev, flags, result, now)`, `recordAfterCrash(prev, now, message)`, `giveUp(prev, reason)` (Task 4) khớp `bot-total.ts` và `total-once.ts`; `saveSlot(key, record, now, file?)`, `readSlots`, `startTotal(now, pid, file?, isAlive?)` (Task 5) khớp Task 7; `runTotalOnce({ slot, now }, deps)` và `TotalDeps` (Task 6) khớp `realTotalDeps` (Task 7); tên đầu ra `loa`, `mayTinh`, `netsupport`, `internet`, `dien`, `cleaning`, `attendance` và tiền tố `total-` nhất quán giữa Task 6 và test.

**4. Review Focus:** mỗi dòng có test: mốc biên và tin ngày khác (Task 2: `inSlotWindow` hai test; Task 3 test đầu; Task 6 test cửa sổ), báo cáo trống không đè và 7h lỗi/14h bình thường (Task 3 và Task 6), runner chết/xuất lại/không vòng thử vô hạn (Task 4), khởi động lại không xuất trùng và dọn dữ liệu cũ (Task 4 `final`, Task 5 `pruneSlots`, `saveSlot`), một file lỗi (Task 6).
