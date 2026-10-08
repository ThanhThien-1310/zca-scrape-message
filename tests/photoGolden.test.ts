import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadGolden, scoreCase, summarize, type GoldenCase } from "../src/vision/golden.js";
import { reviewLeave } from "../src/leave/review.js";
import { validateLeaveRow } from "../src/leave/validate.js";
import { loadRules } from "../src/vision/rules.js";
import { leaveReadingOf, leaveRow, manifestOf } from "./helpers/visionFixtures.js";

const rules = loadRules();
const cfg = { maxPastDays: 7, maxFutureDays: 120 };
const reviewOf = (reading: ReturnType<typeof leaveReadingOf>) => reviewLeave({ rules, manifest: manifestOf(reading.images.length), first: reading, second: null, cfg });
const expectedRows = [leaveRow(), leaveRow({ hoTen: "Trần Văn B" })];
const caseOf: GoldenCase = { name: "mau", files: ["a.jpg"], loai: { "a.jpg": "leave" }, extracted: { leave: { ngayBaoCao: "2026-10-02", dong: expectedRows } } };
const good = () => leaveReadingOf(expectedRows);

test("a fully correct reading scores 100% with no dangerous mistakes", () => {
    const reading = good();
    const s = scoreCase(caseOf, ["a.jpg"], reading, reviewOf(reading));
    assert.deepEqual(s.classes, { ok: 1, total: 1 });
    assert.ok(s.fields.every((f) => f.ok));
    assert.equal(s.wrongButAuto, 0);
    assert.equal(s.status, "tu_dong_dat");
});

test("a wrong cell in a row that stayed tu_dong_dat is the dangerous kind; the same row caught as can_xem is not", () => {
    // Đáp án: dòng 1 có lý do "Cá nhân". Đọc sai thành "Sức khỏe": không luật nào bắt (cột lyDo không có luật) nên dòng vẫn tu_dong_dat: lỗi lọt qua cả ba lớp.
    const slip = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B", lyDo: "Sức khỏe" })]);
    const auto = scoreCase(caseOf, ["a.jpg"], slip, reviewOf(slip));
    assert.equal(auto.status, "tu_dong_dat");
    assert.equal(auto.wrongButAuto, 1);
    // Cùng dòng đó nhưng ngày không đọc được: luật cứng bắt, dòng thành can_xem nên không phải lỗi lọt.
    const caught = leaveReadingOf([leaveRow(), leaveRow({ hoTen: "Trần Văn B", tuNgay: "2026-02-30" })]);
    const sc = scoreCase(caseOf, ["a.jpg"], caught, reviewOf(caught));
    assert.equal(sc.status, "can_xem");
    assert.ok(sc.fields.some((f) => !f.ok));
    assert.equal(sc.wrongButAuto, 0);
});

test("a missing list row is a wrong reading and counts as dangerous while the bundle is still tu_dong_dat; a wrong image class counts against classification", () => {
    const reading = leaveReadingOf([leaveRow()]);
    const s = scoreCase(caseOf, ["a.jpg"], reading, reviewOf(reading));
    assert.ok(s.fields.some((f) => f.path === "leave.dong.length" && !f.ok));
    assert.ok(s.fields.some((f) => f.path === "leave.dong[1].hoTen" && !f.ok && f.actual === null));
    assert.ok(s.wrongButAuto >= 1, "nobody flagged the missing row");
    const khac = { ...reading, images: [{ seq: 1, loai: "khac", doTinCay: "cao" as const }] };
    assert.deepEqual(scoreCase(caseOf, ["a.jpg"], khac, reviewOf(khac)).classes, { ok: 0, total: 1 });
});

test("summarize totals accuracy, dangerous mistakes and the number needing review", () => {
    const a = good();
    const sa = scoreCase(caseOf, ["a.jpg"], a, reviewOf(a));
    const b = leaveReadingOf([leaveRow({ tuNgay: "2026-02-30" }), leaveRow({ hoTen: "Trần Văn B" })]);
    const sb = scoreCase(caseOf, ["a.jpg"], b, reviewOf(b));
    const sum = summarize([sa, sb]);
    assert.equal(sum.classAccuracy, 1);
    assert.equal(sum.needReview, 1);
    assert.equal(sum.wrongButAuto, 0);
    assert.ok(sum.fieldAccuracy < 1 && sum.fieldAccuracy > 0.5);
});

test("loadGolden validates the file and accepts an empty list of cases", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "golden-"));
    const file = path.join(dir, "leave.json");
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [] }), "utf8");
    assert.deepEqual(loadGolden(file).cases, []);
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [caseOf] }), "utf8");
    assert.equal(loadGolden(file).cases[0].name, "mau");
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [{ ...caseOf, loai: {} }] }), "utf8");
    assert.throws(() => loadGolden(file), /a\.jpg/);
    fs.writeFileSync(file, JSON.stringify({ sourceDir: "data/x", cases: [caseOf, caseOf] }), "utf8");
    assert.throws(() => loadGolden(file), /trùng/);
    fs.writeFileSync(file, JSON.stringify({ cases: [] }), "utf8");
    assert.throws(() => loadGolden(file), /sourceDir/);
});

test("the committed leave.json loads, and its three rows behave as documented against the validator", () => {
    const golden = loadGolden(path.join(process.cwd(), "photo-golden", "leave.json"));
    assert.equal(golden.cases.length, 1);
    const rows = (golden.cases[0].extracted.leave.dong as Array<Record<string, unknown>>);
    assert.equal(rows.length, 3);
    const verdicts = rows.map((r) => validateLeaveRow(r, { sendDay: "2026-10-02", ...cfg }));
    assert.deepEqual(verdicts.map((v) => v.ok), [true, true, true]);
    assert.deepEqual(verdicts.map((v) => v.warnings.length), [0, 1, 0], "the second row has the THỨ slip printed on the sample photo");
});
