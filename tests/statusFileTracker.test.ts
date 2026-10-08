import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { freeHhmm, readTracker, staleName, trackerKey, writeTracker, type TrackerState } from "../src/lesson/statusFileTracker.js";

test("trackerKey separates the same title across sets, days and phases", () => {
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("B", "2026-09-29", "morningstart", "LOA"));
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("A", "2026-09-29", "morningend", "LOA"));
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("A", "2026-09-30", "morningstart", "LOA"));
    assert.notEqual(trackerKey("A", "2026-09-29", "morningstart", "LOA"), trackerKey("A", "2026-09-29", "morningstart", "INTERNET"));
});

test("staleName: the previously recorded file is stale only when it differs from the new one", () => {
    const key = trackerKey("A", "2026-09-29", "morningstart", "LOA");
    const state: TrackerState = { [key]: "LOA_260929_T3_1042.xlsx" };
    assert.equal(staleName(state, key, "LOA_260929_T3_1105.xlsx"), "LOA_260929_T3_1042.xlsx");
    assert.equal(staleName(state, key, "LOA_260929_T3_1042.xlsx"), null); // same minute -> overwritten in place, nothing to delete
    assert.equal(staleName({}, key, "LOA_260929_T3_1105.xlsx"), null); // first run for this phase
});

test("another phase's or another set's file is never reported stale", () => {
    const a = trackerKey("A", "2026-09-29", "morningstart", "LOA");
    const state: TrackerState = { [a]: "LOA_260929_T3_0840.xlsx" };
    assert.equal(staleName(state, trackerKey("A", "2026-09-29", "morningend", "LOA"), "LOA_260929_T3_1110.xlsx"), null);
    assert.equal(staleName(state, trackerKey("B", "2026-09-29", "morningstart", "LOA"), "LOA_260929_T3_0841.xlsx"), null);
});

test("readTracker/writeTracker round-trip; a missing, corrupt or wrongly-shaped file reads as empty", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-"));
    const file = path.join(dir, "t.json");
    assert.deepEqual(readTracker(file), {});
    const state: TrackerState = { "A|2026-09-29|morningstart|LOA": "LOA_260929_T3_1042.xlsx" };
    writeTracker(state, file);
    assert.deepEqual(readTracker(file), state);
    fs.writeFileSync(file, "{not json", "utf8");
    assert.deepEqual(readTracker(file), {});
    fs.writeFileSync(file, JSON.stringify({ k: 5 }), "utf8");
    assert.deepEqual(readTracker(file), {});
});

// Tên file không có tên giai đoạn, chỉ có giờ phút chạy: hai giai đoạn dựng liền nhau trong cùng một phút sẽ ghi đè lên nhau.
// freeHhmm chọn giờ phút chưa bị GIAI ĐOẠN KHÁC (cùng bộ, ngày, tiêu đề) dùng, giữ nguyên định dạng tên.
const nameAt = (hhmm: string): string => `LOA_260929_T3_${hhmm}.xlsx`;

test("freeHhmm: nobody else uses the minute -> the same minute", () => {
    assert.equal(freeHhmm({}, "A", "2026-09-29", "morningstart", "LOA", "1317"), "1317");
    const state: TrackerState = { [trackerKey("A", "2026-09-29", "morningstart", "LOA")]: nameAt("1317") };
    assert.equal(freeHhmm(state, "A", "2026-09-29", "morningstart", "LOA", "1317"), "1317"); // chính giai đoạn này dựng lại: giữ tên, ghi đè tại chỗ
});

test("freeHhmm: another phase of the same set, day and title already uses it -> the next free minute, however many are taken", () => {
    const state: TrackerState = {
        [trackerKey("A", "2026-09-29", "morningstart", "LOA")]: nameAt("1317"),
        [trackerKey("A", "2026-09-29", "morningend", "LOA")]: nameAt("1318"),
    };
    assert.equal(freeHhmm(state, "A", "2026-09-29", "afternoonstart", "LOA", "1317"), "1319");
    assert.equal(freeHhmm(state, "A", "2026-09-29", "afternoonstart", "LOA", "1318"), "1319");
    assert.equal(freeHhmm(state, "A", "2026-09-29", "afternoonstart", "LOA", "1320"), "1320");
});

test("freeHhmm: minutes carry over the hour and wrap past midnight", () => {
    const at1359: TrackerState = { [trackerKey("A", "2026-09-29", "morningstart", "LOA")]: nameAt("1359") };
    assert.equal(freeHhmm(at1359, "A", "2026-09-29", "morningend", "LOA", "1359"), "1400");
    const at2359: TrackerState = { [trackerKey("A", "2026-09-29", "morningstart", "LOA")]: nameAt("2359") };
    assert.equal(freeHhmm(at2359, "A", "2026-09-29", "morningend", "LOA", "2359"), "0000");
});

test("freeHhmm: only names of the same set, day and title count", () => {
    const state: TrackerState = {
        [trackerKey("B", "2026-09-29", "morningstart", "LOA")]: nameAt("1317"),
        [trackerKey("A", "2026-09-28", "morningstart", "LOA")]: nameAt("1317"),
        [trackerKey("A", "2026-09-29", "morningstart", "INTERNET")]: nameAt("1317"),
    };
    assert.equal(freeHhmm(state, "A", "2026-09-29", "morningend", "LOA", "1317"), "1317");
});
