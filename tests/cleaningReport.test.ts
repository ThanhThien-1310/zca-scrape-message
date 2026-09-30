import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCleaningTitle, cleaningReportDay, parseCleaningMessage } from "../src/lesson/cleaningReport.js";

test("classifyCleaningTitle only matches the exact title, not the school-report one", () => {
    assert.equal(classifyCleaningTitle("BÁO CÁO CUỐI BUỔI\n- Tên trường: X"), true);
    assert.equal(classifyCleaningTitle("báo cáo cuối buổi"), true);
    assert.equal(classifyCleaningTitle("BÁO CÁO CUỐI BUỔI DẠY\n- Tên Giáo Viên: A"), false);
    assert.equal(classifyCleaningTitle("BÁO CÁO ĐẦU BUỔI"), false);
    assert.equal(classifyCleaningTitle(""), false);
});

test("cleaningReportDay: lùi 1 ngày, riêng Thứ 2 lùi 2 ngày (lấy Thứ 7)", () => {
    // 2026-09-30 là Thứ 4 -> báo cáo của Thứ 3 (2026-09-29).
    assert.equal(cleaningReportDay(Date.UTC(2026, 8, 30, 3, 0)), "2026-09-29"); // 10:00 giờ VN
    // 2026-10-05 là Thứ 2 -> báo cáo của Thứ 7 tuần trước (2026-10-03).
    assert.equal(cleaningReportDay(Date.UTC(2026, 9, 5, 3, 0)), "2026-10-03");
});

const REAL_ONE_ROOM = `BÁO CÁO CUỐI BUỔI
- Tên trường: THCS Tân Đông Hiệp - DA
- Tổng số PM: 4 (PM1, PM2 Cty, PM3, PM4 trường)
- Tên IT: Quyền

- Phòng máy: Tin Học (PM2 kế cận tin)
- Tổng số máy: 51 (tính cả máy GV)
- Netsupport: Có
- Internet: Có
- Vệ sinh sạch sẽ: có`;

test("parseCleaningMessage parses a real single-room message", () => {
    const result = parseCleaningMessage(REAL_ONE_ROOM);
    assert.deepEqual(result, [{ tenTruong: "THCS Tân Đông Hiệp", khuVuc: "DA", phongMay: "Tin Học (PM2 kế cận tin)", tenIT: "Quyền", veSinhSach: true }]);
});

test("parseCleaningMessage: 'Vệ sinh sạch sẽ: Không' -> veSinhSach false", () => {
    const msg = REAL_ONE_ROOM.replace("Vệ sinh sạch sẽ: có", "Vệ sinh sạch sẽ: Không");
    assert.equal(parseCleaningMessage(msg)[0].veSinhSach, false);
});

test("parseCleaningMessage: một tin báo NHIỀU phòng ra nhiều dòng, không chỉ lấy khối cuối", () => {
    const multi = `BÁO CÁO CUỐI BUỔI
- Tên trường: TH An Phú Tây 2 - BC
- Tổng số PM: 2
- Tên IT: N.N.Minh

- Phòng máy: PM1
- Vệ sinh sạch sẽ: Không

- Phòng máy: PM2
- Vệ sinh sạch sẽ: Có`;
    const result = parseCleaningMessage(multi);
    assert.deepEqual(result, [
        { tenTruong: "TH An Phú Tây 2", khuVuc: "BC", phongMay: "PM1", tenIT: "N.N.Minh", veSinhSach: false },
        { tenTruong: "TH An Phú Tây 2", khuVuc: "BC", phongMay: "PM2", tenIT: "N.N.Minh", veSinhSach: true },
    ]);
});

test("parseCleaningMessage: khối phòng máy thiếu dòng 'Vệ sinh sạch sẽ' bị bỏ qua", () => {
    const msg = `BÁO CÁO CUỐI BUỔI
- Tên trường: X - BC
- Tên IT: A

- Phòng máy: PM1
- Netsupport: Có`;
    assert.deepEqual(parseCleaningMessage(msg), []);
});

test("parseCleaningMessage: tin không có 'Tên trường' không ra kết quả nào", () => {
    const msg = `BÁO CÁO CUỐI BUỔI
- Phòng máy: PM1
- Vệ sinh sạch sẽ: Có`;
    assert.deepEqual(parseCleaningMessage(msg), []);
});
