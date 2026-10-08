import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { outputDir, setOutputDir, setReportDir, statusReportDir } from "../src/core/paths.js";

test("setReportDir puts the person's folder inside the day: <root>/<yyMM>/<yyMMdd>/<id>", () => {
    assert.equal(setReportDir("D:\BaoCao", "NguyenVanA", "2026-10-06"), path.join("D:\BaoCao", "2610", "261006", "NguyenVanA"));
    assert.equal(setReportDir("D:\BaoCao", "NguyenVanA", "261006"), path.join("D:\BaoCao", "2610", "261006", "NguyenVanA"));
});

test("setReportDir keeps Vietnamese letters and inner spaces of the id as they are", () => {
    assert.equal(setReportDir("D:\BaoCao", "Nguyễn Văn A", "2026-10-06"), path.join(statusReportDir("D:\BaoCao", "2026-10-06"), "Nguyễn Văn A"));
});

test("setOutputDir is output/<id>", () => {
    assert.equal(setOutputDir("NguyenVanB"), path.join(outputDir, "NguyenVanB"));
});
