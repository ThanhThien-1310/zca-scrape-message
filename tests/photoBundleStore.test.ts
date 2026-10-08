import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { bundleDirOf, listBundleDirs, readManifest, writeBundle } from "../src/vision/bundleStore.js";
import { bundleFromMessages } from "../src/vision/bundleRun.js";
import { draftFromFiles, groupPhotos } from "../src/vision/bundling.js";
import { parseGroupName } from "../src/lesson/schoolArea.js";
import type { NormalizedMessage } from "../src/types/index.js";
import { T0 } from "./helpers/visionFixtures.js";

const SCHOOL = parseGroupName("LC_HoaSen1_HM");
const OPTS = { gapMinutes: 3, settleMinutes: 5, textWindowMinutes: 10 };

function world() {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-"));
    const dataDir = path.join(base, "data");
    const root = path.join(dataDir, "photo-reports");
    fs.mkdirSync(path.join(dataDir, "images", "g1"), { recursive: true });
    const addImage = (id: string, content = id) => fs.writeFileSync(path.join(dataDir, "images", "g1", `${id}.jpg`), content);
    return { dataDir, root, addImage };
}
const photo = (msgId: string, ts: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({ msgId, groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u1", senderName: "An", isSelf: false, ts, msgType: "chat.photo", content: "", url: `images/g1/${msgId}.jpg`, ...extra });
const draftOf = (ids: string[], now = T0 + 3_600_000) => groupPhotos(ids.map((id, i) => photo(id, T0 + i)), OPTS, now)[0];

test("a new bundle gets numbered image copies and a manifest", () => {
    const w = world();
    ["m1", "m2"].forEach((id) => w.addImage(id));
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(r.state, "new");
    assert.equal(r.dir, bundleDirOf(w.root, "2026-10-07", "g1", "20261007-074752-m1"));
    assert.equal(fs.readFileSync(path.join(r.dir, "01.jpg"), "utf8"), "m1");
    assert.equal(fs.readFileSync(path.join(r.dir, "02.jpg"), "utf8"), "m2");
    const m = readManifest(r.dir)!;
    assert.equal(m.status, "closed");
    assert.deepEqual(m.images.map((i) => i.file), ["01.jpg", "02.jpg"]);
    assert.deepEqual(m.school, SCHOOL);
    assert.equal(m.reread, undefined);
});

test("running it again changes nothing", () => {
    const w = world();
    ["m1", "m2"].forEach((id) => w.addImage(id));
    writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL).state, "unchanged");
});

test("open -> closed rewrites only the manifest", () => {
    const w = world();
    w.addImage("m1");
    assert.equal(writeBundle(w.root, w.dataDir, draftOf(["m1"], T0 + 1000), SCHOOL).state, "new");
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1"]), SCHOOL);
    assert.equal(r.state, "updated");
    assert.equal(readManifest(r.dir)!.status, "closed");
});

test("a photo that arrives after the bundle was read marks it for re-reading and renumbers in order", () => {
    const w = world();
    ["m1", "m3"].forEach((id) => w.addImage(id));
    const first = writeBundle(w.root, w.dataDir, draftOf(["m1", "m3"]), SCHOOL);
    fs.writeFileSync(path.join(first.dir, "reading.json"), "{}", "utf8");
    w.addImage("m2");
    const late = groupPhotos([photo("m1", T0), photo("m2", T0 + 1), photo("m3", T0 + 2)], OPTS, T0 + 3_600_000)[0];
    const r = writeBundle(w.root, w.dataDir, late, SCHOOL);
    assert.equal(r.state, "updated");
    assert.equal(r.dir, first.dir, "same first photo, same bundle folder");
    const m = readManifest(r.dir)!;
    assert.equal(m.reread, true);
    assert.deepEqual(m.images.map((i) => i.msgId), ["m1", "m2", "m3"]);
    assert.equal(fs.readFileSync(path.join(r.dir, "02.jpg"), "utf8"), "m2");
    assert.equal(fs.readFileSync(path.join(r.dir, "03.jpg"), "utf8"), "m3");
    assert.equal(listBundleDirs(w.root).length, 1, "no duplicate bundle");
});

test("a late photo before any reading does not set the re-read flag", () => {
    const w = world();
    ["m1", "m2"].forEach((id) => w.addImage(id));
    writeBundle(w.root, w.dataDir, draftOf(["m1"]), SCHOOL);
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(readManifest(r.dir)!.reread, undefined);
});

test("images whose source file is gone are dropped; a bundle with none left is skipped", () => {
    const w = world();
    w.addImage("m1");
    const r = writeBundle(w.root, w.dataDir, draftOf(["m1", "m2"]), SCHOOL);
    assert.equal(r.dropped, 1);
    assert.deepEqual(readManifest(r.dir)!.images.map((i) => i.msgId), ["m1"]);
    const none = writeBundle(w.root, w.dataDir, draftOf(["x1"]), SCHOOL);
    assert.equal(none.state, "skipped");
});

test("listBundleDirs finds bundles by day and ignores other folders", () => {
    const w = world();
    w.addImage("m1");
    writeBundle(w.root, w.dataDir, draftOf(["m1"]), SCHOOL);
    fs.mkdirSync(path.join(w.root, "golden", "x", "y"), { recursive: true });
    assert.equal(listBundleDirs(w.root).length, 1);
    assert.equal(listBundleDirs(w.root, "2026-10-07").length, 1);
    assert.equal(listBundleDirs(w.root, "2026-10-08").length, 0);
});

test("draftFromFiles builds one closed bundle from loose files, time from the file name", () => {
    const w = world();
    const a = path.join(w.dataDir, "1791334072487_x.jpg");
    const b = path.join(w.dataDir, "1791334072471_x.jpg");
    fs.writeFileSync(a, "a");
    fs.writeFileSync(b, "b");
    const d = draftFromFiles([a, b], "mau-1");
    assert.deepEqual(d.images.map((i) => i.msgId), ["1791334072471_x", "1791334072487_x"]);
    assert.equal(d.status, "closed");
    assert.equal(d.firstTs, 1791334072471);
    assert.ok(d.bundleId.endsWith("-mau-1"));
    const r = writeBundle(w.root, w.dataDir, d, parseGroupName("mau-1"));
    assert.equal(fs.readFileSync(path.join(r.dir, "01.jpg"), "utf8"), "b", "absolute source works");
});

const runOpts = (w: ReturnType<typeof world>, now: number, over: Record<string, unknown> = {}) => ({
    root: w.root, dataDir: w.dataDir, bundle: { gapMinutes: 3, textWindowMinutes: 10 }, settleSeconds: 20, groups: ["bot test"], senders: [] as string[], aliases: { "bot test": "LC_HoaSen1_HM" }, now, ...over,
});

test("bundleFromMessages bundles only the named groups and closes a bundle after settleSeconds", () => {
    const w = world();
    ["m1", "x1"].forEach((id) => w.addImage(id));
    const msgs = [photo("m1", T0), photo("x1", T0 + 1, { groupId: "g9", groupName: "LC_Khac_BD", url: "images/g1/x1.jpg" })];
    const open = bundleFromMessages(msgs, runOpts(w, T0 + 10_000));
    assert.deepEqual([open.drafts, open.new, open.open], [1, 1, 1]);
    assert.equal(listBundleDirs(w.root).length, 1, "the other group is never bundled");
    const closed = bundleFromMessages(msgs, runOpts(w, T0 + 30_000));
    assert.deepEqual([closed.updated, closed.open], [1, 0]);
    assert.equal(readManifest(listBundleDirs(w.root)[0])!.status, "closed");
    assert.deepEqual(readManifest(listBundleDirs(w.root)[0])!.school, parseGroupName("LC_HoaSen1_HM"), "the test group is read as the real school it stands for");
});

test("bundleFromMessages honours --day and an empty group list", () => {
    const w = world();
    w.addImage("m1");
    const msgs = [photo("m1", T0)];
    assert.equal(bundleFromMessages(msgs, runOpts(w, T0 + 60_000, { day: "2026-10-08" })).drafts, 0);
    assert.equal(bundleFromMessages(msgs, runOpts(w, T0 + 60_000, { groups: [] })).drafts, 0);
    assert.equal(bundleFromMessages(msgs, runOpts(w, T0 + 60_000, { day: "2026-10-07" })).drafts, 1);
});
