# Status Report Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From `output/output.json` (the already-extracted, override-applied session reports), fill 5 of the 10 new non-macro Excel status templates directly (no VBA), always export all 10 files, and persist a consecutive-fault streak counter for Internet/NetSupport across runs.

**Architecture:** Three new pure-logic modules under `src/lesson/` (fault streaks, per-file row selection, layout constants + spec assembly) feed one thin CLI (`src/cli/fill-status-reports.ts`) that copies the 5 data-less templates as-is, then hands one JSON spec to a new PowerShell script that drives Excel COM to insert/delete rows (so existing `COUNTIF`/`SUM` ranges auto-adjust) and write values, mirroring how `fill-report.ts` + `fill-template.ps1` already work for the `.xlsm` flow.

**Tech Stack:** TypeScript (`tsx`), `node:test`, PowerShell + Excel COM (`Excel.Application`), the `xlsx` npm package (read-only, for the template-drift contract test).

**Spec:** `docs/superpowers/specs/2026-09-28-status-report-fill-design.md`

## Global Constraints

- Read-only source: reports come from `output/output.json` (the `Report[]` `extract:reports` already wrote, post-override). No re-extraction from `data/<groupId>.json`.
- 5 in-scope files: BO SUNG MAY TINH, TINH TRANG LOA, TINH TRANG LOI INTERNET, TINH TRANG LOI MAY TINH (sheet `2409` only), TINH TRANG LOI NETSUPPORT. 5 out-of-scope files are copied unchanged: THAY THE MAY TINH, TINH TRANG LOI DIEN, TINH TRANG LOI PHAN MEM, TINH TRANG VE SINH PHONG MAY, VI PHAM NOI QUY THUC TAP.
- Output: `data/export/trang-thai/<same file name as the template>.xlsx`, overwritten every run — no per-day file, no new sheet per day.
- `PM` columns, wherever they exist in the 5 in-scope files, always stay blank in the output (the room name is still used internally as the streak/row identity, just never written to a cell).
- `SM BỔ SUNG` (máy tính) and every column with no data source stay blank — never invent a value.
- Excel COM only for the 5 in-scope files (`New-Object -ComObject Excel.Application`, `SaveAs` format `51` = `xlOpenXMLWorkbook`, since these are `.xlsx` with no VBA project — never format `52`, which is for `.xlsm`).
- No change to `bot:runner`, `bot:chat`, `bot:watch`, or the existing `.xlsm` flow (`fill-report.ts`, `fill-template.ps1`) in this plan.

## Review Focus

- A report whose `data.phongMay` is `null` (room line missing/unparseable) must produce **no row** in any of the 5 files, not a row with a blank PM — otherwise the streak key and BO SUNG's PM-name column would silently hold nonsense.
- BO SUNG's boundary: `thieu - loi === 0` (exactly zero) must **not** produce a row (spec says `> 0`, not `>= 0`); a negative result (more lỗi than thiếu) must not either.
- Máy tính XẾP LOẠI boundaries: `loi` = 0, 5, 6, 9, 10 must each land in the band the spec's table names (A, B, B, C, D respectively) — off-by-one here silently misclassifies a school's severity.
- Re-running the CLI on the **same** `output.json` twice in a row (the natural way someone tests it) must not double-increment the Internet/NetSupport streak — `applyStreaks` keys idempotency off `lastMsgId`, and this needs a test that calls it twice with identical input.
- If the PowerShell/Excel step fails (e.g., Excel not installed, file locked), the streak state file must **not** be updated — otherwise a failed run's fault counts still get baked in and the next real run computes from a lie.

---

### Task 1: Fault-streak persistent counter

**Files:**
- Create: `src/lesson/faultStreaks.ts`
- Test: `tests/faultStreaks.test.ts`

**Interfaces:**
- Consumes: `Report` (from `../types/index.js`: `maNhom`, `maTinNhan`, `thoiGian`, `data.phongMay`, `data.coSoVatChat[].{loai,xepLoai}`), `writeFileAtomic` (`../core/atomicWrite.js`), `config.dataDir` (`../../config.js`).
- Produces: `type FaultCategory = "internet" | "netsupport"`; `interface StreakEntry { count: number; lastMsgId: string; lastTs: number }`; `type StreakState = Record<string, StreakEntry>`; `streakKey(maNhom: string, phongMay: string, category: FaultCategory): string`; `interface ApplyStreaksResult { state: StreakState; perMessage: Map<string, number> }` (`perMessage` key is `` `${maTinNhan}|${category}` ``, value is the streak count as of that specific report); `applyStreaks(state: StreakState, reports: Report[], categories?: FaultCategory[]): ApplyStreaksResult`; `readStreaks(file?: string): StreakState`; `writeStreaks(state: StreakState, file?: string): void`; `DEFAULT_STREAKS_PATH: string`. Task 2 and Task 4 both import from here.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/faultStreaks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyStreaks, streakKey, type StreakState } from "../src/lesson/faultStreaks.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

const facility = (loai: CoSoVatChat["loai"], xepLoai: string | null): CoSoVatChat => ({ loai, xepLoai });

function report(over: Partial<Report> & { thoiGian: number; maTinNhan: string }, facilities: CoSoVatChat[]): Report {
    return {
        maTinNhan: over.maTinNhan,
        maNguoiGui: "u1",
        maNhom: over.maNhom ?? "g1",
        thoiGian: over.thoiGian,
        loaiBaoCao: "DauBuoi",
        data: {
            maTrangThai: 1,
            maPhong: null,
            truong: { capHoc: "LC", tenRieng: "X", coSo: null },
            khuVuc: "TĐ",
            phongMay: over.data?.phongMay === undefined ? "PM1" : over.data.phongMay,
            giaoVien: "GV",
            coSoVatChat: facilities,
        },
    };
}

test("a room reported K twice in a row reaches count 2, then a T report resets it to 0", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const r2 = report({ maTinNhan: "m2", thoiGian: 2000 }, [facility("Internet", "K")]);
    const r3 = report({ maTinNhan: "m3", thoiGian: 3000 }, [facility("Internet", "T")]);

    const a = applyStreaks({}, [r1]);
    assert.equal(a.perMessage.get("m1|internet"), 1);
    const b = applyStreaks(a.state, [r2]);
    assert.equal(b.perMessage.get("m2|internet"), 2);
    const c = applyStreaks(b.state, [r3]);
    assert.equal(c.perMessage.get("m3|internet"), 0);
});

test("a report with a K reported on a later timestamp still increments even out of array order", () => {
    const early = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const late = report({ maTinNhan: "m2", thoiGian: 2000 }, [facility("Internet", "K")]);
    // handed in reverse order; applyStreaks must sort by thoiGian itself
    const r = applyStreaks({}, [late, early]);
    assert.equal(r.perMessage.get("m1|internet"), 1);
    assert.equal(r.perMessage.get("m2|internet"), 2);
});

test("a report with xepLoai null for that category is skipped: the streak is untouched", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const r2 = report({ maTinNhan: "m2", thoiGian: 2000 }, [facility("Internet", null)]);
    const a = applyStreaks({}, [r1]);
    const b = applyStreaks(a.state, [r2]);
    assert.equal(b.perMessage.has("m2|internet"), false);
    assert.equal(b.state[streakKey("g1", "PM1", "internet")].count, 1);
});

test("a report with no phongMay never touches the streak", () => {
    const r = report({ maTinNhan: "m1", thoiGian: 1000, data: { phongMay: null } as never }, [facility("Internet", "K")]);
    const a = applyStreaks({}, [r]);
    assert.equal(a.perMessage.size, 0);
    assert.deepEqual(a.state, {});
});

test("re-running with the exact same report (same msgId) does not double-count", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const first = applyStreaks({}, [r1]);
    assert.equal(first.perMessage.get("m1|internet"), 1);
    const again = applyStreaks(first.state, [r1]);
    assert.equal(again.perMessage.get("m1|internet"), 1);
    assert.deepEqual(again.state, first.state);
});

test("internet and netsupport streaks for the same room are independent", () => {
    const r = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K"), facility("NetSupport", "T")]);
    const a = applyStreaks({}, [r]);
    assert.equal(a.perMessage.get("m1|internet"), 1);
    assert.equal(a.perMessage.get("m1|netsupport"), 0);
});

test("two different rooms of the same group get separate streaks", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000, data: { phongMay: "PM1" } as never }, [facility("Internet", "K")]);
    const r2 = report({ maTinNhan: "m2", thoiGian: 1000, data: { phongMay: "PM2" } as never }, [facility("Internet", "K")]);
    const a = applyStreaks({}, [r1, r2]);
    assert.equal(a.perMessage.get("m1|internet"), 1);
    assert.equal(a.perMessage.get("m2|internet"), 1);
    assert.equal(Object.keys(a.state).length, 2);
});

test("streakKey ignores case and surrounding whitespace in the room name", () => {
    assert.equal(streakKey("g1", "pm1", "internet"), streakKey("g1", " PM1 ", "internet"));
});

test("readStreaks/writeStreaks round-trip through a real file, and a missing file reads as empty", () => {
    const os = require("node:os") as typeof import("node:os");
    const path = require("node:path") as typeof import("node:path");
    const fs = require("node:fs") as typeof import("node:fs");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "streaks-")), "s.json");
    const { readStreaks, writeStreaks } = require("../src/lesson/faultStreaks.js") as typeof import("../src/lesson/faultStreaks.js");
    assert.deepEqual(readStreaks(file), {});
    const state: StreakState = { "g1|PM1|internet": { count: 3, lastMsgId: "m1", lastTs: 1000 } };
    writeStreaks(state, file);
    assert.deepEqual(readStreaks(file), state);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/faultStreaks.test.ts`
Expected: FAIL — `Cannot find module '../src/lesson/faultStreaks.js'`.

- [ ] **Step 3: Implement**

```typescript
// src/lesson/faultStreaks.ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { Report } from "../types/index.js";

export type FaultCategory = "internet" | "netsupport";

export interface StreakEntry {
    count: number;
    lastMsgId: string;
    lastTs: number;
}

export type StreakState = Record<string, StreakEntry>;

export const DEFAULT_STREAKS_PATH = path.join(config.dataDir, ".status-streaks.json");

const CATEGORY_FACILITY: Record<FaultCategory, "Internet" | "NetSupport"> = { internet: "Internet", netsupport: "NetSupport" };
const DEFAULT_CATEGORIES: FaultCategory[] = ["internet", "netsupport"];

export function streakKey(maNhom: string, phongMay: string, category: FaultCategory): string {
    return `${maNhom}|${phongMay.trim().toUpperCase()}|${category}`;
}

export interface ApplyStreaksResult {
    state: StreakState;
    /** key: `${maTinNhan}|${category}` -> streak count as of that specific report. */
    perMessage: Map<string, number>;
}

/**
 * Xử lý `reports` theo thứ tự `thoiGian` tăng dần (bất kể thứ tự truyền vào), cập nhật số lần liên tiếp bị "K"
 * cho từng (nhóm, phòng, loại). Không sửa `state` truyền vào — trả về bản mới. Một báo cáo không có `phongMay`,
 * hoặc không có `xepLoai` hợp lệ cho loại đang xét, bị bỏ qua với loại đó (giữ nguyên số cũ, không ghi vào `perMessage`).
 * Đã xử lý một `maTinNhan` cho một khoá rồi (khớp `lastMsgId` đã lưu) thì không cộng lại — cho phép chạy lại an toàn.
 */
export function applyStreaks(state: StreakState, reports: Report[], categories: FaultCategory[] = DEFAULT_CATEGORIES): ApplyStreaksResult {
    const next: StreakState = { ...state };
    const perMessage = new Map<string, number>();
    const sorted = [...reports].sort((a, b) => a.thoiGian - b.thoiGian);

    for (const r of sorted) {
        if (!r.data.phongMay) continue;
        for (const category of categories) {
            const facility = r.data.coSoVatChat.find((f) => f.loai === CATEGORY_FACILITY[category]);
            if (!facility || facility.xepLoai === null) continue;

            const key = streakKey(r.maNhom, r.data.phongMay, category);
            const prev = next[key];
            if (prev && prev.lastMsgId === r.maTinNhan) {
                perMessage.set(`${r.maTinNhan}|${category}`, prev.count);
                continue;
            }
            const count = facility.xepLoai === "K" ? (prev?.count ?? 0) + 1 : 0;
            next[key] = { count, lastMsgId: r.maTinNhan, lastTs: r.thoiGian };
            perMessage.set(`${r.maTinNhan}|${category}`, count);
        }
    }
    return { state: next, perMessage };
}

function isStreakEntry(v: unknown): v is StreakEntry {
    return typeof v === "object" && v !== null && typeof (v as StreakEntry).count === "number" && typeof (v as StreakEntry).lastMsgId === "string" && typeof (v as StreakEntry).lastTs === "number";
}

function isStreakState(v: unknown): v is StreakState {
    return typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every(isStreakEntry);
}

/** Missing or unreadable file reads as empty; a wrongly-shaped file also reads as empty rather than throwing. */
export function readStreaks(file: string = DEFAULT_STREAKS_PATH): StreakState {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return isStreakState(v) ? v : {};
    } catch {
        return {};
    }
}

export function writeStreaks(state: StreakState, file: string = DEFAULT_STREAKS_PATH): void {
    writeFileAtomic(file, JSON.stringify(state, null, 2));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/faultStreaks.test.ts`
Expected: all tests pass (10/10).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lesson/faultStreaks.ts tests/faultStreaks.test.ts
git commit -m "feat(status-reports): persistent consecutive-fault streak counter (internet, netsupport)"
```

---

### Task 2: Per-file row selection

**Files:**
- Create: `src/lesson/statusRows.ts`
- Test: `tests/statusRows.test.ts`

**Interfaces:**
- Consumes: `Report`, `Cell` (`../types/index.js`); `Map<string, number>` `perMessage` from Task 1's `applyStreaks` (key `` `${maTinNhan}|${category}` ``).
- Produces: `mayTinhGrade(loi: number | null): "A" | "B" | "C" | "D" | null`; `buildBoSungRows(reports: Report[]): Array<Record<string, Cell>>`; `buildLoaRows(reports: Report[]): Array<Record<string, Cell>>`; `buildInternetRows(reports: Report[], perMessage: Map<string, number>): Array<Record<string, Cell>>`; `buildNetSupportRows(reports: Report[], perMessage: Map<string, number>): Array<Record<string, Cell>>`; `buildMayTinhRows(reports: Report[]): Array<Record<string, Cell>>`. Each returned row is keyed by **spreadsheet column letter** (e.g. `{ A: 1, B: "LC", J: "PM1" }`) — Task 3 uses these letters directly, no separate name-to-letter map exists anywhere.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/statusRows.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBoSungRows, buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows, mayTinhGrade } from "../src/lesson/statusRows.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

const facility = (loai: CoSoVatChat["loai"], xepLoai: string | null, soLuong?: CoSoVatChat["soLuong"]): CoSoVatChat => ({ loai, xepLoai, soLuong });

function report(id: string, phongMay: string | null, facilities: CoSoVatChat[], over: Partial<Report["data"]> = {}): Report {
    return {
        maTinNhan: id,
        maNguoiGui: "u1",
        maNhom: "g1",
        thoiGian: 1000,
        loaiBaoCao: "DauBuoi",
        data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "CHU VĂN AN", coSo: null }, khuVuc: "BTAN", phongMay, giaoVien: "GV", coSoVatChat: facilities, ...over },
    };
}

test("mayTinhGrade: 0 is A, 1-5 is B, 6-9 is C, 10+ is D, null stays null", () => {
    assert.equal(mayTinhGrade(0), "A");
    assert.equal(mayTinhGrade(1), "B");
    assert.equal(mayTinhGrade(5), "B");
    assert.equal(mayTinhGrade(6), "C");
    assert.equal(mayTinhGrade(9), "C");
    assert.equal(mayTinhGrade(10), "D");
    assert.equal(mayTinhGrade(25), "D");
    assert.equal(mayTinhGrade(null), null);
});

test("BO SUNG: a room with thieu - loi > 0 gets a row naming the room, quantities equal to thieu", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 3 }, { loai: "Loi", so: 1 }])]);
    const rows = buildBoSungRows([r]);
    assert.deepEqual(rows, [{ A: 1, B: "LC", C: "CHU VĂN AN", D: "BTAN", J: "PM1", L: 3, M: 3 }]);
});

test("BO SUNG: thieu - loi exactly 0, or negative, or either missing, produces no row", () => {
    const equal = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 2 }, { loai: "Loi", so: 2 }])]);
    const negative = report("m2", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 1 }, { loai: "Loi", so: 3 }])]);
    const noThieu = report("m3", "PM1", [facility("MayTinh", "A", [{ loai: "Loi", so: 0 }])]);
    assert.deepEqual(buildBoSungRows([equal, negative, noThieu]), []);
});

test("BO SUNG: a report with no phongMay produces no row", () => {
    const r = report("m1", null, [facility("MayTinh", "A", [{ loai: "Thieu", so: 5 }, { loai: "Loi", so: 0 }])]);
    assert.deepEqual(buildBoSungRows([r]), []);
});

test("BO SUNG: STT numbers only the rows that qualify, in the order given", () => {
    const skip = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0 }])]);
    const a = report("m2", "PM2", [facility("MayTinh", "A", [{ loai: "Thieu", so: 1 }, { loai: "Loi", so: 0 }])]);
    const b = report("m3", "PM3", [facility("MayTinh", "A", [{ loai: "Thieu", so: 2 }, { loai: "Loi", so: 0 }])]);
    const rows = buildBoSungRows([skip, a, b]);
    assert.deepEqual(rows.map((r) => r.A), [1, 2]);
    assert.deepEqual(rows.map((r) => r.J), ["PM2", "PM3"]);
});

test("LOA: a room with an AmThanh grade gets a row with that grade; PM is never written", () => {
    const r = report("m1", "PM1", [facility("AmThanh", "K")]);
    assert.deepEqual(buildLoaRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: "K" }]);
});

test("LOA: no AmThanh grade (missing facility or null xepLoai) produces no row", () => {
    const missing = report("m1", "PM1", []);
    const nullGrade = report("m2", "PM1", [facility("AmThanh", null)]);
    assert.deepEqual(buildLoaRows([missing, nullGrade]), []);
});

test("INTERNET: XẾP LOẠI is the raw T/B/K, SỐ LẦN comes from perMessage keyed by internet", () => {
    const r = report("m1", "PM1", [facility("Internet", "K")]);
    const perMessage = new Map([["m1|internet", 2]]);
    assert.deepEqual(buildInternetRows([r], perMessage), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: 2, I: "K" }]);
});

test("INTERNET: a message missing from perMessage defaults SỐ LẦN to 0", () => {
    const r = report("m1", "PM1", [facility("Internet", "T")]);
    assert.deepEqual(buildInternetRows([r], new Map()), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: 0, I: "T" }]);
});

test("NETSUPPORT: same shape as INTERNET, keyed by netsupport in perMessage", () => {
    const r = report("m1", "PM1", [facility("NetSupport", "K")]);
    const perMessage = new Map([["m1|netsupport", 5]]);
    assert.deepEqual(buildNetSupportRows([r], perMessage), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", G: 5, I: "K" }]);
});

test("MÁY TÍNH: SM LỖI, SM THIẾU, XẾP LOẠI (by count) and GHI CHÚ (the lỗi note) are filled", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 2 }, { loai: "Loi", so: 7, ghiChu: "máy 5 hỏng nguồn" }])]);
    assert.deepEqual(buildMayTinhRows([r]), [{ A: 1, B: "CHU VĂN AN", C: "BTAN", F: 7, G: 2, K: "C", N: "máy 5 hỏng nguồn" }]);
});

test("MÁY TÍNH: a report without a MayTinh entry at all produces no row", () => {
    const r = report("m1", "PM1", []);
    assert.deepEqual(buildMayTinhRows([r]), []);
});

test("MÁY TÍNH: no ghi chú (undefined) becomes null, not the string 'undefined'", () => {
    const r = report("m1", "PM1", [facility("MayTinh", "A", [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0 }])]);
    assert.equal(buildMayTinhRows([r])[0].N, null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/statusRows.test.ts`
Expected: FAIL — `Cannot find module '../src/lesson/statusRows.js'`.

- [ ] **Step 3: Implement**

```typescript
// src/lesson/statusRows.ts
import type { Cell, CoSoVatChat, Report } from "../types/index.js";

/** Đọc `Thiếu`/`Lỗi` (và ghi chú của Lỗi) từ mục `soLuong` của một cơ sở vật chất; thiếu mục nào trả về null. */
function quantity(facility: CoSoVatChat | undefined, loai: "Thieu" | "Loi"): { so: number | null; ghiChu: string | null } {
    const entry = facility?.soLuong?.find((s) => s.loai === loai);
    return { so: entry?.so ?? null, ghiChu: entry?.ghiChu ?? null };
}

const findFacility = (r: Report, loai: CoSoVatChat["loai"]): CoSoVatChat | undefined => r.data.coSoVatChat.find((f) => f.loai === loai);

/** 0 máy lỗi = A (ổn định), 1-5 = B, 6-9 = C, >=10 = D — đúng bảng CHÚ GIẢI của file mẫu MÁY TÍNH. */
export function mayTinhGrade(loi: number | null): "A" | "B" | "C" | "D" | null {
    if (loi === null) return null;
    if (loi === 0) return "A";
    if (loi <= 5) return "B";
    if (loi <= 9) return "C";
    return "D";
}

export function buildBoSungRows(reports: Report[]): Array<Record<string, Cell>> {
    const rows: Array<Record<string, Cell>> = [];
    let stt = 0;
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const mayTinh = findFacility(r, "MayTinh");
        const thieu = quantity(mayTinh, "Thieu").so;
        const loi = quantity(mayTinh, "Loi").so;
        if (thieu === null || loi === null || thieu - loi <= 0) continue;
        stt++;
        rows.push({ A: stt, B: r.data.truong?.capHoc ?? "", C: r.data.truong?.tenRieng ?? "", D: r.data.khuVuc ?? "", J: r.data.phongMay, L: thieu, M: thieu });
    }
    return rows;
}

export function buildLoaRows(reports: Report[]): Array<Record<string, Cell>> {
    const rows: Array<Record<string, Cell>> = [];
    let stt = 0;
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const amThanh = findFacility(r, "AmThanh");
        if (!amThanh || amThanh.xepLoai === null) continue;
        stt++;
        rows.push({ A: stt, B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", G: amThanh.xepLoai });
    }
    return rows;
}

function buildNetStatusRows(reports: Report[], facilityLoai: "Internet" | "NetSupport", category: "internet" | "netsupport", perMessage: Map<string, number>): Array<Record<string, Cell>> {
    const rows: Array<Record<string, Cell>> = [];
    let stt = 0;
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const facility = findFacility(r, facilityLoai);
        if (!facility || facility.xepLoai === null) continue;
        stt++;
        const soLan = perMessage.get(`${r.maTinNhan}|${category}`) ?? 0;
        rows.push({ A: stt, B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", G: soLan, I: facility.xepLoai });
    }
    return rows;
}

export function buildInternetRows(reports: Report[], perMessage: Map<string, number>): Array<Record<string, Cell>> {
    return buildNetStatusRows(reports, "Internet", "internet", perMessage);
}

export function buildNetSupportRows(reports: Report[], perMessage: Map<string, number>): Array<Record<string, Cell>> {
    return buildNetStatusRows(reports, "NetSupport", "netsupport", perMessage);
}

export function buildMayTinhRows(reports: Report[]): Array<Record<string, Cell>> {
    const rows: Array<Record<string, Cell>> = [];
    let stt = 0;
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const mayTinh = findFacility(r, "MayTinh");
        if (!mayTinh) continue;
        const loi = quantity(mayTinh, "Loi");
        const thieu = quantity(mayTinh, "Thieu");
        stt++;
        rows.push({ A: stt, B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", F: loi.so, G: thieu.so, K: mayTinhGrade(loi.so), N: loi.ghiChu });
    }
    return rows;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/statusRows.test.ts`
Expected: all tests pass (13/13).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lesson/statusRows.ts tests/statusRows.test.ts
git commit -m "feat(status-reports): per-file row selection from Report[] (BO SUNG, LOA, INTERNET, NETSUPPORT, MÁY TÍNH)"
```

---

### Task 3: Layout constants and fill-spec assembly

**Files:**
- Create: `src/lesson/statusReportLayout.ts`
- Test: `tests/statusReportLayout.test.ts`

**Interfaces:**
- Consumes: `buildBoSungRows`, `buildInternetRows`, `buildLoaRows`, `buildMayTinhRows`, `buildNetSupportRows` (Task 2); `Report` (`../types/index.js`); `vietnamDay` is NOT needed here (the CLI passes `day` in directly); `config.dataDir` (`../../config.js`, only in the test, to locate the real templates).
- Produces: `interface FileLayout { templateFile: string; sheet: string; firstDataRow: number; totalRowBefore: number }`; `const FILE_LAYOUT: Record<"boSung" | "loa" | "internet" | "netsupport" | "mayTinh", FileLayout>`; `const OTHER_TEMPLATE_FILES: string[]`; `interface HeaderCell { ref: string; value: string | number; numberFormat?: string }`; `interface FileFillSpec extends FileLayout { rows: Array<Record<string, string | number | null>>; headerCells: HeaderCell[] }`; `headerDateTexts(day: string, generatedAt: number): { thu: string; ngay: string; gio: string }`; `excelDateSerialForDay(day: string): number`; `buildFillSpecs(reports: Report[], perMessage: Map<string, number>, day: string, generatedAt?: number): Record<keyof typeof FILE_LAYOUT, FileFillSpec>`. Task 4 consumes `FILE_LAYOUT`, `OTHER_TEMPLATE_FILES`, `buildFillSpecs`.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/statusReportLayout.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { buildFillSpecs, excelDateSerialForDay, FILE_LAYOUT, headerDateTexts, OTHER_TEMPLATE_FILES } from "../src/lesson/statusReportLayout.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

test("headerDateTexts matches the original TEXT()/WEEKDAY() formula's own output convention", () => {
    // 2026-09-28 is a Monday; Excel WEEKDAY(date,1) is 1=Sunday..7=Saturday, so Monday is 2 (a number, not a name —
    // the template's own formula prints the number, e.g. "Thứ: 2", not "Thứ: Hai").
    const r = headerDateTexts("2026-09-28", Date.UTC(2026, 8, 28, 7, 5)); // 07:05 UTC = 14:05 VN
    assert.deepEqual(r, { thu: "Thứ: 2", ngay: "Ngày: 28/09/2026", gio: "Thời gian: 14:05" });
});

test("excelDateSerialForDay matches Excel's 1900 date system", () => {
    assert.equal(excelDateSerialForDay("2026-09-28"), 46293);
});

test("buildFillSpecs wires each builder's rows and the right header cells per file", () => {
    const report = (id: string, facilities: CoSoVatChat[]): Report => ({
        maTinNhan: id, maNguoiGui: "u", maNhom: "g1", thoiGian: 1000, loaiBaoCao: "DauBuoi",
        data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "X", coSo: null }, khuVuc: "K", phongMay: "PM1", giaoVien: "GV", coSoVatChat: facilities },
    });
    const reports = [report("m1", [{ loai: "MayTinh", xepLoai: "A", soLuong: [{ loai: "Thieu", so: 1 }, { loai: "Loi", so: 0 }] }, { loai: "Internet", xepLoai: "K" }])];
    const perMessage = new Map([["m1|internet", 3]]);

    const specs = buildFillSpecs(reports, perMessage, "2026-09-28", Date.UTC(2026, 8, 28, 7, 5));

    assert.equal(specs.boSung.sheet, "BO SUNG");
    assert.deepEqual(specs.boSung.rows, [{ A: 1, B: "LC", C: "X", D: "K", J: "PM1", L: 1, M: 1 }]);
    assert.deepEqual(specs.boSung.headerCells, [{ ref: "Q2", value: 46293, numberFormat: "dd/mm/yyyy" }]);

    assert.equal(specs.internet.rows[0].G, 3);
    assert.deepEqual(specs.internet.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "I2", value: "Thời gian: 14:05" }]);

    assert.deepEqual(specs.netsupport.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "I2", value: "Thời gian: 14:05" }]);
    assert.deepEqual(specs.loa.headerCells, [{ ref: "F2", value: "Thứ: 2" }, { ref: "G2", value: "Ngày: 28/09/2026" }, { ref: "H2", value: "Thời gian: 14:05" }]);
    assert.deepEqual(specs.mayTinh.headerCells, [{ ref: "J2", value: "Thứ: 2" }, { ref: "K2", value: "Ngày: 28/09/2026" }, { ref: "M2", value: "Thời gian: 14:05" }]);
});

test("OTHER_TEMPLATE_FILES lists exactly the 5 files with no data source, and none overlap FILE_LAYOUT's templates", () => {
    assert.deepEqual(
        [...OTHER_TEMPLATE_FILES].sort(),
        ["TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx", "TINH TRANG VE SINH PHONG MAY.xlsx", "THAY THE MAY TINH.xlsx", "VI PHAM NOI QUY THUC TAP.xlsx"].sort(),
    );
    const inScope = new Set(Object.values(FILE_LAYOUT).map((l) => l.templateFile));
    for (const f of OTHER_TEMPLATE_FILES) assert.equal(inScope.has(f), false, f);
});

const templatesDir = path.join(config.dataDir, "mau bao cao new");
const templatesPresent = fs.existsSync(templatesDir);

test(
    "the real template files still have the sheet/TỔNG-row layout the constants assume",
    { skip: templatesPresent ? false : `${templatesDir} không có trên máy này — bỏ qua kiểm tra đối chiếu thật` },
    async () => {
        const XLSX = await import("xlsx");
        for (const [key, layout] of Object.entries(FILE_LAYOUT)) {
            const wb = XLSX.readFile(path.join(templatesDir, layout.templateFile));
            const ws = wb.Sheets[layout.sheet];
            assert.ok(ws, `${key}: sheet "${layout.sheet}" không có trong ${layout.templateFile}`);
            const totalCell = ws[`A${layout.totalRowBefore}`];
            assert.equal(totalCell?.v, "TỔNG", `${key}: A${layout.totalRowBefore} trong ${layout.templateFile} không phải "TỔNG" — file mẫu đã đổi, cập nhật FILE_LAYOUT`);
        }
        for (const f of OTHER_TEMPLATE_FILES) assert.ok(fs.existsSync(path.join(templatesDir, f)), `thiếu file ${f}`);
    },
);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/statusReportLayout.test.ts`
Expected: FAIL — `Cannot find module '../src/lesson/statusReportLayout.js'`.

- [ ] **Step 3: Implement**

```typescript
// src/lesson/statusReportLayout.ts
import { buildBoSungRows, buildInternetRows, buildLoaRows, buildMayTinhRows, buildNetSupportRows } from "./statusRows.js";
import type { Report } from "../types/index.js";

export interface FileLayout {
    templateFile: string;
    sheet: string;
    /** Dòng dữ liệu đầu tiên trong file mẫu (còn trống, đã định dạng). */
    firstDataRow: number;
    /** Dòng chứa chữ "TỔNG" trong file mẫu GỐC, trước khi chèn/xoá dòng nào. */
    totalRowBefore: number;
}

export const FILE_LAYOUT = {
    boSung: { templateFile: "BO SUNG MAY TINH.xlsx", sheet: "BO SUNG", firstDataRow: 5, totalRowBefore: 8 },
    loa: { templateFile: "TINH TRANG LOA.xlsx", sheet: "1209", firstDataRow: 4, totalRowBefore: 7 },
    internet: { templateFile: "TINH TRANG LOI INTERNET.xlsx", sheet: "INTERNET", firstDataRow: 4, totalRowBefore: 7 },
    netsupport: { templateFile: "TINH TRANG LOI NETSUPPORT.xlsx", sheet: "NETSUPPORT", firstDataRow: 4, totalRowBefore: 7 },
    mayTinh: { templateFile: "TINH TRANG LOI MAY TINH.xlsx", sheet: "2409", firstDataRow: 4, totalRowBefore: 7 },
} as const satisfies Record<string, FileLayout>;

/** 5 file chưa có nguồn dữ liệu: chỉ chép nguyên trạng, không mở qua Excel COM (xem CLI, task 4). */
export const OTHER_TEMPLATE_FILES: string[] = ["THAY THE MAY TINH.xlsx", "TINH TRANG LOI DIEN.xlsx", "TINH TRANG LOI PHAN MEM.xlsx", "TINH TRANG VE SINH PHONG MAY.xlsx", "VI PHAM NOI QUY THUC TAP.xlsx"];

export interface HeaderCell {
    ref: string;
    value: string | number;
    numberFormat?: string;
}

export interface FileFillSpec extends FileLayout {
    rows: Array<Record<string, string | number | null>>;
    headerCells: HeaderCell[];
}

const WEEKDAY_EXCEL_TYPE1 = (jsDay: number): number => jsDay + 1; // JS getUTCDay(): 0=CN..6=Thứ 7; Excel WEEKDAY(d,1): 1=CN..7=Thứ 7.
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Thay cho các công thức `="Thứ: "&WEEKDAY(TODAY(),1)`, `="Ngày: "&TEXT(TODAY(),"dd/mm/yyyy")`,
 * `="Thời gian: "&TEXT(NOW(),"hh:mm")` trong file mẫu — giữ ĐÚNG định dạng chữ chúng in ra (kể cả số thứ,
 * không phải tên thứ), chỉ đóng băng thành giá trị của ngày báo cáo thay vì tính lại mỗi khi mở file.
 */
export function headerDateTexts(day: string, generatedAt: number): { thu: string; ngay: string; gio: string } {
    const [y, m, d] = day.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const gd = new Date(generatedAt + 7 * 3_600_000); // giờ Việt Nam
    return {
        thu: `Thứ: ${WEEKDAY_EXCEL_TYPE1(weekday)}`,
        ngay: `Ngày: ${pad(d)}/${pad(m)}/${y}`,
        gio: `Thời gian: ${pad(gd.getUTCHours())}:${pad(gd.getUTCMinutes())}`,
    };
}

/** Excel date serial (số ngày từ 1899-12-30) của ngày `day` (YYYY-MM-DD), cho ô đang là `=TODAY()`. */
export function excelDateSerialForDay(day: string): number {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d) / 86_400_000 + 25569;
}

export function buildFillSpecs(reports: Report[], perMessage: Map<string, number>, day: string, generatedAt: number = Date.now()): Record<keyof typeof FILE_LAYOUT, FileFillSpec> {
    const { thu, ngay, gio } = headerDateTexts(day, generatedAt);
    const dateSerial = excelDateSerialForDay(day);
    return {
        boSung: { ...FILE_LAYOUT.boSung, rows: buildBoSungRows(reports), headerCells: [{ ref: "Q2", value: dateSerial, numberFormat: "dd/mm/yyyy" }] },
        loa: { ...FILE_LAYOUT.loa, rows: buildLoaRows(reports), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "H2", value: gio }] },
        internet: { ...FILE_LAYOUT.internet, rows: buildInternetRows(reports, perMessage), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "I2", value: gio }] },
        netsupport: { ...FILE_LAYOUT.netsupport, rows: buildNetSupportRows(reports, perMessage), headerCells: [{ ref: "F2", value: thu }, { ref: "G2", value: ngay }, { ref: "I2", value: gio }] },
        mayTinh: { ...FILE_LAYOUT.mayTinh, rows: buildMayTinhRows(reports), headerCells: [{ ref: "J2", value: thu }, { ref: "K2", value: ngay }, { ref: "M2", value: gio }] },
    };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/statusReportLayout.test.ts`
Expected: all non-skipped tests pass; the template-drift test passes if `data/mau bao cao new/` exists on the machine, or reports `skip` otherwise — either is acceptable, a failure inside it is not.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/lesson/statusReportLayout.ts tests/statusReportLayout.test.ts
git commit -m "feat(status-reports): layout constants, header-date texts, and fill-spec assembly"
```

---

### Task 4: PowerShell filler and CLI

**Files:**
- Create: `scripts/fill-status-template.ps1`
- Create: `src/cli/fill-status-reports.ts`
- Modify: `package.json` (add `"fill:status-reports"` script)
- Modify: `CLAUDE.md` (add the command to the Commands list)

**Interfaces:**
- Consumes: `applyStreaks`, `readStreaks`, `writeStreaks`, `DEFAULT_STREAKS_PATH` (Task 1); `FILE_LAYOUT`, `OTHER_TEMPLATE_FILES`, `buildFillSpecs` (Task 3); `config.dataDir` (`../../config.js`); `isBuoi`, `todayVietnam` (`../lesson/time.js`); `outputDir`, `scriptsDir` (`../core/paths.js`).
- Produces: the `npm run fill:status-reports -- <output.json> [--day D] [--buoi B]` command; `data/export/trang-thai/*.xlsx` (10 files); `output/status-fill-spec.json` (input handed to PowerShell, kept for debugging); `output/status-fill.log` (PowerShell's own log, mirrored to stdout).

No automated test for the PowerShell/Excel COM step — same as the existing `fill-template.ps1`, per spec section 8: verified by running it and opening the result. `fill-status-reports.ts`'s own argument/path resolution is a thin wrapper in the same style as `fill-report.ts:1-70` and is exercised by hand in Step 4 below, not by `node:test`.

- [ ] **Step 1: Write the PowerShell script**

```powershell
# scripts/fill-status-template.ps1
param(
    [Parameter(Mandatory = $true)][string]$Spec,
    [Parameter(Mandatory = $true)][string]$Log
)
# Với mỗi file trong $Spec.files: copy file mẫu sang đích, mở bằng Excel COM, chèn/xóa dòng cho khớp số dòng
# dữ liệu (Excel tự mở rộng phạm vi các công thức COUNTIF/SUM nằm trùm lên chỗ chèn), ghi giá trị, ghi các ô
# tiêu đề ngày/giờ, lưu dạng .xlsx thường (KHÔNG có macro -> định dạng lưu là 51, không phải 52 của .xlsm).
$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]
$failed = $false
$xl = $null
try {
    $spec = Get-Content $Spec -Raw -Encoding UTF8 | ConvertFrom-Json
    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.AutomationSecurity = 1
    $xl.EnableEvents = $false

    foreach ($f in $spec.files) {
        try {
            New-Item -ItemType Directory -Force (Split-Path -Parent $f.out) | Out-Null
            Copy-Item $f.template $f.out -Force

            $wb = $xl.Workbooks.Open($f.out)
            $ws = $wb.Worksheets.Item($f.sheet)

            $need = $f.rows.Count
            $have = $f.totalRowBefore - $f.firstDataRow
            $totalRow = $ws.Rows($f.totalRowBefore)
            if ($need -gt $have) {
                for ($k = 0; $k -lt ($need - $have); $k++) { $totalRow.EntireRow.Insert() | Out-Null }
            } elseif ($need -lt $have) {
                for ($k = 0; $k -lt ($have - $need); $k++) { $totalRow.Offset(-1, 0).EntireRow.Delete() | Out-Null }
            }

            for ($i = 0; $i -lt $f.rows.Count; $i++) {
                $rowNum = $f.firstDataRow + $i
                foreach ($col in $f.rows[$i].PSObject.Properties) {
                    $ws.Range("$($col.Name)$rowNum").Value2 = $col.Value
                }
            }
            foreach ($cell in $f.headerCells) {
                $ws.Range($cell.ref).Value2 = $cell.value
                if ($null -ne $cell.numberFormat) { $ws.Range($cell.ref).NumberFormat = $cell.numberFormat }
            }

            $wb.SaveAs($f.out, 51)
            $wb.Close($false)
            $log.Add("$($f.name): $need dong")
        } catch {
            $failed = $true
            $log.Add("$($f.name): ERR $($_.Exception.Message)")
        }
    }
} catch {
    $failed = $true
    $log.Add("ERR: $($_.Exception.Message)")
} finally {
    if ($null -ne $xl) {
        $xl.Quit()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    }
}
$log | Out-File -FilePath $Log -Encoding utf8
if ($failed) { exit 1 }
```

- [ ] **Step 2: Write the CLI**

```typescript
// src/cli/fill-status-reports.ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { outputDir, scriptsDir } from "../core/paths.js";
import { applyStreaks, readStreaks, writeStreaks } from "../lesson/faultStreaks.js";
import { buildFillSpecs, FILE_LAYOUT, OTHER_TEMPLATE_FILES } from "../lesson/statusReportLayout.js";
import { isBuoi, todayVietnam } from "../lesson/time.js";
import type { Report } from "../types/index.js";

/**
 * Điền 5 file báo cáo tình trạng (BO SUNG MAY TINH, LOA, INTERNET, NETSUPPORT, MÁY TÍNH) từ `output/output.json`
 * (đã áp override), và chép nguyên trạng 5 file chưa có dữ liệu. Cả 10 file cùng nằm trong
 * `data/export/trang-thai/`, ghi đè mỗi lần chạy. Không có macro, không qua Zalo — chỉ cần Excel cài trên máy.
 * Xem thiết kế: docs/superpowers/specs/2026-09-28-status-report-fill-design.md
 *
 *   npm run fill:status-reports -- output/output.json [--day YYYY-MM-DD] [--buoi sang|chieu|toi]
 *
 * Ngày/buổi mặc định lấy từ output/meta.json (do extract:reports ghi), giống fill:report.
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const inputPath = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--")));
    if (!inputPath) throw new Error("Usage: npm run fill:status-reports -- <output.json> [--day YYYY-MM-DD] [--buoi sang|chieu|toi]");

    const reports = JSON.parse(fs.readFileSync(inputPath, "utf8")) as Report[];

    const metaFile = path.join(path.dirname(path.resolve(inputPath)), "meta.json");
    const meta: { day?: string; buoi?: string } = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8").replace(/^﻿/, "")) : {};
    const day = option("--day") ?? meta.day ?? todayVietnam();
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isBuoi(buoi)) throw new Error("Cần --buoi sang|chieu|toi hoặc output/meta.json do extract:reports tạo.");

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const outDir = path.join(config.dataDir, "export", "trang-thai");
    fs.mkdirSync(outDir, { recursive: true });

    for (const file of OTHER_TEMPLATE_FILES) {
        fs.copyFileSync(path.join(templatesSrc, file), path.join(outDir, file));
    }

    const streaksBefore = readStreaks();
    const { state: streaksAfter, perMessage } = applyStreaks(streaksBefore, reports);
    const specs = buildFillSpecs(reports, perMessage, day);

    const psSpec = {
        files: (Object.keys(FILE_LAYOUT) as Array<keyof typeof FILE_LAYOUT>).map((key) => {
            const spec = specs[key];
            const layout = FILE_LAYOUT[key];
            return {
                name: key,
                template: path.join(templatesSrc, layout.templateFile),
                out: path.join(outDir, layout.templateFile),
                sheet: spec.sheet,
                firstDataRow: spec.firstDataRow,
                totalRowBefore: spec.totalRowBefore,
                rows: spec.rows,
                headerCells: spec.headerCells,
            };
        }),
    };

    fs.mkdirSync(outputDir, { recursive: true });
    const specFile = path.join(outputDir, "status-fill-spec.json");
    fs.writeFileSync(specFile, JSON.stringify(psSpec), "utf8");
    const logFile = path.join(outputDir, "status-fill.log");
    fs.rmSync(logFile, { force: true });

    let failed = false;
    try {
        execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, "fill-status-template.ps1"), "-Spec", specFile, "-Log", logFile], { stdio: "inherit", timeout: 5 * 60_000 });
    } catch (err) {
        failed = true;
        console.error(`[fill-status] PowerShell failed: ${(err as Error).message}`);
    }
    if (fs.existsSync(logFile)) console.log(fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd());

    // Chỉ lưu bộ đếm SỐ LẦN mới khi PowerShell chạy xong không lỗi — vòng lỗi không được làm sai lệch bộ đếm cho lần sau.
    if (!failed) writeStreaks(streaksAfter);

    const summary = (Object.keys(FILE_LAYOUT) as Array<keyof typeof FILE_LAYOUT>).map((key) => `${key}: ${specs[key].rows.length}`).join(", ");
    console.log(`[fill-status] ${summary}, buổi ${buoi} ngày ${day} -> ${outDir}`);
    if (failed) process.exit(1);
}

try {
    main();
} catch (err) {
    console.error((err as Error).message);
    process.exit(1);
}
```

- [ ] **Step 3: Wire the `npm` script and document it**

In `package.json`, add this line right after `"fill:report"`:

```json
        "fill:status-reports": "tsx src/cli/fill-status-reports.ts",
```

In `CLAUDE.md`, add this line right after the `fill:report` line in the Commands block:

```
npm run fill:status-reports -- output/output.json   # fill 5 non-macro status templates (BO SUNG MAY TINH, LOA, INTERNET, NETSUPPORT, MÁY TÍNH) from output/output.json, copy the other 5 as-is, into data/export/trang-thai/ (needs Excel)
```

- [ ] **Step 4: Run it by hand and verify**

This step needs a machine with Excel and the `data/mau bao cao new/` templates present — run it after `npm run extract:reports` has produced a fresh `output/output.json` for a session that has at least one report:

Run: `npm run typecheck && npm test`
Expected: typecheck clean; all `node:test` suites pass (Tasks 1-3's tests plus the whole existing suite, unaffected).

Run: `npm run fill:status-reports -- output/output.json`
Expected: exit 0; console prints a line like `[fill-status] boSung: 0, loa: 1, internet: 1, netsupport: 1, mayTinh: 1, buổi sang ngày 2026-09-28 -> .../data/export/trang-thai`; `data/export/trang-thai/` contains all 10 files; the 5 in-scope ones open in Excel with the expected rows and an intact `TỔNG`/`CHÚ GIẢI` block; `data/.status-streaks.json` exists.

Run: `npm run fill:status-reports -- output/output.json` again immediately (same input)
Expected: exit 0; the Internet/NetSupport `SỐ LẦN` values in the output files are **unchanged** from the first run (idempotent), because `Task 1`'s `lastMsgId` check held.

- [ ] **Step 5: Commit**

```bash
git add scripts/fill-status-template.ps1 src/cli/fill-status-reports.ts package.json CLAUDE.md
git commit -m "feat(status-reports): fill-status-reports CLI + Excel COM script, wired into npm run and docs"
```

---

### Task 5: Update `Teach-lesson-skills-V2/SKILL.md`

**Files:**
- Modify: `Teach-lesson-skills-V2/SKILL.md`

**Interfaces:**
- Consumes: nothing from earlier tasks except knowing the final command name (`npm run fill:status-reports`) and output location (`data/export/trang-thai/`).
- Produces: nothing further tasks depend on — this is the last task.

The skill's extraction-rules block (from `## Quy tắc trích xuất` to `## Script trích xuất và agent giám sát`, exclusive) is **never touched** by this task. Everything here goes into the surrounding operational sections that already describe other commands (the same sections earlier work pointed at `config.ts` and renamed files after the `src/` restructure).

- [ ] **Step 1: Find the section listing the pipeline's commands/outputs**

Run: `grep -n "fill:report\|data/export" "Teach-lesson-skills-V2/SKILL.md"`
Expected: at least one match near where `fill:report` / `baocaobuoi<buoi>_<ddMMyy>.xlsm` is described (the step-by-step pipeline section, outside the protected block).

- [ ] **Step 2: Add a short paragraph right after that section**

Insert (matching the surrounding file's Vietnamese, third-person "agent" voice, and CRLF line endings — check with `file Teach-lesson-skills-V2/SKILL.md` first and preserve whatever it already uses):

```markdown
**Báo cáo tình trạng thiết bị (thêm, không thuộc quy trình bắt buộc ở trên).** Sau khi có `output/output.json` của một buổi, `npm run fill:status-reports -- output/output.json` điền trực tiếp (không macro) 5 file BO SUNG MAY TINH, TINH TRẠNG LOA, LOI INTERNET, LOI MÁY TÍNH, LOI NETSUPPORT và chép nguyên trạng 5 file chưa có dữ liệu, tất cả nằm trong `data/export/trang-thai/`, ghi đè mỗi lần chạy. Cột SỐ LẦN (chỉ ở file INTERNET, NETSUPPORT) là số lần liên tiếp bị báo lỗi (K), lưu ở `data/.status-streaks.json`, không tính theo ngày lịch. Thiết kế: `docs/superpowers/specs/2026-09-28-status-report-fill-design.md`.
```

- [ ] **Step 3: Verify the protected block is untouched**

Run:
```bash
git show HEAD:Teach-lesson-skills-V2/SKILL.md | sed -n '/^## Quy tắc trích xuất/,/^## Script trích xuất và agent giám sát/p' > /tmp/before-block.txt
sed -n '/^## Quy tắc trích xuất/,/^## Script trích xuất và agent giám sát/p' "Teach-lesson-skills-V2/SKILL.md" > /tmp/after-block.txt
diff /tmp/before-block.txt /tmp/after-block.txt
```
Expected: no output (files identical).

- [ ] **Step 4: Commit**

```bash
git add Teach-lesson-skills-V2/SKILL.md
git commit -m "docs(skill): mention fill:status-reports (extraction-rules block untouched)"
```

## Self-Review

**1. Spec coverage.** Section 3 (source = `output/output.json`) → Task 4. Section 4 (column tables) → Task 2 + Task 3's `FILE_LAYOUT`. Section 5 (SỐ LẦN state) → Task 1. Section 6 (Excel COM insert/delete, `SaveAs` 51) → Task 4's PowerShell script. Section 1's "always export all 10, copy-through 5" → Task 3's `OTHER_TEMPLATE_FILES` + Task 4's copy loop. Section 7's assumptions (one row per report, STT resets each run) → built into Task 2 directly. No spec section is unaddressed.

**2. Placeholder scan.** No "TBD"/"add error handling"/"similar to Task N" — checked.

**3. Type consistency.** `perMessage: Map<string, number>` keyed `` `${maTinNhan}|${category}` `` is defined once in Task 1 and used with that exact shape in Task 2 and Task 3. `FileLayout`/`FileFillSpec`/`FILE_LAYOUT` keys (`boSung`, `loa`, `internet`, `netsupport`, `mayTinh`) are identical across Task 3 and Task 4. Row objects are `Record<string, Cell>` (Task 2) narrowed to `Record<string, string | number | null>` in `FileFillSpec` (Task 3) — `Cell` is exactly `string | number | null`, so this is not a narrowing at all, just written out for a file that doesn't import `Cell`; consistent.

**4. Review Focus.** All five lines have an owning test: no-`phongMay` exclusion (Task 1's streak test + Task 2's BO SUNG/MÁY TÍNH tests), BO SUNG's `=== 0` boundary (Task 2), máy tính grade boundaries 0/5/6/9/10 (Task 2), re-run idempotency (Task 1's dedicated test + Task 4's manual Step 4 second run), and "failed PowerShell must not persist streaks" (Task 4's `if (!failed) writeStreaks(...)` plus the CLI's manual verification step covers the happy path; the failure path itself isn't exercised by an automated test since it needs a real/broken Excel — noted here as accepted, matching how the rest of the Excel-COM boundary is verified by hand throughout this plan).
