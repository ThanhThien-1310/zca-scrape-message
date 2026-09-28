import { watch } from "../watch/watch.js";

/**
 * Continuous detector — stays running and records which configured
 * conversations got new messages in the scrape queue (data/.scrape-events-<day>.jsonl).
 * It never scrapes: run `npm run bot:scrape` to scrape what is queued.
 * See src/watch/watch.ts.
 */
watch().catch((err) => {
    console.error(err);
    process.exit(1);
});
