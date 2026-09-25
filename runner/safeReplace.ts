import fs from "node:fs";
import path from "node:path";

export type FsLike = Pick<typeof fs, "existsSync" | "renameSync" | "rmSync">;

export interface ReplaceResult {
    status: "replaced" | "fallback" | "nothing";
    /** Where the finished file is; null when `produce` made no file. */
    path: string | null;
}

/**
 * Builds `target` without ever leaving it half-written. `produce` writes the new file to a
 * temp path; on success that file is renamed over `target` (so exactly one file remains).
 * If `target` is open in Excel the rename is refused, and the result is kept as
 * `<name>_moi<ext>` instead, leaving the old file intact; the next successful replace removes it.
 */
export async function safeReplace(target: string, produce: (tmp: string) => void | Promise<void>, io: FsLike = fs): Promise<ReplaceResult> {
    const dir = path.dirname(target);
    const ext = path.extname(target);
    const base = path.basename(target, ext);
    const tmp = path.join(dir, `.${base}.tmp${ext}`);
    const fallback = path.join(dir, `${base}_moi${ext}`);

    io.rmSync(tmp, { force: true });
    try {
        await produce(tmp);
    } catch (err) {
        io.rmSync(tmp, { force: true });
        throw err;
    }
    if (!io.existsSync(tmp)) return { status: "nothing", path: null };

    try {
        io.renameSync(tmp, target);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "EBUSY" && code !== "EPERM" && code !== "EACCES") {
            io.rmSync(tmp, { force: true });
            throw err;
        }
        io.rmSync(fallback, { force: true });
        io.renameSync(tmp, fallback);
        return { status: "fallback", path: fallback };
    }
    io.rmSync(fallback, { force: true });
    return { status: "replaced", path: target };
}
