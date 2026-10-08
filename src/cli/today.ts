import { config } from "../../config.js";
import { makeChatGroupsReader } from "../chat/rules.js";
import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import { hhmmVietnam, todayVietnam } from "../lesson/time.js";
import { loadReportSets, logSetProblems, pickSet } from "../reportSets/cliSet.js";
import { runCycle } from "../runner/cycle.js";
import { appendLog } from "../runner/runnerState.js";
import { scrapeSinceTs } from "../runner/schedule.js";
import { loadMessages, realDeps } from "../runner/steps.js";
import { forgetToday, targetsToScrape, toRunResult, todaySessions } from "../runner/todayPlan.js";
import { runScrape } from "../scrape/desktopScraper.js";
import { MessageStore } from "../store/messageStore.js";

/**
 * Lấy TOÀN BỘ ngày hôm nay bằng một lệnh: cào lại mọi nhóm (trừ nhóm chỉ để chat) lùi tới 17:30 tối hôm trước, đồng bộ DB, dựng lại
 * mọi giai đoạn của hôm nay cho từng bộ báo cáo, rồi VỆ SINH, NỘI QUY, ĐIỆN. Dùng đúng vòng của `bot:runner` (`runCycle`) nên cách
 * xử lý lỗi từng file, đánh dấu tin và ghi khoá "đã dựng" giống hệt; chỉ khác là cào mọi nhóm thay vì hàng chờ và buộc dựng lại các
 * giai đoạn hôm nay dù đã dựng. KHÔNG làm báo cáo tổng (có `total:once` riêng). Giữ `data/.scrape.lock` nên không chạy chồng với
 * `bot:runner`/`bot:scrape`: nếu đang có vòng khác thì báo và thoát mã 2, thử lại sau ít phút.
 *
 *   npm run today -- [--set <id>] [--no-db] [--dry-run]
 *
 * --set <id>  chỉ một bộ báo cáo (mặc định mọi bộ đang chạy);  --no-db  bỏ bước đồng bộ DB;  --dry-run  chỉ liệt kê, không cào, không dựng.
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(name);

const vn = (ts: number): string => `${todayVietnam(ts)} ${hhmmVietnam(ts).slice(0, 2)}:${hhmmVietnam(ts).slice(2)}`;

async function main(): Promise<void> {
    const loaded = loadReportSets();
    logSetProblems(loaded.problems);
    const chosen = option("--set") === undefined ? loaded.active : [pickSet(loaded.active, option("--set"))];
    if (chosen.length === 0) {
        console.error("[today] không có bộ báo cáo nào để dựng.");
        process.exit(2);
    }

    const now = Date.now();
    const today = todayVietnam(now);
    const since = scrapeSinceTs(now);
    const targets = targetsToScrape(config.targets, makeChatGroupsReader()().noScrape);
    const store = new MessageStore();

    if (flag("--dry-run")) {
        const sessions = todaySessions(await loadMessages(store), today);
        console.log(`[today] CHẠY THỬ, không cào, không dựng. Ngày ${today}.`);
        console.log(`[today] sẽ cào ${targets.length} nhóm từ ${vn(since)}: ${targets.join(", ")}`);
        console.log(`[today] đồng bộ DB: ${flag("--no-db") ? "bỏ qua (--no-db)" : "có"}`);
        console.log(`[today] bộ báo cáo: ${chosen.map((s) => s.id).join(", ")}`);
        console.log(`[today] các giai đoạn hôm nay đang có báo cáo trong kho (sẽ dựng lại sau khi cào, có thể thêm giai đoạn mới): ${sessions.length === 0 ? "(chưa có)" : sessions.map((s) => s.buoi).join(", ")}`);
        return;
    }

    const lock = acquireScrapeLock("today");
    if (!lock.ok) {
        console.error(`[today] đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) giữ khoá cào/dựng — thử lại sau ít phút.`);
        process.exit(2);
    }
    try {
        console.log(`[today] ngày ${today}: cào ${targets.length} nhóm từ ${vn(since)}, rồi dựng lại mọi giai đoạn hôm nay cho ${chosen.map((s) => s.id).join(", ")}.`);
        const base = realDeps({ freshGaps: () => [], sets: () => chosen });
        const ids = chosen.map((s) => s.id);
        const summary = await runCycle({
            ...base,
            recover: async () => ({ errors: [] }),
            scrapeQueued: async () => toRunResult(targets, await runScrape(store, targets, { sinceTs: since, untilTs: null })),
            syncDb: flag("--no-db") ? async () => undefined : base.syncDb,
            built: {
                read: (setIds, messages) => {
                    const { built, forgotten } = forgetToday(base.built.read(setIds, messages), messages, today, ids);
                    if (forgotten > 0) console.log(`[today] dựng lại các giai đoạn hôm nay (${forgotten} báo cáo được tính là chưa dựng).`);
                    return built;
                },
                write: base.built.write,
            },
        });
        summary.kind = "rebuild";
        appendLog(summary);

        const scraped = summary.timings ?? [];
        console.log(`[today] đã cào ${scraped.filter((t) => t.ok).length}/${targets.length} nhóm, tin mới ${scraped.reduce((n, t) => n + (t.written ?? 0), 0)}.`);
        const sessions = summary.sessions.map((s) => `${s.day} ${s.buoi}`);
        console.log(`[today] đã dựng ${sessions.length} giai đoạn: ${sessions.length === 0 ? "(không có báo cáo nào hôm nay)" : sessions.join(", ")}; cần xem ${summary.reviewCount}.`);
        for (const s of summary.sets ?? []) if (s.failedReports.length > 0) console.warn(`[today] bộ ${s.id}: file lỗi, runner sẽ thử lại: ${s.failedReports.join(", ")}`);
        for (const t of scraped.filter((x) => !x.ok)) console.warn(`[today] không cào được "${t.target}" — chạy lại \`npm run scrape:add -- "${t.target}"\` hoặc lệnh này sau.`);
        for (const w of summary.warnings) console.warn(`[today] cảnh báo: ${w}`);
        for (const e of summary.buildErrors) console.error(`[today] lỗi dựng: ${e}`);
        for (const e of summary.errors) console.error(`[today] lỗi: ${e}`);
        if (!summary.ok || summary.buildErrors.length > 0) process.exitCode = 1;
        console.log(`[today] file nằm ở ${config.statusExportDir}\\${today.slice(2, 4)}${today.slice(5, 7)}\\${today.slice(2, 4)}${today.slice(5, 7)}${today.slice(8, 10)}\\<bộ>.`);
    } finally {
        releaseScrapeLock();
    }
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
    releaseScrapeLock();
});
