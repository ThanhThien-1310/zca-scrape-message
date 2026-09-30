import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { config } from "../../config.js";
import { outputDir, scriptsDir } from "../core/paths.js";
import { applyStreaks, readStreaks, writeStreaks } from "../lesson/faultStreaks.js";
import { buildFillSpecs, FILE_LAYOUT, OTHER_TEMPLATE_FILES, readTemplateTitle, statusFileName } from "../lesson/statusReportLayout.js";
import { latestPerRoom } from "../lesson/statusRows.js";
import { isPhase, todayVietnam } from "../lesson/time.js";
import type { Report } from "../types/index.js";

/**
 * Điền 5 file báo cáo tình trạng (BO SUNG MAY TINH, LOA, INTERNET, NETSUPPORT, MÁY TÍNH) từ `output/output.json`
 * (đã áp override, mỗi phòng chỉ lấy báo cáo MỚI NHẤT trong buổi — đầu buổi hay cuối buổi tuỳ báo cáo nào gửi
 * sau — khớp cơ chế cũ của file .xlsm), và chép nguyên trạng 3 file chưa có dữ liệu. Cả 10 file cùng nằm trong
 * `data/export/trang-thai/<yyMM>/<yyMMdd>/` (ngày tính theo giai đoạn — xem `classifyPhase`), tên file
 * `<tiêu đề đọc từ ô A1 file mẫu>_<yyMMdd>_T<thứ>_<HHmm cố định theo giai đoạn>.xlsx`, ghi đè mỗi lần chạy lại
 * CÙNG giai đoạn đó. Không có macro, không qua Zalo — chỉ cần Excel cài trên máy.
 * Xem thiết kế: docs/superpowers/specs/2026-09-29-giai-doan-4-phan-design.md
 *
 *   npm run fill:status-reports -- output/output.json [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend]
 *
 * Ngày/giai đoạn mặc định lấy từ output/meta.json (do extract:reports ghi), giống fill:report.
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const inputPath = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--")));
    if (!inputPath) throw new Error("Usage: npm run fill:status-reports -- <output.json> [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend]");

    // Mỗi phòng (maNhom+phongMay) chỉ giữ báo cáo mới nhất trong buổi: một phòng có cả báo cáo đầu và cuối
    // buổi không còn ra 2 dòng (dupe giả), và tình trạng thiết bị lấy đúng số liệu MỚI NHẤT (báo cáo cuối
    // buổi có thể xấu hơn hoặc tốt hơn đầu buổi) thay vì luôn cố định theo đầu buổi.
    const reports = latestPerRoom(JSON.parse(fs.readFileSync(inputPath, "utf8")) as Report[]);

    const metaFile = path.join(path.dirname(path.resolve(inputPath)), "meta.json");
    const meta: { day?: string; buoi?: string } = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8").replace(/^﻿/, "")) : {};
    const day = option("--day") ?? meta.day ?? todayVietnam();
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isPhase(buoi)) throw new Error("Cần --buoi morningstart|morningend|afternoonstart|afternoonend hoặc output/meta.json do extract:reports tạo.");

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMM = day.slice(2, 4) + day.slice(5, 7);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = path.join(config.dataDir, "export", "trang-thai", yyMM, yyMMdd);
    fs.mkdirSync(outDir, { recursive: true });

    // 3 file còn lại ngoài phạm vi dữ liệu (VỆ SINH/VI PHẠM giờ có script riêng, xem
    // docs/superpowers/specs/2026-09-30-ve-sinh-vi-pham-design.md) — chỉ chép nguyên trạng, đổi tên theo tiêu đề mẫu.
    for (const file of OTHER_TEMPLATE_FILES) {
        const src = path.join(templatesSrc, file);
        const wb = XLSX.readFile(src);
        const title = readTemplateTitle(src, wb.SheetNames[0]);
        fs.copyFileSync(src, path.join(outDir, statusFileName(title, day, buoi)));
    }

    const streaksBefore = readStreaks();
    const { state: streaksAfter, perMessage } = applyStreaks(streaksBefore, reports);
    const specs = buildFillSpecs(reports, perMessage, day);

    fs.mkdirSync(outputDir, { recursive: true });

    // Mỗi file gọi PowerShell trong MỘT TIẾN TRÌNH RIÊNG (không gộp thành một lần chạy xử lý cả 5 file): đã tái hiện và
    // xác nhận rằng xử lý nhiều file Excel COM trong cùng một tiến trình PowerShell, dù mỗi file mở Excel.Application
    // riêng, khiến file sau bị lỗi "Specified cast is not valid" ngay ở bước ghi giá trị — dấu hiệu của bộ nhớ đệm gọi
    // COM (.NET DLR callsite) dùng chung theo tiến trình bị "nhiễm" bởi thao tác chèn/xoá dòng của file trước. Tách
    // tiến trình chậm hơn (mở PowerShell + Excel 5 lần thay vì 1) nhưng đã kiểm chứng luôn chạy đúng.
    let failed = false;
    for (const key of Object.keys(FILE_LAYOUT) as Array<keyof typeof FILE_LAYOUT>) {
        const spec = specs[key];
        const layout = FILE_LAYOUT[key];
        const outName = statusFileName(readTemplateTitle(path.join(templatesSrc, layout.templateFile), spec.sheet), day, buoi);
        const psSpec = {
            files: [
                {
                    name: key,
                    template: path.join(templatesSrc, layout.templateFile),
                    out: path.join(outDir, outName),
                    sheet: spec.sheet,
                    firstDataRow: spec.firstDataRow,
                    totalRowBefore: spec.totalRowBefore,
                    lastColumn: spec.lastColumn,
                    rows: spec.rows,
                    headerCells: spec.headerCells,
                    formulaCells: spec.formulaCells ?? [],
                },
            ],
        };
        const specFile = path.join(outputDir, `status-fill-spec-${key}.json`);
        fs.writeFileSync(specFile, JSON.stringify(psSpec), "utf8");
        const logFile = path.join(outputDir, `status-fill-${key}.log`);
        fs.rmSync(logFile, { force: true });

        try {
            execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, "fill-status-template.ps1"), "-Spec", specFile, "-Log", logFile], { stdio: "inherit", timeout: 5 * 60_000 });
        } catch (err) {
            failed = true;
            console.error(`[fill-status] PowerShell failed cho "${key}": ${(err as Error).message}`);
        }
        if (fs.existsSync(logFile)) console.log(fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd());
    }

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
