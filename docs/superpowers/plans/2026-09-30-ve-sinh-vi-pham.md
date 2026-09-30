# Báo cáo VỆ SINH PHÒNG MÁY & VI PHẠM NỘI QUY THỰC TẬP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tự động điền 2 file trạng thái còn thiếu dữ liệu (TINH TRANG VE SINH PHONG MAY.xlsx, VI PHAM NOI QUY THUC TAP.xlsx) từ tin nhắn Zalo, chạy tự động mỗi cycle của `bot:runner`.

**Architecture:** 2 pipeline hoàn toàn độc lập với `Phase`/`SessionKey`/`Report` hiện có — mỗi pipeline có parser tiêu đề+nội dung riêng, hàm tính ngày/khung giờ riêng, và ghi Excel qua đúng cơ chế COM đã có (`scripts/fill-status-template.ps1`). Gắn vào runner ở cấp CYCLE (chạy 1 lần/cycle, không phụ thuộc session nào dirty), không phải trong `buildSession()`.

**Tech Stack:** TypeScript (tsx), `xlsx` (đọc tiêu đề file mẫu), PowerShell + Excel COM (ghi file, đã có sẵn), `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md`

## Global Constraints

- Mọi identifier MỚI bằng tiếng Anh; identifier tiếng Việt đã có (`tenTruong`, `khuVuc`, `phongMay`, `maTinNhan`...) giữ nguyên.
- Không đụng sheet `TONG` của file vệ sinh.
- Không điền cột GHI CHÚ (vệ sinh, cột H) và I/J/K/L (vi phạm: NỘI DUNG/GIẢI TRÌNH/CAM KẾT/GHI CHÚ).
- Xếp loại vệ sinh chỉ A ("Vệ sinh sạch sẽ: Có") hoặc B (mọi giá trị khác) — không có C.
- CHỨC VỤ vi phạm luôn là hằng số `"TTS"`.
- Trễ điểm danh = sau ĐÚNG 8h00 (sáng) hoặc 14h00 (chiều) — không phải 8h05/14h05.
- Cả 2 script mới không dùng `Phase`/`SessionKey`/`config.phases` — tự tính ngày/giờ riêng.
- Gắn vào `bot:runner` ở cấp cycle (1 lần/cycle), không gắn vào `buildSession()`.

## Review Focus

1. Tiêu đề "BÁO CÁO CUỐI BUỔI" (vệ sinh, không có "DẠY") không được lẫn vào pipeline báo cáo trường học (`classifyTitle`).
2. Một tin vệ sinh có NHIỀU khối "Phòng máy" (báo nhiều phòng trong 1 tin) phải ra nhiều dòng, không chỉ lấy khối cuối cùng.
3. SỐ LẦN vi phạm không được reset về 0 vào một ngày KHÔNG có tin điểm danh nào (chỉ reset khi có tin và tin đó đúng giờ) — khác với "không có tin thì coi như vi phạm hết" hay "không có tin thì reset".
4. Người trễ CẢ sáng lẫn chiều cùng 1 ngày vẫn chỉ ra đúng 1 dòng, cả 2 cột SÁNG/CHIỀU cùng điền.
5. File vệ sinh có công thức TỔNG (`COUNTA`) ngay sau vùng dữ liệu — số dòng dữ liệu thay đổi qua nhiều lần chạy (0, 1, nhiều) không được để công thức này vỡ thành `#REF!` hoặc lệch dòng.

---

## Task 1: Sửa `classifyTitle` để không lẫn với tiêu đề vệ sinh, thêm `fold`/`splitLabel` dùng chung

**Files:**
- Modify: `src/lesson/parseReport.ts:10-18` (regex `classifyTitle`), thêm `export` cho `fold` (dòng 7), thêm hàm mới `splitLabel`
- Test: `tests/parseReport.test.ts`

**Interfaces:**
- Produces: `export function fold(s: string): string` (đã có, chỉ thêm `export`); `export function splitLabel(line: string): { label: string; value: string } | null` — label đã `fold()`, value giữ nguyên (trim).

- [ ] **Step 1: Sửa test hiện có cho khớp yêu cầu mới (phải có "DẠY")**

Trong `tests/parseReport.test.ts`, dòng `assert.equal(classifyTitle("BAO CAO DAU BUOI"), "DauBuoi");` hiện đang test một tiêu đề KHÔNG có "DẠY" — đây chính là ca sẽ đổi hành vi. Sửa dòng test:

```ts
test("classifyTitle", () => {
    assert.equal(classifyTitle("BÁO CÁO ĐẦU BUỔI DẠY\n- Tên Giáo Viên: A"), "DauBuoi");
    assert.equal(classifyTitle("báo cáo cuối buổi dạy"), "CuoiBuoi");
    assert.equal(classifyTitle("BAO CAO DAU BUOI DAY"), "DauBuoi");
    assert.equal(classifyTitle("BÁO CÁO CHUYÊN MÔN\n- Lớp: 9A"), null);
    assert.equal(classifyTitle("BÁO CÁO CHUYÊN MÔN 2"), null);
    assert.equal(classifyTitle("test báo cáo"), null);
    assert.equal(classifyTitle(""), null);
    assert.equal(classifyTitle("Xin gửi\nbáo cáo đầu buổi hôm nay"), "gan_giong");
    // Tiêu đề vệ sinh phòng máy (không có "DẠY") không được lẫn vào báo cáo trường học.
    assert.equal(classifyTitle("BÁO CÁO CUỐI BUỔI\n- Tên trường: X"), null);
    assert.equal(classifyTitle("BÁO CÁO ĐẦU BUỔI"), null);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npm test -- tests/parseReport.test.ts` (hoặc `node --import tsx --test tests/parseReport.test.ts`)
Expected: FAIL ở dòng mới thêm (tiêu đề vệ sinh vẫn đang bị nhận là `CuoiBuoi`/`DauBuoi`).

- [ ] **Step 3: Sửa `classifyTitle`, export `fold`, thêm `splitLabel`**

```ts
export function stripDiacritics(s: string): string {
    return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

export const fold = (s: string): string => stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();

/** Classifies a message by its title line; `gan_giong` = mentions a start/end report but the title is not the standard one. */
export function classifyTitle(content: string): TitleKind {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const first = fold(lines[0] ?? "");
    if (/^bao cao dau buoi day\b/.test(first)) return "DauBuoi";
    if (/^bao cao cuoi buoi day\b/.test(first)) return "CuoiBuoi";
    const all = fold(content);
    if (/bao cao/.test(all) && /(dau|cuoi) buoi/.test(all)) return "gan_giong";
    return null;
}

/** Splits a "- Label: value" line (any of `-•*+` as the bullet, or none). Returns null when there is no ":".
 * `label` is already `fold()`-ed for comparison; `value` keeps its original text (trimmed). Used by report
 * parsers that are not `parseLines` (e.g. cleaningReport.ts, attendanceReport.ts). */
export function splitLabel(line: string): { label: string; value: string } | null {
    const t = line.replace(/^\s*[-•*+]?\s*/, "");
    const colon = t.indexOf(":");
    if (colon < 0) return null;
    return { label: fold(t.slice(0, colon)), value: t.slice(colon + 1).trim() };
}
```

- [ ] **Step 4: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/parseReport.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Chạy toàn bộ test suite, xác nhận không có test nào khác phụ thuộc hành vi cũ**

Run: `npm test`
Expected: PASS toàn bộ (không còn nơi nào khác test `classifyTitle`/`fold` theo hành vi cũ — đã `grep -rn "classifyTitle\|BAO CAO DAU BUOI\|BAO CAO CUOI BUOI" tests/` để xác nhận trước khi merge).

- [ ] **Step 6: Commit**

```bash
git add src/lesson/parseReport.ts tests/parseReport.test.ts
git commit -m "fix(lesson): classifyTitle yêu cầu \"DẠY\", tránh lẫn với tiêu đề vệ sinh phòng máy

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Chuẩn bị `statusReportLayout.ts` — export `WEEKDAY_EXCEL_TYPE1`, thêm `freeFormFileName`, bỏ 2 file khỏi `OTHER_TEMPLATE_FILES`

**Files:**
- Modify: `src/lesson/statusReportLayout.ts` (export `WEEKDAY_EXCEL_TYPE1`, thêm `freeFormFileName`, sửa `OTHER_TEMPLATE_FILES`)
- Modify: `src/cli/fill-status-reports.ts:53-64` (bỏ nhánh đặc cách VI PHAM, đơn giản hoá vòng lặp)
- Test: `tests/statusReportLayout.test.ts`

**Interfaces:**
- Produces: `export const WEEKDAY_EXCEL_TYPE1: (jsDay: number) => number` (đổi từ `const` thành `export const`, không đổi hành vi); `export function freeFormFileName(title: string, day: string, hhmm: string): string`.
- Produces: `OTHER_TEMPLATE_FILES` còn đúng 3 phần tử: `["THAY THE MAY TINH.xlsx", "TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx"]`.

- [ ] **Step 1: Viết test cho `freeFormFileName` và test `OTHER_TEMPLATE_FILES` mới (sẽ FAIL trước khi sửa)**

Trong `tests/statusReportLayout.test.ts`, sửa test đang liệt kê 5 file:

```ts
test("OTHER_TEMPLATE_FILES lists exactly the 3 files with no data source, and none overlap FILE_LAYOUT's templates", () => {
    assert.deepEqual(
        [...OTHER_TEMPLATE_FILES].sort(),
        ["TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx", "THAY THE MAY TINH.xlsx"].sort(),
    );
    const inScope = new Set<string>(Object.values(FILE_LAYOUT).map((l) => l.templateFile));
    for (const f of OTHER_TEMPLATE_FILES) assert.equal(inScope.has(f), false, f);
});
```

Thêm test mới ở cuối file (trước hoặc sau khối `readTemplateTitle`):

```ts
test("freeFormFileName: <title>_<yyMMdd>_T<thu>_<hhmm tự do>.xlsx", () => {
    // 2026-09-29 là thứ Ba -> Excel WEEKDAY(d,1) = 3.
    assert.equal(freeFormFileName("TÌNH TRẠNG VỆ SINH PHÒNG MÁY", "2026-09-29", "1042"), "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx");
});

test("WEEKDAY_EXCEL_TYPE1: JS getUTCDay() (0=CN) -> Excel WEEKDAY(d,1) (1=CN)", () => {
    assert.equal(WEEKDAY_EXCEL_TYPE1(0), 1);
    assert.equal(WEEKDAY_EXCEL_TYPE1(2), 3);
    assert.equal(WEEKDAY_EXCEL_TYPE1(6), 7);
});
```

Và thêm `freeFormFileName`, `WEEKDAY_EXCEL_TYPE1` vào import ở đầu file (dòng 7).

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/statusReportLayout.test.ts`
Expected: FAIL (`freeFormFileName`/`WEEKDAY_EXCEL_TYPE1` chưa export, `OTHER_TEMPLATE_FILES` vẫn còn 5 phần tử).

- [ ] **Step 3: Sửa `statusReportLayout.ts`**

Đổi dòng 27:
```ts
/** 3 file chưa có nguồn dữ liệu: chỉ chép nguyên trạng, không mở qua Excel COM (xem CLI, task 4). VỆ SINH và
 * VI PHẠM có script riêng (fill-cleaning-report.ts / fill-attendance-report.ts — xem
 * docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md), không còn ở đây. */
export const OTHER_TEMPLATE_FILES: string[] = ["THAY THE MAY TINH.xlsx", "TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx"];
```

Đổi dòng 70 (thêm `export`):
```ts
export const WEEKDAY_EXCEL_TYPE1 = (jsDay: number): number => jsDay + 1; // JS getUTCDay(): 0=CN..6=Thứ 7; Excel WEEKDAY(d,1): 1=CN..7=Thứ 7.
```

Thêm hàm mới ngay sau `statusFileName` (cuối file, trước `buildFillSpecs` hoặc sau nó — vị trí không quan trọng, đặt ngay dưới `statusFileName`):
```ts
/** Như `statusFileName`, nhưng cho file KHÔNG có mốc giờ cố định theo giai đoạn — VỆ SINH/VI PHẠM đóng dấu
 * đúng giờ chạy thực tế (`hhmm` truyền vào tự do, dạng "HHmm") thay vì tra `PHASE_HHMM`. */
export function freeFormFileName(title: string, day: string, hhmm: string): string {
    const [y, m, d] = day.split("-");
    const yyMMdd = `${y.slice(2)}${m}${d}`;
    const weekday = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay();
    return `${title}_${yyMMdd}_T${WEEKDAY_EXCEL_TYPE1(weekday)}_${hhmm}.xlsx`;
}
```

- [ ] **Step 4: Đơn giản hoá vòng lặp OTHER_TEMPLATE_FILES trong `fill-status-reports.ts`**

Sửa `src/cli/fill-status-reports.ts:53-64` — bỏ nhánh đặc cách `VI PHAM NOI QUY THUC TAP.xlsx` (file này không còn nằm trong `OTHER_TEMPLATE_FILES`):

```ts
    // 3 file còn lại ngoài phạm vi dữ liệu (VỆ SINH/VI PHẠM giờ có script riêng, xem
    // docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md) — chỉ chép nguyên trạng, đổi tên theo tiêu đề mẫu.
    for (const file of OTHER_TEMPLATE_FILES) {
        const src = path.join(templatesSrc, file);
        const wb = XLSX.readFile(src);
        const title = readTemplateTitle(src, wb.SheetNames[0]);
        fs.copyFileSync(src, path.join(outDir, statusFileName(title, day, buoi)));
    }
```

Cũng cập nhật docblock ở đầu file (dòng 13-21), câu "và chép nguyên trạng 5 file chưa có dữ liệu (trừ VI PHAM...)" → "và chép nguyên trạng 3 file chưa có dữ liệu".

- [ ] **Step 5: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/statusReportLayout.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 6: Kiểm tra kiểu (typecheck) toàn repo**

Run: `npm run typecheck`
Expected: không lỗi (đặc biệt `fill-status-reports.ts` sau khi bỏ nhánh if).

- [ ] **Step 7: Commit**

```bash
git add src/lesson/statusReportLayout.ts src/cli/fill-status-reports.ts tests/statusReportLayout.test.ts
git commit -m "refactor(lesson): bỏ VỆ SINH/VI PHẠM khỏi OTHER_TEMPLATE_FILES, thêm freeFormFileName

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Parser tin nhắn VỆ SINH (`cleaningReport.ts`) + kiểu `CleaningEntry`

**Files:**
- Create: `src/types/cleaning.ts`
- Create: `src/lesson/cleaningReport.ts`
- Modify: `src/types/index.ts` (thêm `export * from "./cleaning.js";`)
- Test: `tests/cleaningReport.test.ts`

**Interfaces:**
- Consumes: `fold`, `splitLabel` từ `../lesson/parseReport.js` (Task 1); `todayVietnam`, `addDays` từ `../lesson/time.js` (đã có sẵn).
- Produces: `export interface CleaningEntry { maNhom: string; maTinNhan: string; thoiGian: number; tenTruong: string; khuVuc: string; phongMay: string; tenIT: string; veSinhSach: boolean }`; `export interface CleaningRoomResult { tenTruong: string; khuVuc: string; phongMay: string; tenIT: string; veSinhSach: boolean }`; `export function classifyCleaningTitle(content: string): boolean`; `export function parseCleaningMessage(content: string): CleaningRoomResult[]`; `export function cleaningReportDay(now: number): string`.

- [ ] **Step 1: Tạo kiểu `CleaningEntry`**

`src/types/cleaning.ts`:
```ts
// VỆ SINH PHÒNG MÁY — xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md

/** Một dòng dữ liệu vệ sinh (= một "Phòng máy" trong một tin "BÁO CÁO CUỐI BUỔI"). */
export interface CleaningEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    tenIT: string;
    veSinhSach: boolean;
}
```

Thêm vào `src/types/index.ts`:
```ts
export * from "./cleaning.js";
```
(chèn theo thứ tự bảng chữ cái, ngay sau `export * from "./chat.js";` và trước `export * from "./config.js";`)

- [ ] **Step 2: Viết test cho `classifyCleaningTitle` và `cleaningReportDay` (sẽ FAIL — module chưa tồn tại)**

`tests/cleaningReport.test.ts` (tạo file mới, phần 1):
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCleaningTitle, cleaningReportDay, parseCleaningMessage } from "../src/lesson/cleaningReport.js";

test("classifyCleaningTitle only matches the exact title, not the school-report one", () => {
    assert.equal(classifyCleaningTitle("BÁO CÁO CUỐI BUỔI\n- Tên trường: X"), true);
    assert.equal(classifyCleaningTitle("báo cáo cuối buổi"), true);
    assert.equal(classifyCleaningTitle("BÁO CÁO CUỐI BUỔI DẠY\n- Tên Giáo Viên: A"), false);
    assert.equal(classifyCleaningTitle("BÁO CÁO ĐẦU BUỔI"), false);
    assert.equal(classifyCleaningTitle(""), false);
});

test("cleaningReportDay: lùi 1 ngày, riêng Thứ 2 lùi 2 ngày (lấy Thứ 7)", () => {
    // 2026-09-30 là Thứ 4 -> báo cáo của Thứ 3 (2026-09-29).
    assert.equal(cleaningReportDay(Date.UTC(2026, 8, 30, 3, 0)), "2026-09-29"); // 10:00 giờ VN
    // 2026-10-05 là Thứ 2 -> báo cáo của Thứ 7 tuần trước (2026-10-03).
    assert.equal(cleaningReportDay(Date.UTC(2026, 9, 5, 3, 0)), "2026-10-03");
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL (module không tồn tại)**

Run: `node --import tsx --test tests/cleaningReport.test.ts`
Expected: FAIL — `Cannot find module '../src/lesson/cleaningReport.js'`.

- [ ] **Step 4: Viết `src/lesson/cleaningReport.ts`**

```ts
import { fold, splitLabel } from "./parseReport.js";
import { addDays, todayVietnam } from "./time.js";

export interface CleaningRoomResult {
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    tenIT: string;
    veSinhSach: boolean;
}

/** Dòng đầu tin phải khớp CHÍNH XÁC "BÁO CÁO CUỐI BUỔI" — không có gì thêm sau (kể cả "DẠY"), để không lẫn
 * với báo cáo cuối buổi dạy của trường học (classifyTitle trong parseReport.ts yêu cầu "DẠY", nên tiêu đề này
 * không còn bị 2 bên cùng nhận nữa, nhưng vẫn giữ so khớp CHÍNH XÁC ở đây làm rào chắn thứ 2). */
export function classifyCleaningTitle(content: string): boolean {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return fold(lines[0] ?? "") === "bao cao cuoi buoi";
}

function splitSchoolKhuVuc(value: string): { tenTruong: string; khuVuc: string } {
    const idx = value.lastIndexOf(" - ");
    if (idx < 0) return { tenTruong: value.trim(), khuVuc: "" };
    return { tenTruong: value.slice(0, idx).trim(), khuVuc: value.slice(idx + 3).trim() };
}

/**
 * Một tin có thể báo NHIỀU phòng máy (nhiều khối "- Phòng máy: ..." nối tiếp nhau) — mỗi khối ra 1 phần tử.
 * "Tên trường"/"Tên IT" dùng chung cho cả tin (đọc 1 lần, áp cho mọi khối). Một khối không có dòng "Vệ sinh
 * sạch sẽ" bị bỏ qua (không đủ dữ liệu để xếp loại). Giá trị "Phòng máy" giữ NGUYÊN VĂN như trong tin (kể cả
 * phần trong ngoặc) — không cố tách mã phòng, vì cách IT ghi không nhất quán giữa các tin thật (có tin mã
 * phòng nằm trong ngoặc, có tin không ghi mã phòng nào).
 */
export function parseCleaningMessage(content: string): CleaningRoomResult[] {
    const lines = content.normalize("NFC").split(/\r?\n/);
    let tenTruong = "";
    let khuVuc = "";
    let tenIT = "";
    const results: CleaningRoomResult[] = [];
    let current: { phongMay: string; veSinhSach: boolean | null } | null = null;

    const flush = () => {
        if (current && current.veSinhSach !== null && tenTruong) {
            results.push({ tenTruong, khuVuc, phongMay: current.phongMay, tenIT, veSinhSach: current.veSinhSach });
        }
        current = null;
    };

    for (const line of lines) {
        const parsed = splitLabel(line);
        if (!parsed) continue;
        if (parsed.label === "ten truong") {
            ({ tenTruong, khuVuc } = splitSchoolKhuVuc(parsed.value));
        } else if (parsed.label === "ten it") {
            tenIT = parsed.value;
        } else if (parsed.label === "phong may") {
            flush();
            current = { phongMay: parsed.value, veSinhSach: null };
        } else if (parsed.label === "ve sinh sach se" && current) {
            current.veSinhSach = fold(parsed.value) === "co";
        }
    }
    flush();
    return results;
}

/** Ngày dữ liệu vệ sinh nói về: hôm nay Thứ 2 -> lùi 2 ngày (Thứ 2 - 2 = Thứ 7 tuần trước, vì Chủ nhật không
 * có ghi nhận); các ngày khác -> lùi 1 ngày. KHÔNG dùng Phase/phaseDay — báo cáo này không có khái niệm giai
 * đoạn. */
export function cleaningReportDay(now: number): string {
    const today = todayVietnam(now);
    const [y, m, d] = today.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=CN..6=Thứ 7 (Thứ 2 = 1)
    return addDays(today, weekday === 1 ? -2 : -1);
}
```

- [ ] **Step 5: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/cleaningReport.test.ts`
Expected: PASS.

- [ ] **Step 6: Thêm test cho `parseCleaningMessage` dùng đúng tin nhắn thật (1 phòng và nhiều phòng), chạy PASS ngay**

Thêm vào `tests/cleaningReport.test.ts`:
```ts
const REAL_ONE_ROOM = `BÁO CÁO CUỐI BUỔI
- Tên trường: THCS Tân Đông Hiệp - DA
- Tổng số PM: 4 (PM1, PM2 Cty, PM3, PM4 trường)
- Tên IT: Quyền

- Phòng máy: Tin Học (PM2 kế cận tin)
- Tổng số máy: 51 (tính cả máy GV)
- Netsupport: Có
- Internet: Có
- Vệ sinh sạch sẽ: có`;

test("parseCleaningMessage parses a real single-room message", () => {
    const result = parseCleaningMessage(REAL_ONE_ROOM);
    assert.deepEqual(result, [{ tenTruong: "THCS Tân Đông Hiệp", khuVuc: "DA", phongMay: "Tin Học (PM2 kế cận tin)", tenIT: "Quyền", veSinhSach: true }]);
});

test("parseCleaningMessage: 'Vệ sinh sạch sẽ: Không' -> veSinhSach false", () => {
    const msg = REAL_ONE_ROOM.replace("Vệ sinh sạch sẽ: có", "Vệ sinh sạch sẽ: Không");
    assert.equal(parseCleaningMessage(msg)[0].veSinhSach, false);
});

test("parseCleaningMessage: một tin báo NHIỀU phòng ra nhiều dòng, không chỉ lấy khối cuối", () => {
    const multi = `BÁO CÁO CUỐI BUỔI
- Tên trường: TH An Phú Tây 2 - BC
- Tổng số PM: 2
- Tên IT: N.N.Minh

- Phòng máy: PM1
- Vệ sinh sạch sẽ: Không

- Phòng máy: PM2
- Vệ sinh sạch sẽ: Có`;
    const result = parseCleaningMessage(multi);
    assert.deepEqual(result, [
        { tenTruong: "TH An Phú Tây 2", khuVuc: "BC", phongMay: "PM1", tenIT: "N.N.Minh", veSinhSach: false },
        { tenTruong: "TH An Phú Tây 2", khuVuc: "BC", phongMay: "PM2", tenIT: "N.N.Minh", veSinhSach: true },
    ]);
});

test("parseCleaningMessage: khối phòng máy thiếu dòng 'Vệ sinh sạch sẽ' bị bỏ qua", () => {
    const msg = `BÁO CÁO CUỐI BUỔI
- Tên trường: X - BC
- Tên IT: A

- Phòng máy: PM1
- Netsupport: Có`;
    assert.deepEqual(parseCleaningMessage(msg), []);
});

test("parseCleaningMessage: tin không có 'Tên trường' không ra kết quả nào", () => {
    const msg = `BÁO CÁO CUỐI BUỔI
- Phòng máy: PM1
- Vệ sinh sạch sẽ: Có`;
    assert.deepEqual(parseCleaningMessage(msg), []);
});
```

- [ ] **Step 7: Chạy test, xác nhận PASS toàn bộ file**

Run: `node --import tsx --test tests/cleaningReport.test.ts`
Expected: PASS toàn bộ (7 test).

- [ ] **Step 8: Typecheck + toàn bộ test suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/types/cleaning.ts src/types/index.ts src/lesson/cleaningReport.ts tests/cleaningReport.test.ts
git commit -m "feat(lesson): parser tin nhắn VỆ SINH PHÒNG MÁY (cleaningReport.ts)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Dựng dòng Excel cho VỆ SINH (`cleaningRows.ts`)

**Files:**
- Create: `src/lesson/cleaningRows.ts`
- Test: `tests/cleaningRows.test.ts`

**Interfaces:**
- Consumes: `CleaningEntry` (Task 3, `../types/index.js`); `FileLayout`, `FormulaCell` (đã export sẵn từ `./statusReportLayout.js`); `Cell` (đã export sẵn từ `../types/index.js`).
- Produces: `export const CLEANING_LAYOUT: FileLayout` (`{ templateFile: "TINH TRANG VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "H" }`); `export function buildCleaningRows(entries: CleaningEntry[], day: string): Array<Record<string, Cell>>`; `export function cleaningFormulaCells(firstDataRow: number, rowCount: number): FormulaCell[]`.

- [ ] **Step 1: Viết test (sẽ FAIL — module chưa tồn tại)**

`tests/cleaningRows.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCleaningRows, CLEANING_LAYOUT, cleaningFormulaCells } from "../src/lesson/cleaningRows.js";
import type { CleaningEntry } from "../src/types/index.js";

const entry = (over: Partial<CleaningEntry>): CleaningEntry => ({
    maNhom: "g1", maTinNhan: "m1", thoiGian: 1000,
    tenTruong: "THCS X", khuVuc: "DA", phongMay: "PM1", tenIT: "A", veSinhSach: true,
    ...over,
});

test("CLEANING_LAYOUT matches the real template's HANG NGAY sheet", () => {
    assert.deepEqual(CLEANING_LAYOUT, { templateFile: "TINH TRANG VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "H" });
});

test("buildCleaningRows: Có -> A, Không -> B, STT tăng dần, NGÀY là dd/mm/yyyy", () => {
    const rows = buildCleaningRows([entry({ veSinhSach: true }), entry({ maTinNhan: "m2", phongMay: "PM2", veSinhSach: false })], "2026-09-29");
    assert.deepEqual(rows, [
        { A: 1, B: "29/09/2026", C: "THCS X", D: "DA", E: "PM1", F: "A", G: "A" },
        { A: 2, B: "29/09/2026", C: "THCS X", D: "DA", E: "PM2", F: "A", G: "B" },
    ]);
});

test("buildCleaningRows: no entries -> no rows", () => {
    assert.deepEqual(buildCleaningRows([], "2026-09-29"), []);
});

test("cleaningFormulaCells: TỔNG luôn tham chiếu đúng vùng dữ liệu hiện tại, tối thiểu 1 dòng", () => {
    assert.deepEqual(cleaningFormulaCells(4, 0), [{ ref: "C5", formula: "COUNTA(C4:C4)" }]);
    assert.deepEqual(cleaningFormulaCells(4, 1), [{ ref: "C5", formula: "COUNTA(C4:C4)" }]);
    assert.deepEqual(cleaningFormulaCells(4, 3), [{ ref: "C7", formula: "COUNTA(C4:C6)" }]);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/cleaningRows.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết `src/lesson/cleaningRows.ts`**

```ts
import type { FileLayout, FormulaCell } from "./statusReportLayout.js";
import type { Cell, CleaningEntry } from "../types/index.js";

export const CLEANING_LAYOUT: FileLayout = { templateFile: "TINH TRANG VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "H" };

const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
};

/** Cột GHI CHÚ (H) cố tình không có trong object trả về — để trống, không ghi gì (xem spec). */
export function buildCleaningRows(entries: CleaningEntry[], day: string): Array<Record<string, Cell>> {
    return entries.map((e, i) => ({
        A: i + 1,
        B: fmtDate(day),
        C: e.tenTruong,
        D: e.khuVuc,
        E: e.phongMay,
        F: e.tenIT,
        G: e.veSinhSach ? "A" : "B",
    }));
}

/**
 * Mirrors `boSungFormulaCells` (statusRows.ts): file mẫu có công thức `TỔNG = COUNTA(...)` ngay dưới vùng dữ
 * liệu — Excel không tự mở rộng/thu hẹp đúng tham chiếu này khi PowerShell chèn/xoá dòng kề bên (xem
 * scripts/fill-status-template.ps1), nên luôn ghi đè lại công thức theo đúng vùng dữ liệu hiện tại, tối thiểu
 * 1 dòng (0 dòng dữ liệu vẫn tham chiếu firstDataRow, không để trống hẳn).
 */
export function cleaningFormulaCells(firstDataRow: number, rowCount: number): FormulaCell[] {
    const effectiveRows = Math.max(rowCount, 1);
    const lastDataRow = firstDataRow + effectiveRows - 1;
    const totalRow = firstDataRow + effectiveRows;
    return [{ ref: `C${totalRow}`, formula: `COUNTA(C${firstDataRow}:C${lastDataRow})` }];
}
```

- [ ] **Step 4: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/cleaningRows.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/lesson/cleaningRows.ts tests/cleaningRows.test.ts
git commit -m "feat(lesson): dựng dòng Excel + công thức TỔNG cho VỆ SINH PHÒNG MÁY

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Helper ghi Excel dùng chung (`excelFill.ts`)

**Files:**
- Create: `src/lesson/excelFill.ts`
- Test: `tests/excelFill.test.ts`

**Interfaces:**
- Consumes: `FileLayout`, `FormulaCell`, `HeaderCell` (đã export từ `./statusReportLayout.js`); `Cell` (`../types/index.js`); `outputDir`, `scriptsDir` (`../core/paths.js`, đã có sẵn).
- Produces: `export interface FillTemplateArgs { name: string; templatesSrc: string; layout: FileLayout; outDir: string; outName: string; rows: Array<Record<string, Cell>>; headerCells: HeaderCell[]; formulaCells?: FormulaCell[] }`; `export function buildFillPsSpec(args: FillTemplateArgs): unknown` (pure, testable); `export function runFillTemplate(args: FillTemplateArgs): string` (gọi PowerShell thật — không unit test được, xem Task 6/10 để kiểm tra tay).

- [ ] **Step 1: Viết test cho phần thuần (`buildFillPsSpec`) — sẽ FAIL, module chưa tồn tại**

`tests/excelFill.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildFillPsSpec } from "../src/lesson/excelFill.js";

test("buildFillPsSpec wires the layout, rows and header cells into the PowerShell spec shape", () => {
    const spec = buildFillPsSpec({
        name: "cleaning",
        templatesSrc: "C:\\data\\mau bao cao new",
        layout: { templateFile: "TINH TRANG VE SINH PHONG MAY.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 8, lastColumn: "H" },
        outDir: "C:\\out\\260929",
        outName: "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx",
        rows: [{ A: 1, B: "29/09/2026" }],
        headerCells: [{ ref: "H2", value: 46293, numberFormat: "dd/mm/yyyy" }],
        formulaCells: [{ ref: "C5", formula: "COUNTA(C4:C4)" }],
    });
    assert.deepEqual(spec, {
        files: [
            {
                name: "cleaning",
                template: path.join("C:\\data\\mau bao cao new", "TINH TRANG VE SINH PHONG MAY.xlsx"),
                out: path.join("C:\\out\\260929", "TÌNH TRẠNG VỆ SINH PHÒNG MÁY_260929_T3_1042.xlsx"),
                sheet: "HANG NGAY",
                firstDataRow: 4,
                totalRowBefore: 8,
                lastColumn: "H",
                rows: [{ A: 1, B: "29/09/2026" }],
                headerCells: [{ ref: "H2", value: 46293, numberFormat: "dd/mm/yyyy" }],
                formulaCells: [{ ref: "C5", formula: "COUNTA(C4:C4)" }],
            },
        ],
    });
});

test("buildFillPsSpec: formulaCells defaults to an empty array when omitted", () => {
    const spec = buildFillPsSpec({
        name: "attendance",
        templatesSrc: "C:\\data\\mau bao cao new",
        layout: { templateFile: "VI PHAM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 5, lastColumn: "L" },
        outDir: "C:\\out",
        outName: "out.xlsx",
        rows: [],
        headerCells: [],
    });
    assert.deepEqual((spec as { files: Array<{ formulaCells: unknown[] }> }).files[0].formulaCells, []);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/excelFill.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết `src/lesson/excelFill.ts`**

```ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, scriptsDir } from "../core/paths.js";
import type { FileLayout, FormulaCell, HeaderCell } from "./statusReportLayout.js";
import type { Cell } from "../types/index.js";

export interface FillTemplateArgs {
    name: string;
    templatesSrc: string;
    layout: FileLayout;
    outDir: string;
    outName: string;
    rows: Array<Record<string, Cell>>;
    headerCells: HeaderCell[];
    formulaCells?: FormulaCell[];
}

/** Phần THUẦN của việc gọi `fill-status-template.ps1` — chỉ dựng object spec, không đụng file/tiến trình nào,
 * nên test được trực tiếp (khác `runFillTemplate`, cần Excel COM thật). */
export function buildFillPsSpec(args: FillTemplateArgs): unknown {
    return {
        files: [
            {
                name: args.name,
                template: path.join(args.templatesSrc, args.layout.templateFile),
                out: path.join(args.outDir, args.outName),
                sheet: args.layout.sheet,
                firstDataRow: args.layout.firstDataRow,
                totalRowBefore: args.layout.totalRowBefore,
                lastColumn: args.layout.lastColumn,
                rows: args.rows,
                headerCells: args.headerCells,
                formulaCells: args.formulaCells ?? [],
            },
        ],
    };
}

/**
 * Chạy `scripts/fill-status-template.ps1` cho ĐÚNG 1 file — cùng cơ chế Excel COM `fill:status-reports` đang
 * dùng (xem src/cli/fill-status-reports.ts), tái sử dụng nguyên trạng: mỗi lần gọi là MỘT tiến trình
 * PowerShell riêng (bắt buộc — xem chú thích trong file .ps1 về lý do 2 file không được chạy chung 1 tiến
 * trình). Ném lỗi nếu PowerShell thoát khác 0; người gọi tự quyết định coi lỗi này là fatal hay chỉ cảnh báo.
 */
export function runFillTemplate(args: FillTemplateArgs): string {
    const psSpec = buildFillPsSpec(args);
    fs.mkdirSync(outputDir, { recursive: true });
    const specFile = path.join(outputDir, `fill-spec-${args.name}.json`);
    fs.writeFileSync(specFile, JSON.stringify(psSpec), "utf8");
    const logFile = path.join(outputDir, `fill-${args.name}.log`);
    fs.rmSync(logFile, { force: true });
    execFileSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, "fill-status-template.ps1"), "-Spec", specFile, "-Log", logFile],
        { stdio: "inherit", timeout: 5 * 60_000 },
    );
    return fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").replace(/^\uFEFF/, "").trimEnd() : "";
}
```

- [ ] **Step 4: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/excelFill.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 6: Commit**

```bash
git add src/lesson/excelFill.ts tests/excelFill.test.ts
git commit -m "feat(lesson): helper dùng chung để gọi fill-status-template.ps1

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: CLI `fill:cleaning-report`

**Files:**
- Create: `src/cli/fill-cleaning-report.ts`
- Modify: `package.json` (thêm script)

**Interfaces:**
- Consumes: `classifyCleaningTitle`, `parseCleaningMessage`, `cleaningReportDay` (Task 3); `CLEANING_LAYOUT`, `buildCleaningRows`, `cleaningFormulaCells` (Task 4); `runFillTemplate` (Task 5); `freeFormFileName`, `readTemplateTitle`, `excelDateSerialForDay` (Task 2 / đã có sẵn ở `./statusReportLayout.js`); `vietnamDay` (`./time.js`, đã có sẵn); `MessageStore` (`../store/messageStore.js`, đã có sẵn); `CleaningEntry`, `SourceMessage` (`../types/index.js`).
- Produces: script CLI chạy được qua `npm run fill:cleaning-report`; không export gì cho module khác dùng (đầu cuối của pipeline).

Đây là bước LẮP RÁP (wiring) — không có logic mới cần unit test (đã test hết ở Task 3/4/5); kiểm tra bằng chạy tay ở Step 4.

- [ ] **Step 1: Viết `src/cli/fill-cleaning-report.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { classifyCleaningTitle, cleaningReportDay, parseCleaningMessage } from "../lesson/cleaningReport.js";
import { buildCleaningRows, CLEANING_LAYOUT, cleaningFormulaCells } from "../lesson/cleaningRows.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { excelDateSerialForDay, freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { vietnamDay } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { CleaningEntry, SourceMessage } from "../types/index.js";

/**
 * Điền sheet HANG NGAY của TINH TRANG VE SINH PHONG MAY.xlsx từ tin "BÁO CÁO CUỐI BUỔI" (IT kỹ thuật) của
 * ĐÚNG 1 ngày (hôm qua, hoặc Thứ 7 nếu hôm nay Thứ 2 — xem cleaningReportDay). Độc lập với Phase/SessionKey —
 * xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md. An toàn khi chạy lại nhiều lần trong ngày:
 * luôn quét lại toàn bộ tin của đúng ngày mục tiêu rồi ghi đè, không có state tích luỹ.
 *
 *   npm run fill:cleaning-report -- [--now <unix ms>]
 */
async function loadAllMessages(): Promise<SourceMessage[]> {
    const store = new MessageStore();
    const all: SourceMessage[] = [];
    for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
    return all;
}

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const now = Number(option("--now") ?? Date.now());
    const day = cleaningReportDay(now);

    const messages = await loadAllMessages();
    const entries: CleaningEntry[] = [];
    for (const msg of messages) {
        if (vietnamDay(msg.ts) !== day) continue;
        if (!classifyCleaningTitle(msg.content)) continue;
        for (const room of parseCleaningMessage(msg.content)) {
            entries.push({ maNhom: msg.groupId, maTinNhan: msg.msgId, thoiGian: msg.ts, ...room });
        }
    }

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMM = day.slice(2, 4) + day.slice(5, 7);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = path.join(config.dataDir, "export", "trang-thai", yyMM, yyMMdd);
    fs.mkdirSync(outDir, { recursive: true });

    const rows = buildCleaningRows(entries, day);
    const title = readTemplateTitle(path.join(templatesSrc, CLEANING_LAYOUT.templateFile), CLEANING_LAYOUT.sheet);
    const hhmm = new Date(now + 7 * 3_600_000).toISOString().slice(11, 16).replace(":", "");
    const outName = freeFormFileName(title, day, hhmm);

    runFillTemplate({
        name: "cleaning",
        templatesSrc,
        layout: CLEANING_LAYOUT,
        outDir,
        outName,
        rows,
        headerCells: [{ ref: "H2", value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" }],
        formulaCells: cleaningFormulaCells(CLEANING_LAYOUT.firstDataRow, rows.length),
    });

    console.log(`[fill-cleaning-report] ngày ${day}: ${rows.length} dòng -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
```

- [ ] **Step 2: Thêm script vào `package.json`**

Trong `"scripts"`, ngay sau `"fill:status-reports"`:
```json
        "fill:cleaning-report": "tsx src/cli/fill-cleaning-report.ts",
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 4: Chạy tay để kiểm tra thật (yêu cầu Excel cài trên máy — người dùng tự chạy, không phải agent)**

Ghi rõ cho người dùng chạy tay (không tự động trong plan này — máy chạy agent có thể không có Excel/không phải máy Windows của người dùng):
```
npm run fill:cleaning-report -- --now <unix ms của một ngày có tin "BÁO CÁO CUỐI BUỔI" thật trong data/*.json>
```
Mở file `.xlsx` sinh ra trong `data/export/trang-thai/<yyMM>/<yyMMdd>/`, kiểm tra: đúng ngày, đúng số dòng, XẾP LOẠI đúng A/B, sheet `TONG` không đổi so với file mẫu gốc.

- [ ] **Step 5: Commit**

```bash
git add src/cli/fill-cleaning-report.ts package.json
git commit -m "feat(cli): thêm lệnh fill:cleaning-report

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Parser tin nhắn VI PHẠM (`attendanceReport.ts`) + kiểu `AttendanceEntry`

**Files:**
- Create: `src/types/attendance.ts`
- Create: `src/lesson/attendanceReport.ts`
- Modify: `src/types/index.ts` (thêm `export * from "./attendance.js";`)
- Test: `tests/attendanceReport.test.ts`

**Interfaces:**
- Consumes: `fold`, `splitLabel` (Task 1, `../lesson/parseReport.js`).
- Produces: `export interface AttendanceEntry { maNhom: string; maTinNhan: string; thoiGian: number; tenNV: string; noiLamViec: string; gioDenGio: number; gioDenPhut: number }`; `export interface AttendanceRoomResult { tenNV: string; noiLamViec: string; gioDen: { hour: number; minute: number } }`; `export function classifyAttendanceTitle(content: string): boolean`; `export function parseAttendanceMessage(content: string): AttendanceRoomResult | null`; `export type AttendanceSession = "morning" | "afternoon"`; `export function attendanceSessionOf(hour: number): AttendanceSession`; `export function isLateAttendance(session: AttendanceSession, hour: number, minute: number): boolean`.

- [ ] **Step 1: Tạo kiểu `AttendanceEntry`**

`src/types/attendance.ts`:
```ts
// VI PHẠM NỘI QUY THỰC TẬP — xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md

/** Một tin "BÁO CÁO ĐIỂM DANH" đã parse — thô, trước khi gộp theo (người, ngày). */
export interface AttendanceEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    tenNV: string;
    noiLamViec: string;
    gioDenGio: number;
    gioDenPhut: number;
}
```

Thêm vào `src/types/index.ts` (ngay sau `export * from "./attendance.js";`? — thứ tự bảng chữ cái: `attendance` đứng trước `chat`):
```ts
export * from "./attendance.js";
```

- [ ] **Step 2: Viết test (sẽ FAIL — module chưa tồn tại)**

`tests/attendanceReport.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceSessionOf, classifyAttendanceTitle, isLateAttendance, parseAttendanceMessage } from "../src/lesson/attendanceReport.js";

test("classifyAttendanceTitle", () => {
    assert.equal(classifyAttendanceTitle("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A"), true);
    assert.equal(classifyAttendanceTitle("báo cáo điểm danh"), true);
    assert.equal(classifyAttendanceTitle("BÁO CÁO CUỐI BUỔI"), false);
    assert.equal(classifyAttendanceTitle(""), false);
});

const REAL_MORNING = `BÁO CÁO ĐIỂM DANH
- Tên NV IT thực tập: Lưu Đình Phong
- Thời gian đến nơi: 8h25
- Nơi làm việc: LC QUANG TRUNG NGUYỄN HUỆ Q5`;

test("parseAttendanceMessage parses a real message (\"8h25\" -> hour 8, minute 25)", () => {
    assert.deepEqual(parseAttendanceMessage(REAL_MORNING), { tenNV: "Lưu Đình Phong", noiLamViec: "LC QUANG TRUNG NGUYỄN HUỆ Q5", gioDen: { hour: 8, minute: 25 } });
});

test("parseAttendanceMessage: \"14h00\" -> hour 14, minute 0", () => {
    const msg = REAL_MORNING.replace("8h25", "14h00");
    assert.deepEqual(parseAttendanceMessage(msg)?.gioDen, { hour: 14, minute: 0 });
});

test("parseAttendanceMessage: thiếu 1 trong 3 trường -> null", () => {
    assert.equal(parseAttendanceMessage("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A\n- Nơi làm việc: X"), null);
});

test("parseAttendanceMessage: giờ/phút không hợp lệ -> null", () => {
    const msg = REAL_MORNING.replace("8h25", "25h99");
    assert.equal(parseAttendanceMessage(msg), null);
});

test("attendanceSessionOf: giờ < 12 là sáng, >= 12 là chiều", () => {
    assert.equal(attendanceSessionOf(8), "morning");
    assert.equal(attendanceSessionOf(11), "morning");
    assert.equal(attendanceSessionOf(12), "afternoon");
    assert.equal(attendanceSessionOf(17), "afternoon");
});

test("isLateAttendance: trễ = sau ĐÚNG 8h00 (sáng) hoặc 14h00 (chiều)", () => {
    assert.equal(isLateAttendance("morning", 8, 0), false);
    assert.equal(isLateAttendance("morning", 8, 1), true);
    assert.equal(isLateAttendance("morning", 7, 59), false);
    assert.equal(isLateAttendance("afternoon", 14, 0), false);
    assert.equal(isLateAttendance("afternoon", 14, 1), true);
    assert.equal(isLateAttendance("afternoon", 13, 59), false);
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/attendanceReport.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 4: Viết `src/lesson/attendanceReport.ts`**

```ts
import { fold, splitLabel } from "./parseReport.js";

export interface AttendanceRoomResult {
    tenNV: string;
    noiLamViec: string;
    gioDen: { hour: number; minute: number };
}

export function classifyAttendanceTitle(content: string): boolean {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return fold(lines[0] ?? "") === "bao cao diem danh";
}

/** "8h25" -> { hour: 8, minute: 25 }; null nếu không đúng khuôn hoặc giờ/phút ngoài phạm vi hợp lệ. */
function parseHm(value: string): { hour: number; minute: number } | null {
    const m = /^(\d{1,2})h(\d{2})$/i.exec(value.trim());
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
}

export function parseAttendanceMessage(content: string): AttendanceRoomResult | null {
    const lines = content.normalize("NFC").split(/\r?\n/);
    let tenNV = "";
    let noiLamViec = "";
    let gioDen: { hour: number; minute: number } | null = null;
    for (const line of lines) {
        const parsed = splitLabel(line);
        if (!parsed) continue;
        if (parsed.label === "ten nv it thuc tap") tenNV = parsed.value;
        else if (parsed.label === "thoi gian den noi") gioDen = parseHm(parsed.value);
        else if (parsed.label === "noi lam viec") noiLamViec = parsed.value;
    }
    if (!tenNV || !noiLamViec || !gioDen) return null;
    return { tenNV, noiLamViec, gioDen };
}

export type AttendanceSession = "morning" | "afternoon";

export function attendanceSessionOf(hour: number): AttendanceSession {
    return hour < 12 ? "morning" : "afternoon";
}

/** Trễ = đến sau ĐÚNG 8h00 (sáng) hoặc 14h00 (chiều) — không phải 8h05/14h05 (đã xác nhận với người dùng, xem
 * design doc). Đúng 8h00/14h00 không tính trễ. */
export function isLateAttendance(session: AttendanceSession, hour: number, minute: number): boolean {
    const cutoffHour = session === "morning" ? 8 : 14;
    return hour > cutoffHour || (hour === cutoffHour && minute > 0);
}
```

- [ ] **Step 5: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/attendanceReport.test.ts`
Expected: PASS toàn bộ.

- [ ] **Step 6: Typecheck + toàn bộ test suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types/attendance.ts src/types/index.ts src/lesson/attendanceReport.ts tests/attendanceReport.test.ts
git commit -m "feat(lesson): parser tin nhắn VI PHẠM NỘI QUY (attendanceReport.ts)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Tính SỐ LẦN vi phạm từ toàn bộ lịch sử (`attendanceStreaks.ts`)

**Files:**
- Create: `src/lesson/attendanceStreaks.ts`
- Test: `tests/attendanceStreaks.test.ts`

**Interfaces:**
- Consumes: `AttendanceEntry` (Task 7, `../types/index.js`); `attendanceSessionOf`, `isLateAttendance`, `AttendanceSession` (Task 7, `./attendanceReport.js`); `vietnamDay` (`./time.js`, đã có sẵn).
- Produces: `export interface AttendanceDayRecord { tenNV: string; day: string; noiLamViec: string; morning: { hour: number; minute: number } | null; afternoon: { hour: number; minute: number } | null }`; `export function groupAttendanceByDay(entries: AttendanceEntry[]): AttendanceDayRecord[]`; `export function isDayViolated(r: AttendanceDayRecord): boolean`; `export function computeAttendanceCounts(records: AttendanceDayRecord[]): Map<string, number>` (key: `` `${tenNV}|${day}` ``).

- [ ] **Step 1: Viết test (sẽ FAIL — module chưa tồn tại)**

`tests/attendanceStreaks.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAttendanceCounts, groupAttendanceByDay, isDayViolated } from "../src/lesson/attendanceStreaks.js";
import type { AttendanceEntry } from "../src/types/index.js";

const DAY_MS = 24 * 3600_000;
const day0 = Date.UTC(2026, 8, 28, 1, 0); // 08:00 giờ VN, 2026-09-28

const e = (over: Partial<AttendanceEntry>): AttendanceEntry => ({
    maNhom: "g1", maTinNhan: "m", thoiGian: day0, tenNV: "A", noiLamViec: "X", gioDenGio: 8, gioDenPhut: 0,
    ...over,
});

test("groupAttendanceByDay: gộp theo (người, ngày), tách sáng/chiều theo giờ tự báo", () => {
    const records = groupAttendanceByDay([
        e({ maTinNhan: "m1", gioDenGio: 8, gioDenPhut: 25 }),
        e({ maTinNhan: "m2", thoiGian: day0 + 6 * 3600_000, gioDenGio: 14, gioDenPhut: 10 }),
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].morning, { hour: 8, minute: 25 });
    assert.deepEqual(records[0].afternoon, { hour: 14, minute: 10 });
});

test("groupAttendanceByDay: cùng 1 khung trong ngày báo lại (resend) chỉ giữ tin MỚI NHẤT theo thời gian gửi", () => {
    const records = groupAttendanceByDay([
        e({ maTinNhan: "m1", thoiGian: day0, gioDenGio: 8, gioDenPhut: 25 }),
        e({ maTinNhan: "m2", thoiGian: day0 + 60_000, gioDenGio: 8, gioDenPhut: 5 }),
    ]);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].morning, { hour: 8, minute: 5 });
});

test("isDayViolated: trễ sáng HOẶC chiều đều tính vi phạm ngày đó", () => {
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: { hour: 8, minute: 1 }, afternoon: null }), true);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: null, afternoon: { hour: 14, minute: 1 } }), true);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 0 } }), false);
    assert.equal(isDayViolated({ tenNV: "A", day: "d", noiLamViec: "X", morning: null, afternoon: null }), false);
});

test("computeAttendanceCounts: vi phạm liên tiếp (bỏ qua các ngày không có tin) vẫn cộng dồn, không reset", () => {
    // Giống ví dụ thật trong hướng dẫn: Giang trễ ngày 12/08 (lần 1), rồi trễ tiếp ngày 14/09 (lần 2) dù giữa
    // 2 ngày đó có rất nhiều ngày KHÔNG có tin điểm danh nào (không phải reset về 0).
    const records = groupAttendanceByDay([
        e({ tenNV: "Giang", maTinNhan: "m1", thoiGian: Date.UTC(2026, 7, 12, 7, 10), gioDenGio: 14, gioDenPhut: 10 }),
        e({ tenNV: "Giang", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 14, 7, 30), gioDenGio: 14, gioDenPhut: 30 }),
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("Giang|2026-08-12"), 1);
    assert.equal(counts.get("Giang|2026-09-14"), 2);
});

test("computeAttendanceCounts: một ngày ĐÚNG GIỜ reset về 0, ngày sau vi phạm lại tính lại từ 1", () => {
    const records = groupAttendanceByDay([
        e({ tenNV: "A", maTinNhan: "m1", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 30 }), // trễ -> 1
        e({ tenNV: "A", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 2, 1, 0), gioDenGio: 8, gioDenPhut: 0 }), // đúng giờ -> 0
        e({ tenNV: "A", maTinNhan: "m3", thoiGian: Date.UTC(2026, 8, 3, 1, 0), gioDenGio: 8, gioDenPhut: 10 }), // trễ -> 1 (không phải 3)
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("A|2026-09-02"), 0);
    assert.equal(counts.get("A|2026-09-03"), 1);
});

test("computeAttendanceCounts: 2 người khác nhau có bộ đếm độc lập", () => {
    const records = groupAttendanceByDay([
        e({ tenNV: "A", maTinNhan: "m1", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 30 }),
        e({ tenNV: "B", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 0 }),
    ]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("B|2026-09-01"), 0);
});

test("computeAttendanceCounts: tin đến KHÔNG đúng thứ tự mảng (gap-recovery) vẫn tính đúng theo thời gian thật", () => {
    const late = e({ tenNV: "A", maTinNhan: "m2", thoiGian: Date.UTC(2026, 8, 2, 1, 0), gioDenGio: 8, gioDenPhut: 30 });
    const early = e({ tenNV: "A", maTinNhan: "m1", thoiGian: Date.UTC(2026, 8, 1, 1, 0), gioDenGio: 8, gioDenPhut: 30 });
    // Mảng đầu vào cố tình để "late" (ngày 2) TRƯỚC "early" (ngày 1) trong mảng thô.
    const records = groupAttendanceByDay([late, early]);
    const counts = computeAttendanceCounts(records);
    assert.equal(counts.get("A|2026-09-01"), 1);
    assert.equal(counts.get("A|2026-09-02"), 2);
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/attendanceStreaks.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết `src/lesson/attendanceStreaks.ts`**

```ts
import { attendanceSessionOf, isLateAttendance } from "./attendanceReport.js";
import { vietnamDay } from "./time.js";
import type { AttendanceEntry } from "../types/index.js";

export interface AttendanceDayRecord {
    tenNV: string;
    day: string;
    noiLamViec: string;
    morning: { hour: number; minute: number } | null;
    afternoon: { hour: number; minute: number } | null;
}

/** Gộp tin thô theo (người, ngày), tách sáng/chiều theo giờ TỰ BÁO (không theo giờ gửi tin) — xem design doc.
 * Nếu cùng 1 khung trong ngày có nhiều tin (báo lại), chỉ giữ tin có `thoiGian` (giờ gửi) lớn nhất. */
export function groupAttendanceByDay(entries: AttendanceEntry[]): AttendanceDayRecord[] {
    const byKey = new Map<string, AttendanceDayRecord & { morningTs: number; afternoonTs: number }>();
    for (const en of entries) {
        const day = vietnamDay(en.thoiGian);
        const session = attendanceSessionOf(en.gioDenGio);
        const key = `${en.tenNV}|${day}`;
        let rec = byKey.get(key);
        if (!rec) {
            rec = { tenNV: en.tenNV, day, noiLamViec: en.noiLamViec, morning: null, afternoon: null, morningTs: -Infinity, afternoonTs: -Infinity };
            byKey.set(key, rec);
        }
        if (session === "morning" && en.thoiGian >= rec.morningTs) {
            rec.morning = { hour: en.gioDenGio, minute: en.gioDenPhut };
            rec.morningTs = en.thoiGian;
            rec.noiLamViec = en.noiLamViec;
        } else if (session === "afternoon" && en.thoiGian >= rec.afternoonTs) {
            rec.afternoon = { hour: en.gioDenGio, minute: en.gioDenPhut };
            rec.afternoonTs = en.thoiGian;
            rec.noiLamViec = en.noiLamViec;
        }
    }
    return [...byKey.values()].map(({ tenNV, day, noiLamViec, morning, afternoon }) => ({ tenNV, day, noiLamViec, morning, afternoon }));
}

export function isDayViolated(r: AttendanceDayRecord): boolean {
    return (r.morning !== null && isLateAttendance("morning", r.morning.hour, r.morning.minute)) || (r.afternoon !== null && isLateAttendance("afternoon", r.afternoon.hour, r.afternoon.minute));
}

/**
 * Tính lại SỐ LẦN (VI PHẠM) từ TOÀN BỘ lịch sử mỗi lần gọi — không lưu state tích luỹ, nên tin đến không đúng
 * thứ tự thời gian thật (khôi phục sau gián đoạn) không bao giờ tính sai (đúng nguyên tắc đã thống nhất khi
 * bàn về SỐ LẦN của BO SUNG/internet/netsupport). Với mỗi người: NGÀY VI PHẠM nối tiếp +1 từ ngày trước đó
 * (chỉ tính trên các ngày CÓ tin điểm danh — một ngày hoàn toàn không có tin bị bỏ qua, KHÔNG coi là reset);
 * NGÀY ĐÚNG GIỜ đưa về 0.
 */
export function computeAttendanceCounts(records: AttendanceDayRecord[]): Map<string, number> {
    const byPerson = new Map<string, AttendanceDayRecord[]>();
    for (const r of records) {
        const list = byPerson.get(r.tenNV) ?? [];
        list.push(r);
        byPerson.set(r.tenNV, list);
    }
    const counts = new Map<string, number>();
    for (const [tenNV, list] of byPerson) {
        const sorted = [...list].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
        let count = 0;
        for (const r of sorted) {
            count = isDayViolated(r) ? count + 1 : 0;
            counts.set(`${tenNV}|${r.day}`, count);
        }
    }
    return counts;
}
```

- [ ] **Step 4: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/attendanceStreaks.test.ts`
Expected: PASS toàn bộ (8 test).

- [ ] **Step 5: Typecheck + toàn bộ test suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lesson/attendanceStreaks.ts tests/attendanceStreaks.test.ts
git commit -m "feat(lesson): tính SỐ LẦN vi phạm điểm danh từ toàn bộ lịch sử

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Dựng dòng Excel cho VI PHẠM (`attendanceRows.ts`)

**Files:**
- Create: `src/lesson/attendanceRows.ts`
- Test: `tests/attendanceRows.test.ts`

**Interfaces:**
- Consumes: `AttendanceDayRecord`, `isDayViolated` (Task 8, `./attendanceStreaks.js`); `isLateAttendance` (Task 7, `./attendanceReport.js`); `WEEKDAY_EXCEL_TYPE1` (Task 2, `./statusReportLayout.js`); `FileLayout` (đã export sẵn); `Cell` (`../types/index.js`).
- Produces: `export const ATTENDANCE_LAYOUT: FileLayout` (`{ templateFile: "VI PHAM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 5, lastColumn: "L" }`); `export function buildAttendanceRows(records: AttendanceDayRecord[], counts: Map<string, number>, day: string): Array<Record<string, Cell>>`.

- [ ] **Step 1: Viết test (sẽ FAIL — module chưa tồn tại)**

`tests/attendanceRows.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTENDANCE_LAYOUT, buildAttendanceRows } from "../src/lesson/attendanceRows.js";
import type { AttendanceDayRecord } from "../src/lesson/attendanceStreaks.js";

test("ATTENDANCE_LAYOUT matches the real template's HANG NGAY sheet", () => {
    assert.deepEqual(ATTENDANCE_LAYOUT, { templateFile: "VI PHAM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 5, lastColumn: "L" });
});

const record = (over: Partial<AttendanceDayRecord>): AttendanceDayRecord => ({
    tenNV: "Lưu Đình Phong", day: "2026-09-23", noiLamViec: "LC Quang Trung Nguyễn Huệ", morning: null, afternoon: null,
    ...over,
});

test("buildAttendanceRows: người trễ sáng ra đúng 1 dòng, CHIỀU để trống, CHỨC VỤ luôn TTS", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 25 } })], new Map([["Lưu Đình Phong|2026-09-23", 1]]), "2026-09-23");
    assert.deepEqual(rows, [{ A: "Thứ 4", B: "23/09/2026", C: "Lưu Đình Phong", D: "TTS", E: "LC Quang Trung Nguyễn Huệ", F: "8:25", G: "", H: 1 }]);
});

test("buildAttendanceRows: trễ CẢ sáng lẫn chiều cùng ngày -> vẫn 1 dòng, cả 2 cột cùng điền", () => {
    const rows = buildAttendanceRows(
        [record({ morning: { hour: 8, minute: 10 }, afternoon: { hour: 14, minute: 30 } })],
        new Map([["Lưu Đình Phong|2026-09-23", 1]]),
        "2026-09-23",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].F, "8:10");
    assert.equal(rows[0].G, "14:30");
});

test("buildAttendanceRows: ngày hoàn toàn đúng giờ không ra dòng nào", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 0 } })], new Map(), "2026-09-23");
    assert.deepEqual(rows, []);
});

test("buildAttendanceRows: chỉ lấy đúng NGÀY mục tiêu, bỏ qua ngày khác trong `records`", () => {
    const rows = buildAttendanceRows(
        [record({ day: "2026-09-22", morning: { hour: 8, minute: 10 } }), record({ day: "2026-09-23", morning: { hour: 8, minute: 10 } })],
        new Map([["Lưu Đình Phong|2026-09-23", 1]]),
        "2026-09-23",
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].B, "23/09/2026");
});

test("buildAttendanceRows: đúng giờ sáng nhưng trễ chiều -> cột SÁNG để trống dù có tự báo giờ đến", () => {
    const rows = buildAttendanceRows([record({ morning: { hour: 8, minute: 0 }, afternoon: { hour: 14, minute: 5 } })], new Map([["Lưu Đình Phong|2026-09-23", 1]]), "2026-09-23");
    assert.equal(rows[0].F, "");
    assert.equal(rows[0].G, "14:05");
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/attendanceRows.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết `src/lesson/attendanceRows.ts`**

```ts
import { isLateAttendance } from "./attendanceReport.js";
import { isDayViolated, type AttendanceDayRecord } from "./attendanceStreaks.js";
import { WEEKDAY_EXCEL_TYPE1, type FileLayout } from "./statusReportLayout.js";
import type { Cell } from "../types/index.js";

export const ATTENDANCE_LAYOUT: FileLayout = { templateFile: "VI PHAM NOI QUY THUC TAP.xlsx", sheet: "HANG NGAY", firstDataRow: 4, totalRowBefore: 5, lastColumn: "L" };

const pad2 = (n: number): string => String(n).padStart(2, "0");
const fmtHm = (t: { hour: number; minute: number }): string => `${t.hour}:${pad2(t.minute)}`;
const fmtDate = (day: string): string => {
    const [y, m, d] = day.split("-");
    return `${d}/${m}/${y}`;
};

/** Chỉ tạo dòng cho NGƯỜI VI PHẠM trong đúng ngày `day` — ngày hoàn toàn đúng giờ không ra dòng nào (xem
 * spec). Cột SÁNG/CHIỀU chỉ điền giờ tự báo khi ĐÚNG KHUNG ĐÓ bị trễ; không dùng để hiển thị giờ đến đúng giờ.
 * Cột I/J/K/L (NỘI DUNG/GIẢI TRÌNH/CAM KẾT/GHI CHÚ) cố tình không có trong object trả về — để trống. */
export function buildAttendanceRows(records: AttendanceDayRecord[], counts: Map<string, number>, day: string): Array<Record<string, Cell>> {
    const [y, m, d] = day.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const thu = `Thứ ${WEEKDAY_EXCEL_TYPE1(weekday)}`;

    return records
        .filter((r) => r.day === day && isDayViolated(r))
        .sort((a, b) => a.tenNV.localeCompare(b.tenNV))
        .map((r) => ({
            A: thu,
            B: fmtDate(day),
            C: r.tenNV,
            D: "TTS",
            E: r.noiLamViec,
            F: r.morning && isLateAttendance("morning", r.morning.hour, r.morning.minute) ? fmtHm(r.morning) : "",
            G: r.afternoon && isLateAttendance("afternoon", r.afternoon.hour, r.afternoon.minute) ? fmtHm(r.afternoon) : "",
            H: counts.get(`${r.tenNV}|${day}`) ?? 0,
        }));
}
```

- [ ] **Step 4: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/attendanceRows.test.ts`
Expected: PASS toàn bộ (6 test).

- [ ] **Step 5: Typecheck + toàn bộ test suite**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lesson/attendanceRows.ts tests/attendanceRows.test.ts
git commit -m "feat(lesson): dựng dòng Excel cho VI PHẠM NỘI QUY

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: CLI `fill:attendance-report`

**Files:**
- Create: `src/cli/fill-attendance-report.ts`
- Modify: `package.json` (thêm script)

**Interfaces:**
- Consumes: `classifyAttendanceTitle`, `parseAttendanceMessage` (Task 7); `groupAttendanceByDay`, `computeAttendanceCounts` (Task 8); `ATTENDANCE_LAYOUT`, `buildAttendanceRows` (Task 9); `runFillTemplate` (Task 5); `freeFormFileName`, `readTemplateTitle`, `excelDateSerialForDay` (Task 2 / đã có sẵn); `todayVietnam` (`./time.js`, đã có sẵn); `MessageStore`; `AttendanceEntry`, `SourceMessage`.

- [ ] **Step 1: Viết `src/cli/fill-attendance-report.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { classifyAttendanceTitle, parseAttendanceMessage } from "../lesson/attendanceReport.js";
import { ATTENDANCE_LAYOUT, buildAttendanceRows } from "../lesson/attendanceRows.js";
import { computeAttendanceCounts, groupAttendanceByDay } from "../lesson/attendanceStreaks.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { excelDateSerialForDay, freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { AttendanceEntry, SourceMessage } from "../types/index.js";

/**
 * Điền sheet HANG NGAY của VI PHAM NOI QUY THUC TAP.xlsx từ tin "BÁO CÁO ĐIỂM DANH" — KHÔNG lùi ngày (khác
 * vệ sinh): mỗi lần chạy tính lại toàn bộ danh sách người vi phạm của HÔM NAY, SỐ LẦN (cột H) tính lại từ
 * toàn bộ lịch sử điểm danh. Độc lập với Phase/SessionKey — xem
 * docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md.
 *
 *   npm run fill:attendance-report -- [--now <unix ms>]
 */
async function loadAllMessages(): Promise<SourceMessage[]> {
    const store = new MessageStore();
    const all: SourceMessage[] = [];
    for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
    return all;
}

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const now = Number(option("--now") ?? Date.now());
    const day = todayVietnam(now);

    const messages = await loadAllMessages();
    const entries: AttendanceEntry[] = [];
    for (const msg of messages) {
        if (!classifyAttendanceTitle(msg.content)) continue;
        const parsed = parseAttendanceMessage(msg.content);
        if (!parsed) continue;
        entries.push({ maNhom: msg.groupId, maTinNhan: msg.msgId, thoiGian: msg.ts, tenNV: parsed.tenNV, noiLamViec: parsed.noiLamViec, gioDenGio: parsed.gioDen.hour, gioDenPhut: parsed.gioDen.minute });
    }

    const records = groupAttendanceByDay(entries);
    const counts = computeAttendanceCounts(records);
    const rows = buildAttendanceRows(records, counts, day);

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMM = day.slice(2, 4) + day.slice(5, 7);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = path.join(config.dataDir, "export", "trang-thai", yyMM, yyMMdd);
    fs.mkdirSync(outDir, { recursive: true });

    const title = readTemplateTitle(path.join(templatesSrc, ATTENDANCE_LAYOUT.templateFile), ATTENDANCE_LAYOUT.sheet);
    const hhmm = new Date(now + 7 * 3_600_000).toISOString().slice(11, 16).replace(":", "");
    const outName = freeFormFileName(title, day, hhmm);

    runFillTemplate({
        name: "attendance",
        templatesSrc,
        layout: ATTENDANCE_LAYOUT,
        outDir,
        outName,
        rows,
        headerCells: [{ ref: "L2", value: excelDateSerialForDay(day), numberFormat: "dd/mm/yyyy" }],
    });

    console.log(`[fill-attendance-report] ngày ${day}: ${rows.length} dòng vi phạm -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
```

- [ ] **Step 2: Thêm script vào `package.json`**

Ngay sau `"fill:cleaning-report"` (Task 6):
```json
        "fill:attendance-report": "tsx src/cli/fill-attendance-report.ts",
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 4: Chạy tay để kiểm tra thật (người dùng tự chạy, cần Excel cài trên máy)**

```
npm run fill:attendance-report -- --now <unix ms của một ngày có tin "BÁO CÁO ĐIỂM DANH" trễ giờ trong data/*.json>
```
Mở file sinh ra, kiểm tra: chỉ người trễ mới có dòng, cột VI PHẠM đúng số lần, CHỨC VỤ luôn "TTS", cột I/J/K/L trống.

- [ ] **Step 5: Commit**

```bash
git add src/cli/fill-attendance-report.ts package.json
git commit -m "feat(cli): thêm lệnh fill:attendance-report

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Gắn 2 báo cáo vào `bot:runner` ở cấp cycle

**Files:**
- Modify: `src/runner/cycle.ts` (thêm `buildExtras` vào `CycleDeps`, gọi 1 lần/cycle)
- Modify: `src/runner/steps.ts` (triển khai `buildExtras` trong `realDeps`)
- Test: `tests/cycle.test.ts`

**Interfaces:**
- Consumes: `runScript`, `tail` (đã là hàm nội bộ có sẵn trong `src/runner/steps.ts`, không cần import mới).
- Produces: `CycleDeps.buildExtras(): Promise<string[]>` — trả về danh sách cảnh báo (rỗng nếu cả 2 script chạy OK); KHÔNG BAO GIỜ throw (mọi lỗi được `realDeps` tự bắt thành warning trong mảng trả về). `runCycle` gọi đúng 1 lần/cycle, sau vòng lặp build session, độc lập với việc có session nào dirty; lỗi trong lúc gọi (nếu hợp đồng "không throw" bị vi phạm) chỉ vào `summary.warnings`, không đặt `summary.ok = false`.

- [ ] **Step 1: Sửa factory `harness()` trong `tests/cycle.test.ts` để nhận thêm `buildExtras`**

`tests/cycle.test.ts` dựng `CycleDeps` giả qua một hàm `harness(opts)` (dòng 12-48). Thêm `buildExtras` vào cả tham số `opts` và vào object `deps` trả về (mặc định là một hàm không làm gì, trả `[]`):

```ts
function harness(opts: {
    messages?: SourceMessage[];
    scraped?: SourceMessage[];
    built?: string[];
    scrape?: () => Promise<QueueRunResult>;
    build?: (s: SessionKey) => Promise<BuildResult>;
    buildExtras?: () => Promise<string[]>;
} = {}) {
    const messages = [...(opts.messages ?? [])];
    let built = new Set(opts.built ?? []);
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
                return { status: "done", targets: ["A"], failed: [], gaveUp: [], outcomes: [] };
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
        buildExtras: opts.buildExtras ?? (async () => []),
        built: { read: () => new Set(built), write: (keys) => void (built = new Set(keys)) },
    };
    return { deps, calls, get built() { return built; } };
}
```

- [ ] **Step 2: Chạy toàn bộ test hiện có trong file, xác nhận vẫn PASS sau khi thêm field mặc định**

Run: `node --import tsx --test tests/cycle.test.ts`
Expected: PASS toàn bộ test đã có (thêm field mặc định không đổi hành vi của chúng).

- [ ] **Step 3: Viết 3 test mới cho `buildExtras` (sẽ FAIL cho tới Task này xong — `CycleDeps`/`runCycle` chưa gọi `buildExtras`)**

Thêm vào cuối `tests/cycle.test.ts`:

```ts
test("runCycle calls buildExtras exactly once, even with zero dirty sessions", async () => {
    let calls = 0;
    const h = harness({ buildExtras: async () => { calls++; return []; } });
    await runCycle(h.deps);
    assert.equal(calls, 1);
});

test("runCycle: a buildExtras failure becomes a warning, does not fail the cycle", async () => {
    const h = harness({ buildExtras: async () => { throw new Error("Excel COM lỗi"); } });
    const s = await runCycle(h.deps);
    assert.equal(s.ok, true);
    assert.ok(s.warnings.some((w) => w.includes("Excel COM lỗi")));
});

test("runCycle: buildExtras returning warnings surfaces them in summary.warnings", async () => {
    const h = harness({ buildExtras: async () => ["fill-vệ sinh: thoát mã 1"] });
    const s = await runCycle(h.deps);
    assert.ok(s.warnings.includes("fill-vệ sinh: thoát mã 1"));
});
```

- [ ] **Step 4: Chạy test, xác nhận FAIL**

Run: `node --import tsx --test tests/cycle.test.ts`
Expected: FAIL — lỗi biên dịch TypeScript ("buildExtras" không tồn tại trên `CycleDeps`) hoặc test không tìm thấy hành vi mong đợi.

- [ ] **Step 5: Thêm `buildExtras` vào `CycleDeps` và gọi trong `runCycle` (`src/runner/cycle.ts`)**

Thêm vào interface `CycleDeps` (sau `build`):
```ts
    build(session: SessionKey): Promise<BuildResult>;
    /** Chạy 2 báo cáo KHÔNG thuộc Phase/SessionKey nào (VỆ SINH, VI PHẠM) — đúng 1 lần/cycle, bất kể có
     * session nào dirty hay không. KHÔNG BAO GIỜ throw — mọi lỗi tự trở thành 1 phần tử cảnh báo trong mảng
     * trả về (xem docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md). */
    buildExtras(): Promise<string[]>;
    built: { read(): Set<string>; write(keys: Set<string>): void };
```

Sửa `runCycle`, thêm ngay sau vòng lặp `for (const session of sessions) { ... }` (vẫn bên trong khối `try` chính, TRƯỚC `} catch (err) {`):
```ts
        try {
            const extraWarnings = await deps.buildExtras();
            summary.warnings.push(...extraWarnings);
        } catch (err) {
            // Hợp đồng buildExtras() là không throw; bọc thêm ở đây phòng khi cài đặt tương lai vi phạm hợp
            // đồng đó — một lỗi ở đây tuyệt đối không được làm sai summary.ok của cả cycle.
            summary.warnings.push(`buildExtras: ${(err as Error).message}`);
        }
```

- [ ] **Step 6: Triển khai `buildExtras` trong `realDeps` (`src/runner/steps.ts`)**

Thêm vào object trả về của `realDeps` (sau `build: buildSession,`):
```ts
        build: buildSession,
        buildExtras: async () => {
            const warnings: string[] = [];
            const scripts: Array<[string, string]> = [
                ["fill-cleaning-report.ts", "vệ sinh"],
                ["fill-attendance-report.ts", "vi phạm"],
            ];
            for (const [script, label] of scripts) {
                const r = await runScript(script, []);
                if (r.code !== 0) warnings.push(`fill-${label}: thoát mã ${r.code}: ${tail(r.output)}`);
            }
            return warnings;
        },
        built: { read: () => readBuilt() ?? new Set<string>(), write: (keys) => writeBuilt(keys) },
```
(`runScript`/`tail` đã có sẵn ở đầu file `steps.ts`, không cần import mới.)

- [ ] **Step 7: Chạy lại test, xác nhận PASS**

Run: `node --import tsx --test tests/cycle.test.ts`
Expected: PASS toàn bộ (kể cả các test cũ đã có trong file, vẫn PASS sau khi thêm field `buildExtras` vào factory function).

- [ ] **Step 8: Typecheck + toàn bộ test suite**

Run: `npm run typecheck && npm test`
Expected: PASS toàn bộ — đặc biệt kiểm tra không còn nơi nào khác dựng `CycleDeps` thủ công mà quên field `buildExtras` (TypeScript sẽ tự báo nếu có).

- [ ] **Step 9: Commit**

```bash
git add src/runner/cycle.ts src/runner/steps.ts tests/cycle.test.ts
git commit -m "feat(runner): chạy fill:cleaning-report + fill:attendance-report mỗi cycle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Sau khi xong cả 11 task

1. Chạy toàn bộ: `npm run typecheck && npm test` — phải PASS sạch.
2. Chạy tay Task 6/Task 10's Step 4 (kiểm tra Excel thật) nếu chưa làm.
3. Test ở nhóm "bot test" thật (gửi 1 tin "BÁO CÁO CUỐI BUỔI" và 1 tin "BÁO CÁO ĐIỂM DANH" trễ giờ vào nhóm đó, chờ `bot:runner` chạy 1 cycle, kiểm tra 2 file mới xuất hiện đúng trong `data/export/trang-thai/<yyMM>/<yyMMdd>/`) — **người dùng tự làm bước này** (agent không tự khởi động/gửi tin qua bot).
4. Khi có tên nhóm Zalo thật cho vệ sinh/điểm danh, thêm vào `config.targets` — không cần đổi code gì thêm (đã nêu trong spec).
