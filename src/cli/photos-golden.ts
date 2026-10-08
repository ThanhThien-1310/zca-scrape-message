import path from "node:path";
import { config } from "../../config.js";
import { photoGoldenDir, photoReportsDir, repoRoot } from "../core/paths.js";
import { parseGroupName } from "../lesson/schoolArea.js";
import { makeConfiguredReader } from "../vision/openRouterReader.js";
import { draftFromFiles } from "../vision/bundling.js";
import { writeBundle } from "../vision/bundleStore.js";
import { loadGolden, scoreCase, summarize, type CaseScore } from "../vision/golden.js";
import { processBundle } from "../vision/pipeline.js";
import { loadRules } from "../vision/rules.js";

/**
 * Đo độ chính xác của agent trên bộ đáp án đúng `photo-golden/<luật>.json`: mỗi ca dựng thành một bộ ảnh (trong `data/photo-reports/golden/`), đọc bằng
 * chính chu trình thật (kể cả lần đọc hai) rồi chấm. TỐN HẠN MỨC nên chỉ chạy tay, không có trong `npm test`. Không đụng DB, Excel hay kho tin.
 *
 *   npm run photos:golden -- [--rule leave] [--case <tên ca>]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

async function main(): Promise<void> {
    const rule = option("--rule") ?? "leave";
    const golden = loadGolden(path.join(photoGoldenDir, `${rule}.json`));
    const only = option("--case");
    const cases = golden.cases.filter((c) => !only || c.name === only);
    if (cases.length === 0) {
        console.log(only ? `[photos:golden] không có ca "${only}".` : `[photos:golden] chưa có ca nào trong photo-golden/${rule}.json (cần đáp án đúng của người dùng).`);
        return;
    }
    const rules = loadRules();
    const reader = makeConfiguredReader();
    const root = path.join(photoReportsDir(config.dataDir), "golden");
    const scores: CaseScore[] = [];

    for (const c of cases) {
        const files = c.files.map((f) => path.resolve(repoRoot, golden.sourceDir, f));
        const draft = draftFromFiles(files, c.name);
        const written = writeBundle(root, config.dataDir, draft, parseGroupName(c.name));
        console.log(`[photos:golden] đọc ca "${c.name}" (${files.length} ảnh) ...`);
        const r = await processBundle(written.dir, { reader, rules, cfg: config.vision.leave });
        if (!r.ok) {
            console.error(`[photos:golden] LỖI ca "${c.name}": ${r.error}`);
            process.exitCode = 1;
            continue;
        }
        const manifestFiles = draft.images.map((i) => path.basename(i.source));
        const score = scoreCase(c, manifestFiles, r.reading, r.review);
        scores.push(score);
        console.log(`  trạng thái ${score.status}; phân loại ảnh ${score.classes.ok}/${score.classes.total}; trường đúng ${score.fields.filter((f) => f.ok).length}/${score.fields.length}`);
        for (const f of score.fields.filter((x) => !x.ok)) console.log(`  SAI ${f.path}: đúng ${JSON.stringify(f.expected)}, đọc ${JSON.stringify(f.actual)}`);
        for (const row of r.review.rows) console.log(`  dòng ${row.index}: ${row.status}${row.warnings.length > 0 ? ` (cảnh báo: ${row.warnings.join("; ")})` : ""}`);
        if (score.wrongButAuto > 0) console.log(`  !! ${score.wrongButAuto} chỗ sai mà vẫn tu_dong_dat`);
    }

    const s = summarize(scores);
    console.log(`[photos:golden] ${scores.length}/${cases.length} ca đọc được: phân loại ảnh đúng ${pct(s.classAccuracy)}, trường đúng ${pct(s.fieldAccuracy)}, cần xem ${s.needReview}, SAI MÀ VẪN TỰ ĐẠT ${s.wrongButAuto}.`);
}

main().catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
});
