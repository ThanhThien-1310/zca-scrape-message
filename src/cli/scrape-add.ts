import { config } from "../../config.js";
import { addTargets } from "../scrape/queueAdd.js";
import { enqueueTarget } from "../scrape/scrapeQueue.js";

/**
 * Puts one or more groups into the scrape queue by hand, by name (they must be listed in `config.targets`). Use it for a
 * new group that has never been scraped, so `bot:watch` can learn its id, or to force a re-scrape. Then `bot:runner`
 * scrapes it after its quiet period, or run `npm run bot:scrape`. It only writes the queue files; it does not touch Zalo.
 *
 *   npm run scrape:add -- "LC_MoiThem_Q1" ["Nhóm khác" ...]
 *
 * Exit code 1 when a name is unknown (nothing is queued for it) or none was given.
 */
const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (names.length === 0) {
    console.error('Cách dùng: npm run scrape:add -- "Tên nhóm" ["Tên nhóm khác" ...]');
    console.error(`Nhóm hợp lệ (config.targets): ${config.targets.join(", ")}`);
    process.exit(1);
}

let unknown = 0;
for (const r of addTargets(names, config.targets, (t) => enqueueTarget(t))) {
    if (r.status === "added") console.log(`[scrape:add] đã xếp "${r.name}" vào hàng chờ.`);
    else if (r.status === "already-queued") console.log(`[scrape:add] "${r.name}" đã có trong hàng chờ.`);
    else {
        unknown++;
        console.error(`[scrape:add] KHÔNG có nhóm "${r.name}" trong config.targets, chưa xếp gì.${r.suggestions.length > 0 ? ` Ý bạn là: ${r.suggestions.map((s) => `"${s}"`).join(", ")}?` : ""}`);
    }
}
if (unknown > 0) {
    console.error(`Nhóm hợp lệ (config.targets): ${config.targets.join(", ")}`);
    process.exitCode = 1;
} else {
    console.log("Tiếp theo: bot:runner sẽ cào sau thời gian yên lặng (runner.quietSeconds), hoặc chạy `npm run bot:scrape`.");
}
