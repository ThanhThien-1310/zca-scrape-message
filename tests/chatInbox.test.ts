import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendInbox, readInbox, writeCursor, type InboxEntry } from "../chat/inbox.js";

const files = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-"));
    return { inbox: path.join(dir, "data", ".chat-inbox.jsonl"), cursor: path.join(dir, "data", ".chat-inbox.cursor") };
};
const e = (n: number, text = `tin ${n}`): InboxEntry => ({ groupName: "bot test", groupId: "g1", msgId: `m${n}`, senderId: "u", senderName: "Cô Lan", ts: n, text });

test("a missing inbox reads as empty", () => {
    const f = files();
    assert.deepEqual(readInbox(f.inbox, f.cursor), []);
});

test("appended entries are read in order, each with the byte offset just after it", () => {
    const f = files();
    appendInbox(e(1), f.inbox);
    appendInbox(e(2, "Máy lỗi nhé"), f.inbox);
    const items = readInbox(f.inbox, f.cursor);
    assert.deepEqual(items.map((i) => i.entry.msgId), ["m1", "m2"]);
    assert.equal(items[1].end, fs.statSync(f.inbox).size);
});

test("reading resumes after the cursor and a diacritic-heavy line keeps its byte offsets right", () => {
    const f = files();
    appendInbox(e(1, "Nguyễn Thị Hằng gửi báo cáo"), f.inbox);
    appendInbox(e(2), f.inbox);
    const [first, second] = readInbox(f.inbox, f.cursor);
    writeCursor(first.end, f.cursor);
    assert.deepEqual(readInbox(f.inbox, f.cursor).map((i) => i.entry.msgId), ["m2"]);
    writeCursor(second.end, f.cursor);
    assert.deepEqual(readInbox(f.inbox, f.cursor), []);
    appendInbox(e(3), f.inbox);
    assert.deepEqual(readInbox(f.inbox, f.cursor).map((i) => i.entry.msgId), ["m3"]);
});

test("a half-written last line is not read until it is complete", () => {
    const f = files();
    appendInbox(e(1), f.inbox);
    fs.appendFileSync(f.inbox, JSON.stringify(e(2)).slice(0, 20), "utf8");
    assert.deepEqual(readInbox(f.inbox, f.cursor).map((i) => i.entry.msgId), ["m1"]);
    fs.appendFileSync(f.inbox, JSON.stringify(e(2)).slice(20) + "\n", "utf8");
    assert.deepEqual(readInbox(f.inbox, f.cursor).map((i) => i.entry.msgId), ["m1", "m2"]);
});

test("corrupt or wrongly shaped lines are skipped", () => {
    const f = files();
    appendInbox(e(1), f.inbox);
    fs.appendFileSync(f.inbox, "{ not json\n" + JSON.stringify({ msgId: 5 }) + "\n", "utf8");
    appendInbox(e(2), f.inbox);
    assert.deepEqual(readInbox(f.inbox, f.cursor).map((i) => i.entry.msgId), ["m1", "m2"]);
});

test("a cursor beyond the end of the file (the inbox was rotated) restarts from the beginning", () => {
    const f = files();
    appendInbox(e(1), f.inbox);
    writeCursor(10_000, f.cursor);
    assert.deepEqual(readInbox(f.inbox, f.cursor).map((i) => i.entry.msgId), ["m1"]);
});

test("a corrupt cursor file reads as zero", () => {
    const f = files();
    appendInbox(e(1), f.inbox);
    fs.mkdirSync(path.dirname(f.cursor), { recursive: true });
    fs.writeFileSync(f.cursor, "abc", "utf8");
    assert.deepEqual(readInbox(f.inbox, f.cursor).map((i) => i.entry.msgId), ["m1"]);
});
