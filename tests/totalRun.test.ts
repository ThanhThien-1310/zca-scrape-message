import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveReportSets } from "../src/reportSets/resolve.js";
import { runTotalForSets, runTotalOnce, totalTrackerKey, type TotalDeps } from "../src/total/runTotal.js";
import { autoFileName, slotsOfDay } from "../src/total/slots.js";
import { COMPLETE, DAY, YESTERDAY, at, msg } from "./fixtures.js";
import type { FillTemplateArgs } from "../src/lesson/excelFill.js";
import type { SourceMessage } from "../src/types/index.js";

const [morning, afternoon] = slotsOfDay(DAY, { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 });
const NAMES = ["total-netsupport", "total-loa", "total-internet", "total-mayTinh", "total-dien", "total-cleaning", "total-attendance"];
const SET = resolveReportSets([{ id: "A", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] }]).active[0];

/** Tiêu đề giả theo (file mẫu, sheet): hai file vệ sinh và nội quy cùng sheet "HANG NGAY" nên phải có file mẫu trong tiêu đề. */
const fakeTitle = (templatePath: string, sheet: string): string => `T:${path.basename(templatePath, ".xlsx")}:${sheet}`;

function setup(messages: SourceMessage[], over: Partial<TotalDeps> = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "total-run-"));
    const calls: FillTemplateArgs[] = [];
    const removed: string[] = [];
    const deps: TotalDeps = {
        loadMessages: async () => messages,
        readOverrides: () => [],
        fill: (a) => (calls.push(a), ""),
        templateTitle: fakeTitle,
        templatesSrc: "C:\\mau",
        outDirFor: () => dir,
        trackerFile: path.join(dir, "tracker.json"),
        removeFile: (f) => void removed.push(f),
        ...over,
    };
    return { dir, calls, removed, deps };
}
const rowsOf = (calls: FillTemplateArgs[], name: string) => calls.find((c) => c.name === name)!.rows;

test("a slot writes the 7 files in order, each named with -auto and stamped with the run time", async () => {
    const { calls, deps } = setup([msg(COMPLETE, at(7, 0))]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(calls.map((c) => c.name), NAMES);
    assert.ok(calls.every((c) => c.outName.endsWith("_0907-auto.xlsx")), JSON.stringify(calls.map((c) => c.outName)));
    assert.deepEqual(result.files, calls.map((c) => c.outName));
    assert.deepEqual(result.failed, []);
    assert.equal(result.slot, "morning");
    assert.equal(result.day, DAY);
});

test("the header time of the status files is the run time", async () => {
    const { calls, deps } = setup([]);
    await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(calls.find((c) => c.name === "total-loa")!.headerCells.map((h) => h.value), ["Thứ: 5", "Ngày: 24/09/2026", "Thời gian: 09:07"]);
});

test("no messages still writes all 7 files, with 0 rows and a valid legend", async () => {
    const { calls, deps } = setup([]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 1), set: SET }, deps);
    assert.equal(calls.length, 7);
    assert.deepEqual(Object.values(result.counts), [0, 0, 0, 0, 0, 0, 0]);
    assert.ok(calls.find((c) => c.name === "total-loa")!.formulaCells!.length > 0);
});

test("the afternoon slot takes the later report of a room (lỗi lúc 7h, bình thường lúc 14h); the morning slot only sees the early one", async () => {
    const early = msg(COMPLETE.replace("Internet:T", "Internet: K"), at(7, 0));
    const later = msg(COMPLETE.replace("Internet:T", "Internet: T"), at(14, 0));
    const morningRun = setup([early, later]);
    await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, morningRun.deps);
    assert.deepEqual(rowsOf(morningRun.calls, "total-internet").map((r) => r.F), ["K"]);
    const afternoonRun = setup([early, later]);
    await runTotalOnce({ slot: afternoon, now: at(15, 5), set: SET }, afternoonRun.deps);
    assert.deepEqual(rowsOf(afternoonRun.calls, "total-internet").map((r) => r.F), ["T"]);
});

test("a later report with every grade blank does not erase the earlier graded one", async () => {
    const BLANK = ["BÁO CÁO CUỐI BUỔI DẠY", "- Tên Giáo Viên: Nguyễn Văn A", "- Phòng Máy: PM1", "- Tình trạng Netsupport:", "- Tình trạng Internet:", "- Tình trạng Loa, Âm ly:", "- Tình trạng máy lạnh, máy quạt:"].join("\n");
    const { calls, deps } = setup([msg(COMPLETE, at(7, 0)), msg(BLANK, at(14, 0))]);
    await runTotalOnce({ slot: afternoon, now: at(15, 5), set: SET }, deps);
    assert.deepEqual(rowsOf(calls, "total-internet").map((r) => r.F), ["T"]);
});

test("messages outside the window are ignored: 6:29 and 9:00 for the morning slot, and a report of another day", async () => {
    const { calls, deps } = setup([msg(COMPLETE, at(6, 29)), msg(COMPLETE, at(9, 0)), msg(COMPLETE, at(7, 0) - 24 * 3_600_000)]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, deps);
    assert.equal(result.counts["loa"], 0);
    assert.equal(rowsOf(calls, "total-loa").length, 0);
});

test("cleaning and attendance rows come from the same window", async () => {
    const CLEANING = ["BÁO CÁO CUỐI BUỔI", "- Tên trường: THCS Tân Đông Hiệp - DA", "- Tổng số PM: 4 (PM1, PM2 Cty, PM3, PM4 trường)", "- Tên IT: Quyền", "", "- Phòng máy: Tin Học (PM2 kế cận tin)", "- Tổng số máy: 51 (tính cả máy GV)", "- Netsupport: Có", "- Internet: Có", "- Vệ sinh sạch sẽ: có"].join("\n");
    const ATTENDANCE = "BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: Lưu Đình Phong\n- Thời gian đến nơi: 8h25\n- Nơi làm việc: LC QUANG TRUNG NGUYỄN HUỆ Q5";
    const { calls, deps } = setup([msg(CLEANING, at(8, 30)), msg(CLEANING, at(6, 0)), msg(ATTENDANCE, at(8, 25)), msg(ATTENDANCE, at(7, 0))]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, deps);
    assert.equal(result.counts["cleaning"], 1);
    assert.equal(result.counts["attendance"], 1); // cùng một người cùng buổi sáng: giữ tin gửi MUỘN NHẤT (8:25, trễ vì sau 8:00), nên tin 7:00 không thành dòng riêng
    assert.equal(rowsOf(calls, "total-cleaning")[0].F, "Quyền");
    assert.ok(!("G" in rowsOf(calls, "total-cleaning")[0])); // GHI CHÚ để trống, người dùng tự xếp loại
    assert.equal(rowsOf(calls, "total-attendance")[0].F, "8:25");
});

test("the tracker replaces the old file of THIS slot only; the other slot's file and the 4-phase files are untouched", async () => {
    const { dir, deps, removed } = setup([]);
    const loaTitle = fakeTitle("01 - FORM TINH TRANG AM THANH.xlsx", "1209");
    fs.writeFileSync(deps.trackerFile, JSON.stringify({
        [totalTrackerKey("A", DAY, "morning", loaTitle)]: "OLD-MORNING-LOA.xlsx",
        [totalTrackerKey("A", DAY, "afternoon", loaTitle)]: "OTHER-SLOT-LOA.xlsx",
    }));
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(removed, [path.join(dir, "OLD-MORNING-LOA.xlsx")]);
    const tracker = JSON.parse(fs.readFileSync(deps.trackerFile, "utf8")) as Record<string, string>;
    assert.equal(tracker[totalTrackerKey("A", DAY, "morning", loaTitle)], autoFileName(loaTitle, DAY, "0907"));
    assert.equal(tracker[totalTrackerKey("A", DAY, "afternoon", loaTitle)], "OTHER-SLOT-LOA.xlsx");
    assert.equal(Object.keys(tracker).length, 8); // 7 file của đợt sáng + khoá của đợt chiều
    assert.equal(result.files.length, 7);
});

test("one failing file does not stop the other six, and its previous file is KEPT", async () => {
    const calls: FillTemplateArgs[] = [];
    const mayTinhTitle = fakeTitle("02 - FORM TINH TRANG MAY TINH.xlsx", "2409");
    const { dir, deps, removed } = setup([], {
        fill: (a) => {
            if (a.name === "total-mayTinh") throw new Error("Excel đang mở file");
            calls.push(a);
            return "";
        },
    });
    fs.writeFileSync(deps.trackerFile, JSON.stringify({ [totalTrackerKey("A", DAY, "morning", mayTinhTitle)]: "OLD-MAYTINH.xlsx" }));
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(result.failed, ["mayTinh"]);
    assert.equal(result.files.length, 6);
    assert.equal(calls.length, 6);
    assert.ok(result.warnings.some((w) => w.includes("mayTinh") && w.includes("Excel đang mở file")), JSON.stringify(result.warnings));
    const partial = path.join(dir, autoFileName(mayTinhTitle, DAY, "0907"));
    assert.ok(removed.includes(partial), "bản ghi dở của file lỗi phải bị bỏ");
    assert.ok(!removed.includes(path.join(dir, "OLD-MAYTINH.xlsx")), "bản cũ của file lỗi phải được giữ");
    const tracker = JSON.parse(fs.readFileSync(deps.trackerFile, "utf8")) as Record<string, string>;
    assert.equal(tracker[totalTrackerKey("A", DAY, "morning", mayTinhTitle)], "OLD-MAYTINH.xlsx");
});

test("a failure to delete an old file is only a warning", async () => {
    const { deps } = setup([], {
        removeFile: () => {
            throw new Error("EBUSY");
        },
    });
    const loaTitle = fakeTitle("01 - FORM TINH TRANG AM THANH.xlsx", "1209");
    fs.writeFileSync(deps.trackerFile, JSON.stringify({ [totalTrackerKey("A", DAY, "morning", loaTitle)]: "OLD.xlsx" }));
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(result.failed, []);
    assert.ok(result.warnings.some((w) => w.includes("OLD.xlsx") && w.includes("EBUSY")), JSON.stringify(result.warnings));
});

test("totalTrackerKey is <set>|<day>|total-<slot>|<title>", () => {
    assert.equal(totalTrackerKey("A", "2026-10-03", "afternoon", "TÌNH TRẠNG LOA"), "A|2026-10-03|total-afternoon|TÌNH TRẠNG LOA");
});

test("onProgress is called before each of the 7 files, so the bot can keep its heartbeat during a long export", async () => {
    const events: string[] = [];
    const { deps } = setup([], { fill: (a) => (events.push(`fill:${a.name}`), ""), onProgress: () => void events.push("beat") });
    await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(events, NAMES.flatMap((n) => ["beat", `fill:${n}`]));
});

test("ĐIỆN takes the WHOLE DAY of LỖI ĐIỆN messages (not just the slot window), latest per room, not from lesson reports; other days are left out", async () => {
    const ELECTRIC = "LỖI ĐIỆN\n- Trường: THCS Tân Đông Hiệp\n- Khu vực: DA\n- Phòng Máy: PM1\n- Tình trạng: Mất điện";
    const { calls, deps } = setup([msg(COMPLETE, at(7, 0)), msg(ELECTRIC, at(7, 30)), msg(ELECTRIC.replace("Mất điện", "Chập chờn"), at(8, 30)), msg(ELECTRIC.replace("Mất điện", "K"), at(13, 30)), msg(ELECTRIC, at(6, 0)), msg(ELECTRIC, YESTERDAY)]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, deps);
    assert.equal(result.counts["dien"], 1);
    assert.deepEqual(rowsOf(calls, "total-dien"), [{ A: 1, B: "THCS Tân Đông Hiệp", C: "DA", D: "PM1", F: "K" }]);
});

test("VỆ SINH and NỘI QUY header: 'Ngày' and 'Thời gian' (the run time) cells are written as text, not a date number over the time cell", async () => {
    const { calls, deps } = setup([]);
    await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, deps);
    const header = (name: string) => calls.find((c) => c.name === name)!.headerCells;
    assert.deepEqual(header("total-attendance"), [{ ref: "H2", value: "Ngày: 24/09/2026" }, { ref: "I2", value: "Thời gian: 09:05" }]);
    assert.deepEqual(header("total-cleaning").slice(0, 2), [{ ref: "F2", value: "Ngày: 24/09/2026" }, { ref: "G2", value: "Thời gian: 09:05" }]);
    assert.equal(header("total-cleaning")[2].ref, "J2");
});

test("the files are written (and so printed, from result.written) in the required order: NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH, NỘI QUY", async () => {
    const { deps } = setup([msg(COMPLETE, at(7, 0))]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, deps);
    assert.deepEqual(result.written.map((w) => w.name), ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"]);
});

test("only the reports the set enabled are written, still in the required order", async () => {
    const only = resolveReportSets([{ id: "B", reports: ["attendance", "loa", "dien"] }]).active[0];
    const { calls, deps } = setup([msg(COMPLETE, at(7, 0))]);
    const result = await runTotalOnce({ slot: morning, now: at(9, 5), set: only }, deps);
    assert.deepEqual(calls.map((c) => c.name), ["total-loa", "total-dien", "total-attendance"]);
    assert.deepEqual(result.written.map((w) => w.name), ["loa", "dien", "attendance"]);
    assert.deepEqual(Object.keys(result.counts), ["loa", "dien", "attendance"]);
});

test("the output folder and the overrides come from the set", async () => {
    const asked: string[] = [];
    const { deps } = setup([], { outDirFor: (day, setId) => (asked.push(`${setId}:${day}`), fs.mkdtempSync(path.join(os.tmpdir(), "total-set-"))), readOverrides: (setId) => (asked.push(`ov:${setId}`), []) });
    await runTotalOnce({ slot: morning, now: at(9, 5), set: SET }, deps);
    assert.deepEqual(asked, [`ov:A`, `A:${DAY}`]);
});

test("tracker entries are per set: another set's file of the same slot is neither replaced nor removed", async () => {
    const { deps, removed } = setup([]);
    const loaTitle = fakeTitle("01 - FORM TINH TRANG AM THANH.xlsx", "1209");
    fs.writeFileSync(deps.trackerFile, JSON.stringify({ [totalTrackerKey("B", DAY, "morning", loaTitle)]: "B-LOA.xlsx" }));
    await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    const tracker = JSON.parse(fs.readFileSync(deps.trackerFile, "utf8")) as Record<string, string>;
    assert.equal(tracker[totalTrackerKey("B", DAY, "morning", loaTitle)], "B-LOA.xlsx");
    assert.ok(!removed.some((f) => f.endsWith("B-LOA.xlsx")));
});

test("runTotalForSets runs every set; one set throwing is a failure of that set only, and the messages are loaded once", async () => {
    const two = resolveReportSets([{ id: "A", reports: ["loa"] }, { id: "B", reports: ["mayTinh", "dien"] }]).active;
    let loads = 0;
    const calls: string[] = [];
    const { deps } = setup([msg(COMPLETE, at(7, 0))], {
        loadMessages: async () => (loads++, []),
        outDirFor: (day, setId) => {
            if (setId === "A") throw new Error("không tạo được thư mục A");
            return fs.mkdtempSync(path.join(os.tmpdir(), "total-all-"));
        },
        fill: (a) => (calls.push(a.name), ""),
    });
    const result = await runTotalForSets({ slot: morning, now: at(9, 5), sets: two }, deps);
    assert.equal(loads, 1);
    assert.deepEqual(calls, ["total-mayTinh", "total-dien"]);
    assert.deepEqual(result.failed, ["A"]);
    assert.ok(result.warnings.some((w) => w.startsWith("A: ") && w.includes("không tạo được thư mục A")), JSON.stringify(result.warnings));
    assert.deepEqual(result.written.map((w) => w.name), ["B-mayTinh", "B-dien"]);
    assert.deepEqual(Object.keys(result.counts), ["B-mayTinh", "B-dien"]);
    assert.equal(result.expected, 3);
    assert.equal(result.files.length, 2);
});

test("runTotalForSets qualifies the failed file names with the set, and the print names contain no path separators", async () => {
    const two = resolveReportSets([{ id: "Nguyễn Văn A", reports: ["loa", "mayTinh"] }]).active;
    const { deps } = setup([], { fill: (a) => { if (a.name === "total-mayTinh") throw new Error("Excel đang mở file"); return ""; } });
    const result = await runTotalForSets({ slot: morning, now: at(9, 5), sets: two }, deps);
    assert.deepEqual(result.failed, ["Nguyễn Văn A-mayTinh"]);
    assert.ok(result.written.every((w) => !/[\/:]/.test(w.name)), JSON.stringify(result.written.map((w) => w.name)));
});

test("a missing template (its title cannot be read) fails only that file: the others are still written and the tracker keeps what was written", async () => {
    const { deps, calls } = setup([], {
        templateTitle: (p, s) => {
            if (p.includes("AM THANH")) throw new Error(`ENOENT: no such file or directory, open '${p}'`);
            return fakeTitle(p, s);
        },
    });
    const result = await runTotalOnce({ slot: morning, now: at(9, 7), set: SET }, deps);
    assert.deepEqual(result.failed, ["loa"]);
    assert.equal(result.files.length, 6);
    assert.ok(!calls.some((c) => c.name === "total-loa"));
    assert.ok(result.warnings.some((w) => w.startsWith("loa:") && w.includes("ENOENT")), JSON.stringify(result.warnings));
    const tracker = JSON.parse(fs.readFileSync(deps.trackerFile, "utf8")) as Record<string, string>;
    assert.equal(Object.keys(tracker).length, 6); // the 6 files that were written are tracked, so their old versions can be replaced next time
});
