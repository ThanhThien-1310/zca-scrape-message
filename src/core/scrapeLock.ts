import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { pidAlive } from "../watch/watchState.js";
import type { LockHolder, LockResult } from "../types/index.js";

/**
 * One lock for everything that drives Zalo Desktop's UI (`bot:scrape` and every `bot:runner`
 * cycle), so two of them never click and scroll at once. The file holds who took it; a lock
 * whose process is gone (crash) is stale and is taken over.
 */
export const DEFAULT_LOCK_PATH = path.join(config.dataDir, ".scrape.lock");

function readHolder(file: string): LockHolder | null {
    try {
        const v = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<LockHolder>;
        return typeof v.pid === "number" && typeof v.owner === "string" && typeof v.at === "number" ? { pid: v.pid, owner: v.owner, at: v.at } : null;
    } catch {
        return null;
    }
}

export function acquireScrapeLock(
    owner: string,
    pid: number = process.pid,
    file: string = DEFAULT_LOCK_PATH,
    isAlive: (pid: number) => boolean = pidAlive,
    now: number = Date.now(),
): LockResult {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const body = JSON.stringify({ pid, owner, at: now });
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fs.writeFileSync(file, body, { flag: "wx" });
            return { ok: true };
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        }
        const holder = readHolder(file);
        if (holder && holder.pid !== pid && isAlive(holder.pid)) return { ok: false, heldBy: holder };
        fs.rmSync(file, { force: true }); // stale (dead holder, corrupt file) or our own: replace it
    }
    const holder = readHolder(file);
    return holder ? { ok: false, heldBy: holder } : { ok: false, heldBy: { pid: 0, owner: "unknown", at: now } };
}

/** Removes the lock only if `pid` is the one holding it. */
export function releaseScrapeLock(pid: number = process.pid, file: string = DEFAULT_LOCK_PATH): void {
    const holder = readHolder(file);
    if (holder && holder.pid === pid) fs.rmSync(file, { force: true });
}
