import { formatWatchStatus } from "./history/watchStatusReport.js";
import { effectiveGaps, readState } from "./history/watchState.js";

/**
 * Quick look at whether `bot:watch` is alive, when it last gave a sign of life,
 * whether both of its detection sources are up, and when it was not listening
 * in the last 24 hours (read from data/.watch-state.json and data/.watch-gaps.json).
 *
 *   npm run watch:status
 */
const now = Date.now();
for (const line of formatWatchStatus(readState(), effectiveGaps(now), now)) console.log(line);
