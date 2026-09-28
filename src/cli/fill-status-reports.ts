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
 * (đã áp override, chỉ lấy báo cáo ĐẦU BUỔI — báo cáo cuối buổi là sự kiện khác, không tính vào bảng này), và
 * chép nguyên trạng 5 file chưa có dữ liệu. Cả 10 file cùng nằm trong `data/export/trang-thai/<buoi>/` (mỗi
 * buổi một thư mục riêng), ghi đè mỗi lần chạy lại CÙNG buổi đó. Không có macro, không qua Zalo — chỉ cần Excel
 * cài trên máy.
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

    // Chỉ lấy báo cáo ĐẦU BUỔI: mỗi trường báo cáo tình trạng thiết bị một lần vào đầu buổi, báo cáo CUỐI BUỔI
    // là một sự kiện khác (không phải "báo lại"/dupe) — trộn cả hai vào cùng bảng khiến một trường xuất hiện
    // 2 lần trong buổi (dupe giả) dù không hề trùng dữ liệu.
    const reports = (JSON.parse(fs.readFileSync(inputPath, "utf8")) as Report[]).filter((r) => r.loaiBaoCao === "DauBuoi");

    const metaFile = path.join(path.dirname(path.resolve(inputPath)), "meta.json");
    const meta: { day?: string; buoi?: string } = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8").replace(/^﻿/, "")) : {};
    const day = option("--day") ?? meta.day ?? todayVietnam();
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isBuoi(buoi)) throw new Error("Cần --buoi sang|chieu|toi hoặc output/meta.json do extract:reports tạo.");

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    // Một thư mục con riêng cho từng buổi (sang/chieu/toi) — tránh buổi sau ghi đè lên buổi trước trong cùng ngày.
    const outDir = path.join(config.dataDir, "export", "trang-thai", buoi);
    fs.mkdirSync(outDir, { recursive: true });

    for (const file of OTHER_TEMPLATE_FILES) {
        fs.copyFileSync(path.join(templatesSrc, file), path.join(outDir, file));
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
        const psSpec = {
            files: [
                {
                    name: key,
                    template: path.join(templatesSrc, layout.templateFile),
                    out: path.join(outDir, layout.templateFile),
                    sheet: spec.sheet,
                    firstDataRow: spec.firstDataRow,
                    totalRowBefore: spec.totalRowBefore,
                    lastColumn: spec.lastColumn,
                    rows: spec.rows,
                    headerCells: spec.headerCells,
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
