import { test } from "node:test";
import assert from "node:assert/strict";
import { bundleIdOf, filterPhotoMessages, groupPhotos, type BundleOptions } from "../src/vision/bundling.js";
import type { NormalizedMessage } from "../src/types/index.js";
import { T0 } from "./helpers/visionFixtures.js";

const OPTS: BundleOptions = { gapMinutes: 3, settleMinutes: 5, textWindowMinutes: 10 };
const MIN = 60_000;
const photo = (msgId: string, ts: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
    msgId, groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u1", senderName: "An", isSelf: false, ts, msgType: "chat.photo", content: "", url: `images/g1/${msgId}.jpg`, ...extra,
});
const text = (msgId: string, ts: number, content: string, extra: Partial<NormalizedMessage> = {}) => photo(msgId, ts, { msgType: "desktop.text", content, url: undefined, ...extra });
const NOW = T0 + 60 * MIN;

test("bundleIdOf uses the Vietnam clock of the first photo", () => {
    assert.equal(bundleIdOf(T0, "m1"), "20261007-074752-m1");
});

test("an album (photos a few ms apart) is one bundle in send order", () => {
    const out = groupPhotos([photo("m3", T0 + 20), photo("m1", T0), photo("m2", T0 + 10)], OPTS, NOW);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].images.map((i) => i.msgId), ["m1", "m2", "m3"]);
    assert.deepEqual(out[0].images.map((i) => i.seq), [1, 2, 3]);
    assert.equal(out[0].bundleId, "20261007-074752-m1");
    assert.equal(out[0].day, "2026-10-07");
    assert.equal(out[0].firstTs, T0);
    assert.equal(out[0].lastTs, T0 + 20);
    assert.deepEqual(out[0].sender, { id: "u1", name: "An" });
    assert.equal(out[0].images[0].source, "images/g1/m1.jpg");
});

test("photos sent one by one within the gap stay together; past the gap a new bundle opens", () => {
    const within = groupPhotos([photo("a", T0), photo("b", T0 + 2 * MIN), photo("c", T0 + 4 * MIN)], OPTS, NOW);
    assert.equal(within.length, 1, "each step is under 3 minutes even though the total is 4");
    const past = groupPhotos([photo("a", T0), photo("b", T0 + 3 * MIN + 1)], OPTS, NOW);
    assert.equal(past.length, 2);
});

test("two senders interleaved milliseconds apart make two bundles", () => {
    const out = groupPhotos([photo("a1", T0), photo("b1", T0 + 5, { senderId: "u2", senderName: "Bình" }), photo("a2", T0 + 10), photo("b2", T0 + 15, { senderId: "u2", senderName: "Bình" })], OPTS, NOW);
    assert.equal(out.length, 2);
    assert.deepEqual(out.map((b) => b.sender.id).sort(), ["u1", "u2"]);
    assert.deepEqual(out.find((b) => b.sender.id === "u1")!.images.map((i) => i.msgId), ["a1", "a2"]);
});

test("each group has its own bundles", () => {
    const out = groupPhotos([photo("a", T0), photo("b", T0 + 1, { groupId: "g2", groupName: "LC_X_BD", url: "images/g2/b.jpg" })], OPTS, NOW);
    assert.equal(out.length, 2);
});

test("a bundle stays open until it has been quiet for settleMinutes (fractions allowed)", () => {
    assert.equal(groupPhotos([photo("a", T0)], OPTS, T0 + 5 * MIN - 1)[0].status, "open");
    assert.equal(groupPhotos([photo("a", T0)], OPTS, T0 + 5 * MIN)[0].status, "closed");
    const quick = { ...OPTS, settleMinutes: 20 / 60 };
    assert.equal(groupPhotos([photo("a", T0)], quick, T0 + 19_000)[0].status, "open");
    assert.equal(groupPhotos([photo("a", T0)], quick, T0 + 20_000)[0].status, "closed");
});

test("photos without a saved file and the account's own photos are ignored", () => {
    const out = groupPhotos([photo("a", T0, { url: undefined }), photo("b", T0 + 1, { isSelf: true }), photo("c", T0 + 2)], OPTS, NOW);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].images.map((i) => i.msgId), ["c"]);
    assert.deepEqual(groupPhotos([photo("a", T0, { url: undefined })], OPTS, NOW), []);
});

test("texts of the same sender within the window, and photo captions, are attached; others are not", () => {
    const out = groupPhotos(
        [
            text("t0", T0 - 9 * MIN, "tiêu đề trước"),
            text("t1", T0 + 20 + 9 * MIN, "ghi chú sau"),
            text("far", T0 - 11 * MIN, "quá xa"),
            text("other", T0, "người khác", { senderId: "u2" }),
            text("blank", T0, "   "),
            photo("m1", T0, { content: "chú thích ảnh" }),
            photo("m2", T0 + 20),
        ],
        OPTS,
        NOW,
    );
    assert.equal(out.length, 1);
    assert.deepEqual(out[0].texts.map((t) => t.content), ["tiêu đề trước", "chú thích ảnh", "ghi chú sau"]);
});

test("running it again on the same messages gives the same bundle ids", () => {
    const msgs = [photo("m1", T0), photo("m2", T0 + 10)];
    assert.deepEqual(groupPhotos(msgs, OPTS, NOW).map((b) => b.bundleId), groupPhotos(msgs, OPTS, NOW).map((b) => b.bundleId));
});

test("filterPhotoMessages keeps only the named groups; the sender list limits photos but never texts", () => {
    const msgs = [
        photo("a", T0),
        photo("b", T0 + 1, { senderName: "Dung" }),
        text("t", T0 + 2, "chú thích", { senderName: "Dung" }),
        photo("x", T0 + 3, { groupName: "LC_Khac_BD" }),
    ];
    assert.deepEqual(filterPhotoMessages(msgs, ["bot test"], []).map((m) => m.msgId), ["a", "b", "t"]);
    assert.deepEqual(filterPhotoMessages(msgs, ["bot test"], ["Dung"]).map((m) => m.msgId), ["b", "t"]);
    assert.deepEqual(filterPhotoMessages(msgs, [], []), [], "no group named means nothing is read");
});
