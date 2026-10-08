import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir, setReportDir } from "../core/paths.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { minutesEntries } from "../lesson/minutesReport.js";
import { buildMinutesRows, MINUTES_LAYOUT, minutesHeaderCells } from "../lesson/minutesRows.js";
import { freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { addDays, hhmmVietnam, todayVietnam, vietnamDay } from "../lesson/time.js";
import { loadMinutesByMessage } from "../minutes/measures.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
import { MessageStore } from "../store/messageStore.js";
import type { SourceMessage } from "../types/index.js";

/**
 * Điền file QUẢN LÝ BIÊN BẢN của HÔM NAY: mỗi BIÊN BẢN trong ảnh đi kèm tin "BÁO CÁO CUỐI BUỔI" của ngày một dòng: NGÀY (ngày gửi báo cáo), TÊN TRƯỜNG và KHU VỰC (từ tin),
 * PM (các phòng máy của tin, nối bằng dấu phẩy), NỘI DUNG (tiêu đề biên bản), SL = 1, ĐẠI DIỆN CTY, ĐẠI DIỆN TRƯỜNG, CHỨC VỤ (bộ phận bên trường) đọc từ ảnh. XẾP LOẠI và GHI CHÚ
 * để trống. Mỗi NGÀY một file, quét lại cả ngày mỗi lần chạy, bản cũ thay sau khi bản mới ghi xong. Chạy một lần mỗi chu trình `bot:runner` sau bước đọc ảnh. Không gọi agent.
 *
 *   npm run fill:minutes-report -- [--set <id>] [--now <unix ms>]
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
    requireKey(set, "minutes");
    const now = Number(option("--now") ?? Date.now());
    const day = todayVietnam(now);

    const minutes = loadMinutesByMessage(photoReportsDir(config.dataDir), addDays(day, -1));
    const entries = minutesEntries(await loadAllMessages(), (ts) => vietnamDay(ts) === day, minutes);
    const rows = buildMinutesRows(entries);

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    fs.mkdirSync(outDir, { recursive: true });
    const title = readTemplateTitle(path.join(templatesSrc, MINUTES_LAYOUT.templateFile), MINUTES_LAYOUT.sheet);
    const outName = freeFormFileName(title, day, hhmmVietnam(now));

    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ.
    runFillReplacingSameDay(
        { name: "minutes", templatesSrc, layout: MINUTES_LAYOUT, outDir, outName, rows, headerCells: minutesHeaderCells(day), formulaCells: [] },
        `${title}_${yyMMdd}_T`,
    );
    const blank = entries.filter((e) => !e.item.usable).length;
    console.log(`[fill-minutes-report] bộ ${set.id}, ngày ${day}: ${rows.length} biên bản (${blank} chờ xem) -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
