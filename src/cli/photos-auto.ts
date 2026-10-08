import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { MessageStore } from "../store/messageStore.js";
import { bundleFromMessages } from "../vision/bundleRun.js";
import { visionGroups } from "../vision/groups.js";
import { makeConfiguredReader } from "../vision/openRouterReader.js";
import { readBundles } from "../vision/pipeline.js";
import { loadRules } from "../vision/rules.js";
import type { NormalizedMessage } from "../types/index.js";

/**
 * Bước đọc ảnh nghỉ phép của chu trình `bot:runner` (và `today`): gom ảnh của các nhóm trong `config.vision.leave.groups` thành bộ (đóng sau
 * `leave.settleSeconds`), rồi đọc các bộ đã đóng mà chưa đọc, tối đa `config.vision.maxBundlesPerRun` bộ. KHÔNG làm gì khi `config.vision.enabled`
 * là false (không gọi agent, không tốn hạn mức). Thoát mã 1 khi có bộ lỗi: runner chỉ coi đó là cảnh báo. Không đụng DB, Excel hay Zalo.
 *
 *   npm run photos:auto
 */
async function main(): Promise<void> {
    if (!config.vision.enabled) {
        console.log("[photos:auto] config.vision.enabled là false: không đọc ảnh.");
        return;
    }
    if (visionGroups().length === 0) {
        console.log("[photos:auto] config.vision.leave.groups đang rỗng: không có nhóm nào được đọc ảnh.");
        return;
    }
    const rules = loadRules();
    if (rules.length === 0) throw new Error("Không có luật nào trong photo-rules/ (cần ít nhất leave.json).");
    const root = photoReportsDir(config.dataDir);

    const store = new MessageStore();
    const messages: NormalizedMessage[] = [];
    for (const groupId of store.listThreads()) messages.push(...(await store.readThread(groupId)));
    const bundled = bundleFromMessages(messages, {
        root,
        dataDir: config.dataDir,
        bundle: config.vision.bundle,
        settleSeconds: config.vision.leave.settleSeconds,
        groups: visionGroups(),
        senders: config.vision.leave.senders,
        aliases: config.groupAliases,
        now: Date.now(),
    });
    for (const line of bundled.lines) console.log(`[photos:auto] ${line}`);

    const reader = makeConfiguredReader();
    const summary = await readBundles(root, { again: false, dryRun: false, maxBundles: config.vision.maxBundlesPerRun }, { reader, rules, cfg: config.vision.leave, log: (m) => console.log(`[photos:auto] ${m}`) });
    const name = (dir: string): string => path.relative(root, dir);
    for (const r of summary.read) console.log(`[photos:auto] ${name(r.dir)}: ${r.status}`);
    for (const f of summary.failed) console.error(`[photos:auto] LỖI ${name(f.dir)}: ${f.error}`);
    console.log(`[photos:auto] gom ${bundled.drafts} bộ (còn mở ${bundled.open}); đã đọc ${summary.read.length}, lỗi ${summary.failed.length}${summary.overLimit > 0 ? `, còn ${summary.overLimit} bộ cho lần sau` : ""}.`);
    if (summary.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
