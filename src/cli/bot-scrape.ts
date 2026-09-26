import { runScrape } from "../scrape/desktopScraper.js";
import { runQueuedScrape } from "../scrape/queueRun.js";
import { completeSnapshot, importLegacyQueue, takeSnapshot } from "../scrape/scrapeQueue.js";
import { acquireScrapeLock, releaseScrapeLock } from "../core/scrapeLock.js";
import { MessageStore } from "../store/messageStore.js";

/**
 * Manual, queue-driven scrape. `bot:watch` never scrapes: it only records which
 * configured conversations saw new activity, in `data/.scrape-events-<day>.jsonl`. This
 * script reads that queue, scrapes exactly those conversations (full scroll-back
 * to `config.sinceTs`), then marks just those as scraped — anything `bot:watch`
 * queued in the meantime stays, and a conversation that failed stays queued for a retry. An empty queue exits at once without touching
 * Zalo Desktop. Nothing here talks to `bot:watch`; it and `bot:runner` are the
 * only processes that drive Zalo Desktop's UI, and they exclude each other with
 * src/core/scrapeLock.ts. See src/scrape/scrapeQueue.ts and src/scrape/queueRun.ts.
 */
async function main(): Promise<void> {
    const lock = acquireScrapeLock("bot:scrape");
    if (!lock.ok) {
        console.error(`[scrape] đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) điều khiển Zalo Desktop — không chạy song song. Thử lại sau khi nó xong.`);
        process.exit(1);
    }
    try {
        importLegacyQueue();
        const store = new MessageStore();
        const result = await runQueuedScrape({
            takeSnapshot: () => takeSnapshot(),
            complete: (snapshot, failed) => completeSnapshot(snapshot, { failed }),
            scrape: (targets) => runScrape(store, targets),
            log: (message) => console.log(message),
        });
        if (result.status === "done" && result.failed.length > 0) process.exitCode = 1;
    } finally {
        releaseScrapeLock();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
