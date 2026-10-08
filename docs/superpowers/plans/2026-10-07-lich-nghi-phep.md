# Báo cáo LỊCH NGHỈ PHÉP KỸ THUẬT (đọc từ ảnh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bot đọc ảnh "KỸ THUẬT NGHỈ PHÉP ĐÃ DUYỆT" gửi vào nhóm Zalo (không có tiêu đề), khớp họ tên với danh sách trong file mẫu `LICH NGHI PHEP KY THUAT.xlsx` và chỉ điền hai cột NGÀY và BUỔI của đúng dòng người đó; file này là báo cáo thứ 8 (mã `leave`) trong `bot:runner`, `bot:total` và đợt in.

**Architecture:** Mô-đun `src/vision/` (gom ảnh thành bộ, luật ảnh JSON, `VisionReader` bằng `claude -p`, chu trình đọc) và `src/leave/` (hàm thuần: ngày, BUỔI, khớp tên, kiểm tra từng dòng, chọn kỳ nghỉ còn hiệu lực, dựng danh sách ô cần ghi). Báo cáo điền **tại chỗ** nhờ cờ `inPlace` của script Excel. Trạng thái nằm trong `data/photo-reports/<ngày>/<nhóm>/<bộ>/` (manifest, reading, review theo từng dòng), không thêm bảng DB. `bot:runner` chạy đọc ảnh rồi `fill:leave-report` ở cuối chu trình; `bot:total` chỉ đọc kết quả đã có.

**Tech Stack:** TypeScript ESM (Node >= 22, `tsx`), `node:test`, `node:child_process`, `xlsx` (đã có, đọc danh sách tên), Excel COM qua PowerShell (đã có), `claude` CLI (`C:\Users\Admin\.local\bin\claude.exe`). Không thêm gói npm nào.

**Spec:** `docs/superpowers/specs/2026-10-07-lich-nghi-phep-design.md` (kế thừa các mục 4 đến 10 của `2026-10-07-doc-anh-agent-design.md` cho bộ đọc ảnh; plan cũ `2026-10-07-doc-anh-agent.md` giữ nguyên, sẽ sửa lại cho phần 4 và 5 sau).

## Global Constraints

- Báo cáo nghỉ phép chỉ ghi hai cột `E` (BUỔI) và `F` (NGÀY) của dòng khớp tên; không động vào A, B, C, D, G đến M, `H2 =TODAY()`, "Nhân viên báo cáo", "Bộ phận". Ô NGÀY là chữ: đặt `numberFormat "@"` trước khi ghi; một ngày `dd/MM/yyyy`, nhiều ngày `dd/MM/yyyy - dd/MM/yyyy`.
- BUỔI: mốc 12:00 (`config.sessions.chieuFromHour`). Cùng ngày: bắt đầu từ 12:00 là `Chiều`; bắt đầu trước 12:00 và kết thúc từ 12:00 trở xuống là `Sáng`; còn lại `Cả ngày`. Nhiều ngày: ngày đầu `Cả ngày` nếu bắt đầu trước 12:00 còn lại `Chiều`; ngày cuối `Cả ngày` nếu kết thúc sau 12:00 còn lại `Sáng`; ghi `<đầu> - <cuối>`, riêng cả hai `Cả ngày` thì chỉ ghi `Cả ngày`.
- Tên khớp sau khi chuẩn hóa (bỏ dấu, `đ` thành `d`, chữ thường, gộp khoảng trắng); một tên ở nhiều dòng thì điền mọi dòng; tên không có trong danh sách thì KHÔNG điền, chỉ báo "cần xem" kèm tối đa 3 gợi ý.
- Kiểm chứng chéo mỗi dòng: THỨ bắt đầu, THỨ kết thúc (CN = 1 đến thứ bảy = 7), SỐ NGÀY (không tính Chủ nhật). Lệch từ 2 phép là `can_xem`, lệch đúng 1 phép chỉ cảnh báo.
- File mỗi ngày dựng từ mọi dòng đã vào Excel được (`tu_dong_dat`, `da_xac_nhan`, `da_sua`) có `denNgay` từ hôm nay trở đi; người có ở nhiều ảnh lấy ảnh mới nhất; cùng một người nhiều kỳ trong một ảnh lấy kỳ có `denNgay` nhỏ nhất.
- Kho ảnh gốc `data/images/...` KHÔNG đổi; bộ ảnh dùng liên kết cứng, không được thì sao chép. Model mặc định `haiku`; một lần gọi `claude -p` cho cả bộ; prompt qua stdin; cờ `--output-format json --json-schema <lược đồ> --model <m> --allowedTools Read --add-dir <thư mục bộ> --disable-slash-commands --no-session-persistence --setting-sources user --system-prompt <lời dặn>`; chạy ở thư mục làm việc sạch; KHÔNG dùng `--bare`. Lần đọc thứ hai không được thấy kết quả lần một.
- `config.vision.enabled` mặc định `false`; bước đọc ảnh trong runner chỉ chạy khi `true`, lỗi ở đó chỉ là cảnh báo. `bot:total` không bao giờ gọi agent.
- Không dùng `vision.` trong `tests/helpers/pinConfig.ts` (khoá lồng nhau `vision.bundle.*` sẽ bị ghi đè sai); test của mô-đun này truyền tham số tường minh, không đọc `config.vision`.
- Mã theo phong cách dự án: thụt 4 khoảng trắng, dấu nháy kép, import có đuôi `.js`, chú thích tiếng Việt, kiểu dùng chung qua `src/types/index.ts`, đường dẫn từ `src/core/paths.ts`.
- Commit lên nhánh `phuc_dev`, KHÔNG push (chỉ push khi người dùng bảo). Mỗi commit kết thúc bằng dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Trong môi trường này `npm run <script>` đôi khi không in gì (thoát mã 127): dùng `npx tsx src/cli/<tệp>.ts ...` thay thế. Chạy một file test: `node --import tsx --test tests/<tệp>.test.ts`.

## Review Focus

Các tình huống spec nhắc nhưng dễ làm hỏng nhất (mỗi dòng có test ở task nêu trong ngoặc):

1. Ảnh nghỉ phép lẫn ảnh phòng máy trong cùng một bộ, và bộ chỉ toàn ảnh `khac`: ảnh lạ bị bỏ qua, bộ toàn `khac` không tốn lần đọc thứ hai và không lỗi (Task 8, 9).
2. Tên có dấu, hoa thường và khoảng trắng khác nhau, cùng người ở hai dòng của file, tên chưa có trong danh sách (Task 7, 12).
3. Kỳ nghỉ kết thúc đúng hôm nay vẫn được giữ, kết thúc hôm qua thì biến mất; ảnh mới nhất đang `can_xem` không được xoá kỳ nghỉ tốt cũ (Task 12).
4. Giờ viết `8:00` hay `08:00`, giờ đúng 12:00, nghỉ nhiều ngày qua Chủ nhật (Task 7).
5. `claude` không dùng được (chưa đăng nhập, quá giờ, đầu ra rác, bỏ sót ảnh): bộ vẫn "chưa đọc", không ghi nửa chừng, và `bot:runner` không hỏng chu trình (Task 6, 9, 14).
6. Ngày không có kỳ nghỉ nào: `fill:leave-report` không dựng file riêng nhưng `bot:total` vẫn xuất file 8 với mọi NGÀY trống, và một lỗi đọc dữ liệu nghỉ phép không làm mất 7 file kia (Task 13, 14).

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `src/types/vision.ts` (mới) | Kiểu của bộ đọc ảnh: luật, manifest, kết quả đọc, review theo dòng, `VisionReader` |
| `src/vision/rules.ts` (mới) | Đọc và kiểm tra `photo-rules/*.json` |
| `src/vision/promptSchema.ts` (mới) | Sinh lược đồ kết quả và prompt từ luật |
| `src/vision/bundling.ts` (mới) | Gom ảnh thành bộ (`groupPhotos`), lọc ảnh theo nhóm, `draftFromFiles` |
| `src/vision/bundleStore.ts` (mới) | Ghi thư mục bộ, liệt kê bộ |
| `src/vision/bundleRun.ts` (mới) | `bundleFromMessages`: gom và ghi các bộ từ tin đã lọc (dùng chung CLI và runner) |
| `src/vision/claudeReader.ts` (mới) | `VisionReader` bằng `claude -p` |
| `src/vision/review.ts` (mới) | Hàm chung: làm phẳng kết quả, so hai lần đọc, cần đọc lần hai không |
| `src/vision/pipeline.ts` (mới) | `processBundle`, `readBundles` |
| `src/leave/dates.ts`, `buoi.ts`, `names.ts`, `roster.ts` (mới) | Hàm thuần: ngày, BUỔI và NGÀY, chuẩn hóa và khớp tên, đọc danh sách từ file mẫu |
| `src/leave/validate.ts`, `review.ts` (mới) | Kiểm tra từng dòng nghỉ, review theo dòng của một bộ |
| `src/leave/reviewApply.ts` (mới) | Người xem: xác nhận, sửa, bỏ từng dòng |
| `src/leave/sources.ts`, `collect.ts`, `cells.ts`, `buildDay.ts`, `realIo.ts` (mới) | Đọc dòng từ đĩa, chọn kỳ nghỉ còn hiệu lực, dựng ô Excel, gói cho một ngày |
| `src/leave/layout.ts`, `leaveState.ts` (mới) | `LEAVE_LAYOUT`, trạng thái dựng file theo ngày |
| `src/cli/photos-bundle.ts`, `photos-read.ts`, `photos-review.ts`, `photos-auto.ts`, `photos-golden.ts`, `fill-leave-report.ts`, `leave-show.ts` (mới) | Các lệnh |
| `photo-rules/leave.json`, `photo-golden/leave.json` (mới, commit) | Luật ảnh và đáp án đúng |
| `scripts/fill-status-template.ps1`, `src/lesson/excelFill.ts`, `src/lesson/statusReportLayout.ts` | Cờ `inPlace` |
| `src/reportSets/registry.ts`, `src/total/runTotal.ts`, `src/total/realDeps.ts`, `src/runner/steps.ts`, `config.ts`, `src/types/config.ts`, `src/config/*`, `src/core/paths.ts`, `package.json` | Nối vào hệ thống |
| `tests/helpers/visionFixtures.ts`, `tests/photo*.test.ts`, `tests/leave*.test.ts`, `tests/visionCompare.test.ts`, `tests/totalLeave.test.ts` (mới) | Test |

---

### Task 1: Kiểu dùng chung và `config.vision`

**Files:**
- Create: `src/types/vision.ts`
- Modify: `src/types/index.ts`, `src/types/config.ts`, `config.ts`, `src/config/configCheck.ts`, `src/config/configDoc.ts`, `src/core/paths.ts`, `tests/configCheck.test.ts`, `tests/configDoc.test.ts`

**Interfaces:**
- Produces: các kiểu của `src/types/vision.ts` (dưới đây), `config.vision`, `photoRulesDir`, `photoGoldenDir`, `photoReportsDir(dataDir: string): string`.

- [ ] **Step 1: Viết test cấu hình (đỏ)**

Trong `tests/configCheck.test.ts`, thêm vào hàm `good()` ngay sau dòng `print:`:

```ts
    vision: { enabled: false, reader: "claude-p", model: "haiku", secondModel: "haiku", timeoutSeconds: 180, maxBundlesPerRun: 3, bundle: { gapMinutes: 3, textWindowMinutes: 10 }, leave: { groups: ["bot test"], senders: [], settleSeconds: 20, lookbackDays: 60, maxPastDays: 7, maxFutureDays: 120 } },
```

Thêm vào cuối file:

```ts
test("vision settings are validated and the error names the key", () => {
    assert.throws(bad((c) => (c.vision.timeoutSeconds = 0)), /vision\.timeoutSeconds/);
    assert.throws(bad((c) => (c.vision.maxBundlesPerRun = -1)), /vision\.maxBundlesPerRun/);
    assert.throws(bad((c) => (c.vision.bundle.gapMinutes = 1.5)), /vision\.bundle\.gapMinutes/);
    assert.throws(bad((c) => (c.vision.bundle.textWindowMinutes = 0)), /vision\.bundle\.textWindowMinutes/);
    assert.throws(bad((c) => (c.vision.model = "  ")), /vision\.model/);
    assert.throws(bad((c) => (c.vision.secondModel = "")), /vision\.secondModel/);
    assert.throws(bad((c) => (c.vision.reader = "api" as "claude-p")), /vision\.reader/);
    assert.throws(bad((c) => (c.vision.enabled = "yes" as unknown as boolean)), /vision\.enabled/);
    assert.throws(bad((c) => (c.vision.leave.settleSeconds = 0)), /vision\.leave\.settleSeconds/);
    assert.throws(bad((c) => (c.vision.leave.lookbackDays = 0)), /vision\.leave\.lookbackDays/);
    assert.throws(bad((c) => (c.vision.leave.maxPastDays = -1)), /vision\.leave\.maxPastDays/);
    assert.throws(bad((c) => (c.vision.leave.maxFutureDays = 2.5)), /vision\.leave\.maxFutureDays/);
    assert.throws(bad((c) => (c.vision.leave.senders = [1 as unknown as string])), /vision\.leave\.senders/);
});

test("vision.leave.groups must be names that are in targets", () => {
    assert.throws(bad((c) => (c.vision.leave.groups = ["Nhóm lạ"])), /vision\.leave\.groups.*Nhóm lạ/);
    assert.throws(bad((c) => (c.vision.leave.groups = "bot test" as unknown as string[])), /vision\.leave\.groups/);
    assert.deepEqual(validateConfig({ ...good(), vision: { ...good().vision, leave: { ...good().vision.leave, groups: [] } } }), []);
});

test("a leave settle time that is not shorter than the runner quiet time is only a warning", () => {
    const c = good();
    c.vision.leave.settleSeconds = c.runner.quietSeconds;
    const warnings = validateConfig(c);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /vision\.leave\.settleSeconds/);
});
```

Trong `tests/configDoc.test.ts` đổi test "11 sections": tiêu đề thành `... one of the 12 sections ...` và `assert.equal(SECTIONS.length, 12);`.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/configCheck.test.ts tests/configDoc.test.ts`
Expected: FAIL (biên dịch lỗi: `vision` chưa có trong `ConfigShape`).

- [ ] **Step 3: Viết `src/types/vision.ts`**

```ts
// Kiểu của bộ đọc ảnh báo cáo. Import qua "../types/index.js".
import type { SchoolArea } from "./report.js";

export type FieldKind = "so" | "chu" | "ngay" | "dung_sai" | "danh_sach";
/** `dung_sai` là ô đúng/sai (boolean). `ngay` là chuỗi `YYYY-MM-DD`. */
export type Confidence = "cao" | "vua" | "thap";
export type SecondReadMode = "luon" | "khi_tin_cay_thap" | "khong";

export interface RuleField {
    ten: string;
    kieu: FieldKind;
    /** Chỉ là gợi ý cho agent (đưa vào prompt); việc kiểm tra thật do mã của từng loại ảnh làm (xem `src/leave/validate.ts`). */
    batBuoc?: boolean;
    min?: number;
    max?: number;
    goiY?: string;
    /** Chỉ với `danh_sach`: các cột của mỗi phần tử. */
    phanTu?: RuleField[];
}

export interface PhotoRule {
    id: string;
    version: number;
    title: string;
    nhanRa: string;
    soLuongMoiBo: { toiThieu: number; toiDa: number };
    truong: RuleField[];
    docLanHai: SecondReadMode;
    /** Độ tin cậy thấp nhất vẫn được xếp `tu_dong_dat`. */
    nguongTinCay: "cao" | "vua";
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
export interface Disagreement {
    path: string;
    first: unknown;
    second: unknown;
}
/** Kết quả kiểm tra MỘT dòng nghỉ phép (chỉ số `index` là vị trí trong `leaveRowsOf(reading)`). */
export interface RowReview {
    index: number;
    status: ReviewStatus;
    /** Lý do dòng này `can_xem` (luật cứng trượt, hai lần đọc lệch, lý do cấp bộ). */
    reasons: string[];
    /** Cảnh báo không chặn (ví dụ một phép kiểm chứng chéo lệch). */
    warnings: string[];
    human: null | { at: number; action: "xac_nhan" | "sua" | "bo"; corrections: Record<string, unknown> };
}
export interface Review {
    /** Trạng thái xấu nhất của các dòng (xem `bundleStatus`). */
    status: ReviewStatus;
    /** Lý do cấp bộ (số ảnh sai, độ tin cậy thấp, hai lần đọc phân loại khác nhau, đọc lần hai lỗi...): làm mọi dòng `can_xem`. */
    reasons: string[];
    /** Ghi chú không chặn (ví dụ ngày báo cáo trên ảnh lệch ngày gửi). */
    notes: string[];
    rows: RowReview[];
    secondRead: { ran: boolean; disagree: Disagreement[] };
    /** true khi người xem bỏ cả bộ. */
    dismissed?: boolean;
}
```

Thêm vào `src/types/index.ts` (giữ thứ tự chữ cái, sau `./session.js`): `export * from "./vision.js";`

- [ ] **Step 4: Sửa `src/types/config.ts`**

Thêm vào `ConfigShape` sau dòng `print:`:

```ts
    vision: {
        enabled: boolean;
        reader: "claude-p";
        model: string;
        secondModel: string;
        timeoutSeconds: number;
        maxBundlesPerRun: number;
        bundle: { gapMinutes: number; textWindowMinutes: number };
        leave: { groups: string[]; senders: string[]; settleSeconds: number; lookbackDays: number; maxPastDays: number; maxFutureDays: number };
    };
```

- [ ] **Step 5: Thêm mục 12 vào `config.ts`** (ngay sau khối `print: { ... },`, trước `};` cuối cùng)

```ts

    // ═══════════════════════════════════════════════════════════════════════
    // 12. ĐỌC ẢNH (photos:*, báo cáo LỊCH NGHỈ PHÉP) — agent đọc ảnh báo cáo gửi vào nhóm Zalo.
    // ═══════════════════════════════════════════════════════════════════════
    vision: {
        /** Bật việc đọc ảnh TỰ ĐỘNG trong bot:runner (chỉ ảnh của các nhóm ở `leave.groups`). Tắt thì bot không gọi agent; các lệnh photos:* chạy tay luôn chạy được. Ví dụ: true. */
        enabled: false,
        /** Cách đọc ảnh. Hiện chỉ có "claude-p" (chạy `claude -p` bằng đăng nhập Claude Code trên máy). */
        reader: "claude-p",
        /** Model cho lần đọc thứ nhất, tên mà `claude --model` nhận. "haiku" là Haiku 4.5 (claude-haiku-4-5-20251001). Ví dụ: "haiku". */
        model: "haiku",
        /** Model cho lần đọc thứ hai (độc lập với lần một). Đặt model khác lần một để hai lần đọc ít sai giống nhau. Ví dụ: "haiku". */
        secondModel: "haiku",
        /** Chờ tối đa bấy nhiêu giây cho MỘT lần gọi agent đọc một bộ ảnh; quá hạn thì bộ đó báo lỗi và vẫn chưa đọc. Đơn vị: giây. */
        timeoutSeconds: 180,
        /** Mỗi lần chạy (photos:read hoặc một chu trình runner) đọc tối đa bấy nhiêu bộ (chặn tốn hạn mức subscription). Đơn vị: bộ. */
        maxBundlesPerRun: 3,
        bundle: {
            /** Hai ảnh liên tiếp của cùng một người cách nhau không quá bấy nhiêu phút thì cùng một bộ. Đơn vị: phút. */
            gapMinutes: 3,
            /** Tin chữ của cùng người gửi trong khoảng bấy nhiêu phút quanh bộ được đính kèm làm tiêu đề hoặc chú thích. Đơn vị: phút. */
            textWindowMinutes: 10,
        },
        leave: {
            /** Nhóm được đọc ảnh nghỉ phép (tên đúng như trong `targets`). Ảnh ở nhóm khác không bao giờ bị đưa cho agent. Ví dụ: ["bot test"]. */
            groups: ["bot test"],
            /** Chỉ đọc ảnh của các người gửi này (tên hiển thị trong Zalo). Để trống [] là đọc ảnh của mọi người trong các nhóm trên. */
            senders: [],
            /** Bộ ảnh nghỉ phép được coi là đủ ảnh sau khi yên bấy nhiêu giây kể từ ảnh cuối. PHẢI nhỏ hơn `runner.quietSeconds`, nếu không bộ chưa đóng khi chu trình chạy. Đơn vị: giây. */
            settleSeconds: 20,
            /** Tìm ảnh nghỉ phép trong bấy nhiêu ngày gần nhất khi dựng file; kỳ nghỉ của ảnh cũ hơn bị bỏ qua. Đơn vị: ngày. */
            lookbackDays: 60,
            /** Ngày bắt đầu nghỉ ghi trên ảnh không được sớm hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem (đọc sai năm). Đơn vị: ngày. */
            maxPastDays: 7,
            /** Ngày bắt đầu nghỉ ghi trên ảnh không được muộn hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem. Đơn vị: ngày. */
            maxFutureDays: 120,
        },
    },
```

- [ ] **Step 6: Sửa `src/config/configCheck.ts`**

Thêm vào mảng `positive` (sau dòng `["print.maxPagesPerFile", ...]`):

```ts
        ["vision.timeoutSeconds", cfg.vision.timeoutSeconds],
        ["vision.maxBundlesPerRun", cfg.vision.maxBundlesPerRun],
        ["vision.bundle.gapMinutes", cfg.vision.bundle.gapMinutes],
        ["vision.bundle.textWindowMinutes", cfg.vision.bundle.textWindowMinutes],
        ["vision.leave.settleSeconds", cfg.vision.leave.settleSeconds],
        ["vision.leave.lookbackDays", cfg.vision.leave.lookbackDays],
        ["vision.leave.maxPastDays", cfg.vision.leave.maxPastDays],
        ["vision.leave.maxFutureDays", cfg.vision.leave.maxFutureDays],
```

Thêm ngay sau khối kiểm `runner.quietSeconds > runner.maxWaitSeconds` (khối `if (isPositiveInt(cfg.runner.quietSeconds) && ...) { ... }`):

```ts
    if (isPositiveInt(cfg.vision.leave.settleSeconds) && isPositiveInt(cfg.runner.quietSeconds) && cfg.vision.leave.settleSeconds >= cfg.runner.quietSeconds) {
        warnings.push(`vision.leave.settleSeconds (${cfg.vision.leave.settleSeconds}) không nhỏ hơn runner.quietSeconds (${cfg.runner.quietSeconds}): bộ ảnh nghỉ phép có thể chưa đóng khi chu trình chạy, ảnh chỉ được đọc ở chu trình sau.`);
    }
```

Thêm trước dòng `if (typeof cfg.statusExportDir ...`:

```ts
    if (typeof cfg.vision.enabled !== "boolean") errors.push(`vision.enabled phải là true hoặc false (đang là ${JSON.stringify(cfg.vision.enabled)}).`);
    if (cfg.vision.reader !== "claude-p") errors.push(`vision.reader chỉ nhận "claude-p" (đang là ${JSON.stringify(cfg.vision.reader)}).`);
    for (const key of ["model", "secondModel"] as const) {
        if (typeof cfg.vision[key] !== "string" || cfg.vision[key].trim() === "") errors.push(`vision.${key} phải là tên một model, ví dụ "haiku" (đang là ${JSON.stringify(cfg.vision[key])}).`);
    }
    if (!Array.isArray(cfg.vision.leave.groups) || cfg.vision.leave.groups.some((g) => typeof g !== "string")) {
        errors.push(`vision.leave.groups phải là danh sách tên nhóm, ví dụ ["bot test"] (đang là ${JSON.stringify(cfg.vision.leave.groups)}).`);
    } else {
        for (const g of cfg.vision.leave.groups) if (!cfg.targets.includes(g)) errors.push(`vision.leave.groups có "${g}" không nằm trong targets.`);
    }
    if (!Array.isArray(cfg.vision.leave.senders) || cfg.vision.leave.senders.some((s) => typeof s !== "string")) {
        errors.push(`vision.leave.senders phải là danh sách tên người gửi, hoặc [] (đang là ${JSON.stringify(cfg.vision.leave.senders)}).`);
    }
```

(Đọc đầu hàm `validateConfig` để thấy `errors`, `warnings` đã được khai báo; hai khối trên dùng đúng hai mảng đó.)

- [ ] **Step 7: Sửa `src/config/configDoc.ts`**

Thêm `, "12. ĐỌC ẢNH (photos:*, nghỉ phép)"` vào cuối mảng `SECTIONS`. Thêm vào cuối `SETTINGS` (trước `];`):

```ts
    { section: SECTIONS[11], path: "vision.enabled", unit: "true/false", default: false, readers: ["bot:runner", "today"], note: "Bật việc đọc ảnh nghỉ phép tự động trong chu trình runner (gọi agent, tốn hạn mức). Tắt thì không gọi agent; các lệnh photos:* chạy tay luôn chạy được." },
    { section: SECTIONS[11], path: "vision.reader", unit: "", default: "claude-p", readers: ["photos:read", "photos:auto", "photos:golden"], note: "Cách đọc ảnh; hiện chỉ có claude-p (chạy `claude -p` bằng đăng nhập Claude Code trên máy)." },
    { section: SECTIONS[11], path: "vision.model", unit: "", default: "haiku", readers: ["photos:read", "photos:auto", "photos:golden"], note: "Model cho lần đọc thứ nhất; haiku là Haiku 4.5." },
    { section: SECTIONS[11], path: "vision.secondModel", unit: "", default: "haiku", readers: ["photos:read", "photos:auto", "photos:golden"], note: "Model cho lần đọc thứ hai độc lập; đặt khác lần một để hai lần ít sai giống nhau." },
    { section: SECTIONS[11], path: "vision.timeoutSeconds", unit: "giây", default: 180, readers: ["photos:read", "photos:auto", "photos:golden"], note: "Chờ tối đa bấy nhiêu giây cho một lần gọi agent đọc một bộ ảnh." },
    { section: SECTIONS[11], path: "vision.maxBundlesPerRun", unit: "bộ", default: 3, readers: ["photos:read", "photos:auto"], note: "Mỗi lần chạy (photos:read hoặc một chu trình runner) đọc tối đa bấy nhiêu bộ (chặn tốn hạn mức)." },
    { section: SECTIONS[11], path: "vision.bundle.gapMinutes", unit: "phút", default: 3, readers: ["photos:bundle", "photos:auto"], note: "Hai ảnh liên tiếp của cùng người cách nhau không quá bấy nhiêu phút thì cùng một bộ." },
    { section: SECTIONS[11], path: "vision.bundle.textWindowMinutes", unit: "phút", default: 10, readers: ["photos:bundle", "photos:auto"], note: "Tin chữ của cùng người trong khoảng bấy nhiêu phút quanh bộ được đính kèm." },
    { section: SECTIONS[11], path: "vision.leave.groups", unit: "", defaultLabel: "[\"bot test\"]", readers: ["photos:bundle", "photos:auto", "bot:total"], note: "Nhóm được đọc ảnh nghỉ phép (tên như trong targets); ảnh ở nhóm khác không bao giờ bị đọc." },
    { section: SECTIONS[11], path: "vision.leave.senders", unit: "", defaultLabel: "[] (mọi người)", readers: ["photos:bundle", "photos:auto"], note: "Chỉ đọc ảnh của các người gửi này; để trống là mọi người trong các nhóm trên." },
    { section: SECTIONS[11], path: "vision.leave.settleSeconds", unit: "giây", default: 20, readers: ["photos:bundle", "photos:auto"], note: "Bộ ảnh nghỉ phép đóng sau khi yên bấy nhiêu giây kể từ ảnh cuối; phải nhỏ hơn runner.quietSeconds." },
    { section: SECTIONS[11], path: "vision.leave.lookbackDays", unit: "ngày", default: 60, readers: ["fill:leave-report", "bot:total", "leave:show"], note: "Tìm ảnh nghỉ phép trong bấy nhiêu ngày gần nhất khi dựng file." },
    { section: SECTIONS[11], path: "vision.leave.maxPastDays", unit: "ngày", default: 7, readers: ["photos:read", "photos:auto", "fill:leave-report", "bot:total", "leave:show"], note: "Ngày bắt đầu nghỉ không sớm hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem." },
    { section: SECTIONS[11], path: "vision.leave.maxFutureDays", unit: "ngày", default: 120, readers: ["photos:read", "photos:auto", "fill:leave-report", "bot:total", "leave:show"], note: "Ngày bắt đầu nghỉ không muộn hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem." },
```

- [ ] **Step 8: Thêm đường dẫn vào `src/core/paths.ts`** (cuối file)

```ts

/** Luật cho từng loại ảnh (được commit): `photo-rules/<mã>.json`. */
export const photoRulesDir = path.join(repoRoot, "photo-rules");

/** Đáp án đúng của người dùng để đo độ chính xác (được commit): `photo-golden/<mã luật>.json`. */
export const photoGoldenDir = path.join(repoRoot, "photo-golden");

/** Các bộ ảnh dẫn xuất: `<dataDir>/photo-reports/<yyyy-MM-dd>/<mã nhóm>/<mã bộ>/`. `dataDir` là `config.dataDir`. */
export function photoReportsDir(dataDir: string): string {
    return path.join(dataDir, "photo-reports");
}
```

- [ ] **Step 9: Chạy kiểm tra và test**

Run: `npm run typecheck` rồi `npm test`
Expected: PASS toàn bộ (kể cả bài kiểm "mọi khoá của config đều có mô tả" của `configDoc` cho 14 khoá `vision.*`). Nếu một test khác dựng `ConfigShape` thủ công thì thêm `vision` giống `good()` ở Step 1. Nếu một test về "readers" (`configWiring`, `configIndependence`) phàn nàn về tên lệnh `photos:*` chưa có, ghi lại và để Task 5 đến 14 thêm lệnh rồi chạy lại ở Task 14; các khoá khác vẫn phải PASS ngay.

- [ ] **Step 10: Commit**

```bash
git add src/types src/core/paths.ts config.ts src/config tests
git commit -m "feat(vision): kiểu dùng chung và mục cấu hình 12 (vision, nghỉ phép)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Đọc và kiểm tra luật ảnh, luật `leave`

**Files:**
- Create: `src/vision/rules.ts`, `photo-rules/leave.json`, `tests/photoRules.test.ts`

**Interfaces:**
- Consumes: `PhotoRule`, `RuleField` (Task 1); `photoRulesDir`.
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
    docLanHai: "khong",
    nguongTinCay: "vua",
});

test("the shipped leave rule loads with the documented shape", () => {
    const rules = loadRules();
    assert.deepEqual(rules.map((r) => r.id), ["leave"]);
    const leave = rules[0];
    assert.deepEqual(leave.soLuongMoiBo, { toiThieu: 1, toiDa: 5 });
    assert.deepEqual(leave.truong.map((f) => f.ten), ["ngayBaoCao", "nguoiBaoCao", "boPhan", "dong"]);
    const dong = leave.truong.find((f) => f.ten === "dong")!;
    assert.equal(dong.kieu, "danh_sach");
    assert.deepEqual(dong.phanTu!.map((c) => c.ten), ["hoTen", "tuGio", "tuThu", "tuNgay", "denGio", "denThu", "denNgay", "soNgay", "lyDo"]);
    assert.equal(leave.docLanHai, "khi_tin_cay_thap");
    assert.equal(leave.nguongTinCay, "vua");
});

test("a valid rule parses and keeps its fields", () => {
    const r = parseRule(base(), "demo.json");
    assert.equal(r.truong[0].max, 10);
    assert.equal(r.truong[0].batBuoc, true);
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
import type { FieldKind, PhotoRule, RuleField, SecondReadMode } from "../types/index.js";

/**
 * Đọc luật ảnh `photo-rules/<mã>.json`. Mọi lỗi nêu tên file và đường dẫn của trường sai để người sửa luật thấy ngay chỗ nào.
 * Luật chỉ MÔ TẢ ảnh và các trường cần lấy (để sinh lược đồ và prompt, xem `promptSchema.ts`); việc kiểm tra nội dung của từng loại ảnh
 * là mã riêng (loại `leave`: `src/leave/validate.ts`).
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

function assertUnique(names: string[], file: string, where: string): void {
    const seen = new Set<string>();
    for (const n of names) {
        if (seen.has(n)) fail(file, where, `tên trùng: "${n}"`);
        seen.add(n);
    }
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
    if (!SECOND_READ.includes(o.docLanHai as SecondReadMode)) fail(file, "gốc.docLanHai", `phải là một trong ${SECOND_READ.join(", ")}`);
    if (o.nguongTinCay !== "cao" && o.nguongTinCay !== "vua") fail(file, "gốc.nguongTinCay", 'phải là "cao" hoặc "vua"');
    return {
        id,
        version,
        title: str(o, "title", file, "gốc"),
        nhanRa: str(o, "nhanRa", file, "gốc"),
        soLuongMoiBo: { toiThieu, toiDa },
        truong,
        docLanHai: o.docLanHai as SecondReadMode,
        nguongTinCay: o.nguongTinCay,
    };
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

- [ ] **Step 4: Tạo `photo-rules/leave.json`**

```json
{
    "id": "leave",
    "version": 1,
    "title": "Bảng nghỉ phép đã duyệt",
    "nhanRa": "Ảnh bảng \"KỸ THUẬT NGHỈ PHÉP ĐÃ DUYỆT\" của Tin Học Đại Dương: có logo, các dòng Nhân viên báo cáo, Bộ phận, Ngày báo cáo, rồi bảng nhiều cột STT, HỌ TÊN, SỐ NGÀY, TỪ (giờ, thứ, ngày), ĐẾN (giờ, thứ, ngày), LÝ DO, ĐÚNG QĐ, XẾP LOẠI, GHI CHÚ và bảng chú giải thống kê bên dưới.",
    "soLuongMoiBo": { "toiThieu": 1, "toiDa": 5 },
    "truong": [
        { "ten": "ngayBaoCao", "kieu": "ngay", "goiY": "Ngày ghi ở \"Ngày báo cáo\" trên đầu bảng, đổi sang YYYY-MM-DD." },
        { "ten": "nguoiBaoCao", "kieu": "chu", "goiY": "Tên sau \"Nhân viên báo cáo:\"." },
        { "ten": "boPhan", "kieu": "chu", "goiY": "Tên sau \"Bộ phận:\"." },
        {
            "ten": "dong",
            "kieu": "danh_sach",
            "batBuoc": true,
            "goiY": "Mỗi dòng người nghỉ trong bảng chính, từ trên xuống dưới. KHÔNG đọc bảng chú giải thống kê ở dưới. Bỏ qua dòng trống. Nếu ảnh có nhiều ảnh nghỉ phép thì gộp các dòng của tất cả ảnh theo thứ tự ảnh.",
            "phanTu": [
                { "ten": "hoTen", "kieu": "chu", "batBuoc": true, "goiY": "Họ tên đầy đủ trong cột HỌ TÊN, giữ nguyên dấu." },
                { "ten": "tuGio", "kieu": "chu", "batBuoc": true, "goiY": "Giờ bắt đầu ở cột TỪ - GIỜ, dạng H:mm, ví dụ 8:00 hoặc 13:30." },
                { "ten": "tuThu", "kieu": "so", "min": 1, "max": 7, "goiY": "Số ở cột TỪ - THỨ (CN là 1, thứ hai là 2, ..., thứ bảy là 7)." },
                { "ten": "tuNgay", "kieu": "ngay", "batBuoc": true, "goiY": "Ngày ở cột TỪ - NGÀY, đổi sang YYYY-MM-DD." },
                { "ten": "denGio", "kieu": "chu", "batBuoc": true, "goiY": "Giờ kết thúc ở cột ĐẾN - GIỜ, dạng H:mm, ví dụ 18:00." },
                { "ten": "denThu", "kieu": "so", "min": 1, "max": 7, "goiY": "Số ở cột ĐẾN - THỨ." },
                { "ten": "denNgay", "kieu": "ngay", "batBuoc": true, "goiY": "Ngày ở cột ĐẾN - NGÀY, đổi sang YYYY-MM-DD." },
                { "ten": "soNgay", "kieu": "so", "min": 0, "max": 366, "goiY": "Số ở cột SỐ NGÀY." },
                { "ten": "lyDo", "kieu": "chu", "goiY": "Chữ ở cột LÝ DO." }
            ]
        }
    ],
    "docLanHai": "khi_tin_cay_thap",
    "nguongTinCay": "vua"
}
```

- [ ] **Step 5: Chạy test**

Run: `node --import tsx --test tests/photoRules.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/vision/rules.ts photo-rules tests/photoRules.test.ts
git commit -m "feat(vision): đọc và kiểm tra luật ảnh, luật ảnh nghỉ phép leave" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lược đồ kết quả và prompt sinh từ luật

**Files:**
- Create: `src/vision/promptSchema.ts`, `tests/helpers/visionFixtures.ts`, `tests/photoPrompt.test.ts`

**Interfaces:**
- Consumes: `PhotoRule`, `Manifest` (Task 1), `loadRules` (Task 2).
- Produces: `PROMPT_VERSION: string` (`"1"`), `SYSTEM_PROMPT: string`, `buildResultSchema(rules: PhotoRule[]): Record<string, unknown>`, `buildPrompt(rules: PhotoRule[], manifest: Manifest, bundleDir: string): string`; test helper (`tests/helpers/visionFixtures.ts`): `T0`, `manifestOf(n, extra?)`, `readingOf(loai, extracted?, conf?)`, `leaveRow(over?)`, `leaveReadingOf(rows, conf?, n?)`.

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
        groupName: "bot test",
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

/** Một dòng nghỉ phép hợp lệ (03/10/2026 là thứ bảy, nên tuThu = denThu = 7, soNgay = 1). */
export function leaveRow(over: Record<string, unknown> = {}): Record<string, unknown> {
    return { hoTen: "Nguyễn Quốc Pháp", tuGio: "8:00", tuThu: 7, tuNgay: "2026-10-03", denGio: "18:00", denThu: 7, denNgay: "2026-10-03", soNgay: 1, lyDo: "Cá nhân", ...over };
}

/** Kết quả đọc của `n` ảnh nghỉ phép gộp các dòng `rows`. */
export function leaveReadingOf(rows: unknown[], conf: Confidence = "cao", n = 1): BundleReading {
    return readingOf(Array.from({ length: n }, () => "leave"), { leave: { ngayBaoCao: "2026-10-02", nguoiBaoCao: "Trần Thị Dung", boPhan: "Nhân sự", dong: rows } }, conf);
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

test("the result schema lists the rule plus khac as an image class", () => {
    const s = buildResultSchema(rules) as Obj;
    assert.deepEqual(s.required, ["images", "extracted"]);
    assert.deepEqual(s.properties.images.items.properties.loai.enum, ["leave", "khac"]);
    assert.deepEqual(s.properties.images.items.required, ["seq", "loai", "doTinCay"]);
    assert.deepEqual(s.properties.images.items.properties.doTinCay.enum, ["cao", "vua", "thap"]);
    assert.doesNotThrow(() => JSON.stringify(s));
});

test("each rule field becomes a value+confidence object with a nullable value, and the list items list every column", () => {
    const s = buildResultSchema(rules) as Obj;
    const leave = s.properties.extracted.properties.leave;
    assert.deepEqual(leave.required, ["ngayBaoCao", "nguoiBaoCao", "boPhan", "dong"]);
    assert.deepEqual(leave.properties.ngayBaoCao.properties.value, { type: ["string", "null"] });
    assert.deepEqual(leave.properties.ngayBaoCao.required, ["value", "doTinCay"]);
    const dong = leave.properties.dong.properties.value;
    assert.equal(dong.type, "array");
    assert.deepEqual(dong.items.required, ["hoTen", "tuGio", "tuThu", "tuNgay", "denGio", "denThu", "denNgay", "soNgay", "lyDo"]);
    assert.deepEqual(dong.items.properties.tuThu, { type: ["number", "null"] });
    assert.deepEqual(dong.items.properties.hoTen, { type: ["string", "null"] });
});

test("the prompt names every image path in order, the rule, and the field hints", () => {
    const m = manifestOf(2, { texts: [{ msgId: "t1", ts: 1, content: "Lịch\n nghỉ phép " }] });
    const dir = path.resolve("data/photo-reports/x");
    const p = buildPrompt(rules, m, dir);
    assert.ok(p.indexOf(path.join(dir, "01.jpg")) < p.indexOf(path.join(dir, "02.jpg")));
    for (const r of rules) assert.ok(p.includes(r.nhanRa), r.id);
    assert.ok(p.includes("Ngày ghi ở"));
    assert.ok(p.includes("KHÔNG đọc bảng chú giải"));
    assert.ok(p.includes("Lịch nghỉ phép"), "text is squeezed onto one line");
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
- Consumes: `NormalizedMessage` (có sẵn), `ManifestImage`, `ManifestText` (Task 1), `T0` (Task 3).
- Produces:
  - `interface BundleOptions { gapMinutes: number; settleMinutes: number; textWindowMinutes: number }` (`settleMinutes` có thể là số thập phân)
  - `interface BundleDraft { bundleId: string; day: string; groupId: string; groupName: string; sender: { id: string; name: string }; firstTs: number; lastTs: number; status: "open" | "closed"; texts: ManifestText[]; images: Array<Omit<ManifestImage, "file">> }`
  - `bundleIdOf(firstTs: number, firstMsgId: string): string` (`yyyyMMdd-HHmmss-<mã tin>` giờ Việt Nam)
  - `filterPhotoMessages(messages: NormalizedMessage[], groups: string[], senders: string[]): NormalizedMessage[]`
  - `groupPhotos(messages: NormalizedMessage[], opts: BundleOptions, now: number): BundleDraft[]`
  - `draftFromFiles(files: string[], label: string): BundleDraft`

- [ ] **Step 1: Viết test (đỏ)** `tests/photoBundling.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleIdOf, filterPhotoMessages, groupPhotos, type BundleOptions } from "../src/vision/bundling.js";
import type { NormalizedMessage } from "../src/types/index.js";
import { T0 } from "./helpers/visionFixtures.js";

const OPTS: BundleOptions = { gapMinutes: 3, settleMinutes: 5, textWindowMinutes: 10 };
const MIN = 60_000;
const photo = (msgId: string, ts: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
    msgId, groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u1", senderName: "An", isSelf: false, ts, msgType: "chat.photo", content: "", url: `images/g1/${msgId}.jpg`, ...extra,
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

test("a bundle stays open until it has been quiet for settleMinutes (fractions allowed)", () => {
    assert.equal(groupPhotos([photo("a", T0)], OPTS, T0 + 5 * MIN - 1)[0].status, "open");
    assert.equal(groupPhotos([photo("a", T0)], OPTS, T0 + 5 * MIN)[0].status, "closed");
    const quick = { ...OPTS, settleMinutes: 20 / 60 };
    assert.equal(groupPhotos([photo("a", T0)], quick, T0 + 19_000)[0].status, "open");
    assert.equal(groupPhotos([photo("a", T0)], quick, T0 + 20_000)[0].status, "closed");
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

test("filterPhotoMessages keeps only the named groups; the sender list limits photos but never texts", () => {
    const msgs = [
        photo("a", T0),
        photo("b", T0 + 1, { senderName: "Dung" }),
        text("t", T0 + 2, "chú thích", { senderName: "Dung" }),
        photo("x", T0 + 3, { groupName: "LC_Khac_BD" }),
    ];
    assert.deepEqual(filterPhotoMessages(msgs, ["bot test"], []).map((m) => m.msgId), ["a", "b", "t"]);
    assert.deepEqual(filterPhotoMessages(msgs, ["bot test"], ["Dung"]).map((m) => m.msgId), ["b", "t"]);
    assert.deepEqual(filterPhotoMessages(msgs, [], []), [], "no group named means nothing is read");
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
 * Gom ảnh của từng nhóm thành BỘ ẢNH (mỗi bộ là một lần gửi báo cáo). Hàm thuần: nhận tin, trả bản nháp; việc ghi thư mục ở `bundleStore.ts`.
 * Luật: hai ảnh liên tiếp của CÙNG người gửi cách nhau không quá `gapMinutes` thì cùng bộ (đúng cho album lẫn ảnh gửi rời); khác người
 * hoặc quá ngưỡng thì mở bộ mới; bộ `open` cho tới khi yên `settleMinutes` kể từ ảnh cuối.
 */
export interface BundleOptions {
    gapMinutes: number;
    /** Có thể là số thập phân (ảnh nghỉ phép dùng `settleSeconds / 60`). */
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

/**
 * Chỉ giữ tin của các nhóm trong `groups` (tên hiển thị). `senders` không rỗng thì chỉ ẢNH của các người gửi đó được giữ; tin chữ của
 * nhóm vẫn giữ để đính kèm làm tiêu đề. `groups` rỗng thì không đọc gì (không có nhóm nào được phép).
 */
export function filterPhotoMessages(messages: NormalizedMessage[], groups: string[], senders: string[]): NormalizedMessage[] {
    return messages.filter((m) => groups.includes(m.groupName) && (m.msgType !== "chat.photo" || senders.length === 0 || senders.includes(m.senderName)));
}

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
git commit -m "feat(vision): gom ảnh thành bộ theo người gửi và khoảng cách thời gian, lọc theo nhóm" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ghi thư mục bộ, `bundleFromMessages` và lệnh `photos:bundle`

**Files:**
- Create: `src/vision/bundleStore.ts`, `src/vision/bundleRun.ts`, `src/cli/photos-bundle.ts`, `tests/photoBundleStore.test.ts`
- Modify: `package.json` (thêm script `"photos:bundle": "tsx src/cli/photos-bundle.ts",` ngay sau dòng `"today": "tsx src/cli/today.ts",`)

**Interfaces:**
- Consumes: `BundleDraft`, `draftFromFiles`, `groupPhotos`, `filterPhotoMessages` (Task 4); `Manifest`; `writeFileAtomic` (`src/core/atomicWrite.ts`); `photoReportsDir`; `parseGroupName`.
- Produces:
  - `bundleDirOf(root: string, day: string, groupId: string, bundleId: string): string`
  - `readManifest(dir: string): Manifest | null`
  - `listBundleDirs(root: string, day?: string): string[]` (chỉ các thư mục có `manifest.json` ở dạng `<root>/<yyyy-MM-dd>/<nhóm>/<bộ>`)
  - `writeBundle(root: string, dataDir: string, draft: BundleDraft, school: SchoolArea): { dir: string; state: "new" | "updated" | "unchanged" | "skipped"; dropped: number }`
  - `interface BundleRunOptions { root: string; dataDir: string; bundle: { gapMinutes: number; textWindowMinutes: number }; settleSeconds: number; groups: string[]; senders: string[]; aliases: Record<string, string>; now: number; day?: string }`
  - `interface BundleRunResult { drafts: number; new: number; updated: number; unchanged: number; skipped: number; dropped: number; open: number; lines: string[] }`
  - `bundleFromMessages(messages: NormalizedMessage[], opts: BundleRunOptions): BundleRunResult`

- [ ] **Step 1: Viết test (đỏ)** `tests/photoBundleStore.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundleDirOf, listBundleDirs, readManifest, writeBundle } from "../src/vision/bundleStore.js";
import { bundleFromMessages } from "../src/vision/bundleRun.js";
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
const photo = (msgId: string, ts: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({ msgId, groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u1", senderName: "An", isSelf: false, ts, msgType: "chat.photo", content: "", url: `images/g1/${msgId}.jpg`, ...extra });
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
    w.addImage("m1");
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
    w.addImage("m1");
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

const runOpts = (w: ReturnType<typeof world>, now: number, over: Record<string, unknown> = {}) => ({
    root: w.root, dataDir: w.dataDir, bundle: { gapMinutes: 3, textWindowMinutes: 10 }, settleSeconds: 20, groups: ["bot test"], senders: [] as string[], aliases: { "bot test": "LC_HoaSen1_HM" }, now, ...over,
});

test("bundleFromMessages bundles only the named groups and closes a bundle after settleSeconds", () => {
    const w = world();
    ["m1", "x1"].forEach((id) => w.addImage(id));
    const msgs = [photo("m1", T0), photo("x1", T0 + 1, { groupId: "g9", groupName: "LC_Khac_BD", url: "images/g1/x1.jpg" })];
    const open = bundleFromMessages(msgs, runOpts(w, T0 + 10_000));
    assert.deepEqual([open.drafts, open.new, open.open], [1, 1, 1]);
    assert.equal(listBundleDirs(w.root).length, 1, "the other group is never bundled");
    const closed = bundleFromMessages(msgs, runOpts(w, T0 + 30_000));
    assert.deepEqual([closed.updated, closed.open], [1, 0]);
    assert.equal(readManifest(listBundleDirs(w.root)[0])!.status, "closed");
    assert.deepEqual(readManifest(listBundleDirs(w.root)[0])!.school, parseGroupName("LC_HoaSen1_HM"), "the test group is read as the real school it stands for");
});

test("bundleFromMessages honours --day and an empty group list", () => {
    const w = world();
    w.addImage("m1");
    const msgs = [photo("m1", T0)];
    assert.equal(bundleFromMessages(msgs, runOpts(w, T0 + 60_000, { day: "2026-10-08" })).drafts, 0);
    assert.equal(bundleFromMessages(msgs, runOpts(w, T0 + 60_000, { groups: [] })).drafts, 0);
    assert.equal(bundleFromMessages(msgs, runOpts(w, T0 + 60_000, { day: "2026-10-07" })).drafts, 1);
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
 *  - chỉ đổi trạng thái hoặc tin chữ: ghi lại manifest, không đụng ảnh.
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

- [ ] **Step 4: Viết `src/vision/bundleRun.ts`**

```ts
import { parseGroupName } from "../lesson/schoolArea.js";
import { writeBundle } from "./bundleStore.js";
import { filterPhotoMessages, groupPhotos } from "./bundling.js";
import type { NormalizedMessage } from "../types/index.js";

/** Gom và ghi các bộ ảnh nghỉ phép từ tin đã có: dùng chung cho lệnh `photos:bundle` và bước đọc ảnh trong runner (`photos:auto`). */
export interface BundleRunOptions {
    root: string;
    dataDir: string;
    bundle: { gapMinutes: number; textWindowMinutes: number };
    /** Bộ đóng sau khi yên bấy nhiêu giây kể từ ảnh cuối (`config.vision.leave.settleSeconds`). */
    settleSeconds: number;
    groups: string[];
    senders: string[];
    /** `config.groupAliases`: nhóm thử được đọc như một nhóm trường thật (trường, khu vực lấy từ tên nhóm thật). */
    aliases: Record<string, string>;
    now: number;
    day?: string;
}

export interface BundleRunResult {
    drafts: number;
    new: number;
    updated: number;
    unchanged: number;
    skipped: number;
    dropped: number;
    open: number;
    lines: string[];
}

export function bundleFromMessages(messages: NormalizedMessage[], opts: BundleRunOptions): BundleRunResult {
    const result: BundleRunResult = { drafts: 0, new: 0, updated: 0, unchanged: 0, skipped: 0, dropped: 0, open: 0, lines: [] };
    const filtered = filterPhotoMessages(messages, opts.groups, opts.senders);
    const drafts = groupPhotos(filtered, { ...opts.bundle, settleMinutes: opts.settleSeconds / 60 }, opts.now).filter((d) => !opts.day || d.day === opts.day);
    result.drafts = drafts.length;
    for (const draft of drafts) {
        const r = writeBundle(opts.root, opts.dataDir, draft, parseGroupName(opts.aliases[draft.groupName] ?? draft.groupName));
        result[r.state] += 1;
        result.dropped += r.dropped;
        if (draft.status === "open") result.open += 1;
        if (r.state !== "unchanged") result.lines.push(`${draft.groupName} ${draft.bundleId}: ${draft.images.length} ảnh, ${draft.status} (${r.state})`);
    }
    return result;
}
```

- [ ] **Step 5: Chạy test**

Run: `node --import tsx --test tests/photoBundleStore.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Viết lệnh `src/cli/photos-bundle.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { parseGroupName } from "../lesson/schoolArea.js";
import { MessageStore } from "../store/messageStore.js";
import { draftFromFiles } from "../vision/bundling.js";
import { writeBundle } from "../vision/bundleStore.js";
import { bundleFromMessages } from "../vision/bundleRun.js";
import type { NormalizedMessage } from "../types/index.js";

/**
 * Gom ảnh của các nhóm trong `config.vision.leave.groups` thành bộ và ghi `data/photo-reports/<ngày>/<nhóm>/<bộ>/manifest.json` cùng ảnh
 * đánh số (liên kết cứng). Không đọc ảnh, không đụng DB/Excel/kho tin; chạy lại an toàn (không tạo bộ trùng).
 *
 *   npm run photos:bundle -- [--day YYYY-MM-DD] [--from-dir <thư mục ảnh rời>]
 *
 * --from-dir  gom TOÀN BỘ ảnh trong thư mục thành MỘT bộ đã đóng (bộ ảnh mẫu, ảnh không nằm trong kho tin; không lọc theo nhóm).
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

async function main(): Promise<void> {
    const root = photoReportsDir(config.dataDir);
    const fromDir = option("--from-dir");

    if (fromDir) {
        const files = fs.readdirSync(fromDir).filter((f) => IMAGE_FILE.test(f)).map((f) => path.join(fromDir, f));
        if (files.length === 0) throw new Error(`Không có ảnh nào trong "${fromDir}".`);
        const label = path.basename(path.resolve(fromDir));
        const r = writeBundle(root, config.dataDir, draftFromFiles(files, label), parseGroupName(label));
        console.log(`[photos:bundle] ${files.length} ảnh -> ${r.dir} (${r.state})`);
        return;
    }

    if (config.vision.leave.groups.length === 0) {
        console.log("[photos:bundle] config.vision.leave.groups đang rỗng: không có nhóm nào được đọc ảnh.");
        return;
    }
    const store = new MessageStore();
    const messages: NormalizedMessage[] = [];
    for (const groupId of store.listThreads()) messages.push(...(await store.readThread(groupId)));
    const r = bundleFromMessages(messages, {
        root,
        dataDir: config.dataDir,
        bundle: config.vision.bundle,
        settleSeconds: config.vision.leave.settleSeconds,
        groups: config.vision.leave.groups,
        senders: config.vision.leave.senders,
        aliases: config.groupAliases,
        now: Date.now(),
        day: option("--day"),
    });
    for (const line of r.lines) console.log(`[photos:bundle] ${line}`);
    if (r.drafts === 0) console.log("[photos:bundle] không có ảnh nào để gom.");
    console.log(`[photos:bundle] mới ${r.new}, cập nhật ${r.updated}, không đổi ${r.unchanged}, bỏ qua ${r.skipped}, còn mở ${r.open}, ảnh gốc mất ${r.dropped} -> ${root}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
```

Thêm vào `package.json` (mục `scripts`, ngay sau dòng `"today": "tsx src/cli/today.ts",`): `"photos:bundle": "tsx src/cli/photos-bundle.ts",`.

- [ ] **Step 7: Kiểm tra kiểu và chạy thử không tốn token**

Run: `npm run typecheck` rồi `npx tsx src/cli/photos-bundle.ts --from-dir data/images/AI_reading_picture`
Expected: in `[photos:bundle] N ảnh -> ...data\photo-reports\2026-10-0X\mau\...\ (new)` (N là số file ảnh trong thư mục), và thư mục đó có `manifest.json`, `01.jpg`...

- [ ] **Step 8: Commit**

```bash
git add src/vision/bundleStore.ts src/vision/bundleRun.ts src/cli/photos-bundle.ts tests/photoBundleStore.test.ts package.json
git commit -m "feat(vision): ghi thư mục bộ ảnh, bundleFromMessages và lệnh photos:bundle" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
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
import { leaveRow, manifestOf, T0 } from "./helpers/visionFixtures.js";

const rules = loadRules();
const ok = (structured: unknown, extra: Record<string, unknown> = {}): ProcessOutcome => ({
    code: 0, stderr: "", timedOut: false,
    stdout: JSON.stringify({ type: "result", is_error: false, structured_output: structured, modelUsage: { "claude-haiku-4-5-20251001": {} }, ...extra }),
});
const field = (value: unknown, doTinCay = "cao") => ({ value, doTinCay });
const good = {
    images: [{ seq: 1, loai: "leave", doTinCay: "cao" }, { seq: 2, loai: "khac", doTinCay: "vua" }],
    extracted: { leave: { ngayBaoCao: field("2026-10-02"), nguoiBaoCao: field("Trần Thị Dung"), boPhan: field("Nhân sự"), dong: field([leaveRow()]) } },
};
const ctx = { manifest: manifestOf(2), rules, requestedModel: "haiku", readAt: T0 };

test("a good answer becomes a reading with the real model id and rule versions", () => {
    const r = parseClaudeOutput(ok(good).stdout, ctx);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.reading.reader.model, "claude-haiku-4-5-20251001");
    assert.deepEqual(r.reading.reader.ruleVersions, { leave: 1 });
    assert.equal(r.reading.reader.promptVersion, "1");
    assert.deepEqual(r.reading.images.map((i) => i.loai), ["leave", "khac"]);
    assert.deepEqual(r.reading.extracted.leave.boPhan, { value: "Nhân sự", doTinCay: "cao" });
    assert.equal((r.reading.extracted.leave.dong.value as unknown[]).length, 1);
    assert.equal(r.reading.bundleId, "20261007-074752-m1");
    assert.equal(r.reading.readAt, T0);
});

test("missing fields become null with low confidence, unknown classes become khac, extra keys are ignored", () => {
    const r = parseClaudeOutput(
        ok({ images: [{ seq: 1, loai: "la-hoai", doTinCay: "cao" }, { seq: 2, loai: "leave", doTinCay: "xyz" }], extracted: { leave: { ngayBaoCao: field("2026-10-02") }, la: {} } }).stdout,
        ctx,
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.reading.images[0].loai, "khac");
    assert.equal(r.reading.images[1].doTinCay, "thap");
    assert.deepEqual(r.reading.extracted.leave.boPhan, { value: null, doTinCay: "thap" });
    assert.equal(r.reading.extracted.la, undefined);
});

test("garbage, an error result, a missing structured_output and a skipped image are errors, never throws", () => {
    for (const out of ["", "không phải json", "[]"]) assert.equal(parseClaudeOutput(out, ctx).ok, false, out);
    const err = parseClaudeOutput(JSON.stringify({ is_error: true, result: "Not logged in" }), ctx);
    assert.ok(!err.ok && /Not logged in/.test(err.error));
    const none = parseClaudeOutput(JSON.stringify({ is_error: false, result: "xin chào" }), ctx);
    assert.ok(!none.ok && /structured_output/.test(none.error));
    const skipped = parseClaudeOutput(ok({ images: [{ seq: 1, loai: "leave", doTinCay: "cao" }], extracted: {} }).stdout, ctx);
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
Expected: PASS. (Ca "process không khởi động" trả `code: null` nên đi qua nhánh `code !== 0`; thông báo chứa `ENOENT`.)

- [ ] **Step 5: Commit**

```bash
git add src/vision/claudeReader.ts tests/claudeReader.test.ts
git commit -m "feat(vision): VisionReader bằng claude -p (một lần gọi cho cả bộ)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Hàm thuần của nghỉ phép: ngày, BUỔI, tên, danh sách

**Files:**
- Create: `src/leave/dates.ts`, `src/leave/buoi.ts`, `src/leave/names.ts`, `src/leave/roster.ts`, `tests/leaveDates.test.ts`, `tests/leaveBuoi.test.ts`, `tests/leaveNames.test.ts`, `tests/leaveRoster.test.ts`

**Interfaces:**
- Produces:
  - `dates.ts`: `interface Ymd { y: number; m: number; d: number }`, `parseIso(v: unknown): Ymd | null` (chỉ `YYYY-MM-DD` có thật), `isoOf(x: Ymd): string`, `dmyOf(x: Ymd): string` (`dd/MM/yyyy`), `dayNumber(x: Ymd): number`, `weekdayExcel(x: Ymd): number` (CN = 1 đến thứ bảy = 7), `compareYmd(a: Ymd, b: Ymd): number` (số ngày a trừ b), `countNonSundays(from: Ymd, to: Ymd): number` (gồm cả hai đầu), `parseHour(v: unknown): number | null` (`8:00`, `08:00`, `13:30`, `8h30` thành số thập phân).
  - `buoi.ts`: `interface LeavePeriod { tu: Ymd; tuGio: number; den: Ymd; denGio: number }`, `buoiNghi(p: LeavePeriod, noonHour?: number): string`, `ngayText(tu: Ymd, den: Ymd): string`.
  - `names.ts`: `normalizeName(s: string): string`, `levenshtein(a: string, b: string): number`, `suggestNames(name: string, roster: string[], max?: number): string[]`.
  - `roster.ts`: `interface RosterRow { row: number; name: string }`, `readRoster(templatePath: string, sheet: string): RosterRow[]`, `matchRoster(roster: RosterRow[], name: string): RosterRow[]`.

- [ ] **Step 1: Viết test ngày** `tests/leaveDates.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareYmd, countNonSundays, dayNumber, dmyOf, isoOf, parseHour, parseIso, weekdayExcel } from "../src/leave/dates.js";

const d = (s: string) => parseIso(s)!;

test("parseIso accepts only real YYYY-MM-DD dates", () => {
    assert.deepEqual(parseIso("2026-10-03"), { y: 2026, m: 10, d: 3 });
    assert.deepEqual(parseIso(" 2026-10-03 "), { y: 2026, m: 10, d: 3 });
    for (const bad of ["2026-02-30", "2026-13-01", "03/10/2026", "2026-1-3", "", null, undefined, 20261003]) assert.equal(parseIso(bad), null, String(bad));
    assert.ok(parseIso("2028-02-29"), "leap day");
    assert.equal(parseIso("2026-02-29"), null);
});

test("isoOf and dmyOf format a date", () => {
    assert.equal(isoOf(d("2026-10-03")), "2026-10-03");
    assert.equal(dmyOf(d("2026-10-03")), "03/10/2026");
    assert.equal(dmyOf(d("2026-01-09")), "09/01/2026");
});

test("weekdayExcel numbers Sunday 1 to Saturday 7, as Excel WEEKDAY does", () => {
    assert.equal(weekdayExcel(d("2026-10-03")), 7, "Saturday");
    assert.equal(weekdayExcel(d("2026-10-04")), 1, "Sunday");
    assert.equal(weekdayExcel(d("2026-10-05")), 2, "Monday");
    assert.equal(weekdayExcel(d("2026-10-07")), 4, "Wednesday");
});

test("compareYmd counts days, countNonSundays skips Sundays and includes both ends", () => {
    assert.equal(compareYmd(d("2026-10-05"), d("2026-10-03")), 2);
    assert.equal(compareYmd(d("2026-10-03"), d("2026-10-05")), -2);
    assert.equal(dayNumber(d("2026-10-04")) - dayNumber(d("2026-10-03")), 1);
    assert.equal(countNonSundays(d("2026-10-03"), d("2026-10-03")), 1);
    assert.equal(countNonSundays(d("2026-10-03"), d("2026-10-05")), 2, "Sat, Sun, Mon");
    assert.equal(countNonSundays(d("2026-10-05"), d("2026-10-06")), 2);
    assert.equal(countNonSundays(d("2026-10-04"), d("2026-10-04")), 0, "a lone Sunday");
    assert.equal(countNonSundays(d("2026-10-08"), d("2026-10-12")), 4, "Thu, Fri, Sat, (Sun), Mon");
    assert.equal(countNonSundays(d("2026-10-05"), d("2026-10-03")), 0, "reversed range");
});

test("parseHour reads 8:00, 08:00, 13:30 and 8h30; anything else is null", () => {
    assert.equal(parseHour("8:00"), 8);
    assert.equal(parseHour("08:00"), 8);
    assert.equal(parseHour("13:30"), 13.5);
    assert.equal(parseHour("8h30"), 8.5);
    assert.equal(parseHour(" 18:00 "), 18);
    assert.equal(parseHour("12"), 12);
    for (const bad of ["25:00", "8:75", "abc", "", null, undefined, 8]) assert.equal(parseHour(bad), null, String(bad));
});
```

- [ ] **Step 2: Viết test BUỔI** `tests/leaveBuoi.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";
import { parseIso } from "../src/leave/dates.js";
import { buoiNghi, ngayText } from "../src/leave/buoi.js";

const d = (s: string) => parseIso(s)!;
const buoi = (tu: string, tuGio: number, den: string, denGio: number): string => buoiNghi({ tu: d(tu), tuGio, den: d(den), denGio }, 12);

test("the table of the spec", () => {
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 18), "Cả ngày");
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 11.5), "Sáng");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-08", 18), "Chiều");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-10", 18), "Chiều - Cả ngày");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-10", 11.5), "Chiều - Sáng");
    assert.equal(buoi("2026-10-08", 8, "2026-10-10", 11.5), "Cả ngày - Sáng");
    assert.equal(buoi("2026-10-08", 8, "2026-10-10", 18), "Cả ngày");
});

test("the boundary at exactly 12:00", () => {
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 12), "Sáng", "ends at noon: morning only");
    assert.equal(buoi("2026-10-08", 12, "2026-10-08", 18), "Chiều", "starts at noon: afternoon only");
    assert.equal(buoi("2026-10-08", 8, "2026-10-08", 12.5), "Cả ngày");
    assert.equal(buoi("2026-10-08", 12, "2026-10-10", 18), "Chiều - Cả ngày");
    assert.equal(buoi("2026-10-08", 13.5, "2026-10-10", 12), "Chiều - Sáng");
});

test("the default noon is config.sessions.chieuFromHour", () => {
    const p = { tu: d("2026-10-08"), tuGio: 8, den: d("2026-10-08"), denGio: 18 };
    assert.equal(buoiNghi(p), buoiNghi(p, config.sessions.chieuFromHour));
});

test("ngayText: one day is dd/MM/yyyy, several days are 'from - to'", () => {
    assert.equal(ngayText(d("2026-10-08"), d("2026-10-08")), "08/10/2026");
    assert.equal(ngayText(d("2026-10-08"), d("2026-10-10")), "08/10/2026 - 10/10/2026");
});
```

- [ ] **Step 3: Viết test tên** `tests/leaveNames.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { levenshtein, normalizeName, suggestNames } from "../src/leave/names.js";

test("normalizeName drops accents, maps đ to d, lowercases and squeezes spaces and punctuation", () => {
    assert.equal(normalizeName("Đinh  Đình Chinh"), "dinh dinh chinh");
    assert.equal(normalizeName("  Huỳnh Hữu Đức "), "huynh huu duc");
    assert.equal(normalizeName("Nguyễn-Văn.A"), "nguyen van a");
    assert.equal(normalizeName("PHẠM YẾN NHƯ"), "pham yen nhu");
    assert.equal(normalizeName(""), "");
    assert.equal(normalizeName("Phạm Yến Như"), normalizeName("pham yen nhu"));
});

test("levenshtein counts single-character edits", () => {
    assert.equal(levenshtein("abc", "abc"), 0);
    assert.equal(levenshtein("abc", "abd"), 1);
    assert.equal(levenshtein("abc", "ab"), 1);
    assert.equal(levenshtein("", "abc"), 3);
});

const ROSTER = ["Huỳnh Hữu Đức", "Đinh Đình Chinh", "Phạm Yến Như", "Phạm Ngọc Minh"];

test("suggestNames offers same words in another order, a missing middle name, and one-letter slips; never the exact match", () => {
    assert.deepEqual(suggestNames("Chinh Đình Đinh", ROSTER), ["Đinh Đình Chinh"]);
    assert.deepEqual(suggestNames("Đinh Chinh", ROSTER), ["Đinh Đình Chinh"]);
    assert.deepEqual(suggestNames("Pham Yen Nho", ROSTER), ["Phạm Yến Như"]);
    assert.deepEqual(suggestNames("Phạm Yến Như", ROSTER), [], "an exact match is a match, not a suggestion");
    assert.deepEqual(suggestNames("Nguyễn Văn Zzz", ROSTER), []);
    assert.deepEqual(suggestNames("", ROSTER), []);
});

test("suggestNames returns at most max suggestions, best first, each name once", () => {
    const roster = ["An Binh", "An Binh", "An Bình X", "Ann Binh", "Anh Binh"];
    const got = suggestNames("An Binhh", roster, 2);
    assert.equal(got.length, 2);
    assert.equal(new Set(got).size, 2);
});
```

- [ ] **Step 4: Viết test danh sách** `tests/leaveRoster.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { matchRoster, readRoster } from "../src/leave/roster.js";
import { normalizeName } from "../src/leave/names.js";

function makeTemplate(): string {
    const aoa: unknown[][] = [
        ["TIN HỌC ĐẠI DƯƠNG"],
        ["Nhân viên báo cáo: X"],
        ["STT", "NHÂN VIÊN", "CHỨC VỤ"],
        [1, "Huỳnh Hữu Đức", "Kỹ thuật phòng kho"],
        [2, "Đinh Đình Chinh", "Phó phòng kỹ thuật"],
        ["TỔNG", 12],
        [],
        [null, "Dạ, em gửi Lịch nghỉ phép ạ!"],
        [3, "Đinh Đình Chinh", "Kỹ thuật điện lạnh"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "BAO CAO");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "roster-")), "mau.xlsx");
    XLSX.writeFile(wb, file);
    return file;
}

test("the roster is every row that has both a name (B) and a position (C), from row 4 down", () => {
    const roster = readRoster(makeTemplate(), "BAO CAO");
    assert.deepEqual(roster, [
        { row: 4, name: "Huỳnh Hữu Đức" },
        { row: 5, name: "Đinh Đình Chinh" },
        { row: 9, name: "Đinh Đình Chinh" },
    ]);
});

test("a missing sheet is a clear error", () => {
    assert.throws(() => readRoster(makeTemplate(), "KHAC"), /không có sheet "KHAC"/);
});

test("matchRoster matches ignoring accents, case and spacing, and returns every row of a person who has two", () => {
    const roster = readRoster(makeTemplate(), "BAO CAO");
    assert.deepEqual(matchRoster(roster, "dinh  dinh CHINH").map((r) => r.row), [5, 9]);
    assert.deepEqual(matchRoster(roster, "Huỳnh Hữu Đức").map((r) => r.row), [4]);
    assert.deepEqual(matchRoster(roster, "Người lạ"), []);
    assert.deepEqual(matchRoster(roster, "  "), []);
});

const REAL = path.join("data", "mau bao cao new", "LICH NGHI PHEP KY THUAT.xlsx");
test("the real template on this machine gives 14 rows and Đinh Đình Chinh on rows 6 and 27", { skip: !fs.existsSync(REAL) }, () => {
    const roster = readRoster(REAL, "BAO CAO");
    assert.equal(roster.length, 14);
    assert.deepEqual(roster.filter((r) => normalizeName(r.name) === "dinh dinh chinh").map((r) => r.row), [6, 27]);
    assert.ok(roster.every((r) => r.row !== 16 && r.row !== 29), "the TỔNG row and the greeting row are not people");
});
```

- [ ] **Step 5: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/leaveDates.test.ts tests/leaveBuoi.test.ts tests/leaveNames.test.ts tests/leaveRoster.test.ts`
Expected: FAIL (`Cannot find module '../src/leave/dates.js'`).

- [ ] **Step 6: Viết `src/leave/dates.ts`**

```ts
/**
 * Ngày và giờ cho báo cáo nghỉ phép. Mọi ngày là ngày dương lịch thuần (không múi giờ): dùng `Date.UTC` để không lệch ngày theo máy.
 */
export interface Ymd {
    y: number;
    m: number;
    d: number;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** `YYYY-MM-DD` có thật (không nhận 2026-02-30, không nhận dạng khác). */
export function parseIso(v: unknown): Ymd | null {
    if (typeof v !== "string") return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const ymd = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
    const t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    return t.getUTCFullYear() === ymd.y && t.getUTCMonth() === ymd.m - 1 && t.getUTCDate() === ymd.d ? ymd : null;
}

export const isoOf = (x: Ymd): string => `${x.y}-${pad(x.m)}-${pad(x.d)}`;
export const dmyOf = (x: Ymd): string => `${pad(x.d)}/${pad(x.m)}/${x.y}`;
export const dayNumber = (x: Ymd): number => Math.floor(Date.UTC(x.y, x.m - 1, x.d) / 86_400_000);

/** Chủ nhật = 1, thứ hai = 2, ..., thứ bảy = 7: đúng cách đánh số của Excel `WEEKDAY(ngày, 1)` và của cột THỨ trên ảnh. */
export const weekdayExcel = (x: Ymd): number => new Date(Date.UTC(x.y, x.m - 1, x.d)).getUTCDay() + 1;

/** Số ngày `a` trừ `b` (dương khi `a` sau `b`). */
export const compareYmd = (a: Ymd, b: Ymd): number => dayNumber(a) - dayNumber(b);

/** Số ngày từ `from` đến `to` (gồm cả hai đầu) không tính Chủ nhật: đúng công thức SỐ NGÀY của file mẫu. Khoảng ngược hoặc dài quá 400 ngày thì 0. */
export function countNonSundays(from: Ymd, to: Ymd): number {
    const a = dayNumber(from);
    const b = dayNumber(to);
    if (b < a || b - a > 400) return 0;
    let n = 0;
    for (let i = a; i <= b; i++) if (new Date(i * 86_400_000).getUTCDay() !== 0) n += 1;
    return n;
}

/** `8:00`, `08:00`, `13:30`, `8h30`, `12` thành số giờ thập phân (13:30 là 13,5). Dạng khác hoặc giờ không có thật thì null. */
export function parseHour(v: unknown): number | null {
    if (typeof v !== "string") return null;
    const m = /^\s*(\d{1,2})(?:\s*[:hH]\s*(\d{2}))?\s*$/.exec(v);
    if (!m) return null;
    const h = Number(m[1]);
    const min = m[2] === undefined ? 0 : Number(m[2]);
    if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
    return h + min / 60;
}
```

- [ ] **Step 7: Viết `src/leave/buoi.ts`**

```ts
import { config } from "../../config.js";
import { compareYmd, dmyOf, type Ymd } from "./dates.js";

export interface LeavePeriod {
    tu: Ymd;
    /** Giờ bắt đầu, số thập phân (13:30 là 13,5). */
    tuGio: number;
    den: Ymd;
    denGio: number;
}

/**
 * Cột BUỔI. Mốc là `noonHour` (mặc định `config.sessions.chieuFromHour`, 12:00).
 *  - cùng ngày: bắt đầu từ mốc trở đi là "Chiều"; bắt đầu trước mốc và kết thúc từ mốc trở xuống là "Sáng"; còn lại "Cả ngày";
 *  - nhiều ngày: ngày đầu "Cả ngày" nếu bắt đầu trước mốc, còn lại "Chiều"; ngày cuối "Cả ngày" nếu kết thúc sau mốc, còn lại "Sáng";
 *    ghi "<đầu> - <cuối>", riêng khi cả hai đều "Cả ngày" thì chỉ ghi "Cả ngày".
 */
export function buoiNghi(p: LeavePeriod, noonHour: number = config.sessions.chieuFromHour): string {
    if (compareYmd(p.den, p.tu) === 0) {
        if (p.tuGio >= noonHour) return "Chiều";
        return p.denGio <= noonHour ? "Sáng" : "Cả ngày";
    }
    const first = p.tuGio < noonHour ? "Cả ngày" : "Chiều";
    const last = p.denGio > noonHour ? "Cả ngày" : "Sáng";
    return first === "Cả ngày" && last === "Cả ngày" ? "Cả ngày" : `${first} - ${last}`;
}

/** Cột NGÀY (chữ): một ngày là `dd/MM/yyyy`, nhiều ngày là `dd/MM/yyyy - dd/MM/yyyy` (đúng dạng công thức SỐ NGÀY và K/C của file mẫu đọc được). */
export function ngayText(tu: Ymd, den: Ymd): string {
    return compareYmd(den, tu) === 0 ? dmyOf(tu) : `${dmyOf(tu)} - ${dmyOf(den)}`;
}
```

- [ ] **Step 8: Viết `src/leave/names.ts`**

```ts
/** Chuẩn hóa tên để so khớp: bỏ dấu, `đ` thành `d`, chữ thường, mọi ký tự khác chữ và số thành một khoảng trắng, cắt hai đầu. */
export function normalizeName(s: string): string {
    return s
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "d")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function levenshtein(a: string, b: string): number {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        let diag = prev[0];
        prev[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const up = prev[j];
            prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
            diag = up;
        }
    }
    return prev[b.length];
}

/**
 * Gợi ý tên trong danh sách cho một tên KHÔNG khớp: cùng các từ khác thứ tự, thiếu chữ đệm (các từ của tên ngắn nằm trong tên dài, từ hai từ
 * trở lên), hoặc cách nhau tối đa 2 ký tự sau khi chuẩn hóa. Không bao giờ gợi ý tên đã khớp đúng (đó là khớp, không phải gợi ý).
 * Tối đa `max` tên, tốt nhất trước, mỗi tên một lần.
 */
export function suggestNames(name: string, roster: string[], max = 3): string[] {
    const target = normalizeName(name);
    if (target === "") return [];
    const tt = target.split(" ");
    const scored: Array<{ name: string; score: number }> = [];
    for (const cand of new Set(roster)) {
        const c = normalizeName(cand);
        if (c === "" || c === target) continue;
        const ct = c.split(" ");
        const sameWords = tt.length === ct.length && [...tt].sort().join(" ") === [...ct].sort().join(" ");
        const [small, big] = tt.length <= ct.length ? [tt, ct] : [ct, tt];
        const subset = small.length >= 2 && small.every((w) => big.includes(w));
        const dist = levenshtein(target, c);
        if (sameWords) scored.push({ name: cand, score: 0 });
        else if (subset) scored.push({ name: cand, score: 1 });
        else if (dist <= 2) scored.push({ name: cand, score: 1 + dist });
    }
    return scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, max).map((s) => s.name);
}
```

- [ ] **Step 9: Viết `src/leave/roster.ts`**

```ts
import XLSX from "xlsx";
import { normalizeName } from "./names.js";

/** Một người trong cột NHÂN VIÊN của file mẫu: số dòng Excel (đếm từ 1) và tên. Một người có thể xuất hiện ở nhiều dòng (hai chức vụ). */
export interface RosterRow {
    row: number;
    name: string;
}

/** Dòng đầu tiên của danh sách trong mẫu LICH NGHI PHEP KY THUAT (dòng 1 đến 3 là tiêu đề). */
export const ROSTER_FIRST_ROW = 4;

/**
 * Danh sách tên đọc TRỰC TIẾP từ file mẫu mỗi lần dùng (sửa file mẫu là danh sách đổi theo, không sửa code): mọi dòng từ dòng 4 trở xuống có
 * chữ ở cột B (NHÂN VIÊN) VÀ chữ ở cột C (CHỨC VỤ). Dòng "TỔNG" (B là số) và dòng lời chào (không có chức vụ) vì thế không phải người.
 */
export function readRoster(templatePath: string, sheet: string): RosterRow[] {
    const wb = XLSX.readFile(templatePath);
    const ws = wb.Sheets[sheet];
    if (!ws || !ws["!ref"]) throw new Error(`${templatePath}: không có sheet "${sheet}".`);
    const last = XLSX.utils.decode_range(ws["!ref"]).e.r + 1;
    const text = (ref: string): string => {
        const v = ws[ref]?.v;
        return typeof v === "string" ? v.trim() : "";
    };
    const out: RosterRow[] = [];
    for (let r = ROSTER_FIRST_ROW; r <= last; r++) {
        const name = text(`B${r}`);
        if (name !== "" && text(`C${r}`) !== "") out.push({ row: r, name });
    }
    return out;
}

/** Mọi dòng của danh sách có tên khớp `name` sau khi chuẩn hóa (không dấu, không phân biệt hoa thường, gộp khoảng trắng). */
export function matchRoster(roster: RosterRow[], name: string): RosterRow[] {
    const key = normalizeName(name);
    return key === "" ? [] : roster.filter((r) => normalizeName(r.name) === key);
}
```

- [ ] **Step 10: Chạy test**

Run: `node --import tsx --test tests/leaveDates.test.ts tests/leaveBuoi.test.ts tests/leaveNames.test.ts tests/leaveRoster.test.ts` rồi `npm run typecheck`
Expected: PASS. (Test cuối của `leaveRoster` tự bỏ qua nếu máy không có file mẫu thật.)

- [ ] **Step 11: Commit**

```bash
git add src/leave/dates.ts src/leave/buoi.ts src/leave/names.ts src/leave/roster.ts tests/leaveDates.test.ts tests/leaveBuoi.test.ts tests/leaveNames.test.ts tests/leaveRoster.test.ts
git commit -m "feat(leave): ngày, BUỔI và NGÀY, chuẩn hóa và khớp tên, đọc danh sách từ file mẫu" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Kiểm tra từng dòng nghỉ phép và review theo dòng của một bộ

**Files:**
- Create: `src/vision/review.ts`, `src/leave/validate.ts`, `src/leave/review.ts`, `tests/visionCompare.test.ts`, `tests/leaveValidate.test.ts`, `tests/leaveReview.test.ts`

**Interfaces:**
- Consumes: `BundleReading`, `PhotoRule`, `Manifest`, `Review`, `RowReview`, `ReviewStatus`, `Disagreement` (Task 1); `parseIso`, `parseHour`, `weekdayExcel`, `countNonSundays`, `compareYmd`, `dmyOf`, `isoOf`, `Ymd` (Task 7); fixtures (Task 3).
- Produces:
  - `src/vision/review.ts`: `norm(v: unknown): unknown`, `flattenReading(reading: BundleReading): Map<string, unknown>` (khoá `anh[<seq>].loai`, `<luật>.<trường>`, `<luật>.<trường>.length`, `<luật>.<trường>[i].<cột>`), `needsSecondRead(rules: PhotoRule[], reading: BundleReading): boolean`, `compareReadings(first: BundleReading, second: BundleReading): Disagreement[]`.
  - `src/leave/validate.ts`: `interface ParsedLeave { hoTen: string; tu: Ymd; den: Ymd; tuGio: number; denGio: number; soNgay: number | null; lyDo: string | null }`, `interface RowVerdict { ok: boolean; hard: string[]; warnings: string[]; parsed: ParsedLeave | null }`, `interface ValidateCtx { sendDay: string; maxPastDays: number; maxFutureDays: number }`, `validateLeaveRow(raw: Record<string, unknown>, ctx: ValidateCtx): RowVerdict`.
  - `src/leave/review.ts`: `LEAVE_RULE_ID = "leave"`, `LEAVE_COLUMNS`, `leaveRowsOf(reading: BundleReading): Array<Record<string, unknown>>`, `bundleStatus(rows: RowReview[], reasons: string[], dismissed?: boolean): ReviewStatus`, `interface ReviewLeaveInput { rules: PhotoRule[]; manifest: Manifest; first: BundleReading; second: { ok: true; reading: BundleReading } | { ok: false; error: string } | null; cfg: { maxPastDays: number; maxFutureDays: number } }`, `reviewLeave(input: ReviewLeaveInput): Review`.

- [ ] **Step 1: Viết test hàm chung** `tests/visionCompare.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareReadings, flattenReading, needsSecondRead } from "../src/vision/review.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveReadingOf, leaveRow, readingOf } from "./helpers/visionFixtures.js";

const rules = loadRules();

test("flattenReading flattens images, scalars and list cells", () => {
    const f = flattenReading(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })]));
    assert.equal(f.get("anh[1].loai"), "leave");
    assert.equal(f.get("leave.ngayBaoCao"), "2026-10-02");
    assert.equal(f.get("leave.dong.length"), 2);
    assert.equal(f.get("leave.dong[1].hoTen"), "B");
    assert.equal(f.get("leave.dong[0].soNgay"), 1);
});

test("needsSecondRead follows docLanHai: low confidence only for leave, never for an all-khac bundle", () => {
    assert.equal(needsSecondRead(rules, leaveReadingOf([leaveRow()], "cao")), false);
    assert.equal(needsSecondRead(rules, leaveReadingOf([leaveRow()], "vua")), false);
    assert.equal(needsSecondRead(rules, leaveReadingOf([leaveRow()], "thap")), true);
    assert.equal(needsSecondRead(rules, readingOf(["khac", "khac"])), false);
    const always = rules.map((r) => ({ ...r, docLanHai: "luon" as const }));
    assert.equal(needsSecondRead(always, leaveReadingOf([leaveRow()], "cao")), true);
    const never = rules.map((r) => ({ ...r, docLanHai: "khong" as const }));
    assert.equal(needsSecondRead(never, leaveReadingOf([leaveRow()], "thap")), false);
});

test("compareReadings finds a differing cell and ignores case and spacing of text", () => {
    assert.deepEqual(compareReadings(leaveReadingOf([leaveRow()]), leaveReadingOf([leaveRow()])), []);
    const diff = compareReadings(leaveReadingOf([leaveRow()]), leaveReadingOf([leaveRow({ soNgay: 2 })]));
    assert.deepEqual(diff, [{ path: "leave.dong[0].soNgay", first: 1, second: 2 }]);
    assert.deepEqual(compareReadings(leaveReadingOf([leaveRow({ hoTen: "Nguyễn  Quốc Pháp " })]), leaveReadingOf([leaveRow({ hoTen: "nguyễn quốc pháp" })])), []);
});

test("compareReadings reports a class change and a list length change", () => {
    assert.deepEqual(compareReadings(readingOf(["leave"]), readingOf(["khac"])).map((d) => d.path), ["anh[1].loai"]);
    const grown = compareReadings(leaveReadingOf([leaveRow()]), leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })])).map((d) => d.path);
    assert.ok(grown.includes("leave.dong.length"));
    assert.ok(grown.includes("leave.dong[1].hoTen"));
});
```

- [ ] **Step 2: Viết test kiểm tra dòng** `tests/leaveValidate.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLeaveRow } from "../src/leave/validate.js";
import { leaveRow } from "./helpers/visionFixtures.js";

const ctx = { sendDay: "2026-10-07", maxPastDays: 7, maxFutureDays: 120 };

test("the three rows of the sample photo: the first and the third are clean, the second only warns about its THỨ", () => {
    const phap = validateLeaveRow(leaveRow(), ctx);
    assert.equal(phap.ok, true);
    assert.deepEqual(phap.warnings, []);
    assert.equal(phap.parsed!.hoTen, "Nguyễn Quốc Pháp");
    assert.equal(phap.parsed!.soNgay, 1);

    // Ảnh mẫu ghi THỨ bắt đầu = 2 cho 03/10/2026 (thực tế là thứ bảy = 7); THỨ kết thúc và SỐ NGÀY đều đúng.
    const loc = validateLeaveRow(leaveRow({ hoTen: "Trần Nguyên Lộc", tuThu: 2, denThu: 2, denNgay: "2026-10-05", soNgay: 2 }), ctx);
    assert.equal(loc.ok, true, "one failed cross-check is only a warning");
    assert.equal(loc.warnings.length, 1);
    assert.match(loc.warnings[0], /THỨ bắt đầu ghi 2/);

    const huy = validateLeaveRow(leaveRow({ hoTen: "Hồ Đình Huy", tuThu: 2, tuNgay: "2026-10-05", denThu: 3, denNgay: "2026-10-06", soNgay: 2 }), ctx);
    assert.equal(huy.ok, true);
    assert.deepEqual(huy.warnings, []);
});

test("two failed cross-checks make the row a hard failure, and the parsed leave is still available", () => {
    const v = validateLeaveRow(leaveRow({ tuNgay: "2026-10-03", denNgay: "2026-10-05", denThu: 5, soNgay: 3 }), ctx);
    assert.equal(v.ok, false);
    assert.match(v.hard.join(" "), /lệch 2 phép/);
    assert.ok(v.parsed, "a human who confirms the row still gets its dates");
});

test("a missing THỨ or SỐ NGÀY is not judged", () => {
    const v = validateLeaveRow(leaveRow({ tuThu: null, denThu: null, soNgay: null }), ctx);
    assert.equal(v.ok, true);
    assert.deepEqual(v.warnings, []);
    assert.equal(v.parsed!.soNgay, null);
});

test("basic fields: a name, readable dates and hours are required", () => {
    assert.match(validateLeaveRow(leaveRow({ hoTen: "  " }), ctx).hard.join(" "), /thiếu họ tên/);
    assert.match(validateLeaveRow(leaveRow({ tuNgay: "2026-02-30" }), ctx).hard.join(" "), /ngày bắt đầu không đọc được/);
    assert.match(validateLeaveRow(leaveRow({ denNgay: null }), ctx).hard.join(" "), /ngày kết thúc không đọc được/);
    assert.match(validateLeaveRow(leaveRow({ tuGio: "abc" }), ctx).hard.join(" "), /giờ bắt đầu không đọc được/);
    assert.match(validateLeaveRow(leaveRow({ denGio: null }), ctx).hard.join(" "), /giờ kết thúc không đọc được/);
    assert.equal(validateLeaveRow(leaveRow({ tuNgay: "2026-02-30" }), ctx).parsed, null);
});

test("the end cannot be before the start, and the same day needs the end hour after the start hour", () => {
    assert.match(validateLeaveRow(leaveRow({ tuNgay: "2026-10-05", denNgay: "2026-10-03", tuThu: 2, denThu: 7, soNgay: 1 }), ctx).hard.join(" "), /trước ngày bắt đầu/);
    assert.match(validateLeaveRow(leaveRow({ tuGio: "13:00", denGio: "08:00" }), ctx).hard.join(" "), /giờ kết thúc không sau giờ bắt đầu/);
    assert.match(validateLeaveRow(leaveRow({ tuGio: "8:00", denGio: "8:00" }), ctx).hard.join(" "), /giờ kết thúc không sau giờ bắt đầu/);
});

test("the start date must be plausible against the send day", () => {
    const past = validateLeaveRow(leaveRow({ tuNgay: "2026-09-20", denNgay: "2026-09-20", tuThu: 1, denThu: 1, soNgay: 0 }), ctx);
    assert.match(past.hard.join(" "), /sớm hơn ngày gửi ảnh quá 7 ngày/);
    const future = validateLeaveRow(leaveRow({ tuNgay: "2027-03-01", denNgay: "2027-03-01", tuThu: 2, denThu: 2, soNgay: 1 }), ctx);
    assert.match(future.hard.join(" "), /muộn hơn ngày gửi ảnh quá 120 ngày/);
    const edge = validateLeaveRow(leaveRow({ tuNgay: "2026-09-30", denNgay: "2026-09-30", tuThu: 4, denThu: 4, soNgay: 1 }), ctx);
    assert.equal(edge.ok, true, "exactly 7 days before is still fine");
});

test("the name is cleaned of extra spaces in the parsed leave", () => {
    assert.equal(validateLeaveRow(leaveRow({ hoTen: "  Nguyễn   Quốc  Pháp " }), ctx).parsed!.hoTen, "Nguyễn Quốc Pháp");
});
```

Kiểm tra số liệu của test: 2026-09-30 là thứ tư (Wed) → weekdayExcel = 4 ✓ (10-07 Wed → 09-30 Wed). `tuNgay 2026-09-20` là Chủ nhật → tuThu 1 ✓, soNgay countNonSundays(09-20, 09-20) = 0 ✓ nên không lệch phép nào; chỉ còn lý do "sớm hơn". `2027-03-01` là thứ hai (Mon): 2027-01-01 là thứ sáu; tháng 3/1: ngày thứ 60 của năm → (60-1) mod 7 = 3 → Fri+3 = Mon ✓ → thứ 2 ✓, soNgay 1 ✓. Cặp `tuNgay 2026-10-05 / denNgay 2026-10-03` (ngược) bỏ qua phép chéo vì den < tu.

- [ ] **Step 3: Viết test review một bộ** `tests/leaveReview.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleStatus, leaveRowsOf, reviewLeave } from "../src/leave/review.js";
import { loadRules } from "../src/vision/rules.js";
import type { BundleReading, RowReview } from "../src/types/index.js";
import { leaveReadingOf, leaveRow, manifestOf, readingOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
type Second = Parameters<typeof reviewLeave>[0]["second"];
const run = (first: BundleReading, second: Second = null) => reviewLeave({ rules, manifest: manifestOf(first.images.length), first, second, cfg });
const loc = () => leaveRow({ hoTen: "Trần Nguyên Lộc", tuThu: 2, denThu: 2, denNgay: "2026-10-05", soNgay: 2 });

test("leaveRowsOf returns the object rows of the list, in order", () => {
    assert.deepEqual(leaveRowsOf(leaveReadingOf([leaveRow(), "rác", leaveRow({ hoTen: "B" })])).map((r) => r.hoTen), ["Nguyễn Quốc Pháp", "B"]);
    assert.deepEqual(leaveRowsOf(readingOf(["khac"])), []);
});

test("a clean bundle is tu_dong_dat; a row with one failed cross-check keeps its warning but is still tu_dong_dat", () => {
    const r = run(leaveReadingOf([leaveRow(), loc()]));
    assert.equal(r.status, "tu_dong_dat");
    assert.deepEqual(r.reasons, []);
    assert.deepEqual(r.rows.map((x) => [x.index, x.status]), [[0, "tu_dong_dat"], [1, "tu_dong_dat"]]);
    assert.equal(r.rows[1].warnings.length, 1);
    assert.equal(r.secondRead.ran, false);
});

test("one unreadable row is can_xem and the others stay tu_dong_dat", () => {
    const r = run(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B", tuNgay: "2026-02-30" })]));
    assert.equal(r.status, "can_xem");
    assert.equal(r.rows[0].status, "tu_dong_dat");
    assert.equal(r.rows[1].status, "can_xem");
    assert.match(r.rows[1].reasons.join(" "), /ngày bắt đầu không đọc được/);
});

test("low confidence on the photo or the list sends every row to review", () => {
    const r = run(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })], "thap"));
    assert.equal(r.status, "can_xem");
    assert.ok(r.rows.every((x) => x.status === "can_xem"));
    assert.match(r.reasons.join(" "), /độ tin cậy/);
});

test("the wrong number of leave photos is a bundle-level reason", () => {
    const r = run(leaveReadingOf([leaveRow()], "cao", 6));
    assert.match(r.reasons.join(" "), /6 ảnh nghỉ phép, cần từ 1 đến 5/);
    assert.equal(r.rows[0].status, "can_xem");
});

test("a bundle with no leave photo has nothing to review; a leave photo with no readable row is can_xem", () => {
    const none = run(readingOf(["khac", "khac"]));
    assert.deepEqual([none.status, none.rows.length, none.reasons.length], ["tu_dong_dat", 0, 0]);
    const empty = run(leaveReadingOf([]));
    assert.equal(empty.status, "can_xem");
    assert.match(empty.reasons.join(" "), /không đọc được dòng nghỉ phép nào/);
});

test("a second read that agrees keeps tu_dong_dat; one that differs sends only that row to review", () => {
    const rows = [leaveRow(), leaveRow({ hoTen: "B" })];
    const same = run(leaveReadingOf(rows), { ok: true, reading: leaveReadingOf(rows) });
    assert.equal(same.status, "tu_dong_dat");
    assert.equal(same.secondRead.ran, true);
    const differs = run(leaveReadingOf(rows), { ok: true, reading: leaveReadingOf([rows[0], leaveRow({ hoTen: "B", soNgay: 2 })]) });
    assert.equal(differs.status, "can_xem");
    assert.equal(differs.rows[0].status, "tu_dong_dat");
    assert.equal(differs.rows[1].status, "can_xem");
    assert.match(differs.rows[1].reasons.join(" "), /leave\.dong\[1\]\.soNgay/);
    assert.equal(differs.secondRead.disagree.length, 1);
});

test("a second read with a different number of rows, a different image class, or an error sends everything to review", () => {
    const first = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B" })]);
    const fewer = run(first, { ok: true, reading: leaveReadingOf([leaveRow()]) });
    assert.ok(fewer.rows.every((x) => x.status === "can_xem"));
    assert.match(fewer.reasons.join(" "), /số dòng/);
    const other = run(first, { ok: true, reading: readingOf(["khac"], {}) });
    assert.ok(other.rows.every((x) => x.status === "can_xem"));
    assert.match(other.reasons.join(" "), /phân loại/);
    const failed = run(first, { ok: false, error: "hết hạn mức" });
    assert.ok(failed.rows.every((x) => x.status === "can_xem"));
    assert.match(failed.reasons.join(" "), /đọc lần hai lỗi: hết hạn mức/);
});

test("the report date on the photo far from the send day is only a note", () => {
    const first = leaveReadingOf([leaveRow()]);
    first.extracted.leave.ngayBaoCao = { value: "2026-09-01", doTinCay: "cao" };
    const r = run(first);
    assert.equal(r.status, "tu_dong_dat");
    assert.match(r.notes.join(" "), /ngày báo cáo trên ảnh/);
});

test("bundleStatus is the worst row, dismissed wins, and an empty bundle follows its reasons", () => {
    const row = (status: RowReview["status"]): RowReview => ({ index: 0, status, reasons: [], warnings: [], human: null });
    assert.equal(bundleStatus([row("tu_dong_dat"), row("can_xem")], []), "can_xem");
    assert.equal(bundleStatus([row("tu_dong_dat"), row("da_sua")], []), "da_sua");
    assert.equal(bundleStatus([row("da_xac_nhan"), row("tu_dong_dat")], []), "da_xac_nhan");
    assert.equal(bundleStatus([row("da_bo"), row("da_bo")], []), "da_bo");
    assert.equal(bundleStatus([row("tu_dong_dat")], []), "tu_dong_dat");
    assert.equal(bundleStatus([], ["x"]), "can_xem");
    assert.equal(bundleStatus([], []), "tu_dong_dat");
    assert.equal(bundleStatus([row("can_xem")], [], true), "da_bo");
});
```

- [ ] **Step 4: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/visionCompare.test.ts tests/leaveValidate.test.ts tests/leaveReview.test.ts`
Expected: FAIL (`Cannot find module '../src/vision/review.js'`).

- [ ] **Step 5: Viết `src/vision/review.ts`**

```ts
import type { BundleReading, Disagreement, PhotoRule } from "../types/index.js";

/**
 * Hàm chung của review: làm phẳng kết quả đọc thành khoá `đường.dẫn`, so hai lần đọc độc lập, và biết khi nào cần đọc lần hai. Hàm thuần.
 * Khoá phẳng: `anh[<seq>].loai`, `<luật>.<trường>`, `<luật>.<trường>.length` (danh sách), `<luật>.<trường>[i].<cột>`.
 */
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

export function flattenReading(reading: BundleReading): Map<string, unknown> {
    const out = new Map<string, unknown>();
    for (const img of reading.images) out.set(`anh[${img.seq}].loai`, img.loai);
    for (const [rule, fields] of Object.entries(reading.extracted)) for (const [field, fr] of Object.entries(fields)) flatValue(`${rule}.${field}`, fr.value, out);
    return out;
}

/** Có cần lần đọc thứ hai không: luật đặt `luon`, hoặc `khi_tin_cay_thap` mà ảnh/trường của loại đó có độ tin cậy `thap`. Bộ không có ảnh loại nào của luật thì không. */
export function needsSecondRead(rules: PhotoRule[], reading: BundleReading): boolean {
    for (const rule of rules) {
        if (!reading.images.some((i) => i.loai === rule.id)) continue;
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
```

- [ ] **Step 6: Viết `src/leave/validate.ts`**

```ts
import { compareYmd, countNonSundays, dmyOf, parseHour, parseIso, weekdayExcel, type Ymd } from "./dates.js";

/** Một dòng nghỉ phép đã đọc xong thành giá trị dùng được. `soNgay` và `lyDo` có thể thiếu. */
export interface ParsedLeave {
    hoTen: string;
    tu: Ymd;
    den: Ymd;
    /** Giờ bắt đầu và kết thúc, số thập phân (13:30 là 13,5). */
    tuGio: number;
    denGio: number;
    soNgay: number | null;
    lyDo: string | null;
}

export interface RowVerdict {
    /** Không có luật cứng nào trượt. */
    ok: boolean;
    /** Luật cứng trượt: dòng này `can_xem`. */
    hard: string[];
    /** Cảnh báo không chặn. */
    warnings: string[];
    /** Có khi đọc được tên, ngày, giờ và ngày kết thúc không trước ngày bắt đầu, kể cả khi luật cứng khác trượt (để người đã xác nhận dòng vẫn dùng được). */
    parsed: ParsedLeave | null;
}

export interface ValidateCtx {
    /** Ngày gửi ảnh, `YYYY-MM-DD` giờ Việt Nam. */
    sendDay: string;
    maxPastDays: number;
    maxFutureDays: number;
}

/**
 * Review lớp 1 của MỘT dòng nghỉ phép (không tốn token).
 * Luật cứng: có họ tên; ngày và giờ đọc được; ngày kết thúc không trước ngày bắt đầu (cùng ngày thì giờ kết thúc sau giờ bắt đầu); ngày bắt đầu không
 * sớm hơn ngày gửi quá `maxPastDays` hay muộn hơn quá `maxFutureDays` ngày; và KIỂM CHỨNG CHÉO: THỨ bắt đầu, THỨ kết thúc, SỐ NGÀY (không tính Chủ nhật)
 * phải khớp với ngày; lệch từ hai phép trở lên là luật cứng (nhiều khả năng đọc sai ngày). Lệch đúng một phép chỉ là cảnh báo, vì thường là lỗi gõ của người
 * lập bảng. Ô THỨ hoặc SỐ NGÀY để trống thì phép đó không được xét.
 */
export function validateLeaveRow(raw: Record<string, unknown>, ctx: ValidateCtx): RowVerdict {
    const hard: string[] = [];
    const warnings: string[] = [];
    const hoTen = typeof raw.hoTen === "string" ? raw.hoTen.trim().replace(/\s+/g, " ") : "";
    if (hoTen === "") hard.push("thiếu họ tên");
    const tu = parseIso(raw.tuNgay);
    const den = parseIso(raw.denNgay);
    const tuGio = parseHour(raw.tuGio);
    const denGio = parseHour(raw.denGio);
    if (!tu) hard.push(`ngày bắt đầu không đọc được: ${JSON.stringify(raw.tuNgay ?? null)}`);
    if (!den) hard.push(`ngày kết thúc không đọc được: ${JSON.stringify(raw.denNgay ?? null)}`);
    if (tuGio === null) hard.push(`giờ bắt đầu không đọc được: ${JSON.stringify(raw.tuGio ?? null)}`);
    if (denGio === null) hard.push(`giờ kết thúc không đọc được: ${JSON.stringify(raw.denGio ?? null)}`);

    let ordered = false;
    if (tu && den) {
        const span = compareYmd(den, tu);
        if (span < 0) hard.push("ngày kết thúc trước ngày bắt đầu");
        else {
            ordered = true;
            if (span === 0 && tuGio !== null && denGio !== null && denGio <= tuGio) hard.push("cùng ngày nhưng giờ kết thúc không sau giờ bắt đầu");
        }
    }

    const send = parseIso(ctx.sendDay);
    if (tu && send) {
        const off = compareYmd(tu, send);
        if (off < -ctx.maxPastDays) hard.push(`ngày bắt đầu ${dmyOf(tu)} sớm hơn ngày gửi ảnh quá ${ctx.maxPastDays} ngày`);
        if (off > ctx.maxFutureDays) hard.push(`ngày bắt đầu ${dmyOf(tu)} muộn hơn ngày gửi ảnh quá ${ctx.maxFutureDays} ngày`);
    }

    if (tu && den && ordered) {
        const fails: string[] = [];
        if (typeof raw.tuThu === "number" && raw.tuThu !== weekdayExcel(tu)) fails.push(`THỨ bắt đầu ghi ${raw.tuThu}, ngày ${dmyOf(tu)} là thứ ${weekdayExcel(tu)}`);
        if (typeof raw.denThu === "number" && raw.denThu !== weekdayExcel(den)) fails.push(`THỨ kết thúc ghi ${raw.denThu}, ngày ${dmyOf(den)} là thứ ${weekdayExcel(den)}`);
        const n = countNonSundays(tu, den);
        if (typeof raw.soNgay === "number" && raw.soNgay !== n) fails.push(`SỐ NGÀY ghi ${raw.soNgay}, tính ra ${n} (không tính Chủ nhật)`);
        if (fails.length >= 2) hard.push(`lệch ${fails.length} phép kiểm chứng chéo: ${fails.join("; ")}`);
        else warnings.push(...fails);
    }

    const parsed: ParsedLeave | null =
        hoTen !== "" && tu && den && tuGio !== null && denGio !== null && ordered
            ? {
                  hoTen,
                  tu,
                  den,
                  tuGio,
                  denGio,
                  soNgay: typeof raw.soNgay === "number" ? raw.soNgay : null,
                  lyDo: typeof raw.lyDo === "string" && raw.lyDo.trim() !== "" ? raw.lyDo.trim() : null,
              }
            : null;
    return { ok: hard.length === 0, hard, warnings, parsed };
}
```

- [ ] **Step 7: Viết `src/leave/review.ts`**

```ts
import { vietnamDay } from "../lesson/time.js";
import { compareReadings } from "../vision/review.js";
import { compareYmd, isoOf, parseIso } from "./dates.js";
import { validateLeaveRow } from "./validate.js";
import type { BundleReading, Confidence, Disagreement, Manifest, PhotoRule, Review, ReviewStatus, RowReview } from "../types/index.js";

export const LEAVE_RULE_ID = "leave";
/** Các cột của một dòng nghỉ phép (trùng `photo-rules/leave.json`); người xem chỉ được sửa các cột này. */
export const LEAVE_COLUMNS = ["hoTen", "tuGio", "tuThu", "tuNgay", "denGio", "denThu", "denNgay", "soNgay", "lyDo"] as const;

const RANK: Record<Confidence, number> = { thap: 0, vua: 1, cao: 2 };

/** Các dòng (đối tượng) của danh sách `dong` trong kết quả đọc, giữ thứ tự; phần tử không phải đối tượng bị bỏ. Chỉ số ở đây là `RowReview.index`. */
export function leaveRowsOf(reading: BundleReading): Array<Record<string, unknown>> {
    const v = reading.extracted[LEAVE_RULE_ID]?.dong?.value;
    return Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null && !Array.isArray(r)) : [];
}

/**
 * Trạng thái của cả bộ = trạng thái xấu nhất của các dòng: còn dòng `can_xem` thì `can_xem`; bỏ cả bộ hoặc mọi dòng thì `da_bo`; có người sửa thì
 * `da_sua`; có người xác nhận thì `da_xac_nhan`; còn lại `tu_dong_dat`. Bộ không có dòng nào thì theo lý do cấp bộ.
 */
export function bundleStatus(rows: RowReview[], reasons: string[], dismissed = false): ReviewStatus {
    if (dismissed) return "da_bo";
    if (rows.length === 0) return reasons.length > 0 ? "can_xem" : "tu_dong_dat";
    if (rows.some((r) => r.status === "can_xem")) return "can_xem";
    if (rows.every((r) => r.status === "da_bo")) return "da_bo";
    if (rows.some((r) => r.status === "da_sua")) return "da_sua";
    if (rows.some((r) => r.status === "da_xac_nhan")) return "da_xac_nhan";
    return "tu_dong_dat";
}

export interface ReviewLeaveInput {
    rules: PhotoRule[];
    manifest: Manifest;
    first: BundleReading;
    /** `null` khi không đọc lần hai; `{ ok: false }` khi lần hai lỗi. */
    second: { ok: true; reading: BundleReading } | { ok: false; error: string } | null;
    cfg: { maxPastDays: number; maxFutureDays: number };
}

/**
 * Review của MỘT bộ ảnh nghỉ phép, theo từng dòng. Bộ không có ảnh nào loại `leave` thì không có gì để xem (`tu_dong_dat`, không dòng).
 * Lý do CẤP BỘ (số ảnh sai, độ tin cậy dưới ngưỡng, không đọc được dòng nào, hai lần đọc lệch số dòng hoặc phân loại ảnh, đọc lần hai lỗi) làm MỌI dòng
 * `can_xem`. Lý do của riêng một dòng: luật cứng của `validateLeaveRow` và các ô mà hai lần đọc lệch nhau ở đúng dòng đó.
 */
export function reviewLeave(input: ReviewLeaveInput): Review {
    const { rules, manifest, first, second, cfg } = input;
    const rule = rules.find((r) => r.id === LEAVE_RULE_ID);
    const secondRead = { ran: second !== null, disagree: [] as Disagreement[] };
    const leaveImages = first.images.filter((i) => i.loai === LEAVE_RULE_ID);
    if (!rule || leaveImages.length === 0) return { status: "tu_dong_dat", reasons: [], notes: [], rows: [], secondRead };

    const reasons: string[] = [];
    const notes: string[] = [];
    const { toiThieu, toiDa } = rule.soLuongMoiBo;
    if (leaveImages.length < toiThieu || leaveImages.length > toiDa) reasons.push(`${leaveImages.length} ảnh nghỉ phép, cần từ ${toiThieu} đến ${toiDa}`);
    const need = RANK[rule.nguongTinCay];
    const lowImages = leaveImages.filter((i) => RANK[i.doTinCay] < need).map((i) => `ảnh ${i.seq}`);
    if (lowImages.length > 0) reasons.push(`độ tin cậy ảnh dưới ngưỡng "${rule.nguongTinCay}": ${lowImages.join(", ")}`);
    const list = first.extracted[LEAVE_RULE_ID]?.dong;
    if (list && RANK[list.doTinCay] < need) reasons.push(`độ tin cậy của danh sách dòng nghỉ dưới ngưỡng "${rule.nguongTinCay}"`);
    const rows = leaveRowsOf(first);
    if (rows.length === 0) reasons.push("không đọc được dòng nghỉ phép nào");

    if (second) {
        if (second.ok) {
            secondRead.disagree = compareReadings(first, second.reading);
            if (secondRead.disagree.some((d) => d.path === "leave.dong.length")) reasons.push("hai lần đọc ra số dòng nghỉ phép khác nhau");
            if (secondRead.disagree.some((d) => d.path.startsWith("anh["))) reasons.push("hai lần đọc phân loại ảnh khác nhau");
            for (const d of secondRead.disagree) {
                if (/^leave\.(ngayBaoCao|nguoiBaoCao|boPhan)$/.test(d.path)) notes.push(`hai lần đọc lệch ở ${d.path}: ${JSON.stringify(d.first)} khác ${JSON.stringify(d.second)}`);
            }
        } else {
            reasons.push(`đọc lần hai lỗi: ${second.error}`);
        }
    }

    const sendDay = vietnamDay(manifest.firstTs);
    const report = parseIso(first.extracted[LEAVE_RULE_ID]?.ngayBaoCao?.value);
    const send = parseIso(sendDay);
    if (report && send && Math.abs(compareYmd(report, send)) > 2) notes.push(`ngày báo cáo trên ảnh (${isoOf(report)}) lệch hơn 2 ngày so với ngày gửi (${isoOf(send)})`);

    const rowReviews: RowReview[] = rows.map((raw, index) => {
        const verdict = validateLeaveRow(raw, { sendDay, ...cfg });
        const own = [...verdict.hard];
        for (const d of secondRead.disagree) {
            if (d.path.startsWith(`leave.dong[${index}].`)) own.push(`hai lần đọc lệch ở ${d.path}: ${JSON.stringify(d.first)} khác ${JSON.stringify(d.second)}`);
        }
        const all = [...reasons, ...own];
        return { index, status: all.length > 0 ? "can_xem" : "tu_dong_dat", reasons: all, warnings: verdict.warnings, human: null };
    });
    return { status: bundleStatus(rowReviews, reasons), reasons, notes, rows: rowReviews, secondRead };
}
```

- [ ] **Step 8: Chạy test**

Run: `node --import tsx --test tests/visionCompare.test.ts tests/leaveValidate.test.ts tests/leaveReview.test.ts` rồi `npm run typecheck`
Expected: PASS. Kiểm tra nếu test "second read with a different number of rows" lệch: `leaveReadingOf([leaveRow()])` có `dong.length` 1 so với 2 nên `leave.dong.length` nằm trong `disagree`; ảnh `readingOf(["khac"], {})` làm `anh[1].loai` lệch (leave khác khac) và `leave.dong.length` biến mất ở bản hai (so với 2): cả hai lý do cấp bộ cùng có mặt, test chỉ yêu cầu `/phân loại/` có trong chuỗi ghép nên vẫn đúng.

- [ ] **Step 9: Commit**

```bash
git add src/vision/review.ts src/leave/validate.ts src/leave/review.ts tests/visionCompare.test.ts tests/leaveValidate.test.ts tests/leaveReview.test.ts
git commit -m "feat(leave): kiểm tra từng dòng nghỉ phép (kiểm chứng chéo THỨ, SỐ NGÀY) và review theo dòng" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Chu trình đọc (`processBundle`, `readBundles`) và lệnh `photos:read`, `photos:auto`

**Files:**
- Create: `src/vision/pipeline.ts`, `src/cli/photos-read.ts`, `src/cli/photos-auto.ts`, `tests/photoPipeline.test.ts`
- Modify: `package.json` (thêm `"photos:read": "tsx src/cli/photos-read.ts",` và `"photos:auto": "tsx src/cli/photos-auto.ts",` sau dòng `"photos:bundle"`)

**Interfaces:**
- Consumes: `VisionReader`, `PhotoRule`, `Review`, `BundleReading`, `ReviewStatus` (Task 1); `needsSecondRead` (Task 8, `src/vision/review.ts`); `reviewLeave` (Task 8); `listBundleDirs`, `readManifest` (Task 5); `bundleFromMessages` (Task 5); `writeFileAtomic`; `makeClaudeReader` (Task 6); `loadRules` (Task 2).
- Produces:
  - `interface PipelineDeps { reader: VisionReader; rules: PhotoRule[]; cfg: { maxPastDays: number; maxFutureDays: number }; log?: (m: string) => void }`
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
import { leaveReadingOf, leaveRow, manifestOf, readingOf } from "./helpers/visionFixtures.js";
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
const clean = (): ReadResult => okRead(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B" })]));
const deps = (reader: VisionReader): PipelineDeps => ({ reader, rules, cfg: { maxPastDays: 7, maxFutureDays: 120 }, log: () => undefined });
const OPTS = { again: false, dryRun: false, maxBundles: 10 };

test("a clean leave bundle is read once and ends tu_dong_dat, with one review per row", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b1", 1);
    const f = fake(clean);
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1]);
    const review = JSON.parse(fs.readFileSync(path.join(dir, "review.json"), "utf8"));
    assert.equal(review.status, "tu_dong_dat");
    assert.equal(review.secondRead.ran, false);
    assert.equal(review.rows.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "reading.json"), "utf8")).extracted.leave.dong.value.length, 2);
});

test("low confidence triggers a second read; a disagreement sends the differing row to review", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b2", 1);
    const f = fake(
        () => okRead(leaveReadingOf([leaveRow()], "thap")),
        () => okRead(leaveReadingOf([leaveRow({ soNgay: 2 })], "cao")),
    );
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1, 2]);
    if (!r.ok) return;
    assert.equal(r.review.status, "can_xem");
    assert.equal(r.review.secondRead.ran, true);
    assert.ok(r.review.secondRead.disagree.some((d) => d.path === "leave.dong[0].soNgay" && d.first === 1 && d.second === 2));
    assert.equal(r.review.rows[0].status, "can_xem");
});

test("a row that fails a hard rule triggers the second read too", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b2b", 1);
    const f = fake(() => okRead(leaveReadingOf([leaveRow({ tuNgay: "2026-02-30" })])));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1, 2]);
});

test("a bundle of only room photos is tu_dong_dat with no second read and no rows", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b3", 2);
    const f = fake(() => okRead(readingOf(["khac", "khac"])));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.equal(f.calls.length, 1);
    if (r.ok) assert.deepEqual([r.review.status, r.review.rows.length], ["tu_dong_dat", 0]);
});

test("a leave photo mixed with room photos: only the leave photo is read", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b3b", 3);
    const f = fake(() => okRead({ ...leaveReadingOf([leaveRow()]), images: [{ seq: 1, loai: "khac", doTinCay: "cao" }, { seq: 2, loai: "leave", doTinCay: "cao" }, { seq: 3, loai: "khac", doTinCay: "cao" }] }));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual([r.review.status, r.review.rows.length], ["tu_dong_dat", 1]);
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

test("a failed second read still saves the first reading, every row can_xem, with the reason", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b5", 1);
    const f = fake(() => okRead(leaveReadingOf([leaveRow()], "thap")), () => ({ ok: false, error: "hết hạn mức" }));
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
    const f = fake(clean);
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
    const f = fake(clean);
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
import { reviewLeave } from "../leave/review.js";
import { listBundleDirs, readManifest } from "./bundleStore.js";
import { needsSecondRead } from "./review.js";
import type { BundleReading, PhotoRule, Review, ReviewStatus, VisionReader } from "../types/index.js";

/**
 * Chu trình đọc của bộ đọc ảnh: một bộ -> đọc lần một -> review theo dòng (`reviewLeave`, gồm luật cứng) -> đọc lần hai độc lập nếu luật đòi
 * hoặc có dòng nghi ngờ -> review lại với lần hai -> ghi `reading.json` và `review.json`. Lỗi đọc lần một KHÔNG ghi gì (bộ vẫn "chưa đọc", chạy
 * lại sẽ thử lại). Lỗi lần hai vẫn giữ kết quả lần một nhưng mọi dòng thành `can_xem`. Chỉ ghi trong thư mục bộ.
 */
export interface PipelineDeps {
    reader: VisionReader;
    rules: PhotoRule[];
    cfg: { maxPastDays: number; maxFutureDays: number };
    log?: (message: string) => void;
}

const writeJson = (file: string, value: unknown): void => writeFileAtomic(file, JSON.stringify(value, null, 2));

export async function processBundle(dir: string, deps: PipelineDeps): Promise<{ ok: true; reading: BundleReading; review: Review } | { ok: false; error: string }> {
    const manifest = readManifest(dir);
    if (!manifest) return { ok: false, error: `không có manifest.json trong ${dir}` };

    const first = await deps.reader.readBundle({ bundleDir: dir, manifest, rules: deps.rules, pass: 1 });
    if (!first.ok) return { ok: false, error: first.error };
    const reading = first.reading;
    let review = reviewLeave({ rules: deps.rules, manifest, first: reading, second: null, cfg: deps.cfg });
    // Bộ không có ảnh nghỉ phép nào: không dòng, không lý do, `needsSecondRead` là false: không tốn lần đọc thứ hai.
    if (needsSecondRead(deps.rules, reading) || review.reasons.length > 0 || review.rows.some((r) => r.reasons.length > 0)) {
        const second = await deps.reader.readBundle({ bundleDir: dir, manifest, rules: deps.rules, pass: 2 });
        review = reviewLeave({ rules: deps.rules, manifest, first: reading, second, cfg: deps.cfg });
    }

    writeJson(path.join(dir, "reading.json"), reading);
    writeJson(path.join(dir, "review.json"), review);
    if (manifest.reread) {
        const rest = { ...manifest };
        delete rest.reread;
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
Expected: PASS.

- [ ] **Step 5: Viết lệnh `src/cli/photos-read.ts`**

```ts
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { makeClaudeReader } from "../vision/claudeReader.js";
import { readBundles } from "../vision/pipeline.js";
import { loadRules } from "../vision/rules.js";

/**
 * Đọc các bộ ảnh ĐÃ ĐÓNG mà chưa đọc (hoặc có cờ đọc lại): agent đọc, kiểm tra theo dòng và (nếu luật đòi) đọc lần hai, ghi `reading.json` và
 * `review.json` trong thư mục bộ; người xem các dòng `can_xem` bằng `photos:review`. Tốn hạn mức gói subscription: mỗi bộ một lần gọi (hai lần nếu
 * cần đọc lần hai), tối đa `config.vision.maxBundlesPerRun` bộ mỗi lần chạy. Không đụng DB, Excel hay kho tin.
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
    if (rules.length === 0) throw new Error("Không có luật nào trong photo-rules/ (cần ít nhất leave.json).");
    const reader = makeClaudeReader({ model: config.vision.model, secondModel: config.vision.secondModel, timeoutMs: config.vision.timeoutSeconds * 1000 });
    const root = photoReportsDir(config.dataDir);
    const summary = await readBundles(
        root,
        { day: option("--day"), bundleId: option("--bundle"), again: flag("--again"), dryRun: flag("--dry-run"), maxBundles: config.vision.maxBundlesPerRun },
        { reader, rules, cfg: config.vision.leave, log: (m) => console.log(`[photos:read] ${m}`) },
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
    if (needReview > 0) console.log(`[photos:read] ${needReview} bộ có dòng cần xem: npm run photos:review -- --list`);
    if (summary.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
```

- [ ] **Step 6: Viết lệnh `src/cli/photos-auto.ts`** (bước đọc ảnh của chu trình runner)

```ts
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { MessageStore } from "../store/messageStore.js";
import { bundleFromMessages } from "../vision/bundleRun.js";
import { makeClaudeReader } from "../vision/claudeReader.js";
import { readBundles } from "../vision/pipeline.js";
import { loadRules } from "../vision/rules.js";
import type { NormalizedMessage } from "../types/index.js";

/**
 * Bước đọc ảnh nghỉ phép của chu trình `bot:runner` (và `today`): gom ảnh của các nhóm trong `config.vision.leave.groups` thành bộ (đóng sau
 * `leave.settleSeconds`), rồi đọc các bộ đã đóng mà chưa đọc, tối đa `config.vision.maxBundlesPerRun` bộ. KHÔNG làm gì khi `config.vision.enabled`
 * là false (không gọi agent, không tốn hạn mức). Thoát mã 1 khi có bộ lỗi: runner chỉ coi đó là cảnh báo. Không đụng DB, Excel hay Zalo.
 *
 *   npm run photos:auto
 */
async function main(): Promise<void> {
    if (!config.vision.enabled) {
        console.log("[photos:auto] config.vision.enabled là false: không đọc ảnh.");
        return;
    }
    if (config.vision.leave.groups.length === 0) {
        console.log("[photos:auto] config.vision.leave.groups đang rỗng: không có nhóm nào được đọc ảnh.");
        return;
    }
    const rules = loadRules();
    if (rules.length === 0) throw new Error("Không có luật nào trong photo-rules/ (cần ít nhất leave.json).");
    const root = photoReportsDir(config.dataDir);

    const store = new MessageStore();
    const messages: NormalizedMessage[] = [];
    for (const groupId of store.listThreads()) messages.push(...(await store.readThread(groupId)));
    const bundled = bundleFromMessages(messages, {
        root,
        dataDir: config.dataDir,
        bundle: config.vision.bundle,
        settleSeconds: config.vision.leave.settleSeconds,
        groups: config.vision.leave.groups,
        senders: config.vision.leave.senders,
        aliases: config.groupAliases,
        now: Date.now(),
    });
    for (const line of bundled.lines) console.log(`[photos:auto] ${line}`);

    const reader = makeClaudeReader({ model: config.vision.model, secondModel: config.vision.secondModel, timeoutMs: config.vision.timeoutSeconds * 1000 });
    const summary = await readBundles(root, { again: false, dryRun: false, maxBundles: config.vision.maxBundlesPerRun }, { reader, rules, cfg: config.vision.leave, log: (m) => console.log(`[photos:auto] ${m}`) });
    const name = (dir: string): string => path.relative(root, dir);
    for (const r of summary.read) console.log(`[photos:auto] ${name(r.dir)}: ${r.status}`);
    for (const f of summary.failed) console.error(`[photos:auto] LỖI ${name(f.dir)}: ${f.error}`);
    console.log(`[photos:auto] gom ${bundled.drafts} bộ (còn mở ${bundled.open}); đã đọc ${summary.read.length}, lỗi ${summary.failed.length}${summary.overLimit > 0 ? `, còn ${summary.overLimit} bộ cho lần sau` : ""}.`);
    if (summary.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
```

Thêm vào `package.json` scripts, ngay sau dòng `"photos:bundle": ...`: `"photos:read": "tsx src/cli/photos-read.ts",` và `"photos:auto": "tsx src/cli/photos-auto.ts",`.

- [ ] **Step 7: Kiểm tra kiểu và chạy thử không tốn token**

Run: `npm run typecheck`, rồi `npx tsx src/cli/photos-read.ts --dry-run` và `npx tsx src/cli/photos-auto.ts`
Expected: `--dry-run` in `CHẠY THỬ, không gọi agent. Sẽ đọc N bộ` (N là số bộ đóng chưa đọc, ví dụ bộ mẫu ở Task 5) và không gọi `claude`; `photos:auto` in `config.vision.enabled là false: không đọc ảnh.`

- [ ] **Step 8: Commit**

```bash
git add src/vision/pipeline.ts src/cli/photos-read.ts src/cli/photos-auto.ts tests/photoPipeline.test.ts package.json
git commit -m "feat(vision): chu trình đọc (review theo dòng, đọc lần hai) và lệnh photos:read, photos:auto" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Người xem từng dòng và lệnh `photos:review`

**Files:**
- Create: `src/leave/reviewApply.ts`, `src/cli/photos-review.ts`, `tests/leaveReviewApply.test.ts`
- Modify: `package.json` (thêm `"photos:review": "tsx src/cli/photos-review.ts",` sau dòng `"photos:auto"`)

**Interfaces:**
- Consumes: `Review`, `RowReview`, `BundleReading`, `Manifest` (Task 1); `LEAVE_COLUMNS`, `bundleStatus`, `leaveRowsOf` (Task 8); `listBundleDirs`, `readManifest` (Task 5).
- Produces:
  - `type HumanAction = "xac_nhan" | "sua" | "bo"`
  - `parseFix(arg: string): { column: string; value: unknown }` (`"soNgay=2"`; cột số parse thành số hoặc `null`, cột chữ giữ nguyên chuỗi)
  - `applyHumanRow(review: Review, index: number, action: HumanAction, corrections: Record<string, unknown>, now: number): Review` (xác nhận chỉ cho dòng `can_xem`; sửa và bỏ cho dòng bất kỳ, thay thế lần xem trước; ném `Error` khi sai)
  - `dismissBundle(review: Review): Review`
  - `finalRow(raw: Record<string, unknown>, row: RowReview): Record<string, unknown>` (dòng đọc được, đè các sửa của người)
  - `describeBundle(manifest: Manifest, reading: BundleReading, review: Review): string[]`

- [ ] **Step 1: Viết test (đỏ)** `tests/leaveReviewApply.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHumanRow, describeBundle, dismissBundle, finalRow, parseFix } from "../src/leave/reviewApply.js";
import { reviewLeave } from "../src/leave/review.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveReadingOf, leaveRow, manifestOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
/** Dòng 0 sạch, dòng 1 có ngày không đọc được (can_xem). */
const first = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B", tuNgay: "2026-02-30" })]);
const base = () => reviewLeave({ rules, manifest: manifestOf(1), first, second: null, cfg });

test("parseFix: text columns stay text, numeric columns become numbers or null, unknown columns are refused", () => {
    assert.deepEqual(parseFix("hoTen=Nguyễn Văn A"), { column: "hoTen", value: "Nguyễn Văn A" });
    assert.deepEqual(parseFix("hoTen=123"), { column: "hoTen", value: "123" });
    assert.deepEqual(parseFix("tuNgay=2026-10-03"), { column: "tuNgay", value: "2026-10-03" });
    assert.deepEqual(parseFix("soNgay=2"), { column: "soNgay", value: 2 });
    assert.deepEqual(parseFix("tuThu=null"), { column: "tuThu", value: null });
    assert.deepEqual(parseFix("lyDo=a=b"), { column: "lyDo", value: "a=b" });
    assert.throws(() => parseFix("khong-co-dau-bang"), /cột=giá trị/);
    assert.throws(() => parseFix("mau=đỏ"), /Cột "mau"/);
    assert.throws(() => parseFix("soNgay=abc"), /số/);
});

test("confirming, fixing and discarding a can_xem row set its status and the bundle status follows", () => {
    const r = base();
    assert.equal(r.status, "can_xem");
    const confirmed = applyHumanRow(r, 1, "xac_nhan", {}, 1000);
    assert.equal(confirmed.rows[1].status, "da_xac_nhan");
    assert.equal(confirmed.status, "da_xac_nhan");
    const fixed = applyHumanRow(r, 1, "sua", { tuNgay: "2026-10-04", tuThu: 1 }, 1000);
    assert.equal(fixed.rows[1].status, "da_sua");
    assert.deepEqual(fixed.rows[1].human, { at: 1000, action: "sua", corrections: { tuNgay: "2026-10-04", tuThu: 1 } });
    assert.equal(fixed.status, "da_sua");
    const dropped = applyHumanRow(r, 1, "bo", {}, 1000);
    assert.equal(dropped.rows[1].status, "da_bo");
    assert.equal(dropped.status, "tu_dong_dat", "row 0 is still automatic");
    assert.equal(r.rows[1].status, "can_xem", "the input is not mutated");
});

test("fixing or dropping a row that was fine (a wrong name) is allowed, and a second fix adds to the first", () => {
    const r = base();
    const renamed = applyHumanRow(r, 0, "sua", { hoTen: "Đinh Đình Chinh" }, 1);
    assert.equal(renamed.rows[0].status, "da_sua");
    const again = applyHumanRow(renamed, 0, "sua", { soNgay: 2 }, 2);
    assert.deepEqual(again.rows[0].human!.corrections, { hoTen: "Đinh Đình Chinh", soNgay: 2 });
    assert.equal(applyHumanRow(again, 0, "bo", {}, 3).rows[0].status, "da_bo");
});

test("invalid human actions are refused", () => {
    const r = base();
    assert.throws(() => applyHumanRow(r, 9, "xac_nhan", {}, 1), /không có dòng 9/);
    assert.throws(() => applyHumanRow(r, 1, "sua", {}, 1), /ít nhất một/);
    assert.throws(() => applyHumanRow(r, 1, "xac_nhan", { soNgay: 1 }, 1), /không kèm sửa/);
    assert.throws(() => applyHumanRow(r, 1, "bo", { soNgay: 1 }, 1), /không kèm sửa/);
    assert.throws(() => applyHumanRow(r, 0, "xac_nhan", {}, 1), /không cần xác nhận/);
});

test("dismissBundle drops the whole bundle", () => {
    const d = dismissBundle(base());
    assert.equal(d.dismissed, true);
    assert.equal(d.status, "da_bo");
});

test("finalRow overlays the human corrections on the read row", () => {
    const r = applyHumanRow(base(), 1, "sua", { tuNgay: "2026-10-04" }, 1);
    assert.equal(finalRow({ hoTen: "B", tuNgay: "2026-02-30" }, r.rows[1]).tuNgay, "2026-10-04");
    assert.equal(finalRow({ hoTen: "B", tuNgay: "2026-02-30" }, base().rows[1]).tuNgay, "2026-02-30");
});

test("describeBundle shows the group, status, reasons and each row with its status", () => {
    const text = describeBundle(manifestOf(1), first, base()).join("\n");
    assert.match(text, /bot test/);
    assert.match(text, /can_xem/);
    assert.match(text, /Dòng 0 \[tu_dong_dat\] Nguyễn Quốc Pháp/);
    assert.match(text, /Dòng 1 \[can_xem\] Trần Văn B/);
    assert.match(text, /ngày bắt đầu không đọc được/);
    assert.match(text, /01\.jpg/);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/leaveReviewApply.test.ts`
Expected: FAIL (`Cannot find module '../src/leave/reviewApply.js'`).

- [ ] **Step 3: Viết `src/leave/reviewApply.ts`**

```ts
import { bundleStatus, LEAVE_COLUMNS, leaveRowsOf } from "./review.js";
import type { BundleReading, Manifest, Review, RowReview } from "../types/index.js";

/**
 * Review lớp 3: người xem từng dòng nghỉ phép. Xác nhận (`da_xac_nhan`) chỉ cho dòng đang `can_xem`; sửa (`da_sua`, kèm các cột sửa) và bỏ (`da_bo`)
 * làm được với dòng bất kỳ (ví dụ sửa một tên đọc sai nhưng không lỗi), và thay thế lần xem trước của dòng đó. Hàm thuần: trả `Review` mới.
 */
export type HumanAction = "xac_nhan" | "sua" | "bo";

const NUMERIC = new Set(["tuThu", "denThu", "soNgay"]);

export function parseFix(arg: string): { column: string; value: unknown } {
    const i = arg.indexOf("=");
    if (i <= 0) throw new Error(`Sửa phải có dạng cột=giá trị (ví dụ soNgay=2), nhận được "${arg}".`);
    const column = arg.slice(0, i).trim();
    if (!(LEAVE_COLUMNS as readonly string[]).includes(column)) throw new Error(`Cột "${column}" không có (các cột: ${LEAVE_COLUMNS.join(", ")}).`);
    const raw = arg.slice(i + 1);
    if (!NUMERIC.has(column)) return { column, value: raw };
    const t = raw.trim();
    if (t === "" || t === "null") return { column, value: null };
    const n = Number(t);
    if (!Number.isFinite(n)) throw new Error(`Cột "${column}" phải là số hoặc null, nhận được "${raw}".`);
    return { column, value: n };
}

export function applyHumanRow(review: Review, index: number, action: HumanAction, corrections: Record<string, unknown>, now: number): Review {
    const row = review.rows.find((r) => r.index === index);
    if (!row) throw new Error(`Bộ này không có dòng ${index} (có: ${review.rows.map((r) => r.index).join(", ") || "không dòng nào"}).`);
    const count = Object.keys(corrections).length;
    if (action === "sua" && count === 0) throw new Error("Sửa cần ít nhất một --fix cột=giá trị.");
    if (action !== "sua" && count > 0) throw new Error("Xác nhận hoặc bỏ không kèm sửa; dùng --fix để sửa.");
    if (action === "xac_nhan" && row.status !== "can_xem") throw new Error(`Dòng ${index} đang ${row.status}, không cần xác nhận.`);
    const merged = action === "sua" ? { ...(row.human?.action === "sua" ? row.human.corrections : {}), ...corrections } : {};
    const status = action === "xac_nhan" ? "da_xac_nhan" : action === "sua" ? "da_sua" : "da_bo";
    const rows = review.rows.map((r): RowReview => (r.index === index ? { ...r, status, human: { at: now, action, corrections: merged } } : r));
    return { ...review, rows, status: bundleStatus(rows, review.reasons, review.dismissed) };
}

/** Người xem bỏ cả bộ (ví dụ ảnh không phải bảng nghỉ phép, hoặc bộ không có dòng nào đọc được). */
export function dismissBundle(review: Review): Review {
    return { ...review, dismissed: true, status: "da_bo" };
}

/** Dòng đã đọc, đè các sửa của người xem (nếu có). */
export function finalRow(raw: Record<string, unknown>, row: RowReview): Record<string, unknown> {
    return { ...raw, ...(row.human?.corrections ?? {}) };
}

const cell = (v: unknown): string => (v === null || v === undefined || v === "" ? "?" : String(v));

export function describeBundle(manifest: Manifest, reading: BundleReading, review: Review): string[] {
    const lines = [`Bộ ${manifest.bundleId} — nhóm ${manifest.groupName}, người gửi ${manifest.sender.name || manifest.sender.id}, trạng thái ${review.status}`];
    lines.push(`Ảnh (${manifest.images.length}): ${manifest.images.map((i) => `${i.file} (${reading.images.find((r) => r.seq === i.seq)?.loai ?? "?"})`).join(", ")}`);
    for (const r of review.reasons) lines.push(`  ! cả bộ: ${r}`);
    for (const n of review.notes) lines.push(`  ~ ${n}`);
    const rows = leaveRowsOf(reading);
    for (const rr of review.rows) {
        const raw = finalRow(rows[rr.index] ?? {}, rr);
        lines.push(`Dòng ${rr.index} [${rr.status}] ${cell(raw.hoTen)}: ${cell(raw.tuNgay)} ${cell(raw.tuGio)} đến ${cell(raw.denNgay)} ${cell(raw.denGio)} | thứ ${cell(raw.tuThu)} đến ${cell(raw.denThu)} | ${cell(raw.soNgay)} ngày | ${cell(raw.lyDo)}`);
        for (const reason of rr.reasons.filter((x) => !review.reasons.includes(x))) lines.push(`    - ${reason}`);
        for (const w of rr.warnings) lines.push(`    ~ ${w}`);
    }
    return lines;
}
```

- [ ] **Step 4: Chạy test**

Run: `node --import tsx --test tests/leaveReviewApply.test.ts` rồi `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Viết lệnh `src/cli/photos-review.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { photoReportsDir } from "../core/paths.js";
import { applyHumanRow, describeBundle, dismissBundle, parseFix } from "../leave/reviewApply.js";
import { listBundleDirs, readManifest } from "../vision/bundleStore.js";
import type { BundleReading, Review } from "../types/index.js";

/**
 * Review lớp 3: người xem các dòng nghỉ phép.
 *
 *   npm run photos:review -- [--list]                                  liệt kê các bộ còn dòng cần xem
 *   npm run photos:review -- --bundle <mã bộ>                          xem chi tiết một bộ (thư mục có ảnh gốc để mở xem)
 *   npm run photos:review -- --bundle <mã bộ> --row N --confirm        dòng N đọc đúng
 *   npm run photos:review -- --bundle <mã bộ> --row N --fix cột=GIÁ_TRỊ [--fix ...]   sửa dòng N (cột: hoTen, tuGio, tuThu, tuNgay, denGio, denThu, denNgay, soNgay, lyDo; ngày YYYY-MM-DD)
 *   npm run photos:review -- --bundle <mã bộ> --row N --discard        bỏ dòng N
 *   npm run photos:review -- --bundle <mã bộ> --discard-bundle         bỏ cả bộ
 *
 * Chỉ ghi `review.json` của bộ đó. Sửa tên một dòng (ví dụ tên chưa khớp danh sách của file Excel) cũng dùng `--fix hoTen=...`.
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
            const waiting = review.rows.filter((r) => r.status === "can_xem").length;
            console.log(`${m?.bundleId ?? path.basename(dir)}  ${m?.groupName ?? ""}  ${waiting} dòng cần xem  ${review.reasons[0] ?? review.rows.find((r) => r.status === "can_xem")?.reasons[0] ?? ""}`);
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

    const save = (next: Review): void => {
        writeFileAtomic(path.join(dir, "review.json"), JSON.stringify(next, null, 2));
        console.log(`[photos:review] ${bundleId}: ${next.status}`);
    };
    if (flag("--discard-bundle")) return save(dismissBundle(review));

    const rowArg = option("--row");
    const fixes = all("--fix");
    const action = flag("--confirm") ? "xac_nhan" : flag("--discard") ? "bo" : fixes.length > 0 ? "sua" : null;
    if (rowArg === undefined || action === null) {
        for (const line of describeBundle(manifest, reading, review)) console.log(line);
        console.log(`Ảnh gốc nằm ở: ${dir}`);
        return;
    }
    const index = Number(rowArg);
    if (!Number.isInteger(index) || index < 0) throw new Error(`--row phải là số nguyên không âm (nhận được "${rowArg}").`);
    const corrections: Record<string, unknown> = {};
    for (const f of fixes) {
        const { column, value } = parseFix(f);
        corrections[column] = value;
    }
    save(applyHumanRow(review, index, action, corrections, Date.now()));
}

try {
    main();
} catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
}
```

Thêm vào `package.json` scripts, sau dòng `"photos:auto"`: `"photos:review": "tsx src/cli/photos-review.ts",`.

- [ ] **Step 6: Kiểm tra kiểu**

Run: `npm run typecheck` rồi `npx tsx src/cli/photos-review.ts --list`
Expected: `[photos:review] 0 bộ cần xem.` (hoặc danh sách nếu đã có bộ `can_xem`).

- [ ] **Step 7: Commit**

```bash
git add src/leave/reviewApply.ts src/cli/photos-review.ts tests/leaveReviewApply.test.ts package.json
git commit -m "feat(leave): người xem từng dòng nghỉ phép và lệnh photos:review" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Điền tại chỗ (`inPlace`), `LEAVE_LAYOUT`, trạng thái dựng file và đăng ký mã `leave`

**Files:**
- Create: `src/leave/layout.ts`, `src/leave/leaveState.ts`, `tests/leaveLayout.test.ts`, `tests/leaveState.test.ts`
- Modify: `src/lesson/statusReportLayout.ts`, `src/lesson/excelFill.ts`, `scripts/fill-status-template.ps1`, `src/reportSets/registry.ts`, `tests/excelFill.test.ts`, `tests/reportRegistry.test.ts`, `tests/reportsList.test.ts`

**Interfaces:**
- Consumes: `FileLayout`, `HeaderCell` (`src/lesson/statusReportLayout.ts`); `writeFileAtomic`.
- Produces:
  - `FileLayout.inPlace?: boolean`
  - `LEAVE_LAYOUT: FileLayout`, `LEAVE_NGAY_COLUMN = "F"`, `LEAVE_BUOI_COLUMN = "E"` (`src/leave/layout.ts`)
  - `interface LeaveBuilt { day: string; signature: string; file: string }`, `leaveBuiltPath(setId: string): string`, `leaveNeedsRebuild(prev: LeaveBuilt | null, day: string, signature: string, fileExists: (name: string) => boolean): boolean`, `readLeaveBuilt(file: string): LeaveBuilt | null`, `writeLeaveBuilt(state: LeaveBuilt, file: string): void` (`src/leave/leaveState.ts`)
  - mã báo cáo `leave` trong `REPORT_KEYS` (cuối cùng) và `REPORT_DEFS.leave` (loại `day`).

- [ ] **Step 1: Viết test (đỏ)**

Thêm vào cuối `tests/excelFill.test.ts`:

```ts
test("buildFillPsSpec: inPlace goes to the PowerShell spec only when the layout asks for it", () => {
    const args = { name: "leave", templatesSrc: "C:\\data", outDir: "C:\\out", outName: "o.xlsx", rows: [], headerCells: [{ ref: "F4", value: "08/10/2026", numberFormat: "@" }] };
    const on = buildFillPsSpec({ ...args, layout: { templateFile: "t.xlsx", sheet: "S", firstDataRow: 4, totalRowBefore: 16, lastColumn: "M", inPlace: true } }) as { files: Array<Record<string, unknown>> };
    assert.equal(on.files[0].inPlace, true);
    const off = buildFillPsSpec({ ...args, layout: { templateFile: "t.xlsx", sheet: "S", firstDataRow: 4, totalRowBefore: 7, lastColumn: "I" } }) as { files: Array<Record<string, unknown>> };
    assert.equal("inPlace" in off.files[0], false);
});
```

Tạo `tests/leaveLayout.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { LEAVE_BUOI_COLUMN, LEAVE_LAYOUT, LEAVE_NGAY_COLUMN } from "../src/leave/layout.js";

test("the leave layout fills in place and writes the BUỔI and NGÀY columns", () => {
    assert.equal(LEAVE_LAYOUT.inPlace, true);
    assert.equal(LEAVE_LAYOUT.templateFile, "LICH NGHI PHEP KY THUAT.xlsx");
    assert.equal(LEAVE_LAYOUT.sheet, "BAO CAO");
    assert.equal(LEAVE_NGAY_COLUMN, "F");
    assert.equal(LEAVE_BUOI_COLUMN, "E");
});

const REAL = path.join("data", "mau bao cao new", LEAVE_LAYOUT.templateFile);
test("the real template still has the headers the layout relies on", { skip: !fs.existsSync(REAL) }, () => {
    const ws = XLSX.readFile(REAL).Sheets[LEAVE_LAYOUT.sheet];
    assert.ok(ws, "sheet BAO CAO");
    assert.equal(ws["B3"]?.v, "NHÂN VIÊN");
    assert.equal(ws["E3"]?.v, "BUỔI");
    assert.equal(ws["F3"]?.v, "NGÀY");
    assert.equal(ws["A16"]?.v, "TỔNG");
    assert.match(String(ws["A1"]?.v), /LỊCH NGHỈ PHÉP KỸ THUẬT/);
});
```

Tạo `tests/leaveState.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { leaveBuiltPath, leaveNeedsRebuild, readLeaveBuilt, writeLeaveBuilt } from "../src/leave/leaveState.js";

const built = { day: "2026-10-07", signature: "abc", file: "LỊCH NGHỈ PHÉP KỸ THUẬT_261007_T4_0907.xlsx" };

test("rebuild only when never built, another day, other content, or the file is gone", () => {
    const exists = () => true;
    assert.equal(leaveNeedsRebuild(null, "2026-10-07", "abc", exists), true);
    assert.equal(leaveNeedsRebuild(built, "2026-10-07", "abc", exists), false);
    assert.equal(leaveNeedsRebuild(built, "2026-10-08", "abc", exists), true);
    assert.equal(leaveNeedsRebuild(built, "2026-10-07", "xyz", exists), true);
    assert.equal(leaveNeedsRebuild(built, "2026-10-07", "abc", () => false), true);
});

test("the state round-trips through a file, and a missing or broken file reads as null", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leave-state-"));
    const file = path.join(dir, "state.json");
    assert.equal(readLeaveBuilt(file), null);
    writeLeaveBuilt(built, file);
    assert.deepEqual(readLeaveBuilt(file), built);
    fs.writeFileSync(file, "không phải json", "utf8");
    assert.equal(readLeaveBuilt(file), null);
    fs.writeFileSync(file, JSON.stringify({ day: "x" }), "utf8");
    assert.equal(readLeaveBuilt(file), null);
});

test("each report set has its own state file", () => {
    assert.ok(leaveBuiltPath("Như").endsWith(".leave-report.Như.json"));
    assert.notEqual(leaveBuiltPath("A"), leaveBuiltPath("B"));
});
```

Sửa `tests/reportRegistry.test.ts`:
- Test đầu: tiêu đề `the registry lists the 8 reports in export and print order`, mảng thành `["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance", "leave"]`.
- Test thứ hai: `assert.deepEqual(DAY_REPORT_KEYS, ["dien", "cleaning", "attendance", "leave"]);`.
- Test thứ ba: thêm dòng `assert.equal(REPORT_DEFS.leave.layout.templateFile, "LICH NGHI PHEP KY THUAT.xlsx");` và `assert.equal(REPORT_DEFS.leave.kind, "day");`.

Sửa `tests/reportsList.test.ts`: trong hai mảng mã (test "every code is listed..." và test "the order is the export and print order") thêm `"leave"` vào cuối.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/excelFill.test.ts tests/leaveLayout.test.ts tests/leaveState.test.ts tests/reportRegistry.test.ts tests/reportsList.test.ts`
Expected: FAIL (thiếu module `src/leave/layout.js`, `leaveState.js`, mã `leave`).

- [ ] **Step 3: Thêm `inPlace` vào `FileLayout` trong `src/lesson/statusReportLayout.ts`**

Trong `interface FileLayout`, thêm sau trường `deleteSheets?: string[];`:

```ts
    /**
     * true: điền TẠI CHỖ. Script Excel bỏ qua việc chèn/xoá dòng (số dòng của mẫu giữ nguyên) và chỉ ghi các ô trong `headerCells`. Dùng cho
     * LỊCH NGHỈ PHÉP: danh sách tên nằm sẵn trong mẫu, bot chỉ ghi cột BUỔI và NGÀY của vài dòng.
     */
    inPlace?: boolean;
```

- [ ] **Step 4: Chuyển `inPlace` vào đặc tả PowerShell trong `src/lesson/excelFill.ts`**

Trong `buildFillPsSpec`, sau dòng `lastColumn: args.layout.lastColumn,` thêm:

```ts
                ...(args.layout.inPlace ? { inPlace: true } : {}),
```

- [ ] **Step 5: Sửa `scripts/fill-status-template.ps1`**

Dùng công cụ Edit: thay đúng một dòng

```
        $targetRows = [Math]::Max($need, 1)
```

bằng

```
        # inPlace (mau LICH NGHI PHEP): giu nguyen so dong cua mau, khong chen/xoa dong nao (targetRows = have). Khong co thi nhu cu.
        $targetRows = if ($f.inPlace -eq $true) { $have } else { [Math]::Max($need, 1) }
```

(Với `inPlace` thì `$targetRows -eq $have` nên cả hai nhánh `Insert`/`Delete` bên dưới không chạy, `$need` bằng 0 nên khối ghi mảng cũng không chạy; phần `headerCells` ghi các ô như mọi file khác.)

- [ ] **Step 6: Viết `src/leave/layout.ts`**

```ts
import type { FileLayout } from "../lesson/statusReportLayout.js";

/**
 * Mẫu LỊCH NGHỈ PHÉP KỸ THUẬT (`data/mau bao cao new/LICH NGHI PHEP KY THUAT.xlsx`, sheet `BAO CAO`): danh sách tên ở cột B từ dòng 4, dòng TỔNG ở
 * dòng 16. Điền TẠI CHỖ (`inPlace`): bot chỉ ghi cột NGÀY (F, chữ) và BUỔI (E) của dòng khớp tên; mọi ô khác (STT, SỐ NGÀY, XẾP LOẠI, K/C và
 * `H2 =TODAY()` đều là công thức hay chữ có sẵn) giữ nguyên. Giá trị dòng/cột đo trực tiếp trên mẫu; có test đối chiếu với file thật.
 */
export const LEAVE_LAYOUT: FileLayout = {
    templateFile: "LICH NGHI PHEP KY THUAT.xlsx",
    sheet: "BAO CAO",
    firstDataRow: 4,
    totalRowBefore: 16,
    lastColumn: "M",
    inPlace: true,
};

export const LEAVE_NGAY_COLUMN = "F";
export const LEAVE_BUOI_COLUMN = "E";
```

- [ ] **Step 7: Viết `src/leave/leaveState.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";

/** Bản LỊCH NGHỈ PHÉP đã dựng gần nhất của một bộ: ngày, chữ ký của các ô đã ghi, và tên file. */
export interface LeaveBuilt {
    day: string;
    signature: string;
    file: string;
}

/** Trạng thái của một bộ: `data/.leave-report.<id>.json` (mỗi bộ có file riêng trong thư mục riêng, nên chữ ký và tên file riêng). */
export const leaveBuiltPath = (setId: string): string => path.join(config.dataDir, `.leave-report.${setId}.json`);

/**
 * Có cần dựng lại file nghỉ phép của `day` không: chưa dựng lần nào, sang ngày khác, nội dung các ô đổi (có ảnh mới, kỳ nghỉ kết thúc, người xem sửa
 * dòng), hoặc file đã dựng không còn trên đĩa. Cùng ngày và cùng nội dung thì KHÔNG dựng lại, nên giờ trong tên file chỉ đổi khi có dữ liệu mới.
 */
export function leaveNeedsRebuild(prev: LeaveBuilt | null, day: string, signature: string, fileExists: (name: string) => boolean): boolean {
    if (!prev || prev.day !== day || prev.signature !== signature) return true;
    return !fileExists(prev.file);
}

const isBuilt = (v: unknown): v is LeaveBuilt => {
    const r = v as Record<string, unknown> | null;
    return typeof r === "object" && r !== null && typeof r.day === "string" && typeof r.signature === "string" && typeof r.file === "string";
};

/** File thiếu, hỏng hoặc sai dạng đều đọc ra null (chỉ khiến lần sau dựng lại một lần). */
export function readLeaveBuilt(file: string): LeaveBuilt | null {
    try {
        const v: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return isBuilt(v) ? { day: v.day, signature: v.signature, file: v.file } : null;
    } catch {
        return null;
    }
}

export function writeLeaveBuilt(state: LeaveBuilt, file: string): void {
    writeFileAtomic(file, JSON.stringify(state, null, 2));
}
```

- [ ] **Step 8: Đăng ký mã `leave` trong `src/reportSets/registry.ts`**

Thêm import (cạnh các import layout khác): `import { LEAVE_LAYOUT } from "../leave/layout.js";`.

Đổi dòng khai báo và chú thích:

```ts
 * THỨ TỰ Ở ĐÂY LÀ THỨ TỰ XUẤT FILE VÀ IN (NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH, NỘI QUY, NGHỈ PHÉP).
 */
export const REPORT_KEYS = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance", "leave"] as const;
```

Thêm vào cuối `REPORT_DEFS` (sau dòng `attendance`):

```ts
    leave: { key: "leave", kind: "day", label: "LỊCH NGHỈ PHÉP KỸ THUẬT", source: "ẢNH NGHỈ PHÉP (không có tiêu đề)", layout: LEAVE_LAYOUT },
```

- [ ] **Step 9: Chạy test**

Run: `node --import tsx --test tests/excelFill.test.ts tests/leaveLayout.test.ts tests/leaveState.test.ts tests/reportRegistry.test.ts tests/reportsList.test.ts` rồi `npm run typecheck` rồi `npm test`
Expected: PASS. Nếu một test khác liệt kê các mã (ví dụ `resolveReportSets.test.ts`, `cliSet.test.ts`) và chuỗi lỗi nay có thêm `leave`, sửa đúng chuỗi mong đợi (thêm `, leave` vào danh sách mã hợp lệ) và ghi lại trong commit.

- [ ] **Step 10: Commit**

```bash
git add src/leave/layout.ts src/leave/leaveState.ts src/lesson/statusReportLayout.ts src/lesson/excelFill.ts scripts/fill-status-template.ps1 src/reportSets/registry.ts tests
git commit -m "feat(leave): điền tại chỗ (inPlace), LEAVE_LAYOUT, trạng thái dựng file, mã báo cáo leave" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Chọn kỳ nghỉ còn hiệu lực, dựng ô Excel và gói cho một ngày

**Files:**
- Create: `src/leave/sources.ts`, `src/leave/collect.ts`, `src/leave/cells.ts`, `src/leave/buildDay.ts`, `src/leave/realIo.ts`, `tests/leaveSources.test.ts`, `tests/leaveCollect.test.ts`, `tests/leaveCells.test.ts`, `tests/leaveDay.test.ts`

**Interfaces:**
- Consumes: `listBundleDirs`, `readManifest` (Task 5); `leaveRowsOf`, `reviewLeave` (Task 8); `finalRow` (Task 10); `validateLeaveRow`, `ParsedLeave` (Task 8); `normalizeName`, `suggestNames`, `matchRoster`, `readRoster`, `RosterRow` (Task 7); `buoiNghi`, `ngayText` (Task 7); `LEAVE_LAYOUT`, `LEAVE_NGAY_COLUMN`, `LEAVE_BUOI_COLUMN` (Task 11); `HeaderCell`; `addDays` (`src/lesson/time.ts`).
- Produces:
  - `sources.ts`: `interface LeaveRowSource { bundleId: string; dir: string; rowIndex: number; sentTs: number; sendDay: string; status: ReviewStatus; raw: Record<string, unknown>; reasons: string[]; warnings: string[] }`, `loadLeaveRows(root: string, sinceDay: string): LeaveRowSource[]`, `countUnreadBundles(root: string, sinceDay: string, groups: string[]): number`.
  - `collect.ts`: `interface ActiveLeave { key: string; hoTen: string; parsed: ParsedLeave; sentTs: number; bundleId: string; rowIndex: number }`, `interface PendingRow { bundleId: string; rowIndex: number; sentTs: number; hoTen: string; reasons: string[] }`, `interface CollectResult { leaves: ActiveLeave[]; notes: string[]; pending: PendingRow[] }`, `collectLeaves(rows: LeaveRowSource[], today: string, cfg: { maxPastDays: number; maxFutureDays: number }): CollectResult`.
  - `cells.ts`: `interface LeaveFill { headerCells: HeaderCell[]; filled: Array<{ row: number; name: string; ngay: string; buoi: string }>; unmatched: Array<{ hoTen: string; ngay: string; suggestions: string[]; bundleId: string; rowIndex: number }> }`, `buildLeaveCells(roster: RosterRow[], leaves: ActiveLeave[]): LeaveFill`.
  - `buildDay.ts`: `interface LeaveIO { readRoster(): RosterRow[]; loadRows(sinceDay: string): LeaveRowSource[]; countUnread(sinceDay: string): number }`, `interface LeaveDayCfg { lookbackDays: number; maxPastDays: number; maxFutureDays: number }`, `interface LeaveDay extends LeaveFill { notes: string[]; pending: PendingRow[]; warnings: string[]; signature: string }`, `leaveSignature(cells: HeaderCell[]): string`, `leaveForDay(day: string, io: LeaveIO, cfg: LeaveDayCfg): LeaveDay`.
  - `realIo.ts`: `realLeaveIO(): LeaveIO`.

- [ ] **Step 1: Viết test đọc từ đĩa** `tests/leaveSources.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { countUnreadBundles, loadLeaveRows } from "../src/leave/sources.js";
import { applyHumanRow, dismissBundle } from "../src/leave/reviewApply.js";
import { reviewLeave } from "../src/leave/review.js";
import { loadRules } from "../src/vision/rules.js";
import type { BundleReading, Review } from "../src/types/index.js";
import { leaveReadingOf, leaveRow, manifestOf, T0 } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
const root = () => fs.mkdtempSync(path.join(os.tmpdir(), "leave-src-"));

function writeBundle(r: string, id: string, day: string, reading: BundleReading | null, review: Review | null, extra: Parameters<typeof manifestOf>[1] = {}): void {
    const dir = path.join(r, day, "g1", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestOf(1, { bundleId: id, day, ...extra })), "utf8");
    if (reading) fs.writeFileSync(path.join(dir, "reading.json"), JSON.stringify(reading), "utf8");
    if (review) fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(review), "utf8");
}
const reviewOf = (reading: BundleReading): Review => reviewLeave({ rules, manifest: manifestOf(1), first: reading, second: null, cfg });

test("every row of a read bundle becomes a source with its status, raw cells and the bundle's send time", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B", tuNgay: "2026-02-30" })]);
    writeBundle(r, "b1", "2026-10-07", reading, reviewOf(reading));
    const rows = loadLeaveRows(r, "2026-08-01");
    assert.deepEqual(rows.map((x) => [x.bundleId, x.rowIndex, x.status, x.raw.hoTen]), [["b1", 0, "tu_dong_dat", "Nguyễn Quốc Pháp"], ["b1", 1, "can_xem", "B"]]);
    assert.equal(rows[0].sentTs, T0);
    assert.equal(rows[0].sendDay, "2026-10-07");
});

test("human corrections are laid over the read cells; dropped rows and dismissed bundles never appear", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "B", tuNgay: "2026-02-30" })]);
    const fixed = applyHumanRow(reviewOf(reading), 1, "sua", { tuNgay: "2026-10-04", tuThu: 1 }, 5);
    writeBundle(r, "b1", "2026-10-07", reading, applyHumanRow(fixed, 0, "bo", {}, 6));
    const rows = loadLeaveRows(r, "2026-08-01");
    assert.deepEqual(rows.map((x) => [x.rowIndex, x.status, x.raw.tuNgay]), [[1, "da_sua", "2026-10-04"]]);
    writeBundle(r, "b2", "2026-10-07", reading, dismissBundle(reviewOf(reading)), { firstTs: T0 + 1000 });
    assert.equal(loadLeaveRows(r, "2026-08-01").every((x) => x.bundleId !== "b2"), true);
});

test("bundles that are old, unread or without a review are skipped", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow()]);
    writeBundle(r, "old", "2026-06-01", reading, reviewOf(reading));
    writeBundle(r, "unread", "2026-10-07", null, null);
    writeBundle(r, "noreview", "2026-10-07", reading, null);
    assert.deepEqual(loadLeaveRows(r, "2026-08-01"), []);
    assert.equal(loadLeaveRows(r, "2026-05-01").length, 1, "the old one comes back once the window reaches it");
});

test("countUnreadBundles counts the bundles of the named groups that have no reading yet, or are flagged for re-reading", () => {
    const r = root();
    const reading = leaveReadingOf([leaveRow()]);
    writeBundle(r, "read", "2026-10-07", reading, reviewOf(reading));
    writeBundle(r, "unread", "2026-10-07", null, null);
    writeBundle(r, "other-group", "2026-10-07", null, null, { groupName: "LC_Khac_BD" });
    writeBundle(r, "reread", "2026-10-07", reading, reviewOf(reading), { reread: true });
    writeBundle(r, "old-unread", "2026-06-01", null, null);
    assert.equal(countUnreadBundles(r, "2026-08-01", ["bot test"]), 2);
    assert.equal(countUnreadBundles(r, "2026-08-01", []), 0);
});
```

- [ ] **Step 2: Viết test chọn kỳ nghỉ** `tests/leaveCollect.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { collectLeaves } from "../src/leave/collect.js";
import type { LeaveRowSource } from "../src/leave/sources.js";
import type { ReviewStatus } from "../src/types/index.js";
import { leaveRow } from "./helpers/visionFixtures.js";

const TODAY = "2026-10-07";
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
const src = (bundleId: string, sentTs: number, rowIndex: number, status: ReviewStatus, over: Record<string, unknown> = {}): LeaveRowSource => ({
    bundleId, dir: "d", rowIndex, sentTs, sendDay: "2026-10-07", status, raw: leaveRow(over), reasons: [], warnings: [],
});
// 08/10/2026 là thứ năm (5), 09/10 thứ sáu (6), 20/10 thứ ba (3), 07/10 thứ tư (4), 05/10 thứ hai (2), 06/10 thứ ba (3).
const on = (iso: string, thu: number) => ({ tuNgay: iso, denNgay: iso, tuThu: thu, denThu: thu, soNgay: thu === 1 ? 0 : 1 });
const A = (iso: string, thu: number, name = "Nguyễn Văn A") => ({ hoTen: name, ...on(iso, thu) });

test("a leave that ended yesterday is dropped; one ending today or in the future is kept", () => {
    const rows = [
        src("b1", 1000, 0, "tu_dong_dat", { hoTen: "Hôm qua", tuNgay: "2026-10-05", tuThu: 2, denNgay: "2026-10-06", denThu: 3, soNgay: 2 }),
        src("b1", 1000, 1, "tu_dong_dat", A("2026-10-07", 4, "Hôm nay")),
        src("b1", 1000, 2, "tu_dong_dat", A("2026-10-20", 3, "Tương lai")),
    ];
    const r = collectLeaves(rows, TODAY, cfg);
    assert.deepEqual(r.leaves.map((l) => l.hoTen), ["Hôm nay", "Tương lai"]);
});

test("the newest photo wins for a person who is in two photos, and the replacement is noted", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5)), src("new", 2000, 0, "tu_dong_dat", A("2026-10-09", 6))], TODAY, cfg);
    assert.equal(r.leaves.length, 1);
    assert.equal(r.leaves[0].bundleId, "new");
    assert.match(r.notes.join(" "), /thay kỳ nghỉ 08\/10\/2026 .* bằng 09\/10\/2026/);
});

test("the same leave repeated in a newer photo is not a replacement and makes no note", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5)), src("new", 2000, 0, "tu_dong_dat", A("2026-10-08", 5))], TODAY, cfg);
    assert.equal(r.leaves[0].bundleId, "new");
    assert.deepEqual(r.notes, []);
});

test("a newer row that is still waiting for review does not erase the good older leave, and says so", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5)), src("new", 2000, 0, "can_xem", A("2026-10-09", 6))], TODAY, cfg);
    assert.equal(r.leaves[0].bundleId, "old");
    assert.equal(r.pending.length, 1);
    assert.match(r.notes.join(" "), /có bản mới hơn đang chờ xem/);
});

test("only tu_dong_dat, da_xac_nhan and da_sua rows are used; can_xem rows are listed as pending with the name read", () => {
    const rows = [
        src("b1", 1000, 0, "da_sua", A("2026-10-08", 5, "Sửa")),
        src("b1", 1000, 1, "da_xac_nhan", A("2026-10-08", 5, "Xác nhận")),
        src("b1", 1000, 2, "can_xem", A("2026-10-08", 5, "Chờ xem")),
    ];
    const r = collectLeaves(rows, TODAY, cfg);
    assert.deepEqual(r.leaves.map((l) => l.hoTen), ["Sửa", "Xác nhận"]);
    assert.deepEqual(r.pending.map((p) => [p.hoTen, p.rowIndex]), [["Chờ xem", 2]]);
});

test("one person with two leaves in the same photo: the nearest ending is kept and the other is reported", () => {
    const r = collectLeaves([src("b1", 1000, 0, "tu_dong_dat", A("2026-10-20", 3)), src("b1", 1000, 1, "tu_dong_dat", A("2026-10-08", 5))], TODAY, cfg);
    assert.equal(r.leaves.length, 1);
    assert.equal(r.leaves[0].rowIndex, 1);
    assert.match(r.notes.join(" "), /nhiều kỳ nghỉ/);
    assert.match(r.notes.join(" "), /bỏ 20\/10\/2026/);
});

test("names are grouped ignoring accents, case and spacing", () => {
    const r = collectLeaves([src("old", 1000, 0, "tu_dong_dat", A("2026-10-08", 5, "Nguyễn Văn A")), src("new", 2000, 0, "tu_dong_dat", A("2026-10-09", 6, "nguyen  van a"))], TODAY, cfg);
    assert.equal(r.leaves.length, 1);
    assert.equal(r.leaves[0].bundleId, "new");
});

test("a usable row whose dates cannot be read is skipped with a note, and the leaves are sorted by name", () => {
    const rows = [src("b1", 1000, 0, "tu_dong_dat", { hoTen: "Hỏng", tuNgay: "2026-02-30" }), src("b1", 1000, 1, "tu_dong_dat", A("2026-10-08", 5, "Zed")), src("b1", 1000, 2, "tu_dong_dat", A("2026-10-08", 5, "An"))];
    const r = collectLeaves(rows, TODAY, cfg);
    assert.deepEqual(r.leaves.map((l) => l.hoTen), ["An", "Zed"]);
    assert.match(r.notes.join(" "), /bỏ dòng 0 của bộ b1/);
});

test("an invalid today is a clear error", () => {
    assert.throws(() => collectLeaves([], "07/10/2026", cfg), /ngày hôm nay/);
});
```

Kiểm tra: 2026-10-05 là thứ hai (Mon=2) và 2026-10-06 thứ ba (3); `soNgay` của kỳ 05→06 là 2 ✓. Ngày ghi trong `on()`: `thu === 1 ? 0 : 1` cho một ngày: thứ 1 (Chủ nhật) có 0 ngày không tính Chủ nhật; các ngày dùng trong test đều không phải Chủ nhật.

- [ ] **Step 3: Viết test dựng ô** `tests/leaveCells.test.ts`

```ts
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeaveCells } from "../src/leave/cells.js";
import type { ActiveLeave } from "../src/leave/collect.js";
import { parseIso } from "../src/leave/dates.js";
import { normalizeName } from "../src/leave/names.js";

const ROSTER = [
    { row: 4, name: "Huỳnh Hữu Đức" },
    { row: 6, name: "Đinh Đình Chinh" },
    { row: 27, name: "Đinh Đình Chinh" },
];
const leave = (hoTen: string, tu: string, tuGio: number, den: string, denGio: number): ActiveLeave => ({
    key: normalizeName(hoTen), hoTen, sentTs: 1, bundleId: "b1", rowIndex: 0,
    parsed: { hoTen, tu: parseIso(tu)!, den: parseIso(den)!, tuGio, denGio, soNgay: null, lyDo: null },
});

test("a person with two rows in the file is filled on both rows, in row order, NGÀY as text and BUỔI as given", () => {
    const fill = buildLeaveCells(ROSTER, [leave("dinh dinh chinh", "2026-10-08", 13.5, "2026-10-10", 18), leave("Huỳnh Hữu Đức", "2026-10-08", 8, "2026-10-08", 11.5)]);
    assert.deepEqual(fill.headerCells, [
        { ref: "F4", value: "08/10/2026", numberFormat: "@" },
        { ref: "E4", value: "Sáng" },
        { ref: "F6", value: "08/10/2026 - 10/10/2026", numberFormat: "@" },
        { ref: "E6", value: "Chiều - Cả ngày" },
        { ref: "F27", value: "08/10/2026 - 10/10/2026", numberFormat: "@" },
        { ref: "E27", value: "Chiều - Cả ngày" },
    ]);
    assert.deepEqual(fill.filled.map((f) => [f.row, f.name]), [[4, "Huỳnh Hữu Đức"], [6, "Đinh Đình Chinh"], [27, "Đinh Đình Chinh"]]);
    assert.deepEqual(fill.unmatched, []);
});

test("a name that is not in the roster fills nothing and is reported with suggestions", () => {
    const fill = buildLeaveCells(ROSTER, [leave("Đinh Chinh", "2026-10-08", 8, "2026-10-08", 18), leave("Người Lạ", "2026-10-09", 8, "2026-10-09", 18)]);
    assert.deepEqual(fill.headerCells, []);
    assert.deepEqual(fill.filled, []);
    assert.deepEqual(fill.unmatched.map((u) => [u.hoTen, u.suggestions]), [["Đinh Chinh", ["Đinh Đình Chinh"]], ["Người Lạ", []]]);
    assert.equal(fill.unmatched[0].ngay, "08/10/2026");
});

test("no leaves means no cells", () => {
    assert.deepEqual(buildLeaveCells(ROSTER, []), { headerCells: [], filled: [], unmatched: [] });
});
```

- [ ] **Step 4: Viết test gói một ngày** `tests/leaveDay.test.ts`

```ts
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { leaveForDay, leaveSignature, type LeaveIO } from "../src/leave/buildDay.js";
import type { LeaveRowSource } from "../src/leave/sources.js";
import type { ReviewStatus } from "../src/types/index.js";
import { leaveRow } from "./helpers/visionFixtures.js";

const cfg = { lookbackDays: 60, maxPastDays: 7, maxFutureDays: 120 };
const ROSTER = [{ row: 4, name: "Huỳnh Hữu Đức" }, { row: 6, name: "Đinh Đình Chinh" }];
const row = (rowIndex: number, status: ReviewStatus, over: Record<string, unknown>): LeaveRowSource => ({
    bundleId: "b1", dir: "d", rowIndex, sentTs: 1000, sendDay: "2026-10-07", status, raw: leaveRow({ tuNgay: "2026-10-08", denNgay: "2026-10-08", tuThu: 5, denThu: 5, soNgay: 1, ...over }), reasons: [], warnings: [],
});
function io(rows: LeaveRowSource[], over: Partial<LeaveIO> = {}): LeaveIO & { since: string[] } {
    const since: string[] = [];
    return { since, readRoster: () => ROSTER, loadRows: (d) => (since.push(d), rows), countUnread: () => 0, ...over };
}

test("the window starts lookbackDays before the day", () => {
    const i = io([]);
    leaveForDay("2026-10-07", i, cfg);
    assert.deepEqual(i.since, ["2026-08-08"]);
});

test("an in-roster leave becomes cells and a signature; the same input gives the same signature", () => {
    const rows = [row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức" })];
    const a = leaveForDay("2026-10-07", io(rows), cfg);
    assert.deepEqual(a.filled.map((f) => [f.row, f.ngay, f.buoi]), [[4, "08/10/2026", "Cả ngày"]]);
    assert.deepEqual(a.warnings, []);
    assert.equal(a.signature, leaveSignature(a.headerCells));
    assert.equal(leaveForDay("2026-10-07", io(rows), cfg).signature, a.signature);
    const b = leaveForDay("2026-10-07", io([row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức", denGio: "11:30" })]), cfg);
    assert.notEqual(b.signature, a.signature, "a different BUỔI is different content");
});

test("no leave at all: no cells, and the signature is the stable signature of nothing", () => {
    const d = leaveForDay("2026-10-07", io([]), cfg);
    assert.deepEqual([d.headerCells, d.filled, d.warnings, d.notes], [[], [], [], []]);
    assert.equal(d.signature, leaveSignature([]));
});

test("warnings: unread bundles, a name that is not in the roster (with the fix command), and rows waiting for review", () => {
    const rows = [row(0, "tu_dong_dat", { hoTen: "Đinh Chinh" }), row(1, "can_xem", { hoTen: "Chờ Xem" })];
    const d = leaveForDay("2026-10-07", io(rows, { countUnread: () => 2 }), cfg);
    const text = d.warnings.join("\n");
    assert.match(text, /2 bộ ảnh nghỉ phép chưa đọc/);
    assert.match(text, /Đinh Chinh .*không có trong danh sách.*gần giống: Đinh Đình Chinh/);
    assert.match(text, /photos:review --bundle b1 --row 0 --fix hoTen=/);
    assert.match(text, /1 dòng nghỉ phép đang chờ xem/);
    assert.deepEqual(d.filled, []);
});

test("notes from the selection (a replaced leave) are passed through", () => {
    const rows = [
        { ...row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức" }), bundleId: "old", sentTs: 1000 },
        { ...row(0, "tu_dong_dat", { hoTen: "Huỳnh Hữu Đức", tuNgay: "2026-10-09", denNgay: "2026-10-09", tuThu: 6, denThu: 6 }), bundleId: "new", sentTs: 2000 },
    ];
    const d = leaveForDay("2026-10-07", io(rows), cfg);
    assert.match(d.notes.join(" "), /thay kỳ nghỉ/);
    assert.equal(d.filled[0].ngay, "09/10/2026");
});
```

- [ ] **Step 5: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/leaveSources.test.ts tests/leaveCollect.test.ts tests/leaveCells.test.ts tests/leaveDay.test.ts`
Expected: FAIL (`Cannot find module '../src/leave/sources.js'`).

- [ ] **Step 6: Viết `src/leave/sources.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { listBundleDirs, readManifest } from "../vision/bundleStore.js";
import { leaveRowsOf } from "./review.js";
import { finalRow } from "./reviewApply.js";
import type { BundleReading, Review, ReviewStatus } from "../types/index.js";

/** Một dòng nghỉ phép đã đọc, kèm trạng thái review và các ô (đã đè các sửa của người xem), với thời điểm gửi ảnh của bộ chứa nó. */
export interface LeaveRowSource {
    bundleId: string;
    dir: string;
    rowIndex: number;
    /** Giờ gửi ảnh đầu của bộ (ảnh nào mới hơn thì thắng). */
    sentTs: number;
    /** Ngày gửi ảnh, `YYYY-MM-DD`. */
    sendDay: string;
    status: ReviewStatus;
    raw: Record<string, unknown>;
    reasons: string[];
    warnings: string[];
}

function readJson<T>(file: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as T;
    } catch {
        return null;
    }
}

/**
 * Mọi dòng nghỉ phép của các bộ đã đọc, từ ngày `sinceDay` trở đi. Bộ chưa đọc, chưa có review, hoặc bị bỏ cả bộ thì không có dòng nào; dòng người xem
 * đã bỏ (`da_bo`) cũng không xuất hiện. Chỉ đọc đĩa, không gọi agent.
 */
export function loadLeaveRows(root: string, sinceDay: string): LeaveRowSource[] {
    const out: LeaveRowSource[] = [];
    for (const dir of listBundleDirs(root)) {
        const manifest = readManifest(dir);
        if (!manifest || manifest.day < sinceDay) continue;
        const reading = readJson<BundleReading>(path.join(dir, "reading.json"));
        const review = readJson<Review>(path.join(dir, "review.json"));
        if (!reading || !review || review.dismissed) continue;
        const rows = leaveRowsOf(reading);
        for (const rr of review.rows) {
            if (rr.status === "da_bo") continue;
            const raw = rows[rr.index];
            if (!raw) continue;
            out.push({ bundleId: manifest.bundleId, dir, rowIndex: rr.index, sentTs: manifest.firstTs, sendDay: manifest.day, status: rr.status, raw: finalRow(raw, rr), reasons: rr.reasons, warnings: rr.warnings });
        }
    }
    return out;
}

/** Số bộ ảnh của các nhóm trong `groups` (từ `sinceDay`) chưa có `reading.json` hoặc đang có cờ đọc lại: ảnh đã gửi nhưng chưa được đọc. */
export function countUnreadBundles(root: string, sinceDay: string, groups: string[]): number {
    let n = 0;
    for (const dir of listBundleDirs(root)) {
        const m = readManifest(dir);
        if (!m || m.day < sinceDay || !groups.includes(m.groupName)) continue;
        if (m.reread || !fs.existsSync(path.join(dir, "reading.json"))) n += 1;
    }
    return n;
}
```

- [ ] **Step 7: Viết `src/leave/collect.ts`**

```ts
import { compareYmd, dayNumber, parseIso } from "./dates.js";
import { ngayText } from "./buoi.js";
import { normalizeName } from "./names.js";
import { validateLeaveRow, type ParsedLeave } from "./validate.js";
import type { LeaveRowSource } from "./sources.js";
import type { ReviewStatus } from "../types/index.js";

/** Một kỳ nghỉ còn hiệu lực của một người (đã chọn). `key` là tên đã chuẩn hóa. */
export interface ActiveLeave {
    key: string;
    hoTen: string;
    parsed: ParsedLeave;
    sentTs: number;
    bundleId: string;
    rowIndex: number;
}

/** Một dòng đang chờ người xem (`can_xem`), để báo; chưa dùng cho Excel. */
export interface PendingRow {
    bundleId: string;
    rowIndex: number;
    sentTs: number;
    hoTen: string;
    reasons: string[];
}

export interface CollectResult {
    leaves: ActiveLeave[];
    /** Điều cần người biết nhưng không chặn: kỳ nghỉ bị thay, bị bỏ vì một người nhiều kỳ trong một ảnh, có bản mới hơn đang chờ xem, dòng không đọc được. */
    notes: string[];
    pending: PendingRow[];
}

const USABLE = new Set<ReviewStatus>(["tu_dong_dat", "da_xac_nhan", "da_sua"]);

const period = (l: ActiveLeave): string => ngayText(l.parsed.tu, l.parsed.den);
const samePeriod = (a: ActiveLeave, b: ActiveLeave): boolean =>
    dayNumber(a.parsed.tu) === dayNumber(b.parsed.tu) && dayNumber(a.parsed.den) === dayNumber(b.parsed.den) && a.parsed.tuGio === b.parsed.tuGio && a.parsed.denGio === b.parsed.denGio;

/**
 * Chọn kỳ nghỉ của hôm nay (`today`, `YYYY-MM-DD`) từ mọi dòng đã đọc:
 *  1. chỉ dòng `tu_dong_dat`, `da_xac_nhan`, `da_sua` có ngày kết thúc từ hôm nay trở đi (kỳ nghỉ kết thúc đúng hôm nay vẫn giữ, hôm qua thì bỏ);
 *  2. một người có nhiều kỳ trong CÙNG một ảnh (file chỉ có một ô): giữ kỳ có ngày kết thúc nhỏ nhất, kỳ còn lại ghi vào `notes`;
 *  3. một người có ở nhiều ảnh: lấy ảnh mới nhất; ảnh mới thay một kỳ khác đi thì ghi `notes`; nếu ảnh mới hơn có dòng của người đó còn đang `can_xem`
 *     thì vẫn dùng kỳ tốt cũ và ghi `notes`.
 * Kết quả sắp theo tên đã chuẩn hóa. Hàm thuần.
 */
export function collectLeaves(rows: LeaveRowSource[], today: string, cfg: { maxPastDays: number; maxFutureDays: number }): CollectResult {
    const todayYmd = parseIso(today);
    if (!todayYmd) throw new Error(`collectLeaves: ngày hôm nay không hợp lệ: ${today}`);
    const notes: string[] = [];
    const pending: PendingRow[] = [];
    const candidates: ActiveLeave[] = [];

    for (const r of rows) {
        const name = typeof r.raw.hoTen === "string" ? r.raw.hoTen.trim().replace(/\s+/g, " ") : "";
        if (r.status === "can_xem") {
            pending.push({ bundleId: r.bundleId, rowIndex: r.rowIndex, sentTs: r.sentTs, hoTen: name || "?", reasons: r.reasons });
            continue;
        }
        if (!USABLE.has(r.status)) continue;
        const { parsed } = validateLeaveRow(r.raw, { sendDay: r.sendDay, ...cfg });
        if (!parsed) {
            notes.push(`bỏ dòng ${r.rowIndex} của bộ ${r.bundleId}: không đọc được tên hoặc ngày`);
            continue;
        }
        if (compareYmd(parsed.den, todayYmd) < 0) continue;
        candidates.push({ key: normalizeName(parsed.hoTen), hoTen: parsed.hoTen, parsed, sentTs: r.sentTs, bundleId: r.bundleId, rowIndex: r.rowIndex });
    }

    const perBundle = new Map<string, ActiveLeave[]>();
    for (const c of candidates) {
        const k = `${c.bundleId}|${c.key}`;
        const list = perBundle.get(k);
        if (list) list.push(c);
        else perBundle.set(k, [c]);
    }
    const afterBundle: ActiveLeave[] = [];
    for (const list of perBundle.values()) {
        list.sort((a, b) => compareYmd(a.parsed.den, b.parsed.den) || compareYmd(a.parsed.tu, b.parsed.tu) || a.rowIndex - b.rowIndex);
        afterBundle.push(list[0]);
        for (const dropped of list.slice(1)) notes.push(`${list[0].hoTen}: bộ ${list[0].bundleId} có nhiều kỳ nghỉ nhưng file chỉ có một ô: giữ ${period(list[0])}, bỏ ${period(dropped)} (cần xem)`);
    }

    const perPerson = new Map<string, ActiveLeave[]>();
    for (const c of afterBundle) {
        const list = perPerson.get(c.key);
        if (list) list.push(c);
        else perPerson.set(c.key, [c]);
    }
    const leaves: ActiveLeave[] = [];
    for (const [key, list] of perPerson) {
        list.sort((a, b) => b.sentTs - a.sentTs || b.bundleId.localeCompare(a.bundleId));
        const chosen = list[0];
        leaves.push(chosen);
        for (const older of list.slice(1)) {
            if (!samePeriod(older, chosen)) notes.push(`${chosen.hoTen}: ảnh ${chosen.bundleId} thay kỳ nghỉ ${period(older)} của ảnh ${older.bundleId} bằng ${period(chosen)}`);
        }
        if (pending.some((p) => normalizeName(p.hoTen) === key && p.sentTs > chosen.sentTs)) notes.push(`${chosen.hoTen}: có bản mới hơn đang chờ xem, tạm dùng kỳ nghỉ ${period(chosen)}`);
    }
    leaves.sort((a, b) => a.key.localeCompare(b.key));
    return { leaves, notes, pending };
}
```

- [ ] **Step 8: Viết `src/leave/cells.ts`**

```ts
import { buoiNghi, ngayText } from "./buoi.js";
import { LEAVE_BUOI_COLUMN, LEAVE_NGAY_COLUMN } from "./layout.js";
import { suggestNames } from "./names.js";
import { matchRoster, type RosterRow } from "./roster.js";
import type { ActiveLeave } from "./collect.js";
import type { HeaderCell } from "../lesson/statusReportLayout.js";

export interface LeaveFill {
    /** Các ô cần ghi: với mỗi dòng khớp, ô NGÀY (chữ, `numberFormat "@"`) và ô BUỔI. Không có ô nào khác. */
    headerCells: HeaderCell[];
    filled: Array<{ row: number; name: string; ngay: string; buoi: string }>;
    /** Kỳ nghỉ của người KHÔNG có trong danh sách của file: không điền gì, chỉ báo kèm gợi ý. */
    unmatched: Array<{ hoTen: string; ngay: string; suggestions: string[]; bundleId: string; rowIndex: number }>;
}

/**
 * Dựng các ô cần ghi vào file mẫu. Mỗi dòng của danh sách khớp tên (không dấu, không phân biệt hoa thường) đều được điền: một người có hai dòng (hai chức vụ)
 * được điền cả hai. Hàm thuần; không đọc file.
 */
export function buildLeaveCells(roster: RosterRow[], leaves: ActiveLeave[]): LeaveFill {
    const filled: LeaveFill["filled"] = [];
    const unmatched: LeaveFill["unmatched"] = [];
    for (const leave of leaves) {
        const p = leave.parsed;
        const ngay = ngayText(p.tu, p.den);
        const buoi = buoiNghi({ tu: p.tu, tuGio: p.tuGio, den: p.den, denGio: p.denGio });
        const rows = matchRoster(roster, leave.hoTen);
        if (rows.length === 0) {
            unmatched.push({ hoTen: leave.hoTen, ngay, suggestions: suggestNames(leave.hoTen, roster.map((r) => r.name)), bundleId: leave.bundleId, rowIndex: leave.rowIndex });
            continue;
        }
        for (const r of rows) filled.push({ row: r.row, name: r.name, ngay, buoi });
    }
    filled.sort((a, b) => a.row - b.row);
    const headerCells: HeaderCell[] = filled.flatMap((f) => [
        { ref: `${LEAVE_NGAY_COLUMN}${f.row}`, value: f.ngay, numberFormat: "@" },
        { ref: `${LEAVE_BUOI_COLUMN}${f.row}`, value: f.buoi },
    ]);
    return { headerCells, filled, unmatched };
}
```

- [ ] **Step 9: Viết `src/leave/buildDay.ts`**

```ts
import { createHash } from "node:crypto";
import { addDays } from "../lesson/time.js";
import { buildLeaveCells, type LeaveFill } from "./cells.js";
import { collectLeaves, type PendingRow } from "./collect.js";
import type { RosterRow } from "./roster.js";
import type { LeaveRowSource } from "./sources.js";
import type { HeaderCell } from "../lesson/statusReportLayout.js";

/** Mọi thứ cần từ bên ngoài (đĩa, file mẫu), truyền vào để test được. Bản thật: `realIo.ts`. */
export interface LeaveIO {
    readRoster(): RosterRow[];
    loadRows(sinceDay: string): LeaveRowSource[];
    countUnread(sinceDay: string): number;
}

export interface LeaveDayCfg {
    lookbackDays: number;
    maxPastDays: number;
    maxFutureDays: number;
}

export interface LeaveDay extends LeaveFill {
    /** Điều cần người biết (kỳ nghỉ bị thay, bị bỏ...), không phải lỗi. */
    notes: string[];
    pending: PendingRow[];
    /** Vấn đề cần người xử lý: ảnh chưa đọc, tên không có trong danh sách, dòng chờ xem. */
    warnings: string[];
    /** Chữ ký của các ô sẽ ghi; đổi khi bất kỳ ô nào đổi. */
    signature: string;
}

/** Chữ ký nội dung của các ô sẽ ghi vào file: cùng ô cùng giá trị ra cùng chữ ký; không ô nào cũng có chữ ký riêng. */
export function leaveSignature(cells: HeaderCell[]): string {
    return createHash("sha1").update(JSON.stringify(cells.map((c) => [c.ref, c.value]))).digest("hex");
}

/**
 * Mọi thứ của báo cáo nghỉ phép cho MỘT ngày `day` (`YYYY-MM-DD`): đọc danh sách tên, các dòng đã đọc trong `lookbackDays` ngày gần nhất, chọn kỳ nghỉ còn hiệu
 * lực, dựng các ô cần ghi cùng cảnh báo. Một đường duy nhất cho `fill:leave-report`, `bot:total` và `leave:show`. Có thể ném lỗi (ví dụ thiếu file mẫu): người gọi
 * quyết định coi đó là lỗi hay cảnh báo.
 */
export function leaveForDay(day: string, io: LeaveIO, cfg: LeaveDayCfg): LeaveDay {
    const roster = io.readRoster();
    const sinceDay = addDays(day, -cfg.lookbackDays);
    const collected = collectLeaves(io.loadRows(sinceDay), day, cfg);
    const fill = buildLeaveCells(roster, collected.leaves);
    const warnings: string[] = [];
    const unread = io.countUnread(sinceDay);
    if (unread > 0) warnings.push(`${unread} bộ ảnh nghỉ phép chưa đọc`);
    for (const u of fill.unmatched) {
        const near = u.suggestions.length > 0 ? `, gần giống: ${u.suggestions.join(", ")}` : "";
        warnings.push(`${u.hoTen} (${u.ngay}) không có trong danh sách của file mẫu${near}; sửa tên bằng: npm run photos:review -- --bundle ${u.bundleId} --row ${u.rowIndex} --fix hoTen=...`);
    }
    if (collected.pending.length > 0) warnings.push(`${collected.pending.length} dòng nghỉ phép đang chờ xem (npm run photos:review -- --list)`);
    return { ...fill, notes: collected.notes, pending: collected.pending, warnings, signature: leaveSignature(fill.headerCells) };
}
```

- [ ] **Step 10: Viết `src/leave/realIo.ts`**

```ts
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import type { LeaveIO } from "./buildDay.js";
import { LEAVE_LAYOUT } from "./layout.js";
import { readRoster } from "./roster.js";
import { countUnreadBundles, loadLeaveRows } from "./sources.js";

/** Bản thật của `LeaveIO`: danh sách tên đọc từ file mẫu ở `data/mau bao cao new`, các dòng đọc từ `data/photo-reports`. */
export function realLeaveIO(): LeaveIO {
    const root = photoReportsDir(config.dataDir);
    return {
        readRoster: () => readRoster(path.join(config.dataDir, "mau bao cao new", LEAVE_LAYOUT.templateFile), LEAVE_LAYOUT.sheet),
        loadRows: (sinceDay) => loadLeaveRows(root, sinceDay),
        countUnread: (sinceDay) => countUnreadBundles(root, sinceDay, config.vision.leave.groups),
    };
}
```

- [ ] **Step 11: Chạy test**

Run: `node --import tsx --test tests/leaveSources.test.ts tests/leaveCollect.test.ts tests/leaveCells.test.ts tests/leaveDay.test.ts` rồi `npm run typecheck`
Expected: PASS.

Nếu test "a newer row that is still waiting" lệch: dòng `new` có status `can_xem` nên không vào `candidates`, `pending[0].sentTs` là 2000 lớn hơn `chosen.sentTs` 1000, nên ghi chú "có bản mới hơn đang chờ xem" xuất hiện; không cần sửa gì khác.

- [ ] **Step 12: Commit**

```bash
git add src/leave/sources.ts src/leave/collect.ts src/leave/cells.ts src/leave/buildDay.ts src/leave/realIo.ts tests/leaveSources.test.ts tests/leaveCollect.test.ts tests/leaveCells.test.ts tests/leaveDay.test.ts
git commit -m "feat(leave): chọn kỳ nghỉ còn hiệu lực, dựng ô Excel (điền cả hai dòng của người trùng tên) và gói cho một ngày" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Lệnh `fill:leave-report` và thử với Excel thật

**Files:**
- Create: `src/cli/fill-leave-report.ts`
- Modify: `package.json` (thêm `"fill:leave-report": "tsx src/cli/fill-leave-report.ts",` sau dòng `"photos:review"`), `config.ts` (thêm `"leave"` vào `reportSets`)

**Interfaces:**
- Consumes: `leaveForDay` (Task 12), `realLeaveIO` (Task 12), `LEAVE_LAYOUT`, `leaveBuiltPath`, `leaveNeedsRebuild`, `readLeaveBuilt`, `writeLeaveBuilt` (Task 11), `runFillReplacingSameDay` (`src/lesson/excelFill.ts`), `freeFormFileName`, `readTemplateTitle` (`src/lesson/statusReportLayout.ts`), `setReportDir`, `loadReportSets`, `pickSet`, `requireKey`, `logSetProblems`.
- Produces: lệnh `npm run fill:leave-report -- [--set <id>] [--now <unix ms>] [--force]`.

- [ ] **Step 1: Thêm `"leave"` vào bộ báo cáo của `config.ts`**

Đổi dòng trong `reportSets`:

```ts
        { id: "Như", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance", "leave"] },
```

(Mã `leave` chưa có chu trình nào dựng nó cho tới Task 14; bot vẫn chạy bình thường.)

- [ ] **Step 2: Viết `src/cli/fill-leave-report.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { setReportDir } from "../core/paths.js";
import { leaveForDay } from "../leave/buildDay.js";
import { LEAVE_LAYOUT } from "../leave/layout.js";
import { leaveBuiltPath, leaveNeedsRebuild, readLeaveBuilt, writeLeaveBuilt } from "../leave/leaveState.js";
import { realLeaveIO } from "../leave/realIo.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { hhmmVietnam, todayVietnam } from "../lesson/time.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";

/**
 * Điền file LỊCH NGHỈ PHÉP KỸ THUẬT của HÔM NAY từ các ảnh nghỉ phép đã đọc (`data/photo-reports`): mỗi NGÀY MỘT FILE
 * `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` trong `<statusExportDir>/<yyMM>/<yyMMdd>/<bộ>/`. Chỉ ghi cột NGÀY (chữ) và BUỔI của dòng khớp tên (điền tại chỗ,
 * `inPlace`); mọi ô khác của mẫu giữ nguyên. Chạy một lần mỗi chu trình `bot:runner` sau bước đọc ảnh (`photos:auto`). Chỉ dựng lại khi NỘI DUNG các ô đổi so với lần
 * dựng trước của ngày (`data/.leave-report.<id>.json`): có ảnh mới, người xem sửa dòng, kỳ nghỉ kết thúc thì ra file mới với giờ mới và bản cũ trong ngày bị thay;
 * không có gì mới thì không làm gì. Ngày chưa có kỳ nghỉ nào còn hiệu lực KHÔNG dựng file riêng (báo cáo tổng vẫn xuất file nghỉ phép rỗng). Không gọi agent.
 *
 *   npm run fill:leave-report -- [--set <id>] [--now <unix ms>] [--force]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    requireKey(set, "leave");
    const now = Number(option("--now") ?? Date.now());
    const day = todayVietnam(now);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const force = process.argv.includes("--force");

    const result = leaveForDay(day, realLeaveIO(), config.vision.leave);
    for (const w of result.warnings) console.warn(`[fill-leave-report] ${w}`);
    for (const n of result.notes) console.warn(`[fill-leave-report] ${n}`);

    if (result.filled.length === 0 && !force) {
        console.log(`[fill-leave-report] bộ ${set.id}, ngày ${day}: không có kỳ nghỉ nào còn hiệu lực để điền, không dựng file riêng`);
        return;
    }
    const stateFile = leaveBuiltPath(set.id);
    const prev = readLeaveBuilt(stateFile);
    if (!force && !leaveNeedsRebuild(prev, day, result.signature, (name) => fs.existsSync(path.join(outDir, name)))) {
        console.log(`[fill-leave-report] bộ ${set.id}, ngày ${day}: không có dữ liệu nghỉ phép mới, giữ nguyên ${prev!.file}`);
        return;
    }

    fs.mkdirSync(outDir, { recursive: true });
    const title = readTemplateTitle(path.join(templatesSrc, LEAVE_LAYOUT.templateFile), LEAVE_LAYOUT.sheet);
    const outName = freeFormFileName(title, day, hhmmVietnam(now));
    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ và không cập nhật trạng thái.
    runFillReplacingSameDay({ name: "leave", templatesSrc, layout: LEAVE_LAYOUT, outDir, outName, rows: [], headerCells: result.headerCells, formulaCells: [] }, `${title}_${yyMMdd}_T`);
    writeLeaveBuilt({ day, signature: result.signature, file: outName }, stateFile);
    console.log(`[fill-leave-report] bộ ${set.id}, ngày ${day}: ${result.filled.length} dòng -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
```

Thêm vào `package.json` scripts, sau dòng `"photos:review"`: `"fill:leave-report": "tsx src/cli/fill-leave-report.ts",`.

- [ ] **Step 3: Kiểm tra kiểu và chạy lúc chưa có dữ liệu**

Run: `npm run typecheck` rồi `npx tsx src/cli/fill-leave-report.ts`
Expected: in `không có kỳ nghỉ nào còn hiệu lực để điền, không dựng file riêng` (chưa có bộ ảnh nào đã đọc). Nếu báo thiếu file mẫu, chép `LICH NGHI PHEP KY THUAT.xlsx` vào `data/mau bao cao new/`.

- [ ] **Step 4: Thử thật với Excel (cần Excel trên máy; không gọi agent)**

Tạo file tạm `.leave-demo-tmp.ts` ở gốc repo (xoá sau khi thử) với nội dung:

```ts
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { photoReportsDir } from "./src/core/paths.js";
import { addDays, vietnamDay } from "./src/lesson/time.js";
import { reviewLeave } from "./src/leave/review.js";
import { loadRules } from "./src/vision/rules.js";

const now = Date.now();
const today = vietnamDay(now);
const tomorrow = addDays(today, 1);
const wd = (iso: string): number => new Date(`${iso}T00:00:00Z`).getUTCDay() + 1;
const row = { hoTen: "Huỳnh Hữu Đức", tuGio: "8:00", tuThu: wd(tomorrow), tuNgay: tomorrow, denGio: "18:00", denThu: wd(tomorrow), denNgay: tomorrow, soNgay: wd(tomorrow) === 1 ? 0 : 1, lyDo: "Thử" };
const id = `demo-${now}`;
const dir = path.join(photoReportsDir(config.dataDir), today, "gdemo", id);
fs.mkdirSync(dir, { recursive: true });
const manifest = { version: 1, bundleId: id, day: today, status: "closed", groupId: "gdemo", groupName: "bot test", school: { tenTruong: "", khuVuc: "" }, sender: { id: "u", name: "Demo" }, firstTs: now, lastTs: now, texts: [], images: [{ seq: 1, msgId: "m1", ts: now, source: "x.jpg", file: "01.jpg" }] };
const f = (value: unknown) => ({ value, doTinCay: "cao" });
const reading = { bundleId: id, readAt: now, reader: { kind: "claude-p", model: "demo", promptVersion: "1", ruleVersions: { leave: 1 } }, images: [{ seq: 1, loai: "leave", doTinCay: "cao" }], extracted: { leave: { ngayBaoCao: f(today), nguoiBaoCao: f("Demo"), boPhan: f("Nhân sự"), dong: f([row]) } } };
const review = reviewLeave({ rules: loadRules(), manifest: manifest as never, first: reading as never, second: null, cfg: config.vision.leave });
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(dir, "reading.json"), JSON.stringify(reading, null, 2));
fs.writeFileSync(path.join(dir, "review.json"), JSON.stringify(review, null, 2));
console.log(`demo: ${dir}\nstatus ${review.status}, ngày nghỉ ${tomorrow}`);
```

Run: `npx tsx .leave-demo-tmp.ts` rồi `npx tsx src/cli/fill-leave-report.ts --force`
Expected: in `bộ Như, ngày <hôm nay>: 1 dòng -> ...\LỊCH NGHỈ PHÉP KỸ THUẬT_<yyMMdd>_T<thứ>_<HHmm>.xlsx`.

Kiểm file bằng cách đọc lại (tạo `.leave-check-tmp.ts`):

```ts
import XLSX from "xlsx";
const ws = XLSX.readFile(process.argv[2]).Sheets["BAO CAO"];
for (const ref of ["B4", "E4", "F4", "D4", "G4", "J4", "E5", "F5"]) console.log(ref, JSON.stringify(ws[ref]?.v ?? null));
```

Run: `npx tsx .leave-check-tmp.ts "<đường dẫn file vừa tạo>"`
Expected: `E4` là `"Cả ngày"`, `F4` là ngày mai dạng `"dd/MM/yyyy"` (chữ), `D4` (SỐ NGÀY, công thức) là `1` (hoặc `0` nếu ngày mai là Chủ nhật), `J4` là `1` (K/C = ngày mai trừ hôm nay), `E5` và `F5` rỗng (`null`). Nếu `D4` là `#VALUE!` hoặc số lạ thì định dạng ngày của Windows trên máy này không phải `dd/MM/yyyy`: ghi lại và báo người dùng (xem spec mục 13), đừng tiếp tục.

Chạy lại không đổi: `npx tsx src/cli/fill-leave-report.ts` (không `--force`). Expected: `không có dữ liệu nghỉ phép mới, giữ nguyên <tên file>`.

Dọn: xoá `.leave-demo-tmp.ts`, `.leave-check-tmp.ts`, thư mục `data/photo-reports/<hôm nay>/gdemo`, file `.xlsx` vừa tạo và `data/.leave-report.Như.json`. (Liệt kê bằng `ls` trước khi xoá, chỉ xoá đúng các thứ vừa tạo.)

- [ ] **Step 5: Commit**

```bash
git add src/cli/fill-leave-report.ts package.json config.ts
git commit -m "feat(leave): lệnh fill:leave-report điền cột NGÀY và BUỔI vào file nghỉ phép" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---
### Task 14: Nối vào `bot:total`, in, `bot:runner` và tài liệu

**Files:**
- Create: `tests/totalLeave.test.ts`
- Modify: `src/total/runTotal.ts`, `src/total/realDeps.ts`, `src/runner/steps.ts`, `src/config/configDoc.ts`, `src/cli/bot-total.ts`, `src/cli/total-once.ts`, `CLAUDE.md`, `README.md`, `SKILLS-Agent/du-lieu-dau-ra/SKILL.md`, `SKILLS-Agent/du-lieu-dau-ra/references/cot-tung-file.md`, `SKILLS-Agent/cau-hinh-nguoi-phu-trach/SKILL.md` (và `.claude/skills/` qua `skills:sync`)

**Interfaces:**
- Consumes: `LeaveDay`, `leaveForDay` (Task 12), `realLeaveIO` (Task 12), `LEAVE_LAYOUT` (Task 11), `TotalDeps`, `runTotalOnce` (`src/total/runTotal.ts`).
- Produces: `TotalDeps.leave?(day: string): LeaveDay`; đầu ra thứ 8 `leave` của `runTotalOnce` (cuối thứ tự xuất và in); bước đọc ảnh rồi `fill-leave-report.ts` trong `buildExtras` của runner.

- [ ] **Step 1: Viết test (đỏ)** `tests/totalLeave.test.ts`

```ts
import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveReportSets } from "../src/reportSets/resolve.js";
import { runTotalOnce, type TotalDeps } from "../src/total/runTotal.js";
import { slotsOfDay } from "../src/total/slots.js";
import { DAY, at } from "./fixtures.js";
import type { LeaveDay } from "../src/leave/buildDay.js";
import type { FillTemplateArgs } from "../src/lesson/excelFill.js";

const [morning] = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const SEVEN = ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"];
const WITH = resolveReportSets([{ id: "A", reports: [...SEVEN, "leave"] }]).active[0];
const WITHOUT = resolveReportSets([{ id: "A", reports: SEVEN }]).active[0];
const fakeTitle = (templatePath: string, sheet: string): string => `T:${path.basename(templatePath, ".xlsx")}:${sheet}`;

const stub = (over: Partial<LeaveDay> = {}): LeaveDay => ({
    headerCells: [
        { ref: "F4", value: "08/10/2026", numberFormat: "@" },
        { ref: "E4", value: "Cả ngày" },
        { ref: "F6", value: "08/10/2026", numberFormat: "@" },
        { ref: "E6", value: "Cả ngày" },
    ],
    filled: [{ row: 4, name: "A", ngay: "08/10/2026", buoi: "Cả ngày" }, { row: 6, name: "B", ngay: "08/10/2026", buoi: "Cả ngày" }],
    unmatched: [],
    notes: ["ảnh mới thay kỳ nghỉ cũ"],
    pending: [],
    warnings: ["1 bộ ảnh nghỉ phép chưa đọc"],
    signature: "s",
    ...over,
});

function setup(over: Partial<TotalDeps> = {}, failName?: string) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "total-leave-"));
    const calls: FillTemplateArgs[] = [];
    const deps: TotalDeps = {
        loadMessages: async () => [],
        readOverrides: () => [],
        fill: (a) => {
            if (a.name === failName) throw new Error("Excel lỗi");
            calls.push(a);
            return "";
        },
        templateTitle: fakeTitle,
        templatesSrc: "C:\\mau",
        outDirFor: () => dir,
        trackerFile: path.join(dir, "tracker.json"),
        removeFile: () => undefined,
        ...over,
    };
    return { calls, deps };
}

test("a set with the leave code writes it as the 8th file, filled in place with the cells of that day", async () => {
    const { calls, deps } = setup({ leave: () => stub() });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.deepEqual(calls.map((c) => c.name), [...SEVEN.map((k) => `total-${k}`), "total-leave"]);
    const leave = calls[7];
    assert.equal(leave.layout.inPlace, true);
    assert.deepEqual(leave.rows, []);
    assert.deepEqual(leave.headerCells, stub().headerCells);
    assert.ok(leave.outName.startsWith("T:LICH NGHI PHEP KY THUAT:BAO CAO_"), leave.outName);
    assert.ok(leave.outName.endsWith("_0907-auto.xlsx"));
    assert.equal(result.counts.leave, 2);
    assert.deepEqual(result.failed, []);
    assert.equal(result.expected, 8);
    assert.deepEqual(result.written[7], { name: "leave", file: path.join(path.dirname(result.written[0].file), leave.outName), sheet: "BAO CAO", rows: 2 });
    assert.ok(result.warnings.includes("1 bộ ảnh nghỉ phép chưa đọc"));
    assert.ok(result.warnings.includes("ảnh mới thay kỳ nghỉ cũ"));
});

test("with no leave at all the file is still written, with no cells", async () => {
    const { calls, deps } = setup({ leave: () => stub({ headerCells: [], filled: [], notes: [], warnings: [] }) });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.equal(calls.length, 8);
    assert.deepEqual(calls[7].headerCells, []);
    assert.equal(result.counts.leave, 0);
});

test("a leave source that throws costs only a warning: the file is written empty and the other 7 are untouched", async () => {
    const { calls, deps } = setup({ leave: () => { throw new Error("thiếu file mẫu"); } });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.equal(calls.length, 8);
    assert.deepEqual(calls[7].headerCells, []);
    assert.deepEqual(result.failed, []);
    assert.ok(result.warnings.some((w) => /leave: thiếu file mẫu/.test(w)));
});

test("without a leave source the file is still written empty", async () => {
    const { calls, deps } = setup();
    await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.equal(calls.length, 8);
    assert.deepEqual(calls[7].headerCells, []);
});

test("a set without the leave code gets exactly the 7 files, even when a leave source exists", async () => {
    const { calls, deps } = setup({ leave: () => stub() });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITHOUT }, deps);
    assert.equal(calls.length, 7);
    assert.ok(!calls.some((c) => c.name === "total-leave"));
    assert.equal(result.counts.leave, undefined);
});

test("when the leave file itself fails to fill, it is the only failure", async () => {
    const { calls, deps } = setup({ leave: () => stub() }, "total-leave");
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: WITH }, deps);
    assert.deepEqual(result.failed, ["leave"]);
    assert.equal(calls.length, 7);
    assert.equal(result.files.length, 7);
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/totalLeave.test.ts`
Expected: FAIL (`deps.leave` chưa có trong `TotalDeps`; chưa có đầu ra `leave`).

- [ ] **Step 3: Sửa `src/total/runTotal.ts`**

Bảy chỗ sửa (dùng công cụ Edit, từng chỗ một):

(a) Thêm hai import, ngay sau dòng `import type { FillTemplateArgs } from "../lesson/excelFill.js";`:

```ts
import type { LeaveDay } from "../leave/buildDay.js";
import { LEAVE_LAYOUT } from "../leave/layout.js";
```

(b) Trong `interface TotalDeps`, thêm sau dòng `    onProgress?(): void;`:

```ts
    /**
     * Dữ liệu LỊCH NGHỈ PHÉP của ngày `day`, dựng từ KẾT QUẢ ĐÃ ĐỌC trên đĩa (không bao giờ gọi agent); chỉ dùng khi bộ bật mã `leave`. Không khai hoặc ném lỗi thì file
     * nghỉ phép vẫn được xuất (không ô nào được điền; lỗi thành cảnh báo), nên một lỗi đọc dữ liệu nghỉ phép không làm mất 7 file kia.
     */
    leave?(day: string): LeaveDay;
```

(c) Trong `interface Output`, thêm sau dòng `    formulaCells: FormulaCell[];`:

```ts
    /** Số dòng đã điền khi `rows` rỗng vì điền tại chỗ (nghỉ phép); thiếu thì dùng `rows.length`. */
    count?: number;
```

(d) Trong `runTotalOnce`, ngay sau dòng `const attendanceRows = buildAttendanceRows(...);` thêm:

```ts
    let leave: LeaveDay | null = null;
    const leaveWarnings: string[] = [];
    if (set.reports.includes("leave") && deps.leave) {
        try {
            leave = deps.leave(day);
        } catch (err) {
            leaveWarnings.push(`leave: ${(err as Error).message}`);
        }
    }
```

(e) Trong mảng `outputs`, thêm phần tử cuối (sau phần tử `attendance`, trước dấu `];`):

```ts
        { name: "leave", layout: LEAVE_LAYOUT, rows: [], headerCells: leave?.headerCells ?? [], formulaCells: [], count: leave?.filled.length ?? 0 },
```

(f) Ngay sau dòng khai báo `const result: TotalRunResult = { ... };` thêm:

```ts
    result.warnings.push(...leaveWarnings, ...(leave?.warnings ?? []), ...(leave?.notes ?? []));
```

(g) Thay `result.counts[o.name] = o.rows.length;` bằng `result.counts[o.name] = o.count ?? o.rows.length;`, và trong `result.written.push({ ... })` thay `rows: o.rows.length` bằng `rows: o.count ?? o.rows.length`.

Cũng đổi các chú thích "7 file" trong file này (dòng `expected?`, mô tả `runTotalOnce`) thành "8 file".

- [ ] **Step 4: Sửa `src/total/realDeps.ts`**

Thêm import:

```ts
import { leaveForDay } from "../leave/buildDay.js";
import { realLeaveIO } from "../leave/realIo.js";
```

và thêm vào object trả về của `realTotalDeps()`, sau `removeFile`:

```ts
        leave: (day) => leaveForDay(day, realLeaveIO(), config.vision.leave),
```

- [ ] **Step 5: Sửa `src/runner/steps.ts` (`buildExtras`)**

Thay khối `scripts` và vòng lặp bằng:

```ts
            const scripts: Array<[ReportKey, string, string]> = [
                ["cleaning", "fill-cleaning-report.ts", "vệ sinh"],
                ["attendance", "fill-attendance-report.ts", "vi phạm"],
                ["dien", "fill-electric-report.ts", "điện"],
                ["leave", "fill-leave-report.ts", "nghỉ phép"],
            ];
            for (const [key, script, label] of scripts) {
                if (!set.dayKeys.includes(key)) continue;
                if (key === "leave") {
                    // Đọc ảnh nghỉ phép TRƯỚC khi điền file. `photos-auto` không làm gì khi config.vision.enabled là false; lỗi đọc ảnh (chưa đăng nhập claude, quá giờ)
                    // chỉ là cảnh báo của chu trình: file nghỉ phép vẫn được dựng từ những gì đã đọc.
                    const photos = await runScript("photos-auto.ts", []);
                    if (photos.code !== 0) warnings.push(`${set.id}: đọc ảnh nghỉ phép: thoát mã ${photos.code}: ${tail(photos.output)}`);
                }
                const r = await runScript(script, ["--set", set.id]);
                if (r.code !== 0) warnings.push(`${set.id}: fill-${label}: thoát mã ${r.code}: ${tail(r.output)}`);
            }
```

(Phần còn lại của hàm giữ nguyên, kết thúc bằng `return warnings;`.)

- [ ] **Step 6: Sửa chú thích và mô tả cấu hình**

- `src/config/configDoc.ts`: trong mục `reportSets`, đổi `defaultLabel: "một bộ NguyenVanA với đủ 7 loại"` thành `"một bộ NguyenVanA với đủ 8 loại"`.
- `src/cli/bot-total.ts` (dòng chú thích về "xuất 7 file") và `src/cli/total-once.ts` (dòng 13 "Xuất 7 file báo cáo tổng"): đổi thành 8 file, thêm ", NGHỈ PHÉP" vào danh sách khi có.

- [ ] **Step 7: Chạy test**

Run: `node --import tsx --test tests/totalLeave.test.ts` rồi `npm run typecheck` rồi `npm test`
Expected: PASS toàn bộ. Test cũ của `bot:total` (`totalRun.test.ts` và bạn bè) khai tường minh bảy mã nên vẫn ra 7 file.

- [ ] **Step 8: Cập nhật tài liệu và skill**

`CLAUDE.md` (mục "Commands", sau dòng `fill:electric-report`) thêm:

```
npm run fill:leave-report -- [--set <id>] [--now <unix ms>] [--force]   # LỊCH NGHỈ PHÉP KỸ THUẬT của TODAY từ các ảnh nghỉ phép đã đọc (data/photo-reports): ONE file per day, điền TẠI CHỖ (inPlace) chỉ cột NGÀY (chữ dd/MM/yyyy hoặc "từ - đến") và BUỔI (Sáng, Chiều, Cả ngày, "Chiều - Cả ngày"...) của dòng khớp tên trong cột NHÂN VIÊN của mẫu (không dấu, không phân biệt hoa thường; người có hai dòng được điền cả hai), mọi ô khác giữ nguyên; rebuilt only when the cells changed (data/.leave-report.<id>.json); no file of its own when no leave is active (bot:total vẫn xuất file rỗng); never calls the agent
npm run photos:bundle -- [--day D] [--from-dir <thư mục>]   # gom ảnh (chat.photo) của config.vision.leave.groups thành bộ ảnh: cùng người gửi, mỗi ảnh cách ảnh trước <= vision.bundle.gapMinutes; bộ đóng sau vision.leave.settleSeconds; ghi data/photo-reports/<ngày>/<nhóm>/<mã bộ>/{manifest.json, 01.jpg ...}; --from-dir gom cả một thư mục ảnh rời thành một bộ (bộ ảnh mẫu)
npm run photos:read -- [--day D] [--bundle <mã bộ>] [--again] [--dry-run]   # đọc các bộ đã đóng chưa đọc bằng `claude -p` (vision.model, mặc định Haiku 4.5): một lần gọi cho cả bộ, luật photo-rules/leave.json; review theo dòng (luật cứng, kiểm chứng chéo THỨ và SỐ NGÀY, đọc lần hai khi tin cậy thấp hoặc có dòng nghi ngờ) -> reading.json, review.json; TỐN hạn mức subscription, tối đa vision.maxBundlesPerRun bộ mỗi lần
npm run photos:auto                              # bước đọc ảnh của chu trình bot:runner (và today): gom rồi đọc; không làm gì khi config.vision.enabled là false
npm run photos:review -- [--list] [--bundle <mã> [--row N (--confirm | --fix cột=giá_trị ... | --discard)] [--discard-bundle]]   # người xem từng dòng nghỉ phép (da_xac_nhan | da_sua | da_bo); cũng dùng để sửa một tên chưa khớp danh sách
npm run photos:golden -- [--rule leave] [--case <tên>]   # đo độ chính xác trên photo-golden/<luật>.json; chạy tay, tốn hạn mức, in cả số chỗ SAI MÀ VẪN tu_dong_dat
npm run leave:show -- [--day D]                  # in danh sách kỳ nghỉ sẽ được điền (dòng Excel, NGÀY, BUỔI), tên chưa khớp danh sách kèm gợi ý, dòng chờ xem và ghi chú; không ghi gì
```

Và đoạn mô tả sau đoạn `**bot:total** is the fifth process`:

```
**Báo cáo nghỉ phép (mã `leave`, `src/leave/`, `src/vision/`)**: nhân sự gửi ẢNH "KỸ THUẬT NGHỈ PHÉP ĐÃ DUYỆT" (không có tiêu đề) vào nhóm; chỉ các nhóm ở `config.vision.leave.groups` được đọc (ảnh nhóm khác không bao giờ đưa cho agent). `bot:runner` chạy `photos-auto` (gom ảnh, đọc bằng `claude -p`, chỉ khi `vision.enabled`) rồi `fill-leave-report` ở cuối chu trình; `bot:total` chỉ đọc kết quả đã có và xuất file nghỉ phép làm file thứ 8 (cuối thứ tự xuất và in). Danh sách tên đọc từ file mẫu mỗi lần (sửa mẫu là danh sách đổi theo); dòng nghi ngờ để trống và chờ `photos:review`. Điền tại chỗ nhờ cờ `FileLayout.inPlace` của `scripts/fill-status-template.ps1`. Công thức SỐ NGÀY và K/C của mẫu đọc cột NGÀY bằng `VALUE` nên Windows phải đặt định dạng ngày `dd/MM/yyyy`. Thiết kế: `docs/superpowers/specs/2026-10-07-lich-nghi-phep-design.md`; kế hoạch: `docs/superpowers/plans/2026-10-07-lich-nghi-phep.md`.
```

Đổi mọi câu của `CLAUDE.md` nói "7 status files" hoặc liệt kê bảy mã thành tám (`grep -n "7 status\|7 report\|attendance" CLAUDE.md`), thêm `leave` vào danh sách mã báo cáo ở đoạn "Report sets" và "NGHỈ PHÉP" vào thứ tự xuất và in.

`README.md`: ở ví dụ `reportSets` (dòng có `"attendance"]`) thêm `, "leave"`; thêm một mục ngắn "Báo cáo nghỉ phép (đọc ảnh)" mô tả: gửi ảnh vào nhóm trong `vision.leave.groups`, bật `vision.enabled`, `bot:watch` phải chạy để ảnh được lưu (tin `chat.photo` lấy từ khung WebSocket), kiểm bằng `leave:show`, sửa bằng `photos:review`, máy mới phải đặt định dạng ngày Windows `dd/MM/yyyy`.

Skill (đọc `SKILLS-Agent/FORMAT.md` trước và giữ đúng khuôn):
- `SKILLS-Agent/du-lieu-dau-ra/SKILL.md`: đổi "7 file Excel" thành "8 file Excel" (mô tả đầu file), "một trong 7 mã" thành "một trong 8 mã", tiêu đề "Bảng 7 mã" thành "Bảng 8 mã", "Mong đợi: 7 dòng" thành "8 dòng", câu hỏi cần có thêm ", NGHỈ PHÉP", và thêm một dòng vào bảng mã:

```
| leave | LỊCH NGHỈ PHÉP KỸ THUẬT | LICH NGHI PHEP KY THUAT.xlsx | BAO CAO | ẢNH NGHỈ PHÉP (không có tiêu đề) | day |
```

- `SKILLS-Agent/du-lieu-dau-ra/references/cot-tung-file.md`: thêm phần `## leave (sheet BAO CAO)`: bảng ghi rõ bot chỉ ghi cột F (NGÀY, chữ) và E (BUỔI) của dòng khớp tên ở cột B; cột A (STT), B, C (CHỨC VỤ), D (SỐ NGÀY), G (XẾP LOẠI), H (GHI CHÚ), I, J (K/C) là công thức hoặc chữ có sẵn của mẫu, bot không ghi; nguồn `src/leave/cells.ts`, `src/leave/buoi.ts`.
- `SKILLS-Agent/cau-hinh-nguoi-phu-trach/SKILL.md`: dòng 20 đổi "7 dòng mã báo cáo" thành "8 dòng mã báo cáo".

Chạy: `npm run skills:sync` rồi `npm run skills:check`. Expected: `skills:check` thoát 0 (nếu báo vi phạm khuôn của `FORMAT.md`, sửa đúng chỗ được nêu).

- [ ] **Step 9: Chạy toàn bộ kiểm tra**

Run: `npm run typecheck` rồi `npm test`
Expected: PASS toàn bộ, kể cả test đồng bộ skill.

- [ ] **Step 10: Commit**

```bash
git add src/total src/runner/steps.ts src/config/configDoc.ts src/cli/bot-total.ts src/cli/total-once.ts tests/totalLeave.test.ts CLAUDE.md README.md SKILLS-Agent .claude/skills
git commit -m "feat(leave): báo cáo nghỉ phép là file thứ 8 của báo cáo tổng và đợt in, đọc ảnh và điền file trong chu trình runner" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: `leave:show`, đáp án mẫu `photos:golden` và kiểm tra cuối

**Files:**
- Create: `src/leave/show.ts`, `src/cli/leave-show.ts`, `src/vision/golden.ts`, `src/cli/photos-golden.ts`, `photo-golden/leave.json`, `tests/leaveShow.test.ts`, `tests/photoGolden.test.ts`
- Modify: `package.json` (thêm `"leave:show": "tsx src/cli/leave-show.ts",` và `"photos:golden": "tsx src/cli/photos-golden.ts",` sau dòng `"fill:leave-report"`), `docs/superpowers/specs/2026-10-07-lich-nghi-phep-design.md`

**Interfaces:**
- Consumes: `LeaveDay`, `leaveForDay` (Task 12); `realLeaveIO`; `Review`, `BundleReading`; `flattenReading`, `norm` (Task 8); `reviewLeave`, `leaveRowsOf` (Task 8); `processBundle` (Task 9); `draftFromFiles`, `writeBundle` (Tasks 4, 5); `makeClaudeReader` (Task 6); `loadRules` (Task 2); `validateLeaveRow` (Task 8).
- Produces:
  - `formatLeaveDay(day: string, d: LeaveDay): string[]` (`src/leave/show.ts`)
  - `interface GoldenCase { name: string; files: string[]; loai: Record<string, string>; extracted: Record<string, Record<string, unknown>> }`, `interface GoldenFile { sourceDir: string; cases: GoldenCase[] }`, `loadGolden(file: string): GoldenFile`, `interface CaseScore { name: string; classes: { ok: number; total: number }; fields: Array<{ path: string; expected: unknown; actual: unknown; ok: boolean }>; status: string; wrongButAuto: number }`, `scoreCase(c: GoldenCase, imageFiles: string[], reading: BundleReading, review: Review): CaseScore`, `summarize(scores: CaseScore[]): { classAccuracy: number; fieldAccuracy: number; wrongButAuto: number; needReview: number }`

- [ ] **Step 1: Viết test `leave:show`** `tests/leaveShow.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLeaveDay } from "../src/leave/show.js";
import type { LeaveDay } from "../src/leave/buildDay.js";

const empty = (): LeaveDay => ({ headerCells: [], filled: [], unmatched: [], notes: [], pending: [], warnings: [], signature: "s" });

test("nothing to fill says so plainly", () => {
    assert.deepEqual(formatLeaveDay("2026-10-07", empty()), ["Ngày 2026-10-07: không có kỳ nghỉ nào còn hiệu lực để điền."]);
});

test("filled rows, names missing from the roster, rows waiting for review, notes and warnings are all listed", () => {
    const d: LeaveDay = {
        ...empty(),
        filled: [{ row: 4, name: "Huỳnh Hữu Đức", ngay: "08/10/2026", buoi: "Cả ngày" }, { row: 6, name: "Đinh Đình Chinh", ngay: "08/10/2026 - 10/10/2026", buoi: "Chiều - Cả ngày" }],
        unmatched: [{ hoTen: "Đinh Chinh", ngay: "08/10/2026", suggestions: ["Đinh Đình Chinh"], bundleId: "b1", rowIndex: 2 }],
        pending: [{ bundleId: "b2", rowIndex: 0, sentTs: 1, hoTen: "Chờ Xem", reasons: ["ngày bắt đầu không đọc được"] }],
        notes: ["ảnh mới thay kỳ nghỉ cũ"],
        warnings: ["1 bộ ảnh nghỉ phép chưa đọc"],
    };
    const text = formatLeaveDay("2026-10-07", d).join("\n");
    assert.match(text, /2 dòng sẽ được điền/);
    assert.match(text, /dòng 4 Huỳnh Hữu Đức: NGÀY 08\/10\/2026 \| BUỔI Cả ngày/);
    assert.match(text, /dòng 6 Đinh Đình Chinh: NGÀY 08\/10\/2026 - 10\/10\/2026 \| BUỔI Chiều - Cả ngày/);
    assert.match(text, /Chưa khớp danh sách.*Đinh Chinh.*gần giống: Đinh Đình Chinh.*bộ b1, dòng 2/s);
    assert.match(text, /Đang chờ xem.*Chờ Xem.*ngày bắt đầu không đọc được/s);
    assert.match(text, /ảnh mới thay kỳ nghỉ cũ/);
    assert.match(text, /1 bộ ảnh nghỉ phép chưa đọc/);
});
```

- [ ] **Step 2: Viết test đáp án mẫu** `tests/photoGolden.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadGolden, scoreCase, summarize, type GoldenCase } from "../src/vision/golden.js";
import { reviewLeave } from "../src/leave/review.js";
import { validateLeaveRow } from "../src/leave/validate.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveReadingOf, leaveRow, manifestOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
const reviewOf = (reading: ReturnType<typeof leaveReadingOf>) => reviewLeave({ rules, manifest: manifestOf(reading.images.length), first: reading, second: null, cfg });
const expectedRows = [leaveRow(), leaveRow({ hoTen: "Trần Văn B" })];
const caseOf: GoldenCase = { name: "mau", files: ["a.jpg"], loai: { "a.jpg": "leave" }, extracted: { leave: { ngayBaoCao: "2026-10-02", dong: expectedRows } } };
const good = () => leaveReadingOf(expectedRows);

test("a fully correct reading scores 100% with no dangerous mistakes", () => {
    const reading = good();
    const s = scoreCase(caseOf, ["a.jpg"], reading, reviewOf(reading));
    assert.deepEqual(s.classes, { ok: 1, total: 1 });
    assert.ok(s.fields.every((f) => f.ok));
    assert.equal(s.wrongButAuto, 0);
    assert.equal(s.status, "tu_dong_dat");
});

test("a wrong cell in a row that stayed tu_dong_dat is the dangerous kind; the same row caught as can_xem is not", () => {
    // Đáp án: dòng 1 có lý do "Cá nhân". Đọc sai thành "Sức khỏe": không luật nào bắt (cột lyDo không có luật) nên dòng vẫn tu_dong_dat: lỗi lọt qua cả ba lớp.
    const slip = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B", lyDo: "Sức khỏe" })]);
    const auto = scoreCase(caseOf, ["a.jpg"], slip, reviewOf(slip));
    assert.equal(auto.status, "tu_dong_dat");
    assert.equal(auto.wrongButAuto, 1);
    // Cùng dòng đó nhưng ngày không đọc được: luật cứng bắt, dòng thành can_xem nên không phải lỗi lọt.
    const caught = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B", tuNgay: "2026-02-30" })]);
    const sc = scoreCase(caseOf, ["a.jpg"], caught, reviewOf(caught));
    assert.equal(sc.status, "can_xem");
    assert.ok(sc.fields.some((f) => !f.ok));
    assert.equal(sc.wrongButAuto, 0);
});

test("a missing list row is a wrong reading and counts as dangerous while the bundle is still tu_dong_dat; a wrong image class counts against classification", () => {
    const reading = leaveReadingOf([leaveRow()]);
    const s = scoreCase(caseOf, ["a.jpg"], reading, reviewOf(reading));
    assert.ok(s.fields.some((f) => f.path === "leave.dong.length" && !f.ok));
    assert.ok(s.fields.some((f) => f.path === "leave.dong[1].hoTen" && !f.ok && f.actual === null));
    assert.ok(s.wrongButAuto >= 1, "nobody flagged the missing row");
    const khac = { ...reading, images: [{ seq: 1, loai: "khac", doTinCay: "cao" as const }] };
    assert.deepEqual(scoreCase(caseOf, ["a.jpg"], khac, reviewOf(khac)).classes, { ok: 0, total: 1 });
});

test("summarize totals accuracy, dangerous mistakes and the number needing review", () => {
    const a = good();
    const sa = scoreCase(caseOf, ["a.jpg"], a, reviewOf(a));
    const b = leaveReadingOf([leaveRow({ tuNgay: "2026-02-30" }), leaveRow({ hoTen: "Trần Văn B" })]);
    const sb = scoreCase(caseOf, ["a.jpg"], b, reviewOf(b));
    const sum = summarize([sa, sb]);
    assert.equal(sum.classAccuracy, 1);
    assert.equal(sum.needReview, 1);
    assert.equal(sum.wrongButAuto, 0);
    assert.ok(sum.fieldAccuracy < 1 && sum.fieldAccuracy > 0.5);
});

test("loadGolden validates the file and accepts an empty list of cases", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-"));
    const file = path.join(dir, "leave.json");
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [] }), "utf8");
    assert.deepEqual(loadGolden(file).cases, []);
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [caseOf] }), "utf8");
    assert.equal(loadGolden(file).cases[0].name, "mau");
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [{ ...caseOf, loai: {} }] }), "utf8");
    assert.throws(() => loadGolden(file), /a\.jpg/);
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [caseOf, caseOf] }), "utf8");
    assert.throws(() => loadGolden(file), /trùng/);
    fs.writeFileSync(file, JSON.stringify({ cases: [] }), "utf8");
    assert.throws(() => loadGolden(file), /sourceDir/);
});

test("the committed leave.json loads, and its three rows behave as documented against the validator", () => {
    const golden = loadGolden(path.join(process.cwd(), "photo-golden", "leave.json"));
    assert.equal(golden.cases.length, 1);
    const rows = (golden.cases[0].extracted.leave.dong as Array<Record<string, unknown>>);
    assert.equal(rows.length, 3);
    const verdicts = rows.map((r) => validateLeaveRow(r, { sendDay: "2026-10-02", ...cfg }));
    assert.deepEqual(verdicts.map((v) => v.ok), [true, true, true]);
    assert.deepEqual(verdicts.map((v) => v.warnings.length), [0, 1, 0], "the second row has the THỨ slip printed on the sample photo");
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `node --import tsx --test tests/leaveShow.test.ts tests/photoGolden.test.ts`
Expected: FAIL (`Cannot find module '../src/leave/show.js'`).

- [ ] **Step 4: Viết `src/leave/show.ts`**

```ts
import type { LeaveDay } from "./buildDay.js";

/** Các dòng của `npm run leave:show`: những gì sẽ được điền, những gì chưa khớp danh sách, dòng chờ xem, ghi chú và cảnh báo. Hàm thuần. */
export function formatLeaveDay(day: string, d: LeaveDay): string[] {
    const lines: string[] = [];
    if (d.filled.length === 0) lines.push(`Ngày ${day}: không có kỳ nghỉ nào còn hiệu lực để điền.`);
    else {
        lines.push(`Ngày ${day}: ${d.filled.length} dòng sẽ được điền:`);
        for (const f of d.filled) lines.push(`  dòng ${f.row} ${f.name}: NGÀY ${f.ngay} | BUỔI ${f.buoi}`);
    }
    if (d.unmatched.length > 0) {
        lines.push("Chưa khớp danh sách (không điền):");
        for (const u of d.unmatched) lines.push(`  ${u.hoTen} (${u.ngay})${u.suggestions.length > 0 ? `, gần giống: ${u.suggestions.join(", ")}` : ""} (bộ ${u.bundleId}, dòng ${u.rowIndex})`);
    }
    if (d.pending.length > 0) {
        lines.push("Đang chờ xem (chưa điền):");
        for (const p of d.pending) lines.push(`  ${p.hoTen} (bộ ${p.bundleId}, dòng ${p.rowIndex}): ${p.reasons[0] ?? "chờ người xem"}`);
    }
    for (const n of d.notes) lines.push(`Ghi chú: ${n}`);
    for (const w of d.warnings) lines.push(`Cảnh báo: ${w}`);
    return lines;
}
```

- [ ] **Step 5: Viết `src/cli/leave-show.ts`**

```ts
import { config } from "../../config.js";
import { leaveForDay } from "../leave/buildDay.js";
import { realLeaveIO } from "../leave/realIo.js";
import { formatLeaveDay } from "../leave/show.js";
import { todayVietnam } from "../lesson/time.js";

/**
 * In những gì báo cáo nghỉ phép sẽ điền cho một ngày (mặc định hôm nay): dòng Excel, NGÀY, BUỔI; tên chưa khớp danh sách của file mẫu kèm gợi ý; dòng đang chờ
 * xem; ghi chú và cảnh báo. Chỉ đọc đĩa, không ghi gì, không mở Excel, không gọi agent. Dùng để kiểm TRƯỚC khi mở file.
 *
 *   npm run leave:show -- [--day YYYY-MM-DD]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const day = option("--day") ?? todayVietnam();
try {
    for (const line of formatLeaveDay(day, leaveForDay(day, realLeaveIO(), config.vision.leave))) console.log(line);
} catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
}
```

- [ ] **Step 6: Viết `src/vision/golden.ts`**

```ts
import fs from "node:fs";
import { flattenReading, norm } from "./review.js";
import type { BundleReading, Review } from "../types/index.js";

/**
 * Bộ đáp án đúng: mỗi ca là MỘT BỘ ảnh (danh sách file trong `sourceDir`) kèm đáp án người dùng đã xác nhận. `photos:golden` đọc từng ca bằng chính chu trình
 * thật rồi chấm điểm. Chỉ số quan trọng nhất là `wrongButAuto`: ô đọc SAI mà dòng chứa nó (hoặc cả bộ, với ô ngoài danh sách dòng) vẫn `tu_dong_dat`, tức là
 * lỗi lọt qua cả ba lớp review.
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

/** Đáp án thường (`{luật: {trường: giá trị}}`) thành khoá phẳng, bằng cách dựng một kết quả đọc giả rồi dùng chính `flattenReading`. */
function flattenPlain(plain: Record<string, Record<string, unknown>>): Map<string, unknown> {
    const reading: BundleReading = {
        bundleId: "golden",
        readAt: 0,
        reader: { kind: "claude-p", model: "golden", promptVersion: "0", ruleVersions: {} },
        images: [],
        extracted: Object.fromEntries(Object.entries(plain).map(([rule, fields]) => [rule, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, doTinCay: "cao" as const }]))])),
    };
    return flattenReading(reading);
}

const rowOf = (path: string): number | null => {
    const m = /\.dong\[(\d+)\]\./.exec(path);
    return m ? Number(m[1]) : null;
};

/** `imageFiles[i]` là tên file của ảnh có `seq = i + 1`. */
export function scoreCase(c: GoldenCase, imageFiles: string[], reading: BundleReading, review: Review): CaseScore {
    const classes = { ok: 0, total: imageFiles.length };
    imageFiles.forEach((file, i) => {
        if (reading.images.find((x) => x.seq === i + 1)?.loai === c.loai[file]) classes.ok += 1;
    });
    const actual = flattenReading(reading);
    const fields = [...flattenPlain(c.extracted)].map(([path, expected]) => {
        const got = actual.get(path) ?? null;
        return { path, expected, actual: got, ok: norm(expected) === norm(got) };
    });
    // Ô của một dòng: tính theo trạng thái của dòng đó; dòng không có trong review (agent bỏ sót cả dòng) và ô ngoài danh sách dòng: tính theo trạng thái của cả bộ.
    const auto = (path: string): boolean => {
        const row = rowOf(path);
        const rr = row === null ? undefined : review.rows.find((r) => r.index === row);
        return (rr ? rr.status : review.status) === "tu_dong_dat";
    };
    const wrong = fields.filter((f) => !f.ok && auto(f.path)).length + (review.status === "tu_dong_dat" ? classes.total - classes.ok : 0);
    return { name: c.name, classes, fields, status: review.status, wrongButAuto: wrong };
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

- [ ] **Step 7: Tạo `photo-golden/leave.json`** (đáp án đúng của ảnh mẫu 02/10/2026; THỨ ghi đúng như in trên ảnh, kể cả chỗ lệch)

```json
{
    "sourceDir": "data/images/AI_reading_picture",
    "cases": [
        {
            "name": "nghi-phep-mau-02-10",
            "files": ["1791259319786_8177341213137283974_8177341213137283974_755cbbb193c950ffe714d2031c85ef97.jpg"],
            "loai": { "1791259319786_8177341213137283974_8177341213137283974_755cbbb193c950ffe714d2031c85ef97.jpg": "leave" },
            "extracted": {
                "leave": {
                    "ngayBaoCao": "2026-10-02",
                    "nguoiBaoCao": "Trần Thị Dung",
                    "boPhan": "Nhân sự",
                    "dong": [
                        { "hoTen": "Nguyễn Quốc Pháp", "tuGio": "8:00", "tuThu": 7, "tuNgay": "2026-10-03", "denGio": "18:00", "denThu": 7, "denNgay": "2026-10-03", "soNgay": 1, "lyDo": "Cá nhân" },
                        { "hoTen": "Trần Nguyên Lộc", "tuGio": "8:00", "tuThu": 2, "tuNgay": "2026-10-03", "denGio": "18:00", "denThu": 2, "denNgay": "2026-10-05", "soNgay": 2, "lyDo": "Cá nhân" },
                        { "hoTen": "Hồ Đình Huy", "tuGio": "8:00", "tuThu": 2, "tuNgay": "2026-10-05", "denGio": "18:00", "denThu": 3, "denNgay": "2026-10-06", "soNgay": 2, "lyDo": "Cá nhân" }
                    ]
                }
            }
        }
    ]
}
```

- [ ] **Step 8: Viết lệnh `src/cli/photos-golden.ts`**

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
 * Đo độ chính xác của agent trên bộ đáp án đúng `photo-golden/<luật>.json`: mỗi ca dựng thành một bộ ảnh (trong `data/photo-reports/golden/`), đọc bằng
 * chính chu trình thật (kể cả lần đọc hai) rồi chấm. TỐN HẠN MỨC nên chỉ chạy tay, không có trong `npm test`. Không đụng DB, Excel hay kho tin.
 *
 *   npm run photos:golden -- [--rule leave] [--case <tên ca>]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

async function main(): Promise<void> {
    const rule = option("--rule") ?? "leave";
    const golden = loadGolden(path.join(photoGoldenDir, `${rule}.json`));
    const only = option("--case");
    const cases = golden.cases.filter((c) => !only || c.name === only);
    if (cases.length === 0) {
        console.log(only ? `[photos:golden] không có ca "${only}".` : `[photos:golden] chưa có ca nào trong photo-golden/${rule}.json (cần đáp án đúng của người dùng).`);
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
        const r = await processBundle(written.dir, { reader, rules, cfg: config.vision.leave });
        if (!r.ok) {
            console.error(`[photos:golden] LỖI ca "${c.name}": ${r.error}`);
            process.exitCode = 1;
            continue;
        }
        const manifestFiles = draft.images.map((i) => path.basename(i.source));
        const score = scoreCase(c, manifestFiles, r.reading, r.review);
        scores.push(score);
        console.log(`  trạng thái ${score.status}; phân loại ảnh ${score.classes.ok}/${score.classes.total}; trường đúng ${score.fields.filter((f) => f.ok).length}/${score.fields.length}`);
        for (const f of score.fields.filter((x) => !x.ok)) console.log(`  SAI ${f.path}: đúng ${JSON.stringify(f.expected)}, đọc ${JSON.stringify(f.actual)}`);
        for (const row of r.review.rows) console.log(`  dòng ${row.index}: ${row.status}${row.warnings.length > 0 ? ` (cảnh báo: ${row.warnings.join("; ")})` : ""}`);
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

Thêm vào `package.json` scripts, sau dòng `"fill:leave-report"`: `"leave:show": "tsx src/cli/leave-show.ts",` và `"photos:golden": "tsx src/cli/photos-golden.ts",`.

- [ ] **Step 9: Chạy test và kiểm tra kiểu**

Run: `node --import tsx --test tests/leaveShow.test.ts tests/photoGolden.test.ts` rồi `npm run typecheck`
Expected: PASS. Nếu test "a wrong cell in a row that stayed tu_dong_dat..." lệch, đọc ghi chú dưới Step 2 và sửa dữ liệu của test đó (không sửa mã sản xuất): ý của test là (1) một ô sai KHÔNG bị luật bắt trong dòng `tu_dong_dat` thì `wrongButAuto` tính 1, (2) ô sai nằm trong dòng bị luật cứng bắt (`can_xem`) thì `wrongButAuto` bằng 0.

- [ ] **Step 10: Cập nhật spec cho khớp việc thực hiện**

Trong `docs/superpowers/specs/2026-10-07-lich-nghi-phep-design.md`:
- Dòng 3 đổi thành `Ngày: 2026-10-07. Trạng thái: đã duyệt; kế hoạch triển khai: docs/superpowers/plans/2026-10-07-lich-nghi-phep.md.`
- Mục 7 (tên không khớp, một người nhiều kỳ trong một ảnh): thêm ghi chú "Bản triển khai báo hai trường hợp này lúc dựng file (`leave:show`, nhật ký của `fill-leave-report` và cảnh báo của báo cáo tổng) thay vì ghi lại vào `review.json`; sửa tên chưa khớp bằng `photos:review --row N --fix hoTen=...`."
- Mục 10: bỏ `bundle.settleMinutes` (bộ ảnh nghỉ phép đóng theo `leave.settleSeconds`, mặc định 20 giây, vì chu trình runner chạy 30 giây sau tin cuối) và ghi `maxBundlesPerRun` mặc định 3.
- Mục 4: thêm ghi chú "luật `leave` trả ngày dạng `YYYY-MM-DD`; chữ `dd/MM/yyyy` trong Excel do mã định dạng".

- [ ] **Step 11: Kiểm tra cuối (không tốn token)**

Run:

```
npm run typecheck
npm test
npm run skills:check
npx tsx src/cli/photos-bundle.ts --from-dir data/images/AI_reading_picture
npx tsx src/cli/photos-read.ts --dry-run
npx tsx src/cli/photos-auto.ts
npx tsx src/cli/photos-review.ts --list
npx tsx src/cli/leave-show.ts
npx tsx src/cli/config-show.ts
npx tsx src/cli/reports-list.ts
```

Expected: typecheck và test PASS; `skills:check` thoát 0; bộ mẫu được tạo; `--dry-run` liệt kê đúng bộ đó mà không gọi agent; `photos:auto` báo `config.vision.enabled là false`; `photos:review --list` báo 0 bộ; `leave:show` báo "không có kỳ nghỉ nào còn hiệu lực"; `config:show` có mục `12. ĐỌC ẢNH`; `reports:list` có 8 mã, `leave` cuối cùng và mẫu `LICH NGHI PHEP KY THUAT.xlsx` ghi "có sẵn".

- [ ] **Step 12: (cần người dùng đồng ý, tốn hạn mức) Thử thật với agent và nhóm `bot test`**

Chỉ chạy khi người dùng nói đồng ý vì gọi `claude -p` thật. Hướng dẫn người dùng:
1. Trong `config.ts` đặt `vision.enabled: true` (`vision.leave.groups` mặc định đã là `["bot test"]`), rồi khởi động lại `bot:watch` và `bot:runner` (bot chỉ nạp cấu hình lúc khởi động). `bot:watch` phải chạy để ảnh được lưu vào kho (tin `chat.photo` được lưu từ khung WebSocket).
2. Gửi ảnh nghỉ phép mẫu vào nhóm `bot test`.
3. Đợi khoảng một phút cho chu trình runner, hoặc chạy tay `npx tsx src/cli/photos-auto.ts` rồi `npx tsx src/cli/leave-show.ts`.
4. Kết quả đúng cho ảnh mẫu 02/10/2026: ba tên (Nguyễn Quốc Pháp, Trần Nguyên Lộc, Hồ Đình Huy) KHÔNG có trong danh sách của file mẫu nên không ô nào được điền và `leave:show` liệt kê ba tên ở mục "Chưa khớp danh sách" (kèm gợi ý nếu có tên gần giống); dòng Trần Nguyên Lộc có một cảnh báo THỨ nhưng không bị chặn. Muốn thấy ô được điền: tạm thêm một tên trong danh sách vào ảnh, hoặc `npx tsx src/cli/photos-review.ts --bundle <mã bộ> --row 0 --fix hoTen="Huỳnh Hữu Đức"` rồi `npx tsx src/cli/fill-leave-report.ts --force` và mở file trong `data/export/trang-thai/...`.
5. Đo độ chính xác của agent trên ảnh mẫu: `npx tsx src/cli/photos-golden.ts` (tốn hạn mức); báo lại cho người dùng trạng thái từng dòng, các trường sai và số chỗ "SAI MÀ VẪN TỰ ĐẠT".

Không tự chạy bước này.

- [ ] **Step 13: Commit**

```bash
git add src/leave/show.ts src/cli/leave-show.ts src/vision/golden.ts src/cli/photos-golden.ts photo-golden tests/leaveShow.test.ts tests/photoGolden.test.ts package.json docs/superpowers/specs/2026-10-07-lich-nghi-phep-design.md
git commit -m "feat(leave): leave:show, đáp án mẫu và photos:golden, cập nhật spec theo bản triển khai" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (đã chạy)

**1. Phủ spec** (mục của `2026-10-07-lich-nghi-phep-design.md`)
- §1 mục tiêu, §2 bảy quyết định: 1 (tên không khớp: Task 7 gợi ý, Task 12 `unmatched`, không điền), 2 (nhóm và người gửi: Task 1 cấu hình, Task 4 `filterPhotoMessages`, Task 5), 3 (BUỔI: Task 7), 4 (chọn kỳ, ảnh mới nhất, kỳ qua bỏ: Task 12 `collectLeaves`), 5 (điền cả hai dòng: Task 7 `matchRoster`, Task 12 `buildLeaveCells`), 6 (dòng nghi ngờ để trống: Task 8, 12 chỉ dùng dòng đã đạt), 7 (file thứ 8 trong tổng và in: Task 11 đăng ký, Task 14).
- §3 luồng: `photos:auto` và `fill:leave-report` cuối chu trình (Task 9, 13, 14); `bot:total` chỉ đọc kết quả (Task 12 `leaveForDay`, Task 14 `deps.leave`).
- §4 bộ đọc tối thiểu: Task 1 đến 6 (kiểu, luật, prompt, gom bộ, thư mục, `claude -p`), Task 8 và 9 (review theo dòng, đọc lần hai), Task 10 (`da_bo`, người xem).
- §5 kiểm tra: Task 8 (`validateLeaveRow`, kiểm chứng chéo, đọc lần hai), Task 10 (lớp 3).
- §6 BUỔI và NGÀY: Task 7. §7 khớp tên và chọn kỳ: Task 7, 12. §8 Excel tại chỗ: Task 11 (`inPlace`), 12, 13. §9 đăng ký, tổng, in, tài liệu: Task 11, 14. §10 cấu hình: Task 1. §11 lệnh: Task 5, 9, 10, 13, 15. §12 kiểm thử: các test của từng task, `photo-golden/leave.json` (Task 15). §13 rủi ro: múi giờ ngày Windows ghi ở Task 13 Step 4 và README (Task 14); quyền riêng tư và hạn mức nằm ở spec.
- Chỗ lệch spec có chủ ý (đã ghi vào spec ở Task 15 Step 10): (a) tên chưa khớp và "một người nhiều kỳ trong một ảnh" được báo lúc dựng file (`leave:show`, nhật ký, cảnh báo của báo cáo tổng) chứ không ghi lại vào `review.json`; (b) bộ ảnh nghỉ phép đóng theo `vision.leave.settleSeconds` (20 giây) thay cho `bundle.settleMinutes`, vì chu trình runner chạy 30 giây sau tin cuối; (c) luật `leave` trả ngày `YYYY-MM-DD`, chữ `dd/MM/yyyy` do mã định dạng; (d) phần review của bộ đọc là riêng cho loại `leave` (phần 4 và 5 sẽ khái quát hoá khi cần).

**2. Quét chỗ trống:** không còn "TBD" hay "TODO". Hai chỗ có hướng dẫn điều chỉnh khi chạy: Task 1 Step 9 (test `configWiring` về tên lệnh `photos:*`) và Task 15 Step 9 (dữ liệu của một test trong `photoGolden`), cả hai nêu rõ cách sửa.

**3. Nhất quán kiểu:** `Review`, `RowReview`, `ReviewStatus` (Task 1) dùng nhất quán ở Task 8, 9, 10, 12, 15; `ParsedLeave` (Task 8) dùng ở Task 12 (`ActiveLeave.parsed`); `LeaveRowSource` (Task 12) do `loadLeaveRows` tạo và `collectLeaves` nhận; `LeaveFill` và `LeaveDay` (Task 12) dùng ở Task 13 (`result.filled`, `headerCells`, `signature`), Task 14 (`TotalDeps.leave`), Task 15 (`formatLeaveDay`); `LEAVE_LAYOUT` (Task 11) dùng ở Task 12, 13, 14; khoá phẳng `leave.dong[i].cột` thống nhất giữa `src/vision/review.ts`, `src/leave/review.ts`, `src/vision/golden.ts`; `PipelineDeps.cfg` (Task 9) truyền `config.vision.leave` ở Task 9, 15.

**4. Review Focus:** (1) Task 9 "a leave photo mixed with room photos" và "a bundle of only room photos", Task 8 "a bundle with no leave photo"; (2) Task 7 `leaveNames`, `leaveRoster` (người hai dòng), Task 12 `leaveCells` (tên lạ); (3) Task 12 `leaveCollect` ("ended yesterday", "newer row ... waiting for review"); (4) Task 7 `leaveDates` (`8:00`, `08:00`, `8h30`), `leaveBuoi` (đúng 12:00), `countNonSundays` qua Chủ nhật; (5) Task 6 (lỗi `claude`), Task 9 ("a failed first read writes nothing"), Task 14 (lỗi đọc ảnh chỉ là cảnh báo của runner); (6) Task 13 (không dựng file khi không có kỳ nghỉ), Task 14 `totalLeave` ("with no leave at all", "a leave source that throws").
