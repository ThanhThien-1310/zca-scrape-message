import type { TargetOutcome } from "./desktopScraper.js";

export interface QueueRunDeps {
    readQueue(): string[];
    /**
     * Must re-read the queue itself, so targets queued during the scrape survive. `scrapeStartedAt` is when
     * the snapshot was taken: a handled target that got another message since then must stay queued.
     */
    removeFromQueue(handled: string[], scrapeStartedAt: number): void;
    scrape(targets: string[]): Promise<TargetOutcome[]>;
    log(message: string): void;
    now?(): number;
}

export type QueueRunResult = { status: "empty" } | { status: "done"; targets: string[]; failed: string[] };

/**
 * Snapshot the queue, scrape exactly those targets, then remove exactly those
 * targets. A failed target is removed too (and logged) so it cannot stay stuck
 * forever; if `scrape` itself throws (Zalo Desktop unreachable) nothing is
 * removed, since that failure is not the targets' fault.
 */
export async function runQueuedScrape(deps: QueueRunDeps): Promise<QueueRunResult> {
    const snapshot = deps.readQueue();
    if (snapshot.length === 0) {
        deps.log("[scrape] hàng chờ rỗng, không có gì để cào.");
        return { status: "empty" };
    }

    deps.log(`[scrape] hàng chờ có ${snapshot.length} nhóm: ${snapshot.join(", ")}`);
    const startedAt = deps.now?.() ?? Date.now();
    const outcomes = await deps.scrape(snapshot);
    deps.removeFromQueue(snapshot, startedAt);

    const failed = outcomes.filter((o) => o.error !== undefined).map((o) => o.target);
    for (const target of failed) deps.log(`[scrape] "${target}" lỗi, đã bỏ khỏi hàng chờ — chạy lại nếu cần cào lại.`);
    return { status: "done", targets: snapshot, failed };
}
