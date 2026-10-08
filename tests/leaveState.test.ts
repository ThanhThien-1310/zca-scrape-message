import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { leaveBuiltPath, leaveNeedsRebuild, readLeaveBuilt, writeLeaveBuilt } from "../src/leave/leaveState.js";

const built = { day: "2026-10-07", signature: "abc", file: "LỊCH NGHỈ PHÉP KỸ THUẬT_261007_T4_0907.xlsx" };

test("rebuild only when never built, another day, other content, or the file is gone", () => {
    const exists = () => true;
    assert.equal(leaveNeedsRebuild(null, "2026-10-07", "abc", exists), true);
    assert.equal(leaveNeedsRebuild(built, "2026-10-07", "abc", exists), false);
    assert.equal(leaveNeedsRebuild(built, "2026-10-08", "abc", exists), true);
    assert.equal(leaveNeedsRebuild(built, "2026-10-07", "xyz", exists), true);
    assert.equal(leaveNeedsRebuild(built, "2026-10-07", "abc", () => false), true);
});

test("the state round-trips through a file, and a missing or broken file reads as null", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leave-state-"));
    const file = path.join(dir, "state.json");
    assert.equal(readLeaveBuilt(file), null);
    writeLeaveBuilt(built, file);
    assert.deepEqual(readLeaveBuilt(file), built);
    fs.writeFileSync(file, "không phải json", "utf8");
    assert.equal(readLeaveBuilt(file), null);
    fs.writeFileSync(file, JSON.stringify({ day: "x" }), "utf8");
    assert.equal(readLeaveBuilt(file), null);
});

test("each report set has its own state file", () => {
    assert.ok(leaveBuiltPath("Như").endsWith(".leave-report.Như.json"));
    assert.notEqual(leaveBuiltPath("A"), leaveBuiltPath("B"));
});
