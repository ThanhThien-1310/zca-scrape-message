import fs from "node:fs";
import type { Override } from "../types/index.js";

/** Reads output/overrides.json; a missing file means "no corrections". */
export function readOverrides(file: string): Override[] {
    if (!fs.existsSync(file)) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(file, "utf8").replace(/^﻿/, ""));
    } catch (err) {
        throw new Error(`${file} is not valid JSON: ${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${file} must be a JSON array of { key, sua }`);
    parsed.forEach((o, i) => {
        const ok = o && typeof o === "object" && o.key && typeof o.key.maNhom === "string" && typeof o.key.maTinNhan === "string" && o.sua && typeof o.sua === "object";
        if (!ok) throw new Error(`${file}: entry ${i} must look like { "key": { "maNhom": "...", "maTinNhan": "..." }, "sua": { ... } }`);
    });
    return parsed as Override[];
}
