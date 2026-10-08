import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import { makeConfiguredReader } from "../vision/openRouterReader.js";
import { readBundles } from "../vision/pipeline.js";
import { loadRules } from "../vision/rules.js";

/**
 * Đọc các bộ ảnh ĐÃ ĐÓNG mà chưa đọc (hoặc có cờ đọc lại): agent đọc, kiểm tra theo dòng và (nếu luật đòi) đọc lần hai, ghi `reading.json` và
 * `review.json` trong thư mục bộ; người xem các dòng `can_xem` bằng `photos:review`. Tốn tiền API OpenRouter: mỗi bộ một lần gọi (hai lần nếu
 * cần đọc lần hai), tối đa `config.vision.maxBundlesPerRun` bộ mỗi lần chạy. Không đụng DB, Excel hay kho tin.
 *
 *   npm run photos:read -- [--day YYYY-MM-DD] [--bundle <mã bộ>] [--again] [--dry-run]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(name);

async function main(): Promise<void> {
    const rules = loadRules();
    if (rules.length === 0) throw new Error("Không có luật nào trong photo-rules/ (cần ít nhất leave.json).");
    const reader = makeConfiguredReader();
    const root = photoReportsDir(config.dataDir);
    const summary = await readBundles(
        root,
        { day: option("--day"), bundleId: option("--bundle"), again: flag("--again"), dryRun: flag("--dry-run"), maxBundles: config.vision.maxBundlesPerRun },
        { reader, rules, cfg: config.vision.leave, log: (m) => console.log(`[photos:read] ${m}`) },
    );

    const name = (dir: string): string => path.relative(root, dir);
    if (flag("--dry-run")) {
        console.log(`[photos:read] CHẠY THỬ, không gọi agent. Sẽ đọc ${summary.listed.length} bộ${summary.overLimit > 0 ? ` (còn ${summary.overLimit} bộ vượt maxBundlesPerRun)` : ""}:`);
        for (const dir of summary.listed) console.log(`  - ${name(dir)}`);
    }
    for (const r of summary.read) console.log(`[photos:read] ${name(r.dir)}: ${r.status}`);
    for (const f of summary.failed) console.error(`[photos:read] LỖI ${name(f.dir)}: ${f.error}`);
    console.log(`[photos:read] đã đọc ${summary.read.length}, lỗi ${summary.failed.length}, bỏ qua vì chưa đóng ${summary.skippedOpen}, vì đã đọc ${summary.skippedRead}${summary.overLimit > 0 ? `, vượt giới hạn ${summary.overLimit}` : ""}.`);
    const needReview = summary.read.filter((r) => r.status === "can_xem").length;
    if (needReview > 0) console.log(`[photos:read] ${needReview} bộ có dòng cần xem: npm run photos:review -- --list`);
    if (summary.failed.length > 0) process.exitCode = 1;
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
