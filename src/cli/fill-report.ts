import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, repoRoot, scriptsDir, templatesDir } from "../core/paths.js";
import { buildRows } from "../lesson/rows.js";
import { isBuoi, isPhase, reportFileName, reportFileNameV2, todayVietnam } from "../lesson/time.js";
import type { Report } from "../types/index.js";

/**
 * Fills a copy of templates/Temp_RoomFacility_rpt.xlsm with the reports of
 * `output/output.json` and runs the workbook's own macro so its five report
 * tables (MAY TINH, INTERNET, NETSUPPORT, LOA, MAY LANH) populate. Needs
 * Microsoft Excel on this machine. The template itself is never modified.
 *
 *   npm run fill:report -- output/output.json [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--template <path>] [--out <path>]
 *
 * Day and phase default to `meta.json` next to the input (written by
 * `extract:reports`); the output file is data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm.
 * `--out` overrides the output path (the runner writes a temp file with it, then swaps it in).
 */

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const inputPath = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--")));
    if (!inputPath) throw new Error("Usage: npm run fill:report -- <output.json> [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--template <path>]");

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
    // Giá trị Buoi cũ (sang|chieu|toi) vẫn được nhận TẠM THỜI cho tới khi bot:runner migrate sang Phase (Chặng 2).
    if (!isPhase(buoi) && !isBuoi(buoi)) {
        throw new Error("Cần --buoi morningstart|morningend|afternoonstart|afternoonend (hoặc sang|chieu|toi cũ) hoặc output/meta.json do extract:reports tạo.");
    }
    const template = path.resolve(option("--template") ?? path.join(templatesDir, "Temp_RoomFacility_rpt.xlsm"));
    if (!fs.existsSync(template)) throw new Error(`Template not found: ${template}`);

    const outDir = outputDir;
    fs.mkdirSync(outDir, { recursive: true });
    const rowsFile = path.join(outDir, "rows.json");
    fs.writeFileSync(rowsFile, JSON.stringify(rows), "utf8");

    const outArg = option("--out");
    const outFile = outArg ? path.resolve(outArg) : path.join(repoRoot, "data", "export", isBuoi(buoi) ? reportFileName(day, buoi) : reportFileNameV2(day, buoi));
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    const logFile = path.join(outDir, "fill.log");
    fs.rmSync(logFile, { force: true });

    let failed = false;
    try {
        execFileSync(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, "fill-template.ps1"), "-Template", template, "-Out", outFile, "-RowsJson", rowsFile, "-LogFile", logFile],
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
