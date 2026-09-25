import { runScrape } from "./history/desktopScraper.js";
import { runQueuedScrape } from "./history/queueRun.js";
import { DEFAULT_QUEUE_PATH, readQueue, removeFromQueue } from "./history/scrapeQueue.js";
import { acquireScrapeLock, releaseScrapeLock } from "./history/scrapeLock.js";
import { MessageStore } from "./store/messageStore.js";

/**
 * Manual, queue-driven scrape. `bot:watch` never scrapes: it only records which
 * configured conversations saw new activity in `data/.scrape-queue.json`. This
 * script reads that queue, scrapes exactly those conversations (full scroll-back
 * to `config.sinceTs`), then removes just those entries — anything `bot:watch`
 * queued in the meantime stays. An empty queue exits at once without touching
 * Zalo Desktop. Nothing here talks to `bot:watch`; it and `bot:runner` are the
 * only processes that drive Zalo Desktop's UI, and they exclude each other with
 * history/scrapeLock.ts. See history/scrapeQueue.ts and history/queueRun.ts.
 */
async function main(): Promise<void> {
    const lock = acquireScrapeLock("bot:scrape");
    if (!lock.ok) {
        console.error(`[scrape] đang có "${lock.heldBy.owner}" (pid ${lock.heldBy.pid}) điều khiển Zalo Desktop — không chạy song song. Thử lại sau khi nó xong.`);
        process.exit(1);
    }
    try {
        const store = new MessageStore();
        const result = await runQueuedScrape({
            readQueue: () => readQueue(),
            removeFromQueue: (handled, startedAt) => removeFromQueue(handled, DEFAULT_QUEUE_PATH, startedAt),
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
