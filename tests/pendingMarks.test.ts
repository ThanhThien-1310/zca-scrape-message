import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readPendingMarks, writePendingMarks } from "../src/runner/pendingMarks.js";

const fresh = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pending-")), ".runner-marks-pending.json");

test("pending marks round-trip; a missing, corrupt or wrongly shaped file reads as empty, and bad items are dropped", () => {
    const file = fresh();
    assert.deepEqual(readPendingMarks(file), []);
    writePendingMarks([{ maNhom: "g", maTinNhan: "1", maTrangThai: 2 }], file);
    assert.deepEqual(readPendingMarks(file), [{ maNhom: "g", maTinNhan: "1", maTrangThai: 2 }]);
    fs.writeFileSync(file, "{ nope", "utf8");
    assert.deepEqual(readPendingMarks(file), []);
    fs.writeFileSync(file, JSON.stringify([{ maNhom: "g", maTinNhan: "1", maTrangThai: 1 }, { maNhom: 5 }, null, "x"]), "utf8");
    assert.deepEqual(readPendingMarks(file), [{ maNhom: "g", maTinNhan: "1", maTrangThai: 1 }]);
    writePendingMarks([], file);
    assert.deepEqual(readPendingMarks(file), []);
});
