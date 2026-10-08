import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { bundleStatus, reviewLeave } from "../leave/review.js";
import { reviewMinutes } from "../minutes/review.js";
import { reviewSpeed } from "../speed/review.js";
import { listBundleDirs, readManifest } from "./bundleStore.js";
import { needsSecondRead } from "./review.js";
import type { BundleReading, PhotoRule, Review, ReviewStatus, VisionReader } from "../types/index.js";

/**
 * Chu trình đọc của bộ đọc ảnh: một bộ -> đọc lần một -> review theo dòng (`reviewLeave`, gồm luật cứng) -> đọc lần hai độc lập nếu luật đòi
 * hoặc có dòng nghi ngờ -> review lại với lần hai -> ghi `reading.json` và `review.json`. Lỗi đọc lần một KHÔNG ghi gì (bộ vẫn "chưa đọc", chạy
 * lại sẽ thử lại). Lỗi lần hai vẫn giữ kết quả lần một nhưng mọi dòng thành `can_xem`. Chỉ ghi trong thư mục bộ.
 */
export interface PipelineDeps {
    reader: VisionReader;
    rules: PhotoRule[];
    cfg: { maxPastDays: number; maxFutureDays: number };
    log?: (message: string) => void;
}

const writeJson = (file: string, value: unknown): void => writeFileAtomic(file, JSON.stringify(value, null, 2));

export async function processBundle(dir: string, deps: PipelineDeps): Promise<{ ok: true; reading: BundleReading; review: Review } | { ok: false; error: string }> {
    const manifest = readManifest(dir);
    if (!manifest) return { ok: false, error: `không có manifest.json trong ${dir}` };

    const first = await deps.reader.readBundle({ bundleDir: dir, manifest, rules: deps.rules, pass: 1 });
    if (!first.ok) return { ok: false, error: first.error };
    const reading = first.reading;
    let review = reviewLeave({ rules: deps.rules, manifest, first: reading, second: null, cfg: deps.cfg });
    let speed = reviewSpeed({ rules: deps.rules, first: reading, second: null });
    let minutes = reviewMinutes({ rules: deps.rules, first: reading, second: null });
    // Bộ không có ảnh nghỉ phép nào: không dòng, không lý do, `needsSecondRead` là false: không tốn lần đọc thứ hai.
    if (needsSecondRead(deps.rules, reading) || review.reasons.length > 0 || review.rows.some((r) => r.reasons.length > 0) || (speed !== null && (speed.reasons.length > 0 || speed.rows.some((r) => r.reasons.length > 0))) || (minutes !== null && (minutes.reasons.length > 0 || minutes.rows.some((r) => r.reasons.length > 0)))) {
        const second = await deps.reader.readBundle({ bundleDir: dir, manifest, rules: deps.rules, pass: 2 });
        review = reviewLeave({ rules: deps.rules, manifest, first: reading, second, cfg: deps.cfg });
        speed = reviewSpeed({ rules: deps.rules, first: reading, second });
        minutes = reviewMinutes({ rules: deps.rules, first: reading, second });
    }
    if (speed || minutes) {
        // Trạng thái cả bộ là xấu nhất của các dòng nghỉ phép, các lần đo tốc độ và các biên bản.
        const all = [...review.rows, ...(speed?.rows ?? []), ...(minutes?.rows ?? [])];
        const reasons = [...review.reasons, ...(speed?.reasons ?? []), ...(minutes?.reasons ?? [])];
        review = { ...review, ...(speed ? { speed } : {}), ...(minutes ? { minutes } : {}), status: bundleStatus(all, all.length === 0 ? reasons : [], false) };
    }

    writeJson(path.join(dir, "reading.json"), reading);
    writeJson(path.join(dir, "review.json"), review);
    if (manifest.reread) {
        const rest = { ...manifest };
        delete rest.reread;
        writeJson(path.join(dir, "manifest.json"), rest);
    }
    return { ok: true, reading, review };
}

export interface ReadOptions {
    day?: string;
    bundleId?: string;
    again: boolean;
    dryRun: boolean;
    maxBundles: number;
}

export interface ReadSummary {
    /** Các bộ sẽ đọc (đã lọc), kể cả khi `dryRun`. */
    listed: string[];
    skippedOpen: number;
    skippedRead: number;
    read: Array<{ dir: string; status: ReviewStatus }>;
    failed: Array<{ dir: string; error: string }>;
    /** Số bộ đủ điều kiện nhưng vượt `maxBundles`, để lần chạy sau. */
    overLimit: number;
}

export async function readBundles(root: string, opts: ReadOptions, deps: PipelineDeps): Promise<ReadSummary> {
    const summary: ReadSummary = { listed: [], skippedOpen: 0, skippedRead: 0, read: [], failed: [], overLimit: 0 };
    const eligible: string[] = [];
    for (const dir of listBundleDirs(root, opts.day)) {
        const manifest = readManifest(dir);
        if (!manifest) continue;
        if (opts.bundleId && manifest.bundleId !== opts.bundleId) continue;
        if (manifest.status !== "closed") {
            summary.skippedOpen += 1;
            continue;
        }
        const already = fs.existsSync(path.join(dir, "reading.json"));
        if (already && !opts.again && !manifest.reread) {
            summary.skippedRead += 1;
            continue;
        }
        eligible.push(dir);
    }
    summary.listed = eligible.slice(0, opts.maxBundles);
    summary.overLimit = Math.max(0, eligible.length - opts.maxBundles);
    if (opts.dryRun) return summary;

    for (const dir of summary.listed) {
        deps.log?.(`đọc ${path.basename(dir)} ...`);
        const r = await processBundle(dir, deps);
        if (r.ok) summary.read.push({ dir, status: r.review.status });
        else summary.failed.push({ dir, error: r.error });
    }
    return summary;
}
