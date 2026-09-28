import fs from "node:fs";
import path from "node:path";
import { outputDir } from "../core/paths.js";
import { recoveryIgnoreWith } from "../chat/rules.js";
import { config } from "../../config.js";
import { runScrape } from "../scrape/desktopScraper.js";
import { effectiveGaps } from "../watch/watchState.js";
import { formatRecovery } from "../lesson/recoveryReport.js";
import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import { runRecovery } from "../lesson/recoveryRun.js";
import { currentSession, isBuoi, todayVietnam } from "../lesson/time.js";
import { MessageStore } from "../store/messageStore.js";
import type { Buoi, SourceMessage } from "../types/index.js";

/**
 * Safety net for a `bot:watch` that died (or went blind) and missed messages.
 *
 * It does nothing unless the watcher's own records (data/.watch-state.json and
 * data/.watch-gaps.json, see src/watch/watchState.ts) show a gap that overlaps
 * the session. When they do, it re-scrapes ONLY the groups that still lack a
 * start or end report — from shortly before the gap — and says which messages
 * that brought back (output/recovery.json). Groups in `config.recoveryIgnoreTargets`
 * are never touched.
 *
 *   npm run recover:missing -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--dry-run]
 *
 * Exit code 1 when a re-scraped group failed; groups that are still missing
 * afterwards are reported but are not an error.
 */
const outDir = outputDir;

function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
    const day = option("--day") ?? todayVietnam();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
    const buoiArg = option("--buoi");
    if (buoiArg !== undefined && !isBuoi(buoiArg)) throw new Error(`--buoi must be sang, chieu or toi, got "${buoiArg}"`);
    const buoi: Buoi = buoiArg ?? currentSession();
    const dryRun = process.argv.includes("--dry-run");

    // A real recovery drives Zalo Desktop's UI, so it must not overlap a bot:runner cycle or a bot:scrape.
    if (!dryRun) {
        const lock = acquireScrapeLock("recover:missing");
        if (!lock.ok) throw new Error(`đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) điều khiển Zalo Desktop — không chạy song song. Thử lại sau khi nó xong.`);
    }
    const store = new MessageStore();
    const result = await runRecovery(
        { day, buoi, dryRun },
        {
            now: () => Date.now(),
            targets: config.targets,
            ignoreTargets: recoveryIgnoreWith(config.recoveryIgnoreTargets),
            loadMessages: async () => {
                const all: SourceMessage[] = [];
                for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
                return all;
            },
            gaps: (now) => effectiveGaps(now),
            scrape: (targets, sinceTs) => runScrape(store, targets, { sinceTs, untilTs: null }),
        },
    );

    for (const line of formatRecovery(result)) console.log(line);

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "recovery.json"), JSON.stringify(result, null, 2), "utf8");
    if (result.errors.length > 0) process.exitCode = 1;
}

main()
    .catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    })
    .finally(() => releaseScrapeLock());
