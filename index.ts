import { runScrape } from "./history/desktopScraper.js";
import { runQueuedScrape } from "./history/queueRun.js";
import { readQueue, removeFromQueue } from "./history/scrapeQueue.js";
import { MessageStore } from "./store/messageStore.js";

/**
 * Manual, queue-driven scrape. `bot:watch` never scrapes: it only records which
 * configured conversations saw new activity in `data/.scrape-queue.json`. This
 * script reads that queue, scrapes exactly those conversations (full scroll-back
 * to `config.sinceTs`), then removes just those entries — anything `bot:watch`
 * queued in the meantime stays. An empty queue exits at once without touching
 * Zalo Desktop. Nothing here talks to `bot:watch`; it is the only process that
 * ever drives Zalo Desktop's UI. See history/scrapeQueue.ts and history/queueRun.ts.
 */
async function main(): Promise<void> {
    const store = new MessageStore();
    const result = await runQueuedScrape({
        readQueue: () => readQueue(),
        removeFromQueue: (handled) => removeFromQueue(handled),
        scrape: (targets) => runScrape(store, targets),
        log: (message) => console.log(message),
    });
    if (result.status === "done" && result.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
