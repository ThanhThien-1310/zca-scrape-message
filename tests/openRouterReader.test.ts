import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractJsonObject, makeOpenRouterReader, parseCompletion, parseModelAnswer, type FetchLike } from "../src/vision/openRouterReader.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveRow, manifestOf, T0 } from "./helpers/visionFixtures.js";

const rules = loadRules();
const field = (value: unknown, doTinCay = "cao") => ({ value, doTinCay });
const good = {
    images: [{ seq: 1, loai: "leave", doTinCay: "cao" }, { seq: 2, loai: "khac", doTinCay: "vua" }],
    extracted: { leave: { ngayBaoCao: field("2026-10-02"), nguoiBaoCao: field("Trần Thị Dung"), boPhan: field("Nhân sự"), dong: field([leaveRow()]) } },
};
const ctx = { manifest: manifestOf(2), rules, model: "google/gemini-2.5-flash", readAt: T0 };
const completion = (content: string): string => JSON.stringify({ model: "google/gemini-2.5-flash", choices: [{ message: { content } }] });

test("a good answer becomes a reading with the model and rule versions", () => {
    const r = parseModelAnswer(JSON.stringify(good), ctx);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.reading.reader.kind, "openrouter");
    assert.equal(r.reading.reader.model, "google/gemini-2.5-flash");
    assert.deepEqual(r.reading.reader.ruleVersions, { bienban: 1, leave: 1, speedtest: 1 });
    assert.equal(r.reading.reader.promptVersion, "2");
    assert.deepEqual(r.reading.images.map((i) => i.loai), ["leave", "khac"]);
    assert.deepEqual(r.reading.extracted.leave.boPhan, { value: "Nhân sự", doTinCay: "cao" });
    assert.equal(r.reading.readAt, T0);
});

test("missing fields become null with low confidence, unknown classes become khac", () => {
    const r = parseModelAnswer(JSON.stringify({ images: [{ seq: 1, loai: "la-hoai", doTinCay: "cao" }, { seq: 2, loai: "leave", doTinCay: "xyz" }], extracted: { leave: { ngayBaoCao: field("2026-10-02") }, la: {} } }), ctx);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.reading.images[0].loai, "khac");
    assert.equal(r.reading.images[1].doTinCay, "thap");
    assert.deepEqual(r.reading.extracted.leave.boPhan, { value: null, doTinCay: "thap" });
    assert.equal(r.reading.extracted.la, undefined);
});

test("JSON wrapped in a code fence or surrounded by text is accepted; garbage and a skipped image are errors", () => {
    assert.deepEqual(extractJsonObject("```json\n{\"a\":1}\n```"), { a: 1 });
    assert.deepEqual(extractJsonObject("Đây là kết quả: {\"a\":1} xong"), { a: 1 });
    assert.ok(parseModelAnswer("```json\n" + JSON.stringify(good) + "\n```", ctx).ok);
    for (const out of ["", "không phải json", "[]"]) assert.equal(parseModelAnswer(out, ctx).ok, false, out);
    const skipped = parseModelAnswer(JSON.stringify({ images: [{ seq: 1, loai: "leave", doTinCay: "cao" }], extracted: {} }), ctx);
    assert.ok(!skipped.ok && /ảnh 2/.test(skipped.error));
});

test("parseCompletion returns the content, or the error OpenRouter reports", () => {
    const ok = parseCompletion(completion("xin chào"));
    assert.ok(ok.ok && ok.content === "xin chào" && ok.model === "google/gemini-2.5-flash");
    const err = parseCompletion(JSON.stringify({ error: { message: "No auth credentials found", code: 401 } }));
    assert.ok(!err.ok && /No auth credentials/.test(err.error));
    assert.ok(!parseCompletion("<html>").ok);
    assert.ok(!parseCompletion(JSON.stringify({ choices: [] })).ok);
});

function bundleDirWith(n: number): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "or-"));
    for (let i = 1; i <= n; i++) fs.writeFileSync(path.join(dir, `${String(i).padStart(2, "0")}.jpg`), Buffer.from([0xff, 0xd8, i]));
    return dir;
}

test("the reader sends the key, the model, the schema and every image in order", async () => {
    let seen: { url: string; headers: Record<string, string>; body: any } | undefined;
    const fetchFn: FetchLike = async (url, init) => ((seen = { url, headers: init.headers, body: JSON.parse(init.body) }), { ok: true, status: 200, text: async () => completion(JSON.stringify(good)) });
    const reader = makeOpenRouterReader({ apiKey: "sk-test", model: "m1", secondModel: "m2", timeoutMs: 5000, fetch: fetchFn, now: () => T0 });
    const r = await reader.readBundle({ bundleDir: bundleDirWith(2), manifest: manifestOf(2), rules, pass: 1 });
    assert.ok(r.ok);
    assert.ok(seen);
    assert.match(seen.url, /openrouter\.ai\/api\/v1\/chat\/completions/);
    assert.equal(seen.headers.Authorization, "Bearer sk-test");
    assert.equal(seen.body.model, "m1");
    assert.equal(seen.body.response_format.json_schema.schema.required[0], "images");
    const parts = seen.body.messages[1].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    assert.equal(parts.filter((p) => p.type === "image_url").length, 2);
    assert.ok(parts.findIndex((p) => p.text === "Ảnh 1:") < parts.findIndex((p) => p.text === "Ảnh 2:"));
    assert.match(parts.find((p) => p.type === "image_url")!.image_url!.url, /^data:image\/jpeg;base64,/);
});

test("pass 2 uses secondModel", async () => {
    const models: string[] = [];
    const fetchFn: FetchLike = async (_u, init) => (models.push(JSON.parse(init.body).model), { ok: true, status: 200, text: async () => completion(JSON.stringify(good)) });
    const reader = makeOpenRouterReader({ apiKey: "k", model: "m1", secondModel: "m2", timeoutMs: 5000, fetch: fetchFn });
    const dir = bundleDirWith(2);
    await reader.readBundle({ bundleDir: dir, manifest: manifestOf(2), rules, pass: 1 });
    await reader.readBundle({ bundleDir: dir, manifest: manifestOf(2), rules, pass: 2 });
    assert.deepEqual(models, ["m1", "m2"]);
});

test("HTTP errors, timeouts, network failures and missing image files are errors, never throws", async () => {
    const dir = bundleDirWith(2);
    const input = { bundleDir: dir, manifest: manifestOf(2), rules, pass: 1 as const };
    const mk = (fetchFn: FetchLike, timeoutMs = 2000) => makeOpenRouterReader({ apiKey: "k", model: "m", secondModel: "m", timeoutMs, fetch: fetchFn });
    const http = await mk(async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: "bad key" } }) })).readBundle(input);
    assert.ok(!http.ok && /bad key/.test(http.error) && /401/.test(http.error));
    const net = await mk(async () => { throw new Error("getaddrinfo ENOTFOUND"); }).readBundle(input);
    assert.ok(!net.ok && /ENOTFOUND/.test(net.error));
    const slow = await mk((_u, init) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))), 50).readBundle(input);
    assert.ok(!slow.ok && /giây/.test(slow.error));
    const missing = await mk(async () => ({ ok: true, status: 200, text: async () => "" })).readBundle({ ...input, bundleDir: path.join(dir, "nope") });
    assert.ok(!missing.ok && /file ảnh/.test(missing.error));
});
