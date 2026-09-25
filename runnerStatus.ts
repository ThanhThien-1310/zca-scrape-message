import { readQueue, readQueueMeta, readQueueSeen } from "./history/scrapeQueue.js";
import { dirtySessions, readBuilt } from "./runner/builtReports.js";
import { formatRunnerStatus } from "./runner/runnerStatusReport.js";
import { readRunnerState, runnerHealth } from "./runner/runnerState.js";
import { toQueueTimes } from "./runner/schedule.js";
import { loadMessages } from "./runner/steps.js";

/**
 * Is `bot:runner` alive, what did its last cycle do, what is queued, which sessions have a report not
 * built into an Excel yet. Read-only. Exit code 0 when the runner is alive, 2 when it is not (dead,
 * stopped, in error, or never ran) so an agent can tell it needs to be restarted by a person.
 *
 *   npm run runner:status
 */
const now = Date.now();
const state = readRunnerState();
const queue = readQueue();
const times = toQueueTimes(queue, readQueueMeta(), now, readQueueSeen());
const built = readBuilt();
const dirty = built === null ? [] : dirtySessions(await loadMessages(), built);
for (const line of formatRunnerStatus({ state, queue, firstQueuedAt: queue.length > 0 ? times.firstQueuedAt : null, dirty, now })) console.log(line);
if (runnerHealth(state, now) !== "alive") process.exitCode = 2;
