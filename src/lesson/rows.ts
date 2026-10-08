import { randomUUID } from "node:crypto";
import { DATA_SHEET_COLUMNS, FACILITY_TYPE_ID, QUANTITY_TYPE_ID, REPORT_TYPE_ID } from "./codes.js";
import { excelDateSerial, excelTimeFraction } from "./time.js";
import type { Cell, Report, SheetRow } from "../types/index.js";

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
