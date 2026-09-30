import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTitle, computerGrade, parseCount, parseGrade, parseLines, parseNote, parseRoom } from "../src/lesson/parseReport.js";

test("classifyTitle", () => {
    assert.equal(classifyTitle("BÁO CÁO ĐẦU BUỔI DẠY\n- Tên Giáo Viên: A"), "DauBuoi");
    assert.equal(classifyTitle("báo cáo cuối buổi dạy"), "CuoiBuoi");
    assert.equal(classifyTitle("BAO CAO DAU BUOI DAY"), "DauBuoi");
    assert.equal(classifyTitle("BÁO CÁO CHUYÊN MÔN\n- Lớp: 9A"), null);
    assert.equal(classifyTitle("BÁO CÁO CHUYÊN MÔN 2"), null);
    assert.equal(classifyTitle("test báo cáo"), null);
    assert.equal(classifyTitle(""), null);
    assert.equal(classifyTitle("Xin gửi\nbáo cáo đầu buổi hôm nay"), "gan_giong");
    // Tiêu đề vệ sinh phòng máy (không có "DẠY") không được lẫn vào báo cáo trường học: rơi vào "gan_giong"
    // (đã có sẵn — đi vào review.json để người xem, KHÔNG được coi là DauBuoi/CuoiBuoi và build thành Report).
    assert.equal(classifyTitle("BÁO CÁO CUỐI BUỔI\n- Tên trường: X"), "gan_giong");
    assert.equal(classifyTitle("BÁO CÁO ĐẦU BUỔI"), "gan_giong");
});

test("parseRoom follows the room table", () => {
    assert.deepEqual(parseRoom("PM1"), { phongMay: "PM1", coSo: null });
    assert.deepEqual(parseRoom("Phòng Lab"), { phongMay: "Lab", coSo: null });
    assert.deepEqual(parseRoom("PM1 (Trường)"), { phongMay: "PM1", coSo: null });
    assert.deepEqual(parseRoom("PM2 (Phòng 42 của trường)"), { phongMay: "PM2", coSo: null });
    assert.deepEqual(parseRoom(""), { phongMay: "", coSo: null });
    assert.deepEqual(parseRoom(undefined), { phongMay: null, coSo: null });
    assert.deepEqual(parseRoom("PM1 - CS2"), { phongMay: "PM1", coSo: "CS2" });
    assert.deepEqual(parseRoom("CS2"), { phongMay: "PM1", coSo: "CS2" });
    assert.deepEqual(parseRoom("H002"), { phongMay: "H002", coSo: null });
    assert.deepEqual(parseRoom("Học tại lớp"), { phongMay: "Học tại lớp", coSo: null });
});

test("parseGrade", () => {
    assert.equal(parseGrade("T"), "T");
    assert.equal(parseGrade("k"), "K");
    assert.equal(parseGrade(""), "");
    assert.equal(parseGrade("Ổn định"), "Ổn định");
    assert.equal(parseGrade(undefined), null);
});

test("parseCount and parseNote", () => {
    assert.equal(parseCount("0"), 0);
    assert.equal(parseCount("3(máy 35 lỗi)"), 3);
    assert.equal(parseCount("4 (máy 23)"), 4);
    assert.equal(parseCount("IT bảo trì"), null);
    assert.equal(parseCount(""), null);
    assert.equal(parseCount(undefined), null);
    assert.equal(parseNote("0"), null);
    assert.equal(parseNote("0 ()"), "");
    assert.equal(parseNote("4 (máy 23, 31, 33, 34 không lên nguồn)"), "máy 23, 31, 33, 34 không lên nguồn");
});

test("computerGrade follows the Thieu/Loi table", () => {
    const rows: Array<[number | null, number | null, string | null]> = [
        [0, 0, "A"], [0, 1, "B"], [0, 5, "B"], [0, 6, "C"], [0, 9, "C"], [0, 10, "D"],
        [1, 0, "C"], [1, 1, "C"], [1, 7, "C"], [1, 10, "D"],
        [null, 10, null], [3, null, null], [null, null, null],
    ];
    for (const [t, l, g] of rows) assert.equal(computerGrade(t, l), g, `thieu=${t} loi=${l}`);
});

test("parseLines tolerates prefix, spacing and case, and ignores known extra lines", () => {
    const content = [
        "BÁO CÁO CUỐI BUỔI DẠY",
        "- Tên giáo viên: V.Minh",
        "- Tên trợ giảng: Không",
        "  Phòng máy: PM1",
        " Tổng số máy: 36 ",
        " Tổng số máy bị lỗi:  5",
        " Số máy còn thiếu cho HS: 0",
        " Tình trạng Netsupport: T",
        "- Tình trạng Internet:T",
        " Tình trạng loa, âm ly: B",
        " Tình trạng máy lạnh, máy quạt: B",
        " Vệ sinh phòng máy: S",
        " Đã tắt các thiết bị điện chưa: Đ",
    ].join("\n");
    const { values, unknownLabels } = parseLines(content);
    assert.deepEqual(values, { giaoVien: "V.Minh", phongMay: "PM1", loi: "5", thieu: "0", netSupport: "T", internet: "T", amThanh: "B", mayLanh: "B" });
    assert.deepEqual(unknownLabels, []);
});

test("parseLines reports an unknown label that looks like a wanted line", () => {
    const { unknownLabels } = parseLines("BÁO CÁO ĐẦU BUỔI DẠY\n- Tình trạng máy chiếu: T\n- Ghi chú khác: x");
    assert.deepEqual(unknownLabels, ["Tình trạng máy chiếu"]);
});

test("labels survive CRLF, non-breaking spaces and missing diacritics", () => {
    const content = "BÁO CÁO ĐẦU BUỔI DẠY\r\n- Ten giao vien: Ba\r\n- Tình trạng Internet: T\r\n- PHÒNG MÁY: PM3\r\n";
    const { values } = parseLines(content);
    assert.deepEqual(values, { giaoVien: "Ba", internet: "T", phongMay: "PM3" });
});
