import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { setReportDir } from "../core/paths.js";
import { leaveForDay } from "../leave/buildDay.js";
import { LEAVE_LAYOUT } from "../leave/layout.js";
import { leaveBuiltPath, leaveNeedsRebuild, readLeaveBuilt, writeLeaveBuilt } from "../leave/leaveState.js";
import { realLeaveIO } from "../leave/realIo.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { hhmmVietnam, todayVietnam } from "../lesson/time.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";

/**
 * Điền file LỊCH NGHỈ PHÉP KỸ THUẬT của HÔM NAY từ các ảnh nghỉ phép đã đọc (`data/photo-reports`): mỗi NGÀY MỘT FILE
 * `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` trong `<statusExportDir>/<yyMM>/<yyMMdd>/<bộ>/`. Chỉ ghi cột NGÀY (chữ) và BUỔI của dòng khớp tên (điền tại chỗ,
 * `inPlace`); mọi ô khác của mẫu giữ nguyên. Chạy một lần mỗi chu trình `bot:runner` sau bước đọc ảnh (`photos:auto`). Chỉ dựng lại khi NỘI DUNG các ô đổi so với lần
 * dựng trước của ngày (`data/.leave-report.<id>.json`): có ảnh mới, người xem sửa dòng, kỳ nghỉ kết thúc thì ra file mới với giờ mới và bản cũ trong ngày bị thay;
 * không có gì mới thì không làm gì. Ngày chưa có kỳ nghỉ nào còn hiệu lực KHÔNG dựng file riêng (báo cáo tổng vẫn xuất file nghỉ phép rỗng). Không gọi agent.
 *
 *   npm run fill:leave-report -- [--set <id>] [--now <unix ms>] [--force]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    requireKey(set, "leave");
    const now = Number(option("--now") ?? Date.now());
    const day = todayVietnam(now);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const force = process.argv.includes("--force");

    const result = leaveForDay(day, realLeaveIO(), config.vision.leave);
    for (const w of result.warnings) console.warn(`[fill-leave-report] ${w}`);
    for (const n of result.notes) console.warn(`[fill-leave-report] ${n}`);

    if (result.filled.length === 0 && !force) {
        console.log(`[fill-leave-report] bộ ${set.id}, ngày ${day}: không có kỳ nghỉ nào còn hiệu lực để điền, không dựng file riêng`);
        return;
    }
    const stateFile = leaveBuiltPath(set.id);
    const prev = readLeaveBuilt(stateFile);
    if (!force && !leaveNeedsRebuild(prev, day, result.signature, (name) => fs.existsSync(path.join(outDir, name)))) {
        console.log(`[fill-leave-report] bộ ${set.id}, ngày ${day}: không có dữ liệu nghỉ phép mới, giữ nguyên ${prev!.file}`);
        return;
    }

    fs.mkdirSync(outDir, { recursive: true });
    const title = readTemplateTitle(path.join(templatesSrc, LEAVE_LAYOUT.templateFile), LEAVE_LAYOUT.sheet);
    const outName = freeFormFileName(title, day, hhmmVietnam(now));
    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ và không cập nhật trạng thái.
    runFillReplacingSameDay({ name: "leave", templatesSrc, layout: LEAVE_LAYOUT, outDir, outName, rows: [], headerCells: result.headerCells, formulaCells: [] }, `${title}_${yyMMdd}_T`);
    writeLeaveBuilt({ day, signature: result.signature, file: outName }, stateFile);
    console.log(`[fill-leave-report] bộ ${set.id}, ngày ${day}: ${result.filled.length} dòng -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
