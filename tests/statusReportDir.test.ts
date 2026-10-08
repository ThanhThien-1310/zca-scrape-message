import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { statusReportDir } from "../src/core/paths.js";

test("statusReportDir puts a day under <root>/<yyMM>/<yyMMdd>, with no extra folder in between", () => {
    assert.equal(statusReportDir("D:\\BaoCao", "261001"), path.join("D:\\BaoCao", "2610", "261001"));
    assert.equal(statusReportDir("D:/BaoCao", "270105"), path.join("D:/BaoCao", "2701", "270105"));
});

test("statusReportDir works from a day in YYYY-MM-DD form too, as the exporters hold it", () => {
    assert.equal(statusReportDir("D:\\BaoCao", "2026-10-01"), path.join("D:\\BaoCao", "2610", "261001"));
});
