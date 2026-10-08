import type { Cell, CoSoVatChat, ElectricEntry, Report } from "../types/index.js";

/**
 * Mỗi phòng (maNhom + phongMay) chỉ giữ báo cáo có `thoiGian` lớn nhất trong buổi — khớp cơ chế cũ của file
 * .xlsm ("với mỗi cặp (ngày, RoomId) chỉ giữ báo cáo có Timestamp lớn nhất"), áp dụng ở mức buổi vì mỗi lần
 * chạy fill:status-reports chỉ xử lý một buổi. Báo cáo cuối buổi phản ánh tình trạng THẬT tại thời điểm đó
 * (có thể xấu hơn hoặc tốt hơn đầu buổi), nên lấy báo cáo mới nhất thay vì chỉ lấy đầu buổi — vừa hết trùng
 * lặp (một phòng không còn ra 2 dòng vì có cả báo cáo đầu và cuối buổi) vừa không bỏ sót thay đổi cuối buổi.
 * Report không có `phongMay` (không xác định được phòng) không gộp với nhau, giữ nguyên hết.
 */
export function latestPerRoom(reports: Report[]): Report[] {
    const latest = new Map<string, Report>();
    const noRoom: Report[] = [];
    for (const r of reports) {
        if (!r.data.phongMay) {
            noRoom.push(r);
            continue;
        }
        const key = `${r.maNhom}|${r.data.phongMay.toUpperCase().trim()}`;
        const current = latest.get(key);
        if (!current || r.thoiGian > current.thoiGian) latest.set(key, r);
    }
    return [...latest.values(), ...noRoom];
}

/** Đọc `Thiếu`/`Lỗi` (và ghi chú của Lỗi) từ mục `soLuong` của một cơ sở vật chất; thiếu mục nào trả về null. */
function quantity(facility: CoSoVatChat | undefined, loai: "Thieu" | "Loi"): { so: number | null; ghiChu: string | null } {
    const entry = facility?.soLuong?.find((s) => s.loai === loai);
    return { so: entry?.so ?? null, ghiChu: entry?.ghiChu ?? null };
}

const findFacility = (r: Report, loai: CoSoVatChat["loai"]): CoSoVatChat | undefined => r.data.coSoVatChat.find((f) => f.loai === loai);

/** Thứ tự hiển thị XẾP LOẠI: Tốt, Bình thường, Kém — T, B, K liền nhau thay vì lẫn lộn theo thứ tự báo cáo tới. */
const GRADE_ORDER: Record<string, number> = { T: 0, B: 1, K: 2 };
function bySortedGrade<T extends { grade: string }>(entries: T[]): T[] {
    return [...entries].sort((a, b) => (GRADE_ORDER[a.grade] ?? 3) - (GRADE_ORDER[b.grade] ?? 3));
}

interface SchoolRow {
    /** Tên trường hiển thị (rỗng = không rõ trường). */
    school: string;
    row: Record<string, Cell>;
}

/**
 * Các dòng CÙNG TRƯỜNG nằm liền nhau: mỗi trường là một cụm đặt tại vị trí dòng đầu tiên của trường đó trong thứ tự hiện có
 * (xếp loại T→B→K hoặc thứ tự báo cáo), các dòng còn lại của trường được kéo lên ngay sau; thứ tự trong cụm giữ nguyên.
 * Chỉ dòng đầu cụm hiện tên trường (`nameCol`), dòng sau bỏ cột tên nhưng giữ mọi cột khác. Dòng không có tên trường
 * không gộp với nhau. Chưa đánh STT — người gọi đánh sau khi gom.
 */
function groupBySchool(entries: SchoolRow[], nameCol: string): Array<Record<string, Cell>> {
    const groups: SchoolRow[][] = [];
    const byName = new Map<string, SchoolRow[]>();
    for (const e of entries) {
        if (e.school === "") {
            groups.push([e]);
            continue;
        }
        const existing = byName.get(e.school);
        if (existing) existing.push(e);
        else {
            const created = [e];
            byName.set(e.school, created);
            groups.push(created);
        }
    }
    return groups.flatMap((g) =>
        g.map((e, i) => {
            if (i === 0) return e.row;
            const { [nameCol]: _name, ...rest } = e.row;
            return rest;
        }),
    );
}

const numbered = (rows: Array<Record<string, Cell>>): Array<Record<string, Cell>> => rows.map((row, i) => ({ A: i + 1, ...row }));

/**
 * XẾP LOẠI của file MÁY TÍNH theo SM THIẾU, đúng bảng CHÚ GIẢI của mẫu mới: thiếu <= 2 là A, <= 4 là B, <= 6 là C,
 * <= 8 là D, > 8 là E. Không có số máy thiếu (tin không ghi) thì để trống.
 */
export function mayTinhGrade(thieu: number | null): "A" | "B" | "C" | "D" | "E" | null {
    if (thieu === null) return null;
    if (thieu <= 2) return "A";
    if (thieu <= 4) return "B";
    if (thieu <= 6) return "C";
    if (thieu <= 8) return "D";
    return "E";
}

/** LOA: cột XẾP LOẠI là F (mẫu mới có thêm HIỆN TRẠNG ở E và GHI CHÚ ở G — để trống). */
export function buildLoaRows(reports: Report[]): Array<Record<string, Cell>> {
    const entries: Array<SchoolRow & { grade: string }> = [];
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const amThanh = findFacility(r, "AmThanh");
        if (!amThanh || amThanh.xepLoai === null) continue;
        entries.push({ grade: amThanh.xepLoai, school: r.data.truong?.tenRieng ?? "", row: { B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", D: r.data.phongMay, F: amThanh.xepLoai } });
    }
    return numbered(groupBySchool(bySortedGrade(entries), "B"));
}

/** NETSUPPORT và INTERNET cùng dạng: STT, TÊN TRƯỜNG, KHU VỰC, PM, (HIỆN TRẠNG), XẾP LOẠI ở cột F, (GHI CHÚ). Không còn cột SỐ LẦN. */
function buildNetStatusRows(reports: Report[], facilityLoai: "Internet" | "NetSupport"): Array<Record<string, Cell>> {
    const entries: Array<SchoolRow & { grade: string }> = [];
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const facility = findFacility(r, facilityLoai);
        if (!facility || facility.xepLoai === null) continue;
        entries.push({ grade: facility.xepLoai, school: r.data.truong?.tenRieng ?? "", row: { B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", D: r.data.phongMay, F: facility.xepLoai } });
    }
    return numbered(groupBySchool(bySortedGrade(entries), "B"));
}

export function buildInternetRows(reports: Report[]): Array<Record<string, Cell>> {
    return buildNetStatusRows(reports, "Internet");
}

export function buildNetSupportRows(reports: Report[]): Array<Record<string, Cell>> {
    return buildNetStatusRows(reports, "NetSupport");
}

/**
 * MÁY TÍNH (12 cột): B TÊN TRƯỜNG, C KHU VỰC, D PM, E TỔNG SM (dòng "Tổng số máy" của tin), F SM LỖI, G SM THIẾU, I HIỆN TRẠNG,
 * J XẾP LOẠI (theo SM THIẾU). SM BỔ SUNG (H), NGUỒN TT (K) và GHI CHÚ (L) CHƯA có nguồn dữ liệu nên để trống — xem
 * docs/superpowers/specs/2026-10-03-bo-mau-moi-7-file-design.md. Ghi chú trong ngoặc của "Tổng số máy bị lỗi: N (...)"
 * vào HIỆN TRẠNG, không phải GHI CHÚ (theo yêu cầu của người dùng).
 */
export function buildMayTinhRows(reports: Report[]): Array<Record<string, Cell>> {
    const entries: SchoolRow[] = [];
    for (const r of reports) {
        if (!r.data.phongMay) continue;
        const mayTinh = findFacility(r, "MayTinh");
        if (!mayTinh) continue;
        const loi = quantity(mayTinh, "Loi");
        const thieu = quantity(mayTinh, "Thieu");
        entries.push({ school: r.data.truong?.tenRieng ?? "", row: { B: r.data.truong?.tenRieng ?? "", C: r.data.khuVuc ?? "", D: r.data.phongMay, E: r.data.tongSoMay ?? null, F: loi.so, G: thieu.so, I: loi.ghiChu, J: mayTinhGrade(thieu.so) } });
    }
    return numbered(groupBySchool(entries, "B"));
}

/**
 * ĐIỆN (7 cột như NETSUPPORT): B TÊN TRƯỜNG, C KHU VỰC, D PM, E HIỆN TRẠNG, F XẾP LOẠI, G GHI CHÚ. "Tình trạng" trong tin "LỖI ĐIỆN" là
 * T/B/K (không phân biệt hoa thường): vào XẾP LOẠI (F), các dòng sắp T, B, K như NETSUPPORT/INTERNET và cùng trường nằm liền nhau.
 * Giá trị khác T/B/K (IT viết chữ) không xếp loại được nên vào HIỆN TRẠNG (E), xếp sau các dòng có xếp loại, để không mất nội dung;
 * Tình trạng trống thì cả E và F trống. GHI CHÚ (G) để trống.
 */
export function buildDienRows(entries: ElectricEntry[]): Array<Record<string, Cell>> {
    const graded = entries.map((e) => {
        const text = e.tinhTrang.trim();
        const grade = /^[tbk]$/i.test(text) ? text.toUpperCase() : "";
        const row: Record<string, Cell> = { B: e.tenTruong, C: e.khuVuc, D: e.phongMay };
        if (grade) row.F = grade;
        else if (text) row.E = text;
        return { grade, school: e.tenTruong, row };
    });
    return numbered(groupBySchool(bySortedGrade(graded), "B"));
}
