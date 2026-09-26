import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../../config.js";

/**
 * One folder of image files per conversation: `data/images/<groupId>/<msgId>.<ext>`.
 * Every function returns (or checks for) the *relative* path
 * `images/<groupId>/<msgId>.<ext>` — relative to `config.dataDir` — which is
 * what NormalizedMessage.url stores, so moving `data/` elsewhere keeps every
 * row's `url` valid.
 */

function imagesDir(groupId: string): string {
    return path.join(config.dataDir, "images", groupId);
}

function zaloMediaRoot(): string {
    return path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "ZaloData", "media");
}

function detectExt(buf: Buffer): string {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
    if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
    if (buf.length >= 6 && buf.subarray(0, 3).toString("ascii") === "GIF") return "gif";
    return "jpg";
}

/** Relative path of an already-saved image for this message, or null. */
export function findSavedImage(groupId: string, msgId: string): string | null {
    const dir = imagesDir(groupId);
    if (!fs.existsSync(dir)) return null;
    const hit = fs.readdirSync(dir).find((f) => f.startsWith(`${msgId}.`));
    return hit ? `images/${groupId}/${hit}` : null;
}

function writeImage(groupId: string, msgId: string, buf: Buffer): string {
    const dir = imagesDir(groupId);
    fs.mkdirSync(dir, { recursive: true });
    const file = `${msgId}.${detectExt(buf)}`;
    fs.writeFileSync(path.join(dir, file), buf);
    return `images/${groupId}/${file}`;
}

/**
 * Copies the photo out of Zalo Desktop's own local download cache
 * (`%APPDATA%\ZaloData\media\<account uid>\ZaloDownloads\resource\<groupId>\Cache\<cliMsgId>_<uidFrom>_<groupId>_n`,
 * confirmed live 2026-09-24) into this conversation's image folder. The
 * account-uid folder isn't known up front, so every account folder under
 * `media` is tried. Returns null if Zalo never downloaded this image to this
 * machine (e.g. an old photo never opened) — nothing to copy then.
 */
export function copyImageFromZaloCache(groupId: string, msgId: string, cliMsgId: string): string | null {
    const existing = findSavedImage(groupId, msgId);
    if (existing) return existing;

    try {
        const media = zaloMediaRoot();
        if (!fs.existsSync(media)) return null;
        for (const account of fs.readdirSync(media)) {
            const cacheDir = path.join(media, account, "ZaloDownloads", "resource", groupId, "Cache");
            if (!fs.existsSync(cacheDir)) continue;
            const file = fs.readdirSync(cacheDir).find((f) => f.startsWith(`${cliMsgId}_`) && f.endsWith("_n"));
            if (!file) continue;
            return writeImage(groupId, msgId, fs.readFileSync(path.join(cacheDir, file)));
        }
    } catch (err) {
        console.warn(`[images] could not copy "${msgId}" from Zalo's cache:`, (err as Error).message);
    }
    return null;
}

/** Downloads the photo from its public CDN link into this conversation's image folder. Returns null on any failure (logged), never throws. */
export async function downloadImageFromUrl(groupId: string, msgId: string, url: string): Promise<string | null> {
    const existing = findSavedImage(groupId, msgId);
    if (existing) return existing;

    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return writeImage(groupId, msgId, Buffer.from(await res.arrayBuffer()));
    } catch (err) {
        console.warn(`[images] could not download "${msgId}" from ${url}:`, (err as Error).message);
        return null;
    }
}
