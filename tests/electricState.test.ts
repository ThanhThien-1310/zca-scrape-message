import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { electricNeedsRebuild, electricSignature, readElectricBuilt, writeElectricBuilt, type ElectricBuilt } from "../src/lesson/electricState.js";

const rowsA = [{ A: 1, B: "THCS X", C: "DA", D: "PM1", F: "K" }];
const rowsB = [{ A: 1, B: "THCS X", C: "DA", D: "PM1", F: "B" }];
const built = (over: Partial<ElectricBuilt> = {}): ElectricBuilt => ({ day: "2026-10-03", signature: electricSignature(rowsA), file: "ĐIỆN_261003_T7_1409.xlsx", ...over });
const exists = () => true;

test("electricSignature: same rows -> same signature; any change to the rows (even the grade) -> another signature; empty is its own signature", () => {
    assert.equal(electricSignature(rowsA), electricSignature(JSON.parse(JSON.stringify(rowsA))));
    assert.notEqual(electricSignature(rowsA), electricSignature(rowsB));
    assert.notEqual(electricSignature(rowsA), electricSignature([]));
    assert.equal(electricSignature([]), electricSignature([]));
});

test("electricNeedsRebuild: never built, another day, other data, or the file is gone -> rebuild; same day with the same data -> do NOT rebuild", () => {
    const sig = electricSignature(rowsA);
    assert.equal(electricNeedsRebuild(null, "2026-10-03", sig, exists), true);
    assert.equal(electricNeedsRebuild(built(), "2026-10-04", sig, exists), true);
    assert.equal(electricNeedsRebuild(built(), "2026-10-03", electricSignature(rowsB), exists), true);
    assert.equal(electricNeedsRebuild(built(), "2026-10-03", sig, () => false), true);
    assert.equal(electricNeedsRebuild(built(), "2026-10-03", sig, exists), false);
});

test("an empty day is built once and then left alone until a first LỖI ĐIỆN arrives", () => {
    const empty = electricSignature([]);
    assert.equal(electricNeedsRebuild(null, "2026-10-03", empty, exists), true);
    assert.equal(electricNeedsRebuild(built({ signature: empty }), "2026-10-03", empty, exists), false);
    assert.equal(electricNeedsRebuild(built({ signature: empty }), "2026-10-03", electricSignature(rowsA), exists), true);
});

test("the built record round-trips through its file; a missing, unreadable or malformed file reads as null", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "electric-state-"));
    const file = path.join(dir, "e.json");
    assert.equal(readElectricBuilt(file), null);
    writeElectricBuilt(built(), file);
    assert.deepEqual(readElectricBuilt(file), built());
    fs.writeFileSync(file, "{not json");
    assert.equal(readElectricBuilt(file), null);
    fs.writeFileSync(file, JSON.stringify({ day: "2026-10-03", signature: 5, file: "x" }));
    assert.equal(readElectricBuilt(file), null);
});

test("each set has its own electric state file, named after the set", async () => {
    const { electricBuiltPath, DEFAULT_ELECTRIC_BUILT_PATH } = await import("../src/lesson/electricState.js");
    const a = electricBuiltPath("NguyenVanA");
    const b = electricBuiltPath("NguyenVanB");
    assert.notEqual(a, b);
    assert.notEqual(a, DEFAULT_ELECTRIC_BUILT_PATH);
    assert.match(a, /\.electric-report\.NguyenVanA\.json$/);
});
