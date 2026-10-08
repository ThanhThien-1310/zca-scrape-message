import { effectiveGaps, readState } from "../watch/watchState.js";
import { formatWatchStatus } from "../watch/watchStatusReport.js";
import { gapsInWindow, recoveryWindow } from "../lesson/recovery.js";
import { currentSession, isBuoi, todayVietnam } from "../lesson/time.js";
import type { Buoi } from "../types/index.js";

/**
 * Quick look at whether `bot:watch` is alive, when it last gave a sign of life,
 * whether both of its detection sources are up, and when it was not listening
 * in the last 24 hours (read from data/.watch-state.json and data/.watch-gaps.json).
 *
 *   npm run watch:status
 *   npm run watch:status -- --day YYYY-MM-DD --buoi sang|chieu|toi
 *
 * With `--buoi` (or `--day`) it also decides whether that session needs
 * `recover:missing`, and says so in its exit code so an agent can act on it:
 *   0  no gap overlaps the session — nothing to recover
 *   2  a gap overlaps the session — run `recover:missing` for it
 *   1  the command itself failed (bad arguments) — treat as "unknown", run recovery
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
    const now = Date.now();
    const gaps = effectiveGaps(now);
    const asked = option("--buoi") !== undefined || option("--day") !== undefined;

    let session: { day: string; buoi: Buoi; overlapping: ReturnType<typeof gapsInWindow> } | undefined;
    if (asked) {
        const day = option("--day") ?? todayVietnam();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`--day must be YYYY-MM-DD, got "${day}"`);
        const buoiArg = option("--buoi");
        if (buoiArg !== undefined && !isBuoi(buoiArg)) throw new Error(`--buoi must be sang, chieu or toi, got "${buoiArg}"`);
        const buoi: Buoi = buoiArg ?? currentSession();
        session = { day, buoi, overlapping: gapsInWindow(gaps, recoveryWindow(day, buoi), now) };
    }

    for (const line of formatWatchStatus(readState(), gaps, now, session)) console.log(line);
    if (session && session.overlapping.length > 0) process.exitCode = 2;
}

try {
    main();
} catch (err) {
    console.error((err as Error).message);
    process.exit(1);
}
