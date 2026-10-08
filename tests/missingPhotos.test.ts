import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { missingPhotoWarnings } from "../src/vision/missingPhotos.js";
import type { NormalizedMessage } from "../src/types/index.js";

const DAY = "2026-10-08";
const at = (hhmm: string): number => Date.parse(`${DAY}T${hhmm}:00+07:00`);
const photo = (over: Partial<NormalizedMessage>): NormalizedMessage =>
    ({ msgId: "m", groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u", senderName: "IT", isSelf: false, ts: at("09:12"), msgType: "chat.photo", content: "", ...over }) as NormalizedMessage;

test("photos without a file are reported per group with their time range", () => {
    const w = missingPhotoWarnings([photo({ ts: at("09:12") }), photo({ ts: at("09:18") }), photo({ ts: at("09:15"), url: "images/g1/m.jpg" })], ["bot test"], DAY);
    assert.equal(w.length, 1);
    assert.match(w[0], /bot test.*2 ảnh \(09:12-09:18\)/);
});

test("nothing is reported for saved photos, own photos, other groups, other days, or text", () => {
    const msgs = [
        photo({ url: "images/g1/a.jpg" }),
        photo({ isSelf: true }),
        photo({ groupName: "nhóm khác" }),
        photo({ ts: at("09:12") - 86400_000 }),
        photo({ msgType: "desktop.text" }),
    ];
    assert.deepEqual(missingPhotoWarnings(msgs, ["bot test"], DAY), []);
});

test("one time shows as a single hour, two groups give two lines", () => {
    const w = missingPhotoWarnings([photo({}), photo({ groupName: "g2" })], ["bot test", "g2"], DAY);
    assert.equal(w.length, 2);
    assert.match(w[0], /1 ảnh \(09:12\)/);
});
