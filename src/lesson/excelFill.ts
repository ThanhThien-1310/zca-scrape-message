import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, scriptsDir } from "../core/paths.js";
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
                rows: args.rows,
                headerCells: args.headerCells,
                formulaCells: args.formulaCells ?? [],
            },
        ],
    };
}

/**
 * Chạy `scripts/fill-status-template.ps1` cho ĐÚNG 1 file — cùng cơ chế Excel COM `fill:status-reports` đang
 * dùng (xem src/cli/fill-status-reports.ts), tái sử dụng nguyên trạng: mỗi lần gọi là MỘT tiến trình
 * PowerShell riêng (bắt buộc — xem chú thích trong file .ps1 về lý do 2 file không được chạy chung 1 tiến
 * trình). Ném lỗi nếu PowerShell thoát khác 0; người gọi tự quyết định coi lỗi này là fatal hay chỉ cảnh báo.
 */
export function runFillTemplate(args: FillTemplateArgs): string {
    const psSpec = buildFillPsSpec(args);
    fs.mkdirSync(outputDir, { recursive: true });
    const specFile = path.join(outputDir, `fill-spec-${args.name}.json`);
    fs.writeFileSync(specFile, JSON.stringify(psSpec), "utf8");
    const logFile = path.join(outputDir, `fill-${args.name}.log`);
    fs.rmSync(logFile, { force: true });
    execFileSync(
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, "fill-status-template.ps1"), "-Spec", specFile, "-Log", logFile],
        { stdio: "inherit", timeout: 5 * 60_000 },
    );
    return fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd() : "";
}
