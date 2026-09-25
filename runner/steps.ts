import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { runScrape } from "../history/desktopScraper.js";
import { runQueuedScrape } from "../history/queueRun.js";
import { readQueue, removeFromQueue } from "../history/scrapeQueue.js";
import { effectiveGaps } from "../history/watchState.js";
import { runRecovery } from "../lesson/recoveryRun.js";
import { currentSession, reportFileName, todayVietnam } from "../lesson/time.js";
import type { SourceMessage } from "../lesson/types.js";
import { MessageStore } from "../store/messageStore.js";
import type { SessionKey } from "./affectedSessions.js";
import type { BuildResult, CycleDeps } from "./cycle.js";
import { readPending, writePending } from "./runnerState.js";
import { safeReplace } from "./safeReplace.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "output");

/** Runs one of this repo's CLI scripts (`tsx` loader) and resolves with its exit code and combined output. */
function runScript(script: string, args: string[]): Promise<{ code: number; output: string }> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", path.join(repoRoot, script), ...args], { cwd: repoRoot });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code: code ?? 1, output }));
    });
}

const tail = (text: string) => text.trim().split(/\r?\n/).slice(-6).join(" | ");

async function mustRun(script: string, args: string[]): Promise<string> {
    const r = await runScript(script, args);
    if (r.code !== 0) throw new Error(`${script} thoát mã ${r.code}: ${tail(r.output)}`);
    return r.output;
}

export async function loadMessages(store: MessageStore = new MessageStore()): Promise<SourceMessage[]> {
    const all: SourceMessage[] = [];
    for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
    return all;
}

/** Extract one session, write its Excel (via a temp file), mark its messages. The existing CLIs are reused as they are. */
export async function buildSession(session: SessionKey): Promise<BuildResult> {
    const warnings: string[] = [];
    await mustRun("extractLessonReports.ts", ["--day", session.day, "--buoi", session.buoi]);
    const review = JSON.parse(fs.readFileSync(path.join(outDir, "review.json"), "utf8")) as unknown[];

    const target = path.join(repoRoot, "data", "export", reportFileName(session.day, session.buoi));
    const result = await safeReplace(target, async (tmp) => {
        await mustRun("fillRoomFacilityReport.ts", [path.join(outDir, "output.json"), "--day", session.day, "--buoi", session.buoi, "--out", tmp]);
    });
    if (result.status === "fallback") warnings.push(`file ${path.basename(target)} đang mở, đã lưu thành ${path.basename(result.path!)}`);

    await mustRun("markMessages.ts", [path.join(outDir, "marks.json")]);
    return { reviewCount: review.length, excel: result.path, warnings };
}

export function realDeps(): CycleDeps {
    const store = new MessageStore();
    return {
        now: () => Date.now(),
        loadMessages: () => loadMessages(store),
        recover: async () => {
            const result = await runRecovery(
                { day: todayVietnam(), buoi: currentSession() },
                {
                    now: () => Date.now(),
                    targets: config.targets,
                    ignoreTargets: config.recoveryIgnoreTargets,
                    loadMessages: () => loadMessages(store),
                    gaps: (now) => effectiveGaps(now),
                    scrape: (targets, sinceTs) => runScrape(store, targets, { sinceTs }),
                },
            );
            return { errors: result.errors.map((e) => `${e.target}: ${e.error}`) };
        },
        scrapeQueued: () =>
            runQueuedScrape({
                readQueue: () => readQueue(),
                removeFromQueue: (handled) => removeFromQueue(handled),
                scrape: (targets) => runScrape(store, targets),
                log: (m) => console.log(m),
            }),
        syncDb: async () => {
            await mustRun("syncDb.ts", ["--apply"]);
        },
        build: buildSession,
        pending: { read: () => readPending(), write: (list) => writePending(list) },
    };
}
