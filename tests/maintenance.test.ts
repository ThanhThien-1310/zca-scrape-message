import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { maintenanceEntries, parseMaintenanceMessage } from "../src/lesson/maintenanceReport.js";
import { buildMaintenanceRows, capLaMa, MAINTENANCE_LAYOUT, maintenanceHeaderCells } from "../src/lesson/maintenanceRows.js";
import { legendFormulaCells } from "../src/lesson/statusReportLayout.js";
import type { SourceMessage } from "../src/types/index.js";

const REPORT = (school: string, room = "PM1") => `BÁO CÁO CUỐI BUỔI\n- Tên trường: ${school}\n- Tên IT: Nguyễn Văn A\n- Phòng máy: ${room}\n- Vệ sinh sạch sẽ: Có`;
const msg = (content: string, ts: number, id = String(ts)): SourceMessage => ({ msgId: id, groupId: "g1", groupName: "bot test", threadType: "group", senderId: "u", senderName: "IT", isSelf: false, ts, msgType: "desktop.text", content } as SourceMessage);
const all = () => true;

test("a cleaning-style report gives the school level, the school name and the area", () => {
    assert.deepEqual(parseMaintenanceMessage(REPORT("THCS Vĩnh Lộc B - BC")), { cap: "THCS", tenTruong: "VĨNH LỘC B", khuVuc: "BC" });
    assert.deepEqual(parseMaintenanceMessage(REPORT("TH Tây Bắc Lân - HM")), { cap: "TH", tenTruong: "TÂY BẮC LÂN", khuVuc: "HM" });
});

test("a school with no known level keeps its whole name, and a missing area stays empty", () => {
    assert.deepEqual(parseMaintenanceMessage(REPORT("Trường Lạ")), { cap: "", tenTruong: "TRƯỜNG LẠ", khuVuc: "" });
});

test("other titles, and a report without a school line, are not maintenance rows", () => {
    assert.equal(parseMaintenanceMessage("BÁO CÁO CUỐI BUỔI DẠY\n- Tên trường: THCS A - BC"), null, "teaching report is a different report");
    assert.equal(parseMaintenanceMessage("BÁO CÁO ĐIỂM DANH\n- Tên trường: THCS A - BC"), null);
    assert.equal(parseMaintenanceMessage("BÁO CÁO CUỐI BUỔI\n- Tên IT: An"), null);
    assert.equal(parseMaintenanceMessage("BÁO CÁO CUỐI BUỔI\n- Tên trường:  "), null);
});

test("one row per school: several rooms or several reports give one entry, the earliest message wins, order is send order", () => {
    const entries = maintenanceEntries(
        [msg(REPORT("THCS Vĩnh Lộc B - BC", "PM2"), 3000, "late"), msg(REPORT("TH Tây Bắc Lân - HM"), 2000), msg(REPORT("thcs  vĩnh lộc b - bc", "PM1"), 1000, "early"), msg("lời chào", 500)],
        all,
    );
    assert.deepEqual(entries.map((e) => [e.tenTruong, e.khuVuc, e.maTinNhan]), [["VĨNH LỘC B", "BC", "early"], ["TÂY BẮC LÂN", "HM", "2000"]]);
});

test("the same school name in two areas is two rows, and the time filter is applied", () => {
    const messages = [msg(REPORT("THCS An Phú - BC"), 1000), msg(REPORT("THCS An Phú - HM"), 2000), msg(REPORT("THCS Cũ - BC"), 100)];
    assert.equal(maintenanceEntries(messages, all).length, 3);
    assert.deepEqual(maintenanceEntries(messages, (ts) => ts >= 1000).map((e) => e.khuVuc), ["BC", "HM"]);
});

test("rows fill STT, CẤP, TÊN TRƯỜNG, KHU VỰC and the report date; every other column stays blank", () => {
    const rows = buildMaintenanceRows(maintenanceEntries([msg(REPORT("THCS Vĩnh Lộc B - BC"), 1000), msg(REPORT("TH Tây Bắc Lân - HM"), 2000)], all), "2026-10-07");
    assert.deepEqual(rows, [
        { A: 1, B: "II", C: "VĨNH LỘC B", D: "BC", H: "'07/10/2026" },
        { A: 2, B: "I", C: "TÂY BẮC LÂN", D: "HM", H: "'07/10/2026" },
    ]);
    for (const row of rows) for (const blank of ["E", "F", "G", "I", "J", "K", "L"]) assert.equal(blank in row, false, blank);
});

test("the level column is a Roman numeral for the three public levels and untouched for any other", () => {
    assert.deepEqual(["TH", "THCS", "THPT"].map(capLaMa), ["I", "II", "III"]);
    assert.deepEqual(["MN", "LC", "THCS - THPT", "TH - THCS", "CĐ", ""].map(capLaMa), ["MN", "LC", "THCS - THPT", "TH - THCS", "CĐ", ""]);
    const rows = buildMaintenanceRows(maintenanceEntries([msg(REPORT("THPT Nguyễn Hữu Cảnh - BC"), 1000), msg(REPORT("MN Hoa Hồng - BC"), 2000), msg(REPORT("Trường Lạ - BC"), 3000)], all), "2026-10-07");
    assert.deepEqual(rows.map((r) => r.B), ["III", "MN", ""]);
});

test("the header date is a real date shown dd/mm/yyyy, and the legend counts the grade column J", () => {
    assert.deepEqual(maintenanceHeaderCells("2026-10-07"), [{ ref: "L2", value: 46302, numberFormat: "dd/mm/yyyy" }]);
    const legend = legendFormulaCells(MAINTENANCE_LAYOUT, 2);
    // Hai dòng dữ liệu (4-5) thì dòng TỔNG là 6 và khối chú giải dời lên: các dòng loại là 10-13, dòng TỔNG của khối là 14.
    const count = legend.find((c) => c.ref === "D10");
    assert.ok(count);
    assert.equal(count.formula, "COUNTIF(J4:J5,B10)", "grade rows follow the data block");
    assert.ok(legend.some((c) => c.ref === "E14"), "sum row of the ratio column");
});

const REAL = path.join("data", "mau bao cao new", MAINTENANCE_LAYOUT.templateFile);
test("the real template still has the headers the layout relies on", { skip: !fs.existsSync(REAL) }, () => {
    const ws = XLSX.readFile(REAL).Sheets[MAINTENANCE_LAYOUT.sheet];
    assert.ok(ws, "sheet FORM");
    const header = (cols: string[]) => cols.map((c) => ws[`${c}3`]?.v);
    assert.deepEqual(header(["A", "B", "C", "D", "H", "I", "J"]), ["STT", "CẤP", "TÊN TRƯỜNG", "KHU VỰC", "BẢO TRÌ GN", "SỐ NGÀY", "XẾP LOẠI"]);
    assert.equal(ws["A10"]?.v, "TỔNG");
    assert.equal(ws["B14"]?.v, "A");
    assert.equal(ws["B17"]?.v, "D");
    assert.match(String(ws["A1"]?.v), /THỜI GIAN CHƯA BẢO TRÌ/);
});
