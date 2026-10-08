import fs from "node:fs";
import path from "node:path";
import { vietnamDay } from "../lesson/time.js";
import type { ManifestImage, ManifestText, NormalizedMessage } from "../types/index.js";

/**
 * Gom ảnh của từng nhóm thành BỘ ẢNH (mỗi bộ là một lần gửi báo cáo). Hàm thuần: nhận tin, trả bản nháp; việc ghi thư mục ở `bundleStore.ts`.
 * Luật: hai ảnh liên tiếp của CÙNG người gửi cách nhau không quá `gapMinutes` thì cùng bộ (đúng cho album lẫn ảnh gửi rời); khác người
 * hoặc quá ngưỡng thì mở bộ mới (người gửi xen kẽ nhau không cắt bộ của nhau); bộ `open` cho tới khi yên `settleMinutes` kể từ ảnh cuối.
 */
export interface BundleOptions {
    gapMinutes: number;
    /** Có thể là số thập phân (ảnh nghỉ phép dùng `settleSeconds / 60`). */
    settleMinutes: number;
    textWindowMinutes: number;
}

export interface BundleDraft {
    bundleId: string;
    day: string;
    groupId: string;
    groupName: string;
    sender: { id: string; name: string };
    firstTs: number;
    lastTs: number;
    status: "open" | "closed";
    texts: ManifestText[];
    images: Array<Omit<ManifestImage, "file">>;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const MINUTE = 60_000;

/** `yyyyMMdd-HHmmss-<mã tin ảnh đầu>` theo đồng hồ Việt Nam: cùng ảnh đầu thì luôn cùng mã bộ. */
export function bundleIdOf(firstTs: number, firstMsgId: string): string {
    const iso = new Date(firstTs + VN_OFFSET_MS).toISOString();
    return `${iso.slice(0, 10).replace(/-/g, "")}-${iso.slice(11, 19).replace(/:/g, "")}-${firstMsgId}`;
}

const isUsablePhoto = (m: NormalizedMessage): boolean => m.msgType === "chat.photo" && !m.isSelf && typeof m.url === "string" && m.url !== "";

/**
 * Chỉ giữ tin của các nhóm trong `groups` (tên hiển thị). `senders` không rỗng thì chỉ ẢNH của các người gửi đó được giữ; tin chữ của
 * nhóm vẫn giữ để đính kèm làm tiêu đề. `groups` rỗng thì không đọc gì (không có nhóm nào được phép).
 */
export function filterPhotoMessages(messages: NormalizedMessage[], groups: string[], senders: string[]): NormalizedMessage[] {
    return messages.filter((m) => groups.includes(m.groupName) && (m.msgType !== "chat.photo" || senders.length === 0 || senders.includes(m.senderName)));
}

export function groupPhotos(messages: NormalizedMessage[], opts: BundleOptions, now: number): BundleDraft[] {
    const gapMs = opts.gapMinutes * MINUTE;
    const settleMs = opts.settleMinutes * MINUTE;
    const windowMs = opts.textWindowMinutes * MINUTE;

    const byGroup = new Map<string, NormalizedMessage[]>();
    for (const m of messages) {
        const list = byGroup.get(m.groupId);
        if (list) list.push(m);
        else byGroup.set(m.groupId, [m]);
    }

    const out: BundleDraft[] = [];
    for (const rows of byGroup.values()) {
        rows.sort((a, b) => a.ts - b.ts);
        const flush = (photos: NormalizedMessage[]): void => {
            if (photos.length === 0) return;
            const first = photos[0];
            const last = photos[photos.length - 1];
            const texts = rows
                .filter((m) => !m.isSelf && m.senderId === first.senderId && m.content.trim() !== "" && (m.msgType === "chat.photo" ? photos.includes(m) : m.ts >= first.ts - windowMs && m.ts <= last.ts + windowMs))
                .map((m) => ({ msgId: m.msgId, ts: m.ts, content: m.content.trim() }));
            out.push({
                bundleId: bundleIdOf(first.ts, first.msgId),
                day: vietnamDay(first.ts),
                groupId: first.groupId,
                groupName: first.groupName,
                sender: { id: first.senderId, name: first.senderName },
                firstTs: first.ts,
                lastTs: last.ts,
                status: now - last.ts >= settleMs ? "closed" : "open",
                texts,
                images: photos.map((p, i) => ({ seq: i + 1, msgId: p.msgId, ts: p.ts, source: p.url as string })),
            });
        };

        // Mỗi người gửi một dòng riêng: hai người gửi xen kẽ vài mili giây vẫn ra hai bộ, không cắt bộ của nhau.
        const bySender = new Map<string, NormalizedMessage[]>();
        for (const p of rows.filter(isUsablePhoto)) {
            const list = bySender.get(p.senderId);
            if (list) list.push(p);
            else bySender.set(p.senderId, [p]);
        }
        for (const senderPhotos of bySender.values()) {
            let current: NormalizedMessage[] = [];
            for (const p of senderPhotos) {
                const prev = current[current.length - 1];
                if (prev && p.ts - prev.ts > gapMs) {
                    flush(current);
                    current = [];
                }
                current.push(p);
            }
            flush(current);
        }
    }
    return out.sort((a, b) => a.firstTs - b.firstTs);
}

/**
 * Bản nháp từ một danh sách file ảnh rời (bộ ảnh mẫu `--from-dir`, ca golden): ảnh không nằm trong kho tin nên không có người gửi hay
 * nhóm thật. Giờ lấy từ 13 chữ số đầu tên file (giờ gửi của Zalo, mili giây) nếu có, không thì giờ sửa file. `source` là đường tuyệt đối.
 */
export function draftFromFiles(files: string[], label: string): BundleDraft {
    if (files.length === 0) throw new Error("draftFromFiles: không có file ảnh nào");
    const sorted = [...files].sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
    const images = sorted.map((file, i) => {
        const base = path.basename(file);
        const lead = /^(\d{13})/.exec(base);
        return { seq: i + 1, msgId: base.replace(/\.[^.]+$/, ""), ts: lead ? Number(lead[1]) : Math.floor(fs.statSync(file).mtimeMs), source: path.resolve(file) };
    });
    const firstTs = images[0].ts;
    return {
        bundleId: bundleIdOf(firstTs, label),
        day: vietnamDay(firstTs),
        groupId: "mau",
        groupName: label,
        sender: { id: "mau", name: "mau" },
        firstTs,
        lastTs: images[images.length - 1].ts,
        status: "closed",
        texts: [],
        images,
    };
}
