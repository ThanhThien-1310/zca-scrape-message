import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, scriptsDir } from "../core/paths.js";
import type { TotalRunResult } from "./runTotal.js";

/** Một file cần in: `name` là khoá đầu ra (`loa`, `cleaning`...), `sheet` là sheet chính của file. */
export interface PrintJob {
    name: string;
    file: string;
    sheet: string;
}

/** Kết quả của một lần gọi Excel cho một file: tổng số trang của sheet, số trang đã/ sẽ in, máy in Excel đang trỏ tới. */
export interface PrintOutcome {
    pages: number;
    printed: number;
    printer: string;
    /** `false` khi chạy thử (dry run) hoặc sheet không có trang nào: Excel KHÔNG gửi lệnh in. */
    sent: boolean;
}

export interface PrintDeps {
    /** Số trang tối đa mỗi file (`config.print.maxPagesPerFile`). */
    maxPages: number;
    run(job: PrintJob, maxPages: number): PrintOutcome;
    /** Gọi TRƯỚC mỗi file gửi tới máy in: mỗi lần gọi Excel chặn vòng lặp sự kiện nên bot dùng nó để ghi nhịp tim. */
    onProgress?(): void;
}

export interface PrintSummary {
    /** Tên file đã GỬI LỆNH IN (không có nghĩa là giấy đã ra). */
    sent: string[];
    /** Tên file sẽ được in nếu không phải chạy thử. */
    wouldPrint: string[];
    warnings: string[];
    /** Máy in mà Excel trỏ tới (máy in mặc định của Windows); null nếu chưa gọi Excel lần nào. */
    printer: string | null;
}

/**
 * In các file vừa xuất của một đợt: MỌI file đã ghi, kể cả file chưa có dòng dữ liệu nào (vẫn in phần đầu và chú giải), chỉ SHEET CHÍNH của file (VỆ SINH: `HANG NGAY`, không in sheet
 * `TONG` đang trống), tối đa `maxPages` trang đầu. Lỗi ở một file chỉ thành cảnh báo, các file khác vẫn in; không thử lại (tránh in
 * trùng). Không ném lỗi.
 */
export function printTotalFiles(result: TotalRunResult, deps: PrintDeps): PrintSummary {
    const summary: PrintSummary = { sent: [], wouldPrint: [], warnings: [], printer: null };
    for (const w of result.written) {
        const fileName = path.basename(w.file);
        try {
            deps.onProgress?.();
            const out = deps.run({ name: w.name, file: w.file, sheet: w.sheet }, deps.maxPages);
            summary.printer = out.printer;
            if (out.pages === 0) {
                summary.warnings.push(`${w.name}: sheet ${w.sheet} không có trang nào để in`);
                continue;
            }
            (out.sent ? summary.sent : summary.wouldPrint).push(fileName);
            if (out.printed < out.pages) summary.warnings.push(`${w.name}: chỉ in ${out.printed}/${out.pages} trang đầu (giới hạn print.maxPagesPerFile = ${deps.maxPages})`);
        } catch (err) {
            summary.warnings.push(`${w.name}: in lỗi: ${(err as Error).message}`);
        }
    }
    return summary;
}

/**
 * Gọi `scripts/print-xlsx.ps1` cho đúng 1 file (một tiến trình PowerShell riêng, giống việc điền file): mở file chỉ đọc, (nếu `centerPage`) căn giữa trang và đặt lề trái = lề phải trong bộ nhớ, đếm trang
 * của sheet, rồi `PrintOut` các trang đầu ra máy in mặc định. `dryRun` chỉ đếm trang, không in. Ném lỗi nếu PowerShell thoát khác 0.
 */
export function runPrintScript(job: PrintJob, maxPages: number, dryRun = false, centerPage = false): PrintOutcome {
    fs.mkdirSync(outputDir, { recursive: true });
    const specFile = path.join(outputDir, `print-spec-${job.name}.json`);
    const logFile = path.join(outputDir, `print-${job.name}.log`);
    fs.writeFileSync(specFile, JSON.stringify({ file: job.file, sheet: job.sheet, maxPages, centerPage }), "utf8");
    fs.rmSync(logFile, { force: true });
    const read = (): { pages?: number; printed?: number; printer?: string; sent?: boolean; error?: string } | null => {
        try {
            return JSON.parse(fs.readFileSync(logFile, "utf8").replace(/^﻿/, ""));
        } catch {
            return null;
        }
    };
    try {
        execFileSync(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptsDir, "print-xlsx.ps1"), "-Spec", specFile, "-Log", logFile, ...(dryRun ? ["-DryRun"] : [])],
            { stdio: "inherit", timeout: 3 * 60_000 },
        );
    } catch (err) {
        throw new Error(read()?.error ?? (err as Error).message);
    }
    const out = read();
    if (!out || typeof out.pages !== "number") throw new Error("script in không ghi kết quả");
    return { pages: out.pages, printed: out.printed ?? 0, printer: out.printer ?? "", sent: out.sent === true };
}
