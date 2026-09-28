import { test } from "node:test";
import assert from "node:assert/strict";
import { foldText, hasMayLoi, matches, pickRule, renderReply } from "../src/chat/match.js";
import { extractRaw } from "../src/lesson/build.js";
import { COMPLETE, FAULTY_WITH_NOTE, IT_MAINTENANCE, SPECIALIST } from "./fixtures.js";
import type { InboxEntry, Rule } from "../src/types/index.js";

const entry = (text: string, over: Partial<InboxEntry> = {}): InboxEntry => ({ groupName: "bot test", groupId: "g1", msgId: "m1", senderId: "u1", senderName: "Cô Lan", ts: 1, text, ...over });
const MAY_LOI: Rule = { id: "may-loi", when: { loaiBaoCao: ["DauBuoi", "CuoiBuoi"], mayLoi: true }, reply: "Đã nhận thông tin có máy lỗi. Cảm ơn {senderName}." };
const KEYWORD: Rule = { id: "tu-khoa", when: { keywords: ["máy lỗi", "máy hỏng"] }, reply: "Đã nhận." };

test("hasMayLoi: a count above zero, or a note such as IT maintenance, is a fault; zero or a missing line is not", () => {
    assert.equal(hasMayLoi(extractRaw(COMPLETE, "g")), false); // "Tổng số máy bị lỗi: 0"
    assert.equal(hasMayLoi(extractRaw(FAULTY_WITH_NOTE, "g")), true); // "3(máy 35 không lên; ...)"
    assert.equal(hasMayLoi(extractRaw(IT_MAINTENANCE, "g")), true); // "IT bảo trì"
    assert.equal(hasMayLoi(extractRaw(COMPLETE.replace(/^- Tổng số máy bị lỗi.*\n/m, ""), "g")), false); // line missing
});

test("a normal report never triggers the machine-fault rule, even though its text contains the word 'lỗi'", () => {
    assert.equal(matches(MAY_LOI.when, entry(COMPLETE)), false);
    assert.equal(matches(MAY_LOI.when, entry(FAULTY_WITH_NOTE)), true);
    assert.equal(matches(MAY_LOI.when, entry(IT_MAINTENANCE)), true);
});

test("loaiBaoCao restricts to start and/or end reports and rejects other chat", () => {
    assert.equal(matches({ loaiBaoCao: ["DauBuoi"] }, entry(COMPLETE)), true);
    assert.equal(matches({ loaiBaoCao: ["DauBuoi"] }, entry(IT_MAINTENANCE)), false); // it is an end report
    assert.equal(matches({ loaiBaoCao: ["DauBuoi", "CuoiBuoi"] }, entry(SPECIALIST)), false);
    assert.equal(matches({ loaiBaoCao: ["DauBuoi", "CuoiBuoi"] }, entry("máy lỗi rồi")), false);
});

test("keywords ignore case and diacritics and match anywhere in the text", () => {
    assert.equal(matches(KEYWORD.when, entry("Phòng 3 MAY LOI mấy cái")), true);
    assert.equal(matches(KEYWORD.when, entry("máy hỏng nặng")), true);
    assert.equal(matches(KEYWORD.when, entry("mọi thứ bình thường")), false);
    assert.equal(foldText("  Máy   LỖI "), "may loi");
});

test("all keys of a when must match", () => {
    assert.equal(matches({ loaiBaoCao: ["CuoiBuoi"], keywords: ["bao tri"] }, entry(IT_MAINTENANCE)), true);
    assert.equal(matches({ loaiBaoCao: ["CuoiBuoi"], keywords: ["khong co"] }, entry(IT_MAINTENANCE)), false);
});

test("pickRule returns the first matching rule only, in order, or null", () => {
    assert.equal(pickRule([MAY_LOI, KEYWORD], entry(FAULTY_WITH_NOTE))?.id, "may-loi");
    assert.equal(pickRule([MAY_LOI, KEYWORD], entry("máy hỏng"))?.id, "tu-khoa");
    assert.equal(pickRule([MAY_LOI, KEYWORD], entry(COMPLETE)), null);
    assert.equal(pickRule([], entry("máy hỏng")), null);
});

test("renderReply fills {senderName} and falls back to 'bạn' when the name is unknown", () => {
    assert.equal(renderReply(MAY_LOI, entry("x")), "Đã nhận thông tin có máy lỗi. Cảm ơn Cô Lan.");
    assert.equal(renderReply(MAY_LOI, entry("x", { senderName: "" })), "Đã nhận thông tin có máy lỗi. Cảm ơn bạn.");
    assert.equal(renderReply(KEYWORD, entry("x")), "Đã nhận.");
});

// ---- reply variables about the fault ----
const FAULT_REPLY: Rule = { id: "t", when: { mayLoi: true }, reply: "{soMayLoi} | {chiTietLoi}" };
const withLoi = (value: string) => COMPLETE.replace("Tổng số máy bị lỗi: 0", `Tổng số máy bị lỗi: ${value}`);

test("renderReply: {soMayLoi} is the reported number and {chiTietLoi} the note in brackets", () => {
    assert.equal(renderReply(FAULT_REPLY, entry(FAULTY_WITH_NOTE)), "3 | máy 35 không lên; máy 41 hỏng màn hình");
});

test("renderReply: without a note {chiTietLoi} falls back to the count, and text such as IT maintenance is passed on as it is", () => {
    assert.equal(renderReply(FAULT_REPLY, entry(withLoi("2"))), "2 | 2 máy lỗi");
    assert.equal(renderReply(FAULT_REPLY, entry(IT_MAINTENANCE)), "IT bảo trì | IT bảo trì");
});

test("renderReply: no fault or no report leaves the fault variables empty instead of printing the placeholder", () => {
    assert.equal(renderReply(FAULT_REPLY, entry(COMPLETE)), "0 | ");
    assert.equal(renderReply(FAULT_REPLY, entry("chào cả nhà")), " | ");
});

test("renderReply: the variables can be mixed with {senderName}", () => {
    const rule: Rule = { id: "t", when: { mayLoi: true }, reply: "Cảm ơn {senderName}, {chiTietLoi}." };
    assert.equal(renderReply(rule, entry(FAULTY_WITH_NOTE)), "Cảm ơn Cô Lan, máy 35 không lên; máy 41 hỏng màn hình.");
});
