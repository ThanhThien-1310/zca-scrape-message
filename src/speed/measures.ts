import fs from "node:fs";
import path from "node:path";
import { listBundleDirs, readManifest } from "../vision/bundleStore.js";
import { speedRowsOf, validateSpeedRow } from "./review.js";
import type { BundleReading, Review, ReviewStatus } from "../types/index.js";

/** Một lần đo tốc độ đã đọc: `usable` khi dòng đã đạt (tự động đạt, người xác nhận hoặc sửa) và hợp lệ; chưa dùng được thì vẫn giữ chỗ để thứ tự khớp với các phòng máy. */
export interface SpeedPoint {
    usable: boolean;
    /** Tốc độ Mbps; null khi ảnh báo không có mạng hoặc chưa dùng được. */
    mbps: number | null;
    noInternet: boolean;
}

export interface SpeedForMessage {
    bundleId: string;
    sentTs: number;
    points: SpeedPoint[];
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
 * Các lần đo tốc độ đã đọc của các bộ ảnh từ ngày `sinceDay`, gắn vào TỪNG TIN CHỮ đi kèm bộ (`manifest.texts`: tin của cùng người gửi quanh giờ gửi ảnh, trong đó có tin
 * "BÁO CÁO CUỐI BUỔI"): msgId của tin -> các lần đo theo thứ tự ảnh. Một tin có trong nhiều bộ thì lấy bộ gửi MUỘN nhất. Bộ bị bỏ cả bộ không tính. Chỉ đọc đĩa.
 */
export function loadSpeedByMessage(root: string, sinceDay: string): Map<string, SpeedForMessage> {
    const out = new Map<string, SpeedForMessage>();
    for (const dir of listBundleDirs(root)) {
        const manifest = readManifest(dir);
        if (!manifest || manifest.day < sinceDay || manifest.texts.length === 0) continue;
        const reading = readJson<BundleReading>(path.join(dir, "reading.json"));
        const review = readJson<Review>(path.join(dir, "review.json"));
        if (!reading || !review?.speed || review.dismissed) continue;
        const raws = speedRowsOf(reading);
        const points: SpeedPoint[] = review.speed.rows.map((rr) => {
            const verdict = validateSpeedRow({ ...(raws[rr.index] ?? {}), ...(rr.human?.corrections ?? {}) });
            const usable = USABLE.has(rr.status) && verdict.ok;
            return { usable, mbps: usable ? verdict.mbps : null, noInternet: usable && verdict.noInternet };
        });
        for (const t of manifest.texts) {
            const prev = out.get(t.msgId);
            if (!prev || manifest.firstTs > prev.sentTs) out.set(t.msgId, { bundleId: manifest.bundleId, sentTs: manifest.firstTs, points });
        }
    }
    return out;
}
