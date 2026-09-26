import { enqueueTarget } from "../../src/scrape/scrapeQueue.js";

/** Child process of the queue race test: queues `groups` distinct groups, one at a time, like `bot:watch` does. */
const [file, groups] = [process.argv[2], Number(process.argv[3])];
for (let i = 0; i < groups; i++) {
    enqueueTarget(`G${i}`, file);
    await new Promise((r) => setTimeout(r, Math.random() * 6));
}
