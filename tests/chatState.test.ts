import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { consumeEcho, loadDone, markDone, recordSent } from "../chat/state.js";

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), "chatstate-"));

test("done ids persist, and only the most recent ones are kept", () => {
    const file = path.join(dir(), "done.json");
    assert.equal(loadDone(file).size, 0);
    for (let i = 1; i <= 5; i++) markDone(`m${i}`, file, 3);
    assert.deepEqual([...loadDone(file)], ["m3", "m4", "m5"]);
    markDone("m5", file, 3);
    assert.deepEqual([...loadDone(file)], ["m3", "m4", "m5"]);
});

test("a corrupt done file reads as empty", () => {
    const file = path.join(dir(), "done.json");
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.equal(loadDone(file).size, 0);
});

test("a message that comes back matching a sent reply is an echo, once per sent reply", () => {
    const file = path.join(dir(), "sent.json");
    recordSent("bot test", "Đã nhận thông tin có máy lỗi.", 1000, file);
    assert.equal(consumeEcho("bot test", "Đã nhận thông tin có máy lỗi.", 2000, file), true);
    assert.equal(consumeEcho("bot test", "Đã nhận thông tin có máy lỗi.", 3000, file), false); // consumed
});

test("two identical replies sent in a row are two echoes", () => {
    const file = path.join(dir(), "sent.json");
    recordSent("bot test", "ok", 1000, file);
    recordSent("bot test", "ok", 1500, file);
    assert.equal(consumeEcho("bot test", "ok", 2000, file), true);
    assert.equal(consumeEcho("bot test", "ok", 2100, file), true);
    assert.equal(consumeEcho("bot test", "ok", 2200, file), false);
});

test("a message the user typed is not an echo: different text, different group, or too late", () => {
    const file = path.join(dir(), "sent.json");
    recordSent("bot test", "ok", 1000, file);
    assert.equal(consumeEcho("bot test", "chào cả nhà", 2000, file), false);
    assert.equal(consumeEcho("LC_HoaSen1_TĐ", "ok", 2000, file), false);
    assert.equal(consumeEcho("bot test", "ok", 1000 + 121_000, file), false);
});

test("whitespace and Unicode form differences do not hide an echo", () => {
    const file = path.join(dir(), "sent.json");
    recordSent("bot test", "Đã  nhận\nthông tin", 1000, file);
    assert.equal(consumeEcho("bot test", "Đã nhận thông tin", 2000, file), true);
    recordSent("bot test", "Cảm ơn", 3000, file);
    assert.equal(consumeEcho("bot test", "Cảm ơn".normalize("NFD"), 3500, file), true);
});

test("old sent entries are pruned so the ledger does not grow forever", () => {
    const file = path.join(dir(), "sent.json");
    recordSent("A", "x", 0, file);
    recordSent("A", "y", 11 * 60_000, file);
    const stored = JSON.parse(fs.readFileSync(file, "utf8")) as Array<{ text: string }>;
    assert.deepEqual(stored.map((s) => s.text), ["y"]);
});
