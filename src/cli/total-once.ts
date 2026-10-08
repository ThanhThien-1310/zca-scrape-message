import { config } from "../../config.js";
import { todayVietnam } from "../lesson/time.js";
import { readQueue } from "../scrape/scrapeQueue.js";
import { recordAfterCrash, recordAfterRun, shouldRecordSlot, withPrinted } from "../total/decide.js";
import { printTotalFiles, runPrintScript } from "../total/printFiles.js";
import { realTotalDeps } from "../total/realDeps.js";
import { runTotalForSets } from "../total/runTotal.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
import { isSlotName, slotKey, slotsOfDay } from "../total/slots.js";
import { readSlots, saveSlot } from "../total/totalState.js";

/**
 * Xuất 7 file báo cáo tổng `-auto` của MỘT đợt ngay bây giờ (không đợi runner), rồi ghi kết quả đợt vào
 * `data/.total-slots.json` để `bot:total` (nếu đang chạy) không xuất trùng. Lần chạy tay luôn là `final`.
 *
 *   npm run total:once -- --slot morning|afternoon [--set <id>] [--day YYYY-MM-DD] [--now <unix ms>] [--print [--dry-run]]
 *
 * Khung dữ liệu: morning = 6:30 đến 9:00, afternoon = 6:30 đến 15:00 của ngày `--day` (mặc định hôm nay).
 * `--print` xuất rồi IN các file vừa xuất ra máy in mặc định (luôn in, không phụ thuộc `print.enabled`; mọi file, kể cả file chưa có dòng dữ liệu,
 * chỉ sheet chính, tối đa `print.maxPagesPerFile` trang mỗi file). `--print --dry-run` chỉ liệt kê file sẽ in, không in.
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const slotName = option("--slot");
    if (!isSlotName(slotName)) throw new Error("Cần --slot morning hoặc --slot afternoon.");
    const now = Number(option("--now") ?? Date.now());
    if (!Number.isFinite(now)) throw new Error("--now phải là số mili giây (unix ms).");
    const day = option("--day") ?? todayVietnam(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day phải có dạng YYYY-MM-DD, nhận được "${day}".`);

    const wantPrint = process.argv.includes("--print");
    const dryRun = process.argv.includes("--dry-run");
    if (dryRun && !wantPrint) throw new Error("--dry-run chỉ dùng cùng --print.");

    const loaded = loadReportSets();
    logSetProblems(loaded.problems);
    const sets = option("--set") === undefined ? loaded.active : [pickSet(loaded.active, option("--set"))];
    if (sets.length === 0) throw new Error("không có bộ báo cáo nào để xuất.");

    // Một lần chạy tay chỉ một phần các bộ KHÔNG được đánh dấu đợt là đã xong (nếu không bot:total sẽ bỏ qua các bộ còn lại của đợt).
    const recordSlot = shouldRecordSlot(sets.map((s) => s.id), loaded.active.map((s) => s.id));
    if (!recordSlot) console.log("[total] lưu ý: chạy một phần các bộ nên KHÔNG ghi kết quả đợt; bot:total vẫn xuất đợt này cho đủ mọi bộ.");
    const slot = slotsOfDay(day).find((s) => s.name === slotName)!;
    const key = slotKey(slot);
    const prev = readSlots()[key];
    try {
        const result = await runTotalForSets({ slot, now, sets }, realTotalDeps());
        const queue = readQueue();
        const record = recordAfterRun(prev, { complete: queue.length === 0, final: true, pending: queue }, result, Date.now());
        if (recordSlot) saveSlot(key, record, Date.now());
        for (const w of result.warnings) console.warn(`[total] cảnh báo: ${w}`);
        console.log(`[total] ${day} đợt ${slotName}: ${result.files.length}/${result.expected ?? 7} file -> ${Object.entries(result.counts).map(([k, n]) => `${k}: ${n}`).join(", ")}`);
        if (queue.length > 0) console.log(`[total] lưu ý: hàng chờ cào còn ${queue.length} nhóm (${queue.join(", ")}), báo cáo có thể chưa đủ.`);
        if (result.failed.length > 0) process.exitCode = 1;

        if (wantPrint) {
            const summary = printTotalFiles(result, { maxPages: config.print.maxPagesPerFile, run: (job, maxPages) => runPrintScript(job, maxPages, dryRun, config.print.centerPage) });
            for (const w of summary.warnings) console.warn(`[total] cảnh báo in: ${w}`);
            if (dryRun) {
                console.log(`[total] CHẠY THỬ, KHÔNG in. Sẽ in ${summary.wouldPrint.length} file ra ${summary.printer ?? "(chưa rõ máy in)"}: ${summary.wouldPrint.join(", ")}`);
            } else {
                if (recordSlot) saveSlot(key, withPrinted(record, summary, Date.now()), Date.now());
                console.log(`[total] đã gửi lệnh in ${summary.sent.length} file tới ${summary.printer ?? "(chưa rõ máy in)"}: ${summary.sent.join(", ")}. Giấy ra hay chưa phải xem ở máy in.`);
            }
        }
    } catch (err) {
        if (recordSlot) saveSlot(key, recordAfterCrash(prev, Date.now(), (err as Error).message), Date.now());
        throw err;
    }
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
});
