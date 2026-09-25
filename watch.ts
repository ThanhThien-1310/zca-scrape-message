import { watch } from "./history/watch.js";

/**
 * Continuous detector — stays running and records which configured
 * conversations got new messages in the scrape queue (data/.scrape-queue.json).
 * It never scrapes: run `npm run bot:scrape` to scrape what is queued.
 * See history/watch.ts.
 */
watch().catch((err) => {
    console.error(err);
    process.exit(1);
});
