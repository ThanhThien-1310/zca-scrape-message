import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { attendanceEntriesInWindow, cleaningEntriesInWindow, latestGradedPerRoom, reportsInWindow } from "../src/total/windowReports.js";
import { slotsOfDay } from "../src/total/slots.js";
import { COMPLETE, DAY, at, msg } from "./fixtures.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

const HOURS = { windowStartHour: 6.5, morningHour: 9, afternoonHour: 15 };
const [morning, afternoon] = slotsOfDay(DAY, HOURS);
const ids = (rs: Array<{ maTinNhan: string }>): string[] => rs.map((r) => r.maTinNhan).sort();

test("reportsInWindow keeps only text report messages sent inside [from, at)", () => {
    const inside = msg(COMPLETE, at(7, 0));
    const early = msg(COMPLETE, at(6, 29));
    const atNine = msg(COMPLETE, at(9, 0));
    const chat = msg("ok anh", at(8, 0));
    const photo = msg(COMPLETE, at(8, 0), { msgType: "chat.photo" });
    const otherDay = msg(COMPLETE, at(7, 0) - 24 * 3_600_000);
    const all = [inside, early, atNine, chat, photo, otherDay];
    assert.deepEqual(ids(reportsInWindow(all, [], morning)), [inside.msgId]);
    assert.deepEqual(ids(reportsInWindow(all, [], afternoon)), [atNine.msgId, inside.msgId].sort());
});

test("reportsInWindow applies overrides: loaiBo drops a message, a phongMay correction is used", () => {
    const a = msg(COMPLETE, at(7, 0));
    const b = msg(COMPLETE, at(7, 5));
    const overrides = [
        { key: { maNhom: a.groupId, maTinNhan: a.msgId }, sua: { loaiBo: true } },
        { key: { maNhom: b.groupId, maTinNhan: b.msgId }, sua: { phongMay: "PM9" } },
    ];
    const reports = reportsInWindow([a, b], overrides, morning);
    assert.deepEqual(reports.map((r) => [r.maTinNhan, r.data.phongMay]), [[b.msgId, "PM9"]]);
});

function rep(id: string, thoiGian: number, phongMay: string | null, facilities: CoSoVatChat[], maNhom = "g1"): Report {
    return {
        maTinNhan: id, maNguoiGui: "u", maNhom, thoiGian, loaiBaoCao: "CuoiBuoi",
        data: { maTrangThai: 1, maPhong: null, truong: { capHoc: "LC", tenRieng: "X", coSo: null }, khuVuc: "K", phongMay, giaoVien: "GV", coSoVatChat: facilities },
    };
}
const graded = (g: string): CoSoVatChat[] => [{ loai: "Internet", xepLoai: g }];
const blank: CoSoVatChat[] = [{ loai: "Internet", xepLoai: "" }, { loai: "AmThanh", xepLoai: null }];

test("latestGradedPerRoom: of two graded reports of one room the LATER wins (lỗi lúc 10h, bình thường lúc 14h)", () => {
    const k = rep("k", at(10, 0), "PM1", graded("K"));
    const t = rep("t", at(14, 0), "PM1", graded("T"));
    assert.deepEqual(ids(latestGradedPerRoom([k, t])), ["t"]);
    assert.deepEqual(ids(latestGradedPerRoom([t, k])), ["t"]);
});

test("latestGradedPerRoom: a LATER report with every grade blank does not erase an earlier graded one", () => {
    const earlier = rep("earlier", at(10, 0), "PM1", graded("K"));
    const laterBlank = rep("laterBlank", at(14, 0), "PM1", blank);
    assert.deepEqual(ids(latestGradedPerRoom([earlier, laterBlank])), ["earlier"]);
    assert.deepEqual(ids(latestGradedPerRoom([laterBlank, earlier])), ["earlier"]);
});

test("latestGradedPerRoom: an earlier blank report is replaced by a later graded one, and two blank ones keep the later", () => {
    assert.deepEqual(ids(latestGradedPerRoom([rep("b", at(8, 0), "PM1", blank), rep("g", at(9, 0), "PM1", graded("T"))])), ["g"]);
    assert.deepEqual(ids(latestGradedPerRoom([rep("b1", at(8, 0), "PM1", blank), rep("b2", at(9, 0), "PM1", blank)])), ["b2"]);
});

test("latestGradedPerRoom: different rooms and groups stay apart, rooms match ignoring case and spaces, no-room reports are all kept", () => {
    const a = rep("a", at(8, 0), "PM1", graded("T"));
    const b = rep("b", at(8, 0), "PM2", graded("T"));
    const c = rep("c", at(8, 0), "PM1", graded("T"), "g2");
    const d = rep("d", at(9, 0), " pm1 ", graded("K"));
    const n1 = rep("n1", at(8, 0), null, graded("T"));
    const n2 = rep("n2", at(8, 0), null, graded("T"));
    assert.deepEqual(ids(latestGradedPerRoom([a, b, c, d, n1, n2])), ["b", "c", "d", "n1", "n2"]);
});

// Mẫu tin vệ sinh thật (giống tests/cleaningReport.test.ts).
const CLEANING = [
    "BÁO CÁO CUỐI BUỔI",
    "- Tên trường: THCS Tân Đông Hiệp - DA",
    "- Tổng số PM: 4 (PM1, PM2 Cty, PM3, PM4 trường)",
    "- Tên IT: Quyền",
    "",
    "- Phòng máy: Tin Học (PM2 kế cận tin)",
    "- Tổng số máy: 51 (tính cả máy GV)",
    "- Netsupport: Có",
    "- Internet: Có",
    "- Vệ sinh sạch sẽ: có",
].join("\n");

test("cleaningEntriesInWindow keeps cleaning reports sent inside the window only", () => {
    const inside = msg(CLEANING, at(8, 30));
    const outside = msg(CLEANING, at(6, 0));
    const school = msg(COMPLETE.replace("ĐẦU", "CUỐI"), at(8, 30));
    const entries = cleaningEntriesInWindow([inside, outside, school], morning);
    assert.deepEqual(entries.map((e) => [e.maTinNhan, e.tenTruong, e.khuVuc, e.phongMay, e.tenIT, e.veSinhSach]), [[inside.msgId, "THCS Tân Đông Hiệp", "DA", "Tin Học (PM2 kế cận tin)", "Quyền", true]]);
    assert.equal(entries[0].thoiGian, at(8, 30));
});

const ATTENDANCE = "BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: Lưu Đình Phong\n- Thời gian đến nơi: 8h25\n- Nơi làm việc: LC QUANG TRUNG NGUYỄN HUỆ Q5";

test("attendanceEntriesInWindow: the afternoon window includes the morning check-in, the morning window excludes an afternoon one", () => {
    const am = msg(ATTENDANCE, at(8, 25));
    const pm = msg(ATTENDANCE, at(14, 10));
    const junk = msg("BÁO CÁO ĐIỂM DANH\n- Tên NV IT thực tập: A", at(8, 0));
    assert.deepEqual(attendanceEntriesInWindow([am, pm, junk], morning).map((e) => e.maTinNhan), [am.msgId]);
    assert.deepEqual(attendanceEntriesInWindow([am, pm, junk], afternoon).map((e) => e.maTinNhan), [am.msgId, pm.msgId]);
    assert.deepEqual(attendanceEntriesInWindow([am], morning)[0], { maNhom: am.groupId, maTinNhan: am.msgId, thoiGian: at(8, 25), tenNV: "Lưu Đình Phong", noiLamViec: "LC QUANG TRUNG NGUYỄN HUỆ Q5" });
});

