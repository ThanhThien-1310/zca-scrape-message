# Lesson Report Pipeline (Skill teacher-lesson-report-extraction V2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một script trích xuất toàn bộ báo cáo đầu/cuối buổi dạy từ tin nhắn Zalo đã cào, một script điền file Excel mẫu `Temp_RoomFacility_rpt.xlsm` (chạy macro của file mẫu), và SKILL.md V2 để agent giám sát kết quả — không dùng API.

**Architecture:** Toàn bộ logic trích xuất là các hàm thuần trong thư mục `lesson/` (có test bằng `node:test`); hai CLI mỏng (`extractLessonReports.ts`, `fillRoomFacilityReport.ts`) nối các hàm đó với `data/*.json`, SQL Server (`fn_LookupRoomIds`) và Excel (PowerShell COM). Agent chỉ đọc `output/review.json` và ghi `output/overrides.json`; script luôn tự tính lại `xepLoai` máy tính và `maTrangThai`.

**Tech Stack:** Node >= 22, TypeScript chạy bằng `tsx`, `node:test`, `mssql` (đã có), PowerShell 5.1 + Excel COM, Microsoft Excel.

**Spec:** `docs/superpowers/specs/2026-09-24-teacher-lesson-report-extraction-design.md` (đọc cùng với plan này). Đọc thêm `skills/school-and-area-extraction/SKILL.md` (bảng khu vực, cấp học) khi làm Task 2.

## Global Constraints

- Thư mục làm việc của mọi lệnh: `zca-scrape-message/` (repo git riêng, HEAD `af87eed`). Repo đang có nhiều file sửa dở không thuộc plan này: **chỉ `git add` đúng các file của task**, không dùng `git add -A`.
- ESM + `moduleResolution: NodeNext`: import nội bộ luôn có đuôi `.js` (ví dụ `"./types.js"`). Thụt lề 4 dấu cách, dấu nháy kép.
- Múi giờ Việt Nam = UTC+7 (cố định, không DST). Ngày xử lý mặc định là hôm nay theo giờ Việt Nam.
- Mỗi lần chạy chỉ xử lý **một buổi của một ngày**: `sang` 00:00–11:59, `chieu` 12:00–17:59, `toi` 18:00–23:59 (theo giờ gửi tin). Tham số `--buoi sang|chieu|toi`, mặc định là buổi của thời điểm chạy. Chỉ tin nhắn trong buổi đó được xét và ghi vào `marks.json`.
- File Excel đầu ra tên `baocaobuoi<buoi>_<ddMMyy>.xlsm` trong `data/export/` (ví dụ `baocaobuoisang_250926.xlsm` cho buổi sáng 25/09/2026). `extract:reports` ghi `output/meta.json` (`{ "day", "buoi" }`) để `fill:report` đặt tên file.
- Tạm thời không xử lý ảnh (`chat.photo`): chỉ đọc tin nhắn chữ.
- Tên trường/giá trị trong `output.json` là tiếng Việt không dấu camelCase như spec: `maTinNhan`, `maNguoiGui`, `maNhom`, `thoiGian`, `loaiBaoCao` (`DauBuoi`|`CuoiBuoi`), `data.maTrangThai`, `data.maPhong`, `data.truong{capHoc,tenRieng,coSo}`, `data.khuVuc`, `data.phongMay`, `data.giaoVien`, `data.coSoVatChat[].loai` (`AmThanh`,`NetSupport`,`MayLanh`,`Internet`,`MayTinh`), `xepLoai`, `soLuong[].loai` (`Thieu`,`Loi`), `so`, `ghiChu`.
- `maTrangThai`: `1` đầy đủ, `2` thiếu/sai một phần (kể cả phòng không có trong DB), `-1` tin nhắn không phải báo cáo đầu/cuối buổi.
- Bảng mã: `TypeId` DauBuoi=1, CuoiBuoi=2; `FacilityTypeId` MayTinh=1, NetSupport=2, Internet=3, AmThanh(Speaker)=4, MayLanh(AirConditioner)=5; `QuantityTypeId` Thieu(Missing)=1, Loi(Faulty)=2.
- Sheet `data` của file mẫu có đúng 20 cột theo thứ tự: `Id, MessageId, SenderId, GroupId, Timestamp, Date, Time, TypeId, Employee, RoomId, School, Area, Room, FacilityId, FacilityTypeId, FacilityGrade, FacilityNote, QuantityTypeId, Quantity, QuantityNote`.
- Khi tra `RoomId` bỏ tiền tố `PM` khỏi tên phòng (`PM1` → `1`); cột `Room` trong Excel giữ đúng chữ trong tin nhắn.
- File mẫu `../templates/Temp_RoomFacility_rpt.xlsm` (so với `zca-scrape-message/`) không bao giờ bị sửa: luôn làm việc trên bản sao.
- JSON ghi ra là UTF-8 không BOM. Thông tin đăng nhập DB nằm trong `.env` (đã bị gitignore), đọc qua `store/db.ts`.
- Không đụng tới `exportLessonReport.ts` cũ và script `export:lesson-report` (bị bỏ qua theo quyết định của người dùng).

## Review Focus

1. Nhãn dòng lệch nhẹ: dấu cách không ngắt (U+00A0) do Zalo, xuống dòng `\r\n`, viết không dấu (`Ten giao vien`), thiếu dấu cách sau `:` → vẫn phải khớp (test ở Task 3).
2. Tên nhóm không chứa khu vực (ví dụ `bot test`): không được crash, phải vào `review.json` với `truong_khong_nhan_ra` và `maTrangThai = 2` (test ở Task 4).
3. Ngày không có báo cáo nào (hoặc `data/` rỗng): `extract:reports` vẫn ghi `output.json = []` và `marks.json` đầy đủ, `fill:report` thoát bình thường mà không tạo file Excel (Task 6, Task 7).
4. `overrides.json` hỏng (JSON sai, sai hình dạng, có BOM do PowerShell ghi): phải báo lỗi rõ tên file thay vì bỏ qua âm thầm; BOM thì đọc được (test ở Task 6).
5. Excel không cài, macro bị chặn, hoặc file đích đang mở: `fill:report` phải thoát mã khác 0 và in nguyên nhân, không để lại tiến trình `EXCEL.EXE` treo (Task 7).

---

### Task 1: Tooling test, kiểu dữ liệu chung và hàm thời gian

**Files:**
- Modify: `package.json` (thêm script `test`)
- Modify: `.gitignore` (thêm `/output/`)
- Create: `lesson/types.ts`
- Create: `lesson/time.ts`
- Test: `tests/time.test.ts`

**Interfaces:**
- Produces: `lesson/types.ts` xuất `LoaiBaoCao`, `Truong`, `SoLuong`, `CoSoVatChat`, `Report`, `Mark`, `LyDo`, `MessageKey`, `ReviewItem`, `Sua`, `Override`, `SourceMessage`, `RoomKey`. `lesson/time.ts` xuất `vietnamDay(ts): string`, `todayVietnam(now?): string`, `excelDateSerial(ts): number`, `excelTimeFraction(ts): number`, `type Buoi = "sang" | "chieu" | "toi"`, `sessionOf(ts): Buoi`, `currentSession(now?): Buoi`, `isBuoi(value): value is Buoi`, `reportFileName(day: string, buoi: Buoi): string` (`baocaobuoisang_250926.xlsm`).

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/time.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { currentSession, excelDateSerial, excelTimeFraction, isBuoi, reportFileName, sessionOf, todayVietnam, vietnamDay } from "../lesson/time.js";

test("time helpers use the Vietnam calendar", () => {
    const ts = Date.UTC(2026, 8, 23, 18, 30); // 01:30 on 24 Sep in Vietnam
    assert.equal(vietnamDay(ts), "2026-09-24");
    assert.equal(excelDateSerial(ts), 46289);
    assert.equal(excelTimeFraction(ts), (1 * 60 + 30) / 1440);
    assert.equal(todayVietnam(ts), "2026-09-24");
});

test("a message just before Vietnam midnight stays on the same day", () => {
    const ts = Date.UTC(2026, 8, 24, 16, 59, 59); // 23:59:59 on 24 Sep in Vietnam
    assert.equal(vietnamDay(ts), "2026-09-24");
    assert.equal(vietnamDay(ts + 1000), "2026-09-25");
});

test("sessions split the Vietnam day at 12:00 and 18:00", () => {
    const vn = (h: number, m = 0, s = 0) => Date.UTC(2026, 8, 24, h - 7, m, s);
    assert.equal(sessionOf(vn(0)), "sang");
    assert.equal(sessionOf(vn(11, 59, 59)), "sang");
    assert.equal(sessionOf(vn(12)), "chieu");
    assert.equal(sessionOf(vn(17, 59, 59)), "chieu");
    assert.equal(sessionOf(vn(18)), "toi");
    assert.equal(sessionOf(vn(23, 59, 59)), "toi");
    assert.equal(currentSession(vn(9)), "sang");
});

test("isBuoi accepts only the three sessions", () => {
    assert.equal(isBuoi("sang"), true);
    assert.equal(isBuoi("chieu"), true);
    assert.equal(isBuoi("toi"), true);
    assert.equal(isBuoi("sáng"), false);
    assert.equal(isBuoi(undefined), false);
});

test("reportFileName is baocaobuoi<buoi>_<ddMMyy>.xlsm", () => {
    assert.equal(reportFileName("2026-09-25", "sang"), "baocaobuoisang_250926.xlsm");
    assert.equal(reportFileName("2026-01-05", "chieu"), "baocaobuoichieu_050126.xlsm");
});
```

- [ ] **Step 2: Thêm script test và chạy để thấy test thất bại**

Trong `package.json`, thêm vào `"scripts"`:

```json
        "test": "node --import tsx --test \"tests/**/*.test.ts\""
```

Chạy: `npm test`
Expected: FAIL với `Cannot find module '../lesson/time.js'` (hoặc tương đương).

- [ ] **Step 3: Viết `lesson/types.ts` và `lesson/time.ts`**

Tạo `lesson/types.ts`:

```ts
export type LoaiBaoCao = "DauBuoi" | "CuoiBuoi";

export interface Truong {
    capHoc: string | null;
    tenRieng: string;
    coSo: string | null;
}

export interface SoLuong {
    loai: "Thieu" | "Loi";
    so: number | null;
    ghiChu?: string | null;
}

export interface CoSoVatChat {
    loai: "AmThanh" | "NetSupport" | "MayLanh" | "Internet" | "MayTinh";
    xepLoai: string | null;
    soLuong?: SoLuong[];
}

export interface Report {
    maTinNhan: string;
    maNguoiGui: string;
    maNhom: string;
    thoiGian: number;
    loaiBaoCao: LoaiBaoCao;
    data: {
        maTrangThai: number;
        maPhong: number | null;
        truong: Truong | null;
        khuVuc: string | null;
        phongMay: string | null;
        giaoVien: string | null;
        coSoVatChat: CoSoVatChat[];
    };
}

export interface Mark {
    maNhom: string;
    maTinNhan: string;
    maTrangThai: number;
}

export type LyDo = "khong_nhan_ra_nhan" | "thieu_dong" | "gan_giong_tieu_de" | "phong_khong_tim_thay" | "truong_khong_nhan_ra" | "so_khong_hop_le";

export interface MessageKey {
    maNhom: string;
    maTinNhan: string;
}

export interface ReviewItem {
    key: MessageKey;
    lyDo: LyDo[];
    raw: string;
    draft: Report | null;
    truongCanXem: string[];
}

/** Raw fields an agent may overwrite; every derived value (computer xepLoai, maTrangThai) is recomputed. */
export interface Sua {
    loaiBo?: boolean;
    loaiBaoCao?: LoaiBaoCao;
    phongMay?: string | null;
    giaoVien?: string | null;
    truong?: Truong | null;
    khuVuc?: string | null;
    thieu?: number | null;
    loi?: number | null;
    ghiChuLoi?: string | null;
    amThanh?: string | null;
    netSupport?: string | null;
    mayLanh?: string | null;
    internet?: string | null;
}

export interface Override {
    key: MessageKey;
    sua: Sua;
}

/** The subset of a scraped message (data/<groupId>.json) the extractor reads. */
export interface SourceMessage {
    msgId: string;
    groupId: string;
    groupName: string;
    senderId: string;
    ts: number;
    msgType: string;
    content: string;
}

export interface RoomKey {
    room: string;
    capHoc: string | null;
    tenRieng: string;
    coSo: string | null;
    khuVuc: string;
}
```

Tạo `lesson/time.ts`:

```ts
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` of an epoch-ms instant on the Vietnam wall clock. */
export function vietnamDay(ts: number): string {
    const d = new Date(ts + VN_OFFSET_MS);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function todayVietnam(now: number = Date.now()): string {
    return vietnamDay(now);
}

/** Excel date serial (whole days since 1899-12-30) of the Vietnam calendar day. */
export function excelDateSerial(ts: number): number {
    const d = new Date(ts + VN_OFFSET_MS);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / DAY_MS + 25569;
}

/** Fraction of a day (0 <= x < 1) of the Vietnam wall-clock time. */
export function excelTimeFraction(ts: number): number {
    const d = new Date(ts + VN_OFFSET_MS);
    return (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds()) / 86400;
}

export type Buoi = "sang" | "chieu" | "toi";

/** Session of the Vietnam day: sáng 00:00-11:59, chiều 12:00-17:59, tối 18:00-23:59. */
export function sessionOf(ts: number): Buoi {
    const hour = new Date(ts + VN_OFFSET_MS).getUTCHours();
    return hour < 12 ? "sang" : hour < 18 ? "chieu" : "toi";
}

export function currentSession(now: number = Date.now()): Buoi {
    return sessionOf(now);
}

export function isBuoi(value: string | undefined): value is Buoi {
    return value === "sang" || value === "chieu" || value === "toi";
}

/** `baocaobuoisang_250926.xlsm`: the session and the ddMMyy of the Vietnam day (`YYYY-MM-DD`). */
export function reportFileName(day: string, buoi: Buoi): string {
    const [y, m, d] = day.split("-");
    return `baocaobuoi${buoi}_${d}${m}${y.slice(2)}.xlsm`;
}
```

Trong `.gitignore`, thêm một dòng `/output/` ngay dưới dòng `/data/` (kèm comment `# Extractor output — never commit`).

- [ ] **Step 4: Chạy test để thấy đạt**

Run: `npm test`
Expected: PASS (`tests 2`, `fail 0`).

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore lesson/types.ts lesson/time.ts tests/time.test.ts
git commit -m "feat(lesson): test tooling, shared report types and Vietnam time helpers"
```

---

### Task 2: Tách tên nhóm thành trường học và khu vực

**Files:**
- Create: `lesson/schoolArea.ts`
- Test: `tests/schoolArea.test.ts`

**Interfaces:**
- Consumes: `Truong` từ `lesson/types.ts`.
- Produces: `parseGroupName(input: string): { truong: Truong | null; khuVuc: string | null }` và kiểu `SchoolArea`. Quy tắc theo `skills/school-and-area-extraction/SKILL.md`: khu vực khớp ở cuối chuỗi (mã hoặc tên đầy đủ, dài nhất trước), cơ sở `CS<n>` ở cuối phần còn lại, cấp học ở đầu, phần còn lại là tên riêng viết hoa và tách chữ dính liền (`HoaSen1` → `HOA SEN 1`).

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/schoolArea.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGroupName } from "../lesson/schoolArea.js";

const cases: Array<[string, string | null, string | null, string | null, string | null]> = [
    // input, capHoc, tenRieng, coSo, khuVuc  (tenRieng null => truong null)
    ["THPT Trần Văn Ơn", "THPT", "TRẦN VĂN ƠN", null, null],
    ["BC", null, null, null, "BC"],
    ["", null, null, null, null],
    ["TH Đặng Văn Bất_Thủ Đức.", "TH", "ĐẶNG VĂN BẤT", null, "TĐ"],
    ["TH Cầu Xáng TĐ", "TH", "CẦU XÁNG", null, "TĐ"],
    ["Nhà VHTH - Bình Dương", null, "NHÀ VHTH", null, "BD"],
    ["THCS Nguyễn Bỉnh Khiêm-CS2 NB", "THCS", "NGUYỄN BỈNH KHIÊM", "CS2", "NB"],
    ["TH Bình Trị 2 cs1 - Bình Tân", "TH", "BÌNH TRỊ 2", "CS1", "BTAN"],
    ["THCS-THPT Nam Việt - Q9", "THCS - THPT", "NAM VIỆT", null, "TĐ"],
    ["LC_QuangTrungNguyễnHuệ_PN", "LC", "QUANG TRUNG NGUYỄN HUỆ", null, "PN"],
    ["Tiểu học Cổ Loa - PN", "TH", "CỔ LOA", null, "PN"],
    ["LC_HoaSen1_TĐ", "LC", "HOA SEN 1", null, "TĐ"],
    ["LC_TríTuệViệt_BTAN", "LC", "TRÍ TUỆ VIỆT", null, "BTAN"],
    ["LC_ChuVănAn_BTAN", "LC", "CHU VĂN AN", null, "BTAN"],
    ["LC_QuangTrungNguyễnHuệ_Q5", "LC", "QUANG TRUNG NGUYỄN HUỆ", null, "Q5"],
    ["bot test", null, "BOT TEST", null, null],
];

for (const [input, capHoc, tenRieng, coSo, khuVuc] of cases) {
    test(`parseGroupName(${JSON.stringify(input)})`, () => {
        const r = parseGroupName(input);
        assert.equal(r.khuVuc, khuVuc);
        if (tenRieng === null) assert.equal(r.truong, null);
        else assert.deepEqual(r.truong, { capHoc, tenRieng, coSo });
    });
}
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/schoolArea.test.ts`
Expected: FAIL (`Cannot find module '../lesson/schoolArea.js'`).

- [ ] **Step 3: Viết `lesson/schoolArea.ts`**

```ts
import type { Truong } from "./types.js";

export interface SchoolArea {
    truong: Truong | null;
    khuVuc: string | null;
}

const AREAS: Array<{ code: string; names: string[] }> = [
    { code: "TP HCM", names: ["TP Hồ Chí Minh", "TP. HCM", "TP.HCM"] },
    { code: "BD", names: ["Bình Dương"] },
    { code: "VT", names: ["Vũng Tàu", "BRVT"] },
    { code: "BC", names: ["Bình Chánh"] },
    { code: "BTAN", names: ["Bình Tân"] },
    { code: "BTH", names: ["Bình Thạnh"] },
    { code: "CC", names: ["Củ Chi"] },
    { code: "GV", names: ["Gò Vấp"] },
    { code: "HM", names: ["Hóc Môn"] },
    { code: "NB", names: ["Nhà Bè"] },
    { code: "PN", names: ["Phú Nhuận"] },
    { code: "Q1", names: ["Quận 1", "Q.1"] },
    { code: "Q3", names: ["Quận 3", "Q.3"] },
    { code: "Q4", names: ["Quận 4", "Q.4"] },
    { code: "Q5", names: ["Quận 5", "Q.5"] },
    { code: "Q6", names: ["Quận 6", "Q.6"] },
    { code: "Q7", names: ["Quận 7", "Q.7"] },
    { code: "Q8", names: ["Quận 8", "Q.8"] },
    { code: "Q10", names: ["Quận 10", "Q.10"] },
    { code: "Q11", names: ["Quận 11", "Q.11"] },
    { code: "Q12", names: ["Quận 12", "Q.12"] },
    { code: "TB", names: ["Tân Bình"] },
    { code: "TP", names: ["Tân Phú"] },
    { code: "TĐ", names: ["Thủ Đức", "Q2", "Q.2", "Q9", "Q.9"] },
    { code: "TDM", names: ["Thủ Dầu Một"] },
    { code: "TA", names: ["Thuận An"] },
    { code: "DA", names: ["Dĩ An"] },
    { code: "BCAT", names: ["Bến Cát"] },
    { code: "TU", names: ["Tân Uyên"] },
    { code: "BB", names: ["Bàu Bàng"] },
    { code: "PG", names: ["Phú Giáo"] },
    { code: "DT", names: ["Dầu Tiếng"] },
    { code: "BTU", names: ["Bắc Tân Uyên"] },
];

// Longest text first so "TP HCM" wins over "TP", "Bắc Tân Uyên" over "Tân Uyên".
const AREA_CANDIDATES = AREAS.flatMap((a) => [a.code, ...a.names].map((text) => ({ text: text.toLowerCase(), code: a.code }))).sort((a, b) => b.text.length - a.text.length);

const LEVEL_CODES: Record<string, string> = {
    "tiểu học": "TH",
    "mầm non": "MN",
    "trung học cơ sở": "THCS",
    "trung học phổ thông": "THPT",
    "cao đẳng": "CĐ",
    "đại học": "ĐH",
    "liên cấp": "LC",
    "liên cấp 1": "LC1",
    "liên cấp 2": "LC2",
    "liên cấp 3": "LC3",
};
const LEVEL_TOKEN = "(?:THCS|THPT|TH|MN|LC[123]?|CĐ|ĐH|Tiểu học|Mầm non|Trung học cơ sở|Trung học phổ thông|Liên cấp(?: [123])?|Cao đẳng|Đại học)";
const LEVEL_RE = new RegExp(`^(${LEVEL_TOKEN}(?:\\s*-\\s*${LEVEL_TOKEN})*)(?![\\p{L}\\d])`, "iu");
const VALID_LEVELS = new Set(["MN", "TH", "THCS", "THPT", "LC", "LC1", "LC2", "LC3", "TH - THCS", "THCS - THPT", "TH - THCS - THPT", "CĐ", "ĐH"]);
const BRANCH_RE = /(?:^|[\s_,-])(?:cs|cơ sở)\s*(\d+)\s*$/iu;
const SEPARATOR = /[\s_,-]/;
const TRAILING_JUNK = /[\s_,.-]+$/;
const LEADING_JUNK = /^[\s_,.-]+/;

function toLevelCode(token: string): string {
    const t = token.trim().toLowerCase().replace(/\s+/g, " ");
    return LEVEL_CODES[t] ?? token.trim().toUpperCase();
}

function matchArea(s: string): { code: string; rest: string } | null {
    const lower = s.toLowerCase();
    for (const c of AREA_CANDIDATES) {
        if (!lower.endsWith(c.text)) continue;
        const start = s.length - c.text.length;
        if (start === 0 || SEPARATOR.test(s[start - 1])) return { code: c.code, rest: s.slice(0, start) };
    }
    return null;
}

function normalizeBaseName(raw: string): string {
    return raw
        .replace(/[_,-]+/g, " ")
        .replace(/(\p{Ll}|\d)(\p{Lu})/gu, "$1 $2")
        .replace(/(\p{L})(\d)/gu, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

/** Splits a Zalo group name such as `LC_HoaSen1_TĐ` into school and area, following skills/school-and-area-extraction. */
export function parseGroupName(input: string): SchoolArea {
    let s = input.normalize("NFC").trim().replace(TRAILING_JUNK, "");

    let khuVuc: string | null = null;
    const area = matchArea(s);
    if (area) {
        khuVuc = area.code;
        s = area.rest.replace(TRAILING_JUNK, "");
    }

    let coSo: string | null = null;
    const branch = BRANCH_RE.exec(s);
    if (branch) {
        coSo = `CS${branch[1]}`;
        s = s.slice(0, branch.index).replace(TRAILING_JUNK, "");
    }

    s = s.replace(LEADING_JUNK, "");
    let capHoc: string | null = null;
    const level = LEVEL_RE.exec(s);
    if (level) {
        const code = level[1].split("-").map(toLevelCode).join(" - ");
        if (VALID_LEVELS.has(code)) {
            capHoc = code;
            s = s.slice(level[0].length);
        }
    }

    const tenRieng = normalizeBaseName(s);
    return { truong: tenRieng ? { capHoc, tenRieng, coSo } : null, khuVuc };
}
```

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/schoolArea.test.ts`
Expected: PASS, `tests 16`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lesson/schoolArea.ts tests/schoolArea.test.ts
git commit -m "feat(lesson): parse Zalo group names into school and area"
```

---

### Task 3: Phân tích một tin nhắn báo cáo (tiêu đề, nhãn, phòng, xếp loại, số)

**Files:**
- Create: `lesson/parseReport.ts`
- Test: `tests/parseReport.test.ts`

**Interfaces:**
- Consumes: `LoaiBaoCao` từ `lesson/types.ts`.
- Produces (tất cả từ `lesson/parseReport.ts`): `stripDiacritics(s)`, `classifyTitle(content): "DauBuoi"|"CuoiBuoi"|"gan_giong"|null` (kiểu `TitleKind`), `FIELD_KEYS: FieldKey[]` với `FieldKey = "giaoVien"|"phongMay"|"loi"|"thieu"|"netSupport"|"internet"|"amThanh"|"mayLanh"`, `parseLines(content): { values: Partial<Record<FieldKey,string>>; unknownLabels: string[] }`, `parseRoom(value?): { phongMay: string|null; coSo: string|null }`, `parseGrade(value?): string|null`, `isValidFacilityGrade(g): boolean`, `parseCount(value?): number|null`, `parseNote(value?): string|null`, `computerGrade(thieu, loi): string|null`.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/parseReport.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTitle, computerGrade, parseCount, parseGrade, parseLines, parseNote, parseRoom } from "../lesson/parseReport.js";

test("classifyTitle", () => {
    assert.equal(classifyTitle("BÁO CÁO ĐẦU BUỔI DẠY\n- Tên Giáo Viên: A"), "DauBuoi");
    assert.equal(classifyTitle("báo cáo cuối buổi dạy"), "CuoiBuoi");
    assert.equal(classifyTitle("BAO CAO DAU BUOI"), "DauBuoi");
    assert.equal(classifyTitle("BÁO CÁO CHUYÊN MÔN\n- Lớp: 9A"), null);
    assert.equal(classifyTitle("BÁO CÁO CHUYÊN MÔN 2"), null);
    assert.equal(classifyTitle("test báo cáo"), null);
    assert.equal(classifyTitle(""), null);
    assert.equal(classifyTitle("Xin gửi\nbáo cáo đầu buổi hôm nay"), "gan_giong");
});

test("parseRoom follows the room table", () => {
    assert.deepEqual(parseRoom("PM1"), { phongMay: "PM1", coSo: null });
    assert.deepEqual(parseRoom("Phòng Lab"), { phongMay: "Lab", coSo: null });
    assert.deepEqual(parseRoom("PM1 (Trường)"), { phongMay: "PM1", coSo: null });
    assert.deepEqual(parseRoom("PM2 (Phòng 42 của trường)"), { phongMay: "PM2", coSo: null });
    assert.deepEqual(parseRoom(""), { phongMay: "", coSo: null });
    assert.deepEqual(parseRoom(undefined), { phongMay: null, coSo: null });
    assert.deepEqual(parseRoom("PM1 - CS2"), { phongMay: "PM1", coSo: "CS2" });
    assert.deepEqual(parseRoom("CS2"), { phongMay: "PM1", coSo: "CS2" });
    assert.deepEqual(parseRoom("H002"), { phongMay: "H002", coSo: null });
    assert.deepEqual(parseRoom("Học tại lớp"), { phongMay: "Học tại lớp", coSo: null });
});

test("parseGrade", () => {
    assert.equal(parseGrade("T"), "T");
    assert.equal(parseGrade("k"), "K");
    assert.equal(parseGrade(""), "");
    assert.equal(parseGrade("Ổn định"), "Ổn định");
    assert.equal(parseGrade(undefined), null);
});

test("parseCount and parseNote", () => {
    assert.equal(parseCount("0"), 0);
    assert.equal(parseCount("3(máy 35 lỗi)"), 3);
    assert.equal(parseCount("4 (máy 23)"), 4);
    assert.equal(parseCount("IT bảo trì"), null);
    assert.equal(parseCount(""), null);
    assert.equal(parseCount(undefined), null);
    assert.equal(parseNote("0"), null);
    assert.equal(parseNote("0 ()"), "");
    assert.equal(parseNote("4 (máy 23, 31, 33, 34 không lên nguồn)"), "máy 23, 31, 33, 34 không lên nguồn");
});

test("computerGrade follows the Thieu/Loi table", () => {
    const rows: Array<[number | null, number | null, string | null]> = [
        [0, 0, "A"], [0, 1, "B"], [0, 5, "B"], [0, 6, "C"], [0, 9, "C"], [0, 10, "D"],
        [1, 0, "C"], [1, 1, "C"], [1, 7, "C"], [1, 10, "D"],
        [null, 10, null], [3, null, null], [null, null, null],
    ];
    for (const [t, l, g] of rows) assert.equal(computerGrade(t, l), g, `thieu=${t} loi=${l}`);
});

test("parseLines tolerates prefix, spacing and case, and ignores known extra lines", () => {
    const content = [
        "BÁO CÁO CUỐI BUỔI DẠY",
        "- Tên giáo viên: V.Minh",
        "- Tên trợ giảng: Không",
        "  Phòng máy: PM1",
        " Tổng số máy: 36 ",
        " Tổng số máy bị lỗi:  5",
        " Số máy còn thiếu cho HS: 0",
        " Tình trạng Netsupport: T",
        "- Tình trạng Internet:T",
        " Tình trạng loa, âm ly: B",
        " Tình trạng máy lạnh, máy quạt: B",
        " Vệ sinh phòng máy: S",
        " Đã tắt các thiết bị điện chưa: Đ",
    ].join("\n");
    const { values, unknownLabels } = parseLines(content);
    assert.deepEqual(values, { giaoVien: "V.Minh", phongMay: "PM1", loi: "5", thieu: "0", netSupport: "T", internet: "T", amThanh: "B", mayLanh: "B" });
    assert.deepEqual(unknownLabels, []);
});

test("parseLines reports an unknown label that looks like a wanted line", () => {
    const { unknownLabels } = parseLines("BÁO CÁO ĐẦU BUỔI DẠY\n- Tình trạng máy chiếu: T\n- Ghi chú khác: x");
    assert.deepEqual(unknownLabels, ["Tình trạng máy chiếu"]);
});

test("labels survive CRLF, non-breaking spaces and missing diacritics", () => {
    const content = "BÁO CÁO ĐẦU BUỔI DẠY\r\n- Ten giao vien: Ba\r\n- Tình trạng Internet: T\r\n- PHÒNG MÁY: PM3\r\n";
    const { values } = parseLines(content);
    assert.deepEqual(values, { giaoVien: "Ba", internet: "T", phongMay: "PM3" });
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/parseReport.test.ts`
Expected: FAIL (`Cannot find module '../lesson/parseReport.js'`).

- [ ] **Step 3: Viết `lesson/parseReport.ts`**

```ts
import type { LoaiBaoCao } from "./types.js";

export function stripDiacritics(s: string): string {
    return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

const fold = (s: string): string => stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();

export type TitleKind = LoaiBaoCao | "gan_giong" | null;

/** Classifies a message by its title line; `gan_giong` = mentions a start/end report but the title is not the standard one. */
export function classifyTitle(content: string): TitleKind {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const first = fold(lines[0] ?? "");
    if (/^bao cao dau buoi/.test(first)) return "DauBuoi";
    if (/^bao cao cuoi buoi/.test(first)) return "CuoiBuoi";
    const all = fold(content);
    if (/bao cao/.test(all) && /(dau|cuoi) buoi/.test(all)) return "gan_giong";
    return null;
}

export type FieldKey = "giaoVien" | "phongMay" | "loi" | "thieu" | "netSupport" | "internet" | "amThanh" | "mayLanh";

export const FIELD_KEYS: FieldKey[] = ["giaoVien", "phongMay", "loi", "thieu", "netSupport", "internet", "amThanh", "mayLanh"];

const LABELS: Array<{ key: FieldKey; re: RegExp }> = [
    { key: "giaoVien", re: /^ten giao vien$/ },
    { key: "phongMay", re: /^phong may$/ },
    { key: "loi", re: /^tong so may bi loi$/ },
    { key: "thieu", re: /^so may con thieu cho hs$/ },
    { key: "netSupport", re: /^tinh trang netsupport$/ },
    { key: "internet", re: /^tinh trang internet$/ },
    { key: "amThanh", re: /^tinh trang loa,? am ly$/ },
    { key: "mayLanh", re: /^tinh trang may lanh,? may quat$/ },
];

// Lines that appear in real reports and are deliberately not extracted.
const IGNORED_LABEL = /^(ten tro giang|tong so may|so luong hs|ty le hoc sinh|gv quan nhiem|da tat|hs |ghe ngoi|ve sinh|tuan thu|viec tuan thu|danh sach vi pham)/;
// An unrecognised label is only worth a review when it looks like one of the 8 wanted lines.
const SUSPICIOUS_LABEL = /(tinh trang|phong|giao vien|loi|thieu|may )/;

export interface ParsedLines {
    values: Partial<Record<FieldKey, string>>;
    unknownLabels: string[];
}

export function parseLines(content: string): ParsedLines {
    const values: Partial<Record<FieldKey, string>> = {};
    const unknownLabels: string[] = [];
    const lines = content.normalize("NFC").split(/\r?\n/);
    const firstIdx = lines.findIndex((l) => l.trim() !== "");
    for (const line of lines.slice(firstIdx + 1)) {
        const t = line.replace(/^\s*[-•*]?\s*/, "");
        const colon = t.indexOf(":");
        if (colon < 0) continue;
        const rawLabel = t.slice(0, colon).trim();
        const label = fold(rawLabel);
        const value = t.slice(colon + 1).trim();
        const found = LABELS.find((l) => l.re.test(label));
        if (found) {
            if (!(found.key in values)) values[found.key] = value;
        } else if (SUSPICIOUS_LABEL.test(label) && !IGNORED_LABEL.test(label)) {
            unknownLabels.push(rawLabel);
        }
    }
    return { values, unknownLabels };
}

export interface RoomInfo {
    phongMay: string | null;
    coSo: string | null;
}

export function parseRoom(value: string | undefined): RoomInfo {
    if (value === undefined) return { phongMay: null, coSo: null };
    let v = value.replace(/\([^)]*\)/g, " ");
    let coSo: string | null = null;
    const m = /(?:^|[\s,-])(?:cs|cơ sở)\s*(\d+)(?![\p{L}\d])/iu.exec(v);
    if (m) {
        coSo = `CS${m[1]}`;
        v = v.slice(0, m.index) + v.slice(m.index + m[0].length);
    }
    v = v.replace(/^[\s,-]+/, "").replace(/^(phòng máy|phòng)\s+/iu, "").replace(/[\s,-]+$/, "").trim();
    if (v === "") return { phongMay: coSo ? "PM1" : "", coSo };
    return { phongMay: v, coSo };
}

/** Returns T/B/K upper-cased; anything else is returned as written (a caller treats it as invalid); a missing line is null. */
export function parseGrade(value: string | undefined): string | null {
    if (value === undefined) return null;
    const v = value.trim();
    return /^[tbk]$/i.test(v) ? v.toUpperCase() : v;
}

export const isValidFacilityGrade = (g: string | null): boolean => g === "T" || g === "B" || g === "K";

export function parseCount(value: string | undefined): number | null {
    if (value === undefined) return null;
    const m = /^\s*(\d+)/.exec(value);
    return m ? Number(m[1]) : null;
}

/** The text inside the first `( )`: null when there is none, "" for an empty pair. */
export function parseNote(value: string | undefined): string | null {
    if (value === undefined) return null;
    const m = /\(([^)]*)\)/.exec(value);
    return m ? m[1].trim() : null;
}

export function computerGrade(thieu: number | null, loi: number | null): string | null {
    if (thieu === null || loi === null) return null;
    if (thieu === 0) return loi === 0 ? "A" : loi <= 5 ? "B" : loi <= 9 ? "C" : "D";
    return loi >= 10 ? "D" : "C";
}
```

- [ ] **Step 4: Chạy để thấy đạt**

Run: `node --import tsx --test tests/parseReport.test.ts`
Expected: PASS, `tests 8`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lesson/parseReport.ts tests/parseReport.test.ts
git commit -m "feat(lesson): parse start/end report messages line by line"
```

---

### Task 4: Dựng báo cáo và bộ trích xuất tổng (`extractAll`)

**Files:**
- Create: `lesson/build.ts`
- Create: `lesson/roomKey.ts`
- Create: `lesson/extract.ts`
- Test: `tests/fixtures.ts`, `tests/extract.test.ts`

**Interfaces:**
- Consumes: mọi hàm ở Task 2, 3; `vietnamDay` từ `lesson/time.ts`; kiểu từ `lesson/types.ts`.
- Produces:
  - `lesson/roomKey.ts`: `roomLookupName(phongMay): string` (bỏ tiền tố `PM`), `roomKeyString(k: RoomKey): string` (`room|capHoc|tenRieng|coSo|khuVuc`, null → chuỗi rỗng), kiểu `RoomLookup = (keys: RoomKey[]) => Promise<Map<string, number | null>>`.
  - `lesson/build.ts`: `RawFields`, `extractRaw(content, groupName): RawFields`, `applyOverride(raw, sua?): RawFields`, `deriveReport(msg, loaiBaoCao, raw): Report` (`maPhong` luôn `null`, chưa tra DB).
  - `lesson/extract.ts`: `extractAll(messages: SourceMessage[], opts: { day: string; overrides?: Override[]; lookupRoomIds?: RoomLookup }): Promise<{ reports: Report[]; marks: Mark[]; review: ReviewItem[]; summary: { xet; baoCao; boQua; canXem; theoLyDo } }>`. `marks` theo thứ tự gửi tin. Không truyền `lookupRoomIds` thì `maPhong` giữ `null` và không coi là lỗi.

- [ ] **Step 1: Viết fixtures và test thất bại**

Tạo `tests/fixtures.ts` (dữ liệu tổng hợp, tên giả, mô phỏng các trường hợp thật):

```ts
import type { SourceMessage } from "../lesson/types.js";

export const DAY = "2026-09-24";
/** Epoch ms of hour:minute on 2026-09-24 in Vietnam (UTC+7). */
export const at = (hour: number, minute = 0): number => Date.UTC(2026, 8, 24, hour - 7, minute);
export const YESTERDAY = Date.UTC(2026, 8, 23, 1, 0);

const base = { groupId: "g1", groupName: "LC_HoaSen1_TĐ", senderId: "u1", msgType: "desktop.text" };

let seq = 0;
export function msg(content: string, ts: number, extra: Partial<SourceMessage> = {}): SourceMessage {
    seq += 1;
    return { ...base, msgId: `m${seq}`, ts, content, ...extra };
}

export const COMPLETE = [
    "BÁO CÁO ĐẦU BUỔI DẠY",
    "- Tên Giáo Viên: Nguyễn Văn A",
    "- Tên Trợ Giảng: Trần Thị B",
    "- Phòng Máy: PM1",
    "- Tổng số máy: 36",
    "- Tổng số máy bị lỗi: 0",
    "- Số máy còn thiếu cho HS: 0",
    "- Tình trạng Netsupport: T",
    "- Tình trạng Internet:T",
    "- Tình trạng Loa, Âm ly: B",
    "- Tình trạng máy lạnh, máy quạt: K",
].join("\n");

export const IT_MAINTENANCE = COMPLETE.replace("BÁO CÁO ĐẦU BUỔI DẠY", "BÁO CÁO CUỐI BUỔI DẠY").replace("Tổng số máy bị lỗi: 0", "Tổng số máy bị lỗi: IT bảo trì");

export const NO_INTERNET_LINE = COMPLETE.replace("- Tình trạng Internet:T\n", "");

export const COLLEGE_ROOM = COMPLETE.replace("Phòng Máy: PM1", "Phòng Máy: Học tại lớp");

export const FAULTY_WITH_NOTE = COMPLETE.replace("Tổng số máy bị lỗi: 0", "Tổng số máy bị lỗi: 3(máy 35 không lên; máy 41 hỏng màn hình)");

export const SPECIALIST = "BÁO CÁO CHUYÊN MÔN\n- Tên Giáo Viên: Nguyễn Văn A\n- Lớp: 9A";
```

Tạo `tests/extract.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAll } from "../lesson/extract.js";
import { roomKeyString, type RoomLookup } from "../lesson/roomKey.js";
import { at, COLLEGE_ROOM, COMPLETE, DAY, FAULTY_WITH_NOTE, IT_MAINTENANCE, msg, NO_INTERNET_LINE, SPECIALIST, YESTERDAY } from "./fixtures.js";

// Room "1" of HOA SEN 1 exists as Room.Id 399; everything else is unknown.
const lookup: RoomLookup = async (keys) =>
    new Map(keys.map((k) => [roomKeyString(k), k.room === "1" && k.tenRieng === "HOA SEN 1" && k.khuVuc === "TĐ" ? 399 : null]));

test("a complete start report is extracted with status 1 and its room id", async () => {
    const m = msg(COMPLETE, at(8));
    const r = await extractAll([m], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports.length, 1);
    const rep = r.reports[0];
    assert.equal(rep.maTinNhan, m.msgId);
    assert.equal(rep.loaiBaoCao, "DauBuoi");
    assert.equal(rep.data.maTrangThai, 1);
    assert.equal(rep.data.maPhong, 399);
    assert.deepEqual(rep.data.truong, { capHoc: "LC", tenRieng: "HOA SEN 1", coSo: null });
    assert.equal(rep.data.khuVuc, "TĐ");
    assert.equal(rep.data.phongMay, "PM1");
    assert.equal(rep.data.giaoVien, "Nguyễn Văn A");
    assert.deepEqual(
        rep.data.coSoVatChat.map((f) => [f.loai, f.xepLoai]),
        [["AmThanh", "B"], ["NetSupport", "T"], ["MayLanh", "K"], ["Internet", "T"], ["MayTinh", "A"]],
    );
    assert.deepEqual(rep.data.coSoVatChat[4].soLuong, [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0, ghiChu: null }]);
    assert.deepEqual(r.marks, [{ maNhom: "g1", maTinNhan: m.msgId, maTrangThai: 1 }]);
    assert.equal(r.review.length, 0);
});

test("non-numeric fault count gives status 2 and a review item", async () => {
    const m = msg(IT_MAINTENANCE, at(11));
    const r = await extractAll([m], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports[0].loaiBaoCao, "CuoiBuoi");
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.equal(r.reports[0].data.coSoVatChat[4].xepLoai, null);
    assert.deepEqual(r.review.map((x) => x.lyDo), [["so_khong_hop_le"]]);
    assert.deepEqual(r.review[0].truongCanXem, ["loi"]);
    assert.equal(r.review[0].raw, IT_MAINTENANCE);
});

test("a missing wanted line gives status 2 and a review item naming the line", async () => {
    const r = await extractAll([msg(NO_INTERNET_LINE, at(8))], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.equal(r.reports[0].data.coSoVatChat[3].xepLoai, null);
    assert.deepEqual(r.review[0].lyDo, ["thieu_dong"]);
    assert.deepEqual(r.review[0].truongCanXem, ["internet"]);
});

test("a room that is not in the database gives status 2 and phong_khong_tim_thay", async () => {
    const r = await extractAll([msg(COLLEGE_ROOM, at(8))], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports[0].data.maPhong, null);
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.deepEqual(r.review[0].lyDo, ["phong_khong_tim_thay"]);
});

test("without a lookup the room id stays null and is not an error", async () => {
    const r = await extractAll([msg(COMPLETE, at(8))], { day: DAY });
    assert.equal(r.reports[0].data.maPhong, null);
    assert.equal(r.reports[0].data.maTrangThai, 1);
    assert.equal(r.review.length, 0);
});

test("fault note in parentheses is kept", async () => {
    const r = await extractAll([msg(FAULTY_WITH_NOTE, at(8))], { day: DAY, lookupRoomIds: lookup });
    const mayTinh = r.reports[0].data.coSoVatChat[4];
    assert.equal(mayTinh.xepLoai, "B");
    assert.deepEqual(mayTinh.soLuong?.[1], { loai: "Loi", so: 3, ghiChu: "máy 35 không lên; máy 41 hỏng màn hình" });
});

test("other messages are marked -1 and never enter the reports", async () => {
    const photo = msg("", at(8), { msgType: "chat.photo" });
    const specialist = msg(SPECIALIST, at(9));
    const chatter = msg("test báo cáo", at(10));
    const r = await extractAll([photo, specialist, chatter], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports.length, 0);
    assert.deepEqual(r.marks.map((x) => x.maTrangThai), [-1, -1, -1]);
    assert.equal(r.review.length, 0);
});

test("a near-miss title is marked -1 and sent to review", async () => {
    const m = msg("Xin gửi\nbáo cáo đầu buổi hôm nay", at(8));
    const r = await extractAll([m], { day: DAY, lookupRoomIds: lookup });
    assert.deepEqual(r.marks, [{ maNhom: "g1", maTinNhan: m.msgId, maTrangThai: -1 }]);
    assert.deepEqual(r.review.map((x) => x.lyDo), [["gan_giong_tieu_de"]]);
    assert.equal(r.review[0].draft, null);
});

test("only messages of the requested Vietnam day are considered", async () => {
    const old = msg(COMPLETE, YESTERDAY);
    const r = await extractAll([old, msg(COMPLETE, at(8))], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports.length, 1);
    assert.equal(r.summary.xet, 1);
});

test("overrides correct raw fields and the derived values are recomputed", async () => {
    const m = msg(IT_MAINTENANCE, at(11));
    const r = await extractAll([m], {
        day: DAY,
        lookupRoomIds: lookup,
        overrides: [{ key: { maNhom: "g1", maTinNhan: m.msgId }, sua: { loi: 7, ghiChuLoi: "IT đang sửa" } }],
    });
    const mayTinh = r.reports[0].data.coSoVatChat[4];
    assert.equal(mayTinh.xepLoai, "C");
    assert.deepEqual(mayTinh.soLuong?.[1], { loai: "Loi", so: 7, ghiChu: "IT đang sửa" });
    assert.equal(r.reports[0].data.maTrangThai, 1);
    assert.equal(r.review.length, 0);
});

test("an override can include a near-miss title and can drop a message; unknown keys are ignored", async () => {
    const near = msg(COMPLETE.replace("BÁO CÁO ĐẦU BUỔI DẠY", "Gửi báo cáo đầu buổi"), at(8));
    const drop = msg(COMPLETE, at(9));
    const r = await extractAll([near, drop], {
        day: DAY,
        lookupRoomIds: lookup,
        overrides: [
            { key: { maNhom: "g1", maTinNhan: near.msgId }, sua: { loaiBaoCao: "DauBuoi" } },
            { key: { maNhom: "g1", maTinNhan: drop.msgId }, sua: { loaiBo: true } },
            { key: { maNhom: "gX", maTinNhan: "nope" }, sua: { loaiBo: true } },
        ],
    });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].maTinNhan, near.msgId);
    assert.deepEqual(r.marks.map((x) => x.maTrangThai), [1, -1]);
});

test("the room-line branch overrides the school branch and is part of the lookup key", async () => {
    const seen: string[] = [];
    const spy: RoomLookup = async (keys) => {
        seen.push(...keys.map(roomKeyString));
        return new Map();
    };
    await extractAll([msg(COMPLETE.replace("Phòng Máy: PM1", "Phòng Máy: PM1 - CS2"), at(8))], { day: DAY, lookupRoomIds: spy });
    assert.deepEqual(seen, ["1|LC|HOA SEN 1|CS2|TĐ"]);
});

test("a group name without an area goes to review and never crashes", async () => {
    const r = await extractAll([msg(COMPLETE, at(8), { groupName: "bot test" })], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].data.khuVuc, null);
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.deepEqual(r.review[0].lyDo, ["truong_khong_nhan_ra"]);
    assert.deepEqual(r.review[0].truongCanXem, ["khuVuc"]);
});

test("with a session, only that session's messages are considered and marked", async () => {
    const morning = msg(COMPLETE, at(8));
    const afternoon = msg(COMPLETE, at(14));
    const evening = msg("xin chào", at(19));
    const r = await extractAll([morning, afternoon, evening], { day: DAY, buoi: "sang", lookupRoomIds: lookup });
    assert.deepEqual(r.reports.map((x) => x.maTinNhan), [morning.msgId]);
    assert.deepEqual(r.marks.map((x) => x.maTinNhan), [morning.msgId]);
    assert.equal(r.summary.xet, 1);
});

test("the morning/afternoon boundary is 12:00 Vietnam time", async () => {
    const lastMorning = msg(COMPLETE, at(11, 59));
    const firstAfternoon = msg(COMPLETE, at(12, 0));
    const sang = await extractAll([lastMorning, firstAfternoon], { day: DAY, buoi: "sang", lookupRoomIds: lookup });
    const chieu = await extractAll([lastMorning, firstAfternoon], { day: DAY, buoi: "chieu", lookupRoomIds: lookup });
    assert.deepEqual(sang.reports.map((x) => x.maTinNhan), [lastMorning.msgId]);
    assert.deepEqual(chieu.reports.map((x) => x.maTinNhan), [firstAfternoon.msgId]);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/extract.test.ts`
Expected: FAIL (`Cannot find module '../lesson/extract.js'`).

- [ ] **Step 3: Viết `lesson/roomKey.ts`, `lesson/build.ts`, `lesson/extract.ts`**

`lesson/roomKey.ts`:

```ts
import type { RoomKey } from "./types.js";

/** `fn_LookupRoomIds` matches the room name as stored in the Room table, which has no "PM" prefix. */
export function roomLookupName(phongMay: string): string {
    return phongMay.replace(/^PM\s*/i, "").trim();
}

export function roomKeyString(k: RoomKey): string {
    return [k.room, k.capHoc ?? "", k.tenRieng, k.coSo ?? "", k.khuVuc].join("|");
}

/** Resolves a batch of rooms to Room.Id; a key that does not match a room maps to null. */
export type RoomLookup = (keys: RoomKey[]) => Promise<Map<string, number | null>>;
```

`lesson/build.ts`:

```ts
import { computerGrade, FIELD_KEYS, isValidFacilityGrade, parseCount, parseGrade, parseLines, parseNote, parseRoom, type FieldKey } from "./parseReport.js";
import { parseGroupName } from "./schoolArea.js";
import type { CoSoVatChat, LoaiBaoCao, Report, SourceMessage, Sua, Truong } from "./types.js";

/** Everything read straight from one message, before any derived value (grades, status) is computed. */
export interface RawFields {
    phongMay: string | null;
    coSoPhong: string | null;
    giaoVien: string | null;
    thieu: number | null;
    loi: number | null;
    ghiChuLoi: string | null;
    thieuText: string | null;
    loiText: string | null;
    amThanh: string | null;
    netSupport: string | null;
    mayLanh: string | null;
    internet: string | null;
    truong: Truong | null;
    khuVuc: string | null;
    missing: FieldKey[];
    unknownLabels: string[];
}

export function extractRaw(content: string, groupName: string): RawFields {
    const { values, unknownLabels } = parseLines(content);
    const room = parseRoom(values.phongMay);
    const { truong, khuVuc } = parseGroupName(groupName);
    return {
        phongMay: room.phongMay,
        coSoPhong: room.coSo,
        giaoVien: values.giaoVien ?? null,
        thieu: parseCount(values.thieu),
        loi: parseCount(values.loi),
        ghiChuLoi: parseNote(values.loi),
        thieuText: values.thieu ?? null,
        loiText: values.loi ?? null,
        amThanh: parseGrade(values.amThanh),
        netSupport: parseGrade(values.netSupport),
        mayLanh: parseGrade(values.mayLanh),
        internet: parseGrade(values.internet),
        truong,
        khuVuc,
        missing: FIELD_KEYS.filter((k) => values[k] === undefined),
        unknownLabels,
    };
}

const OVERRIDE_TO_FIELD: Partial<Record<keyof Sua, FieldKey>> = {
    phongMay: "phongMay",
    giaoVien: "giaoVien",
    thieu: "thieu",
    loi: "loi",
    amThanh: "amThanh",
    netSupport: "netSupport",
    mayLanh: "mayLanh",
    internet: "internet",
};

/** Applies the raw-field corrections an agent wrote to overrides.json. */
export function applyOverride(raw: RawFields, sua: Sua | undefined): RawFields {
    if (!sua) return raw;
    const out: RawFields = { ...raw };
    for (const key of Object.keys(sua) as Array<keyof Sua>) {
        const field = OVERRIDE_TO_FIELD[key];
        if (field) out.missing = out.missing.filter((k) => k !== field);
    }
    if ("phongMay" in sua) out.phongMay = sua.phongMay ?? null;
    if ("giaoVien" in sua) out.giaoVien = sua.giaoVien ?? null;
    if ("truong" in sua) out.truong = sua.truong ?? null;
    if ("khuVuc" in sua) out.khuVuc = sua.khuVuc ?? null;
    if ("thieu" in sua) {
        out.thieu = sua.thieu ?? null;
        out.thieuText = out.thieu === null ? "" : String(out.thieu);
    }
    if ("loi" in sua) {
        out.loi = sua.loi ?? null;
        out.loiText = out.loi === null ? "" : String(out.loi);
    }
    if ("ghiChuLoi" in sua) out.ghiChuLoi = sua.ghiChuLoi ?? null;
    if ("amThanh" in sua) out.amThanh = sua.amThanh ?? null;
    if ("netSupport" in sua) out.netSupport = sua.netSupport ?? null;
    if ("mayLanh" in sua) out.mayLanh = sua.mayLanh ?? null;
    if ("internet" in sua) out.internet = sua.internet ?? null;
    return out;
}

/** Computes grades and the status (1 = complete, 2 = something missing/invalid). `maPhong` is filled in later by the room lookup. */
export function deriveReport(msg: SourceMessage, loaiBaoCao: LoaiBaoCao, raw: RawFields): Report {
    let maTrangThai = 1;
    if (!raw.phongMay) maTrangThai = 2;
    if (!raw.giaoVien) maTrangThai = 2;

    const grades: CoSoVatChat[] = [
        { loai: "AmThanh", xepLoai: raw.amThanh },
        { loai: "NetSupport", xepLoai: raw.netSupport },
        { loai: "MayLanh", xepLoai: raw.mayLanh },
        { loai: "Internet", xepLoai: raw.internet },
    ];
    for (const g of grades) if (!isValidFacilityGrade(g.xepLoai)) maTrangThai = 2;

    const mayTinhGrade = computerGrade(raw.thieu, raw.loi);
    if (mayTinhGrade === null) maTrangThai = 2;

    return {
        maTinNhan: msg.msgId,
        maNguoiGui: msg.senderId,
        maNhom: msg.groupId,
        thoiGian: msg.ts,
        loaiBaoCao,
        data: {
            maTrangThai,
            maPhong: null,
            truong: raw.truong && raw.coSoPhong ? { ...raw.truong, coSo: raw.coSoPhong } : raw.truong,
            khuVuc: raw.khuVuc,
            phongMay: raw.phongMay,
            giaoVien: raw.giaoVien,
            coSoVatChat: [
                ...grades,
                {
                    loai: "MayTinh",
                    xepLoai: mayTinhGrade,
                    soLuong: [
                        { loai: "Thieu", so: raw.thieu },
                        { loai: "Loi", so: raw.loi, ghiChu: raw.ghiChuLoi },
                    ],
                },
            ],
        },
    };
}
```

`lesson/extract.ts`:

```ts
import { applyOverride, deriveReport, extractRaw, type RawFields } from "./build.js";
import { classifyTitle } from "./parseReport.js";
import { roomKeyString, roomLookupName, type RoomLookup } from "./roomKey.js";
import { sessionOf, vietnamDay, type Buoi } from "./time.js";
import type { LyDo, Mark, Override, Report, ReviewItem, RoomKey, SourceMessage } from "./types.js";

export interface ExtractOptions {
    /** `YYYY-MM-DD` on the Vietnam calendar; only messages sent that day are considered. */
    day: string;
    /** Only messages sent in this session of that day; omit to consider the whole day. */
    buoi?: Buoi;
    overrides?: Override[];
    /** Omit to skip the room lookup (offline runs and tests): `maPhong` stays null and is not treated as an error. */
    lookupRoomIds?: RoomLookup;
}

export interface ExtractResult {
    reports: Report[];
    marks: Mark[];
    review: ReviewItem[];
    summary: { xet: number; baoCao: number; boQua: number; canXem: number; theoLyDo: Partial<Record<LyDo, number>> };
}

const keyOf = (maNhom: string, maTinNhan: string) => `${maNhom}|${maTinNhan}`;

function flagsFor(raw: RawFields): { lyDo: LyDo[]; truongCanXem: string[] } {
    const lyDo: LyDo[] = [];
    const truongCanXem: string[] = [];
    if (raw.unknownLabels.length > 0) {
        lyDo.push("khong_nhan_ra_nhan");
        truongCanXem.push(...raw.unknownLabels);
    }
    if (raw.missing.length > 0) {
        lyDo.push("thieu_dong");
        truongCanXem.push(...raw.missing);
    }
    const bad: string[] = [];
    if (raw.thieu === null && raw.thieuText !== null && raw.thieuText.trim() !== "") bad.push("thieu");
    if (raw.loi === null && raw.loiText !== null && raw.loiText.trim() !== "") bad.push("loi");
    if (bad.length > 0) {
        lyDo.push("so_khong_hop_le");
        truongCanXem.push(...bad);
    }
    if (!raw.truong || !raw.khuVuc) {
        lyDo.push("truong_khong_nhan_ra");
        truongCanXem.push(...(!raw.truong ? ["truong"] : []), ...(!raw.khuVuc ? ["khuVuc"] : []));
    }
    return { lyDo, truongCanXem };
}

interface Pending {
    msg: SourceMessage;
    report: Report;
    lyDo: LyDo[];
    truongCanXem: string[];
    roomKey: RoomKey | null;
}

export async function extractAll(messages: SourceMessage[], opts: ExtractOptions): Promise<ExtractResult> {
    const overrides = new Map((opts.overrides ?? []).map((o) => [keyOf(o.key.maNhom, o.key.maTinNhan), o]));
    const dayMessages = messages
        .filter((m) => vietnamDay(m.ts) === opts.day && (opts.buoi === undefined || sessionOf(m.ts) === opts.buoi))
        .sort((a, b) => a.ts - b.ts);

    const marks: Mark[] = [];
    const review: ReviewItem[] = [];
    const pending: Pending[] = [];
    const mark = (m: SourceMessage, maTrangThai: number) => marks.push({ maNhom: m.groupId, maTinNhan: m.msgId, maTrangThai });

    for (const m of dayMessages) {
        const key = { maNhom: m.groupId, maTinNhan: m.msgId };
        const ov = overrides.get(keyOf(m.groupId, m.msgId));
        if (m.msgType !== "desktop.text" || ov?.sua.loaiBo) {
            mark(m, -1);
            continue;
        }
        const kind = ov?.sua.loaiBaoCao ?? classifyTitle(m.content);
        if (kind === null) {
            mark(m, -1);
            continue;
        }
        if (kind === "gan_giong") {
            mark(m, -1);
            review.push({ key, lyDo: ["gan_giong_tieu_de"], raw: m.content, draft: null, truongCanXem: ["loaiBaoCao"] });
            continue;
        }

        const raw = applyOverride(extractRaw(m.content, m.groupName), ov?.sua);
        const report = deriveReport(m, kind, raw);
        const { lyDo, truongCanXem } = flagsFor(raw);
        const roomKey: RoomKey | null =
            raw.phongMay && raw.truong && raw.khuVuc
                ? { room: roomLookupName(raw.phongMay), capHoc: raw.truong.capHoc, tenRieng: raw.truong.tenRieng, coSo: report.data.truong?.coSo ?? null, khuVuc: raw.khuVuc }
                : null;
        pending.push({ msg: m, report, lyDo, truongCanXem, roomKey });
    }

    if (opts.lookupRoomIds) {
        const keys = pending.flatMap((p) => (p.roomKey ? [p.roomKey] : []));
        const found = keys.length > 0 ? await opts.lookupRoomIds(keys) : new Map<string, number | null>();
        for (const p of pending) {
            p.report.data.maPhong = p.roomKey ? (found.get(roomKeyString(p.roomKey)) ?? null) : null;
            if (p.report.data.maPhong === null) {
                p.report.data.maTrangThai = 2;
                if (p.roomKey) {
                    p.lyDo.push("phong_khong_tim_thay");
                    p.truongCanXem.push("phongMay");
                }
            }
        }
    }

    const reports: Report[] = [];
    for (const p of pending) {
        reports.push(p.report);
        mark(p.msg, p.report.data.maTrangThai);
        if (p.lyDo.length > 0) {
            review.push({ key: { maNhom: p.msg.groupId, maTinNhan: p.msg.msgId }, lyDo: p.lyDo, raw: p.msg.content, draft: p.report, truongCanXem: p.truongCanXem });
        }
    }

    const order = new Map(dayMessages.map((m, i) => [keyOf(m.groupId, m.msgId), i]));
    marks.sort((a, b) => order.get(keyOf(a.maNhom, a.maTinNhan))! - order.get(keyOf(b.maNhom, b.maTinNhan))!);

    const theoLyDo: Partial<Record<LyDo, number>> = {};
    for (const r of review) for (const l of r.lyDo) theoLyDo[l] = (theoLyDo[l] ?? 0) + 1;
    return {
        reports,
        marks,
        review,
        summary: { xet: dayMessages.length, baoCao: reports.length, boQua: marks.filter((x) => x.maTrangThai === -1).length, canXem: review.length, theoLyDo },
    };
}
```

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npm test`
Expected: PASS toàn bộ (Task 1–4: `fail 0`).

- [ ] **Step 5: Đối chiếu với kết quả thật (không commit)**

Dữ liệu thật đã cào nằm ở `data/`; bot của người dùng đã từng tạo `output/output.json`. Chạy một lần để chắc script không lệch:

```bash
node --import tsx -e "
import('./lesson/extract.js').then(async ({ extractAll }) => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const msgs = [];
  for (const f of fs.readdirSync('data').filter((x) => /^g\d+\.json\$/.test(x))) msgs.push(...JSON.parse(fs.readFileSync(path.join('data', f), 'utf8')));
  const r = await extractAll(msgs, { day: '2026-09-24' });
  console.log(JSON.stringify(r.summary));
});"
```

Expected: in ra một dòng JSON `{"xet":..,"baoCao":..,...}` với `baoCao` >= 12 và không lỗi. (Khi đã kiểm chứng ở giai đoạn thiết kế: 11/12 báo cáo cũ khớp hoàn toàn với bot; khác biệt duy nhất là dòng thiếu → `null` thay vì `""`.)

- [ ] **Step 6: Commit**

```bash
git add lesson/build.ts lesson/roomKey.ts lesson/extract.ts tests/fixtures.ts tests/extract.test.ts
git commit -m "feat(lesson): extract start/end reports with review flags and overrides"
```

---

### Task 5: Dựng các dòng phẳng cho sheet `data`

**Files:**
- Create: `lesson/codes.ts`
- Create: `lesson/rows.ts`
- Test: `tests/rows.test.ts`

**Interfaces:**
- Consumes: `Report` (Task 1), `excelDateSerial`/`excelTimeFraction` (Task 1).
- Produces: `lesson/codes.ts` xuất `REPORT_TYPE_ID`, `FACILITY_TYPE_ID`, `QUANTITY_TYPE_ID`, `DATA_SHEET_COLUMNS` (20 tên cột, `as const`). `lesson/rows.ts` xuất `Cell = string | number | null`, `SheetRow = Cell[]`, `buildRows(reports: Report[], newId?: () => string): SheetRow[]` — mỗi dòng đúng 20 ô; báo cáo có `maPhong === null` bị bỏ qua.

- [ ] **Step 1: Viết test thất bại**

Tạo `tests/rows.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA_SHEET_COLUMNS } from "../lesson/codes.js";
import { extractAll } from "../lesson/extract.js";
import { roomKeyString, type RoomLookup } from "../lesson/roomKey.js";
import { buildRows } from "../lesson/rows.js";
import { at, COMPLETE, DAY, FAULTY_WITH_NOTE, msg } from "./fixtures.js";

const col = (name: (typeof DATA_SHEET_COLUMNS)[number]) => DATA_SHEET_COLUMNS.indexOf(name);
const roomId = (id: number | null): RoomLookup => async (keys) => new Map(keys.map((k) => [roomKeyString(k), id]));

test("a report becomes one row per facility, two for the computer", async () => {
    const r = await extractAll([msg(FAULTY_WITH_NOTE, at(8, 25))], { day: DAY, lookupRoomIds: roomId(399) });
    let n = 0;
    const rows = buildRows(r.reports, () => `id-${++n}`);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.length === DATA_SHEET_COLUMNS.length));

    const first = rows[0];
    assert.equal(first[col("Id")], "id-1");
    assert.equal(first[col("TypeId")], 1);
    assert.equal(first[col("Employee")], "Nguyễn Văn A");
    assert.equal(first[col("RoomId")], 399);
    assert.equal(first[col("School")], "LC HOA SEN 1");
    assert.equal(first[col("Area")], "TĐ");
    assert.equal(first[col("Room")], "PM1");
    assert.equal(first[col("Date")], 46289);
    assert.equal(first[col("Time")], (8 * 60 + 25) / 1440);

    assert.deepEqual(rows.map((x) => x[col("FacilityTypeId")]), [4, 2, 5, 3, 1, 1]);
    assert.deepEqual(rows.map((x) => x[col("FacilityGrade")]), ["B", "T", "K", "T", "B", "B"]);
    assert.equal(rows[0][col("QuantityTypeId")], null);

    const [thieu, loi] = rows.slice(4);
    assert.equal(thieu[col("FacilityId")], loi[col("FacilityId")]);
    assert.equal(thieu[col("QuantityTypeId")], 1);
    assert.equal(thieu[col("Quantity")], 0);
    assert.equal(loi[col("QuantityTypeId")], 2);
    assert.equal(loi[col("Quantity")], 3);
    assert.equal(loi[col("QuantityNote")], "máy 35 không lên; máy 41 hỏng màn hình");
    assert.equal(new Set(rows.map((x) => x[col("FacilityId")])).size, 5);
});

test("a report without a room id is left out of the sheet", async () => {
    const r = await extractAll([msg(COMPLETE, at(8))], { day: DAY, lookupRoomIds: roomId(null) });
    assert.equal(r.reports.length, 1);
    assert.deepEqual(buildRows(r.reports), []);
});

test("an invalid grade keeps its text; a blank or missing grade becomes an empty cell", async () => {
    const invalid = await extractAll([msg(COMPLETE.replace("Tình trạng Netsupport: T", "Tình trạng Netsupport: Ổn"), at(8))], { day: DAY, lookupRoomIds: roomId(1) });
    const netSupport = buildRows(invalid.reports).find((x) => x[col("FacilityTypeId")] === 2)!;
    assert.equal(netSupport[col("FacilityGrade")], "Ổn");

    const blank = await extractAll([msg(COMPLETE.replace("Tình trạng Netsupport: T", "Tình trạng Netsupport: "), at(9))], { day: DAY, lookupRoomIds: roomId(1) });
    assert.equal(buildRows(blank.reports).find((x) => x[col("FacilityTypeId")] === 2)![col("FacilityGrade")], null);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/rows.test.ts`
Expected: FAIL (`Cannot find module '../lesson/rows.js'`).

- [ ] **Step 3: Viết `lesson/codes.ts` và `lesson/rows.ts`**

`lesson/codes.ts`:

```ts
/** Numeric codes of the system's lookup table (see the design spec, "Bảng mã"). */
export const REPORT_TYPE_ID = { DauBuoi: 1, CuoiBuoi: 2 } as const;
export const FACILITY_TYPE_ID = { MayTinh: 1, NetSupport: 2, Internet: 3, AmThanh: 4, MayLanh: 5 } as const;
export const QUANTITY_TYPE_ID = { Thieu: 1, Loi: 2 } as const;

/** Header of the `data` sheet in templates/Temp_RoomFacility_rpt.xlsm, in order. */
export const DATA_SHEET_COLUMNS = [
    "Id", "MessageId", "SenderId", "GroupId", "Timestamp", "Date", "Time", "TypeId", "Employee", "RoomId",
    "School", "Area", "Room", "FacilityId", "FacilityTypeId", "FacilityGrade", "FacilityNote", "QuantityTypeId", "Quantity", "QuantityNote",
] as const;
```

`lesson/rows.ts`:

```ts
import { randomUUID } from "node:crypto";
import { DATA_SHEET_COLUMNS, FACILITY_TYPE_ID, QUANTITY_TYPE_ID, REPORT_TYPE_ID } from "./codes.js";
import { excelDateSerial, excelTimeFraction } from "./time.js";
import type { Report } from "./types.js";

export type Cell = string | number | null;
export type SheetRow = Cell[];

function schoolName(t: Report["data"]["truong"]): string {
    return t ? [t.capHoc, t.tenRieng, t.coSo].filter(Boolean).join(" ") : "";
}

/**
 * Flattens reports into rows of the template's `data` sheet: one row per
 * (facility, quantity) pair, report-level columns repeated. A report without a
 * room id is skipped — the template's macro would merge all such rows of a day.
 */
export function buildRows(reports: Report[], newId: () => string = randomUUID): SheetRow[] {
    const rows: SheetRow[] = [];
    for (const r of reports) {
        if (r.data.maPhong === null) continue;
        const reportId = newId();
        const head: Cell[] = [
            reportId, r.maTinNhan, r.maNguoiGui, r.maNhom, r.thoiGian, excelDateSerial(r.thoiGian), excelTimeFraction(r.thoiGian),
            REPORT_TYPE_ID[r.loaiBaoCao], r.data.giaoVien, r.data.maPhong, schoolName(r.data.truong), r.data.khuVuc, r.data.phongMay,
        ];
        for (const f of r.data.coSoVatChat) {
            const facilityId = newId();
            const grade = f.xepLoai === null || f.xepLoai === "" ? null : f.xepLoai;
            const facility: Cell[] = [facilityId, FACILITY_TYPE_ID[f.loai], grade, null];
            if (f.soLuong) {
                for (const q of f.soLuong) rows.push([...head, ...facility, QUANTITY_TYPE_ID[q.loai], q.so, q.ghiChu ?? null]);
            } else {
                rows.push([...head, ...facility, null, null, null]);
            }
        }
    }
    for (const row of rows) if (row.length !== DATA_SHEET_COLUMNS.length) throw new Error(`row has ${row.length} cells, expected ${DATA_SHEET_COLUMNS.length}`);
    return rows;
}
```

- [ ] **Step 4: Chạy để thấy đạt**

Run: `npm test`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add lesson/codes.ts lesson/rows.ts tests/rows.test.ts
git commit -m "feat(lesson): flatten reports into rows of the template data sheet"
```

---

### Task 6: CLI `extract:reports`, đọc `overrides.json` và tra `RoomId` từ DB

**Files:**
- Create: `lesson/overrides.ts`
- Create: `lesson/roomLookup.ts`
- Create: `extractLessonReports.ts`
- Modify: `package.json` (thêm script `extract:reports`)
- Test: `tests/overrides.test.ts`

**Interfaces:**
- Consumes: `extractAll` (Task 4), `todayVietnam` (Task 1), `roomKeyString`/`RoomLookup` (Task 4), `MessageStore` (`store/messageStore.ts`, `listThreads()` và `readThread()`), `connectDb`/`sql` (`store/db.ts`).
- Produces: `readOverrides(file: string): Override[]` (`lesson/overrides.ts`); `lookupRoomIds: RoomLookup` (`lesson/roomLookup.ts`, gọi `dbo.fn_LookupRoomIds` một lần cho cả lô, `Type = 0` và `RoomIds` là số → `RoomId`, còn lại `null`); CLI `npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]` ghi `output/output.json`, `output/marks.json`, `output/review.json`, `output/meta.json` (`{ day, buoi }`; luôn ghi đủ bốn file, kể cả khi rỗng) và in bản tóm tắt. `--buoi` mặc định là buổi của thời điểm chạy.

- [ ] **Step 1: Viết test thất bại cho `readOverrides`**

Tạo `tests/overrides.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readOverrides } from "../lesson/overrides.js";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "overrides-"));
const write = (name: string, content: string) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, content, "utf8");
    return file;
};

test("a missing file means no corrections", () => {
    assert.deepEqual(readOverrides(path.join(dir, "nope.json")), []);
});

test("a valid file is read, including one written with a BOM", () => {
    const body = JSON.stringify([{ key: { maNhom: "g1", maTinNhan: "m1" }, sua: { loi: 3 } }]);
    assert.deepEqual(readOverrides(write("ok.json", body)), [{ key: { maNhom: "g1", maTinNhan: "m1" }, sua: { loi: 3 } }]);
    assert.deepEqual(readOverrides(write("bom.json", `﻿${body}`)).length, 1);
});

test("invalid JSON is reported with the file name", () => {
    const file = write("bad.json", "{ not json");
    assert.throws(() => readOverrides(file), (e: Error) => e.message.includes("bad.json") && /not valid JSON/.test(e.message));
});

test("a wrong shape is reported with the entry index", () => {
    assert.throws(() => readOverrides(write("obj.json", "{}")), /must be a JSON array/);
    assert.throws(() => readOverrides(write("shape.json", JSON.stringify([{ key: { maNhom: "g1" }, sua: {} }]))), /entry 0/);
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `node --import tsx --test tests/overrides.test.ts`
Expected: FAIL (`Cannot find module '../lesson/overrides.js'`).

- [ ] **Step 3: Viết `lesson/overrides.ts`, `lesson/roomLookup.ts` và `extractLessonReports.ts`**

`lesson/overrides.ts`:

```ts
import fs from "node:fs";
import type { Override } from "./types.js";

/** Reads output/overrides.json; a missing file means "no corrections". */
export function readOverrides(file: string): Override[] {
    if (!fs.existsSync(file)) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    } catch (err) {
        throw new Error(`${file} is not valid JSON: ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${file} must be a JSON array of { key, sua }`);
    parsed.forEach((o, i) => {
        const ok = o && typeof o === "object" && o.key && typeof o.key.maNhom === "string" && typeof o.key.maTinNhan === "string" && o.sua && typeof o.sua === "object";
        if (!ok) throw new Error(`${file}: entry ${i} must look like { "key": { "maNhom": "...", "maTinNhan": "..." }, "sua": { ... } }`);
    });
    return parsed as Override[];
}
```

`lesson/roomLookup.ts`:

```ts
import { connectDb, sql } from "../store/db.js";
import { roomKeyString, type RoomLookup } from "./roomKey.js";

interface Row {
    Room: string;
    SchoolLevel: string | null;
    SchoolBaseName: string;
    SchoolBranch: string | null;
    Area: string;
    RoomIds: string | null;
    Type: number;
}

/**
 * Resolves rooms with dbo.fn_LookupRoomIds in one round trip for the whole
 * batch. `Type = 0` means found; any other value (2 = no such room, 3 = no such
 * school) or a non-numeric `RoomIds` maps to null.
 */
export const lookupRoomIds: RoomLookup = async (keys) => {
    const pool = await connectDb();
    try {
        const table = new sql.Table("RoomSchoolArea");
        table.columns.add("Room", sql.NVarChar(200));
        table.columns.add("SchoolLevel", sql.NVarChar(50));
        table.columns.add("SchoolBaseName", sql.NVarChar(100));
        table.columns.add("SchoolBranch", sql.NVarChar(50));
        table.columns.add("Area", sql.NVarChar(50));
        for (const k of keys) table.rows.add(k.room, k.capHoc, k.tenRieng, k.coSo, k.khuVuc);

        const result = await pool
            .request()
            .input("t", table)
            .query("SELECT Room, SchoolLevel, SchoolBaseName, SchoolBranch, Area, RoomIds, Type FROM dbo.fn_LookupRoomIds(@t)");

        const found = new Map<string, number | null>();
        for (const row of result.recordset as Row[]) {
            const key = roomKeyString({ room: row.Room, capHoc: row.SchoolLevel, tenRieng: row.SchoolBaseName, coSo: row.SchoolBranch, khuVuc: row.Area });
            found.set(key, row.Type === 0 && /^\d+$/.test(String(row.RoomIds ?? "")) ? Number(row.RoomIds) : null);
        }
        return found;
    } finally {
        await pool.close();
    }
};
```

`extractLessonReports.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractAll } from "./lesson/extract.js";
import { readOverrides } from "./lesson/overrides.js";
import { lookupRoomIds } from "./lesson/roomLookup.js";
import { currentSession, isBuoi, todayVietnam, type Buoi } from "./lesson/time.js";
import type { SourceMessage } from "./lesson/types.js";
import { MessageStore } from "./store/messageStore.js";

/**
 * Extracts every start/end-of-lesson report of ONE session (sáng/chiều/tối) of
 * one Vietnam calendar day from the scraped `data/<groupId>.json` files and
 * writes, into `output/`:
 *   output.json  — the valid reports (input of `fill:report`)
 *   marks.json   — StatusId for every message considered (input of `mark:messages`)
 *   review.json  — reports the agent should check against the raw text
 *   meta.json    — { day, buoi } so `fill:report` can name the Excel file
 * `output/overrides.json`, when present, holds the agent's corrections.
 *
 *   npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]
 *
 * `--buoi` defaults to the session of the current time.
 */
const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(repoRoot, "output");

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function writeJson(file: string, value: unknown): void {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, file), JSON.stringify(value, null, 2), "utf8");
}

async function main(): Promise<void> {
    const day = option("--day") ?? todayVietnam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isBuoi(buoiArg)) throw new Error(`--buoi must be sang, chieu or toi, got "${buoiArg}"`);
    const buoi: Buoi = buoiArg ?? currentSession();
    const noDb = process.argv.includes("--no-db");

    const store = new MessageStore();
    const messages: SourceMessage[] = [];
    for (const groupId of store.listThreads()) messages.push(...(await store.readThread(groupId)));

    const result = await extractAll(messages, {
        day,
        buoi,
        overrides: readOverrides(path.join(outDir, "overrides.json")),
        lookupRoomIds: noDb ? undefined : lookupRoomIds,
    });

    writeJson("output.json", result.reports);
    writeJson("marks.json", result.marks);
    writeJson("review.json", result.review);
    writeJson("meta.json", { day, buoi });

    const s = result.summary;
    console.log(`[extract] ngày ${day}, buổi ${buoi}: xét ${s.xet} tin, ${s.baoCao} báo cáo, ${s.boQua} tin bỏ qua (-1), ${s.canXem} mục cần xem${noDb ? " (không tra DB)" : ""}`);
    for (const [lyDo, n] of Object.entries(s.theoLyDo)) console.log(`  ${lyDo}: ${n}`);
    if (s.canXem > 0) console.log(`[extract] xem output/review.json, sửa bằng output/overrides.json rồi chạy lại lệnh này.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
```

Trong `package.json`, thêm vào `"scripts"`:

```json
        "extract:reports": "tsx extractLessonReports.ts"
```

- [ ] **Step 4: Chạy test và typecheck**

Run: `npm test`
Expected: PASS toàn bộ.
Run: `npm run typecheck`
Expected: không có lỗi (đường cơ sở trước khi làm plan là sạch).

- [ ] **Step 5: Chạy thật trên dữ liệu đã cào, cả hai chế độ**

Run: `npm run extract:reports -- --no-db`
Expected: dòng `[extract] ngày <hôm nay>, buổi <buổi hiện tại>: xét N tin, M báo cáo, ... (không tra DB)`; file `output/output.json`, `output/marks.json`, `output/review.json`, `output/meta.json` được ghi; không lỗi. Nếu hôm nay chưa có tin nào trong buổi này, chạy với `--day 2026-09-24 --buoi sang` (ngày đã có dữ liệu thật).
Run: `npm run extract:reports -- --day 2026-09-24 --buoi chieu --no-db`
Expected: chỉ số tin `xét` của buổi chiều, khác với buổi sáng; `output/meta.json` là `{"day":"2026-09-24","buoi":"chieu"}`.
Run: `npm run extract:reports -- --buoi sáng`
Expected: lỗi `--buoi must be sang, chieu or toi` và mã thoát 1.
Run: `npm run extract:reports -- --day 2026-09-24 --buoi sang`
Expected: tra DB thành công (không lỗi kết nối); trong `output/output.json` mỗi báo cáo có `data.maPhong` là số cho phòng có trong DB (ví dụ 399 cho Hoa Sen 1 phòng PM1) và `null` cho `Học tại lớp`; `output/review.json` liệt kê `phong_khong_tim_thay` cho báo cáo đó.
Mở `output/review.json` và kiểm tra mỗi mục có đủ `key`, `lyDo`, `raw`, `draft`, `truongCanXem`.

- [ ] **Step 6: Thử vòng agent sửa**

Tạo `output/overrides.json` với nội dung sửa một báo cáo trong `review.json` (ví dụ đặt `loi` cho một mục `so_khong_hop_le`), chạy lại `npm run extract:reports -- --day 2026-09-24 --buoi sang`.
Expected: mục đó biến mất khỏi `review.json`, `maTrangThai` và `xepLoai` máy tính được tính lại. Xóa `output/overrides.json` sau khi thử.

- [ ] **Step 7: Commit**

```bash
git add lesson/overrides.ts lesson/roomLookup.ts extractLessonReports.ts tests/overrides.test.ts package.json
git commit -m "feat(lesson): extract:reports CLI with room lookup and agent overrides"
```

---

### Task 7: Điền file Excel mẫu và chạy macro (`fill:report`)

**Files:**
- Create: `scripts/fill-template.ps1`
- Create: `fillRoomFacilityReport.ts`
- Modify: `package.json` (thêm script `fill:report`)

**Interfaces:**
- Consumes: `buildRows` (Task 5), `todayVietnam` (Task 1), `Report` (Task 1); `output/output.json` từ Task 6.
- Produces: CLI `npm run fill:report -- <output.json> [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--template <path>]` (ngày và buổi lấy từ `meta.json` nằm cùng thư mục với `<output.json>` nếu không truyền) ghi `output/rows.json` và `data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm` (ví dụ `baocaobuoisang_250926.xlsm`); thoát mã 1 nếu macro lỗi hoặc 5 bảng vẫn trống. Script PowerShell nhận `-Template -Out -RowsJson -LogFile`.

Bối cảnh đã kiểm chứng khi thiết kế (đừng làm khác): việc điền 5 bảng nằm trong `Workbook_Open` của file mẫu, chỉ chạy khi cả 5 bảng còn trống; nên phải mở workbook với `EnableEvents = $false`, ghi sheet `data`, bật lại rồi gọi `Application.Run "ThisWorkbook.Workbook_Open"`. `WriteData` là hàm phụ có tham số, không gọi trực tiếp. Excel COM không cho đọc `VBProject` nên đừng thử.

- [ ] **Step 1: Viết `scripts/fill-template.ps1`**

```powershell
param(
    [Parameter(Mandatory = $true)][string]$Template,
    [Parameter(Mandatory = $true)][string]$Out,
    [Parameter(Mandatory = $true)][string]$RowsJson,
    [Parameter(Mandatory = $true)][string]$LogFile
)
# Copies the template, writes the flattened rows into its `data` sheet with
# Excel events disabled (so Workbook_Open does not run on an empty sheet), then
# re-enables events and runs Workbook_Open, which fills the five report tables.
$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]
$failed = $false
$xl = $null
try {
    New-Item -ItemType Directory -Force (Split-Path -Parent $Out) | Out-Null
    Copy-Item $Template $Out -Force

    $rows = Get-Content $RowsJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $n = $rows.Count
    $c = 20
    $arr = New-Object 'object[,]' $n, $c
    for ($i = 0; $i -lt $n; $i++) {
        for ($j = 0; $j -lt $c; $j++) {
            $v = $rows[$i][$j]
            if ($v -is [string] -and $v -eq '') { $v = $null }
            $arr[$i, $j] = $v
        }
    }

    $xl = New-Object -ComObject Excel.Application
    $xl.Visible = $false
    $xl.DisplayAlerts = $false
    $xl.AutomationSecurity = 1
    $xl.EnableEvents = $false

    $wb = $xl.Workbooks.Open($Out)
    $ws = $wb.Worksheets.Item('data')
    $ws.Range($ws.Cells(2, 1), $ws.Cells(1 + $n, $c)).Value2 = $arr
    $ws.Range($ws.Cells(2, 5), $ws.Cells(1 + $n, 5)).NumberFormat = '0'
    $ws.Range($ws.Cells(2, 6), $ws.Cells(1 + $n, 6)).NumberFormat = 'dd/mm/yyyy'
    $ws.Range($ws.Cells(2, 7), $ws.Cells(1 + $n, 7)).NumberFormat = 'hh:mm'
    $log.Add("filled $n rows into data")

    $xl.EnableEvents = $true
    try {
        $xl.Run('ThisWorkbook.Workbook_Open')
        $log.Add('macro OK: ThisWorkbook.Workbook_Open')
    } catch {
        $failed = $true
        $log.Add("macro FAILED: $($_.Exception.Message)")
    }

    $total = 0
    foreach ($sn in 'MAY TINH', 'INTERNET', 'NETSUPPORT', 'LOA', 'MAY LANH') {
        $lo = $wb.Worksheets.Item($sn).ListObjects.Item(1)
        $cnt = 0
        if ($null -ne $lo.DataBodyRange) { $cnt = $lo.DataBodyRange.Rows.Count }
        $total += $cnt
        $log.Add("$sn table rows: $cnt")
    }
    if ($total -eq 0) { $failed = $true; $log.Add('ERR: 5 bang bao cao van trong sau khi chay macro') }

    $wb.SaveAs($Out, 52)
    $wb.Close($false)
} catch {
    $failed = $true
    $log.Add("ERR: $($_.Exception.Message)")
} finally {
    if ($null -ne $xl) {
        $xl.Quit()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    }
}
$log | Out-File -FilePath $LogFile -Encoding utf8
if ($failed) { exit 1 }
```

- [ ] **Step 2: Viết `fillRoomFacilityReport.ts`**

```ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRows } from "./lesson/rows.js";
import { isBuoi, reportFileName, todayVietnam } from "./lesson/time.js";
import type { Report } from "./lesson/types.js";

/**
 * Fills a copy of templates/Temp_RoomFacility_rpt.xlsm with the reports of
 * `output/output.json` and runs the workbook's own macro so its five report
 * tables (MAY TINH, INTERNET, NETSUPPORT, LOA, MAY LANH) populate. Needs
 * Microsoft Excel on this machine. The template itself is never modified.
 *
 *   npm run fill:report -- output/output.json [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--template <path>]
 *
 * Day and session default to `meta.json` next to the input (written by
 * `extract:reports`); the output file is data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm.
 */
const repoRoot = path.dirname(fileURLToPath(import.meta.url));

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const inputPath = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--")));
    if (!inputPath) throw new Error("Usage: npm run fill:report -- <output.json> [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--template <path>]");

    const reports = JSON.parse(fs.readFileSync(inputPath, "utf8")) as Report[];
    const rows = buildRows(reports);
    if (rows.length === 0) {
        console.log(`[fill] ${reports.length} báo cáo nhưng không có báo cáo nào có RoomId — không tạo file Excel.`);
        return;
    }

    const metaFile = path.join(path.dirname(path.resolve(inputPath)), "meta.json");
    const meta: { day?: string; buoi?: string } = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8").replace(/^\uFEFF/, "")) : {};
    const day = option("--day") ?? meta.day ?? todayVietnam();
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isBuoi(buoi)) throw new Error("Cần --buoi sang|chieu|toi hoặc output/meta.json do extract:reports tạo.");
    const template = path.resolve(option("--template") ?? path.join(repoRoot, "..", "templates", "Temp_RoomFacility_rpt.xlsm"));
    if (!fs.existsSync(template)) throw new Error(`Template not found: ${template}`);

    const outDir = path.join(repoRoot, "output");
    fs.mkdirSync(outDir, { recursive: true });
    const rowsFile = path.join(outDir, "rows.json");
    fs.writeFileSync(rowsFile, JSON.stringify(rows), "utf8");

    const outFile = path.join(repoRoot, "data", "export", reportFileName(day, buoi));
    const logFile = path.join(outDir, "fill.log");
    fs.rmSync(logFile, { force: true });

    let failed = false;
    try {
        execFileSync(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(repoRoot, "scripts", "fill-template.ps1"), "-Template", template, "-Out", outFile, "-RowsJson", rowsFile, "-LogFile", logFile],
            { stdio: "inherit", timeout: 5 * 60_000 },
        );
    } catch (err) {
        failed = true;
        console.error(`[fill] PowerShell failed: ${(err as Error).message}`);
    }

    if (fs.existsSync(logFile)) console.log(fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd());
    if (failed) process.exit(1);
    console.log(`[fill] ${rows.length} dòng -> ${outFile}`);
}

try {
    main();
} catch (err) {
    console.error((err as Error).message);
    process.exit(1);
}
```

Trong `package.json`, thêm vào `"scripts"`:

```json
        "fill:report": "tsx fillRoomFacilityReport.ts"
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: không lỗi.

- [ ] **Step 4: Chạy thật (cần Excel; dùng output của Task 6 Step 5)**

Trước đó chạy lại `npm run extract:reports -- --day 2026-09-24 --buoi sang` để `output/output.json` có `maPhong` và `output/meta.json` có `{ day, buoi }`.
Run: `npm run fill:report -- output/output.json`
Expected: log gồm `filled N rows into data`, `macro OK: ThisWorkbook.Workbook_Open`, 5 dòng `<SHEET> table rows: K` với K > 0, và cuối cùng `[fill] N dòng -> ...baocaobuoisang_240926.xlsm`. Mã thoát 0.
Kiểm tra: mở file `data/export/baocaobuoisang_240926.xlsm` (nếu Excel hỏi Enable Content thì chọn Enable): sheet `data` có đủ 20 cột và các dòng; 5 sheet báo cáo có dữ liệu, mỗi phòng một dòng (báo cáo mới nhất trong ngày); `Học tại lớp` không xuất hiện. Đóng file trước khi chạy lại.
Kiểm tra không còn tiến trình treo: `powershell -NoProfile -Command "Get-Process EXCEL -ErrorAction SilentlyContinue"` không in gì (nếu bạn đang tự mở Excel khác thì bỏ qua).

- [ ] **Step 5: Thử các trường hợp lỗi**

- Chạy với `output/output.json` chứa `[]` (tạo bằng `node -e "require('fs').writeFileSync('output/empty.json','[]')"`): `npm run fill:report -- output/empty.json` phải in `không tạo file Excel` và thoát mã 0, không mở Excel.
- Chạy với `--template khong-ton-tai.xlsm`: phải in `Template not found: ...` và thoát mã 1.
- Mở sẵn file đích trong Excel rồi chạy lại: phải thoát mã 1 và log có `ERR:` (không treo). Đóng file sau khi thử; xóa `output/empty.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/fill-template.ps1 fillRoomFacilityReport.ts package.json
git commit -m "feat(lesson): fill:report fills the Excel template and runs its macro"
```

---

### Task 8: Bổ sung phần theo buổi vào `SKILL.md` V2 và cập nhật tài liệu

**Files:**
- Modify: `Teach-lesson-skills-V2/SKILL.md` (trong `zca-scrape-message/`; người dùng đã thêm quy trình mới vào file này ngày 2026-09-25 — **không xóa** bất kỳ phần định nghĩa dữ liệu nào, nhất là mục "Quy tắc trích xuất"; chỉ sửa các chỗ nêu bên dưới)
- Modify: `CLAUDE.md` (thêm các lệnh mới vào mục `## Commands`)
- Modify: `README.md` (thêm mục ngắn về báo cáo buổi dạy)

**Interfaces:**
- Consumes: các lệnh `extract:reports` (có `--buoi`), `fill:report`, `mark:messages` (Task 6, 7 và script có sẵn).

Không có test tự động cho tài liệu; xác nhận bằng cách chạy đúng các lệnh trong skill ở Task 9.

- [ ] **Step 1: Bổ sung phần theo buổi vào `Teach-lesson-skills-V2/SKILL.md`**

Áp dụng lần lượt các thay thế (mỗi chuỗi cũ phải khớp nguyên văn đúng một chỗ; dùng công cụ Edit):

1. Trong bảng "Luồng chạy", thay dòng
   `| 3 | Trích xuất bằng script | \`npm run extract:reports\` |`
   bằng
   `| 3 | Trích xuất bằng script (chỉ tin nhắn của một buổi) | \`npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang\|chieu\|toi]\` |`

2. Ở cuối mục "Tin nhắn cần xử lý" (sau câu kết thúc bằng `ghi đè file cùng ngày.`), thêm đoạn:

```markdown

Mỗi lần chạy chỉ xử lý **một buổi** của ngày đó, không gộp các buổi hay các ngày khác. Buổi tính theo giờ gửi tin (giờ Việt Nam): `sang` 00:00–11:59, `chieu` 12:00–17:59, `toi` 18:00–23:59. Người dùng nói "báo cáo buổi sáng" thì chạy `--buoi sang`; không nói thì mặc định là buổi của thời điểm chạy. Chỉ các tin nhắn trong buổi đó được xét và được ghi vào `marks.json`; tin nhắn ngoài buổi không bị đụng tới. Mỗi buổi tạo một file Excel riêng: `data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm` (ví dụ buổi sáng 25/09/2026 là `baocaobuoisang_250926.xlsm`). Tạm thời không xử lý ảnh (`chat.photo`): chỉ đọc tin nhắn chữ.
```

3. Trong mục "Script trích xuất và agent giám sát", thay dòng
   `Lệnh: \`npm run extract:reports -- [--day YYYY-MM-DD] [--no-db]\``
   bằng
   `Lệnh: \`npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]\``
   và thêm ngay sau dòng gạch đầu dòng `--day` một dòng:
   `- \`--buoi\`: buổi cần xử lý (\`sang\`, \`chieu\` hoặc \`toi\`), mặc định là buổi của thời điểm chạy.`
   Cũng sửa câu `Kết quả trong \`output/\` (luôn ghi đủ ba file, kể cả khi rỗng)` thành `Kết quả trong \`output/\` (luôn ghi đủ bốn file, kể cả khi rỗng)` và thêm vào danh sách file dòng:
   `- \`meta.json\`: \`{ "day", "buoi" }\` của lần chạy, để \`fill:report\` đặt tên file Excel.`

4. Trong mục "Điền file Excel mẫu (bước 5)", thay dòng `Lệnh: ...` thành
   `Lệnh: \`npm run fill:report -- output/output.json [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--template <đường dẫn>]\` (ngày và buổi lấy từ \`output/meta.json\` nếu không truyền)`
   và dòng `- Kết quả: \`data/export/Temp_RoomFacility_rpt-YYYY-MM-DD.xlsm\` (ghi đè nếu trùng ngày), ...` thành
   `- Kết quả: \`data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm\` (ví dụ \`baocaobuoisang_250926.xlsm\`; ghi đè nếu trùng ngày và buổi), ...` (giữ nguyên phần còn lại của dòng).

5. Trong "Quyết định đã chốt" thêm mục `5. Mỗi lần chạy chỉ xử lý một buổi của một ngày; mỗi buổi một file Excel \`baocaobuoi<buoi>_<ddMMyy>.xlsm\`. Tạm thời bỏ qua ảnh.`; trong "Giả định còn lại" thay mục 2 (tên file `Temp_RoomFacility_rpt-YYYY-MM-DD.xlsm`) bằng `2. Ranh giới các buổi: sáng trước 12:00, chiều 12:00–17:59, tối từ 18:00 (chưa được người dùng xác nhận).` và đổi mục 4 (báo cáo có `maPhong = null` bị loại) thành đã được người dùng xác nhận (bỏ chữ "Chưa được người dùng xác nhận").

- [ ] **Step 2: Thêm lệnh mới vào `CLAUDE.md`**

Trong khối lệnh của mục `## Commands`, ngay sau dòng `npm run typecheck                              # tsc --noEmit`, thêm:

```bash
npm test                                       # unit tests for the lesson-report extractor (node:test)
npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]   # extract one session's start/end-of-lesson reports -> output/{output,marks,review,meta}.json
npm run fill:report -- output/output.json      # fill templates/Temp_RoomFacility_rpt.xlsm, run its macro -> data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm (needs Excel)
npm run mark:messages -- output/marks.json     # set StatusId/HasRead on Zalo_CrawlMessage rows
```

Và sửa câu `There is no test suite and no lint script configured.` thành: `The only tests are the unit tests under tests/ (npm test) for the lesson-report code in lesson/; there is no lint script.`

- [ ] **Step 3: Thêm mục vào `README.md`**

Thêm ngay trước mục `## Cấu trúc thư mục` (dùng `grep -n "^## " README.md` để tìm tiêu đề gần nhất nếu tên khác) đoạn sau:

```markdown
## Báo cáo buổi dạy (skill Teach-lesson-skills-V2)

Luồng: `bot:scrape` → `sync:db -- --apply` → `extract:reports -- --buoi <sang|chieu|toi>` → agent xem
`output/review.json` (sửa qua `output/overrides.json`) → `fill:report -- output/output.json` →
`mark:messages -- output/marks.json`. Mỗi lần chỉ xử lý một buổi của một ngày và tạo file
`data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm`.
Chi tiết trong `Teach-lesson-skills-V2/SKILL.md` và
`docs/superpowers/specs/2026-09-24-teacher-lesson-report-extraction-design.md`.
Mã trích xuất nằm trong `lesson/` và có test (`npm test`); `fill:report` cần Microsoft Excel.
```

- [ ] **Step 4: Commit**

```bash
git add Teach-lesson-skills-V2/SKILL.md CLAUDE.md README.md
git commit -m "docs: session-based lesson-report flow in the V2 skill, CLAUDE.md and README"
```

Lưu ý: bản sao `../skills/Teach-lesson-skills-V2/SKILL.md` ở repo cha là bản cũ, không thuộc task này; nó và file `../skills/teacher-lesson-report-extraction/SKILL.md` (đang chứa bản nháp spec) do người dùng quyết định.

---

### Task 9: Nghiệm thu từ đầu đến cuối

**Files:** không tạo/sửa file (chỉ chạy và ghi lại kết quả).

**Interfaces:**
- Consumes: mọi thứ ở Task 1–8.

- [ ] **Step 1: Test và typecheck sạch**

Run: `npm test` → `fail 0`. Run: `npm run typecheck` → không lỗi.

- [ ] **Step 2: Chạy đúng như agent sẽ chạy (bỏ qua bước cào nếu Zalo Desktop không sẵn sàng, dùng dữ liệu đã có trong `data/`)**

```bash
npm run sync:db -- --apply
npm run extract:reports -- --day 2026-09-24 --buoi sang
npm run fill:report -- output/output.json
npm run mark:messages -- output/marks.json --dry-run
```

Expected: mỗi lệnh thoát mã 0; `mark:messages --dry-run` in số tin theo từng `StatusId` (không ghi DB). Chỉ chạy `mark:messages` thật (không `--dry-run`) khi người dùng đồng ý, vì nó ghi đè `StatusId`/`HasRead` của các dòng đã được bot cũ xử lý.

- [ ] **Step 3: So sánh với bot cũ**

Mở `data/export/baocaobuoisang_240926.xlsm` và đối chiếu từng phòng với `output/review.json` và tin nhắn gốc: xếp loại loa/NetSupport/máy lạnh/Internet, `Máy lỗi`/`Máy thiếu` và xếp loại máy tính của từng phòng phải khớp báo cáo mới nhất của phòng đó trong ngày.

- [ ] **Step 4: Ghi lại kết quả**

Báo cho người dùng: số báo cáo, số mục cần xem, số dòng trong Excel, và các quyết định còn mở (báo cáo không có `RoomId` bị loại khỏi Excel; `Area` điền mã khu vực; vị trí cuối cùng của SKILL.md V2 so với skill `teacher-lesson-report-extraction` cũ).

---

## Self-Review

**Spec coverage**
- Điều kiện kích hoạt và mục tiêu giữ nguyên → Task 8 (SKILL.md).
- Luồng 7 bước, `bot:scrape` theo hàng chờ → Task 8 (bảng bước) và plan hàng chờ.
- Script trích xuất, `review.json`, `overrides.json`, các `lyDo` → Task 4 (logic), Task 6 (CLI), Task 8 (giám sát).
- Đổi tên trường sang tiếng Việt, bảng mã → Task 1 (types), Task 5 (codes), Task 8 (SKILL).
- 8 dòng cần lấy, bỏ qua dòng thừa và `BÁO CÁO CHUYÊN MÔN` → Task 3, Task 4.
- Quy tắc `phongMay`, `giaoVien`, cơ sở vật chất, máy tính, `xepLoai` → Task 3 (test theo bảng của spec), Task 4.
- `maPhong` từ `fn_LookupRoomIds`, bỏ `PM` khi tra, `maTrangThai = 2` khi không tìm thấy → Task 4 (`roomKey`, `extractAll`), Task 6 (`roomLookup`).
- 20 cột `data`, dạng phẳng, GUID, Date/Time, School/Area/Room → Task 5.
- Điền bản sao file mẫu, `EnableEvents`, `Workbook_Open`, bỏ báo cáo `maPhong = null` → Task 5 (lọc), Task 7.
- `markMessages.ts`: đã có sẵn và khớp spec (`maNhom`, `maTinNhan`, `maTrangThai`, `--dry-run`, transaction); plan không sửa, chỉ chạy ở Task 9.
- Ngày mặc định hôm nay theo giờ Việt Nam → Task 1, Task 6.

**Placeholder scan:** không có TBD/TODO; mọi bước code có nội dung đầy đủ; các bước chạy thật nêu rõ kết quả mong đợi.

**Type consistency:** `Report`, `RoomKey`, `RoomLookup`, `roomKeyString`, `extractAll`, `buildRows`, `readOverrides`, `lookupRoomIds`, `DATA_SHEET_COLUMNS` dùng cùng tên/chữ ký ở mọi task; `LyDo` có đúng 6 giá trị khớp spec (không còn `so_dong_lech`).

**Review Focus:** mục 1 → test cuối Task 3; mục 2 → test cuối Task 4; mục 3 → Task 6 Step 5 và Task 7 Step 5; mục 4 → `tests/overrides.test.ts` (Task 6); mục 5 → Task 7 Step 5 và `finally` trong `fill-template.ps1`.
