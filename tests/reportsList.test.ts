import { test } from "node:test";
import assert from "node:assert/strict";
import { formatReportsList } from "../src/reportSets/reportsList.js";

test("every code is listed with its kind, source title, template, and whether the template exists", () => {
    const text = formatReportsList((file) => !file.includes("AM THANH")).join("\n");
    for (const code of ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance", "leave", "maintenance", "internetSpeed", "minutes"]) assert.ok(text.includes(`  ${code} (`), code);
    assert.match(text, /loa \(.*\) \| theo giai đoạn \| tin nguồn: BÁO CÁO ĐẦU\/CUỐI BUỔI DẠY \| mẫu: 01 - FORM TINH TRANG AM THANH\.xlsx \| THIẾU/);
    assert.match(text, /dien \(.*\) \| theo ngày \| tin nguồn: LỖI ĐIỆN \| .* \| có sẵn/);
});

test("the order is the export and print order", () => {
    const codes = formatReportsList(() => true).slice(1).map((l) => l.trim().split(" ")[0]);
    assert.deepEqual(codes, ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance", "leave", "maintenance", "internetSpeed", "minutes"]);
});
