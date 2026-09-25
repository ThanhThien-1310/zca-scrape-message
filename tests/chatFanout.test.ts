import { test } from "node:test";
import assert from "node:assert/strict";
import { routeMessage, routeMessageSafe } from "../chat/fanout.js";

const text = (over: Partial<{ msgId: string; senderId: string; senderName: string; isSelf: boolean; ts: number; content: string }> = {}) => ({ msgId: "m1", senderId: "u1", senderName: "Cô Lan", isSelf: false, ts: 5, content: "Máy lỗi rồi", ...over });
const ALLOWED = new Set(["bot test"]);
const never = () => false;

test("a group that is not in the rules goes to the scrape queue only, never to the chat inbox", () => {
    const r = routeMessage({ event: { groupId: "g2", textMessage: text() }, target: "LC_HoaSen1_TĐ", allowedGroups: ALLOWED, consumeEcho: never });
    assert.deepEqual(r, { queue: true, inbox: null });
});

test("a text message from someone else in a rules group goes to both lanes", () => {
    const r = routeMessage({ event: { groupId: "g1", textMessage: text() }, target: "bot test", allowedGroups: ALLOWED, consumeEcho: never });
    assert.equal(r.queue, true);
    assert.deepEqual(r.inbox, { groupName: "bot test", groupId: "g1", msgId: "m1", senderId: "u1", senderName: "Cô Lan", ts: 5, text: "Máy lỗi rồi" });
});

test("the bot's own reply coming back is dropped from both lanes", () => {
    const seen: Array<[string, string]> = [];
    const r = routeMessage({ event: { groupId: "g1", textMessage: text({ isSelf: true, content: "Đã nhận." }) }, target: "bot test", allowedGroups: ALLOWED, consumeEcho: (t, c) => (seen.push([t, c]), true) });
    assert.deepEqual(r, { queue: false, inbox: null });
    assert.deepEqual(seen, [["bot test", "Đã nhận."]]);
});

test("the account's own message that is not a bot reply still goes to the scrape queue but never to the chat inbox", () => {
    const r = routeMessage({ event: { groupId: "g1", textMessage: text({ isSelf: true }) }, target: "bot test", allowedGroups: ALLOWED, consumeEcho: never });
    assert.deepEqual(r, { queue: true, inbox: null });
});

test("a photo or any message without text goes to the scrape queue only", () => {
    const r = routeMessage({ event: { groupId: "g1" }, target: "bot test", allowedGroups: ALLOWED, consumeEcho: never });
    assert.deepEqual(r, { queue: true, inbox: null });
});

test("an empty text never reaches the inbox", () => {
    const r = routeMessage({ event: { groupId: "g1", textMessage: text({ content: "   " }) }, target: "bot test", allowedGroups: ALLOWED, consumeEcho: never });
    assert.equal(r.inbox, null);
});

test("an unknown conversation (no target) does nothing, as before", () => {
    const r = routeMessage({ event: { groupId: "g9", textMessage: text() }, target: undefined, allowedGroups: ALLOWED, consumeEcho: never });
    assert.deepEqual(r, { queue: false, inbox: null });
});

test("an echo that comes back as somebody else's message (isSelf not set) is still recognised in a rules group and dropped", () => {
    const seen: string[] = [];
    const r = routeMessage({ event: { groupId: "g1", textMessage: text({ isSelf: false, content: "Đã nhận thông tin có máy lỗi." }) }, target: "bot test", allowedGroups: ALLOWED, consumeEcho: (_t, c) => (seen.push(c), true) });
    assert.deepEqual(r, { queue: false, inbox: null });
    assert.deepEqual(seen, ["Đã nhận thông tin có máy lỗi."]);
});

test("the echo ledger is not even consulted for other people's messages in groups without rules", () => {
    let calls = 0;
    routeMessage({ event: { groupId: "g2", textMessage: text() }, target: "LC_HoaSen1_TĐ", allowedGroups: ALLOWED, consumeEcho: () => (calls++, false) });
    assert.equal(calls, 0);
});

test("routeMessageSafe: if the chat part throws, the group is still queued for scraping and nothing goes to the inbox", () => {
    const errors: string[] = [];
    const r = routeMessageSafe(
        { event: { groupId: "g1", textMessage: text() }, target: "bot test", allowedGroups: ALLOWED, consumeEcho: () => { throw new Error("EPERM rename"); } },
        (e) => errors.push(e.message),
    );
    assert.deepEqual(r, { queue: true, inbox: null });
    assert.deepEqual(errors, ["EPERM rename"]);
});

test("routeMessageSafe with an unknown conversation still does nothing", () => {
    const r = routeMessageSafe({ event: { groupId: "g9" }, target: undefined, allowedGroups: ALLOWED, consumeEcho: never }, () => undefined);
    assert.deepEqual(r, { queue: false, inbox: null });
});
