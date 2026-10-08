import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY_REPORT_KEYS, isReportKey, PHASE_REPORT_KEYS, REPORT_DEFS, REPORT_KEYS } from "../src/reportSets/registry.js";
import { FILE_LAYOUT, PHASE_STATUS_KEYS } from "../src/lesson/statusReportLayout.js";

test("the registry lists the 11 reports in export and print order", () => {
    assert.deepEqual([...REPORT_KEYS], ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance", "leave", "maintenance", "internetSpeed", "minutes"]);
});

test("the phase keys are exactly the files fill:status-reports writes for each phase; the rest are per-day", () => {
    assert.deepEqual(PHASE_REPORT_KEYS, PHASE_STATUS_KEYS);
    assert.deepEqual(DAY_REPORT_KEYS, ["dien", "cleaning", "attendance", "leave", "maintenance", "internetSpeed", "minutes"]);
});

test("every key has a definition that points at the real template layout", () => {
    for (const key of REPORT_KEYS) assert.equal(REPORT_DEFS[key].key, key);
    assert.equal(REPORT_DEFS.loa.layout, FILE_LAYOUT.loa);
    assert.equal(REPORT_DEFS.dien.layout, FILE_LAYOUT.dien);
    assert.equal(REPORT_DEFS.cleaning.layout.templateFile, "04 - FORM VE SINH PHONG MAY.xlsx");
    assert.equal(REPORT_DEFS.attendance.layout.templateFile, "05 - FORM NOI QUY THUC TAP.xlsx");
    assert.equal(REPORT_DEFS.leave.layout.templateFile, "LICH NGHI PHEP KY THUAT.xlsx");
    assert.equal(REPORT_DEFS.leave.kind, "day");
});

test("isReportKey accepts only registered keys, not inherited object properties", () => {
    assert.equal(isReportKey("mayTinh"), true);
    assert.equal(isReportKey("maytinh"), false);
    assert.equal(isReportKey("toString"), false);
    assert.equal(isReportKey(5), false);
    assert.equal(isReportKey(undefined), false);
});
