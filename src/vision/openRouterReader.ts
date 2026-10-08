import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { buildPrompt, buildResultSchema, PROMPT_VERSION, SYSTEM_PROMPT } from "./promptSchema.js";
import type { BundleReading, Confidence, FieldReading, Manifest, PhotoRule, ReadResult, VisionReader } from "../types/index.js";

/**
 * Đọc một bộ ảnh qua OpenRouter (API tương thích OpenAI, khoá `OPENROUTER_API_KEY` trong `.env` hoặc biến môi trường). MỘT lần gọi cho CẢ BỘ:
 * các ảnh gửi kèm theo đúng thứ tự (mỗi ảnh có một dòng "Ảnh N:" ngay trước), kết quả là một JSON theo lược đồ của các luật. Không bao giờ ném lỗi:
 * mọi sự cố trả về `{ ok: false, error }`.
 */
export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
const CONFIDENCE: Confidence[] = ["cao", "vua", "thap"];
const asConfidence = (v: unknown): Confidence => (CONFIDENCE.includes(v as Confidence) ? (v as Confidence) : "thap");
const tail = (s: string): string => s.trim().slice(-300);

/** Lấy đối tượng JSON từ câu trả lời của model: chấp nhận cả khi bọc trong ```json ... ``` hoặc có chữ thừa quanh. */
export function extractJsonObject(content: string): unknown {
    const text = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        return JSON.parse(text);
    } catch {
        const a = text.indexOf("{");
        const b = text.lastIndexOf("}");
        if (a < 0 || b <= a) throw new Error("không có JSON");
        return JSON.parse(text.slice(a, b + 1));
    }
}

/** Biến câu trả lời (chuỗi) của model thành một bản đọc; kiểm tra lược đồ nhẹ, lớp luật ở `review` mới là nơi kiểm chứng giá trị. */
export function parseModelAnswer(content: string, ctx: { manifest: Manifest; rules: PhotoRule[]; model: string; readAt: number }): ReadResult {
    let s: unknown;
    try {
        s = extractJsonObject(content);
    } catch {
        return { ok: false, error: `câu trả lời của model không phải JSON: ${tail(content) || "(rỗng)"}` };
    }
    if (typeof s !== "object" || s === null || Array.isArray(s)) return { ok: false, error: "câu trả lời của model không phải một đối tượng JSON" };
    const so = s as { images?: unknown; extracted?: unknown };
    if (!Array.isArray(so.images)) return { ok: false, error: "kết quả thiếu danh sách images" };

    const ruleIds = new Set(ctx.rules.map((r) => r.id));
    const images: BundleReading["images"] = [];
    for (const img of ctx.manifest.images) {
        const found = (so.images as Array<Record<string, unknown>>).find((x) => x && x.seq === img.seq);
        if (!found) return { ok: false, error: `model bỏ sót ảnh ${img.seq}` };
        images.push({ seq: img.seq, loai: typeof found.loai === "string" && ruleIds.has(found.loai) ? found.loai : "khac", doTinCay: asConfidence(found.doTinCay) });
    }

    const rawExtracted = typeof so.extracted === "object" && so.extracted !== null ? (so.extracted as Record<string, unknown>) : {};
    const extracted: BundleReading["extracted"] = {};
    for (const rule of ctx.rules) {
        const block = rawExtracted[rule.id];
        if (typeof block !== "object" || block === null) continue;
        const fields: Record<string, FieldReading> = {};
        for (const f of rule.truong) {
            const raw = (block as Record<string, unknown>)[f.ten];
            const fr = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
            fields[f.ten] = { value: fr.value === undefined ? null : fr.value, doTinCay: asConfidence(fr.doTinCay) };
        }
        extracted[rule.id] = fields;
    }

    return {
        ok: true,
        reading: {
            bundleId: ctx.manifest.bundleId,
            readAt: ctx.readAt,
            reader: { kind: "openrouter", model: ctx.model, promptVersion: PROMPT_VERSION, ruleVersions: Object.fromEntries(ctx.rules.map((r) => [r.id, r.version])) },
            images,
            extracted,
        },
    };
}

/** Lấy nội dung câu trả lời (và tên model thật) từ thân phản hồi của OpenRouter, hoặc thông báo lỗi nếu nó trả lỗi. */
export function parseCompletion(body: string): { ok: true; content: string; model?: string } | { ok: false; error: string } {
    let o: Record<string, any>;
    try {
        o = JSON.parse(body);
    } catch {
        return { ok: false, error: `OpenRouter trả về không phải JSON: ${tail(body) || "(rỗng)"}` };
    }
    if (o && typeof o === "object" && o.error) return { ok: false, error: `OpenRouter báo lỗi: ${String(o.error.message ?? JSON.stringify(o.error))}` };
    const content = o?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") return { ok: false, error: "OpenRouter không trả nội dung nào" };
    return { ok: true, content, model: typeof o.model === "string" ? o.model : undefined };
}

export interface OpenRouterReaderOptions {
    apiKey: string;
    model: string;
    secondModel: string;
    timeoutMs: number;
    url?: string;
    fetch?: FetchLike;
    now?: () => number;
}

export function makeOpenRouterReader(opts: OpenRouterReaderOptions): VisionReader {
    const doFetch = opts.fetch ?? (fetch as unknown as FetchLike);
    const now = opts.now ?? Date.now;
    return {
        async readBundle({ bundleDir, manifest, rules, pass }) {
            const model = pass === 2 ? opts.secondModel : opts.model;
            const schema = buildResultSchema(rules);
            const content: Array<Record<string, unknown>> = [{ type: "text", text: `${buildPrompt(rules, manifest)}\n\nTrả về DUY NHẤT một đối tượng JSON đúng lược đồ sau, không thêm chữ nào khác:\n${JSON.stringify(schema)}` }];
            try {
                for (const img of manifest.images) {
                    const mime = MIME[path.extname(img.file).toLowerCase()] ?? "image/jpeg";
                    const data = fs.readFileSync(path.join(bundleDir, img.file)).toString("base64");
                    content.push({ type: "text", text: `Ảnh ${img.seq}:` }, { type: "image_url", image_url: { url: `data:${mime};base64,${data}` } });
                }
            } catch (err) {
                return { ok: false, error: `không đọc được file ảnh của bộ: ${(err as Error).message}` };
            }
            const body = JSON.stringify({
                model,
                temperature: 0,
                messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content }],
                response_format: { type: "json_schema", json_schema: { name: "bao_cao_anh", strict: false, schema } },
            });
            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), opts.timeoutMs);
            let status = 0;
            let text = "";
            try {
                const res = await doFetch(opts.url ?? OPENROUTER_URL, { method: "POST", headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json" }, body, signal: ctl.signal });
                status = res.status;
                text = await res.text();
            } catch (err) {
                if (ctl.signal.aborted) return { ok: false, error: `quá ${Math.round(opts.timeoutMs / 1000)} giây chờ model đọc ảnh` };
                return { ok: false, error: `không gọi được OpenRouter: ${(err as Error).message}` };
            } finally {
                clearTimeout(timer);
            }
            const done = parseCompletion(text);
            if (!done.ok) return { ok: false, error: status >= 400 ? `${done.error} (HTTP ${status})` : done.error };
            return parseModelAnswer(done.content, { manifest, rules, model: done.model ?? model, readAt: now() });
        },
    };
}

/** Bộ đọc theo `config.vision` với khoá trong `OPENROUTER_API_KEY` (đọc thêm từ `.env`). Thiếu khoá thì KHÔNG ném lỗi lúc tạo: mỗi lần đọc báo lỗi rõ, còn `--dry-run` vẫn chạy được. */
export function makeConfiguredReader(): VisionReader {
    try {
        process.loadEnvFile();
    } catch {
        /* no .env: use the environment as it is */
    }
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return { readBundle: async () => ({ ok: false, error: "thiếu OPENROUTER_API_KEY: thêm dòng OPENROUTER_API_KEY=... vào file .env (hoặc biến môi trường) rồi khởi động lại bot" }) };
    return makeOpenRouterReader({ apiKey, model: config.vision.model, secondModel: config.vision.secondModel, timeoutMs: config.vision.timeoutSeconds * 1000 });
}
