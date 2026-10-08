import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { processBundle, readBundles, type PipelineDeps } from "../src/vision/pipeline.js";
import { readManifest } from "../src/vision/bundleStore.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveReadingOf, leaveRow, manifestOf, readingOf } from "./helpers/visionFixtures.js";
import type { BundleReading, ReadInput, ReadResult, VisionReader } from "../src/types/index.js";

const rules = loadRules();

/** Dựng thư mục bộ trực tiếp (không qua writeBundle): root/<day>/g1/<bundleId>/manifest.json. */
function makeBundle(root: string, id: string, n: number, extra: Parameters<typeof manifestOf>[1] = {}): string {
    const dir = path.join(root, "2026-10-07", "g1", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestOf(n, { bundleId: id, ...extra })), "utf8");
    return dir;
}
const tmpRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "pipe-"));

/** Agent giả: trả kết quả lần một và lần hai cho từng bộ, và ghi lại các lần gọi. */
function fake(first: (i: ReadInput) => ReadResult, second?: (i: ReadInput) => ReadResult) {
    const calls: Array<{ dir: string; pass: number }> = [];
    const reader: VisionReader = {
        async readBundle(input) {
            calls.push({ dir: input.bundleDir, pass: input.pass });
            return input.pass === 1 ? first(input) : (second ?? first)(input);
        },
    };
    return { reader, calls };
}
const okRead = (r: BundleReading): ReadResult => ({ ok: true, reading: r });
const clean = (): ReadResult => okRead(leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B" })]));
const deps = (reader: VisionReader): PipelineDeps => ({ reader, rules, cfg: { maxPastDays: 7, maxFutureDays: 120 }, log: () => undefined });
const OPTS = { again: false, dryRun: false, maxBundles: 10 };

test("a clean leave bundle is read once and ends tu_dong_dat, with one review per row", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b1", 1);
    const f = fake(clean);
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1]);
    const review = JSON.parse(fs.readFileSync(path.join(dir, "review.json"), "utf8"));
    assert.equal(review.status, "tu_dong_dat");
    assert.equal(review.secondRead.ran, false);
    assert.equal(review.rows.length, 2);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "reading.json"), "utf8")).extracted.leave.dong.value.length, 2);
});

test("low confidence triggers a second read; a disagreement sends the differing row to review", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b2", 1);
    const f = fake(
        () => okRead(leaveReadingOf([leaveRow()], "thap")),
        () => okRead(leaveReadingOf([leaveRow({ soNgay: 2 })], "cao")),
    );
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1, 2]);
    if (!r.ok) return;
    assert.equal(r.review.status, "can_xem");
    assert.equal(r.review.secondRead.ran, true);
    assert.ok(r.review.secondRead.disagree.some((d) => d.path === "leave.dong[0].soNgay" && d.first === 1 && d.second === 2));
    assert.equal(r.review.rows[0].status, "can_xem");
});

test("a row that fails a hard rule triggers the second read too", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b2b", 1);
    const f = fake(() => okRead(leaveReadingOf([leaveRow({ tuNgay: "2026-02-30" })])));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.deepEqual(f.calls.map((c) => c.pass), [1, 2]);
});

test("a bundle of only room photos is tu_dong_dat with no second read and no rows", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b3", 2);
    const f = fake(() => okRead(readingOf(["khac", "khac"])));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    assert.equal(f.calls.length, 1);
    if (r.ok) assert.deepEqual([r.review.status, r.review.rows.length], ["tu_dong_dat", 0]);
});

test("a leave photo mixed with room photos: only the leave photo is read", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b3b", 3);
    const f = fake(() => okRead({ ...leaveReadingOf([leaveRow()]), images: [{ seq: 1, loai: "khac", doTinCay: "cao" }, { seq: 2, loai: "leave", doTinCay: "cao" }, { seq: 3, loai: "khac", doTinCay: "cao" }] }));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual([r.review.status, r.review.rows.length], ["tu_dong_dat", 1]);
});

test("a failed first read writes nothing and leaves the bundle unread", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b4", 1);
    const f = fake(() => ({ ok: false, error: "quá 180 giây" }));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(!r.ok && /180/.test(r.error));
    assert.equal(fs.existsSync(path.join(dir, "reading.json")), false);
    assert.equal(fs.existsSync(path.join(dir, "review.json")), false);
});

test("a failed second read still saves the first reading, every row can_xem, with the reason", async () => {
    const root = tmpRoot();
    const dir = makeBundle(root, "b5", 1);
    const f = fake(() => okRead(leaveReadingOf([leaveRow()], "thap")), () => ({ ok: false, error: "hết hạn mức" }));
    const r = await processBundle(dir, deps(f.reader));
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.review.status, "can_xem");
    assert.ok(r.review.reasons.some((x) => /hết hạn mức/.test(x)));
    assert.equal(fs.existsSync(path.join(dir, "reading.json")), true);
});

test("readBundles reads only closed, unread bundles, once; --again reads again; the re-read flag is cleared", async () => {
    const root = tmpRoot();
    makeBundle(root, "closed1", 1);
    makeBundle(root, "open1", 1, { status: "open" });
    const f = fake(clean);
    const s1 = await readBundles(root, OPTS, deps(f.reader));
    assert.equal(s1.read.length, 1);
    assert.equal(s1.skippedOpen, 1);
    assert.equal(f.calls.length, 1);
    const s2 = await readBundles(root, OPTS, deps(f.reader));
    assert.equal(s2.read.length, 0);
    assert.equal(s2.skippedRead, 1);
    assert.equal((await readBundles(root, { ...OPTS, again: true }, deps(f.reader))).read.length, 1);

    const dir = path.join(root, "2026-10-07", "g1", "closed1");
    const m = readManifest(dir)!;
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...m, reread: true }), "utf8");
    const s3 = await readBundles(root, OPTS, deps(f.reader));
    assert.equal(s3.read.length, 1, "re-read flag forces a new read");
    assert.equal(readManifest(dir)!.reread, undefined);
});

test("readBundles honours --bundle, --day, --dry-run and maxBundles, and collects failures", async () => {
    const root = tmpRoot();
    ["a", "b", "c"].forEach((id) => makeBundle(root, id, 1));
    const f = fake(clean);
    const dry = await readBundles(root, { ...OPTS, dryRun: true }, deps(f.reader));
    assert.equal(dry.listed.length, 3);
    assert.equal(f.calls.length, 0);
    const limited = await readBundles(root, { ...OPTS, maxBundles: 2 }, deps(f.reader));
    assert.equal(limited.read.length, 2);
    assert.equal(limited.overLimit, 1);
    const one = await readBundles(root, { ...OPTS, bundleId: "c" }, deps(f.reader));
    assert.equal(one.read.length, 1);
    assert.equal((await readBundles(root, { ...OPTS, again: true, day: "2026-10-08" }, deps(f.reader))).listed.length, 0);

    const bad = fake(() => ({ ok: false, error: "chưa đăng nhập" }));
    const root2 = tmpRoot();
    makeBundle(root2, "x", 1);
    const s = await readBundles(root2, OPTS, deps(bad.reader));
    assert.equal(s.read.length, 0);
    assert.equal(s.failed.length, 1);
    assert.match(s.failed[0].error, /chưa đăng nhập/);
});
