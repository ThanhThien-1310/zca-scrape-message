import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { writeFileAtomic } from "../core/atomicWrite.js";
import { photoReportsDir } from "../core/paths.js";
import { applyHumanRow, describeBundle, dismissBundle, parseFix } from "../leave/reviewApply.js";
import { applyHumanMinutesRow, parseMinutesFix } from "../minutes/apply.js";
import { applyHumanSpeedRow, parseSpeedFix } from "../speed/apply.js";
import { listBundleDirs, readManifest } from "../vision/bundleStore.js";
import type { BundleReading, Review } from "../types/index.js";

/**
 * Review lớp 3: người xem các dòng nghỉ phép.
 *
 *   npm run photos:review -- [--list]                                  liệt kê các bộ còn dòng cần xem
 *   npm run photos:review -- --bundle <mã bộ>                          xem chi tiết một bộ (thư mục có ảnh gốc để mở xem)
 *   npm run photos:review -- --bundle <mã bộ> --row N --confirm        dòng N đọc đúng
 *   npm run photos:review -- --bundle <mã bộ> --row N --fix cột=GIÁ_TRỊ [--fix ...]   sửa dòng N (cột: hoTen, tuGio, tuThu, tuNgay, denGio, denThu, denNgay, soNgay, lyDo; ngày YYYY-MM-DD)
 *   npm run photos:review -- --bundle <mã bộ> --row N --discard        bỏ dòng N
 *   npm run photos:review -- --bundle <mã bộ> --discard-bundle         bỏ cả bộ
 *   npm run photos:review -- --bundle <mã bộ> --minutes N (--confirm | --discard | --fix tieuDe=... --fix daiDienCty=... --fix daiDienTruong=... --fix boPhanTruong=...)   xem biên bản N
 *   npm run photos:review -- --bundle <mã bộ> --speed N (--confirm | --discard | --fix tocDo=95.4 --fix donVi=Mbps --fix khongCoMang=true)   xem lần đo tốc độ N (ảnh đo mạng)
 *
 * Chỉ ghi `review.json` của bộ đó. Sửa tên một dòng (ví dụ tên chưa khớp danh sách của file Excel) cũng dùng `--fix hoTen=...`.
 */
const argv = process.argv.slice(2);
const option = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
};
const all = (name: string): string[] => argv.flatMap((a, i) => (a === name && argv[i + 1] !== undefined ? [argv[i + 1]] : []));
const flag = (name: string): boolean => argv.includes(name);

const readJson = <T>(file: string): T | null => (fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as T) : null);

function main(): void {
    const root = photoReportsDir(config.dataDir);
    const bundleId = option("--bundle");

    if (!bundleId) {
        let n = 0;
        for (const dir of listBundleDirs(root)) {
            const review = readJson<Review>(path.join(dir, "review.json"));
            if (review?.status !== "can_xem") continue;
            n += 1;
            const m = readManifest(dir);
            const waiting = review.rows.filter((r) => r.status === "can_xem").length;
            console.log(`${m?.bundleId ?? path.basename(dir)}  ${m?.groupName ?? ""}  ${waiting} dòng cần xem  ${review.reasons[0] ?? review.rows.find((r) => r.status === "can_xem")?.reasons[0] ?? ""}`);
        }
        console.log(`[photos:review] ${n} bộ cần xem.${n > 0 ? " Xem chi tiết: npm run photos:review -- --bundle <mã bộ>" : ""}`);
        return;
    }

    const dir = listBundleDirs(root).find((d) => readManifest(d)?.bundleId === bundleId);
    if (!dir) throw new Error(`Không thấy bộ "${bundleId}" trong ${root}.`);
    const manifest = readManifest(dir)!;
    const reading = readJson<BundleReading>(path.join(dir, "reading.json"));
    const review = readJson<Review>(path.join(dir, "review.json"));
    if (!reading || !review) throw new Error(`Bộ "${bundleId}" chưa được đọc (chạy photos:read trước).`);

    const save = (next: Review): void => {
        writeFileAtomic(path.join(dir, "review.json"), JSON.stringify(next, null, 2));
        console.log(`[photos:review] ${bundleId}: ${next.status}`);
    };
    if (flag("--discard-bundle")) return save(dismissBundle(review));

    const speedArg = option("--speed");
    const minutesArg = option("--minutes");
    const rowArg = speedArg ?? minutesArg ?? option("--row");
    const fixes = all("--fix");
    const action = flag("--confirm") ? "xac_nhan" : flag("--discard") ? "bo" : fixes.length > 0 ? "sua" : null;
    if (rowArg === undefined || action === null) {
        for (const line of describeBundle(manifest, reading, review)) console.log(line);
        console.log(`Ảnh gốc nằm ở: ${dir}`);
        return;
    }
    const index = Number(rowArg);
    if (!Number.isInteger(index) || index < 0) throw new Error(`--row phải là số nguyên không âm (nhận được "${rowArg}").`);
    const corrections: Record<string, unknown> = {};
    for (const f of fixes) {
        const { column, value } = speedArg !== undefined ? parseSpeedFix(f) : minutesArg !== undefined ? parseMinutesFix(f) : parseFix(f);
        corrections[column] = value;
    }
    const apply = speedArg !== undefined ? applyHumanSpeedRow : minutesArg !== undefined ? applyHumanMinutesRow : applyHumanRow;
    save(apply(review, index, action, corrections, Date.now()));
}

try {
    main();
} catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
}
