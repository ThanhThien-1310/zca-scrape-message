import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Durable set of target names (as in `config.targets`) that `bot:watch` saw new
 * activity for and `bot:scrape` has not scraped yet. Two processes use it:
 * `bot:watch` only adds, `bot:scrape` reads a snapshot and later removes the
 * targets it handled. Every write is atomic (temp file + rename); the
 * read-modify-write itself is not locked — the worst case of the tiny race
 * between the two processes is one target enqueued again by its next message.
 */
export const DEFAULT_QUEUE_PATH = path.join(config.dataDir, ".scrape-queue.json");

/** A missing, unreadable or wrongly shaped file reads as an empty queue; non-string entries are dropped. */
export function readQueue(file: string = DEFAULT_QUEUE_PATH): string[] {
    try {
        const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
        return [];
    }
}

function writeQueue(list: string[], file: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
    fs.renameSync(tmp, file);
}

/** Adds `target` unless already queued; returns whether it was added. */
export function enqueueTarget(target: string, file: string = DEFAULT_QUEUE_PATH): boolean {
    const queue = readQueue(file);
    if (queue.includes(target)) return false;
    queue.push(target);
    writeQueue(queue, file);
    return true;
}

/** Re-reads the file and removes only `handled`, so a target queued after the caller took its snapshot survives. */
export function removeFromQueue(handled: string[], file: string = DEFAULT_QUEUE_PATH): void {
    const drop = new Set(handled);
    const current = readQueue(file);
    const remaining = current.filter((t) => !drop.has(t));
    if (remaining.length === current.length && !fs.existsSync(file)) return;
    writeQueue(remaining, file);
}
