import type { CompleteResult, QueueRunResult, QueueSnapshot, TargetOutcome } from "../types/index.js";

export interface QueueRunDeps {
    /** The queued groups and how far the queue files were read (src/scrape/scrapeQueue.ts `takeSnapshot`). */
    takeSnapshot(): QueueSnapshot;
    /** Marks the snapshot as scraped: groups queued since stay queued, failed groups stay queued until their attempts run out. */
    complete(snapshot: QueueSnapshot, failed: string[]): CompleteResult;
    scrape(targets: string[]): Promise<TargetOutcome[]>;
    log(message: string): void;
}

/**
 * Snapshot the queue, scrape exactly those targets, then mark exactly those as scraped. A failed target is not
 * dropped: it stays queued and is tried again in a later run, until `config.runner.maxScrapeAttempts` attempts are
 * used up (then it is dropped and logged loudly). If `scrape` itself throws (Zalo Desktop unreachable) nothing is
 * marked, since that failure is not the targets' fault.
 */
export async function runQueuedScrape(deps: QueueRunDeps): Promise<QueueRunResult> {
    const snapshot = deps.takeSnapshot();
    if (snapshot.targets.length === 0) {
        deps.log("[scrape] hàng chờ rỗng, không có gì để cào.");
        return { status: "empty" };
    }

    deps.log(`[scrape] hàng chờ có ${snapshot.targets.length} nhóm: ${snapshot.targets.join(", ")}`);
    const outcomes = await deps.scrape(snapshot.targets);
    const failed = outcomes.filter((o) => o.error !== undefined).map((o) => o.target);
    const { retrying, gaveUp } = deps.complete(snapshot, failed);

    for (const target of retrying) deps.log(`[scrape] "${target}" lỗi, giữ lại trong hàng chờ để thử lại.`);
    for (const target of gaveUp) deps.log(`[scrape] "${target}" lỗi và đã hết số lần thử, bỏ khỏi hàng chờ — chạy lại nếu cần cào lại: npm run scrape:add -- "${target}"`);
    return { status: "done", targets: snapshot.targets, failed, gaveUp, outcomes };
}
