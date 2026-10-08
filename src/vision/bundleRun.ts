import { parseGroupName } from "../lesson/schoolArea.js";
import { writeBundle } from "./bundleStore.js";
import { filterPhotoMessages, groupPhotos } from "./bundling.js";
import type { NormalizedMessage } from "../types/index.js";

/** Gom và ghi các bộ ảnh nghỉ phép từ tin đã có: dùng chung cho lệnh `photos:bundle` và bước đọc ảnh trong runner (`photos:auto`). */
export interface BundleRunOptions {
    root: string;
    dataDir: string;
    bundle: { gapMinutes: number; textWindowMinutes: number };
    /** Bộ đóng sau khi yên bấy nhiêu giây kể từ ảnh cuối (`config.vision.leave.settleSeconds`). */
    settleSeconds: number;
    groups: string[];
    senders: string[];
    /** `config.groupAliases`: nhóm thử được đọc như một nhóm trường thật (trường, khu vực lấy từ tên nhóm thật). */
    aliases: Record<string, string>;
    now: number;
    day?: string;
}

export interface BundleRunResult {
    drafts: number;
    new: number;
    updated: number;
    unchanged: number;
    skipped: number;
    dropped: number;
    open: number;
    lines: string[];
}

export function bundleFromMessages(messages: NormalizedMessage[], opts: BundleRunOptions): BundleRunResult {
    const result: BundleRunResult = { drafts: 0, new: 0, updated: 0, unchanged: 0, skipped: 0, dropped: 0, open: 0, lines: [] };
    const filtered = filterPhotoMessages(messages, opts.groups, opts.senders);
    const drafts = groupPhotos(filtered, { ...opts.bundle, settleMinutes: opts.settleSeconds / 60 }, opts.now).filter((d) => !opts.day || d.day === opts.day);
    result.drafts = drafts.length;
    for (const draft of drafts) {
        const r = writeBundle(opts.root, opts.dataDir, draft, parseGroupName(opts.aliases[draft.groupName] ?? draft.groupName));
        result[r.state] += 1;
        result.dropped += r.dropped;
        if (draft.status === "open") result.open += 1;
        if (r.state !== "unchanged") result.lines.push(`${draft.groupName} ${draft.bundleId}: ${draft.images.length} ảnh, ${draft.status} (${r.state})`);
    }
    return result;
}
