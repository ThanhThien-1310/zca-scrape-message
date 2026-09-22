import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { config } from "../config.js";

export type NormalizedMessage = {
    msgId: string;
    /** Real Zalo conversation id (group: `g<digits>`; DM: the other party's numeric user id) — stable across renames, also used as the JSONL filename. */
    groupId: string;
    /** Display name of the conversation at scrape time — informational only, never used as a storage key. */
    groupName: string;
    threadType: "user" | "group";
    senderId: string;
    senderName: string;
    isSelf: boolean;
    ts: number;
    msgType: string;
    content: unknown;
    /** Which of the two data sources produced this row. */
    source: "realtime" | "history";
};

/**
 * Append-only JSONL store, one file per conversation (named by `groupId`,
 * not the display name — see NormalizedMessage), deduped by msgId. Both the
 * realtime listener and the history scraper write through this so a message
 * seen twice (e.g. a recent message the scraper also scrolls past) is only
 * ever stored once.
 */
export class MessageStore {
    private dataDir: string;
    private seenIds = new Map<string, Set<string>>();
    /** Per-group senderId -> last known senderName, seeded from disk on first access — see backfillSenderName. */
    private senderNames = new Map<string, Map<string, string>>();

    constructor(dataDir: string = config.dataDir) {
        this.dataDir = dataDir;
        fs.mkdirSync(this.dataDir, { recursive: true });
    }

    private filePath(groupId: string) {
        return path.join(this.dataDir, `${groupId}.jsonl`);
    }

    private loadSeenIds(groupId: string): Set<string> {
        let set = this.seenIds.get(groupId);
        if (set) return set;

        set = new Set();
        const names = new Map<string, string>();
        const file = this.filePath(groupId);
        if (fs.existsSync(file)) {
            const lines = fs.readFileSync(file, "utf-8").split("\n");
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const row = JSON.parse(line) as NormalizedMessage;
                    set.add(row.msgId);
                    if (row.senderId && row.senderName) names.set(row.senderId, row.senderName);
                } catch {
                    // ignore malformed line
                }
            }
        }
        this.seenIds.set(groupId, set);
        this.senderNames.set(groupId, names);
        return set;
    }

    private getSenderNames(groupId: string): Map<string, string> {
        this.loadSeenIds(groupId); // seeds both maps together from disk on first access
        return this.senderNames.get(groupId)!;
    }

    /**
     * Zalo Desktop only renders a sender's display name on the *first*
     * bubble of a consecutive run from that person — later bubbles in the
     * same burst have an empty senderName in the DOM (see
     * history/exportExcel.ts's normalizeSenderName note). senderId doesn't
     * have this gap (read per-row from React props, not visually
     * collapsed — see readMsgIdentitySrc in history/desktopScraper.ts), so
     * an empty name for a known senderId is filled in from the last name
     * seen for that id in this conversation. The map persists for the
     * store's whole lifetime (seeded from disk, updated on every save), so
     * this works across scrape runs, not just within one batch.
     *
     * Self messages (`isSelf`) are unaffected: Zalo never renders your own
     * name on your own bubbles, so their senderId never gets a name to
     * cache in the first place — `senderName` stays "" for them, as before.
     */
    private backfillSenderName(message: NormalizedMessage): void {
        if (!message.senderId) return;
        const names = this.getSenderNames(message.groupId);
        if (message.senderName) {
            names.set(message.senderId, message.senderName);
        } else {
            const known = names.get(message.senderId);
            if (known) message.senderName = known;
        }
    }

    /** Returns true if the message was new and got written, false if it was a duplicate. */
    save(message: NormalizedMessage): boolean {
        const seen = this.loadSeenIds(message.groupId);
        this.backfillSenderName(message);
        if (seen.has(message.msgId)) return false;

        seen.add(message.msgId);
        fs.appendFileSync(this.filePath(message.groupId), JSON.stringify(message) + "\n", "utf-8");
        return true;
    }

    saveMany(messages: NormalizedMessage[]): number {
        // Pre-seed the senderId -> name map from every named row in the
        // batch first, so a name anywhere in the batch can backfill an
        // empty-named row earlier in the same array too — DOM/scroll order
        // isn't guaranteed to put the named bubble first in every batch.
        for (const m of messages) {
            if (!m.senderId || !m.senderName) continue;
            this.getSenderNames(m.groupId).set(m.senderId, m.senderName);
        }
        let written = 0;
        for (const m of messages) {
            if (this.save(m)) written++;
        }
        return written;
    }

    listThreads(): string[] {
        if (!fs.existsSync(this.dataDir)) return [];
        return fs
            .readdirSync(this.dataDir)
            .filter((f) => f.endsWith(".jsonl"))
            .map((f) => f.slice(0, -".jsonl".length));
    }

    async readThread(groupId: string): Promise<NormalizedMessage[]> {
        const file = this.filePath(groupId);
        if (!fs.existsSync(file)) return [];

        const rows: NormalizedMessage[] = [];
        const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
        for await (const line of rl) {
            if (!line.trim()) continue;
            try {
                rows.push(JSON.parse(line) as NormalizedMessage);
            } catch {
                // ignore malformed line
            }
        }
        rows.sort((a, b) => a.ts - b.ts);
        return rows;
    }

    async getRecent(groupId: string, limit = 50): Promise<NormalizedMessage[]> {
        const rows = await this.readThread(groupId);
        return rows.slice(-limit);
    }

    async search(query: string, opts: { groupId?: string; limit?: number } = {}): Promise<NormalizedMessage[]> {
        const groupIds = opts.groupId ? [opts.groupId] : this.listThreads();
        const needle = query.toLowerCase();
        const hits: NormalizedMessage[] = [];

        for (const groupId of groupIds) {
            const rows = await this.readThread(groupId);
            for (const row of rows) {
                const text = typeof row.content === "string" ? row.content : JSON.stringify(row.content);
                if (text.toLowerCase().includes(needle)) hits.push(row);
            }
        }

        hits.sort((a, b) => b.ts - a.ts);
        return opts.limit ? hits.slice(0, opts.limit) : hits;
    }
}
