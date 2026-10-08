import fs from "node:fs";
import path from "node:path";
import { listBundleDirs, readManifest } from "../vision/bundleStore.js";
import { minutesRowsOf, textOf, validateMinutesRow } from "./review.js";
import type { BundleReading, Review, ReviewStatus } from "../types/index.js";

/** Một biên bản đã đọc. `usable` khi dòng đã đạt (tự động đạt, người xác nhận hoặc sửa); chưa dùng được thì các ô chữ để trống nhưng dòng vẫn còn (biên bản có tồn tại). */
export interface MinutesItem {
    /** Mã ổn định của biên bản: `<mã bộ>#<chỉ số>`; cùng một bộ gắn vào nhiều tin thì chỉ tính một lần. */
    key: string;
    usable: boolean;
    tieuDe: string;
    daiDienCty: string;
    daiDienTruong: string;
    boPhanTruong: string;
}

export interface MinutesForMessage {
    bundleId: string;
    sentTs: number;
    items: MinutesItem[];
}

const USABLE = new Set<ReviewStatus>(["tu_dong_dat", "da_xac_nhan", "da_sua"]);

function readJson<T>(file: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as T;
    } catch {
        return null;
    }
}

/**
 * Các biên bản đã đọc của các bộ ảnh từ ngày `sinceDay`, gắn vào TỪNG TIN CHỮ đi kèm bộ (`manifest.texts`): msgId của tin -> các biên bản theo thứ tự ảnh. Một tin có trong nhiều bộ thì
 * lấy bộ gửi MUỘN nhất. Biên bản người xem đã bỏ (`da_bo`) không có trong kết quả. Bộ bị bỏ cả bộ không tính. Chỉ đọc đĩa.
 */
export function loadMinutesByMessage(root: string, sinceDay: string): Map<string, MinutesForMessage> {
    const out = new Map<string, MinutesForMessage>();
    for (const dir of listBundleDirs(root)) {
        const manifest = readManifest(dir);
        if (!manifest || manifest.day < sinceDay || manifest.texts.length === 0) continue;
        const reading = readJson<BundleReading>(path.join(dir, "reading.json"));
        const review = readJson<Review>(path.join(dir, "review.json"));
        if (!reading || !review?.minutes || review.dismissed) continue;
        const raws = minutesRowsOf(reading);
        const items: MinutesItem[] = review.minutes.rows
            .filter((rr) => rr.status !== "da_bo")
            .map((rr) => {
                const merged = { ...(raws[rr.index] ?? {}), ...(rr.human?.corrections ?? {}) };
                // Người xem đã xác nhận thì dùng như đã đọc, kể cả khi có ô trống thật.
                const usable = USABLE.has(rr.status) && (rr.status === "da_xac_nhan" || validateMinutesRow(merged).ok);
                return {
                    key: `${manifest.bundleId}#${rr.index}`,
                    usable,
                    tieuDe: usable ? textOf(merged.tieuDe) : "",
                    daiDienCty: usable ? textOf(merged.daiDienCty) : "",
                    daiDienTruong: usable ? textOf(merged.daiDienTruong) : "",
                    boPhanTruong: usable ? textOf(merged.boPhanTruong) : "",
                };
            });
        for (const t of manifest.texts) {
            const prev = out.get(t.msgId);
            if (!prev || manifest.firstTs > prev.sentTs) out.set(t.msgId, { bundleId: manifest.bundleId, sentTs: manifest.firstTs, items });
        }
    }
    return out;
}
