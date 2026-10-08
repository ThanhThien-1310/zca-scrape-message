import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { setReportDir } from "../core/paths.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { maintenanceEntries } from "../lesson/maintenanceReport.js";
import { buildMaintenanceRows, MAINTENANCE_LAYOUT, maintenanceHeaderCells } from "../lesson/maintenanceRows.js";
import { freeFormFileName, legendFormulaCells, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { hhmmVietnam, todayVietnam, vietnamDay } from "../lesson/time.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
import { MessageStore } from "../store/messageStore.js";
import type { SourceMessage } from "../types/index.js";

/**
 * Điền file THỜI GIAN CHƯA BẢO TRÌ PM của HÔM NAY từ các tin "BÁO CÁO CUỐI BUỔI" (cùng nguồn với VỆ SINH) của cả ngày: mỗi TRƯỜNG một dòng (CẤP, TÊN TRƯỜNG, KHU VỰC) và cột
 * BẢO TRÌ GN là ngày hôm nay; các cột còn lại để trống. Mỗi NGÀY một file `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` trong `<statusExportDir>/<yyMM>/<yyMMdd>/<bộ>/`, quét lại cả
 * ngày mỗi lần chạy (không có trạng thái tích luỹ), bản cũ trong ngày bị thay sau khi bản mới ghi xong. Chạy một lần mỗi chu trình `bot:runner`.
 *
 *   npm run fill:maintenance-report -- [--set <id>] [--now <unix ms>]
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
    requireKey(set, "maintenance");
    const now = Number(option("--now") ?? Date.now());
    const day = todayVietnam(now);

    const entries = maintenanceEntries(await loadAllMessages(), (ts) => vietnamDay(ts) === day);
    const rows = buildMaintenanceRows(entries, day);

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    fs.mkdirSync(outDir, { recursive: true });
    const title = readTemplateTitle(path.join(templatesSrc, MAINTENANCE_LAYOUT.templateFile), MAINTENANCE_LAYOUT.sheet);
    const outName = freeFormFileName(title, day, hhmmVietnam(now));

    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ.
    runFillReplacingSameDay(
        { name: "maintenance", templatesSrc, layout: MAINTENANCE_LAYOUT, outDir, outName, rows, headerCells: maintenanceHeaderCells(day), formulaCells: legendFormulaCells(MAINTENANCE_LAYOUT, rows.length) },
        `${title}_${yyMMdd}_T`,
    );
    console.log(`[fill-maintenance-report] bộ ${set.id}, ngày ${day}: ${rows.length} trường -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
