import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export type NormalizedMessage = {
    msgId: string;
    /** Real Zalo conversation id (group: `g<digits>`; DM: the other party's numeric user id) — stable across renames, also used as the JSON filename. */
    groupId: string;
    /** Display name of the conversation at scrape time — informational only, never used as a storage key. */
    groupName: string;
    threadType: "user" | "group";
    senderId: string;
    senderName: string;
    isSelf: boolean;
    ts: number;
    /** `"desktop.text"` for DOM-scraped rows (the only kind this scraper reads text content for); `"chat.photo"` for a photo message saved directly from the realtime WS payload — see history/realtimeListener.ts. Other Zalo msgTypes (sticker, voice, video, file...) aren't captured specially yet and fall through as an empty-content `"desktop.text"` row, same as before. */
    msgType: string;
    /** Message text. For `"chat.photo"`, this is the photo's caption (empty string if it has none) — the image itself is `url`, not `content`. */
    content: string;
    /** Image URL — only present for `"chat.photo"` rows (see history/realtimeListener.ts). */
    url?: string;
};

/**
 * One JSON file per conversation (named by `groupId`, not the display name —
 * see NormalizedMessage), each holding a pretty-printed array of every
 * message seen so far for that thread, deduped by msgId and kept sorted by
 * `ts`. Both the realtime listener and the history scraper write through
 * this so a message seen twice (e.g. a recent message the scraper also
 * scrolls past) is only ever stored once. The whole array is rewritten
 * (atomically, via a temp file + rename) on every save — simpler to read
 * and to hand to other tools directly than an append-only log, at the cost
 * of a full rewrite per save; fine at this scale (per-conversation message
 * counts), not meant for high-volume threads.
 */
export class MessageStore {
    private dataDir: string;
    private rows = new Map<string, NormalizedMessage[]>();
    private seenIds = new Map<string, Set<string>>();
    /** Per-group senderId -> last known senderName, seeded from disk on first access — see backfillSenderName. */
    private senderNames = new Map<string, Map<string, string>>();

    constructor(dataDir: string = config.dataDir) {
        this.dataDir = dataDir;
        fs.mkdirSync(this.dataDir, { recursive: true });
    }

    private filePath(groupId: string) {
        return path.join(this.dataDir, `${groupId}.json`);
    }

    private load(groupId: string): NormalizedMessage[] {
        let rows = this.rows.get(groupId);
        if (rows) return rows;

        rows = [];
        const names = new Map<string, string>();
        const file = this.filePath(groupId);
        if (fs.existsSync(file)) {
            try {
                rows = JSON.parse(fs.readFileSync(file, "utf-8")) as NormalizedMessage[];
            } catch {
                console.warn(`[store] "${file}" is not valid JSON — starting this thread fresh in memory (existing file left untouched until the next save).`);
                rows = [];
            }
        }

        const seen = new Set(rows.map((r) => r.msgId));
        for (const row of rows) {
            if (row.senderId && row.senderName) names.set(row.senderId, row.senderName);
        }

        this.rows.set(groupId, rows);
        this.seenIds.set(groupId, seen);
        this.senderNames.set(groupId, names);
        return rows;
    }

    private getSenderNames(groupId: string): Map<string, string> {
        this.load(groupId); // seeds all three maps together from disk on first access
        return this.senderNames.get(groupId)!;
    }

    private writeToDisk(groupId: string): void {
        const rows = this.rows.get(groupId) ?? [];
        const file = this.filePath(groupId);
        const tmpFile = `${file}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(rows, null, 2), "utf-8");
        fs.renameSync(tmpFile, file);
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
        const rows = this.load(message.groupId);
        const seen = this.seenIds.get(message.groupId)!;
        this.backfillSenderName(message);
        if (seen.has(message.msgId)) return false;

        seen.add(message.msgId);
        rows.push(message);
        rows.sort((a, b) => a.ts - b.ts);
        this.writeToDisk(message.groupId);
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

        const touchedGroupIds = new Set<string>();
        let written = 0;
        for (const m of messages) {
            const rows = this.load(m.groupId);
            const seen = this.seenIds.get(m.groupId)!;
            this.backfillSenderName(m);
            if (seen.has(m.msgId)) continue;

            seen.add(m.msgId);
            rows.push(m);
            touchedGroupIds.add(m.groupId);
            written++;
        }

        for (const groupId of touchedGroupIds) {
            this.rows.get(groupId)!.sort((a, b) => a.ts - b.ts);
            this.writeToDisk(groupId);
        }
        return written;
    }

    listThreads(): string[] {
        if (!fs.existsSync(this.dataDir)) return [];
        return fs
            .readdirSync(this.dataDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.slice(0, -".json".length));
    }

    async readThread(groupId: string): Promise<NormalizedMessage[]> {
        return this.load(groupId).slice().sort((a, b) => a.ts - b.ts);
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
                const text = row.content;
                if (text.toLowerCase().includes(needle)) hits.push(row);
            }
        }

        hits.sort((a, b) => b.ts - a.ts);
        return opts.limit ? hits.slice(0, opts.limit) : hits;
    }
}
