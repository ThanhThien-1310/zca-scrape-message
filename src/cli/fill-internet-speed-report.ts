import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir, setReportDir } from "../core/paths.js";
import { runFillReplacingSameDay } from "../lesson/excelFill.js";
import { internetSpeedEntries } from "../lesson/internetSpeedReport.js";
import { buildInternetSpeedRows, INTERNET_SPEED_LAYOUT, internetSpeedHeaderCells } from "../lesson/internetSpeedRows.js";
import { freeFormFileName, readTemplateTitle } from "../lesson/statusReportLayout.js";
import { addDays, hhmmVietnam, todayVietnam, vietnamDay } from "../lesson/time.js";
import { loadReportSets, logSetProblems, pickSet, requireKey } from "../reportSets/cliSet.js";
import { loadSpeedByMessage } from "../speed/measures.js";
import { MessageStore } from "../store/messageStore.js";
import type { SourceMessage } from "../types/index.js";

/**
 * Điền file TRẠNG THÁI KẾT NỐI INTERNET của HÔM NAY: mỗi PHÒNG MÁY trong các tin "BÁO CÁO CUỐI BUỔI" của ngày một dòng (CẤP, TÊN TRƯỜNG, KHU VỰC, PM), TỐC ĐỘ (Mbps) lấy từ ảnh đo tốc độ
 * đã đọc (`data/photo-reports`) đứng cùng người gửi quanh tin báo cáo, XẾP LOẠI A (từ 20 Mbps), B (từ 10), C (dưới 10), D (tin ghi "Internet: Không" hoặc ảnh báo không có mạng),
 * NGÀY CẬP NHẬT là hôm nay, GHI CHÚ để trống. Danh sách xếp D, C, B, A từ trên xuống, phòng chưa có xếp loại ở cuối. Mỗi NGÀY một file, quét lại cả ngày mỗi lần chạy, bản cũ thay sau khi
 * bản mới ghi xong. Chạy một lần mỗi chu trình `bot:runner` sau bước đọc ảnh. Không gọi agent.
 *
 *   npm run fill:internet-speed-report -- [--set <id>] [--now <unix ms>]
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
    requireKey(set, "internetSpeed");
    const now = Number(option("--now") ?? Date.now());
    const day = todayVietnam(now);

    const speed = loadSpeedByMessage(photoReportsDir(config.dataDir), addDays(day, -1));
    const entries = internetSpeedEntries(await loadAllMessages(), (ts) => vietnamDay(ts) === day, speed);
    const rows = buildInternetSpeedRows(entries, day);

    const templatesSrc = path.join(config.dataDir, "mau bao cao new");
    const yyMMdd = day.slice(2, 4) + day.slice(5, 7) + day.slice(8, 10);
    const outDir = setReportDir(config.statusExportDir, set.id, day);
    fs.mkdirSync(outDir, { recursive: true });
    const title = readTemplateTitle(path.join(templatesSrc, INTERNET_SPEED_LAYOUT.templateFile), INTERNET_SPEED_LAYOUT.sheet);
    const outName = freeFormFileName(title, day, hhmmVietnam(now));

    // Ghi file mới xong mới xoá bản cũ cùng ngày (runFillReplacingSameDay): lỗi giữa chừng không làm mất bản cũ.
    runFillReplacingSameDay(
        { name: "internetSpeed", templatesSrc, layout: INTERNET_SPEED_LAYOUT, outDir, outName, rows, headerCells: internetSpeedHeaderCells(day), formulaCells: [] },
        `${title}_${yyMMdd}_T`,
    );
    const withSpeed = rows.filter((r) => "F" in r).length;
    console.log(`[fill-internet-speed-report] bộ ${set.id}, ngày ${day}: ${rows.length} phòng (${withSpeed} có tốc độ) -> ${path.join(outDir, outName)}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
