import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_LIMITS, groupNamesFromFile, loadRules, makeChatGroupsReader, makeGroupNameReader, noScrapeGroupsFromFile, parseRules, recoveryIgnoreWith } from "../src/chat/rules.js";

const TARGETS = ["bot test", "LC_HoaSen1_TĐ"];
const valid = (): any => ({
    version: 1,
    dryRun: false,
    limits: { maxRepliesPerMinute: 6, maxReplyDelaySeconds: 180, cooldownSecondsPerRule: 30 },
    groups: {
        "bot test": {
            rules: [
                { id: "a", when: { loaiBaoCao: ["DauBuoi", "CuoiBuoi"], mayLoi: true }, reply: "Cảm ơn {senderName}" },
                { id: "b", when: { keywords: ["máy lỗi"] }, reply: "ok" },
            ],
        },
    },
});
const failing = (mutate: (j: any) => void) => {
    const j = valid();
    mutate(j);
    return () => parseRules(j, TARGETS);
};
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "chatrules-")), "chat-rules.json");

test("a valid file parses to typed rules", () => {
    const r = parseRules(valid(), TARGETS);
    assert.equal(r.dryRun, false);
    assert.equal(r.limits.cooldownSecondsPerRule, 30);
    assert.deepEqual(Object.keys(r.groups), ["bot test"]);
    assert.deepEqual(r.groups["bot test"].rules[0], { id: "a", when: { loaiBaoCao: ["DauBuoi", "CuoiBuoi"], mayLoi: true }, reply: "Cảm ơn {senderName}" });
});

test("dryRun and limits are optional and fall back to the defaults", () => {
    const j = valid();
    delete j.dryRun;
    delete j.limits;
    const r = parseRules(j, TARGETS);
    assert.equal(r.dryRun, false);
    assert.deepEqual(r.limits, DEFAULT_LIMITS);
});

test("a group that is not in config.targets is refused, naming it", () => {
    assert.throws(failing((j) => (j.groups["Nhóm lạ"] = { rules: j.groups["bot test"].rules })), /nhóm "Nhóm lạ" không có trong config\.targets/);
});

test("bad structure is refused: version, empty rules, duplicate id, empty when, unknown key, bad reply", () => {
    assert.throws(failing((j) => (j.version = 2)), /"version" phải là 1/);
    assert.throws(failing((j) => (j.groups["bot test"].rules = [])), /cần "rules" là mảng không rỗng/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[1].id = "a")), /bị trùng trong nhóm/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[0].when = {})), /"when" phải có ít nhất một điều kiện/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[0].when.regex = "x")), /khóa lạ "regex"/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[0].reply = "")), /thiếu "reply"/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[0].reply = "Chào {tenGV}")), /biến lạ \{tenGV\}/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[0].when.mayLoi = false)), /"mayLoi" chỉ nhận true/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[1].when.keywords = [])), /"keywords"/);
    assert.throws(failing((j) => (j.groups["bot test"].rules[0].when.loaiBaoCao = ["Khac"])), /"loaiBaoCao"/);
    assert.throws(failing((j) => (j.limits.maxRepliesPerMinute = -1)), /limits\.maxRepliesPerMinute phải là số dương/);
});

test("every problem is reported at once", () => {
    const j = valid();
    j.version = 3;
    j.groups["Nhóm lạ"] = { rules: [] };
    assert.throws(() => parseRules(j, TARGETS), (e: Error) => /"version"/.test(e.message) && /Nhóm lạ/.test(e.message));
});

test("loadRules reads a file and reports unreadable JSON", () => {
    const file = tmp();
    fs.writeFileSync(file, JSON.stringify(valid()), "utf8");
    assert.equal(loadRules(file, TARGETS).groups["bot test"].rules.length, 2);
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.throws(() => loadRules(file, TARGETS), /không đọc được|JSON/);
    assert.throws(() => loadRules(path.join(path.dirname(file), "missing.json"), TARGETS), /không đọc được/);
});

test("groupNamesFromFile is forgiving: it never throws and returns the group names even if the rules are invalid", () => {
    const file = tmp();
    assert.deepEqual(groupNamesFromFile(file), []);
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.deepEqual(groupNamesFromFile(file), []);
    fs.writeFileSync(file, JSON.stringify({ groups: { "bot test": {}, "X": 5 } }), "utf8");
    assert.deepEqual(groupNamesFromFile(file).sort(), ["X", "bot test"]);
});

test("makeGroupNameReader re-reads only when the file changed", () => {
    const file = tmp();
    fs.writeFileSync(file, JSON.stringify({ groups: { A: {} } }), "utf8");
    const read = makeGroupNameReader(file);
    assert.deepEqual([...read()], ["A"]);
    fs.writeFileSync(file, JSON.stringify({ groups: { B: {} } }), "utf8");
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    assert.deepEqual([...read()], ["B"]);
    fs.rmSync(file);
    assert.deepEqual([...read()], []);
});

test("a group scrapes by default; \"scrape\": false marks it chat-only; anything else is refused", () => {
    assert.equal(parseRules(valid(), TARGETS).groups["bot test"].scrape, true);
    const j = valid();
    j.groups["bot test"].scrape = false;
    assert.equal(parseRules(j, TARGETS).groups["bot test"].scrape, false);
    assert.throws(failing((x) => (x.groups["bot test"].scrape = "no")), /"scrape" phải là true hoặc false/);
    assert.throws(failing((x) => (x.groups["bot test"].scrape = 0)), /"scrape" phải là true hoặc false/);
});

test("noScrapeGroupsFromFile lists only the groups marked scrape:false, and never throws", () => {
    const file = tmp();
    assert.deepEqual(noScrapeGroupsFromFile(file), []);
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.deepEqual(noScrapeGroupsFromFile(file), []);
    fs.writeFileSync(file, JSON.stringify({ groups: { A: { scrape: false }, B: { scrape: true }, C: {}, D: 5 } }), "utf8");
    assert.deepEqual(noScrapeGroupsFromFile(file), ["A"]);
});

test("makeChatGroupsReader returns both the chat groups and the chat-only ones, re-reading when the file changes", () => {
    const file = tmp();
    fs.writeFileSync(file, JSON.stringify({ groups: { A: { scrape: false }, B: {} } }), "utf8");
    const read = makeChatGroupsReader(file);
    assert.deepEqual([[...read().allowed].sort(), [...read().noScrape]], [["A", "B"], ["A"]]);
    fs.writeFileSync(file, JSON.stringify({ groups: { B: { scrape: false } } }), "utf8");
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    assert.deepEqual([[...read().allowed], [...read().noScrape]], [["B"], ["B"]]);
    fs.rmSync(file);
    assert.deepEqual([[...read().allowed], [...read().noScrape]], [[], []]);
});

test("recoveryIgnoreWith adds the chat-only groups to the configured ignore list without duplicates", () => {
    const file = tmp();
    fs.writeFileSync(file, JSON.stringify({ groups: { "bot test": { scrape: false }, "LC_X": { scrape: false }, "LC_Y": {} } }), "utf8");
    assert.deepEqual(recoveryIgnoreWith(["bot test"], file).sort(), ["LC_X", "bot test"]);
    assert.deepEqual(recoveryIgnoreWith(["bot test"], path.join(path.dirname(file), "missing.json")), ["bot test"]);
});
