import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAll } from "../src/lesson/extract.js";
import { roomKeyString } from "../src/lesson/roomKey.js";
import { at, COLLEGE_ROOM, COMPLETE, DAY, FAULTY_WITH_NOTE, IT_MAINTENANCE, msg, NO_INTERNET_LINE, SPECIALIST, YESTERDAY } from "./fixtures.js";
import type { RoomLookup } from "../src/types/index.js";

// Room "1" of HOA SEN 1 exists as Room.Id 399; everything else is unknown.
const lookup: RoomLookup = async (keys) =>
    new Map(keys.map((k) => [roomKeyString(k), k.room === "1" && k.tenRieng === "HOA SEN 1" && k.khuVuc === "TĐ" ? 399 : null]));

test("a complete start report is extracted with status 1 and its room id", async () => {
    const m = msg(COMPLETE, at(8));
    const r = await extractAll([m], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports.length, 1);
    const rep = r.reports[0];
    assert.equal(rep.maTinNhan, m.msgId);
    assert.equal(rep.loaiBaoCao, "DauBuoi");
    assert.equal(rep.data.maTrangThai, 1);
    assert.equal(rep.data.maPhong, 399);
    assert.deepEqual(rep.data.truong, { capHoc: "LC", tenRieng: "HOA SEN 1", coSo: null });
    assert.equal(rep.data.khuVuc, "TĐ");
    assert.equal(rep.data.phongMay, "PM1");
    assert.equal(rep.data.giaoVien, "Nguyễn Văn A");
    assert.deepEqual(
        rep.data.coSoVatChat.map((f) => [f.loai, f.xepLoai]),
        [["AmThanh", "B"], ["NetSupport", "T"], ["MayLanh", "K"], ["Internet", "T"], ["MayTinh", "A"]],
    );
    assert.deepEqual(rep.data.coSoVatChat[4].soLuong, [{ loai: "Thieu", so: 0 }, { loai: "Loi", so: 0, ghiChu: null }]);
    assert.deepEqual(r.marks, [{ maNhom: "g1", maTinNhan: m.msgId, maTrangThai: 1 }]);
    assert.equal(r.review.length, 0);
});

test("non-numeric fault count gives status 2 and a review item", async () => {
    const m = msg(IT_MAINTENANCE, at(11));
    const r = await extractAll([m], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports[0].loaiBaoCao, "CuoiBuoi");
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.equal(r.reports[0].data.coSoVatChat[4].xepLoai, null);
    assert.deepEqual(r.review.map((x) => x.lyDo), [["so_khong_hop_le"]]);
    assert.deepEqual(r.review[0].truongCanXem, ["loi"]);
    assert.equal(r.review[0].raw, IT_MAINTENANCE);
});

test("a missing wanted line gives status 2 and a review item naming the line", async () => {
    const r = await extractAll([msg(NO_INTERNET_LINE, at(8))], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.equal(r.reports[0].data.coSoVatChat[3].xepLoai, null);
    assert.deepEqual(r.review[0].lyDo, ["thieu_dong"]);
    assert.deepEqual(r.review[0].truongCanXem, ["internet"]);
});

test("a room that is not in the database gives status 2 and phong_khong_tim_thay", async () => {
    const r = await extractAll([msg(COLLEGE_ROOM, at(8))], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports[0].data.maPhong, null);
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.deepEqual(r.review[0].lyDo, ["phong_khong_tim_thay"]);
});

test("without a lookup the room id stays null and is not an error", async () => {
    const r = await extractAll([msg(COMPLETE, at(8))], { day: DAY });
    assert.equal(r.reports[0].data.maPhong, null);
    assert.equal(r.reports[0].data.maTrangThai, 1);
    assert.equal(r.review.length, 0);
});

test("fault note in parentheses is kept", async () => {
    const r = await extractAll([msg(FAULTY_WITH_NOTE, at(8))], { day: DAY, lookupRoomIds: lookup });
    const mayTinh = r.reports[0].data.coSoVatChat[4];
    assert.equal(mayTinh.xepLoai, "B");
    assert.deepEqual(mayTinh.soLuong?.[1], { loai: "Loi", so: 3, ghiChu: "máy 35 không lên; máy 41 hỏng màn hình" });
});

test("other messages are marked -1 and never enter the reports", async () => {
    const photo = msg("", at(8), { msgType: "chat.photo" });
    const specialist = msg(SPECIALIST, at(9));
    const chatter = msg("test báo cáo", at(10));
    const r = await extractAll([photo, specialist, chatter], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports.length, 0);
    assert.deepEqual(r.marks.map((x) => x.maTrangThai), [-1, -1, -1]);
    assert.equal(r.review.length, 0);
});

test("a near-miss title is marked -1 and sent to review", async () => {
    const m = msg("Xin gửi\nbáo cáo đầu buổi hôm nay", at(8));
    const r = await extractAll([m], { day: DAY, lookupRoomIds: lookup });
    assert.deepEqual(r.marks, [{ maNhom: "g1", maTinNhan: m.msgId, maTrangThai: -1 }]);
    assert.deepEqual(r.review.map((x) => x.lyDo), [["gan_giong_tieu_de"]]);
    assert.equal(r.review[0].draft, null);
});

test("only messages of the requested Vietnam day are considered", async () => {
    const old = msg(COMPLETE, YESTERDAY);
    const r = await extractAll([old, msg(COMPLETE, at(8))], { day: DAY, lookupRoomIds: lookup });
    assert.equal(r.reports.length, 1);
    assert.equal(r.summary.xet, 1);
});

test("overrides correct raw fields and the derived values are recomputed", async () => {
    const m = msg(IT_MAINTENANCE, at(11));
    const r = await extractAll([m], {
        day: DAY,
        lookupRoomIds: lookup,
        overrides: [{ key: { maNhom: "g1", maTinNhan: m.msgId }, sua: { loi: 7, ghiChuLoi: "IT đang sửa" } }],
    });
    const mayTinh = r.reports[0].data.coSoVatChat[4];
    assert.equal(mayTinh.xepLoai, "C");
    assert.deepEqual(mayTinh.soLuong?.[1], { loai: "Loi", so: 7, ghiChu: "IT đang sửa" });
    assert.equal(r.reports[0].data.maTrangThai, 1);
    assert.equal(r.review.length, 0);
});

test("an override can include a near-miss title and can drop a message; unknown keys are ignored", async () => {
    const near = msg(COMPLETE.replace("BÁO CÁO ĐẦU BUỔI DẠY", "Gửi báo cáo đầu buổi"), at(8));
    const drop = msg(COMPLETE, at(9));
    const r = await extractAll([near, drop], {
        day: DAY,
        lookupRoomIds: lookup,
        overrides: [
            { key: { maNhom: "g1", maTinNhan: near.msgId }, sua: { loaiBaoCao: "DauBuoi" } },
            { key: { maNhom: "g1", maTinNhan: drop.msgId }, sua: { loaiBo: true } },
            { key: { maNhom: "gX", maTinNhan: "nope" }, sua: { loaiBo: true } },
        ],
    });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].maTinNhan, near.msgId);
    assert.deepEqual(r.marks.map((x) => x.maTrangThai), [1, -1]);
});

test("the room-line branch overrides the school branch and is part of the lookup key", async () => {
    const seen: string[] = [];
    const spy: RoomLookup = async (keys) => {
        seen.push(...keys.map(roomKeyString));
        return new Map();
    };
    await extractAll([msg(COMPLETE.replace("Phòng Máy: PM1", "Phòng Máy: PM1 - CS2"), at(8))], { day: DAY, lookupRoomIds: spy });
    assert.deepEqual(seen, ["1|LC|HOA SEN 1|CS2|TĐ"]);
});

test("a group name without an area goes to review and never crashes", async () => {
    const r = await extractAll([msg(COMPLETE, at(8), { groupName: "bot test" })], { day: DAY, lookupRoomIds: lookup, groupAliases: {} });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].data.khuVuc, null);
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.deepEqual(r.review[0].lyDo, ["truong_khong_nhan_ra"]);
    assert.deepEqual(r.review[0].truongCanXem, ["khuVuc"]);
});

test("with a session, only that session's messages are considered and marked", async () => {
    const morning = msg(COMPLETE, at(8));
    const afternoon = msg(COMPLETE, at(14));
    const evening = msg("xin chào", at(19));
    const r = await extractAll([morning, afternoon, evening], { day: DAY, buoi: "morningstart", lookupRoomIds: lookup });
    assert.deepEqual(r.reports.map((x) => x.maTinNhan), [morning.msgId]);
    assert.deepEqual(r.marks.map((x) => x.maTinNhan), [morning.msgId]);
    assert.equal(r.summary.xet, 1);
});

test("the morningend/afternoonstart boundary is 12:30 Vietnam time (CuoiBuoi, which never reroutes)", async () => {
    const lastMorningEnd = msg(IT_MAINTENANCE, at(12, 29));
    const firstAfternoonStart = msg(IT_MAINTENANCE, at(12, 30));
    const morningend = await extractAll([lastMorningEnd, firstAfternoonStart], { day: DAY, buoi: "morningend", lookupRoomIds: lookup });
    const afternoonstart = await extractAll([lastMorningEnd, firstAfternoonStart], { day: DAY, buoi: "afternoonstart", lookupRoomIds: lookup });
    assert.deepEqual(morningend.reports.map((x) => x.maTinNhan), [lastMorningEnd.msgId]);
    assert.deepEqual(afternoonstart.reports.map((x) => x.maTinNhan), [firstAfternoonStart.msgId]);
});

test("an override whose key matches no scraped message is reported, one for another session is not", async () => {
    const morning = msg(COMPLETE, at(8));
    const afternoon = msg(COMPLETE, at(14));
    const r = await extractAll([morning, afternoon], {
        day: DAY,
        buoi: "morningstart",
        lookupRoomIds: lookup,
        overrides: [
            { key: { maNhom: "g1", maTinNhan: afternoon.msgId }, sua: { loi: 1 } },
            { key: { maNhom: "g1", maTinNhan: "typo-id" }, sua: { loi: 1 } },
        ],
    });
    assert.deepEqual(r.unknownOverrides, [{ maNhom: "g1", maTinNhan: "typo-id" }]);
});

// ---- group aliases (a test group read as a real school group) ----
const CHU_VAN_AN_PM3 = 36;
const lookupChuVanAn: RoomLookup = async (keys) =>
    new Map(keys.map((k) => [roomKeyString(k), k.room === "3" && k.tenRieng === "CHU VĂN AN" && k.khuVuc === "BTAN" ? CHU_VAN_AN_PM3 : null]));
const demoReport = () => msg(COMPLETE.replace("Phòng Máy: PM1", "Phòng Máy: PM3"), at(8), { groupId: "g9", groupName: "bot test" });

test("without an alias a report from a test group has no school, no room id, and goes to review", async () => {
    const r = await extractAll([demoReport()], { day: DAY, lookupRoomIds: lookupChuVanAn, groupAliases: {} });
    assert.equal(r.reports[0].data.maPhong, null);
    assert.equal(r.reports[0].data.maTrangThai, 2);
    assert.ok(r.review.some((x) => x.lyDo.includes("truong_khong_nhan_ra")));
});

test("with an alias the test group is read as the school group it stands for, so its report gets a room id and no review", async () => {
    const r = await extractAll([demoReport()], { day: DAY, lookupRoomIds: lookupChuVanAn, groupAliases: { "bot test": "LC_ChuVănAn_BTAN" } });
    const rep = r.reports[0];
    assert.equal(rep.data.maPhong, CHU_VAN_AN_PM3);
    assert.equal(rep.data.maTrangThai, 1);
    assert.deepEqual(rep.data.truong, { capHoc: "LC", tenRieng: "CHU VĂN AN", coSo: null });
    assert.equal(rep.data.khuVuc, "BTAN");
    assert.equal(rep.maNhom, "g9"); // the group id and name of the message itself are untouched
    assert.deepEqual(r.review, []);
});

test("an alias applies only to the group it names", async () => {
    const other = msg(COMPLETE, at(9)); // "LC_HoaSen1_TĐ"
    const r = await extractAll([demoReport(), other], { day: DAY, lookupRoomIds: lookup, groupAliases: { "bot test": "LC_ChuVănAn_BTAN" } });
    assert.equal(r.reports.find((x) => x.maTinNhan === other.msgId)?.data.maPhong, 399);
});

test("extractAll with a Phase buoi: a message sent the night before (after 17:30) for tomorrow's morningstart is included", async () => {
    const lateLastNight = msg(COMPLETE, Date.UTC(2026, 8, 23, 11, 0)); // 18:00 VN on 2026-09-23 (the day BEFORE DAY)
    const r = await extractAll([lateLastNight], { day: DAY, buoi: "morningstart" });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].maTinNhan, lateLastNight.msgId);
});

test("extractAll with a Phase buoi: a late DauBuoi report (after 9h) lands in afternoonstart, not morningend", async () => {
    const late = msg(COMPLETE, at(9, 48));
    const inMorningEnd = await extractAll([late], { day: DAY, buoi: "morningend" });
    assert.equal(inMorningEnd.reports.length, 0);
    const inAfternoonStart = await extractAll([late], { day: DAY, buoi: "afternoonstart" });
    assert.equal(inAfternoonStart.reports.length, 1);
});

test("extractAll with a Phase buoi: a late DauBuoi report rerouted away from morningend leaves NO mark there either (not just no report)", async () => {
    const late = msg(COMPLETE, at(9, 48));
    const inMorningEnd = await extractAll([late], { day: DAY, buoi: "morningend" });
    assert.equal(inMorningEnd.reports.length, 0);
    assert.deepEqual(inMorningEnd.marks, []);
    assert.equal(inMorningEnd.summary.xet, 0);
});

test("extractAll with a Phase buoi: a CuoiBuoi report sent before 9h stays in morningstart, not corrected", async () => {
    const cuoiBuoiEarly = msg(COMPLETE.replace("BÁO CÁO ĐẦU BUỔI DẠY", "BÁO CÁO CUỐI BUỔI DẠY"), at(3));
    const r = await extractAll([cuoiBuoiEarly], { day: DAY, buoi: "morningstart" });
    assert.equal(r.reports.length, 1);
    assert.equal(r.reports[0].loaiBaoCao, "CuoiBuoi");
});

test("extractAll with a Phase buoi: a skipped (-1) message with no loaiBaoCao is counted by raw phase/day, not lost", async () => {
    const photo = msg(COMPLETE, at(10), { msgType: "desktop.image" });
    const r = await extractAll([photo], { day: DAY, buoi: "morningend" }); // 10h -> raw phaseOf = morningend
    assert.equal(r.summary.xet, 1);
    assert.equal(r.marks.length, 1);
    assert.equal(r.marks[0].maTrangThai, -1);
    const wrongPhase = await extractAll([photo], { day: DAY, buoi: "afternoonstart" });
    assert.equal(wrongPhase.summary.xet, 0);
});

test("extractAll without buoi (undefined) still returns every report of the day, unaffected by Phase filtering", async () => {
    const m = msg(COMPLETE, at(9, 48));
    const r = await extractAll([m], { day: DAY });
    assert.equal(r.reports.length, 1);
});
