import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../config.js";
import { validateConfig } from "../src/config/configCheck.js";
import { formatConfig, SECTIONS, SETTINGS } from "../src/config/configDoc.js";
import type { ConfigShape } from "../src/types/index.js";

/** Leaf paths of `config`: scalars, arrays and `scrollDelayMs` (a {min,max} pair shown as one line). */
function leafPaths(obj: Record<string, unknown>, prefix = ""): string[] {
    const out: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (key === "cdpUrl") continue; // derived from cdpPort
        const p = prefix + key;
        if (value !== null && typeof value === "object" && !Array.isArray(value) && key !== "scrollDelayMs" && key !== "groupAliases") out.push(...leafPaths(value as Record<string, unknown>, `${p}.`));
        else out.push(p);
    }
    return out;
}
const get = (obj: unknown, p: string): unknown => p.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
const set = (obj: Record<string, unknown>, p: string, value: unknown): void => {
    const keys = p.split(".");
    let o = obj;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    o[keys.at(-1)!] = value;
};

test("every key of config has a documented entry, and every entry points at a real key", () => {
    const real = leafPaths(config as unknown as Record<string, unknown>).sort();
    const documented = SETTINGS.map((s) => s.path).sort();
    assert.deepEqual(documented, real);
});

test("every entry belongs to one of the 8 sections and names who reads it and what it means", () => {
    assert.equal(SECTIONS.length, 8);
    for (const s of SETTINGS) {
        assert.ok(SECTIONS.includes(s.section), `${s.path}: unknown section ${s.section}`);
        assert.ok(s.readers.length > 0, `${s.path}: readers`);
        assert.ok(s.note.length > 10, `${s.path}: note`);
        assert.ok(s.unit !== undefined, `${s.path}: unit`);
    }
});

test("chat.restorePreviousConversation is documented, off by default, and read by bot:chat", () => {
    const s = SETTINGS.find((x) => x.path === "chat.restorePreviousConversation");
    assert.ok(s);
    assert.equal(s.default, false);
    assert.deepEqual(s.readers, ["bot:chat"]);
});

test("the documented defaults are exactly what the code used before the config was centralised", () => {
    const pinned: Record<string, number> = {
        "watch.heartbeatSeconds": 30, "watch.deadAfterSeconds": 90, "watch.minBlindSeconds": 60,
        "runner.quietSeconds": 120, "runner.maxWaitSeconds": 600, "runner.pollSeconds": 5, "runner.dirtyCheckSeconds": 60,
        "runner.dirtyRetrySeconds": 300, "runner.watchWarmupSeconds": 90, "runner.maxConsecutiveFailures": 3, "runner.maxScrapeAttempts": 3, "runner.queueKeepDays": 3,
        "recovery.marginMinutes": 5,
        "chat.pollSeconds": 3, "chat.heartbeatSeconds": 30, "chat.skipBackoffSeconds": 45, "chat.sentLedgerMinutes": 10, "chat.echoWindowSeconds": 120,
        "sessions.chieuFromHour": 12, "sessions.toiFromHour": 18,
        "targetMessageCount": 2000,
    };
    for (const [path, value] of Object.entries(pinned)) assert.equal(SETTINGS.find((s) => s.path === path)?.default, value, path);
    assert.deepEqual(SETTINGS.find((s) => s.path === "scrollDelayMs")?.default, { min: 500, max: 1200 });
});

test("the documented defaults together form a valid config", () => {
    const cfg: Record<string, unknown> = { targets: ["a", "bot test"], recoveryIgnoreTargets: ["bot test"] };
    for (const s of SETTINGS) if (s.default !== undefined) set(cfg, s.path, s.default);
    assert.deepEqual(validateConfig(cfg as unknown as ConfigShape), []);
});

test("formatConfig prints every section and marks with * only the values that differ from the default", () => {
    const cfg = JSON.parse(JSON.stringify({ ...config })) as Record<string, unknown>;
    for (const s of SETTINGS) if (s.default !== undefined) set(cfg, s.path, s.default);
    const plain = formatConfig(cfg).join("\n");
    for (const name of SECTIONS) assert.ok(plain.includes(name), name);
    assert.doesNotMatch(plain, /^ \* /m);

    set(cfg, "runner.quietSeconds", 30);
    const changed = formatConfig(cfg);
    const line = changed.find((l) => l.includes("runner.quietSeconds"))!;
    assert.match(line, /^ \* runner\.quietSeconds = 30 giây/);
    assert.match(line, /mặc định 120/);
    assert.match(line, /bot:runner/);
    assert.equal(changed.filter((l) => l.startsWith(" * ")).length, 1);
});

test("formatConfig shows the scroll delay as a range and lists arrays readably", () => {
    const text = formatConfig(config as unknown as Record<string, unknown>).join("\n");
    assert.match(text, /scrollDelayMs = 500–1200 ms/);
    assert.match(text, /targets = bot test, /);
});
