import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../core/atomicWrite.js";
import type { BundleDraft } from "./bundling.js";
import type { Manifest, ManifestImage, SchoolArea } from "../types/index.js";

/**
 * Thư mục dẫn xuất của một bộ ảnh: `<root>/<yyyy-MM-dd>/<mã nhóm>/<mã bộ>/` gồm `manifest.json`, ảnh đánh số `01.jpg 02.jpg ...`
 * (liên kết cứng tới ảnh gốc, không được thì sao chép), `reading.json`, `review.json`. Kho ảnh gốc không bao giờ bị sửa.
 */
export function bundleDirOf(root: string, day: string, groupId: string, bundleId: string): string {
    return path.join(root, day, groupId, bundleId);
}

export function readManifest(dir: string): Manifest | null {
    const file = path.join(dir, "manifest.json");
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as Manifest;
    } catch {
        return null;
    }
}

const subdirs = (dir: string): string[] => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

/** Mọi thư mục bộ có `manifest.json` (chỉ các thư mục ngày dạng yyyy-MM-dd; thư mục `golden` bị bỏ qua). */
export function listBundleDirs(root: string, day?: string): string[] {
    const days = day ? [day] : subdirs(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    const out: string[] = [];
    for (const d of days) {
        for (const group of subdirs(path.join(root, d))) {
            for (const bundle of subdirs(path.join(root, d, group))) {
                const dir = path.join(root, d, group, bundle);
                if (fs.existsSync(path.join(dir, "manifest.json"))) out.push(dir);
            }
        }
    }
    return out.sort();
}

function link(src: string, dest: string): void {
    try {
        fs.linkSync(src, dest);
    } catch {
        fs.copyFileSync(src, dest);
    }
}

const NUMBERED = /^\d{2,}\.[a-z0-9]+$/i;

/**
 * Ghi (hoặc cập nhật) thư mục của một bản nháp. Chạy lại không tạo bộ trùng: cùng ảnh đầu thì cùng thư mục.
 *  - ảnh gốc không còn trên đĩa bị bỏ (`dropped`); không còn ảnh nào thì `skipped`;
 *  - đổi danh sách ảnh: xoá ảnh đánh số cũ rồi liên kết lại, đánh số theo đúng thứ tự gửi; nếu bộ đã có `reading.json` thì đặt
 *    `reread: true` để `photos:read` đọc lại;
 *  - chỉ đổi trạng thái hoặc tin chữ: ghi lại manifest, không đụng ảnh.
 */
export function writeBundle(root: string, dataDir: string, draft: BundleDraft, school: SchoolArea): { dir: string; state: "new" | "updated" | "unchanged" | "skipped"; dropped: number } {
    const dir = bundleDirOf(root, draft.day, draft.groupId, draft.bundleId);
    const present = draft.images.filter((i) => fs.existsSync(path.resolve(dataDir, i.source)));
    const dropped = draft.images.length - present.length;
    if (present.length === 0) return { dir, state: "skipped", dropped };

    const images: ManifestImage[] = present.map((i, n) => ({ ...i, seq: n + 1, file: `${String(n + 1).padStart(2, "0")}${path.extname(i.source).toLowerCase() || ".jpg"}` }));
    const old = readManifest(dir);
    const sameImages = old !== null && JSON.stringify(old.images.map((i) => i.msgId)) === JSON.stringify(images.map((i) => i.msgId));

    const manifest: Manifest = {
        version: 1,
        bundleId: draft.bundleId,
        day: draft.day,
        status: draft.status,
        groupId: draft.groupId,
        groupName: draft.groupName,
        school,
        sender: draft.sender,
        firstTs: draft.firstTs,
        lastTs: draft.lastTs,
        texts: draft.texts,
        images,
    };

    if (old && sameImages) {
        if (old.reread) manifest.reread = true;
        if (JSON.stringify(old) === JSON.stringify(manifest)) return { dir, state: "unchanged", dropped };
        writeFileAtomic(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
        return { dir, state: "updated", dropped };
    }

    fs.mkdirSync(dir, { recursive: true });
    if (old) {
        for (const f of fs.readdirSync(dir)) if (NUMBERED.test(f)) fs.rmSync(path.join(dir, f), { force: true });
        if (fs.existsSync(path.join(dir, "reading.json")) || old.reread) manifest.reread = true;
    }
    for (const img of images) link(path.resolve(dataDir, img.source), path.join(dir, img.file));
    writeFileAtomic(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return { dir, state: old ? "updated" : "new", dropped };
}
