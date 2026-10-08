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
