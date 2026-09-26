import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../../config.js";

/**
 * Turns `output/output.json` (lesson-start / lesson-end reports extracted by
 * the agent, see skills/Teach-lesson-skills-V2) into
 * `data/export/lesson-report-YYYY-MM-DD.xlsx`: one sheet, one row per report,
 * oldest first. The file is rebuilt on every run and overwrites the same day's file.
 *
 *   npm run export:lesson-report -- output/output.json
 */
interface Facility {
    loai: string;
    xepLoai: string | null;
    soLuong?: { loai: string; so: number | null; ghiChu?: string | null }[];
}

interface Report {
    maTinNhan: string;
    thoiGian: number;
    loaiBaoCao: "DauBuoi" | "CuoiBuoi";
    data: {
        maTrangThai: number;
        truong: { capHoc: string | null; tenRieng: string; coSo: string | null } | null;
        khuVuc: string | null;
        phongMay: string | null;
        giaoVien: string | null;
        coSoVatChat: Facility[];
    };
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** Formats an epoch-ms instant as Vietnam wall-clock time. */
function vietnamDate(ts: number): Date {
    return new Date(ts + VN_OFFSET_MS);
}

function formatDateTime(ts: number): string {
    const d = vietnamDate(ts);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function todayStamp(): string {
    const d = vietnamDate(Date.now());
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function schoolName(t: Report["data"]["truong"]): string {
    if (!t) return "";
    return [t.capHoc, t.tenRieng, t.coSo].filter(Boolean).join(" ");
}

function main(): void {
    const inputPath = process.argv[2];
    if (!inputPath) {
        console.error("Usage: npm run export:lesson-report -- <output.json>");
        process.exit(1);
    }

    const reports = JSON.parse(fs.readFileSync(inputPath, "utf8")) as Report[];
    if (!Array.isArray(reports) || reports.length === 0) {
        console.log("No reports in input, nothing exported.");
        return;
    }

    const rows = reports
        .slice()
        .sort((a, b) => a.thoiGian - b.thoiGian)
        .map((r) => {
            const facility = (loai: string) => r.data.coSoVatChat.find((f) => f.loai === loai);
            const computer = facility("MayTinh");
            const quantity = (loai: string) => computer?.soLuong?.find((q) => q.loai === loai);
            return {
                Ngày: formatDateTime(r.thoiGian),
                Trường: schoolName(r.data.truong),
                "Khu vực": r.data.khuVuc ?? "",
                "Phòng máy": r.data.phongMay ?? "",
                "Giáo viên": r.data.giaoVien ?? "",
                Loại: r.loaiBaoCao === "DauBuoi" ? "Đầu buổi" : "Cuối buổi",
                Loa: facility("AmThanh")?.xepLoai ?? "",
                NetSupport: facility("NetSupport")?.xepLoai ?? "",
                "Máy lạnh": facility("MayLanh")?.xepLoai ?? "",
                Internet: facility("Internet")?.xepLoai ?? "",
                "Máy thiếu": quantity("Thieu")?.so ?? "",
                "Máy lỗi": quantity("Loi")?.so ?? "",
                "Ghi chú máy lỗi": quantity("Loi")?.ghiChu ?? "",
                "Loại máy tính": computer?.xepLoai ?? "",
                "Trạng thái": r.data.maTrangThai,
            };
        });

    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet["!cols"] = [{ wch: 17 }, { wch: 32 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 11 }, { wch: 6 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 50 }, { wch: 13 }, { wch: 11 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "BaoCaoBuoiDay");

    const exportDir = path.join(config.dataDir, "export");
    fs.mkdirSync(exportDir, { recursive: true });
    const filePath = path.join(exportDir, `lesson-report-${todayStamp()}.xlsx`);
    XLSX.writeFile(workbook, filePath);
    console.log(`Exported ${rows.length} report(s) -> ${filePath}`);
}

main();
