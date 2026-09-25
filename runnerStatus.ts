import { readQueue, readQueueMeta } from "./history/scrapeQueue.js";
import { formatRunnerStatus } from "./runner/runnerStatusReport.js";
import { readPending, readRunnerState, runnerHealth } from "./runner/runnerState.js";
import { toQueueTimes } from "./runner/schedule.js";

/**
 * Is `bot:runner` alive, what did its last cycle do, what is queued, which sessions still owe a rebuild.
 * Read-only. Exit code 0 when the runner is alive, 2 when it is not (dead, stopped, in error, or never ran)
 * so an agent can tell it needs to be restarted by a person.
 *
 *   npm run runner:status
 */
const now = Date.now();
const state = readRunnerState();
const queue = readQueue();
const times = toQueueTimes(queue, readQueueMeta(), now);
for (const line of formatRunnerStatus({ state, queue, firstQueuedAt: queue.length > 0 ? times.firstQueuedAt : null, pending: readPending(), now })) console.log(line);
if (runnerHealth(state, now) !== "alive") process.exitCode = 2;
