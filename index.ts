import { config } from "./config.js";
import { MessageStore } from "./store/messageStore.js";
import { runScrape } from "./history/desktopScraper.js";

/**
 * Read-only Zalo message scraper, meant to be invoked on a schedule (Task
 * Scheduler at e.g. 08:00 and 12:00) or run ad hoc whenever. There is no
 * send/reply path anywhere in this codebase, and no separate login step —
 * see history/desktopScraper.ts for how it reuses Zalo Desktop's own
 * already-signed-in session.
 *
 * If `bot:watch` (watch.ts) is already running, this delegates the scrape
 * to it over its localhost-only control server instead of opening a second,
 * competing CDP connection to the same Zalo Desktop window — see
 * history/watch.ts's startControlServer for why running two independent
 * connections at once is the real risk, not Zalo Desktop restarting.
 * Otherwise (bot:watch isn't running), falls back to the standalone path
 * this always used, unchanged.
 */
async function tryDelegateToWatch(): Promise<boolean> {
    let res: Response;
    try {
        res = await fetch(`http://127.0.0.1:${config.watchControlPort}/scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
            // A full scroll-back scrape of several targets can genuinely take
            // a while — this only needs to be generous, not tight, since a
            // fast failure (bot:watch simply isn't running) rejects almost
            // immediately on connection refused, well before this fires.
            signal: AbortSignal.timeout(10 * 60_000),
        });
    } catch {
        return false; // bot:watch isn't running (or its control server isn't up yet) — run standalone instead.
    }

    if (!res.ok) {
        console.error(`[scrape] bot:watch's control server returned ${res.status} — falling back to running standalone.`);
        return false;
    }

    const data = (await res.json()) as { results: Array<{ target: string; scraped: number; written: number } | { target: string; error: string }> };
    for (const r of data.results) {
        if ("error" in r) console.error(`[scrape] "${r.target}": failed —`, r.error);
        else console.log(`[scrape] "${r.target}": scraped ${r.scraped}, ${r.written} new (via already-running bot:watch)`);
    }
    return true;
}

async function main() {
    if (await tryDelegateToWatch()) return;

    const store = new MessageStore();
    await runScrape(store);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
