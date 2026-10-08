import { config } from "../../config.js";
import { readQueue } from "../scrape/scrapeQueue.js";
import { POLL_MS } from "../total/decide.js";
import { printTotalFiles, runPrintScript } from "../total/printFiles.js";
import { realTotalDeps } from "../total/realDeps.js";
import { takeRunnerSnapshot } from "../total/runnerSnapshot.js";
import { runTotalForSets } from "../total/runTotal.js";
import { loadReportSets, logSetProblems } from "../reportSets/cliSet.js";
import { tickTotal } from "../total/tick.js";
import { beatTotal, readSlots, saveSlot, setTotalPhase, startTotal, stopTotal, type TotalPhase } from "../total/totalState.js";
import { HEARTBEAT_INTERVAL_MS } from "../watch/watchState.js";

/**
 * Bot hẹn giờ của báo cáo tổng: tới 9:00 và 15:00 (config.total) thì xuất các file `-auto` của đợt đó cho từng bộ báo cáo (src/total/runTotal.ts).
 * Nó KHÔNG cào, KHÔNG lấy khoá cào, KHÔNG dùng file của runner: chỉ đọc trạng thái runner và hàng chờ để quyết định có nên
 * đợi (src/total/decide.ts, src/total/tick.ts). Đợt hôm nay chưa có kết quả mà đã qua giờ thì chạy bù ngay khi bot bật. Kết quả
 * từng đợt lưu ở data/.total-slots.json nên khởi động lại không xuất trùng. Xem bằng `npm run total:status`.
 *
 *   npm run bot:total
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

async function main(): Promise<void> {
    const started = startTotal(Date.now(), process.pid);
    if (started.anotherInstanceAlive) {
        console.error("[total] another `bot:total` is already running — exiting.");
        process.exit(1);
    }
    if (started.crashed) log("[total] bản bot:total trước không dừng sạch; kết quả từng đợt đã lưu nên không xuất trùng.");

    const shutdown = (code: number) => {
        stopTotal(Date.now());
        process.exit(code);
    };
    process.on("SIGINT", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
    process.on("uncaughtException", (err) => {
        console.error("[total] fatal:", err);
        shutdown(1);
    });
    process.on("unhandledRejection", (err) => {
        console.error("[total] fatal:", err);
        shutdown(1);
    });

    setInterval(() => beatTotal(Date.now()), HEARTBEAT_INTERVAL_MS);

    const { active: sets, problems } = loadReportSets();
    logSetProblems(problems, log);
    if (sets.length === 0) log("[total] KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY: các đợt sẽ không xuất file nào. Sửa config.reportSets rồi khởi động lại.");

    // Mỗi lần điền Excel chặn vòng lặp sự kiện (execFileSync) nên setInterval ở trên không đập trong lúc xuất 7 file; ghi thêm
    // nhịp tim trước từng file để không bị coi là đã chết (và không cho một bot:total thứ hai khởi động chồng lên).
    const totalDeps = { ...realTotalDeps(), onProgress: () => beatTotal(Date.now()) };
    let phase: TotalPhase = "idle";
    log(`[total] running. Waiting for the next slot. In tự động: ${config.print.enabled ? "BẬT (máy in mặc định của Windows)" : "TẮT (print.enabled = false)"}.`);

    for (;;) {
        await sleep(POLL_MS);
        await tickTotal(Date.now(), {
            readSlots: () => readSlots(),
            saveSlot: (key, record, now) => saveSlot(key, record, now),
            readQueue: () => readQueue(),
            runnerSnapshot: (now) => takeRunnerSnapshot(now),
            runTotal: (slot, now) => runTotalForSets({ slot, now, sets }, totalDeps),
            setPhase: (next) => {
                if (next === phase) return;
                phase = next;
                setTotalPhase(Date.now(), next);
            },
            log,
            clock: () => Date.now(),
            printEnabled: config.print.enabled,
            print: (result) => printTotalFiles(result, { maxPages: config.print.maxPagesPerFile, run: (job, maxPages) => runPrintScript(job, maxPages, false, config.print.centerPage), onProgress: () => beatTotal(Date.now()) }),
        });
    }
}

main().catch((err) => {
    console.error(err);
    stopTotal(Date.now());
    process.exit(1);
});
