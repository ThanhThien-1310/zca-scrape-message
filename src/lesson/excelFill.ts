import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, repoRoot, scriptsDir } from "../core/paths.js";
import type { FileLayout, FormulaCell, HeaderCell } from "./statusReportLayout.js";
import type { Cell } from "../types/index.js";

export interface FillTemplateArgs {
    name: string;
    templatesSrc: string;
    layout: FileLayout;
    outDir: string;
    outName: string;
    rows: Array<Record<string, Cell>>;
    headerCells: HeaderCell[];
    formulaCells?: FormulaCell[];
}

/** Phần THUẦN của việc gọi `fill-status-template.ps1` — chỉ dựng object spec, không đụng file/tiến trình nào,
 * nên test được trực tiếp (khác `runFillTemplate`, cần Excel COM thật). */
export function buildFillPsSpec(args: FillTemplateArgs): unknown {
    return {
        files: [
            {
                name: args.name,
                template: path.join(args.templatesSrc, args.layout.templateFile),
                out: path.join(args.outDir, args.outName),
                sheet: args.layout.sheet,
                firstDataRow: args.layout.firstDataRow,
                totalRowBefore: args.layout.totalRowBefore,
                lastColumn: args.layout.lastColumn,
                ...(args.layout.inPlace ? { inPlace: true } : {}),
                deleteSheets: args.layout.deleteSheets ?? [],
                rows: args.rows,
                headerCells: args.headerCells,
                formulaCells: args.formulaCells ?? [],
            },
        ],
    };
}

/**
 * Điền file mẫu Excel: Ưu tiên sử dụng Python Export Worker (Pandas + Openpyxl) siêu tốc,
 * giữ nguyên 100% định dạng, kẻ viền và cảnh báo màu.
 * Tự động fallback về PowerShell COM nếu có sự cố hoặc khi USE_LEGACY_EXCEL_FILL=true.
 */
export function runFillTemplate(args: FillTemplateArgs): string {
    const psSpec = buildFillPsSpec(args);
    fs.mkdirSync(outputDir, { recursive: true });
    const specFile = path.join(outputDir, `fill-spec-${args.name}.json`);
    fs.writeFileSync(specFile, JSON.stringify(psSpec), "utf8");
    const logFile = path.join(outputDir, `fill-${args.name}.log`);
    fs.rmSync(logFile, { force: true });

    const useLegacy = process.env.USE_LEGACY_EXCEL_FILL === "true";
    if (!useLegacy) {
        try {
            const pythonWorker = path.join(repoRoot, "python", "export_worker.py");
            execFileSync(
                "python",
                [pythonWorker, "--spec", specFile, "--log", logFile],
                { stdio: "inherit", timeout: 60_000 },
            );
            return fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd() : "";
        } catch (err) {
            console.warn(`[excelFill] Python worker báo lỗi (${(err as Error).message}), tự động chuyển về fallback PowerShell COM.`);
        }
    }

    execFileSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, "fill-status-template.ps1"), "-Spec", specFile, "-Log", logFile],
        { stdio: "inherit", timeout: 5 * 60_000 },
    );
    return fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd() : "";
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Xoá các file `<prefix><thứ>_<HHmm>.xlsx` trong `outDir` TRỪ `keepName`. Chỉ khớp đúng dạng tên này nên KHÔNG đụng tới file
 * `-auto` của báo cáo tổng (`..._<HHmm>-auto.xlsx`, cùng tiêu đề và cùng ngày). Trả về tên các file không xoá được (vd đang mở trong Excel).
 */
export function pruneSiblings(outDir: string, prefix: string, keepName: string): string[] {
    const failed: string[] = [];
    const sibling = new RegExp(`^${escapeRegExp(prefix)}\\d_\\d{4}\\.xlsx$`);
    for (const f of fs.readdirSync(outDir)) {
        if (f === keepName || !sibling.test(f)) continue;
        try {
            fs.rmSync(path.join(outDir, f));
        } catch {
            failed.push(f);
        }
    }
    return failed;
}

/**
 * Ghi file mới rồi mới xoá các bản cũ cùng báo cáo cùng ngày (`prefix` = `<tiêu đề>_<yyMMdd>_T`): tên file đóng dấu giờ
 * chạy thực tế nên mỗi lần chạy ra một tên mới, nhưng mỗi ngày chỉ được còn đúng 1 file. Ghi lỗi thì bỏ bản ghi dở và
 * GIỮ NGUYÊN bản cũ (ném lại lỗi cho người gọi). Bản cũ xoá không được thì chỉ cảnh báo.
 */
export function runFillReplacingSameDay(args: FillTemplateArgs, prefix: string, run: (a: FillTemplateArgs) => string = runFillTemplate): string {
    let log: string;
    try {
        log = run(args);
    } catch (err) {
        fs.rmSync(path.join(args.outDir, args.outName), { force: true });
        throw err;
    }
    for (const f of pruneSiblings(args.outDir, prefix, args.outName)) console.warn(`[${args.name}] không xoá được bản cũ "${f}" (đang mở trong Excel?)`);
    return log;
}
