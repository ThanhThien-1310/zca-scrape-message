# Agent đọc ảnh báo cáo (bản chạy thử) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gom ảnh báo cáo của từng nhóm Zalo thành các bộ ảnh, đọc từng bộ bằng `claude -p` (Haiku 4.5), kiểm tra dữ liệu bằng ba lớp review và ghi kết quả ra `data/photo-reports/`, kèm bộ đáp án đúng để đo độ chính xác.

**Architecture:** Mô-đun mới `src/vision/` gồm các hàm thuần (gom bộ, luật, lược đồ và prompt, kiểm tra, so hai lần đọc) và một giao diện `VisionReader` có cách thực hiện `claude -p` (tiến trình con, truyền được bản giả khi test). Bốn lệnh `photos:*` ở `src/cli/` chỉ ghi vào `data/photo-reports/`, không đụng DB, Excel, kho tin hay `bot:runner`. Luật ảnh là file JSON trong `photo-rules/` nên thêm loại ảnh mới không sửa code.

**Tech Stack:** TypeScript ESM (Node >= 22, `tsx`), `node:test`, `node:child_process`, `claude` CLI (`C:\Users\Admin\.local\bin\claude.exe`). Không thêm gói npm nào.

**Spec:** `docs/superpowers/specs/2026-10-07-doc-anh-agent-design.md`

## Global Constraints

- Chỉ ghi vào `data/photo-reports/` (và `photo-rules/`, `photo-golden/` do người dùng sửa); không ghi DB, Excel, `data/<groupId>.json`, `output/`.
- Kho ảnh gốc `data/images/<mã nhóm>/<mã tin>.<đuôi>` KHÔNG đổi; bộ ảnh dùng liên kết cứng, không có thì sao chép.
- Model mặc định `haiku` (Haiku 4.5, `claude-haiku-4-5-20251001`); một lần gọi `claude -p` cho CẢ BỘ; prompt truyền qua stdin; cờ: `--output-format json --json-schema <lược đồ> --model <m> --allowedTools Read --add-dir <thư mục bộ> --disable-slash-commands --no-session-persistence --setting-sources user --system-prompt <lời dặn>`; chạy ở thư mục làm việc sạch; KHÔNG dùng `--bare` (không chạy được với subscription).
- Lần đọc thứ hai KHÔNG được thấy kết quả lần một.
- `gapMinutes` 3, `settleMinutes` 5, `textWindowMinutes` 10 (mặc định), nằm trong `config.vision.bundle`.
- Chỉ `tu_dong_dat`, `da_xac_nhan`, `da_sua` mới là đầu vào báo cáo ở giai đoạn sau.
- Ngoài phạm vi: nối vào `bot:runner`, file Excel mẫu mới, API `@anthropic-ai/sdk`, agent vận hành, báo cáo LỊCH NGHỈ PHÉP (luật `leave` thêm sau bằng một file `photo-rules/leave.json`).
- Mã theo phong cách của dự án: thụt 4 khoảng trắng, dấu nháy kép, import có đuôi `.js`, chú thích tiếng Việt, kiểu dùng chung qua `src/types/index.ts`, đường dẫn từ `src/core/paths.ts`.
- Commit lên nhánh `phuc_dev`, KHÔNG push (chỉ push khi người dùng bảo). Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Trong môi trường này `npm run <script>` đôi khi không in gì (thoát mã 127): dùng `npx tsx src/cli/<tệp>.ts ...` thay thế khi gặp.

## Review Focus

Các tình huống spec nhắc nhưng không có test nào bắt buộc, dễ làm hỏng nhất (mỗi dòng có test ở task nêu trong ngoặc):

1. Hai người gửi ảnh xen kẽ cách nhau vài mili giây trong cùng một nhóm: phải ra HAI bộ, không dồn một (Task 4).
2. Ảnh về MUỘN sau khi bộ đã được đọc: bộ phải được đánh dấu đọc lại, không tạo bộ trùng, không mất ảnh, đánh số lại đúng thứ tự (Task 5).
3. `claude` không dùng được (chưa đăng nhập, quá thời gian, đầu ra rác hoặc thiếu, agent bỏ sót một ảnh): báo lỗi rõ, bộ vẫn chưa đọc, không ghi nửa chừng (Task 6, 9).
4. Ô viết tay để trống: `null` không được tính là 0 khi cộng `hoatDong + hong`, và số 0 thật không bị coi là thiếu (Task 7).
5. Đọc SAI mà vẫn "tin cậy cao": lệnh golden phải đếm riêng số trường sai nhưng vẫn `tu_dong_dat`, đây là chỉ số nguy hiểm nhất (Task 11). Bộ chỉ có ảnh phòng máy (toàn `khac`) không được báo lỗi hay tốn lần đọc thứ hai (Task 8).

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/types/vision.ts` (mới) | Mọi kiểu của agent đọc ảnh (luật, manifest, kết quả đọc, review, `VisionReader`) |
| `src/vision/rules.ts` (mới) | Đọc và kiểm tra `photo-rules/*.json` |
| `src/vision/promptSchema.ts` (mới) | Sinh lược đồ kết quả và prompt từ luật |
| `src/vision/bundling.ts` (mới) | Hàm thuần gom ảnh thành bộ (`groupPhotos`), `bundleIdOf`, `draftFromFiles` |
| `src/vision/bundleStore.ts` (mới) | Ghi thư mục bộ (liên kết cứng, `manifest.json`), liệt kê bộ |
| `src/vision/claudeReader.ts` (mới) | `VisionReader` bằng `claude -p`, `runProcess` |
| `src/vision/checks.ts` (mới) | Review lớp 1 (luật) |
| `src/vision/review.ts` (mới) | So hai lần đọc, quyết định trạng thái, `flattenReading` |
| `src/vision/pipeline.ts` (mới) | `processBundle` (một bộ) và `readBundles` (nhiều bộ) |
| `src/vision/reviewApply.ts` (mới) | Lớp 3: người xác nhận, sửa, bỏ |
| `src/vision/golden.ts` (mới) | Tải ca mẫu và chấm điểm |
| `src/cli/photos-bundle.ts`, `photos-read.ts`, `photos-review.ts`, `photos-golden.ts` (mới) | Bốn lệnh |
| `photo-rules/speedtest.json`, `photo-rules/handover.json` (mới, commit) | Hai luật mẫu |
| `photo-golden/cases.json` (mới, commit) | Đáp án đúng của người dùng |
| `config.ts`, `src/types/config.ts`, `src/config/configCheck.ts`, `src/config/configDoc.ts` | Mục 12 `vision` |
| `src/core/paths.ts` | `photoRulesDir`, `photoGoldenDir`, `photoReportsDir(dataDir)` |
| `tests/helpers/visionFixtures.ts`, `tests/photo*.test.ts`, `tests/vision*.test.ts` (mới) | Test |

---

### Task 1: Kiểu dùng chung và `config.vision`

**Files:**
- Create: `src/types/vision.ts`
- Modify: `src/types/index.ts`, `src/types/config.ts`, `config.ts`, `src/config/configCheck.ts`, `src/config/configDoc.ts`, `src/core/paths.ts`, `tests/configCheck.test.ts`, `tests/configDoc.test.ts`, `tests/helpers/pinConfig.ts`

**Interfaces:**
- Produces: các kiểu của `src/types/vision.ts` (dưới đây), `config.vision`, `photoRulesDir`, `photoGoldenDir`, `photoReportsDir(dataDir: string): string`.

- [ ] **Step 1: Viết test cấu hình (đỏ)**

Thêm vào cuối `tests/configCheck.test.ts`, và thêm `vision` vào hàm `good()` (sau dòng `print:`):

```ts
    vision: { enabled: false, reader: "claude-p", model: "haiku", secondModel: "haiku", timeoutSeconds: 180, maxBundlesPerRun: 10, bundle: { gapMinutes: 3, settleMinutes: 5, textWindowMinutes: 10 } },
```

```ts
test("vision settings are validated and the error names the key", () => {
    assert.throws(bad((c) => (c.vision.timeoutSeconds = 0)), /vision\.timeoutSeconds/);
    assert.throws(bad((c) => (c.vision.maxBundlesPerRun = -1)), /vision\.maxBundlesPerRun/);
    assert.throws(bad((c) => (c.vision.bundle.gapMinutes = 1.5)), /vision\.bundle\.gapMinutes/);
    assert.throws(bad((c) => (c.vision.bundle.settleMinutes = 0)), /vision\.bundle\.settleMinutes/);
    assert.throws(bad((c) => (c.vision.bundle.textWindowMinutes = 0)), /vision\.bundle\.textWindowMinutes/);
    assert.throws(bad((c) => (c.vision.model = "  ")), /vision\.model/);
    assert.throws(bad((c) => (c.vision.secondModel = "")), /vision\.secondModel/);
    assert.throws(bad((c) => (c.vision.reader = "api" as "claude-p")), /vision\.reader/);
    assert.throws(bad((c) => (c.vision.enabled = "yes" as unknown as boolean)), /vision\.enabled/);
});
```

Trong `tests/configDoc.test.ts` đổi test "11 sections": tiêu đề thành `... one of the 12 sections ...` và `assert.equal(SECTIONS.length, 12);`.

Trong `tests/helpers/pinConfig.ts` đổi danh sách thành `["watch.", "runner.", "recovery.", "chat.", "sessions.", "phases.", "total.", "print.", "vision."]`.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npm test -- --test-name-pattern "vision"` (hoặc `node --import tsx --test tests/configCheck.test.ts tests/configDoc.test.ts`)
Expected: FAIL (biên dịch lỗi: `vision` chưa có trong `ConfigShape`).

- [ ] **Step 3: Viết `src/types/vision.ts`**

```ts
// Kiểu của agent đọc ảnh báo cáo. Import qua "../types/index.js".
import type { SchoolArea } from "./report.js";

export type FieldKind = "so" | "chu" | "ngay" | "dung_sai" | "danh_sach";
/** `dung_sai` là ô đúng/sai (đánh dấu, tick), giá trị boolean. `ngay` là chuỗi `YYYY-MM-DD`. */
export type Confidence = "cao" | "vua" | "thap";
export type SecondReadMode = "luon" | "khi_tin_cay_thap" | "khong";
export type CheckLevel = "cung" | "canh_bao";

export interface RuleField {
    ten: string;
    kieu: FieldKind;
    batBuoc?: boolean;
    min?: number;
    max?: number;
    goiY?: string;
    /** Chỉ với `danh_sach`: các cột của mỗi phần tử. */
    phanTu?: RuleField[];
}

export type CheckRule =
    /** Mỗi hàng của danh sách `trong`: `tong` phải bằng tổng các cột `cong` (hàng thiếu số thì bỏ qua). */
    | { id: string; loai: "tong_dong"; muc: CheckLevel; trong: string; tong: string; cong: string[] }
    /** Các hàng có cột `ten` chứa từng chuỗi trong `tenChua` phải có cùng giá trị ở cột `cot`. */
    | { id: string; loai: "cac_dong_bang_nhau"; muc: CheckLevel; trong: string; cot: string; tenChua: string[] }
    /** Ngày `truong` không sau ngày gửi và không trước quá `toiDaLechNgay` ngày. */
    | { id: string; loai: "ngay_gan_gio_gui"; muc: CheckLevel; truong: string; toiDaLechNgay: number };

export interface PhotoRule {
    id: string;
    version: number;
    title: string;
    nhanRa: string;
    soLuongMoiBo: { toiThieu: number; toiDa: number };
    truong: RuleField[];
    luatKiemTra: CheckRule[];
    docLanHai: SecondReadMode;
    /** Độ tin cậy thấp nhất vẫn được xếp `tu_dong_dat`. */
    nguongTinCay: "cao" | "vua";
    /** Đọc nhận trường này nhưng bản chạy thử CHƯA dùng (cần phân loại rồi mới chọn model; xem cuối kế hoạch). */
    model?: string;
}

export interface ManifestImage {
    seq: number;
    msgId: string;
    ts: number;
    /** Đường dẫn ảnh gốc, tương đối so với `config.dataDir` (hoặc tuyệt đối với bộ ảnh mẫu). */
    source: string;
    file: string;
}
export interface ManifestText {
    msgId: string;
    ts: number;
    content: string;
}
export interface Manifest {
    version: 1;
    bundleId: string;
    day: string;
    status: "open" | "closed";
    groupId: string;
    groupName: string;
    school: SchoolArea;
    sender: { id: string; name: string };
    firstTs: number;
    lastTs: number;
    texts: ManifestText[];
    images: ManifestImage[];
    /** true khi có ảnh mới về sau khi bộ đã được đọc: `photos:read` đọc lại rồi xoá cờ. */
    reread?: boolean;
}

export interface FieldReading {
    /** `null` khi không đọc được; `danh_sach` là mảng các đối tượng cột -> giá trị. */
    value: unknown;
    doTinCay: Confidence;
}
export interface BundleReading {
    bundleId: string;
    readAt: number;
    reader: { kind: "claude-p"; model: string; promptVersion: string; ruleVersions: Record<string, number> };
    images: Array<{ seq: number; loai: string; doTinCay: Confidence }>;
    /** `extracted[<mã luật>][<tên trường>]`; luật không có ảnh nào thì không có mặt. */
    extracted: Record<string, Record<string, FieldReading>>;
}

export type ReadResult = { ok: true; reading: BundleReading } | { ok: false; error: string };
export interface ReadInput {
    bundleDir: string;
    manifest: Manifest;
    rules: PhotoRule[];
    pass: 1 | 2;
}
/** Không ném lỗi: lỗi trả về trong `{ ok: false, error }`. */
export interface VisionReader {
    readBundle(input: ReadInput): Promise<ReadResult>;
}

export type ReviewStatus = "tu_dong_dat" | "can_xem" | "da_xac_nhan" | "da_sua" | "da_bo";
export interface CheckResult {
    id: string;
    ok: boolean;
    muc: CheckLevel;
    detail: string;
}
export interface Disagreement {
    path: string;
    first: unknown;
    second: unknown;
}
export interface Review {
    status: ReviewStatus;
    reasons: string[];
    checks: CheckResult[];
    secondRead: { ran: boolean; disagree: Disagreement[] };
    human: null | { at: number; action: "xac_nhan" | "sua" | "bo"; corrections: Record<string, unknown> };
}
```

Thêm vào `src/types/index.ts` (giữ thứ tự chữ cái, sau `./session.js`): `export * from "./vision.js";`

- [ ] **Step 4: Sửa `src/types/config.ts`**

Thêm vào `ConfigShape` sau dòng `print:`:

```ts
    vision: { enabled: boolean; reader: "claude-p"; model: string; secondModel: string; timeoutSeconds: number; maxBundlesPerRun: number; bundle: { gapMinutes: number; settleMinutes: number; textWindowMinutes: number } };
```

- [ ] **Step 5: Thêm mục 12 vào `config.ts`** (ngay sau khối `print: { ... },`, trước `};`)

```ts

    // ═══════════════════════════════════════════════════════════════════════
    // 12. ĐỌC ẢNH (photos:bundle, photos:read, photos:review, photos:golden) — agent đọc ảnh báo cáo, bản chạy thử.
    // ═══════════════════════════════════════════════════════════════════════
    vision: {
        /** Bật việc đọc ảnh TỰ ĐỘNG trong bot (chưa có bot nào dùng ở bản chạy thử). Các lệnh photos:* chạy tay luôn chạy được. Ví dụ: false. */
        enabled: false,
        /** Cách đọc ảnh. Hiện chỉ có "claude-p" (chạy `claude -p` bằng đăng nhập Claude Code trên máy); sau này có "api". */
        reader: "claude-p",
        /** Model cho lần đọc thứ nhất, tên mà `claude --model` nhận. "haiku" là Haiku 4.5 (claude-haiku-4-5-20251001). Ví dụ: "haiku". */
        model: "haiku",
        /** Model cho lần đọc thứ hai (độc lập với lần một). Đặt model khác lần một để hai lần đọc ít sai giống nhau. Ví dụ: "haiku". */
        secondModel: "haiku",
        /** Chờ tối đa bấy nhiêu giây cho MỘT lần gọi agent đọc một bộ ảnh; quá hạn thì bộ đó báo lỗi và vẫn chưa đọc. Đơn vị: giây. */
        timeoutSeconds: 180,
        /** Mỗi lần chạy photos:read đọc tối đa bấy nhiêu bộ (chặn tốn hạn mức subscription). Đơn vị: bộ. */
        maxBundlesPerRun: 10,
        bundle: {
            /** Hai ảnh liên tiếp của cùng một người cách nhau không quá bấy nhiêu phút thì cùng một bộ. Đơn vị: phút. */
            gapMinutes: 3,
            /** Bộ chỉ được đọc sau khi yên ắng bấy nhiêu phút kể từ ảnh cuối (chắc ảnh cuối đã tới). Đơn vị: phút. */
            settleMinutes: 5,
            /** Tin chữ của cùng người gửi trong khoảng bấy nhiêu phút quanh bộ được đính kèm làm tiêu đề/chú thích. Đơn vị: phút. */
            textWindowMinutes: 10,
        },
    },
```

- [ ] **Step 6: Sửa `src/config/configCheck.ts`**

Thêm vào mảng `positive` (sau dòng `["print.maxPagesPerFile", ...]`):

```ts
        ["vision.timeoutSeconds", cfg.vision.timeoutSeconds],
        ["vision.maxBundlesPerRun", cfg.vision.maxBundlesPerRun],
        ["vision.bundle.gapMinutes", cfg.vision.bundle.gapMinutes],
        ["vision.bundle.settleMinutes", cfg.vision.bundle.settleMinutes],
        ["vision.bundle.textWindowMinutes", cfg.vision.bundle.textWindowMinutes],
```

Thêm trước dòng `if (typeof cfg.statusExportDir ...`:

```ts
    if (typeof cfg.vision.enabled !== "boolean") errors.push(`vision.enabled phải là true hoặc false (đang là ${JSON.stringify(cfg.vision.enabled)}).`);
    if (cfg.vision.reader !== "claude-p") errors.push(`vision.reader chỉ nhận "claude-p" (đang là ${JSON.stringify(cfg.vision.reader)}).`);
    for (const key of ["model", "secondModel"] as const) {
        if (typeof cfg.vision[key] !== "string" || cfg.vision[key].trim() === "") errors.push(`vision.${key} phải là tên một model, ví dụ "haiku" (đang là ${JSON.stringify(cfg.vision[key])}).`);
    }
```

- [ ] **Step 7: Sửa `src/config/configDoc.ts`**

Thêm `, "12. ĐỌC ẢNH (photos:*)"` vào cuối mảng `SECTIONS` (và sửa chú thích trên nó thành "12 mục"). Thêm vào cuối `SETTINGS` (trước `];`):

```ts
    { section: SECTIONS[11], path: "vision.enabled", unit: "", default: false, readers: ["photos:read"], note: "Bật việc đọc ảnh tự động trong bot; bản chạy thử chưa có bot nào dùng, các lệnh photos:* chạy tay luôn chạy được." },
    { section: SECTIONS[11], path: "vision.reader", unit: "", default: "claude-p", readers: ["photos:read", "photos:golden"], note: "Cách đọc ảnh; hiện chỉ có claude-p (chạy `claude -p` bằng đăng nhập Claude Code trên máy)." },
    { section: SECTIONS[11], path: "vision.model", unit: "", default: "haiku", readers: ["photos:read", "photos:golden"], note: "Model cho lần đọc thứ nhất; haiku là Haiku 4.5." },
    { section: SECTIONS[11], path: "vision.secondModel", unit: "", default: "haiku", readers: ["photos:read", "photos:golden"], note: "Model cho lần đọc thứ hai độc lập; đặt khác lần một để hai lần ít sai giống nhau." },
    { section: SECTIONS[11], path: "vision.timeoutSeconds", unit: "giây", default: 180, readers: ["photos:read", "photos:golden"], note: "Chờ tối đa bấy nhiêu giây cho một lần gọi agent đọc một bộ ảnh." },
    { section: SECTIONS[11], path: "vision.maxBundlesPerRun", unit: "bộ", default: 10, readers: ["photos:read"], note: "Mỗi lần chạy photos:read đọc tối đa bấy nhiêu bộ (chặn tốn hạn mức)." },
    { section: SECTIONS[11], path: "vision.bundle.gapMinutes", unit: "phút", default: 3, readers: ["photos:bundle"], note: "Hai ảnh liên tiếp của cùng người cách nhau không quá bấy nhiêu phút thì cùng một bộ." },
    { section: SECTIONS[11], path: "vision.bundle.settleMinutes", unit: "phút", default: 5, readers: ["photos:bundle"], note: "Bộ chỉ được đọc sau khi yên ắng bấy nhiêu phút kể từ ảnh cuối." },
    { section: SECTIONS[11], path: "vision.bundle.textWindowMinutes", unit: "phút", default: 10, readers: ["photos:bundle"], note: "Tin chữ của cùng người trong khoảng bấy nhiêu phút quanh bộ được đính kèm." },
```

- [ ] **Step 8: Thêm đường dẫn vào `src/core/paths.ts`** (cuối file)

```ts

/** Luật cho từng loại ảnh (được commit): `photo-rules/<mã>.json`. */
export const photoRulesDir = path.join(repoRoot, "photo-rules");

/** Đáp án đúng của người dùng để đo độ chính xác (được commit): `photo-golden/cases.json`. */
export const photoGoldenDir = path.join(repoRoot, "photo-golden");

/** Các bộ ảnh dẫn xuất: `<dataDir>/photo-reports/<yyyy-MM-dd>/<mã nhóm>/<mã bộ>/`. `dataDir` là `config.dataDir`. */
export function photoReportsDir(dataDir: string): string {
    return path.join(dataDir, "photo-reports");
}
```

- [ ] **Step 9: Chạy kiểm tra và test**

Run: `npm run typecheck` rồi `npm test`
Expected: PASS toàn bộ (kể cả `configDoc` kiểm "mọi khoá của config đều có mô tả" cho 9 khoá `vision.*`). Nếu test nào khác dựng `ConfigShape` thủ công thì thêm `vision` giống `good()` ở Step 1.

- [ ] **Step 10: Commit**

```bash
git add src/types src/core/paths.ts config.ts src/config tests
git commit -m "feat(vision): kiểu dùng chung và mục cấu hình 12 (vision)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Đọc và kiểm tra luật ảnh

**Files:**
- Create: `src/vision/rules.ts`, `photo-rules/speedtest.json`, `photo-rules/handover.json`, `tests/photoRules.test.ts`

**Interfaces:**
- Consumes: `PhotoRule`, `RuleField`, `CheckRule` (Task 1); `photoRulesDir`.
- Produces: `parseRule(raw: unknown, file: string): PhotoRule`, `loadRules(dir?: string): PhotoRule[]` (sắp theo tên file, mỗi `id` phải trùng tên file không đuôi, ném `Error` có tên file và đường dẫn trường khi sai).

- [ ] **Step 1: Viết test (đỏ)** `tests/photoRules.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadRules, parseRule } from "../src/vision/rules.js";

const base = () => ({
    id: "demo",
    version: 1,
    title: "Demo",
    nhanRa: "Ảnh demo",
    soLuongMoiBo: { toiThieu: 1, toiDa: 2 },
    truong: [{ ten: "a", kieu: "so", batBuoc: true, min: 0, max: 10 }],
    luatKiemTra: [],
    docLanHai: "khong",
    nguongTinCay: "vua",
});
const withList = () => ({
    ...base(),
    truong: [{ ten: "ds", kieu: "danh_sach", phanTu: [{ ten: "ten", kieu: "chu" }, { ten: "sl", kieu: "so" }, { ten: "ok", kieu: "so" }] }],
});

test("the two shipped rules load and have the documented ids", () => {
    const rules = loadRules();
    assert.deepEqual(rules.map((r) => r.id), ["handover", "speedtest"]);
    const speed = rules.find((r) => r.id === "speedtest")!;
    assert.deepEqual(speed.soLuongMoiBo, { toiThieu: 1, toiDa: 1 });
    assert.equal(speed.truong[0].ten, "mbps");
    assert.equal(rules.find((r) => r.id === "handover")!.docLanHai, "luon");
});

test("a valid rule parses and keeps its fields", () => {
    const r = parseRule(base(), "demo.json");
    assert.equal(r.truong[0].max, 10);
    assert.equal(r.model, undefined);
    assert.equal(parseRule({ ...base(), model: "sonnet" }, "demo.json").model, "sonnet");
});

test("errors name the file and the field path", () => {
    assert.throws(() => parseRule({ ...base(), id: "Khac" }, "demo.json"), /demo\.json: gốc\.id/);
    assert.throws(() => parseRule({ ...base(), id: "khac" }, "khac.json"), /gốc\.id/);
    assert.throws(() => parseRule({ ...base(), version: 0 }, "demo.json"), /gốc\.version/);
    assert.throws(() => parseRule({ ...base(), soLuongMoiBo: { toiThieu: 3, toiDa: 2 } }, "demo.json"), /soLuongMoiBo/);
    assert.throws(() => parseRule({ ...base(), truong: [] }, "demo.json"), /gốc\.truong/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "lạ" }] }, "demo.json"), /truong\[0\]\.kieu/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "so" }, { ten: "a", kieu: "chu" }] }, "demo.json"), /trùng/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "so", min: 5, max: 1 }] }, "demo.json"), /min/);
    assert.throws(() => parseRule({ ...base(), docLanHai: "đôi khi" }, "demo.json"), /docLanHai/);
    assert.throws(() => parseRule({ ...base(), nguongTinCay: "thap" }, "demo.json"), /nguongTinCay/);
});

test("danh_sach needs columns and cannot nest", () => {
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "ds", kieu: "danh_sach" }] }, "demo.json"), /phanTu/);
    const nested = { ...base(), truong: [{ ten: "ds", kieu: "danh_sach", phanTu: [{ ten: "x", kieu: "danh_sach", phanTu: [{ ten: "y", kieu: "so" }] }] }] };
    assert.throws(() => parseRule(nested, "demo.json"), /lồng/);
    assert.throws(() => parseRule({ ...base(), truong: [{ ten: "a", kieu: "so", phanTu: [] }] }, "demo.json"), /phanTu/);
});

test("check rules must point at real list fields and columns", () => {
    const ok = { id: "t", loai: "tong_dong", muc: "cung", trong: "ds", tong: "sl", cong: ["ok"] };
    assert.equal(parseRule({ ...withList(), luatKiemTra: [ok] }, "demo.json").luatKiemTra.length, 1);
    assert.throws(() => parseRule({ ...withList(), luatKiemTra: [{ ...ok, trong: "khong_co" }] }, "demo.json"), /luatKiemTra\[0\]\.trong/);
    assert.throws(() => parseRule({ ...withList(), luatKiemTra: [{ ...ok, cong: ["xx"] }] }, "demo.json"), /cong/);
    assert.throws(() => parseRule({ ...withList(), luatKiemTra: [{ ...ok, muc: "mềm" }] }, "demo.json"), /muc/);
    assert.throws(() => parseRule({ ...withList(), luatKiemTra: [{ ...ok, loai: "lạ" }] }, "demo.json"), /loai/);
    assert.throws(() => parseRule({ ...withList(), luatKiemTra: [ok, ok] }, "demo.json"), /trùng/);
    const eq = { id: "e", loai: "cac_dong_bang_nhau", muc: "canh_bao", trong: "ds", cot: "sl", tenChua: ["a", "b"] };
    assert.equal(parseRule({ ...withList(), luatKiemTra: [eq] }, "demo.json").luatKiemTra[0].loai, "cac_dong_bang_nhau");
    assert.throws(() => parseRule({ ...withList(), luatKiemTra: [{ ...eq, tenChua: ["a"] }] }, "demo.json"), /tenChua/);
    const date = { id: "d", loai: "ngay_gan_gio_gui", muc: "cung", truong: "ngay", toiDaLechNgay: 2 };
    assert.throws(() => parseRule({ ...base(), luatKiemTra: [date] }, "demo.json"), /luatKiemTra\[0\]\.truong/);
});

test("loadRules requires the id to equal the file name, and ignores a missing folder", () => {
    assert.deepEqual(loadRules(path.join(os.tmpdir(), "khong-co-thu-muc-nay")), []);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rules-"));
    fs.writeFileSync(path.join(dir, "demo.json"), JSON.stringify(base()), "utf8");
    assert.equal(loadRules(dir)[0].id, "demo");
    fs.writeFileSync(path.join(dir, "khac-ten.json"), JSON.stringify(base()), "utf8");
    assert.throws(() => loadRules(dir), /khac-ten\.json/);
    fs.writeFileSync(path.join(dir, "khac-ten.json"), "{ không phải json", "utf8");
    assert.throws(() => loadRules(dir), /không phải JSON/);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoRules.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/rules.js'`).

- [ ] **Step 3: Viết `src/vision/rules.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { photoRulesDir } from "../core/paths.js";
import type { CheckLevel, CheckRule, FieldKind, PhotoRule, RuleField, SecondReadMode } from "../types/index.js";

/**
 * Đọc luật ảnh `photo-rules/<mã>.json`. Mọi lỗi nêu tên file và đường dẫn của trường sai để người sửa luật thấy ngay chỗ nào.
 * Thêm một loại ảnh mới chỉ cần thêm một file luật, không sửa code (xem `promptSchema.ts`, `checks.ts`).
 */
const KINDS: FieldKind[] = ["so", "chu", "ngay", "dung_sai", "danh_sach"];
const ID_RE = /^[a-z][a-z0-9_]*$/;
const SECOND_READ: SecondReadMode[] = ["luon", "khi_tin_cay_thap", "khong"];

function fail(file: string, where: string, message: string): never {
    throw new Error(`${file}: ${where}: ${message}`);
}

function asObject(v: unknown, file: string, where: string): Record<string, unknown> {
    if (typeof v !== "object" || v === null || Array.isArray(v)) fail(file, where, "phải là một đối tượng");
    return v as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string, file: string, where: string): string {
    const v = o[key];
    if (typeof v !== "string" || v.trim() === "") fail(file, `${where}.${key}`, "phải là chuỗi không rỗng");
    return v;
}

function posInt(o: Record<string, unknown>, key: string, file: string, where: string): number {
    const v = o[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) fail(file, `${where}.${key}`, "phải là số nguyên dương");
    return v;
}

function parseField(raw: unknown, file: string, where: string, nested: boolean): RuleField {
    const o = asObject(raw, file, where);
    const ten = str(o, "ten", file, where);
    const kieu = o.kieu;
    if (!KINDS.includes(kieu as FieldKind)) fail(file, `${where}.kieu`, `phải là một trong ${KINDS.join(", ")}`);
    const field: RuleField = { ten, kieu: kieu as FieldKind };
    if (o.batBuoc !== undefined) {
        if (typeof o.batBuoc !== "boolean") fail(file, `${where}.batBuoc`, "phải là true hoặc false");
        field.batBuoc = o.batBuoc;
    }
    for (const k of ["min", "max"] as const) {
        if (o[k] === undefined) continue;
        if (typeof o[k] !== "number") fail(file, `${where}.${k}`, "phải là số");
        field[k] = o[k] as number;
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) fail(file, where, "min không được lớn hơn max");
    if (o.goiY !== undefined) {
        if (typeof o.goiY !== "string") fail(file, `${where}.goiY`, "phải là chuỗi");
        field.goiY = o.goiY;
    }
    if (field.kieu === "danh_sach") {
        if (nested) fail(file, where, "danh_sach không được lồng trong danh_sach");
        if (!Array.isArray(o.phanTu) || o.phanTu.length === 0) fail(file, `${where}.phanTu`, "danh_sach cần phanTu không rỗng");
        field.phanTu = o.phanTu.map((p, i) => parseField(p, file, `${where}.phanTu[${i}]`, true));
        assertUnique(field.phanTu.map((p) => p.ten), file, `${where}.phanTu`);
    } else if (o.phanTu !== undefined) {
        fail(file, `${where}.phanTu`, "chỉ trường danh_sach mới có phanTu");
    }
    return field;
}

function assertUnique(names: string[], file: string, where: string): void {
    const seen = new Set<string>();
    for (const n of names) {
        if (seen.has(n)) fail(file, where, `tên trùng: "${n}"`);
        seen.add(n);
    }
}

function parseCheck(raw: unknown, fields: RuleField[], file: string, where: string): CheckRule {
    const o = asObject(raw, file, where);
    const id = str(o, "id", file, where);
    const muc = o.muc;
    if (muc !== "cung" && muc !== "canh_bao") fail(file, `${where}.muc`, 'phải là "cung" hoặc "canh_bao"');
    const level: CheckLevel = muc;
    const columnsOf = (name: string): RuleField[] => {
        const f = fields.find((x) => x.ten === name && x.kieu === "danh_sach");
        if (!f) fail(file, `${where}.trong`, `"${name}" không phải một trường danh_sach của luật`);
        return f.phanTu ?? [];
    };
    const column = (cols: RuleField[], name: string, key: string): void => {
        if (!cols.some((c) => c.ten === name)) fail(file, `${where}.${key}`, `"${name}" không phải một cột của danh sách`);
    };
    switch (o.loai) {
        case "tong_dong": {
            const trong = str(o, "trong", file, where);
            const cols = columnsOf(trong);
            const tong = str(o, "tong", file, where);
            column(cols, tong, "tong");
            if (!Array.isArray(o.cong) || o.cong.length === 0 || o.cong.some((c) => typeof c !== "string")) fail(file, `${where}.cong`, "phải là mảng tên cột không rỗng");
            const cong = o.cong as string[];
            for (const c of cong) column(cols, c, "cong");
            return { id, loai: "tong_dong", muc: level, trong, tong, cong };
        }
        case "cac_dong_bang_nhau": {
            const trong = str(o, "trong", file, where);
            const cols = columnsOf(trong);
            column(cols, "ten", "trong");
            const cot = str(o, "cot", file, where);
            column(cols, cot, "cot");
            if (!Array.isArray(o.tenChua) || o.tenChua.length < 2 || o.tenChua.some((c) => typeof c !== "string")) fail(file, `${where}.tenChua`, "phải là mảng ít nhất hai chuỗi");
            return { id, loai: "cac_dong_bang_nhau", muc: level, trong, cot, tenChua: o.tenChua as string[] };
        }
        case "ngay_gan_gio_gui": {
            const truong = str(o, "truong", file, where);
            if (!fields.some((f) => f.ten === truong && f.kieu === "ngay")) fail(file, `${where}.truong`, `"${truong}" không phải một trường kiểu ngay của luật`);
            const toiDaLechNgay = o.toiDaLechNgay;
            if (typeof toiDaLechNgay !== "number" || !Number.isInteger(toiDaLechNgay) || toiDaLechNgay < 0) fail(file, `${where}.toiDaLechNgay`, "phải là số nguyên không âm");
            return { id, loai: "ngay_gan_gio_gui", muc: level, truong, toiDaLechNgay };
        }
        default:
            return fail(file, `${where}.loai`, "không biết loại luật kiểm tra này (có: tong_dong, cac_dong_bang_nhau, ngay_gan_gio_gui)");
    }
}

export function parseRule(raw: unknown, file: string): PhotoRule {
    const o = asObject(raw, file, "gốc");
    const id = str(o, "id", file, "gốc");
    if (!ID_RE.test(id) || id === "khac") fail(file, "gốc.id", 'phải gồm chữ thường, số, gạch dưới, bắt đầu bằng chữ, và không được là "khac"');
    const version = posInt(o, "version", file, "gốc");
    const sl = asObject(o.soLuongMoiBo, file, "gốc.soLuongMoiBo");
    const toiThieu = posInt(sl, "toiThieu", file, "gốc.soLuongMoiBo");
    const toiDa = posInt(sl, "toiDa", file, "gốc.soLuongMoiBo");
    if (toiDa < toiThieu) fail(file, "gốc.soLuongMoiBo", "toiDa không được nhỏ hơn toiThieu");
    if (!Array.isArray(o.truong) || o.truong.length === 0) fail(file, "gốc.truong", "phải là mảng không rỗng");
    const truong = o.truong.map((f, i) => parseField(f, file, `truong[${i}]`, false));
    assertUnique(truong.map((f) => f.ten), file, "gốc.truong");
    const rawChecks = o.luatKiemTra ?? [];
    if (!Array.isArray(rawChecks)) fail(file, "gốc.luatKiemTra", "phải là mảng");
    const luatKiemTra = rawChecks.map((c, i) => parseCheck(c, truong, file, `luatKiemTra[${i}]`));
    assertUnique(luatKiemTra.map((c) => c.id), file, "gốc.luatKiemTra");
    if (!SECOND_READ.includes(o.docLanHai as SecondReadMode)) fail(file, "gốc.docLanHai", `phải là một trong ${SECOND_READ.join(", ")}`);
    if (o.nguongTinCay !== "cao" && o.nguongTinCay !== "vua") fail(file, "gốc.nguongTinCay", 'phải là "cao" hoặc "vua"');
    const rule: PhotoRule = {
        id,
        version,
        title: str(o, "title", file, "gốc"),
        nhanRa: str(o, "nhanRa", file, "gốc"),
        soLuongMoiBo: { toiThieu, toiDa },
        truong,
        luatKiemTra,
        docLanHai: o.docLanHai as SecondReadMode,
        nguongTinCay: o.nguongTinCay,
    };
    if (o.model !== undefined) rule.model = str(o, "model", file, "gốc");
    return rule;
}

/** Đọc mọi `*.json` trong `dir` (mặc định `photo-rules/`), sắp theo tên file. Thư mục không có thì trả mảng rỗng. */
export function loadRules(dir: string = photoRulesDir): PhotoRule[] {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    return files.map((file) => {
        let raw: unknown;
        try {
            raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8").replace(/^﻿/, ""));
        } catch (err) {
            return fail(file, "gốc", `không phải JSON: ${(err as Error).message}`);
        }
        const rule = parseRule(raw, file);
        if (rule.id !== file.slice(0, -".json".length)) fail(file, "gốc.id", `"${rule.id}" phải trùng tên file (${file.slice(0, -".json".length)})`);
        return rule;
    });
}
```

- [ ] **Step 4: Tạo `photo-rules/speedtest.json`**

```json
{
    "id": "speedtest",
    "version": 1,
    "title": "Ảnh đo tốc độ mạng",
    "nhanRa": "Ảnh chụp màn hình trình duyệt hiện kết quả Fast.com: một số lớn kèm đơn vị Mbps.",
    "soLuongMoiBo": { "toiThieu": 1, "toiDa": 1 },
    "truong": [
        { "ten": "mbps", "kieu": "so", "batBuoc": true, "min": 1, "max": 10000, "goiY": "Số lớn ở giữa màn hình, đơn vị Mbps." }
    ],
    "luatKiemTra": [],
    "docLanHai": "khi_tin_cay_thap",
    "nguongTinCay": "vua"
}
```

- [ ] **Step 5: Tạo `photo-rules/handover.json`**

```json
{
    "id": "handover",
    "version": 1,
    "title": "Biên bản bàn giao phòng máy (viết tay)",
    "nhanRa": "Biên bản giấy viết tay bàn giao phòng máy, có bảng thiết bị và chữ ký; thường từ 2 ảnh trở lên (nhiều trang).",
    "soLuongMoiBo": { "toiThieu": 2, "toiDa": 30 },
    "truong": [
        { "ten": "ngay", "kieu": "ngay", "batBuoc": true, "goiY": "Ngày lập biên bản, đổi sang YYYY-MM-DD." },
        { "ten": "nguoiBanGiao", "kieu": "chu", "batBuoc": true, "goiY": "Họ tên người bàn giao." },
        { "ten": "nguoiNhan", "kieu": "chu", "goiY": "Họ tên người nhận." },
        { "ten": "phong", "kieu": "chu", "batBuoc": true, "goiY": "Tên hoặc số phòng máy." },
        {
            "ten": "phanMem",
            "kieu": "danh_sach",
            "goiY": "Các dòng phần mềm trong biên bản.",
            "phanTu": [
                { "ten": "ten", "kieu": "chu", "batBuoc": true },
                { "ten": "tinhTrang", "kieu": "chu" },
                { "ten": "ghiChu", "kieu": "chu" }
            ]
        },
        {
            "ten": "thietBi",
            "kieu": "danh_sach",
            "goiY": "Các dòng thiết bị: thùng máy, màn hình, bàn phím chuột, tai nghe...",
            "phanTu": [
                { "ten": "ten", "kieu": "chu", "batBuoc": true },
                { "ten": "soLuong", "kieu": "so", "min": 0, "max": 500 },
                { "ten": "hoatDong", "kieu": "so", "min": 0, "max": 500 },
                { "ten": "hong", "kieu": "so", "min": 0, "max": 500 },
                { "ten": "tinhTrang", "kieu": "chu" },
                { "ten": "ghiChu", "kieu": "chu" }
            ]
        },
        { "ten": "hoanThanhBaoTri", "kieu": "dung_sai", "goiY": "Ô tick \"hoàn thành bảo trì\": true nếu đã tick." }
    ],
    "luatKiemTra": [
        { "id": "tong_thiet_bi", "loai": "tong_dong", "muc": "cung", "trong": "thietBi", "tong": "soLuong", "cong": ["hoatDong", "hong"] },
        { "id": "so_luong_bang_nhau", "loai": "cac_dong_bang_nhau", "muc": "canh_bao", "trong": "thietBi", "cot": "soLuong", "tenChua": ["thùng máy", "màn hình", "phím chuột"] },
        { "id": "ngay_hop_le", "loai": "ngay_gan_gio_gui", "muc": "cung", "truong": "ngay", "toiDaLechNgay": 2 }
    ],
    "docLanHai": "luon",
    "nguongTinCay": "cao"
}
```

- [ ] **Step 6: Chạy test**

Run: `node --import tsx --test tests/photoRules.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/vision/rules.ts photo-rules tests/photoRules.test.ts
git commit -m "feat(vision): đọc và kiểm tra luật ảnh, hai luật mẫu speedtest và handover" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lược đồ kết quả và prompt sinh từ luật

**Files:**
- Create: `src/vision/promptSchema.ts`, `tests/helpers/visionFixtures.ts`, `tests/photoPrompt.test.ts`

**Interfaces:**
- Consumes: `PhotoRule`, `Manifest` (Task 1), `loadRules` (Task 2).
- Produces: `PROMPT_VERSION: string` ("1"), `SYSTEM_PROMPT: string`, `buildResultSchema(rules: PhotoRule[]): Record<string, unknown>`, `buildPrompt(rules: PhotoRule[], manifest: Manifest, bundleDir: string): string`; test helper `manifestOf(n: number, extra?: Partial<Manifest>): Manifest`.

- [ ] **Step 1: Viết helper test** `tests/helpers/visionFixtures.ts`

```ts
import { parseGroupName } from "../../src/lesson/schoolArea.js";
import type { BundleReading, Confidence, Manifest } from "../../src/types/index.js";

/** Thời điểm 07:47:52 ngày 2026-10-07 giờ Việt Nam. */
export const T0 = Date.UTC(2026, 9, 7, 0, 47, 52);

/** Manifest của một bộ `n` ảnh (m1..mn, cách nhau 1 ms, đuôi .jpg). */
export function manifestOf(n: number, extra: Partial<Manifest> = {}): Manifest {
    return {
        version: 1,
        bundleId: "20261007-074752-m1",
        day: "2026-10-07",
        status: "closed",
        groupId: "g1",
        groupName: "LC_HoaSen1_HM",
        school: parseGroupName("LC_HoaSen1_HM"),
        sender: { id: "u1", name: "An" },
        firstTs: T0,
        lastTs: T0 + Math.max(0, n - 1),
        texts: [],
        images: Array.from({ length: n }, (_, i) => ({ seq: i + 1, msgId: `m${i + 1}`, ts: T0 + i, source: `images/g1/m${i + 1}.jpg`, file: `${String(i + 1).padStart(2, "0")}.jpg` })),
        ...extra,
    };
}

/** Kết quả đọc dựng sẵn: `loai[i]` là loại của ảnh i+1, `extracted` là giá trị thường, mỗi trường cùng một độ tin cậy. */
export function readingOf(loai: string[], extracted: Record<string, Record<string, unknown>> = {}, conf: Confidence = "cao"): BundleReading {
    return {
        bundleId: "20261007-074752-m1",
        readAt: T0,
        reader: { kind: "claude-p", model: "haiku", promptVersion: "1", ruleVersions: {} },
        images: loai.map((l, i) => ({ seq: i + 1, loai: l, doTinCay: conf })),
        extracted: Object.fromEntries(Object.entries(extracted).map(([rule, fields]) => [rule, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, doTinCay: conf }]))])),
    };
}
```

- [ ] **Step 2: Viết test (đỏ)** `tests/photoPrompt.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadRules } from "../src/vision/rules.js";
import { buildPrompt, buildResultSchema, PROMPT_VERSION, SYSTEM_PROMPT } from "../src/vision/promptSchema.js";
import { manifestOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
type Obj = Record<string, any>;

test("the result schema lists every rule plus khac as an image class", () => {
    const s = buildResultSchema(rules) as Obj;
    assert.deepEqual(s.required, ["images", "extracted"]);
    assert.deepEqual(s.properties.images.items.properties.loai.enum, ["handover", "speedtest", "khac"]);
    assert.deepEqual(s.properties.images.items.required, ["seq", "loai", "doTinCay"]);
    assert.deepEqual(s.properties.images.items.properties.doTinCay.enum, ["cao", "vua", "thap"]);
    assert.doesNotThrow(() => JSON.stringify(s));
});

test("each rule field becomes a value+confidence object with a nullable value", () => {
    const s = buildResultSchema(rules) as Obj;
    const speed = s.properties.extracted.properties.speedtest;
    assert.deepEqual(speed.required, ["mbps"]);
    assert.deepEqual(speed.properties.mbps.properties.value, { type: ["number", "null"] });
    assert.deepEqual(speed.properties.mbps.required, ["value", "doTinCay"]);
    const hand = s.properties.extracted.properties.handover.properties;
    assert.deepEqual(hand.ngay.properties.value, { type: ["string", "null"] });
    assert.deepEqual(hand.hoanThanhBaoTri.properties.value, { type: ["boolean", "null"] });
    const items = hand.thietBi.properties.value.items;
    assert.equal(hand.thietBi.properties.value.type, "array");
    assert.deepEqual(items.required, ["ten", "soLuong", "hoatDong", "hong", "tinhTrang", "ghiChu"]);
    assert.deepEqual(items.properties.soLuong, { type: ["number", "null"] });
});

test("the prompt names every image path in order, every rule, and the field hints", () => {
    const m = manifestOf(2, { texts: [{ msgId: "t1", ts: 1, content: "Báo cáo\n phòng 3 " }] });
    const dir = path.resolve("data/photo-reports/x");
    const p = buildPrompt(rules, m, dir);
    assert.ok(p.indexOf(path.join(dir, "01.jpg")) < p.indexOf(path.join(dir, "02.jpg")));
    for (const r of rules) assert.ok(p.includes(r.nhanRa), r.id);
    assert.ok(p.includes("Số lớn ở giữa màn hình"));
    assert.ok(p.includes("Báo cáo phòng 3"), "text is squeezed onto one line");
    assert.ok(p.includes("khac"));
    assert.ok(p.includes("null"));
});

test("the prompt never contains a first reading, and the constants are set", () => {
    assert.equal(PROMPT_VERSION, "1");
    assert.ok(SYSTEM_PROMPT.length > 20);
    assert.ok(!buildPrompt(rules, manifestOf(1), "d").includes("lần một"));
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoPrompt.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/promptSchema.js'`).

- [ ] **Step 4: Viết `src/vision/promptSchema.ts`**

```ts
import path from "node:path";
import type { FieldKind, Manifest, PhotoRule, RuleField } from "../types/index.js";

/** Tăng khi đổi cách ghép prompt/lược đồ; ghi vào `reading.json` để biết kết quả cũ do phiên bản nào đọc. */
export const PROMPT_VERSION = "1";

export const SYSTEM_PROMPT =
    'Bạn là bộ đọc ảnh báo cáo. Chỉ dùng công cụ Read để mở các ảnh được nêu. Không suy đoán: ô nào không nhìn rõ thì để null và độ tin cậy "thap". Trả lời đúng lược đồ JSON được yêu cầu, không thêm chữ nào khác.';

const CONFIDENCE = { type: "string", enum: ["cao", "vua", "thap"] };

function valueSchema(f: RuleField): Record<string, unknown> {
    switch (f.kieu) {
        case "so":
            return { type: ["number", "null"] };
        case "dung_sai":
            return { type: ["boolean", "null"] };
        case "danh_sach": {
            const cols = f.phanTu ?? [];
            return {
                type: "array",
                items: { type: "object", additionalProperties: false, required: cols.map((c) => c.ten), properties: Object.fromEntries(cols.map((c) => [c.ten, valueSchema(c)])) },
            };
        }
        default:
            return { type: ["string", "null"] };
    }
}

/** Lược đồ JSON của kết quả (truyền cho `claude -p --json-schema`), sinh từ các luật. */
export function buildResultSchema(rules: PhotoRule[]): Record<string, unknown> {
    const classes = [...rules.map((r) => r.id), "khac"];
    const fieldObject = (f: RuleField) => ({
        type: "object",
        additionalProperties: false,
        required: ["value", "doTinCay"],
        properties: { value: valueSchema(f), doTinCay: CONFIDENCE },
    });
    return {
        type: "object",
        additionalProperties: false,
        required: ["images", "extracted"],
        properties: {
            images: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["seq", "loai", "doTinCay"],
                    properties: { seq: { type: "integer" }, loai: { type: "string", enum: classes }, doTinCay: CONFIDENCE },
                },
            },
            extracted: {
                type: "object",
                additionalProperties: false,
                properties: Object.fromEntries(
                    rules.map((r) => [r.id, { type: "object", additionalProperties: false, required: r.truong.map((f) => f.ten), properties: Object.fromEntries(r.truong.map((f) => [f.ten, fieldObject(f)])) }]),
                ),
            },
        },
    };
}

const KIND_LABEL: Record<FieldKind, string> = {
    so: "số",
    chu: "chữ",
    ngay: "ngày dạng YYYY-MM-DD",
    dung_sai: "đúng/sai (true hoặc false)",
    danh_sach: "danh sách, mỗi phần tử có các cột",
};

function fieldLines(fields: RuleField[], indent: string): string[] {
    const lines: string[] = [];
    for (const f of fields) {
        const limits = [f.min !== undefined ? `từ ${f.min}` : "", f.max !== undefined ? `đến ${f.max}` : ""].filter(Boolean).join(" ");
        const parts = [KIND_LABEL[f.kieu], f.batBuoc ? "bắt buộc" : "", limits].filter(Boolean).join(", ");
        lines.push(`${indent}- ${f.ten} (${parts})${f.goiY ? `: ${f.goiY}` : ""}`);
        if (f.phanTu) lines.push(...fieldLines(f.phanTu, `${indent}    `));
    }
    return lines;
}

/** Prompt cho MỘT bộ ảnh. Cả hai lần đọc dùng đúng prompt này; lần hai không bao giờ được thấy kết quả lần một. */
export function buildPrompt(rules: PhotoRule[], manifest: Manifest, bundleDir: string): string {
    const lines: string[] = [];
    lines.push(`Có ${manifest.images.length} ảnh của một báo cáo. Mở từng ảnh bằng công cụ Read theo đúng thứ tự:`);
    for (const img of manifest.images) lines.push(`- Ảnh ${img.seq}: ${path.join(bundleDir, img.file)}`);
    if (manifest.texts.length > 0) {
        lines.push("", "Tin chữ đi kèm của cùng người gửi (chỉ để tham khảo, có thể không liên quan):");
        for (const t of manifest.texts) lines.push(`- ${t.content.replace(/\s+/g, " ").trim()}`);
    }
    lines.push("", 'BƯỚC 1. Xếp từng ảnh vào đúng một loại, hoặc "khac" nếu không khớp loại nào:');
    for (const r of rules) lines.push(`- ${r.id}: ${r.nhanRa}`);
    lines.push("- khac: mọi ảnh còn lại (phòng máy, thiết bị, ảnh không liên quan). Ảnh loại khac không đọc thêm gì.");
    lines.push("", "BƯỚC 2. Với mỗi loại có ảnh, gộp thông tin của TẤT CẢ ảnh thuộc loại đó thành một kết quả theo các trường (loại không có ảnh thì bỏ qua):");
    for (const r of rules) {
        lines.push(`Loại ${r.id}:`);
        lines.push(...fieldLines(r.truong, "  "));
    }
    lines.push("", 'Không suy đoán số hay chữ không nhìn thấy: để null. doTinCay: "cao" = đọc rõ, "vua" = hơi mờ nhưng khá chắc, "thap" = đoán hoặc không rõ.');
    return lines.join("\n");
}
```

- [ ] **Step 5: Chạy test**

Run: `node --import tsx --test tests/photoPrompt.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/vision/promptSchema.ts tests/helpers/visionFixtures.ts tests/photoPrompt.test.ts
git commit -m "feat(vision): sinh lược đồ kết quả và prompt từ luật ảnh" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Gom ảnh thành bộ (hàm thuần)

**Files:**
- Create: `src/vision/bundling.ts`, `tests/photoBundling.test.ts`

**Interfaces:**
- Consumes: `NormalizedMessage`, `ManifestImage`, `ManifestText` (Task 1 / có sẵn).
- Produces:
  - `interface BundleOptions { gapMinutes: number; settleMinutes: number; textWindowMinutes: number }`
  - `interface BundleDraft { bundleId: string; day: string; groupId: string; groupName: string; sender: { id: string; name: string }; firstTs: number; lastTs: number; status: "open" | "closed"; texts: ManifestText[]; images: Array<Omit<ManifestImage, "file">> }`
  - `bundleIdOf(firstTs: number, firstMsgId: string): string` (`yyyyMMdd-HHmmss-<mã tin>` giờ Việt Nam)
  - `groupPhotos(messages: NormalizedMessage[], opts: BundleOptions, now: number): BundleDraft[]`

- [ ] **Step 1: Viết test (đỏ)** `tests/photoBundling.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleIdOf, groupPhotos, type BundleOptions } from "../src/vision/bundling.js";
import type { NormalizedMessage } from "../src/types/index.js";
import { T0 } from "./helpers/visionFixtures.js";

const OPTS: BundleOptions = { gapMinutes: 3, settleMinutes: 5, textWindowMinutes: 10 };
const MIN = 60_000;
const photo = (msgId: string, ts: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
    msgId, groupId: "g1", groupName: "LC_HoaSen1_HM", threadType: "group", senderId: "u1", senderName: "An", isSelf: false, ts, msgType: "chat.photo", content: "", url: `images/g1/${msgId}.jpg`, ...extra,
});
const text = (msgId: string, ts: number, content: string, extra: Partial<NormalizedMessage> = {}) => photo(msgId, ts, { msgType: "desktop.text", content, url: undefined, ...extra });
const NOW = T0 + 60 * MIN;

test("bundleIdOf uses the Vietnam clock of the first photo", () => {
    assert.equal(bundleIdOf(T0, "m1"), "20261007-074752-m1");
});

test("an album (photos a few ms apart) is one bundle in send order", () => {
    const out = groupPhotos([photo("m3", T0 + 20), photo("m1", T0), photo("m2", T0 + 10)], OPTS, NOW);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].images.map((i) => i.msgId), ["m1", "m2", "m3"]);
    assert.deepEqual(out[0].images.map((i) => i.seq), [1, 2, 3]);
    assert.equal(out[0].bundleId, "20261007-074752-m1");
    assert.equal(out[0].day, "2026-10-07");
    assert.equal(out[0].firstTs, T0);
    assert.equal(out[0].lastTs, T0 + 20);
    assert.deepEqual(out[0].sender, { id: "u1", name: "An" });
    assert.equal(out[0].images[0].source, "images/g1/m1.jpg");
});

test("photos sent one by one within the gap stay together; past the gap a new bundle opens", () => {
    const within = groupPhotos([photo("a", T0), photo("b", T0 + 2 * MIN), photo("c", T0 + 4 * MIN)], OPTS, NOW);
    assert.equal(within.length, 1, "each step is under 3 minutes even though the total is 4");
    const past = groupPhotos([photo("a", T0), photo("b", T0 + 3 * MIN + 1)], OPTS, NOW);
    assert.equal(past.length, 2);
});

test("two senders interleaved milliseconds apart make two bundles", () => {
    const out = groupPhotos([photo("a1", T0), photo("b1", T0 + 5, { senderId: "u2", senderName: "Bình" }), photo("a2", T0 + 10), photo("b2", T0 + 15, { senderId: "u2", senderName: "Bình" })], OPTS, NOW);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((b) => b.sender.id).sort(), ["u1", "u2"]);
    assert.deepEqual(out.find((b) => b.sender.id === "u1")!.images.map((i) => i.msgId), ["a1", "a2"]);
});

test("each group has its own bundles", () => {
    const out = groupPhotos([photo("a", T0), photo("b", T0 + 1, { groupId: "g2", groupName: "LC_X_BD", url: "images/g2/b.jpg" })], OPTS, NOW);
    assert.equal(out.length, 2);
});

test("a bundle stays open until it has been quiet for settleMinutes", () => {
    assert.equal(groupPhotos([photo("a", T0)], OPTS, T0 + 5 * MIN - 1)[0].status, "open");
    assert.equal(groupPhotos([photo("a", T0)], OPTS, T0 + 5 * MIN)[0].status, "closed");
});

test("photos without a saved file and the account's own photos are ignored", () => {
    const out = groupPhotos([photo("a", T0, { url: undefined }), photo("b", T0 + 1, { isSelf: true }), photo("c", T0 + 2)], OPTS, NOW);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].images.map((i) => i.msgId), ["c"]);
    assert.deepEqual(groupPhotos([photo("a", T0, { url: undefined })], OPTS, NOW), []);
});

test("texts of the same sender within the window, and photo captions, are attached; others are not", () => {
    const out = groupPhotos(
        [
            text("t0", T0 - 9 * MIN, "tiêu đề trước"),
            text("t1", T0 + 20 + 9 * MIN, "ghi chú sau"),
            text("far", T0 - 11 * MIN, "quá xa"),
            text("other", T0, "người khác", { senderId: "u2" }),
            text("blank", T0, "   "),
            photo("m1", T0, { content: "chú thích ảnh" }),
            photo("m2", T0 + 20),
        ],
        OPTS,
        NOW,
    );
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].texts.map((t) => t.content), ["tiêu đề trước", "chú thích ảnh", "ghi chú sau"]);
});

test("running it again on the same messages gives the same bundle ids", () => {
    const msgs = [photo("m1", T0), photo("m2", T0 + 10)];
    assert.deepEqual(groupPhotos(msgs, OPTS, NOW).map((b) => b.bundleId), groupPhotos(msgs, OPTS, NOW).map((b) => b.bundleId));
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoBundling.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/bundling.js'`).

- [ ] **Step 3: Viết `src/vision/bundling.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { vietnamDay } from "../lesson/time.js";
import type { ManifestImage, ManifestText, NormalizedMessage } from "../types/index.js";

/**
 * Gom ảnh của từng nhóm thành BỘ ẢNH (mỗi bộ là một báo cáo). Hàm thuần: nhận tin, trả bản nháp; việc ghi thư mục ở `bundleStore.ts`.
 * Luật: hai ảnh liên tiếp của CÙNG người gửi cách nhau không quá `gapMinutes` thì cùng bộ (đúng cho album lẫn ảnh gửi rời); khác người
 * hoặc quá ngưỡng thì mở bộ mới; bộ `open` cho tới khi yên `settleMinutes` kể từ ảnh cuối.
 */
export interface BundleOptions {
    gapMinutes: number;
    settleMinutes: number;
    textWindowMinutes: number;
}

export interface BundleDraft {
    bundleId: string;
    day: string;
    groupId: string;
    groupName: string;
    sender: { id: string; name: string };
    firstTs: number;
    lastTs: number;
    status: "open" | "closed";
    texts: ManifestText[];
    images: Array<Omit<ManifestImage, "file">>;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE = 60_000;

/** `yyyyMMdd-HHmmss-<mã tin ảnh đầu>` theo đồng hồ Việt Nam: cùng ảnh đầu thì luôn cùng mã bộ. */
export function bundleIdOf(firstTs: number, firstMsgId: string): string {
    const iso = new Date(firstTs + VN_OFFSET_MS).toISOString();
    return `${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 19).replace(/:/g, "")}-${firstMsgId}`;
}

const isUsablePhoto = (m: NormalizedMessage): boolean => m.msgType === "chat.photo" && !m.isSelf && typeof m.url === "string" && m.url !== "";

export function groupPhotos(messages: NormalizedMessage[], opts: BundleOptions, now: number): BundleDraft[] {
    const gapMs = opts.gapMinutes * MINUTE;
    const settleMs = opts.settleMinutes * MINUTE;
    const windowMs = opts.textWindowMinutes * MINUTE;

    const byGroup = new Map<string, NormalizedMessage[]>();
    for (const m of messages) {
        const list = byGroup.get(m.groupId);
        if (list) list.push(m);
        else byGroup.set(m.groupId, [m]);
    }

    const out: BundleDraft[] = [];
    for (const rows of byGroup.values()) {
        rows.sort((a, b) => a.ts - b.ts);
        const flush = (photos: NormalizedMessage[]): void => {
            if (photos.length === 0) return;
            const first = photos[0];
            const last = photos[photos.length - 1];
            const texts = rows
                .filter((m) => !m.isSelf && m.senderId === first.senderId && m.content.trim() !== "" && (m.msgType === "chat.photo" ? photos.includes(m) : m.ts >= first.ts - windowMs && m.ts <= last.ts + windowMs))
                .map((m) => ({ msgId: m.msgId, ts: m.ts, content: m.content.trim() }));
            out.push({
                bundleId: bundleIdOf(first.ts, first.msgId),
                day: vietnamDay(first.ts),
                groupId: first.groupId,
                groupName: first.groupName,
                sender: { id: first.senderId, name: first.senderName },
                firstTs: first.ts,
                lastTs: last.ts,
                status: now - last.ts >= settleMs ? "closed" : "open",
                texts,
                images: photos.map((p, i) => ({ seq: i + 1, msgId: p.msgId, ts: p.ts, source: p.url as string })),
            });
        };

        let current: NormalizedMessage[] = [];
        for (const p of rows.filter(isUsablePhoto)) {
            const prev = current[current.length - 1];
            if (prev && (prev.senderId !== p.senderId || p.ts - prev.ts > gapMs)) {
                flush(current);
                current = [];
            }
            current.push(p);
        }
        flush(current);
    }
    return out;
}

/**
 * Bản nháp từ một danh sách file ảnh rời (bộ ảnh mẫu `--from-dir`, ca golden): ảnh không nằm trong kho tin nên không có người gửi hay
 * nhóm thật. Giờ lấy từ 13 chữ số đầu tên file (giờ gửi của Zalo, mili giây) nếu có, không thì giờ sửa file. `source` là đường tuyệt đối.
 */
export function draftFromFiles(files: string[], label: string): BundleDraft {
    if (files.length === 0) throw new Error("draftFromFiles: không có file ảnh nào");
    const sorted = [...files].sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
    const images = sorted.map((file, i) => {
        const base = path.basename(file);
        const lead = /^(\d{13})/.exec(base);
        return { seq: i + 1, msgId: base.replace(/\.[^.]+$/, ""), ts: lead ? Number(lead[1]) : Math.floor(fs.statSync(file).mtimeMs), source: path.resolve(file) };
    });
    const firstTs = images[0].ts;
    return {
        bundleId: bundleIdOf(firstTs, label),
        day: vietnamDay(firstTs),
        groupId: "mau",
        groupName: label,
        sender: { id: "mau", name: "mau" },
        firstTs,
        lastTs: images[images.length - 1].ts,
        status: "closed",
        texts: [],
        images,
    };
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/photoBundling.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vision/bundling.ts tests/photoBundling.test.ts
git commit -m "feat(vision): gom ảnh thành bộ theo người gửi và khoảng cách thời gian" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ghi thư mục bộ và lệnh `photos:bundle`

**Files:**
- Create: `src/vision/bundleStore.ts`, `src/cli/photos-bundle.ts`, `tests/photoBundleStore.test.ts`
- Modify: `package.json` (thêm script `"photos:bundle": "tsx src/cli/photos-bundle.ts"` sau `"today"`)

**Interfaces:**
- Consumes: `BundleDraft`, `draftFromFiles`, `groupPhotos` (Task 4); `Manifest`; `writeFileAtomic` (`src/core/atomicWrite.ts`); `photoReportsDir`; `parseGroupName`.
- Produces:
  - `bundleDirOf(root: string, day: string, groupId: string, bundleId: string): string`
  - `readManifest(dir: string): Manifest | null`
  - `listBundleDirs(root: string, day?: string): string[]` (chỉ các thư mục có `manifest.json` ở dạng `<root>/<yyyy-MM-dd>/<nhóm>/<bộ>`)
  - `writeBundle(root: string, dataDir: string, draft: BundleDraft, school: SchoolArea): { dir: string; state: "new" | "updated" | "unchanged" | "skipped"; dropped: number }`

- [ ] **Step 1: Viết test (đỏ)** `tests/photoBundleStore.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundleDirOf, listBundleDirs, readManifest, writeBundle } from "../src/vision/bundleStore.js";
import { draftFromFiles, groupPhotos } from "../src/vision/bundling.js";
import { parseGroupName } from "../src/lesson/schoolArea.js";
import type { NormalizedMessage } from "../src/types/index.js";
import { T0 } from "./helpers/visionFixtures.js";

const SCHOOL = parseGroupName("LC_HoaSen1_HM");
const OPTS = { gapMinutes: 3, settleMinutes: 5, textWindowMinutes: 10 };

function world() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));
    const dataDir = path.join(base, "data");
    const root = path.join(dataDir, "photo-reports");
    fs.mkdirSync(path.join(dataDir, "images", "g1"), { recursive: true });
    const addImage = (id: string, content = id) => fs.writeFileSync(path.join(dataDir, "images", "g1", `${id}.jpg`), content);
    return { dataDir, root, addImage };
}
const photo = (msgId: string, ts: number): NormalizedMessage => ({ msgId, groupId: "g1", groupName: "LC_HoaSen1_HM", threadType: "group", senderId: "u1", senderName: "An", isSelf: false, ts, msgType: "chat.photo", content: "", url: `images/g1/${msgId}.jpg` });
const draftOf = (ids: string[], now = T0 + 3_600_000) => groupPhotos(ids.map((id, i) => photo(id, T0 + i)), OPTS, now)[0];

test("a new bundle gets numbered image copies and a manifest", () => {
    const w = world();
    ["m1", "m2"].forEach((id) => w.addImage(id));
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(r.state, "new");
    assert.equal(r.dir, bundleDirOf(w.root, "2026-10-07", "g1", "20261007-074752-m1"));
    assert.equal(fs.readFileSync(path.join(r.dir, "01.jpg"), "utf8"), "m1");
    assert.equal(fs.readFileSync(path.join(r.dir, "02.jpg"), "utf8"), "m2");
    const m = readManifest(r.dir)!;
    assert.equal(m.status, "closed");
    assert.deepEqual(m.images.map((i) => i.file), ["01.jpg", "02.jpg"]);
    assert.deepEqual(m.school, SCHOOL);
    assert.equal(m.reread, undefined);
});

test("running it again changes nothing", () => {
    const w = world();
    ["m1", "m2"].forEach((id) => w.addImage(id));
    writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL).state, "unchanged");
});

test("open -> closed rewrites only the manifest", () => {
    const w = world();
    ["m1"].forEach((id) => w.addImage(id));
    assert.equal(writeBundle(w.root, w.dataDir, draftOf(["m1"], T0 + 1000), SCHOOL).state, "new");
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1"]), SCHOOL);
    assert.equal(r.state, "updated");
    assert.equal(readManifest(r.dir)!.status, "closed");
});

test("a photo that arrives after the bundle was read marks it for re-reading and renumbers in order", () => {
    const w = world();
    ["m1", "m3"].forEach((id) => w.addImage(id));
    const first = writeBundle(w.root, w.dataDir, draftOf(["m1", "m3"]), SCHOOL);
    fs.writeFileSync(path.join(first.dir, "reading.json"), "{}", "utf8");
    w.addImage("m2");
    const late = groupPhotos([photo("m1", T0), photo("m2", T0 + 1), photo("m3", T0 + 2)], OPTS, T0 + 3_600_000)[0];
    const r = writeBundle(w.root, w.dataDir, late, SCHOOL);
    assert.equal(r.state, "updated");
    assert.equal(r.dir, first.dir, "same first photo, same bundle folder");
    const m = readManifest(r.dir)!;
    assert.equal(m.reread, true);
    assert.deepEqual(m.images.map((i) => i.msgId), ["m1", "m2", "m3"]);
    assert.equal(fs.readFileSync(path.join(r.dir, "02.jpg"), "utf8"), "m2");
    assert.equal(fs.readFileSync(path.join(r.dir, "03.jpg"), "utf8"), "m3");
    assert.equal(listBundleDirs(w.root).length, 1, "no duplicate bundle");
});

test("a late photo before any reading does not set the re-read flag", () => {
    const w = world();
    ["m1", "m2"].forEach((id) => w.addImage(id));
    writeBundle(w.root, w.dataDir, draftOf(["m1"]), SCHOOL);
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(readManifest(r.dir)!.reread, undefined);
});

test("images whose source file is gone are dropped; a bundle with none left is skipped", () => {
    const w = world();
    w.addImage("m1");
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(r.dropped, 1);
    assert.deepEqual(readManifest(r.dir)!.images.map((i) => i.msgId), ["m1"]);
    const none = writeBundle(w.root, w.dataDir, draftOf(["x1"]), SCHOOL);
    assert.equal(none.state, "skipped");
});

test("listBundleDirs finds bundles by day and ignores other folders", () => {
    const w = world();
    ["m1"].forEach((id) => w.addImage(id));
    writeBundle(w.root, w.dataDir, draftOf(["m1"]), SCHOOL);
    fs.mkdirSync(path.join(w.root, "golden", "x", "y"), { recursive: true });
    assert.equal(listBundleDirs(w.root).length, 1);
    assert.equal(listBundleDirs(w.root, "2026-10-07").length, 1);
    assert.equal(listBundleDirs(w.root, "2026-10-08").length, 0);
});

test("draftFromFiles builds one closed bundle from loose files, time from the file name", () => {
    const w = world();
    const a = path.join(w.dataDir, "1791334072487_x.jpg");
    const b = path.join(w.dataDir, "1791334072471_x.jpg");
    fs.writeFileSync(a, "a");
    fs.writeFileSync(b, "b");
    const d = draftFromFiles([a, b], "mau-1");
    assert.deepEqual(d.images.map((i) => i.msgId), ["1791334072471_x", "1791334072487_x"]);
    assert.equal(d.status, "closed");
    assert.equal(d.firstTs, 1791334072471);
    assert.ok(d.bundleId.endsWith("-mau-1"));
    const r = writeBundle(w.root, w.dataDir, d, parseGroupName("mau-1"));
    assert.equal(fs.readFileSync(path.join(r.dir, "01.jpg"), "utf8"), "b", "absolute source works");
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoBundleStore.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/bundleStore.js'`).

- [ ] **Step 3: Viết `src/vision/bundleStore.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { BundleDraft } from "./bundling.js";
import type { Manifest, ManifestImage, SchoolArea } from "../types/index.js";

/**
 * Thư mục dẫn xuất của một bộ ảnh: `<root>/<yyyy-MM-dd>/<mã nhóm>/<mã bộ>/` gồm `manifest.json`, ảnh đánh số `01.jpg 02.jpg ...`
 * (liên kết cứng tới ảnh gốc, không được thì sao chép), `reading.json`, `review.json`. Kho ảnh gốc không bao giờ bị sửa.
 */
export function bundleDirOf(root: string, day: string, groupId: string, bundleId: string): string {
    return path.join(root, day, groupId, bundleId);
}

export function readManifest(dir: string): Manifest | null {
    const file = path.join(dir, "manifest.json");
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as Manifest;
    } catch {
        return null;
    }
}

const subdirs = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

/** Mọi thư mục bộ có `manifest.json` (chỉ các thư mục ngày dạng yyyy-MM-dd; thư mục `golden` bị bỏ qua). */
export function listBundleDirs(root: string, day?: string): string[] {
    const days = day ? [day] : subdirs(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const out: string[] = [];
    for (const d of days) {
        for (const group of subdirs(path.join(root, d))) {
            for (const bundle of subdirs(path.join(root, d, group))) {
                const dir = path.join(root, d, group, bundle);
                if (fs.existsSync(path.join(dir, "manifest.json"))) out.push(dir);
            }
        }
    }
    return out.sort();
}

function link(src: string, dest: string): void {
    try {
        fs.linkSync(src, dest);
    } catch {
        fs.copyFileSync(src, dest);
    }
}

const NUMBERED = /^\d{2,}\.[a-z0-9]+$/i;

/**
 * Ghi (hoặc cập nhật) thư mục của một bản nháp. Chạy lại không tạo bộ trùng: cùng ảnh đầu thì cùng thư mục.
 *  - ảnh gốc không còn trên đĩa bị bỏ (`dropped`); không còn ảnh nào thì `skipped`;
 *  - đổi danh sách ảnh: xoá ảnh đánh số cũ rồi liên kết lại, đánh số theo đúng thứ tự gửi; nếu bộ đã có `reading.json` thì đặt
 *    `reread: true` để `photos:read` đọc lại;
 *  - chỉ đổi trạng thái/tin chữ: ghi lại manifest, không đụng ảnh.
 */
export function writeBundle(root: string, dataDir: string, draft: BundleDraft, school: SchoolArea): { dir: string; state: "new" | "updated" | "unchanged" | "skipped"; dropped: number } {
    const dir = bundleDirOf(root, draft.day, draft.groupId, draft.bundleId);
    const present = draft.images.filter((i) => fs.existsSync(path.resolve(dataDir, i.source)));
    const dropped = draft.images.length - present.length;
    if (present.length === 0) return { dir, state: "skipped", dropped };

    const images: ManifestImage[] = present.map((i, n) => ({ ...i, seq: n + 1, file: `${String(n + 1).padStart(2, "0")}${path.extname(i.source).toLowerCase() || ".jpg"}` }));
    const old = readManifest(dir);
    const sameImages = old !== null && JSON.stringify(old.images.map((i) => i.msgId)) === JSON.stringify(images.map((i) => i.msgId));

    const manifest: Manifest = {
        version: 1,
        bundleId: draft.bundleId,
        day: draft.day,
        status: draft.status,
        groupId: draft.groupId,
        groupName: draft.groupName,
        school,
        sender: draft.sender,
        firstTs: draft.firstTs,
        lastTs: draft.lastTs,
        texts: draft.texts,
        images,
    };

    if (old && sameImages) {
        if (old.reread) manifest.reread = true;
        if (JSON.stringify(old) === JSON.stringify(manifest)) return { dir, state: "unchanged", dropped };
        writeFileAtomic(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
        return { dir, state: "updated", dropped };
    }

    fs.mkdirSync(dir, { recursive: true });
    if (old) {
        for (const f of fs.readdirSync(dir)) if (NUMBERED.test(f)) fs.rmSync(path.join(dir, f), { force: true });
        if (fs.existsSync(path.join(dir, "reading.json")) || old.reread) manifest.reread = true;
    }
    for (const img of images) link(path.resolve(dataDir, img.source), path.join(dir, img.file));
    writeFileAtomic(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return { dir, state: old ? "updated" : "new", dropped };
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/photoBundleStore.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Viết lệnh `src/cli/photos-bundle.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { parseGroupName } from "../lesson/schoolArea.js";
import { MessageStore } from "../store/messageStore.js";
import { draftFromFiles, groupPhotos } from "../vision/bundling.js";
import { writeBundle } from "../vision/bundleStore.js";
import type { NormalizedMessage } from "../types/index.js";

/**
 * Gom ảnh thành bộ và ghi `data/photo-reports/<ngày>/<nhóm>/<bộ>/manifest.json` cùng ảnh đánh số (liên kết cứng). Không đọc ảnh,
 * không đụng DB/Excel/kho tin; chạy lại an toàn (không tạo bộ trùng).
 *
 *   npm run photos:bundle -- [--day YYYY-MM-DD] [--group <mã nhóm>] [--from-dir <thư mục ảnh rời>]
 *
 * --from-dir  gom TOÀN BỘ ảnh trong thư mục thành MỘT bộ đã đóng (bộ ảnh mẫu, ảnh không nằm trong kho tin).
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

async function main(): Promise<void> {
    const root = photoReportsDir(config.dataDir);
    const fromDir = option("--from-dir");
    const counts = { new: 0, updated: 0, unchanged: 0, skipped: 0, dropped: 0, open: 0 };

    if (fromDir) {
        const files = fs.readdirSync(fromDir).filter((f) => IMAGE_FILE.test(f)).map((f) => path.join(fromDir, f));
        if (files.length === 0) throw new Error(`Không có ảnh nào trong "${fromDir}".`);
        const label = path.basename(path.resolve(fromDir));
        const r = writeBundle(root, config.dataDir, draftFromFiles(files, label), parseGroupName(label));
        counts[r.state] += 1;
        counts.dropped += r.dropped;
        console.log(`[photos:bundle] ${files.length} ảnh -> ${r.dir} (${r.state})`);
    } else {
        const store = new MessageStore();
        const only = option("--group");
        const day = option("--day");
        const messages: NormalizedMessage[] = [];
        for (const groupId of only ? [only] : store.listThreads()) messages.push(...(await store.readThread(groupId)));
        const drafts = groupPhotos(messages, config.vision.bundle, Date.now()).filter((d) => !day || d.day === day);
        for (const draft of drafts) {
            const r = writeBundle(root, config.dataDir, draft, parseGroupName(config.groupAliases[draft.groupName] ?? draft.groupName));
            counts[r.state] += 1;
            counts.dropped += r.dropped;
            if (draft.status === "open") counts.open += 1;
            if (r.state !== "unchanged") console.log(`[photos:bundle] ${draft.groupName} ${draft.bundleId}: ${draft.images.length} ảnh, ${draft.status} (${r.state})`);
        }
        if (drafts.length === 0) console.log("[photos:bundle] không có ảnh nào để gom.");
    }
    console.log(`[photos:bundle] mới ${counts.new}, cập nhật ${counts.updated}, không đổi ${counts.unchanged}, bỏ qua ${counts.skipped}, còn mở ${counts.open}, ảnh gốc mất ${counts.dropped} -> ${root}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
```

Thêm vào `package.json` scripts: `"photos:bundle": "tsx src/cli/photos-bundle.ts",`.

- [ ] **Step 6: Kiểm tra kiểu và chạy thử không tốn token**

Run: `npm run typecheck` rồi `npx tsx src/cli/photos-bundle.ts --from-dir data/images/AI_reading_picture`
Expected: in `[photos:bundle] 16 ảnh -> ...data\photo-reports\2026-10-0X\mau\...\ (new)` (hoặc 15, tuỳ số file trong thư mục; xem Task 11 về file thừa), và thư mục có `manifest.json`, `01.jpg`...

- [ ] **Step 7: Commit**

```bash
git add src/vision/bundleStore.ts src/cli/photos-bundle.ts tests/photoBundleStore.test.ts package.json
git commit -m "feat(vision): ghi thư mục bộ ảnh và lệnh photos:bundle" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `VisionReader` bằng `claude -p`

**Files:**
- Create: `src/vision/claudeReader.ts`, `tests/claudeReader.test.ts`

**Interfaces:**
- Consumes: `VisionReader`, `ReadInput`, `ReadResult`, `BundleReading`, `PhotoRule`, `Manifest` (Task 1); `buildPrompt`, `buildResultSchema`, `SYSTEM_PROMPT`, `PROMPT_VERSION` (Task 3).
- Produces:
  - `interface ProcessOutcome { code: number | null; stdout: string; stderr: string; timedOut: boolean }`
  - `type RunProcess = (command: string, args: string[], opts: { cwd: string; input: string; timeoutMs: number }) => Promise<ProcessOutcome>`
  - `runProcess: RunProcess` (thật, dùng `spawn`)
  - `parseClaudeOutput(stdout: string, ctx: { manifest: Manifest; rules: PhotoRule[]; requestedModel: string; readAt: number }): ReadResult`
  - `makeClaudeReader(opts: { model: string; secondModel: string; timeoutMs: number; run?: RunProcess; cwd?: string; command?: string; now?: () => number }): VisionReader`

- [ ] **Step 1: Viết test (đỏ)** `tests/claudeReader.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeClaudeReader, parseClaudeOutput, type ProcessOutcome, type RunProcess } from "../src/vision/claudeReader.js";
import { loadRules } from "../src/vision/rules.js";
import { manifestOf, T0 } from "./helpers/visionFixtures.js";

const rules = loadRules();
const ok = (structured: unknown, extra: Record<string, unknown> = {}): ProcessOutcome => ({
    code: 0, stderr: "", timedOut: false,
    stdout: JSON.stringify({ type: "result", is_error: false, structured_output: structured, modelUsage: { "claude-haiku-4-5-20251001": {} }, ...extra }),
});
const good = {
    images: [{ seq: 1, loai: "speedtest", doTinCay: "cao" }, { seq: 2, loai: "khac", doTinCay: "vua" }],
    extracted: { speedtest: { mbps: { value: 75, doTinCay: "cao" } } },
};
const ctx = { manifest: manifestOf(2), rules, requestedModel: "haiku", readAt: T0 };

test("a good answer becomes a reading with the real model id and rule versions", () => {
    const r = parseClaudeOutput(ok(good).stdout, ctx);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.reading.reader.model, "claude-haiku-4-5-20251001");
    assert.deepEqual(r.reading.reader.ruleVersions, { handover: 1, speedtest: 1 });
    assert.equal(r.reading.reader.promptVersion, "1");
    assert.deepEqual(r.reading.images.map((i) => i.loai), ["speedtest", "khac"]);
    assert.deepEqual(r.reading.extracted.speedtest.mbps, { value: 75, doTinCay: "cao" });
    assert.equal(r.reading.bundleId, "20261007-074752-m1");
    assert.equal(r.reading.readAt, T0);
});

test("missing fields become null with low confidence, unknown classes become khac, extra keys are ignored", () => {
    const r = parseClaudeOutput(
        ok({ images: [{ seq: 1, loai: "la-hoai", doTinCay: "cao" }, { seq: 2, loai: "handover", doTinCay: "xyz" }], extracted: { handover: { ngay: { value: "2026-10-07", doTinCay: "cao" } }, la: {} } }).stdout,
        ctx,
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.reading.images[0].loai, "khac");
    assert.equal(r.reading.images[1].doTinCay, "thap");
    assert.deepEqual(r.reading.extracted.handover.phong, { value: null, doTinCay: "thap" });
    assert.equal(r.reading.extracted.la, undefined);
});

test("garbage, an error result, a missing structured_output and a skipped image are errors, never throws", () => {
    for (const out of ["", "không phải json", "[]"]) assert.equal(parseClaudeOutput(out, ctx).ok, false, out);
    const err = parseClaudeOutput(JSON.stringify({ is_error: true, result: "Not logged in" }), ctx);
    assert.ok(!err.ok && /Not logged in/.test(err.error));
    const none = parseClaudeOutput(JSON.stringify({ is_error: false, result: "xin chào" }), ctx);
    assert.ok(!none.ok && /structured_output/.test(none.error));
    const skipped = parseClaudeOutput(ok({ images: [{ seq: 1, loai: "speedtest", doTinCay: "cao" }], extracted: {} }).stdout, ctx);
    assert.ok(!skipped.ok && /ảnh 2/.test(skipped.error));
});

test("the reader runs claude with the documented flags, the prompt on stdin, in a clean folder", async () => {
    let seen: { command: string; args: string[]; cwd: string; input: string; timeoutMs: number } | undefined;
    const run: RunProcess = async (command, args, o) => ((seen = { command, args, ...o }), ok(good));
    const reader = makeClaudeReader({ model: "haiku", secondModel: "sonnet", timeoutMs: 5000, run, now: () => T0 });
    const r = await reader.readBundle({ bundleDir: "D:/x/bundle", manifest: manifestOf(2), rules, pass: 1 });
    assert.ok(r.ok);
    assert.ok(seen);
    const a = seen.args;
    assert.equal(seen.command, "claude");
    assert.ok(a.includes("-p"));
    assert.equal(a[a.indexOf("--model") + 1], "haiku");
    assert.equal(a[a.indexOf("--output-format") + 1], "json");
    assert.equal(a[a.indexOf("--allowedTools") + 1], "Read");
    assert.equal(a[a.indexOf("--add-dir") + 1], "D:/x/bundle");
    assert.equal(a[a.indexOf("--setting-sources") + 1], "user");
    for (const flag of ["--disable-slash-commands", "--no-session-persistence", "--json-schema", "--system-prompt"]) assert.ok(a.includes(flag), flag);
    assert.ok(!a.includes("--bare"));
    assert.equal(JSON.parse(a[a.indexOf("--json-schema") + 1]).required[0], "images");
    assert.ok(seen.input.includes("Ảnh 1:"));
    assert.equal(seen.timeoutMs, 5000);
    assert.ok(!seen.cwd.includes("zca-scrape-message"), "clean working folder, not the project");
});

test("pass 2 uses secondModel", async () => {
    const models: string[] = [];
    const run: RunProcess = async (_c, args) => (models.push(args[args.indexOf("--model") + 1]), ok(good));
    const reader = makeClaudeReader({ model: "haiku", secondModel: "sonnet", timeoutMs: 1, run });
    await reader.readBundle({ bundleDir: "d", manifest: manifestOf(2), rules, pass: 1 });
    await reader.readBundle({ bundleDir: "d", manifest: manifestOf(2), rules, pass: 2 });
    assert.deepEqual(models, ["haiku", "sonnet"]);
});

test("timeout, non-zero exit and a process that cannot start are errors", async () => {
    const mk = (o: ProcessOutcome) => makeClaudeReader({ model: "haiku", secondModel: "haiku", timeoutMs: 2000, run: async () => o });
    const input = { bundleDir: "d", manifest: manifestOf(2), rules, pass: 1 as const };
    const t = await mk({ code: null, stdout: "", stderr: "", timedOut: true }).readBundle(input);
    assert.ok(!t.ok && /2 giây/.test(t.error));
    const c = await mk({ code: 1, stdout: "", stderr: "Please run /login", timedOut: false }).readBundle(input);
    assert.ok(!c.ok && /mã 1/.test(c.error) && /login/.test(c.error));
    const s = await mk({ code: null, stdout: "", stderr: "spawn claude ENOENT", timedOut: false }).readBundle(input);
    assert.ok(!s.ok && /ENOENT/.test(s.error));
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/claudeReader.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/claudeReader.js'`).

- [ ] **Step 3: Viết `src/vision/claudeReader.ts`**

```ts
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPrompt, buildResultSchema, PROMPT_VERSION, SYSTEM_PROMPT } from "./promptSchema.js";
import type { BundleReading, Confidence, FieldReading, Manifest, PhotoRule, ReadResult, VisionReader } from "../types/index.js";

/**
 * Đọc một bộ ảnh bằng `claude -p` (đăng nhập Claude Code trên máy, gói subscription). MỘT lần gọi cho CẢ BỘ; prompt đi qua stdin (không
 * bị cắt bởi giới hạn dòng lệnh, không vướng cờ nhiều giá trị `--allowedTools`/`--add-dir`); chạy ở thư mục tạm SẠCH để agent không
 * nạp `CLAUDE.md` của dự án. Không dùng `--bare` (chỉ nhận ANTHROPIC_API_KEY, không đọc đăng nhập OAuth). Kết quả nằm ở
 * `structured_output` của JSON trả về. Không bao giờ ném lỗi: mọi sự cố trả về `{ ok: false, error }`.
 */
export interface ProcessOutcome {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
export type RunProcess = (command: string, args: string[], opts: { cwd: string; input: string; timeoutMs: number }) => Promise<ProcessOutcome>;

export const runProcess: RunProcess = (command, args, { cwd, input, timeoutMs }) =>
    new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        let settled = false;
        let timer: NodeJS.Timeout | undefined;
        const done = (code: number | null, extraErr = ""): void => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolve({ code, stdout, stderr: stderr + extraErr, timedOut });
        };
        let child;
        try {
            child = spawn(command, args, { cwd, windowsHide: true });
        } catch (err) {
            done(null, (err as Error).message);
            return;
        }
        child.stdout.on("data", (d) => (stdout += String(d)));
        child.stderr.on("data", (d) => (stderr += String(d)));
        child.on("error", (err) => done(null, err.message));
        child.on("close", (code) => done(code));
        child.stdin.on("error", () => undefined);
        timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);
        child.stdin.end(input);
    });

const CONFIDENCE: Confidence[] = ["cao", "vua", "thap"];
const asConfidence = (v: unknown): Confidence => (CONFIDENCE.includes(v as Confidence) ? (v as Confidence) : "thap");
const tail = (s: string): string => s.trim().slice(-300);

export function parseClaudeOutput(stdout: string, ctx: { manifest: Manifest; rules: PhotoRule[]; requestedModel: string; readAt: number }): ReadResult {
    let outer: unknown;
    try {
        outer = JSON.parse(stdout.trim());
    } catch {
        return { ok: false, error: `đầu ra của claude không phải JSON: ${tail(stdout) || "(rỗng)"}` };
    }
    if (typeof outer !== "object" || outer === null || Array.isArray(outer)) return { ok: false, error: "đầu ra của claude không phải một đối tượng JSON" };
    const o = outer as Record<string, unknown>;
    if (o.is_error === true) return { ok: false, error: `claude báo lỗi: ${String(o.result ?? "(không có nội dung)")}` };
    const s = o.structured_output;
    if (typeof s !== "object" || s === null || Array.isArray(s)) return { ok: false, error: "claude không trả structured_output" };
    const so = s as { images?: unknown; extracted?: unknown };
    if (!Array.isArray(so.images)) return { ok: false, error: "structured_output thiếu danh sách images" };

    const ruleIds = new Set(ctx.rules.map((r) => r.id));
    const images: BundleReading["images"] = [];
    for (const img of ctx.manifest.images) {
        const found = (so.images as Array<Record<string, unknown>>).find((x) => x && x.seq === img.seq);
        if (!found) return { ok: false, error: `agent bỏ sót ảnh ${img.seq}` };
        images.push({ seq: img.seq, loai: typeof found.loai === "string" && ruleIds.has(found.loai) ? found.loai : "khac", doTinCay: asConfidence(found.doTinCay) });
    }

    const rawExtracted = typeof so.extracted === "object" && so.extracted !== null ? (so.extracted as Record<string, unknown>) : {};
    const extracted: BundleReading["extracted"] = {};
    for (const rule of ctx.rules) {
        const block = rawExtracted[rule.id];
        if (typeof block !== "object" || block === null) continue;
        const fields: Record<string, FieldReading> = {};
        for (const f of rule.truong) {
            const raw = (block as Record<string, unknown>)[f.ten];
            const fr = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
            fields[f.ten] = { value: fr.value === undefined ? null : fr.value, doTinCay: asConfidence(fr.doTinCay) };
        }
        extracted[rule.id] = fields;
    }

    const usage = o.modelUsage;
    const model = typeof usage === "object" && usage !== null ? (Object.keys(usage)[0] ?? ctx.requestedModel) : ctx.requestedModel;
    return {
        ok: true,
        reading: {
            bundleId: ctx.manifest.bundleId,
            readAt: ctx.readAt,
            reader: { kind: "claude-p", model, promptVersion: PROMPT_VERSION, ruleVersions: Object.fromEntries(ctx.rules.map((r) => [r.id, r.version])) },
            images,
            extracted,
        },
    };
}

export interface ClaudeReaderOptions {
    model: string;
    secondModel: string;
    timeoutMs: number;
    run?: RunProcess;
    /** Thư mục làm việc sạch (mặc định: một thư mục tạm riêng). */
    cwd?: string;
    command?: string;
    now?: () => number;
}

export function makeClaudeReader(opts: ClaudeReaderOptions): VisionReader {
    const run = opts.run ?? runProcess;
    const now = opts.now ?? Date.now;
    let cwd = opts.cwd;
    return {
        async readBundle({ bundleDir, manifest, rules, pass }) {
            cwd ??= fs.mkdtempSync(path.join(os.tmpdir(), "zca-vision-"));
            const model = pass === 2 ? opts.secondModel : opts.model;
            const args = [
                "-p",
                "--output-format", "json",
                "--json-schema", JSON.stringify(buildResultSchema(rules)),
                "--model", model,
                "--allowedTools", "Read",
                "--add-dir", bundleDir,
                "--disable-slash-commands",
                "--no-session-persistence",
                "--setting-sources", "user",
                "--system-prompt", SYSTEM_PROMPT,
            ];
            const out = await run(opts.command ?? "claude", args, { cwd, input: buildPrompt(rules, manifest, bundleDir), timeoutMs: opts.timeoutMs });
            if (out.timedOut) return { ok: false, error: `quá ${Math.round(opts.timeoutMs / 1000)} giây chờ agent đọc ảnh` };
            if (out.code !== 0) return { ok: false, error: `claude thoát mã ${out.code ?? "?"}: ${tail(out.stderr) || tail(out.stdout) || "(không có nội dung)"}` };
            return parseClaudeOutput(out.stdout, { manifest, rules, requestedModel: model, readAt: now() });
        },
    };
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/claudeReader.test.ts` rồi `npm run typecheck`
Expected: PASS. (Ghi chú: ca "process không khởi động" trả `code: null` nên đi qua nhánh `code !== 0`, thông báo chứa `ENOENT`.)

- [ ] **Step 5: Commit**

```bash
git add src/vision/claudeReader.ts tests/claudeReader.test.ts
git commit -m "feat(vision): VisionReader bằng claude -p (một lần gọi cho cả bộ)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Review lớp 1 (luật)

**Files:**
- Create: `src/vision/checks.ts`, `tests/photoChecks.test.ts`

**Interfaces:**
- Consumes: `PhotoRule`, `BundleReading`, `Manifest`, `CheckResult`, `RuleField`, `CheckRule` (Task 1); `vietnamDay`.
- Produces: `runChecks(rules: PhotoRule[], reading: BundleReading, manifest: Manifest): CheckResult[]`. Mã kiểm: `so_luong_anh:<luật>`, `bat_buoc:<luật>.<đường dẫn trường>`, `gioi_han:<luật>.<đường dẫn trường>`, và `id` của từng `luatKiemTra`. Luật không có ảnh nào thuộc loại đó thì bị bỏ qua hoàn toàn.

- [ ] **Step 1: Viết test (đỏ)** `tests/photoChecks.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChecks } from "../src/vision/checks.js";
import { loadRules } from "../src/vision/rules.js";
import { manifestOf, readingOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const failed = (rs: ReturnType<typeof runChecks>) => rs.filter((r) => !r.ok).map((r) => r.id);
const dev = (ten: string, soLuong: number | null, hoatDong: number | null, hong: number | null) => ({ ten, soLuong, hoatDong, hong, tinhTrang: null, ghiChu: null });
const handover = (over: Record<string, unknown> = {}) => ({
    ngay: "2026-10-07", nguoiBanGiao: "An", nguoiNhan: "Bình", phong: "PM1", phanMem: [], hoanThanhBaoTri: true,
    thietBi: [dev("Thùng máy", 36, 35, 1), dev("Màn hình", 36, 36, 0), dev("Bộ phím chuột", 36, 36, 0)],
    ...over,
});

test("a clean speedtest passes every check", () => {
    const rs = runChecks(rules, readingOf(["speedtest"], { speedtest: { mbps: 75 } }), manifestOf(1));
    assert.deepEqual(failed(rs), []);
    assert.ok(rs.some((r) => r.id === "so_luong_anh:speedtest" && r.ok));
});

test("a missing required value and an out-of-range value fail", () => {
    assert.deepEqual(failed(runChecks(rules, readingOf(["speedtest"], { speedtest: { mbps: null } }), manifestOf(1))), ["bat_buoc:speedtest.mbps"]);
    assert.deepEqual(failed(runChecks(rules, readingOf(["speedtest"], { speedtest: { mbps: 0 } }), manifestOf(1))), ["gioi_han:speedtest.mbps"]);
    assert.deepEqual(failed(runChecks(rules, readingOf(["speedtest"], { speedtest: { mbps: 99999 } }), manifestOf(1))), ["gioi_han:speedtest.mbps"]);
});

test("two speed photos in one bundle break the per-bundle count", () => {
    const rs = runChecks(rules, readingOf(["speedtest", "speedtest"], { speedtest: { mbps: 61 } }), manifestOf(2));
    assert.deepEqual(failed(rs), ["so_luong_anh:speedtest"]);
});

test("a rule whose class has no image is skipped, and an all-khac bundle has no checks", () => {
    assert.deepEqual(runChecks(rules, readingOf(["khac", "khac"]), manifestOf(2)), []);
    assert.ok(!runChecks(rules, readingOf(["speedtest"], { speedtest: { mbps: 75 } }), manifestOf(1)).some((r) => r.id.includes("handover")));
});

test("device rows: quantity must equal working + broken, a blank cell is skipped (null is not 0), a real 0 is fine", () => {
    const m = manifestOf(2);
    const clean = runChecks(rules, readingOf(["handover", "handover"], { handover: handover() }), m);
    assert.deepEqual(failed(clean), []);
    const wrong = runChecks(rules, readingOf(["handover", "handover"], { handover: handover({ thietBi: [dev("Thùng máy", 36, 30, 1), dev("Màn hình", 36, 36, 0), dev("Bộ phím chuột", 36, 36, 0)] }) }), m);
    const sum = wrong.find((r) => r.id === "tong_thiet_bi")!;
    assert.equal(sum.ok, false);
    assert.equal(sum.muc, "cung");
    assert.match(sum.detail, /Thùng máy/);
    const blank = runChecks(rules, readingOf(["handover", "handover"], { handover: handover({ thietBi: [dev("Thùng máy", 36, 35, null), dev("Màn hình", 36, 36, 0), dev("Bộ phím chuột", 36, 36, 0)] }) }), m);
    assert.equal(blank.find((r) => r.id === "tong_thiet_bi")!.ok, true, "a row with a blank cell is not judged");
    const zeros = runChecks(rules, readingOf(["handover", "handover"], { handover: handover({ thietBi: [dev("Thùng máy", 0, 0, 0), dev("Màn hình", 0, 0, 0), dev("Bộ phím chuột", 0, 0, 0)] }) }), m);
    assert.deepEqual(failed(zeros), []);
});

test("unequal counts of case, screen and keyboard-mouse are only a warning", () => {
    const rs = runChecks(rules, readingOf(["handover", "handover"], { handover: handover({ thietBi: [dev("Thùng máy", 36, 36, 0), dev("Màn hình", 35, 35, 0), dev("Bộ phím chuột", 36, 36, 0)] }) }), manifestOf(2));
    const eq = rs.find((r) => r.id === "so_luong_bang_nhau")!;
    assert.equal(eq.ok, false);
    assert.equal(eq.muc, "canh_bao");
    assert.match(eq.detail, /màn hình=35/);
});

test("the handwritten date must not be after the send day nor more than 2 days before it", () => {
    const run = (ngay: string) => runChecks(rules, readingOf(["handover", "handover"], { handover: handover({ ngay }) }), manifestOf(2)).find((r) => r.id === "ngay_hop_le")!;
    assert.equal(run("2026-10-07").ok, true);
    assert.equal(run("2026-10-05").ok, true);
    assert.equal(run("2026-10-04").ok, false);
    assert.equal(run("2026-10-08").ok, false);
    assert.equal(run("07/10").ok, false, "unreadable date format");
});

test("handover needs at least two photos and its required header fields", () => {
    const one = runChecks(rules, readingOf(["handover"], { handover: handover({ nguoiBanGiao: null }) }), manifestOf(1));
    assert.deepEqual(failed(one).sort(), ["bat_buoc:handover.nguoiBanGiao", "so_luong_anh:handover"]);
    const noRowName = runChecks(rules, readingOf(["handover", "handover"], { handover: handover({ thietBi: [dev("", 1, 1, 0)] }) }), manifestOf(2));
    assert.ok(failed(noRowName).includes("bat_buoc:handover.thietBi[0].ten"));
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoChecks.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/checks.js'`).

- [ ] **Step 3: Viết `src/vision/checks.ts`**

```ts
import { vietnamDay } from "../lesson/time.js";
import type { BundleReading, CheckResult, CheckRule, Manifest, PhotoRule, RuleField } from "../types/index.js";

/**
 * Review lớp 1: luôn chạy, không tốn token. Áp giới hạn của từng trường (`batBuoc`, `min`, `max`), số ảnh mỗi bộ và các
 * `luatKiemTra` khai báo trong luật. Luật mà bộ không có ảnh nào thuộc loại đó thì bỏ qua. Ô để trống (null) không bao giờ bị coi là 0.
 */
const isBlank = (v: unknown): boolean => v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const asRows = (v: unknown): Array<Record<string, unknown>> => (Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null) : []);

function fieldChecks(rule: string, path: string, f: RuleField, value: unknown): CheckResult[] {
    const out: CheckResult[] = [];
    if (f.batBuoc) {
        const ok = !isBlank(value);
        out.push({ id: `bat_buoc:${rule}.${path}`, ok, muc: "cung", detail: ok ? "có giá trị" : "thiếu giá trị bắt buộc" });
    }
    if ((f.min !== undefined || f.max !== undefined) && isNum(value)) {
        const ok = (f.min === undefined || value >= f.min) && (f.max === undefined || value <= f.max);
        out.push({ id: `gioi_han:${rule}.${path}`, ok, muc: "cung", detail: ok ? `${value} trong giới hạn` : `${value} ngoài giới hạn ${f.min ?? "..."} đến ${f.max ?? "..."}` });
    }
    if (f.kieu === "danh_sach") {
        asRows(value).forEach((row, i) => {
            for (const col of f.phanTu ?? []) out.push(...fieldChecks(rule, `${path}[${i}].${col.ten}`, col, row[col.ten]));
        });
    }
    return out;
}

function dayDiff(later: string, earlier: string): number {
    const t = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
    return Math.round((t(later) - t(earlier)) / 86_400_000);
}

function runCheck(c: CheckRule, data: Record<string, { value: unknown }>, manifest: Manifest): CheckResult {
    switch (c.loai) {
        case "tong_dong": {
            const bad: string[] = [];
            let judged = 0;
            asRows(data[c.trong]?.value).forEach((row, i) => {
                const total = row[c.tong];
                const parts = c.cong.map((k) => row[k]);
                if (!isNum(total) || !parts.every(isNum)) return;
                judged += 1;
                const sum = parts.reduce((a, b) => a + b, 0);
                if (sum !== total) bad.push(`hàng ${i + 1} (${String(row.ten ?? "?")}): ${parts.join(" + ")} = ${sum} khác ${total}`);
            });
            return { id: c.id, ok: bad.length === 0, muc: c.muc, detail: bad.length > 0 ? bad.join("; ") : judged === 0 ? "không có hàng đủ số để kiểm" : `${judged} hàng khớp` };
        }
        case "cac_dong_bang_nhau": {
            const rows = asRows(data[c.trong]?.value);
            const found: Array<{ key: string; n: number }> = [];
            for (const key of c.tenChua) {
                const row = rows.find((r) => typeof r.ten === "string" && r.ten.toLowerCase().includes(key.toLowerCase()) && isNum(r[c.cot]));
                if (row) found.push({ key, n: row[c.cot] as number });
            }
            const detail = found.map((f) => `${f.key}=${f.n}`).join(", ");
            if (found.length < 2) return { id: c.id, ok: true, muc: c.muc, detail: "không đủ hàng để so" };
            return { id: c.id, ok: found.every((f) => f.n === found[0].n), muc: c.muc, detail };
        }
        case "ngay_gan_gio_gui": {
            const v = data[c.truong]?.value;
            if (isBlank(v)) return { id: c.id, ok: true, muc: c.muc, detail: "không có ngày để kiểm (trường bắt buộc đã kiểm riêng)" };
            if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { id: c.id, ok: false, muc: c.muc, detail: `ngày không đọc được: ${JSON.stringify(v)}` };
            const behind = dayDiff(vietnamDay(manifest.firstTs), v);
            const ok = behind >= 0 && behind <= c.toiDaLechNgay;
            return { id: c.id, ok, muc: c.muc, detail: ok ? `${v}, ${behind} ngày trước ngày gửi` : behind < 0 ? `${v} sau ngày gửi` : `${v} trước ngày gửi ${behind} ngày (tối đa ${c.toiDaLechNgay})` };
        }
    }
}

export function runChecks(rules: PhotoRule[], reading: BundleReading, manifest: Manifest): CheckResult[] {
    const results: CheckResult[] = [];
    for (const rule of rules) {
        const count = reading.images.filter((i) => i.loai === rule.id).length;
        if (count === 0) continue;
        const { toiThieu, toiDa } = rule.soLuongMoiBo;
        const okCount = count >= toiThieu && count <= toiDa;
        results.push({ id: `so_luong_anh:${rule.id}`, ok: okCount, muc: "cung", detail: okCount ? `${count} ảnh` : `${count} ảnh loại ${rule.id}, cần từ ${toiThieu} đến ${toiDa}` });
        const data = reading.extracted[rule.id] ?? {};
        for (const f of rule.truong) results.push(...fieldChecks(rule.id, f.ten, f, data[f.ten]?.value ?? null));
        for (const c of rule.luatKiemTra) results.push(runCheck(c, data, manifest));
    }
    return results;
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/photoChecks.test.ts` rồi `npm run typecheck`
Expected: PASS. Nếu test "handover needs at least two photos" lệch thứ tự mảng, `sort()` trong test đã xử lý.

- [ ] **Step 5: Commit**

```bash
git add src/vision/checks.ts tests/photoChecks.test.ts
git commit -m "feat(vision): review lớp 1 theo luật (số ảnh, giới hạn, tổng thiết bị, ngày)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Review lớp 2 (đọc lần hai) và quyết định trạng thái

**Files:**
- Create: `src/vision/review.ts`, `tests/photoReview.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `runChecks` kết quả (Task 7).
- Produces:
  - `norm(v: unknown): unknown` (chuỗi: cắt, gộp khoảng trắng, chữ thường; `undefined` -> `null`)
  - `flattenExtracted(plain: Record<string, Record<string, unknown>>): Map<string, unknown>` (khoá `luật.trường`; danh sách: `luật.trường.length` và `luật.trường[i].cột`)
  - `flattenReading(reading: BundleReading): Map<string, unknown>` (thêm `anh[<seq>].loai`)
  - `needsSecondRead(rules: PhotoRule[], reading: BundleReading): boolean`
  - `compareReadings(first: BundleReading, second: BundleReading): Disagreement[]`
  - `decideStatus(input: { rules: PhotoRule[]; reading: BundleReading; checks: CheckResult[]; disagree: Disagreement[]; extraReasons?: string[] }): { status: "tu_dong_dat" | "can_xem"; reasons: string[] }`

- [ ] **Step 1: Viết test (đỏ)** `tests/photoReview.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareReadings, decideStatus, flattenReading, needsSecondRead } from "../src/vision/review.js";
import { loadRules } from "../src/vision/rules.js";
import type { BundleReading, CheckResult } from "../src/types/index.js";
import { readingOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const speed = (mbps: number | null, conf: "cao" | "vua" | "thap" = "cao") => readingOf(["speedtest"], { speedtest: { mbps } }, conf);
const hand = (rows: unknown[]) => readingOf(["handover", "handover"], { handover: { ngay: "2026-10-07", thietBi: rows } });
const row = (ten: string, soLuong: number) => ({ ten, soLuong, hoatDong: soLuong, hong: 0, tinhTrang: null, ghiChu: null });

test("flattenReading flattens images, scalars and list cells", () => {
    const f = flattenReading(hand([row("A", 3), row("B", 4)]));
    assert.equal(f.get("anh[1].loai"), "handover");
    assert.equal(f.get("handover.ngay"), "2026-10-07");
    assert.equal(f.get("handover.thietBi.length"), 2);
    assert.equal(f.get("handover.thietBi[1].soLuong"), 4);
});

test("needsSecondRead: always for handover, only on low confidence for speedtest, never for all-khac", () => {
    assert.equal(needsSecondRead(rules, hand([row("A", 3)])), true);
    assert.equal(needsSecondRead(rules, speed(75, "cao")), false);
    assert.equal(needsSecondRead(rules, speed(75, "vua")), false);
    assert.equal(needsSecondRead(rules, speed(75, "thap")), true);
    assert.equal(needsSecondRead(rules, readingOf(["khac", "khac"])), false);
});

test("compareReadings finds a differing number and ignores case and spacing of text", () => {
    assert.deepEqual(compareReadings(speed(75), speed(75)), []);
    assert.deepEqual(compareReadings(speed(75), speed(57)), [{ path: "speedtest.mbps", first: 75, second: 57 }]);
    const a = readingOf(["handover"], { handover: { phong: "PM 1 ", ngay: "2026-10-07" } });
    const b = readingOf(["handover"], { handover: { phong: "pm 1", ngay: "2026-10-07" } });
    assert.deepEqual(compareReadings(a, b), []);
});

test("compareReadings reports a class change, a list length change and a single cell", () => {
    assert.deepEqual(compareReadings(readingOf(["speedtest"]), readingOf(["khac"])).map((d) => d.path), ["anh[1].loai"]);
    const grown = compareReadings(hand([row("A", 3)]), hand([row("A", 3), row("B", 1)])).map((d) => d.path);
    assert.ok(grown.includes("handover.thietBi.length"));
    assert.ok(grown.includes("handover.thietBi[1].ten"));
    const cell = compareReadings(hand([row("A", 3)]), hand([row("A", 4)]));
    assert.deepEqual(cell.map((d) => d.path), ["handover.thietBi[0].soLuong", "handover.thietBi[0].hoatDong"]);
});

const passing: CheckResult[] = [{ id: "so_luong_anh:speedtest", ok: true, muc: "cung", detail: "1 ảnh" }];

test("decideStatus: everything fine is tu_dong_dat; all-khac with no checks is also tu_dong_dat", () => {
    assert.equal(decideStatus({ rules, reading: speed(75), checks: passing, disagree: [] }).status, "tu_dong_dat");
    assert.deepEqual(decideStatus({ rules, reading: readingOf(["khac", "khac"]), checks: [], disagree: [] }), { status: "tu_dong_dat", reasons: [] });
});

test("decideStatus: a failed hard check, a warning-only failure, a disagreement and low confidence", () => {
    const hard: CheckResult[] = [{ id: "tong_thiet_bi", ok: false, muc: "cung", detail: "hàng 1: sai" }];
    const r = decideStatus({ rules, reading: speed(75), checks: hard, disagree: [] });
    assert.equal(r.status, "can_xem");
    assert.match(r.reasons[0], /tong_thiet_bi/);
    const soft: CheckResult[] = [{ id: "so_luong_bang_nhau", ok: false, muc: "canh_bao", detail: "x" }];
    assert.equal(decideStatus({ rules, reading: speed(75), checks: soft, disagree: [] }).status, "tu_dong_dat");
    const d = decideStatus({ rules, reading: speed(75), checks: passing, disagree: [{ path: "speedtest.mbps", first: 75, second: 57 }] });
    assert.equal(d.status, "can_xem");
    assert.match(d.reasons.join(" "), /speedtest\.mbps/);
    assert.equal(decideStatus({ rules, reading: speed(75, "thap"), checks: passing, disagree: [] }).status, "can_xem");
    assert.equal(decideStatus({ rules, reading: speed(75, "vua"), checks: passing, disagree: [] }).status, "tu_dong_dat", "speedtest accepts vua");
    const handVua = readingOf(["handover", "handover"], { handover: { ngay: "2026-10-07" } }, "vua");
    assert.equal(decideStatus({ rules, reading: handVua, checks: [], disagree: [] }).status, "can_xem", "handover needs cao");
    assert.equal(decideStatus({ rules, reading: speed(75), checks: passing, disagree: [], extraReasons: ["đọc lần hai lỗi"] }).status, "can_xem");
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoReview.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/review.js'`).

- [ ] **Step 3: Viết `src/vision/review.ts`**

```ts
import type { BundleReading, CheckResult, Confidence, Disagreement, PhotoRule } from "../types/index.js";

/**
 * Review lớp 2 (so hai lần đọc độc lập) và quyết định trạng thái. Hàm thuần.
 * `tu_dong_dat` chỉ khi: không có luật cứng nào trượt, hai lần đọc (nếu có lần hai) khớp nhau, mọi ảnh và trường của loại có ảnh đều đạt
 * `nguongTinCay` của luật, và không có lý do phụ nào. Bộ chỉ có ảnh loại `khac` không có gì để đọc nên cũng `tu_dong_dat`.
 */
const RANK: Record<Confidence, number> = { thap: 0, vua: 1, cao: 2 };

export const norm = (v: unknown): unknown => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").toLowerCase() : (v ?? null));

function flatValue(path: string, value: unknown, out: Map<string, unknown>): void {
    if (Array.isArray(value)) {
        out.set(`${path}.length`, value.length);
        value.forEach((row, i) => {
            if (typeof row === "object" && row !== null) for (const [k, v] of Object.entries(row)) out.set(`${path}[${i}].${k}`, v ?? null);
            else out.set(`${path}[${i}]`, row ?? null);
        });
    } else {
        out.set(path, value ?? null);
    }
}

export function flattenExtracted(plain: Record<string, Record<string, unknown>>): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (const [rule, fields] of Object.entries(plain)) for (const [field, value] of Object.entries(fields)) flatValue(`${rule}.${field}`, value, out);
    return out;
}

export function flattenReading(reading: BundleReading): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (const img of reading.images) out.set(`anh[${img.seq}].loai`, img.loai);
    const plain = Object.fromEntries(Object.entries(reading.extracted).map(([rule, fields]) => [rule, Object.fromEntries(Object.entries(fields).map(([k, fr]) => [k, fr.value]))]));
    for (const [k, v] of flattenExtracted(plain)) out.set(k, v);
    return out;
}

const classesPresent = (rules: PhotoRule[], reading: BundleReading): PhotoRule[] => rules.filter((r) => reading.images.some((i) => i.loai === r.id));

/** Có cần lần đọc thứ hai không: luật đặt `luon`, hoặc `khi_tin_cay_thap` mà ảnh/trường của loại đó có độ tin cậy `thap`. */
export function needsSecondRead(rules: PhotoRule[], reading: BundleReading): boolean {
    for (const rule of classesPresent(rules, reading)) {
        if (rule.docLanHai === "luon") return true;
        if (rule.docLanHai === "khi_tin_cay_thap") {
            const lowImage = reading.images.some((i) => i.loai === rule.id && i.doTinCay === "thap");
            const lowField = Object.values(reading.extracted[rule.id] ?? {}).some((f) => f.doTinCay === "thap");
            if (lowImage || lowField) return true;
        }
    }
    return false;
}

export function compareReadings(first: BundleReading, second: BundleReading): Disagreement[] {
    const a = flattenReading(first);
    const b = flattenReading(second);
    const keys = [...new Set([...a.keys(), ...b.keys()])];
    return keys.filter((k) => norm(a.get(k)) !== norm(b.get(k))).map((k) => ({ path: k, first: a.get(k) ?? null, second: b.get(k) ?? null }));
}

export function decideStatus(input: { rules: PhotoRule[]; reading: BundleReading; checks: CheckResult[]; disagree: Disagreement[]; extraReasons?: string[] }): { status: "tu_dong_dat" | "can_xem"; reasons: string[] } {
    const reasons: string[] = [...(input.extraReasons ?? [])];
    for (const c of input.checks) if (!c.ok && c.muc === "cung") reasons.push(`${c.id}: ${c.detail}`);
    for (const d of input.disagree) reasons.push(`hai lần đọc lệch ở ${d.path}: ${JSON.stringify(d.first)} khác ${JSON.stringify(d.second)}`);
    for (const rule of classesPresent(input.rules, input.reading)) {
        const need = RANK[rule.nguongTinCay];
        const lowImages = input.reading.images.filter((i) => i.loai === rule.id && RANK[i.doTinCay] < need).map((i) => `ảnh ${i.seq}`);
        const lowFields = Object.entries(input.reading.extracted[rule.id] ?? {}).filter(([, f]) => RANK[f.doTinCay] < need).map(([k]) => k);
        if (lowImages.length + lowFields.length > 0) reasons.push(`${rule.id}: độ tin cậy dưới ngưỡng "${rule.nguongTinCay}" ở ${[...lowImages, ...lowFields].join(", ")}`);
    }
    return { status: reasons.length === 0 ? "tu_dong_dat" : "can_xem", reasons };
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/photoReview.test.ts` rồi `npm run typecheck`
Expected: PASS. (Kiểm tra `cell` ở test cuối: đổi `soLuong` 3 -> 4 làm `hoatDong` do `row()` cũng đổi theo, nên hai khoá lệch đúng như test mong đợi.)

- [ ] **Step 5: Commit**

```bash
git add src/vision/review.ts tests/photoReview.test.ts
git commit -m "feat(vision): review lớp 2 (so hai lần đọc) và quyết định trạng thái" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Chu trình đọc (`processBundle`, `readBundles`) và lệnh `photos:read`

**Files:**
- Create: `src/vision/pipeline.ts`, `src/cli/photos-read.ts`, `tests/photoPipeline.test.ts`
- Modify: `package.json` (thêm `"photos:read": "tsx src/cli/photos-read.ts"`)

**Interfaces:**
- Consumes: `VisionReader`, `PhotoRule`, `Review`, `BundleReading` (Task 1); `runChecks` (7); `needsSecondRead`, `compareReadings`, `decideStatus` (8); `listBundleDirs`, `readManifest` (5); `writeFileAtomic`; `makeClaudeReader` (6); `loadRules` (2).
- Produces:
  - `interface PipelineDeps { reader: VisionReader; rules: PhotoRule[]; log?: (m: string) => void }`
  - `processBundle(dir: string, deps: PipelineDeps): Promise<{ ok: true; reading: BundleReading; review: Review } | { ok: false; error: string }>` (ghi `reading.json`, `review.json`, xoá cờ `reread` của manifest; khi lỗi lần một KHÔNG ghi gì)
  - `interface ReadOptions { day?: string; bundleId?: string; again: boolean; dryRun: boolean; maxBundles: number }`
  - `interface ReadSummary { listed: string[]; skippedOpen: number; skippedRead: number; read: Array<{ dir: string; status: ReviewStatus }>; failed: Array<{ dir: string; error: string }>; overLimit: number }`
  - `readBundles(root: string, opts: ReadOptions, deps: PipelineDeps): Promise<ReadSummary>`

- [ ] **Step 1: Viết test (đỏ)** `tests/photoPipeline.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { processBundle, readBundles, type PipelineDeps } from "../src/vision/pipeline.js";
import { readManifest } from "../src/vision/bundleStore.js";
import { loadRules } from "../src/vision/rules.js";
import { manifestOf, readingOf } from "./helpers/visionFixtures.js";
import type { BundleReading, ReadInput, ReadResult, VisionReader } from "../src/types/index.js";

const rules = loadRules();

/** Dựng thư mục bộ trực tiếp (không qua writeBundle): root/<day>/g1/<bundleId>/manifest.json. */
function makeBundle(root: string, id: string, n: number, extra: Parameters<typeof manifestOf>[1] = {}): string {
    const dir = path.join(root, "2026-10-07", "g1", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestOf(n, { bundleId: id, ...extra })), "utf8");
    return dir;
}
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "pipe-"));

/** Agent giả: trả kết quả lần một và lần hai cho từng bộ, và ghi lại các lần gọi. */
function fake(first: (i: ReadInput) => ReadResult, second?: (i: ReadInput) => ReadResult) {
    const calls: Array<{ dir: string; pass: number }> = [];
    const reader: VisionReader = {
        async readBundle(input) {
            calls.push({ dir: input.bundleDir, pass: input.pass });
            return input.pass === 1 ? first(input) : (second ?? first)(input);
        },
    };
    return { reader, calls };
}
const okRead = (r: BundleReading): ReadResult => ({ ok: true, reading: r });
const speed = (mbps: number | null, conf: "cao" | "vua" | "thap" = "cao") => okRead(readingOf(["speedtest"], { speedtest: { mbps } }, conf));
const deps = (reader: VisionReader): PipelineDeps => ({ reader, rules, log: () => undefined });
const OPTS = { again: false, dryRun: false, maxBundles: 10 };

test("a clean speedtest bundle is read once and ends tu_dong_dat", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b1", 1);
    const f = fake(() => speed(75));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1]);
    const review = JSON.parse(fs.readFileSync(path.join(dir, "review.json"), "utf8"));
    assert.equal(review.status, "tu_dong_dat");
    assert.equal(review.secondRead.ran, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "reading.json"), "utf8")).extracted.speedtest.mbps.value, 75);
});

test("a handover bundle is always read twice and a disagreement sends it to review", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b2", 2);
    const mk = (soLuong: number) => okRead(readingOf(["handover", "handover"], { handover: { ngay: "2026-10-07", nguoiBanGiao: "An", phong: "PM1", thietBi: [{ ten: "Thùng máy", soLuong, hoatDong: soLuong, hong: 0, tinhTrang: null, ghiChu: null }] } }));
    const f = fake(() => mk(36), () => mk(38));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1, 2]);
    if (!r.ok) return;
    assert.equal(r.review.status, "can_xem");
    assert.equal(r.review.secondRead.ran, true);
    assert.ok(r.review.secondRead.disagree.some((d) => d.path === "handover.thietBi[0].soLuong" && d.first === 36 && d.second === 38));
    assert.ok(r.review.reasons.length > 0);
});

test("a bundle of only room photos is tu_dong_dat with no second read", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b3", 2);
    const f = fake(() => okRead(readingOf(["khac", "khac"])));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.equal(f.calls.length, 1);
    if (r.ok) assert.equal(r.review.status, "tu_dong_dat");
});

test("a failed first read writes nothing and leaves the bundle unread", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b4", 1);
    const f = fake(() => ({ ok: false, error: "quá 180 giây" }));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(!r.ok && /180/.test(r.error));
    assert.equal(fs.existsSync(path.join(dir, "reading.json")), false);
    assert.equal(fs.existsSync(path.join(dir, "review.json")), false);
});

test("a failed second read still saves the first reading, as can_xem with the reason", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b5", 2);
    const f = fake(() => okRead(readingOf(["handover", "handover"], { handover: { ngay: "2026-10-07", nguoiBanGiao: "An", phong: "PM1", thietBi: [] } })), () => ({ ok: false, error: "hết hạn mức" }));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.review.status, "can_xem");
    assert.ok(r.review.reasons.some((x) => /hết hạn mức/.test(x)));
    assert.equal(fs.existsSync(path.join(dir, "reading.json")), true);
});

test("readBundles reads only closed, unread bundles, once; --again reads again; the re-read flag is cleared", async () => {
    const root = tmpRoot();
    makeBundle(root, "closed1", 1);
    makeBundle(root, "open1", 1, { status: "open" });
    const f = fake(() => speed(75));
    const s1 = await readBundles(root, OPTS, deps(f.reader));
    assert.equal(s1.read.length, 1);
    assert.equal(s1.skippedOpen, 1);
    assert.equal(f.calls.length, 1);
    const s2 = await readBundles(root, OPTS, deps(f.reader));
    assert.equal(s2.read.length, 0);
    assert.equal(s2.skippedRead, 1);
    assert.equal((await readBundles(root, { ...OPTS, again: true }, deps(f.reader))).read.length, 1);

    const dir = path.join(root, "2026-10-07", "g1", "closed1");
    const m = readManifest(dir)!;
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...m, reread: true }), "utf8");
    const s3 = await readBundles(root, OPTS, deps(f.reader));
    assert.equal(s3.read.length, 1, "re-read flag forces a new read");
    assert.equal(readManifest(dir)!.reread, undefined);
});

test("readBundles honours --bundle, --day, --dry-run and maxBundles, and collects failures", async () => {
    const root = tmpRoot();
    ["a", "b", "c"].forEach((id) => makeBundle(root, id, 1));
    const f = fake(() => speed(75));
    const dry = await readBundles(root, { ...OPTS, dryRun: true }, deps(f.reader));
    assert.equal(dry.listed.length, 3);
    assert.equal(f.calls.length, 0);
    const limited = await readBundles(root, { ...OPTS, maxBundles: 2 }, deps(f.reader));
    assert.equal(limited.read.length, 2);
    assert.equal(limited.overLimit, 1);
    const one = await readBundles(root, { ...OPTS, bundleId: "c" }, deps(f.reader));
    assert.equal(one.read.length, 1);
    assert.equal((await readBundles(root, { ...OPTS, again: true, day: "2026-10-08" }, deps(f.reader))).listed.length, 0);

    const bad = fake(() => ({ ok: false, error: "chưa đăng nhập" }));
    const root2 = tmpRoot();
    makeBundle(root2, "x", 1);
    const s = await readBundles(root2, OPTS, deps(bad.reader));
    assert.equal(s.read.length, 0);
    assert.equal(s.failed.length, 1);
    assert.match(s.failed[0].error, /chưa đăng nhập/);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoPipeline.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/pipeline.js'`).

- [ ] **Step 3: Viết `src/vision/pipeline.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { listBundleDirs, readManifest } from "./bundleStore.js";
import { runChecks } from "./checks.js";
import { compareReadings, decideStatus, needsSecondRead } from "./review.js";
import type { BundleReading, Disagreement, PhotoRule, Review, ReviewStatus, VisionReader } from "../types/index.js";

/**
 * Chu trình đọc của agent: một bộ -> đọc lần một -> lớp 1 (luật) -> lần hai độc lập nếu cần -> so sánh -> trạng thái -> ghi `reading.json`
 * và `review.json`. Lỗi đọc lần một KHÔNG ghi gì (bộ vẫn "chưa đọc", chạy lại sẽ thử lại). Lỗi lần hai vẫn giữ kết quả lần một nhưng
 * bộ thành `can_xem`. Chỉ ghi trong thư mục bộ.
 */
export interface PipelineDeps {
    reader: VisionReader;
    rules: PhotoRule[];
    log?: (message: string) => void;
}

const writeJson = (file: string, value: unknown): void => writeFileAtomic(file, JSON.stringify(value, null, 2));

export async function processBundle(dir: string, deps: PipelineDeps): Promise<{ ok: true; reading: BundleReading; review: Review } | { ok: false; error: string }> {
    const manifest = readManifest(dir);
    if (!manifest) return { ok: false, error: `không có manifest.json trong ${dir}` };

    const first = await deps.reader.readBundle({ bundleDir: dir, manifest, rules: deps.rules, pass: 1 });
    if (!first.ok) return { ok: false, error: first.error };
    const reading = first.reading;
    const checks = runChecks(deps.rules, reading, manifest);

    let ran = false;
    let disagree: Disagreement[] = [];
    const extraReasons: string[] = [];
    if (needsSecondRead(deps.rules, reading)) {
        ran = true;
        const second = await deps.reader.readBundle({ bundleDir: dir, manifest, rules: deps.rules, pass: 2 });
        if (second.ok) disagree = compareReadings(reading, second.reading);
        else extraReasons.push(`đọc lần hai lỗi: ${second.error}`);
    }

    const { status, reasons } = decideStatus({ rules: deps.rules, reading, checks, disagree, extraReasons });
    const review: Review = { status, reasons, checks, secondRead: { ran, disagree }, human: null };
    writeJson(path.join(dir, "reading.json"), reading);
    writeJson(path.join(dir, "review.json"), review);
    if (manifest.reread) {
        const { reread: _cleared, ...rest } = manifest;
        writeJson(path.join(dir, "manifest.json"), rest);
    }
    return { ok: true, reading, review };
}

export interface ReadOptions {
    day?: string;
    bundleId?: string;
    again: boolean;
    dryRun: boolean;
    maxBundles: number;
}

export interface ReadSummary {
    /** Các bộ sẽ đọc (đã lọc), kể cả khi `dryRun`. */
    listed: string[];
    skippedOpen: number;
    skippedRead: number;
    read: Array<{ dir: string; status: ReviewStatus }>;
    failed: Array<{ dir: string; error: string }>;
    /** Số bộ đủ điều kiện nhưng vượt `maxBundles`, để lần chạy sau. */
    overLimit: number;
}

export async function readBundles(root: string, opts: ReadOptions, deps: PipelineDeps): Promise<ReadSummary> {
    const summary: ReadSummary = { listed: [], skippedOpen: 0, skippedRead: 0, read: [], failed: [], overLimit: 0 };
    const eligible: string[] = [];
    for (const dir of listBundleDirs(root, opts.day)) {
        const manifest = readManifest(dir);
        if (!manifest) continue;
        if (opts.bundleId && manifest.bundleId !== opts.bundleId) continue;
        if (manifest.status !== "closed") {
            summary.skippedOpen += 1;
            continue;
        }
        const already = fs.existsSync(path.join(dir, "reading.json"));
        if (already && !opts.again && !manifest.reread) {
            summary.skippedRead += 1;
            continue;
        }
        eligible.push(dir);
    }
    summary.listed = eligible.slice(0, opts.maxBundles);
    summary.overLimit = Math.max(0, eligible.length - opts.maxBundles);
    if (opts.dryRun) return summary;

    for (const dir of summary.listed) {
        deps.log?.(`đọc ${path.basename(dir)} ...`);
        const r = await processBundle(dir, deps);
        if (r.ok) summary.read.push({ dir, status: r.review.status });
        else summary.failed.push({ dir, error: r.error });
    }
    return summary;
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/photoPipeline.test.ts` rồi `npm run typecheck`
Expected: PASS. (`_cleared` không dùng sẽ được TypeScript chấp nhận vì tiền tố `_`; nếu `tsc` báo `noUnusedLocals`, đổi thành `const rest = { ...manifest }; delete rest.reread;`.)

- [ ] **Step 5: Viết lệnh `src/cli/photos-read.ts`**

```ts
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { makeClaudeReader } from "../vision/claudeReader.js";
import { readBundles } from "../vision/pipeline.js";
import { loadRules } from "../vision/rules.js";

/**
 * Đọc các bộ ảnh ĐÃ ĐÓNG mà chưa đọc (hoặc có cờ đọc lại): agent đọc, kiểm tra ba lớp (lớp 3 là `photos:review`), ghi `reading.json`
 * và `review.json` trong thư mục bộ. Tốn hạn mức gói subscription: mỗi bộ một lần gọi (hai lần nếu luật đòi đọc lần hai), tối đa
 * `config.vision.maxBundlesPerRun` bộ mỗi lần chạy. Không đụng DB, Excel hay kho tin.
 *
 *   npm run photos:read -- [--day YYYY-MM-DD] [--bundle <mã bộ>] [--again] [--dry-run]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(name);

async function main(): Promise<void> {
    const rules = loadRules();
    if (rules.length === 0) throw new Error('Không có luật nào trong photo-rules/ (cần ít nhất một file, ví dụ speedtest.json).');
    const reader = makeClaudeReader({ model: config.vision.model, secondModel: config.vision.secondModel, timeoutMs: config.vision.timeoutSeconds * 1000 });
    const root = photoReportsDir(config.dataDir);
    const summary = await readBundles(
        root,
        { day: option("--day"), bundleId: option("--bundle"), again: flag("--again"), dryRun: flag("--dry-run"), maxBundles: config.vision.maxBundlesPerRun },
        { reader, rules, log: (m) => console.log(`[photos:read] ${m}`) },
    );

    const name = (dir: string): string => path.relative(root, dir);
    if (flag("--dry-run")) {
        console.log(`[photos:read] CHẠY THỬ, không gọi agent. Sẽ đọc ${summary.listed.length} bộ${summary.overLimit > 0 ? ` (còn ${summary.overLimit} bộ vượt maxBundlesPerRun)` : ""}:`);
        for (const dir of summary.listed) console.log(`  - ${name(dir)}`);
    }
    for (const r of summary.read) console.log(`[photos:read] ${name(r.dir)}: ${r.status}`);
    for (const f of summary.failed) console.error(`[photos:read] LỖI ${name(f.dir)}: ${f.error}`);
    console.log(`[photos:read] đã đọc ${summary.read.length}, lỗi ${summary.failed.length}, bỏ qua vì chưa đóng ${summary.skippedOpen}, vì đã đọc ${summary.skippedRead}${summary.overLimit > 0 ? `, vượt giới hạn ${summary.overLimit}` : ""}.`);
    const needReview = summary.read.filter((r) => r.status === "can_xem").length;
    if (needReview > 0) console.log(`[photos:read] ${needReview} bộ cần xem: npm run photos:review -- --list`);
    if (summary.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
```

Thêm vào `package.json`: `"photos:read": "tsx src/cli/photos-read.ts",`.

- [ ] **Step 6: Kiểm tra kiểu và chạy thử không tốn token**

Run: `npm run typecheck` rồi `npx tsx src/cli/photos-read.ts --dry-run`
Expected: in `CHẠY THỬ, không gọi agent. Sẽ đọc N bộ` (N = số bộ đóng chưa đọc, ví dụ bộ mẫu tạo ở Task 5), không gọi `claude`.

- [ ] **Step 7: Commit**

```bash
git add src/vision/pipeline.ts src/cli/photos-read.ts tests/photoPipeline.test.ts package.json
git commit -m "feat(vision): chu trình đọc ba lớp và lệnh photos:read" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Review lớp 3 (người xem) và lệnh `photos:review`

**Files:**
- Create: `src/vision/reviewApply.ts`, `src/cli/photos-review.ts`, `tests/photoReviewApply.test.ts`
- Modify: `package.json` (thêm `"photos:review": "tsx src/cli/photos-review.ts"`)

**Interfaces:**
- Consumes: `Review`, `BundleReading`, `Manifest` (Task 1); `flattenReading` (Task 8); `listBundleDirs`, `readManifest` (Task 5).
- Produces:
  - `parseFix(arg: string): { path: string; value: unknown }` (`"speedtest.mbps=75"`; giá trị là JSON nếu parse được, không thì chuỗi)
  - `applyHuman(review: Review, action: "xac_nhan" | "sua" | "bo", corrections: Record<string, unknown>, now: number): Review` (ném `Error` nếu bộ không ở `can_xem`, hoặc `sua` không có sửa nào, hoặc `xac_nhan`/`bo` kèm sửa)
  - `finalValues(reading: BundleReading, review: Review): Record<string, unknown>` (giá trị phẳng, đã đè các sửa của người)
  - `describeBundle(manifest: Manifest, reading: BundleReading, review: Review): string[]`
- Ghi chú lệch spec: thêm trạng thái `da_bo` cho "bỏ" (spec §3 chỉ liệt kê bốn); Task 12 cập nhật spec.

- [ ] **Step 1: Viết test (đỏ)** `tests/photoReviewApply.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHuman, describeBundle, finalValues, parseFix } from "../src/vision/reviewApply.js";
import type { Review } from "../src/types/index.js";
import { manifestOf, readingOf } from "./helpers/visionFixtures.js";

const needsLook = (): Review => ({
    status: "can_xem",
    reasons: ["hai lần đọc lệch ở speedtest.mbps: 75 khác 57"],
    checks: [],
    secondRead: { ran: true, disagree: [{ path: "speedtest.mbps", first: 75, second: 57 }] },
    human: null,
});

test("parseFix reads JSON values and falls back to text", () => {
    assert.deepEqual(parseFix("speedtest.mbps=75"), { path: "speedtest.mbps", value: 75 });
    assert.deepEqual(parseFix("handover.phong=PM 1"), { path: "handover.phong", value: "PM 1" });
    assert.deepEqual(parseFix("handover.hoanThanhBaoTri=true"), { path: "handover.hoanThanhBaoTri", value: true });
    assert.deepEqual(parseFix("handover.thietBi[0].ghiChu=a=b"), { path: "handover.thietBi[0].ghiChu", value: "a=b" });
    assert.throws(() => parseFix("khong-co-dau-bang"), /đường dẫn=giá trị/);
});

test("confirming, fixing and discarding move can_xem to the right final status", () => {
    const now = 1000;
    assert.equal(applyHuman(needsLook(), "xac_nhan", {}, now).status, "da_xac_nhan");
    const fixed = applyHuman(needsLook(), "sua", { "speedtest.mbps": 61 }, now);
    assert.equal(fixed.status, "da_sua");
    assert.deepEqual(fixed.human, { at: now, action: "sua", corrections: { "speedtest.mbps": 61 } });
    assert.equal(applyHuman(needsLook(), "bo", {}, now).status, "da_bo");
});

test("invalid review actions are refused", () => {
    assert.throws(() => applyHuman(needsLook(), "sua", {}, 1), /ít nhất một/);
    assert.throws(() => applyHuman(needsLook(), "xac_nhan", { a: 1 }, 1), /không kèm sửa/);
    const done = applyHuman(needsLook(), "xac_nhan", {}, 1);
    assert.throws(() => applyHuman(done, "sua", { a: 1 }, 1), /đã được xem/);
    assert.throws(() => applyHuman({ ...needsLook(), status: "tu_dong_dat" }, "xac_nhan", {}, 1), /chỉ bộ cần xem/);
});

test("finalValues overlays the human corrections on the reading", () => {
    const reading = readingOf(["speedtest"], { speedtest: { mbps: 75 } });
    const fixed = applyHuman(needsLook(), "sua", { "speedtest.mbps": 61 }, 1);
    assert.equal(finalValues(reading, needsLook()) instanceof Map, false, "a plain object, not a Map");
    assert.equal(finalValues(reading, needsLook())["speedtest.mbps"], 75);
    assert.equal(finalValues(reading, fixed)["speedtest.mbps"], 61);
    assert.equal(finalValues(reading, fixed)["anh[1].loai"], "speedtest");
});

test("describeBundle shows the group, status, reasons and both readings of each disagreement", () => {
    const lines = describeBundle(manifestOf(1), readingOf(["speedtest"], { speedtest: { mbps: 75 } }), needsLook()).join("\n");
    assert.match(lines, /LC_HoaSen1_HM/);
    assert.match(lines, /can_xem/);
    assert.match(lines, /speedtest\.mbps: lần một 75, lần hai 57/);
    assert.match(lines, /01\.jpg/);
});
```


- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoReviewApply.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/reviewApply.js'`).

- [ ] **Step 3: Viết `src/vision/reviewApply.ts`**

```ts
import { flattenReading } from "./review.js";
import type { BundleReading, Manifest, Review } from "../types/index.js";

/**
 * Review lớp 3: người xem. Chỉ bộ `can_xem` mới xem được, mỗi bộ chỉ xem một lần; kết quả: xác nhận (`da_xac_nhan`), sửa
 * (`da_sua`, kèm các sửa theo đường dẫn phẳng như `speedtest.mbps` hay `handover.thietBi[2].soLuong`) hoặc bỏ (`da_bo`).
 */
export function parseFix(arg: string): { path: string; value: unknown } {
    const i = arg.indexOf("=");
    if (i <= 0) throw new Error(`Sửa phải có dạng đường dẫn=giá trị (ví dụ speedtest.mbps=75), nhận được "${arg}".`);
    const raw = arg.slice(i + 1);
    let value: unknown = raw;
    try {
        value = JSON.parse(raw);
    } catch {
        value = raw;
    }
    return { path: arg.slice(0, i), value };
}

export function applyHuman(review: Review, action: "xac_nhan" | "sua" | "bo", corrections: Record<string, unknown>, now: number): Review {
    if (review.human) throw new Error("Bộ này đã được xem rồi.");
    if (review.status !== "can_xem") throw new Error(`Chỉ bộ cần xem (can_xem) mới xem được; bộ này đang ${review.status}.`);
    const count = Object.keys(corrections).length;
    if (action === "sua" && count === 0) throw new Error("Sửa cần ít nhất một --fix đường dẫn=giá trị.");
    if (action !== "sua" && count > 0) throw new Error("Xác nhận hoặc bỏ không kèm sửa; dùng --fix để sửa.");
    const status = action === "xac_nhan" ? "da_xac_nhan" : action === "sua" ? "da_sua" : "da_bo";
    return { ...review, status, human: { at: now, action, corrections } };
}

/** Giá trị phẳng của một bộ sau khi xem: kết quả đọc, đè các sửa của người. */
export function finalValues(reading: BundleReading, review: Review): Record<string, unknown> {
    const out: Record<string, unknown> = Object.fromEntries(flattenReading(reading));
    for (const [k, v] of Object.entries(review.human?.corrections ?? {})) out[k] = v;
    return out;
}

export function describeBundle(manifest: Manifest, reading: BundleReading, review: Review): string[] {
    const lines = [`Bộ ${manifest.bundleId} — nhóm ${manifest.groupName}, người gửi ${manifest.sender.name || manifest.sender.id}, trạng thái ${review.status}`];
    lines.push(`Ảnh (${manifest.images.length}): ${manifest.images.map((i) => `${i.file} (${reading.images.find((r) => r.seq === i.seq)?.loai ?? "?"})`).join(", ")}`);
    for (const r of review.reasons) lines.push(`  - ${r}`);
    for (const d of review.secondRead.disagree) lines.push(`  * ${d.path}: lần một ${JSON.stringify(d.first)}, lần hai ${JSON.stringify(d.second)}`);
    for (const c of review.checks.filter((x) => !x.ok)) lines.push(`  ! ${c.id} (${c.muc}): ${c.detail}`);
    return lines;
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/photoReviewApply.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Viết lệnh `src/cli/photos-review.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { photoReportsDir } from "../core/paths.js";
import { listBundleDirs, readManifest } from "../vision/bundleStore.js";
import { applyHuman, describeBundle, parseFix } from "../vision/reviewApply.js";
import type { BundleReading, Review } from "../types/index.js";

/**
 * Review lớp 3: người xem các bộ `can_xem`.
 *
 *   npm run photos:review -- [--list]                         liệt kê các bộ cần xem
 *   npm run photos:review -- --bundle <mã bộ>                 xem chi tiết một bộ (thư mục có ảnh gốc để mở xem)
 *   npm run photos:review -- --bundle <mã bộ> --confirm       đọc đúng
 *   npm run photos:review -- --bundle <mã bộ> --fix a.b=GIÁ_TRỊ [--fix ...]   sửa (da_sua)
 *   npm run photos:review -- --bundle <mã bộ> --discard       bỏ bộ này (da_bo)
 *
 * Chỉ ghi `review.json` của bộ đó.
 */
const argv = process.argv.slice(2);
const option = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
};
const all = (name: string): string[] => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const flag = (name: string): boolean => argv.includes(name);

const readJson = <T>(file: string): T | null => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as T) : null);

function main(): void {
    const root = photoReportsDir(config.dataDir);
    const bundleId = option("--bundle");

    if (!bundleId) {
        let n = 0;
        for (const dir of listBundleDirs(root)) {
            const review = readJson<Review>(path.join(dir, "review.json"));
            if (review?.status !== "can_xem") continue;
            n += 1;
            const m = readManifest(dir);
            console.log(`${m?.bundleId ?? path.basename(dir)}  ${m?.groupName ?? ""}  ${review.reasons[0] ?? ""}`);
        }
        console.log(`[photos:review] ${n} bộ cần xem.${n > 0 ? " Xem chi tiết: npm run photos:review -- --bundle <mã bộ>" : ""}`);
        return;
    }

    const dir = listBundleDirs(root).find((d) => readManifest(d)?.bundleId === bundleId);
    if (!dir) throw new Error(`Không thấy bộ "${bundleId}" trong ${root}.`);
    const manifest = readManifest(dir)!;
    const reading = readJson<BundleReading>(path.join(dir, "reading.json"));
    const review = readJson<Review>(path.join(dir, "review.json"));
    if (!reading || !review) throw new Error(`Bộ "${bundleId}" chưa được đọc (chạy photos:read trước).`);

    const fixes = all("--fix");
    const action = flag("--confirm") ? "xac_nhan" : flag("--discard") ? "bo" : fixes.length > 0 ? "sua" : null;
    if (!action) {
        for (const line of describeBundle(manifest, reading, review)) console.log(line);
        console.log(`Ảnh gốc nằm ở: ${dir}`);
        return;
    }
    const corrections: Record<string, unknown> = {};
    for (const f of fixes) {
        const { path: p, value } = parseFix(f);
        corrections[p] = value;
    }
    const next = applyHuman(review, action, corrections, Date.now());
    writeFileAtomic(path.join(dir, "review.json"), JSON.stringify(next, null, 2));
    console.log(`[photos:review] ${bundleId}: ${next.status}`);
}

try {
    main();
} catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
}
```

Thêm vào `package.json`: `"photos:review": "tsx src/cli/photos-review.ts",`.

- [ ] **Step 6: Kiểm tra kiểu**

Run: `npm run typecheck` rồi `npx tsx src/cli/photos-review.ts --list`
Expected: `[photos:review] 0 bộ cần xem.` (hoặc danh sách nếu đã có bộ `can_xem`).

- [ ] **Step 7: Commit**

```bash
git add src/vision/reviewApply.ts src/cli/photos-review.ts tests/photoReviewApply.test.ts package.json
git commit -m "feat(vision): review lớp 3 (người xác nhận, sửa, bỏ) và lệnh photos:review" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Bộ đáp án đúng và lệnh `photos:golden`

**Files:**
- Create: `src/vision/golden.ts`, `src/cli/photos-golden.ts`, `photo-golden/cases.json`, `tests/photoGolden.test.ts`
- Modify: `package.json` (thêm `"photos:golden": "tsx src/cli/photos-golden.ts"`)

**Interfaces:**
- Consumes: `BundleReading`, `Review` (Task 1); `flattenReading`, `flattenExtracted`, `norm` (Task 8); `draftFromFiles` (4); `writeBundle` (5); `processBundle` (9); `makeClaudeReader` (6); `loadRules` (2).
- Produces:
  - `interface GoldenCase { name: string; files: string[]; loai: Record<string, string>; extracted: Record<string, Record<string, unknown>> }`
  - `interface GoldenFile { sourceDir: string; cases: GoldenCase[] }`
  - `loadGolden(file: string): GoldenFile` (ném `Error` rõ khi sai; `cases` rỗng thì trả về rỗng, người gọi báo "chưa có ca nào")
  - `interface CaseScore { name: string; classes: { ok: number; total: number }; fields: Array<{ path: string; expected: unknown; actual: unknown; ok: boolean }>; status: string; wrongButAuto: number }`
  - `scoreCase(c: GoldenCase, imageFiles: string[], reading: BundleReading, status: string): CaseScore` (`imageFiles[i]` là tên file của ảnh có `seq = i + 1`)
  - `summarize(scores: CaseScore[]): { classAccuracy: number; fieldAccuracy: number; wrongButAuto: number; needReview: number }`

Định dạng `photo-golden/cases.json`:

```json
{
    "sourceDir": "data/images/AI_reading_picture",
    "cases": [
        {
            "name": "toc-do-75",
            "files": ["<tên file ảnh>.jpg"],
            "loai": { "<tên file ảnh>.jpg": "speedtest" },
            "extracted": { "speedtest": { "mbps": 75 } }
        }
    ]
}
```

Mỗi ca là MỘT BỘ gồm các file nêu trong `files` (lấy từ `sourceDir`); đáp án phân loại theo từng tên file; `extracted` là giá trị thường (danh sách là mảng các đối tượng cột).

- [ ] **Step 1: Viết test (đỏ)** `tests/photoGolden.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadGolden, scoreCase, summarize, type GoldenCase } from "../src/vision/golden.js";
import { readingOf } from "./helpers/visionFixtures.js";

const speedCase: GoldenCase = { name: "toc-do-75", files: ["a.jpg", "b.jpg"], loai: { "a.jpg": "speedtest", "b.jpg": "khac" }, extracted: { speedtest: { mbps: 75 } } };
const listCase: GoldenCase = {
    name: "bien-ban",
    files: ["c.jpg", "d.jpg"],
    loai: { "c.jpg": "handover", "d.jpg": "handover" },
    extracted: { handover: { phong: "PM1", thietBi: [{ ten: "Thùng máy", soLuong: 36 }] } },
};

test("a fully correct reading scores 100% with no dangerous mistakes", () => {
    const s = scoreCase(speedCase, ["a.jpg", "b.jpg"], readingOf(["speedtest", "khac"], { speedtest: { mbps: 75 } }), "tu_dong_dat");
    assert.deepEqual(s.classes, { ok: 2, total: 2 });
    assert.deepEqual(s.fields.map((f) => f.ok), [true]);
    assert.equal(s.wrongButAuto, 0);
});

test("a wrong value that was still tu_dong_dat is the dangerous kind; the same mistake caught as can_xem is not", () => {
    const wrong = readingOf(["speedtest", "khac"], { speedtest: { mbps: 57 } });
    assert.equal(scoreCase(speedCase, ["a.jpg", "b.jpg"], wrong, "tu_dong_dat").wrongButAuto, 1);
    const caught = scoreCase(speedCase, ["a.jpg", "b.jpg"], wrong, "can_xem");
    assert.equal(caught.wrongButAuto, 0);
    assert.equal(caught.fields[0].ok, false);
});

test("a wrong image class counts against classification and a missing field counts as wrong", () => {
    const s = scoreCase(speedCase, ["a.jpg", "b.jpg"], readingOf(["khac", "khac"]), "tu_dong_dat");
    assert.deepEqual(s.classes, { ok: 1, total: 2 });
    assert.deepEqual(s.fields.map((f) => [f.path, f.ok, f.actual]), [["speedtest.mbps", false, null]]);
    assert.equal(s.wrongButAuto, 1, "a missing required value that nobody flagged is also dangerous");
});

test("list cells are compared one by one, text ignoring case and spacing", () => {
    const reading = readingOf(["handover", "handover"], { handover: { phong: " pm1 ", thietBi: [{ ten: "THÙNG  MÁY", soLuong: 35 }] } });
    const s = scoreCase(listCase, ["c.jpg", "d.jpg"], reading, "can_xem");
    const byPath = Object.fromEntries(s.fields.map((f) => [f.path, f.ok]));
    assert.deepEqual(byPath, { "handover.phong": true, "handover.thietBi.length": true, "handover.thietBi[0].ten": true, "handover.thietBi[0].soLuong": false });
});

test("summarize totals accuracy, dangerous mistakes and the number needing review", () => {
    const a = scoreCase(speedCase, ["a.jpg", "b.jpg"], readingOf(["speedtest", "khac"], { speedtest: { mbps: 75 } }), "tu_dong_dat");
    const b = scoreCase(speedCase, ["a.jpg", "b.jpg"], readingOf(["speedtest", "khac"], { speedtest: { mbps: 57 } }), "can_xem");
    assert.deepEqual(summarize([a, b]), { classAccuracy: 1, fieldAccuracy: 0.5, wrongButAuto: 0, needReview: 1 });
});

test("loadGolden validates the file and accepts an empty list of cases", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-"));
    const file = path.join(dir, "cases.json");
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [] }), "utf8");
    assert.deepEqual(loadGolden(file).cases, []);
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [speedCase] }), "utf8");
    assert.equal(loadGolden(file).cases[0].name, "toc-do-75");
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [{ ...speedCase, loai: { "a.jpg": "speedtest" } }] }), "utf8");
    assert.throws(() => loadGolden(file), /b\.jpg/);
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [speedCase, speedCase] }), "utf8");
    assert.throws(() => loadGolden(file), /trùng/);
    fs.writeFileSync(file, JSON.stringify({ cases: [] }), "utf8");
    assert.throws(() => loadGolden(file), /sourceDir/);
});

test("the committed cases.json loads", () => {
    assert.doesNotThrow(() => loadGolden(path.join(process.cwd(), "photo-golden", "cases.json")));
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/photoGolden.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/golden.js'`).

- [ ] **Step 3: Viết `src/vision/golden.ts`**

```ts
import fs from "node:fs";
import { flattenExtracted, flattenReading, norm } from "./review.js";
import type { BundleReading } from "../types/index.js";

/**
 * Bộ đáp án đúng: mỗi ca là MỘT BỘ ảnh (danh sách file trong `sourceDir`) kèm đáp án người dùng đã xác nhận. `photos:golden` đọc từng
 * ca bằng chính chu trình thật rồi chấm điểm. Chỉ số quan trọng nhất là `wrongButAuto`: trường đọc SAI mà bộ vẫn `tu_dong_dat`
 * (lỗi lọt qua cả ba lớp review).
 */
export interface GoldenCase {
    name: string;
    files: string[];
    loai: Record<string, string>;
    extracted: Record<string, Record<string, unknown>>;
}
export interface GoldenFile {
    sourceDir: string;
    cases: GoldenCase[];
}

export function loadGolden(file: string): GoldenFile {
    const raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as Partial<GoldenFile>;
    if (typeof raw.sourceDir !== "string" || raw.sourceDir.trim() === "") throw new Error(`${file}: thiếu sourceDir`);
    if (!Array.isArray(raw.cases)) throw new Error(`${file}: thiếu cases`);
    const names = new Set<string>();
    for (const c of raw.cases) {
        if (typeof c.name !== "string" || c.name === "") throw new Error(`${file}: ca không có name`);
        if (names.has(c.name)) throw new Error(`${file}: tên ca trùng: ${c.name}`);
        names.add(c.name);
        if (!Array.isArray(c.files) || c.files.length === 0) throw new Error(`${file}: ca ${c.name} không có files`);
        for (const f of c.files) if (typeof c.loai?.[f] !== "string") throw new Error(`${file}: ca ${c.name} thiếu loai cho file ${f}`);
        if (typeof c.extracted !== "object" || c.extracted === null) throw new Error(`${file}: ca ${c.name} thiếu extracted`);
    }
    return { sourceDir: raw.sourceDir, cases: raw.cases };
}

export interface CaseScore {
    name: string;
    classes: { ok: number; total: number };
    fields: Array<{ path: string; expected: unknown; actual: unknown; ok: boolean }>;
    status: string;
    wrongButAuto: number;
}

/** `imageFiles[i]` là tên file của ảnh có `seq = i + 1`. */
export function scoreCase(c: GoldenCase, imageFiles: string[], reading: BundleReading, status: string): CaseScore {
    const classes = { ok: 0, total: imageFiles.length };
    imageFiles.forEach((file, i) => {
        if (reading.images.find((x) => x.seq === i + 1)?.loai === c.loai[file]) classes.ok += 1;
    });
    const actual = flattenReading(reading);
    const fields = [...flattenExtracted(c.extracted)].map(([path, expected]) => {
        const got = actual.get(path) ?? null;
        return { path, expected, actual: got, ok: norm(expected) === norm(got) };
    });
    const wrong = fields.filter((f) => !f.ok).length + (classes.total - classes.ok);
    return { name: c.name, classes, fields, status, wrongButAuto: status === "tu_dong_dat" ? wrong : 0 };
}

export function summarize(scores: CaseScore[]): { classAccuracy: number; fieldAccuracy: number; wrongButAuto: number; needReview: number } {
    const classOk = scores.reduce((n, s) => n + s.classes.ok, 0);
    const classTotal = scores.reduce((n, s) => n + s.classes.total, 0);
    const fieldOk = scores.reduce((n, s) => n + s.fields.filter((f) => f.ok).length, 0);
    const fieldTotal = scores.reduce((n, s) => n + s.fields.length, 0);
    return {
        classAccuracy: classTotal === 0 ? 1 : classOk / classTotal,
        fieldAccuracy: fieldTotal === 0 ? 1 : fieldOk / fieldTotal,
        wrongButAuto: scores.reduce((n, s) => n + s.wrongButAuto, 0),
        needReview: scores.filter((s) => s.status === "can_xem").length,
    };
}
```

- [ ] **Step 4: Tạo `photo-golden/cases.json` (rỗng, chờ đáp án của người dùng)**

```json
{
    "sourceDir": "data/images/AI_reading_picture",
    "cases": []
}
```

- [ ] **Step 5: Chạy test**

Run: `node --import tsx --test tests/photoGolden.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Viết lệnh `src/cli/photos-golden.ts`**

```ts
import path from "node:path";
import { config } from "../../config.js";
import { photoGoldenDir, photoReportsDir, repoRoot } from "../core/paths.js";
import { parseGroupName } from "../lesson/schoolArea.js";
import { makeClaudeReader } from "../vision/claudeReader.js";
import { draftFromFiles } from "../vision/bundling.js";
import { writeBundle } from "../vision/bundleStore.js";
import { loadGolden, scoreCase, summarize, type CaseScore } from "../vision/golden.js";
import { processBundle } from "../vision/pipeline.js";
import { loadRules } from "../vision/rules.js";

/**
 * Đo độ chính xác của agent trên bộ đáp án đúng `photo-golden/cases.json`: mỗi ca dựng thành một bộ ảnh (trong
 * `data/photo-reports/golden/`), đọc bằng chính chu trình thật (kể cả lần đọc hai) rồi chấm. TỐN HẠN MỨC nên chỉ chạy tay, không có
 * trong `npm test`. Không đụng DB, Excel hay kho tin.
 *
 *   npm run photos:golden -- [--case <tên ca>]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

async function main(): Promise<void> {
    const golden = loadGolden(path.join(photoGoldenDir, "cases.json"));
    const only = option("--case");
    const cases = golden.cases.filter((c) => !only || c.name === only);
    if (cases.length === 0) {
        console.log(only ? `[photos:golden] không có ca "${only}".` : "[photos:golden] chưa có ca nào trong photo-golden/cases.json (cần đáp án đúng của người dùng).");
        return;
    }
    const rules = loadRules();
    const reader = makeClaudeReader({ model: config.vision.model, secondModel: config.vision.secondModel, timeoutMs: config.vision.timeoutSeconds * 1000 });
    const root = path.join(photoReportsDir(config.dataDir), "golden");
    const scores: CaseScore[] = [];

    for (const c of cases) {
        const files = c.files.map((f) => path.resolve(repoRoot, golden.sourceDir, f));
        const draft = draftFromFiles(files, c.name);
        const written = writeBundle(root, config.dataDir, draft, parseGroupName(c.name));
        console.log(`[photos:golden] đọc ca "${c.name}" (${files.length} ảnh) ...`);
        const r = await processBundle(written.dir, { reader, rules });
        if (!r.ok) {
            console.error(`[photos:golden] LỖI ca "${c.name}": ${r.error}`);
            process.exitCode = 1;
            continue;
        }
        const manifestFiles = draft.images.map((i) => path.basename(i.source));
        const score = scoreCase(c, manifestFiles, r.reading, r.review.status);
        scores.push(score);
        console.log(`  trạng thái ${score.status}; phân loại ảnh ${score.classes.ok}/${score.classes.total}; trường đúng ${score.fields.filter((f) => f.ok).length}/${score.fields.length}`);
        for (const f of score.fields.filter((x) => !x.ok)) console.log(`  SAI ${f.path}: đúng ${JSON.stringify(f.expected)}, đọc ${JSON.stringify(f.actual)}`);
        if (score.wrongButAuto > 0) console.log(`  !! ${score.wrongButAuto} chỗ sai mà vẫn tu_dong_dat`);
    }

    const s = summarize(scores);
    console.log(`[photos:golden] ${scores.length}/${cases.length} ca đọc được: phân loại ảnh đúng ${pct(s.classAccuracy)}, trường đúng ${pct(s.fieldAccuracy)}, cần xem ${s.needReview}, SAI MÀ VẪN TỰ ĐẠT ${s.wrongButAuto}.`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
```

Thêm vào `package.json`: `"photos:golden": "tsx src/cli/photos-golden.ts",`.

- [ ] **Step 7: Kiểm tra kiểu và chạy thử không tốn token**

Run: `npm run typecheck` rồi `npx tsx src/cli/photos-golden.ts`
Expected: `[photos:golden] chưa có ca nào trong photo-golden/cases.json (cần đáp án đúng của người dùng).`

- [ ] **Step 8: Commit**

```bash
git add src/vision/golden.ts src/cli/photos-golden.ts photo-golden tests/photoGolden.test.ts package.json
git commit -m "feat(vision): bộ đáp án đúng và lệnh photos:golden đo độ chính xác" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Tài liệu, cập nhật spec và kiểm tra cuối

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-07-doc-anh-agent-design.md`

- [ ] **Step 1: Cập nhật `CLAUDE.md`**

Thêm vào khối lệnh (cuối danh sách lệnh trong mục "Commands", sau dòng `recover:missing`):

```
npm run photos:bundle -- [--day D] [--group <mã nhóm>] [--from-dir <thư mục>]   # gom ảnh (chat.photo trong kho tin) thành bộ ảnh = một báo cáo: cùng người gửi, mỗi ảnh cách ảnh trước <= config.vision.bundle.gapMinutes; bộ "open" tới khi yên settleMinutes; ghi data/photo-reports/<ngày>/<nhóm>/<mã bộ>/{manifest.json, 01.jpg ... (liên kết cứng)}; --from-dir gom cả một thư mục ảnh rời thành một bộ (bộ ảnh mẫu); chạy lại không tạo bộ trùng, ảnh về muộn đặt cờ reread
npm run photos:read -- [--day D] [--bundle <mã bộ>] [--again] [--dry-run]   # đọc các bộ đã đóng chưa đọc bằng `claude -p` (config.vision.model, mặc định Haiku 4.5): một lần gọi cho cả bộ; luật trong photo-rules/*.json (speedtest, handover) sinh lược đồ và prompt; review lớp 1 (luật) -> lớp 2 (đọc lần hai độc lập khi luật đòi) -> ghi reading.json, review.json (tu_dong_dat | can_xem); TỐN hạn mức subscription, tối đa config.vision.maxBundlesPerRun bộ mỗi lần; --dry-run chỉ liệt kê
npm run photos:review -- [--list] [--bundle <mã bộ> [--confirm | --fix đường.dẫn=giá_trị ... | --discard]]   # review lớp 3: người xem các bộ can_xem (da_xac_nhan | da_sua | da_bo)
npm run photos:golden -- [--case <tên>]         # đo độ chính xác trên photo-golden/cases.json (đáp án đúng do người dùng cung cấp); chạy tay, tốn hạn mức, in cả số trường SAI MÀ VẪN tu_dong_dat
```

Và một đoạn mô tả ngắn ở sau đoạn `**bot:total** is the fifth process`:

```
**Agent đọc ảnh (`src/vision/`, bản chạy thử, chưa nối vào `bot:runner`)**: bốn lệnh `photos:*` ở trên chỉ ghi vào `data/photo-reports/`, không đụng DB, Excel hay kho tin. Mỗi loại ảnh là một file luật trong `photo-rules/` (thêm loại mới = thêm file, không sửa code; kiểu trường `so|chu|ngay|dung_sai|danh_sach`, luật kiểm `tong_dong|cac_dong_bang_nhau|ngay_gan_gio_gui`). `VisionReader` là giao diện (cách thực hiện đầu tiên `claude -p` ở `src/vision/claudeReader.ts`, truyền được bản giả khi test). Trường `model` của một luật được đọc nhưng chưa dùng. Thiết kế: `docs/superpowers/specs/2026-10-07-doc-anh-agent-design.md`, kế hoạch: `docs/superpowers/plans/2026-10-07-doc-anh-agent.md`.
```

Cũng đổi câu "config.ts ... in 8 documented sections" thành số mục hiện có nếu cần (config có 12 mục).

- [ ] **Step 2: Cập nhật spec**

Trong `docs/superpowers/specs/2026-10-07-doc-anh-agent-design.md`:
- Dòng 3 đổi thành `Ngày: 2026-10-07. Trạng thái: đã có kế hoạch triển khai (docs/superpowers/plans/2026-10-07-doc-anh-agent.md).`
- Mục 3 "Review": thêm `da_bo` vào danh sách trạng thái.
- Mục 6: thêm ghi chú: `dung_sai` là ô đúng/sai (boolean); `luatKiemTra` có ba loại `tong_dong`, `cac_dong_bang_nhau`, `ngay_gan_gio_gui`; trường `model` của luật được đọc nhưng bản chạy thử chưa dùng, vì một lần gọi đọc cả bộ nên chưa biết loại ảnh trước khi chọn model (cần bước phân loại riêng, làm khi đo thấy Haiku đọc chưa đủ chính xác biên bản).
- Mục 11: bộ đáp án đúng chia theo ca (mỗi ca một bộ ảnh), định dạng ở `photo-golden/cases.json`.

- [ ] **Step 3: Chạy toàn bộ kiểm tra**

Run: `npm run typecheck` rồi `npm test`
Expected: PASS toàn bộ (không có test nào gọi `claude`).

- [ ] **Step 4: Chạy thử đường đi hoàn chỉnh KHÔNG tốn token**

Run:
```
npx tsx src/cli/photos-bundle.ts --from-dir data/images/AI_reading_picture
npx tsx src/cli/photos-read.ts --dry-run
npx tsx src/cli/photos-review.ts --list
npx tsx src/cli/config-show.ts
```
Expected: bộ mẫu được tạo; `--dry-run` liệt kê đúng bộ đó mà không gọi agent; `--list` báo 0 bộ; `config:show` có mục `12. ĐỌC ẢNH`.

- [ ] **Step 5: (cần người dùng đồng ý, tốn hạn mức) Đọc thử thật một bộ**

Chỉ chạy khi người dùng nói đồng ý vì gọi `claude -p` thật: `npx tsx src/cli/photos-read.ts --bundle <mã bộ vừa tạo>`; kết quả báo lại cho người dùng (trạng thái, các trường đọc được, các điểm lệch). Không tự chạy.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-07-doc-anh-agent-design.md
git commit -m "docs(vision): cập nhật CLAUDE.md và spec theo kế hoạch đọc ảnh" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (đã chạy)

**1. Phủ spec**
- §1–2 mục tiêu, phạm vi: Task 1–11 (ngoài phạm vi ghi ở Global Constraints).
- §3 khái niệm, trạng thái: Task 1 (kiểu), Task 10 thêm `da_bo` (Task 12 sửa spec).
- §4 thư mục, manifest, `mã bộ`: Task 4 (`bundleIdOf`), Task 5 (`bundleStore`).
- §5 gom bộ 1–5: Task 4 (quy tắc 1–4), Task 5 (quy tắc 5, chạy lại, đọc lại); `config.vision.bundle`: Task 1.
- §6 luật ảnh, hai luật mẫu, prompt ghép tự động, `khac`: Task 2, Task 3. Trường `model` của luật: nhận nhưng chưa dùng (ghi ở Task 1, Task 12).
- §7 `VisionReader`, `claude -p`, cờ, một lần cho cả bộ, Haiku mặc định, không `--bare`: Task 6.
- §8 review ba lớp: Task 7, 8, 9, 10.
- §9 lệnh: Task 5, 9, 10, 11.
- §10 `config.vision`: Task 1 (mục `enabled` có nhưng chưa bot nào đọc, ghi rõ).
- §11 kiểm thử, golden: Task 11; `VisionReader` giả: Task 9.
- §12 câu hỏi mở: không chặn; "bộ chỉ có ảnh `khac`" xử lý ở Task 8; hai câu hỏi về ngưỡng Mbps và biên bản linh kiện để giai đoạn sau.
- Khoảng trống còn lại (cố ý): đáp án golden do người dùng cung cấp (`photo-golden/cases.json` rỗng); chọn model theo loại ảnh; nối vào `bot:runner`.

**2. Quét chỗ trống:** không còn "TBD"/"TODO". Hai ghi chú trong Task 8 và 10 là hướng dẫn rõ ràng về một dòng test, đã kèm bước sửa cụ thể (Task 8 Step 2).

**3. Nhất quán kiểu:** `BundleDraft.images` là `Omit<ManifestImage,"file">`, `writeBundle` thêm `file`; `ReadResult`/`VisionReader` dùng nhất quán Task 6, 9; `flattenReading` trả `Map` (Task 8) và `finalValues` đổi sang đối tượng thường (Task 10); `norm` dùng chung Task 8 và Task 11; `processBundle` trả `{ok, reading, review}` dùng ở Task 9 và 11; khoá phẳng `luật.trường`, `luật.trường[i].cột`, `luật.trường.length`, `anh[seq].loai` thống nhất giữa `review.ts`, `reviewApply.ts`, `golden.ts`.

**4. Review Focus:** mỗi dòng có test: (1) Task 4 "two senders interleaved", (2) Task 5 "a photo that arrives after the bundle was read", (3) Task 6 và Task 9 ("garbage…", "a failed first read writes nothing"), (4) Task 7 "device rows … null is not 0", (5) Task 11 "wrong value that was still tu_dong_dat" và Task 8/9 "all-khac".
