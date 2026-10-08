import fs from "node:fs";
import path from "node:path";
import { photoRulesDir } from "../core/paths.js";
import type { FieldKind, PhotoRule, RuleField, SecondReadMode } from "../types/index.js";

/**
 * Đọc luật ảnh `photo-rules/<mã>.json`. Mọi lỗi nêu tên file và đường dẫn của trường sai để người sửa luật thấy ngay chỗ nào.
 * Luật chỉ MÔ TẢ ảnh và các trường cần lấy (để sinh lược đồ và prompt, xem `promptSchema.ts`); việc kiểm tra nội dung của từng loại ảnh
 * là mã riêng (loại `leave`: `src/leave/validate.ts`).
 */
const KINDS: FieldKind[] = ["so", "chu", "ngay", "dung_sai", "danh_sach"];
const ID_RE = /^[a-z][a-z0-9_]*$/;
const SECOND_READ: SecondReadMode[] = ["luon", "khi_tin_cay_thap", "khong"];

function fail(file: string, where: string, message: string): never {
    throw new Error(`${file}: ${where}: ${message}`);
}

function asObject(v: unknown, file: string, where: string): Record<string, unknown> {
    if (typeof v !== "object" || v === null || Array.isArray(v)) fail(file, where, "phải là một đối tượng");
    return v as Record<string, unknown>;
}

function str(o: Record<string, unknown>, key: string, file: string, where: string): string {
    const v = o[key];
    if (typeof v !== "string" || v.trim() === "") fail(file, `${where}.${key}`, "phải là chuỗi không rỗng");
    return v;
}

function posInt(o: Record<string, unknown>, key: string, file: string, where: string): number {
    const v = o[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) fail(file, `${where}.${key}`, "phải là số nguyên dương");
    return v;
}

function assertUnique(names: string[], file: string, where: string): void {
    const seen = new Set<string>();
    for (const n of names) {
        if (seen.has(n)) fail(file, where, `tên trùng: "${n}"`);
        seen.add(n);
    }
}

function parseField(raw: unknown, file: string, where: string, nested: boolean): RuleField {
    const o = asObject(raw, file, where);
    const ten = str(o, "ten", file, where);
    const kieu = o.kieu;
    if (!KINDS.includes(kieu as FieldKind)) fail(file, `${where}.kieu`, `phải là một trong ${KINDS.join(", ")}`);
    const field: RuleField = { ten, kieu: kieu as FieldKind };
    if (o.batBuoc !== undefined) {
        if (typeof o.batBuoc !== "boolean") fail(file, `${where}.batBuoc`, "phải là true hoặc false");
        field.batBuoc = o.batBuoc;
    }
    for (const k of ["min", "max"] as const) {
        if (o[k] === undefined) continue;
        if (typeof o[k] !== "number") fail(file, `${where}.${k}`, "phải là số");
        field[k] = o[k] as number;
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) fail(file, where, "min không được lớn hơn max");
    if (o.goiY !== undefined) {
        if (typeof o.goiY !== "string") fail(file, `${where}.goiY`, "phải là chuỗi");
        field.goiY = o.goiY;
    }
    if (field.kieu === "danh_sach") {
        if (nested) fail(file, where, "danh_sach không được lồng trong danh_sach");
        if (!Array.isArray(o.phanTu) || o.phanTu.length === 0) fail(file, `${where}.phanTu`, "danh_sach cần phanTu không rỗng");
        field.phanTu = o.phanTu.map((p, i) => parseField(p, file, `${where}.phanTu[${i}]`, true));
        assertUnique(field.phanTu.map((p) => p.ten), file, `${where}.phanTu`);
    } else if (o.phanTu !== undefined) {
        fail(file, `${where}.phanTu`, "chỉ trường danh_sach mới có phanTu");
    }
    return field;
}

export function parseRule(raw: unknown, file: string): PhotoRule {
    const o = asObject(raw, file, "gốc");
    const id = str(o, "id", file, "gốc");
    if (!ID_RE.test(id) || id === "khac") fail(file, "gốc.id", 'phải gồm chữ thường, số, gạch dưới, bắt đầu bằng chữ, và không được là "khac"');
    const version = posInt(o, "version", file, "gốc");
    const sl = asObject(o.soLuongMoiBo, file, "gốc.soLuongMoiBo");
    const toiThieu = posInt(sl, "toiThieu", file, "gốc.soLuongMoiBo");
    const toiDa = posInt(sl, "toiDa", file, "gốc.soLuongMoiBo");
    if (toiDa < toiThieu) fail(file, "gốc.soLuongMoiBo", "toiDa không được nhỏ hơn toiThieu");
    if (!Array.isArray(o.truong) || o.truong.length === 0) fail(file, "gốc.truong", "phải là mảng không rỗng");
    const truong = o.truong.map((f, i) => parseField(f, file, `truong[${i}]`, false));
    assertUnique(truong.map((f) => f.ten), file, "gốc.truong");
    if (!SECOND_READ.includes(o.docLanHai as SecondReadMode)) fail(file, "gốc.docLanHai", `phải là một trong ${SECOND_READ.join(", ")}`);
    if (o.nguongTinCay !== "cao" && o.nguongTinCay !== "vua") fail(file, "gốc.nguongTinCay", 'phải là "cao" hoặc "vua"');
    return {
        id,
        version,
        title: str(o, "title", file, "gốc"),
        nhanRa: str(o, "nhanRa", file, "gốc"),
        soLuongMoiBo: { toiThieu, toiDa },
        truong,
        docLanHai: o.docLanHai as SecondReadMode,
        nguongTinCay: o.nguongTinCay,
    };
}

/** Đọc mọi `*.json` trong `dir` (mặc định `photo-rules/`), sắp theo tên file. Thư mục không có thì trả mảng rỗng. */
export function loadRules(dir: string = photoRulesDir): PhotoRule[] {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    return files.map((file) => {
        let raw: unknown;
        try {
            raw = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8").replace(/^﻿/, ""));
        } catch (err) {
            return fail(file, "gốc", `không phải JSON: ${(err as Error).message}`);
        }
        const rule = parseRule(raw, file);
        if (rule.id !== file.slice(0, -".json".length)) fail(file, "gốc.id", `"${rule.id}" phải trùng tên file (${file.slice(0, -".json".length)})`);
        return rule;
    });
}
