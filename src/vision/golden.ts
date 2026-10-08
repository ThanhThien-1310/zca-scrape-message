import fs from "node:fs";
import { flattenReading, norm } from "./review.js";
import type { BundleReading, Review } from "../types/index.js";

/**
 * Bộ đáp án đúng: mỗi ca là MỘT BỘ ảnh (danh sách file trong `sourceDir`) kèm đáp án người dùng đã xác nhận. `photos:golden` đọc từng ca bằng chính chu trình
 * thật rồi chấm điểm. Chỉ số quan trọng nhất là `wrongButAuto`: ô đọc SAI mà dòng chứa nó (hoặc cả bộ, với ô ngoài danh sách dòng) vẫn `tu_dong_dat`, tức là
 * lỗi lọt qua cả ba lớp review.
 */
export interface GoldenCase {
    name: string;
    files: string[];
    loai: Record<string, string>;
    extracted: Record<string, Record<string, unknown>>;
}
export interface GoldenFile {
    sourceDir: string;
    cases: GoldenCase[];
}

export function loadGolden(file: string): GoldenFile {
    const raw = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, "")) as Partial<GoldenFile>;
    if (typeof raw.sourceDir !== "string" || raw.sourceDir.trim() === "") throw new Error(`${file}: thiếu sourceDir`);
    if (!Array.isArray(raw.cases)) throw new Error(`${file}: thiếu cases`);
    const names = new Set<string>();
    for (const c of raw.cases) {
        if (typeof c.name !== "string" || c.name === "") throw new Error(`${file}: ca không có name`);
        if (names.has(c.name)) throw new Error(`${file}: tên ca trùng: ${c.name}`);
        names.add(c.name);
        if (!Array.isArray(c.files) || c.files.length === 0) throw new Error(`${file}: ca ${c.name} không có files`);
        for (const f of c.files) if (typeof c.loai?.[f] !== "string") throw new Error(`${file}: ca ${c.name} thiếu loai cho file ${f}`);
        if (typeof c.extracted !== "object" || c.extracted === null) throw new Error(`${file}: ca ${c.name} thiếu extracted`);
    }
    return { sourceDir: raw.sourceDir, cases: raw.cases };
}

export interface CaseScore {
    name: string;
    classes: { ok: number; total: number };
    fields: Array<{ path: string; expected: unknown; actual: unknown; ok: boolean }>;
    status: string;
    wrongButAuto: number;
}

/** Đáp án thường (`{luật: {trường: giá trị}}`) thành khoá phẳng, bằng cách dựng một kết quả đọc giả rồi dùng chính `flattenReading`. */
function flattenPlain(plain: Record<string, Record<string, unknown>>): Map<string, unknown> {
    const reading: BundleReading = {
        bundleId: "golden",
        readAt: 0,
        reader: { kind: "openrouter", model: "golden", promptVersion: "0", ruleVersions: {} },
        images: [],
        extracted: Object.fromEntries(Object.entries(plain).map(([rule, fields]) => [rule, Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v, doTinCay: "cao" as const }]))])),
    };
    return flattenReading(reading);
}

const rowOf = (path: string): number | null => {
    const m = /\.dong\[(\d+)\]\./.exec(path);
    return m ? Number(m[1]) : null;
};

/** `imageFiles[i]` là tên file của ảnh có `seq = i + 1`. */
export function scoreCase(c: GoldenCase, imageFiles: string[], reading: BundleReading, review: Review): CaseScore {
    const classes = { ok: 0, total: imageFiles.length };
    imageFiles.forEach((file, i) => {
        if (reading.images.find((x) => x.seq === i + 1)?.loai === c.loai[file]) classes.ok += 1;
    });
    const actual = flattenReading(reading);
    const fields = [...flattenPlain(c.extracted)].map(([path, expected]) => {
        const got = actual.get(path) ?? null;
        return { path, expected, actual: got, ok: norm(expected) === norm(got) };
    });
    // Ô của một dòng: tính theo trạng thái của dòng đó; dòng không có trong review (agent bỏ sót cả dòng) và ô ngoài danh sách dòng: tính theo trạng thái của cả bộ.
    const auto = (path: string): boolean => {
        const row = rowOf(path);
        const rr = row === null ? undefined : review.rows.find((r) => r.index === row);
        return (rr ? rr.status : review.status) === "tu_dong_dat";
    };
    const wrong = fields.filter((f) => !f.ok && auto(f.path)).length + (review.status === "tu_dong_dat" ? classes.total - classes.ok : 0);
    return { name: c.name, classes, fields, status: review.status, wrongButAuto: wrong };
}

export function summarize(scores: CaseScore[]): { classAccuracy: number; fieldAccuracy: number; wrongButAuto: number; needReview: number } {
    const classOk = scores.reduce((n, s) => n + s.classes.ok, 0);
    const classTotal = scores.reduce((n, s) => n + s.classes.total, 0);
    const fieldOk = scores.reduce((n, s) => n + s.fields.filter((f) => f.ok).length, 0);
    const fieldTotal = scores.reduce((n, s) => n + s.fields.length, 0);
    return {
        classAccuracy: classTotal === 0 ? 1 : classOk / classTotal,
        fieldAccuracy: fieldTotal === 0 ? 1 : fieldOk / fieldTotal,
        wrongButAuto: scores.reduce((n, s) => n + s.wrongButAuto, 0),
        needReview: scores.filter((s) => s.status === "can_xem").length,
    };
}
