import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { setReportDir } from "../core/paths.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
import { electricEntriesOfDay } from "../lesson/electricReport.js";
import { electricBuiltPath, electricNeedsRebuild, electricSignature, readElectricBuilt, writeElectricBuilt } from "../lesson/electricState.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { buildFillSpecs, freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { hhmmVietnam, todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { SourceMessage } from "../types/index.js";

/**
 * Điền file TÌNH TRẠNG ĐIỆN của HÔM NAY từ các tin "LỖI ĐIỆN" của cả ngày (mọi nhóm, mọi giờ; mỗi phòng giữ tin mới nhất), mỗi
 * NGÀY MỘT FILE `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` trong `<statusExportDir>/<yyMM>/<yyMMdd>/`. Chạy một lần mỗi chu trình
 * `bot:runner` (cùng VỆ SINH và NỘI QUY), không phụ thuộc có báo cáo buổi dạy mới hay không. Chỉ dựng lại khi NỘI DUNG các dòng đổi
 * so với lần dựng trước của ngày (`electricNeedsRebuild`, nhớ ở `data/.electric-report.json`): có dữ liệu mới thì ra file mới với
 * giờ mới và bản cũ trong ngày bị thay; không có gì mới thì không làm gì, giờ trong tên file giữ nguyên. Ngày chưa có tin nào vẫn
 * được dựng MỘT lần (file rỗng) cho đủ bộ file của ngày.
 *
 *   npm run fill:electric-report -- [--set <id>] [--now <unix ms>] [--force]
 */
async function loadAllMessages(): Promise<SourceMessage[]> {
    const store = new MessageStore();
    const all: SourceMessage[] = [];
    for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
    return all;
}

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const sets = loadReportSets();
    logSetProblems(sets.problems);
    const set = pickSet(sets.active, option("--set"));
    requireKey(set, "dien");
    const now = Number(option("--now") ?? Date.now());
    const stateFile = electricBuiltPath(set.id);
    const day = todayVietnam(now);
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    const templatesSrc = path.join(config.dataDir, "mau bao cao new");

    const entries = electricEntriesOfDay(await loadAllMessages(), day);
    const spec = buildFillSpecs([], day, now, entries).dien;
    const signature = electricSignature(spec.rows);

    const prev = readElectricBuilt(stateFile);
    const force = process.argv.includes("--force");
    if (!force && !electricNeedsRebuild(prev, day, signature, (name) => fs.existsSync(path.join(outDir, name)))) {
        console.log(`[fill-electric-report] bộ ${set.id}, ngày ${day}: không có dữ liệu điện mới, giữ nguyên ${prev!.file}`);
        return;
    }

    fs.mkdirSync(outDir, { recursive: true });
    const title = readTemplateTitle(path.join(templatesSrc, spec.templateFile), spec.sheet);
    const outName = freeFormFileName(title, day, hhmmVietnam(now));
    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ và không cập nhật trạng thái.
    runFillReplacingSameDay({ name: "dien", templatesSrc, layout: spec, outDir, outName, rows: spec.rows, headerCells: spec.headerCells, formulaCells: spec.formulaCells }, `${title}_${yyMMdd}_T`);
    writeElectricBuilt({ day, signature, file: outName }, stateFile);
    console.log(`[fill-electric-report] bộ ${set.id}, ngày ${day}: ${spec.rows.length} dòng -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
