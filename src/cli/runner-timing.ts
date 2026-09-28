import fs from "node:fs";
import { DEFAULT_RUNNER_FILES } from "../runner/runnerState.js";
import { formatTimingReport, summarizeTimings } from "../runner/timingReport.js";

/**
 * How long the runner's cycles took and how long each group took to scrape, from `output/runner-log.jsonl`. Read-only.
 * Use it after the runner has run for a while to see which groups are slow and whether the cycles are getting long.
 *
 *   npm run runner:timing -- [--last N]      only the newest N timed cycles (default: all)
 */
const i = process.argv.indexOf("--last");
const last = i >= 0 ? Number(process.argv[i + 1]) : undefined;
if (last !== undefined && (!Number.isInteger(last) || last < 1)) {
    console.error("Cách dùng: npm run runner:timing -- [--last N]  (N là số nguyên dương)");
    process.exit(1);
}

let text = "";
try {
    text = fs.readFileSync(DEFAULT_RUNNER_FILES.log, "utf8");
} catch {
    /* chưa có log */
}
const lines = text.split("\n").flatMap((l) => {
    try {
        return l.trim() === "" ? [] : [JSON.parse(l) as unknown];
    } catch {
        return [];
    }
});
for (const line of formatTimingReport(summarizeTimings(lines, { lastCycles: last }))) console.log(line);
