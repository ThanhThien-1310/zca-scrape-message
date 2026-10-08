import { readQueue, readQueueMeta, readQueueSeen } from "../scrape/scrapeQueue.js";
import { loadBuiltBySet, readBuiltRaw } from "../runner/builtReports.js";
import { pendingBuilds } from "../runner/buildPlan.js";
import { readFailed } from "../runner/failedFills.js";
import { formatRunnerStatus } from "../runner/runnerStatusReport.js";
import { readRunnerState, runnerHealth } from "../runner/runnerState.js";
import { toQueueTimes } from "../runner/schedule.js";
import { loadMessages } from "../runner/steps.js";
import { hasSetErrors, loadReportSets } from "../reportSets/cliSet.js";

/**
 * Is `bot:runner` alive, what did its last cycle do, what is queued, which sessions have a report not built into an Excel yet, which report
 * sets run and what is wrong with `config.reportSets`. Read-only. Exit code 0 when the runner is alive and the report sets have no error,
 * 2 otherwise (dead, stopped, in error, never ran, or a set disabled by a configuration error) so an agent can tell a person must look.
 *
 *   npm run runner:status
 */
const now = Date.now();
const state = readRunnerState();
const queue = readQueue();
const times = toQueueTimes(queue, readQueueMeta(), now, readQueueSeen());
const loaded = loadReportSets();
const failed = readFailed();
const messages = await loadMessages();
const raw = readBuiltRaw();
const dirty = raw === null ? [] : pendingBuilds(loaded.active, messages, loadBuiltBySet(raw, loaded.active.map((s) => s.id), messages).built, failed);
for (const line of formatRunnerStatus({ state, queue, firstQueuedAt: queue.length > 0 ? times.firstQueuedAt : null, dirty, now, sets: { active: loaded.active, problems: loaded.problems, failed: [...failed].map((k) => k.split("|").join(" ")) } })) console.log(line);
if (runnerHealth(state, now) !== "alive" || hasSetErrors(loaded.problems)) process.exitCode = 2;
