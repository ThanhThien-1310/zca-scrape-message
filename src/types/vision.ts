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
    reader: { kind: "claude-p" | "openrouter"; model: string; promptVersion: string; ruleVersions: Record<string, number> };
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
    /** Kết quả kiểm tra các lần đo tốc độ mạng (ảnh loại speedtest) của bộ; vắng khi bộ không có ảnh đo tốc độ. `speed.rows[i]` ứng với phần tử i của `extracted.speedtest.lan`. */
    speed?: { reasons: string[]; rows: RowReview[] };
    /** Kết quả kiểm tra các biên bản (ảnh loại bienban) của bộ; vắng khi bộ không có ảnh biên bản. `minutes.rows[i]` ứng với phần tử i của `extracted.bienban.bienBan`. */
    minutes?: { reasons: string[]; rows: RowReview[] };
    secondRead: { ran: boolean; disagree: Disagreement[] };
    /** true khi người xem bỏ cả bộ. */
    dismissed?: boolean;
}
