import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { parseGroupName } from "../lesson/schoolArea.js";
import { MessageStore } from "../store/messageStore.js";
import { draftFromFiles } from "../vision/bundling.js";
import { writeBundle } from "../vision/bundleStore.js";
import { bundleFromMessages } from "../vision/bundleRun.js";
import { visionGroups } from "../vision/groups.js";
import type { NormalizedMessage } from "../types/index.js";

/**
 * Gom ảnh của các nhóm trong `config.vision.leave.groups` thành bộ và ghi `data/photo-reports/<ngày>/<nhóm>/<bộ>/manifest.json` cùng ảnh
 * đánh số (liên kết cứng). Không đọc ảnh, không đụng DB/Excel/kho tin; chạy lại an toàn (không tạo bộ trùng).
 *
 *   npm run photos:bundle -- [--day YYYY-MM-DD] [--from-dir <thư mục ảnh rời>]
 *
 * --from-dir  gom TOÀN BỘ ảnh trong thư mục thành MỘT bộ đã đóng (bộ ảnh mẫu, ảnh không nằm trong kho tin; không lọc theo nhóm).
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const IMAGE_FILE = /\.(jpe?g|png|webp)$/i;

async function main(): Promise<void> {
    const root = photoReportsDir(config.dataDir);
    const fromDir = option("--from-dir");

    if (fromDir) {
        const files = fs.readdirSync(fromDir).filter((f) => IMAGE_FILE.test(f)).map((f) => path.join(fromDir, f));
        if (files.length === 0) throw new Error(`Không có ảnh nào trong "${fromDir}".`);
        const label = path.basename(path.resolve(fromDir));
        const r = writeBundle(root, config.dataDir, draftFromFiles(files, label), parseGroupName(label));
        console.log(`[photos:bundle] ${files.length} ảnh -> ${r.dir} (${r.state})`);
        return;
    }

    if (visionGroups().length === 0) {
        console.log("[photos:bundle] config.vision.leave.groups đang rỗng: không có nhóm nào được đọc ảnh.");
        return;
    }
    const store = new MessageStore();
    const messages: NormalizedMessage[] = [];
    for (const groupId of store.listThreads()) messages.push(...(await store.readThread(groupId)));
    const r = bundleFromMessages(messages, {
        root,
        dataDir: config.dataDir,
        bundle: config.vision.bundle,
        settleSeconds: config.vision.leave.settleSeconds,
        groups: visionGroups(),
        senders: config.vision.leave.senders,
        aliases: config.groupAliases,
        now: Date.now(),
        day: option("--day"),
    });
    for (const line of r.lines) console.log(`[photos:bundle] ${line}`);
    if (r.drafts === 0) console.log("[photos:bundle] không có ảnh nào để gom.");
    console.log(`[photos:bundle] mới ${r.new}, cập nhật ${r.updated}, không đổi ${r.unchanged}, bỏ qua ${r.skipped}, còn mở ${r.open}, ảnh gốc mất ${r.dropped} -> ${root}`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
