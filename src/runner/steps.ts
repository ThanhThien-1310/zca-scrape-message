import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { outputDir, repoRoot, srcDir } from "../core/paths.js";
import { recoveryIgnoreWith } from "../chat/rules.js";
import { config } from "../../config.js";
import { runScrape } from "../scrape/desktopScraper.js";
import { runQueuedScrape } from "../scrape/queueRun.js";
import { completeSnapshot, takeSnapshot } from "../scrape/scrapeQueue.js";
import { runRecovery } from "../lesson/recoveryRun.js";
import { currentSession, todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { CycleDeps } from "./cycle.js";
import { readBuilt, writeBuilt } from "./builtReports.js";
import { makeRecoverStep } from "./recoveryPlan.js";
import { scrapeSinceTs } from "./schedule.js";
import type { BuildResult, Gap, SessionKey, SourceMessage } from "../types/index.js";

const outDir = outputDir;

/** Runs one of the command-line scripts in `src/cli/` (`tsx` loader) and resolves with its exit code and combined output. */
function runScript(script: string, args: string[]): Promise<{ code: number; output: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", path.join(srcDir, "cli", script), ...args], { cwd: repoRoot });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code: code ?? 1, output }));
    });
}

const tail = (text: string) => text.trim().split(/\r?\n/).slice(-6).join(" | ");

async function mustRun(script: string, args: string[]): Promise<string> {
    const r = await runScript(script, args);
    if (r.code !== 0) throw new Error(`${script} thoát mã ${r.code}: ${tail(r.output)}`);
    return r.output;
}

export async function loadMessages(store: MessageStore = new MessageStore()): Promise<SourceMessage[]> {
    const all: SourceMessage[] = [];
    for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
    return all;
}

/**
 * Extract one session, fill the 5 non-macro status-report templates, mark its messages. The existing CLIs
 * are reused as they are.
 *
 * `fill:report` (the old `.xlsm` + VBA-macro flow) is RETIRED here (tạm thời, theo yêu cầu người dùng
 * 2026-09-29): its template `templates/Temp_RoomFacility_rpt.xlsm` disappeared from disk (không tìm được
 * cơ chế nào trong các thao tác của agent chạm tới thư mục đó — xem hội thoại), and 4/5 bảng nó dựng (MAY
 * TINH, INTERNET, NETSUPPORT, LOA) đã có bản thay thế chi tiết hơn qua `fill:status-reports`; bảng thứ 5
 * (MÁY LẠNH) tạm thời bỏ qua, chưa có file mẫu mới. `BuildResult.excel` vì vậy luôn là `null` bây giờ.
 */
export async function buildSession(session: SessionKey): Promise<BuildResult> {
    const warnings: string[] = [];
    await mustRun("extract-reports.ts", ["--day", session.day, "--buoi", session.buoi]);
    const review = JSON.parse(fs.readFileSync(path.join(outDir, "review.json"), "utf8")) as unknown[];
    // output/review.json belongs to whichever session was built last; keep one per session for the agent.
    fs.copyFileSync(path.join(outDir, "review.json"), path.join(outDir, `review_${session.day}_${session.buoi}.json`));

    // 5 file trạng thái thiết bị không macro (LOA/INTERNET/NETSUPPORT/MÁY TÍNH/BO SUNG). Tên file đã tất định
    // theo (ngày, giai đoạn) nên không cần safeReplace — không đè lên phiên khác. Nếu Excel đang mở sẵn 1 file
    // (ai đó đang xem) thì bước này lỗi, KHÔNG được làm hỏng cả phiên build — chỉ ghi cảnh báo.
    try {
        await mustRun("fill-status-reports.ts", [path.join(outDir, "output.json"), "--day", session.day, "--buoi", session.buoi]);
    } catch (err) {
        warnings.push(`fill-status-reports: ${(err as Error).message}`);
    }

    await mustRun("mark-messages.ts", [path.join(outDir, "marks.json")]);
    return { reviewCount: review.length, excel: null, warnings };
}

/**
 * `freshGaps` returns the `bot:watch` gaps that no recovery has covered yet (src/runner/recoveryPlan.ts). The recover step
 * of a cycle only ever works on those: with none, a cycle triggered by the queue scrapes ONLY the queue.
 */
export function realDeps(opts: { freshGaps: () => Gap[] }): CycleDeps {
    const store = new MessageStore();
    return {
        now: () => Date.now(),
        loadMessages: () => loadMessages(store),
        recover: makeRecoverStep(opts.freshGaps, async (gaps) => {
            const result = await runRecovery(
                { day: todayVietnam(), buoi: currentSession() },
                {
                    now: () => Date.now(),
                    targets: config.targets,
                    ignoreTargets: recoveryIgnoreWith(config.recoveryIgnoreTargets),
                    loadMessages: () => loadMessages(store),
                    gaps: () => gaps,
                    scrape: (targets, sinceTs) => runScrape(store, targets, { sinceTs, untilTs: null }),
                },
            );
            return { errors: result.errors.map((e) => `${e.target}: ${e.error}`) };
        }),
        scrapeQueued: () =>
            runQueuedScrape({
                takeSnapshot: () => takeSnapshot(),
                complete: (snapshot, failed) => completeSnapshot(snapshot, { failed }),
                // Scroll back to the start of today only: the default `config.sinceTs` is fixed when the process starts.
                scrape: (targets) => runScrape(store, targets, { sinceTs: scrapeSinceTs(Date.now()), untilTs: null }),
                log: (m) => console.log(m),
            }),
        syncDb: async () => {
            await mustRun("sync-db.ts", ["--apply"]);
        },
        build: buildSession,
        built: { read: () => readBuilt() ?? new Set<string>(), write: (keys) => writeBuilt(keys) },
    };
}
