import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";
import { matchRoster, readRoster } from "../src/leave/roster.js";
import { normalizeName } from "../src/leave/names.js";

function makeTemplate(): string {
    const aoa: unknown[][] = [
        ["TIN HỌC ĐẠI DƯƠNG"],
        ["Nhân viên báo cáo: X"],
        ["STT", "NHÂN VIÊN", "CHỨC VỤ"],
        [1, "Huỳnh Hữu Đức", "Kỹ thuật phòng kho"],
        [2, "Đinh Đình Chinh", "Phó phòng kỹ thuật"],
        ["TỔNG", 12],
        [],
        [null, "Dạ, em gửi Lịch nghỉ phép ạ!"],
        [3, "Đinh Đình Chinh", "Kỹ thuật điện lạnh"],
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "BAO CAO");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "roster-")), "mau.xlsx");
    XLSX.writeFile(wb, file);
    return file;
}

test("the roster is every row that has both a name (B) and a position (C), from row 4 down", () => {
    const roster = readRoster(makeTemplate(), "BAO CAO");
    assert.deepEqual(roster, [
        { row: 4, name: "Huỳnh Hữu Đức" },
        { row: 5, name: "Đinh Đình Chinh" },
        { row: 9, name: "Đinh Đình Chinh" },
    ]);
});

test("a missing sheet is a clear error", () => {
    assert.throws(() => readRoster(makeTemplate(), "KHAC"), /không có sheet "KHAC"/);
});

test("matchRoster matches ignoring accents, case and spacing, and returns every row of a person who has two", () => {
    const roster = readRoster(makeTemplate(), "BAO CAO");
    assert.deepEqual(matchRoster(roster, "dinh  dinh CHINH").map((r) => r.row), [5, 9]);
    assert.deepEqual(matchRoster(roster, "Huỳnh Hữu Đức").map((r) => r.row), [4]);
    assert.deepEqual(matchRoster(roster, "Người lạ"), []);
    assert.deepEqual(matchRoster(roster, "  "), []);
});

const REAL = path.join("data", "mau bao cao new", "LICH NGHI PHEP KY THUAT.xlsx");
test("the real template on this machine gives 14 rows and Đinh Đình Chinh on rows 6 and 27", { skip: !fs.existsSync(REAL) }, () => {
    const roster = readRoster(REAL, "BAO CAO");
    assert.equal(roster.length, 14);
    assert.deepEqual(roster.filter((r) => normalizeName(r.name) === "dinh dinh chinh").map((r) => r.row), [6, 27]);
    assert.ok(roster.every((r) => r.row !== 16 && r.row !== 29), "the TỔNG row and the greeting row are not people");
});
