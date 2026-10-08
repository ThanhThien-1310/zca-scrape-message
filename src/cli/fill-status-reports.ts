import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { outputDir, setOutputDir, setReportDir } from "../core/paths.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { readTracker, writeTracker } from "../lesson/statusFileTracker.js";
import { clearFillFailed, fillStatusFiles, latestReportHhmm, writeFillFailed } from "../lesson/statusFill.js";
import { buildFillSpecs, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { latestPerRoom } from "../lesson/statusRows.js";
import { isPhase, todayVietnam } from "../lesson/time.js";
import { isReportKey, type ReportKey } from "../reportSets/registry.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
import type { Report } from "../types/index.js";

/**
 * Điền các file báo cáo tình trạng THEO GIAI ĐOẠN của MỘT bộ (`--set <id>`; bỏ trống khi chỉ có một bộ hợp lệ) từ `output/<id>/output.json`
 * (đã áp override, mỗi phòng chỉ lấy báo cáo MỚI NHẤT trong buổi): trong số NETSUPPORT, ÂM THANH (khoá `loa`), INTERNET và MÁY TÍNH, chỉ các mã
 * mà bộ bật (`--only a,b` thu hẹp thêm, dùng để thử lại đúng mã lỗi). ĐIỆN, VỆ SINH, NỘI QUY là báo cáo theo ngày với script riêng.
 * File ra `<config.statusExportDir>/<yyMM>/<yyMMdd>/<id>/<tiêu đề đọc từ ô A1 file mẫu>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` với HHmm là GIỜ CHẠY
 * THỰC TẾ. Vì tên không chứa giai đoạn, bản cũ của CÙNG (bộ, giai đoạn) được tìm bằng `data/.status-report-files.json` và xoá SAU khi bản mới
 * ghi xong. Mỗi mã chạy trong try riêng (xem `fillStatusFiles`): một mã lỗi — mẫu thiếu, file đang mở trong Excel — không làm dừng các mã còn
 * lại. Các mã lỗi được ghi vào `output/<id>/fill-failed.json` (runner đọc để thử lại đúng mã đó) và script thoát mã 1 SAU khi thử hết.
 * Mỗi file gọi PowerShell trong MỘT TIẾN TRÌNH RIÊNG (xử lý nhiều file Excel COM trong một tiến trình làm file sau lỗi "Specified cast is not
 * valid"). Không có macro, không qua Zalo — chỉ cần Excel cài trên máy.
 * Xem thiết kế: docs/superpowers/specs/2026-10-06-bo-bao-cao-theo-nguoi-design.md
 *
 *   npm run fill:status-reports -- [output.json] [--set <id>] [--only <mã,mã>] [--day YYYY-MM-DD] [--buoi morningstart|morningend|afternoonstart|afternoonend] [--now <unix ms>]
 *
 * Ngày/giai đoạn mặc định lấy từ `meta.json` cạnh `output.json` (do extract:reports ghi).
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    const workDir = setOutputDir(set.id);

    const inputPath = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && (i === 0 || !all[i - 1].startsWith("--"))) ?? path.join(workDir, "output.json");
    // Mỗi phòng (maNhom+phongMay) chỉ giữ báo cáo mới nhất trong buổi: một phòng có cả báo cáo đầu và cuối buổi không còn ra 2 dòng (dupe giả),
    // và tình trạng thiết bị lấy đúng số liệu MỚI NHẤT thay vì luôn cố định theo đầu buổi.
    const reports = latestPerRoom(JSON.parse(fs.readFileSync(inputPath, "utf8")) as Report[]);

    const metaFile = path.join(path.dirname(path.resolve(inputPath)), "meta.json");
    const meta: { day?: string; buoi?: string } = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8").replace(/^﻿/, "")) : {};
    const day = option("--day") ?? meta.day ?? todayVietnam();
    const buoi = option("--buoi") ?? meta.buoi;
    if (!isPhase(buoi)) throw new Error("Cần --buoi morningstart|morningend|afternoonstart|afternoonend hoặc meta.json do extract:reports tạo.");

    const only = option("--only");
    const keys: ReportKey[] =
        only === undefined
            ? set.phaseKeys
            : only
                  .split(",")
                  .map((k) => k.trim())
                  .filter((k) => k !== "")
                  .map((k) => {
                      if (!isReportKey(k) || !set.phaseKeys.includes(k)) throw new Error(`--only "${k}": bộ "${set.id}" không bật mã theo giai đoạn này (có: ${set.phaseKeys.join(", ") || "không có"}).`);
                      return k;
                  });

    const outDir = setReportDir(config.statusExportDir, set.id, day);
    fs.mkdirSync(outDir, { recursive: true });
    clearFillFailed(workDir);

    const now = Number(option("--now") ?? Date.now());
    const tracker = readTracker();
    // ĐIỆN không làm ở đây: nó lấy từ tin "LỖI ĐIỆN" của cả ngày nên có chu trình riêng (fill-electric-report.ts).
    const specs = buildFillSpecs(reports, day, now);
    const result = fillStatusFiles(
        { setId: set.id, day, buoi, hhmm: latestReportHhmm(reports, now), keys, specs, tracker },
        {
            templatesSrc: path.join(config.dataDir, "mau bao cao new"),
            outDir,
            fill: runFillTemplate,
            readTitle: readTemplateTitle,
            removeFile: (file) => fs.rmSync(file, { force: true }),
            log: (m) => console.log(m),
            warn: (m) => console.warn(`[fill-status] ${m}`),
        },
    );
    writeTracker(tracker);

    for (const f of result.failed) {
        console.error(`[fill-status] bộ "${set.id}", báo cáo "${f.key}" lỗi: ${f.message}`);
        // `runFillTemplate` ghi log PowerShell của từng mã ở output/fill-<mã>.log (thư mục output gốc; các bước chạy tuần tự nên không đè nhau).
        const logFile = path.join(outputDir, `fill-${f.key}.log`);
        if (fs.existsSync(logFile)) console.error(fs.readFileSync(logFile, "utf8").replace(/^﻿/, "").trimEnd());
    }
    if (result.failed.length > 0) writeFillFailed(workDir, result.failed.map((f) => f.key));

    console.log(`[fill-status] bộ ${set.id}: ${keys.map((k) => `${k}: ${(specs as Partial<Record<ReportKey, { rows: unknown[] }>>)[k]?.rows.length ?? 0}`).join(", ")}, buổi ${buoi} ngày ${day} -> ${outDir}${result.failed.length > 0 ? ` (LỖI: ${result.failed.map((f) => f.key).join(", ")})` : ""}`);
    if (result.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
