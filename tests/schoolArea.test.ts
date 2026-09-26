import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGroupName } from "../lesson/schoolArea.js";

const cases: Array<[string, string | null, string | null, string | null, string | null]> = [
    // input, capHoc, tenRieng, coSo, khuVuc  (tenRieng null => truong null)
    ["THPT Trần Văn Ơn", "THPT", "TRẦN VĂN ƠN", null, null],
    ["BC", null, null, null, "BC"],
    ["", null, null, null, null],
    ["TH Đặng Văn Bất_Thủ Đức.", "TH", "ĐẶNG VĂN BẤT", null, "TĐ"],
    ["TH Cầu Xáng TĐ", "TH", "CẦU XÁNG", null, "TĐ"],
    ["Nhà VHTH - Bình Dương", null, "NHÀ VHTH", null, "BD"],
    ["THCS Nguyễn Bỉnh Khiêm-CS2 NB", "THCS", "NGUYỄN BỈNH KHIÊM", "CS2", "NB"],
    ["TH Bình Trị 2 cs1 - Bình Tân", "TH", "BÌNH TRỊ 2", "CS1", "BTAN"],
    ["THCS-THPT Nam Việt - Q9", "THCS - THPT", "NAM VIỆT", null, "TĐ"],
    ["LC_QuangTrungNguyễnHuệ_PN", "LC", "QUANG TRUNG NGUYỄN HUỆ", null, "PN"],
    ["Tiểu học Cổ Loa - PN", "TH", "CỔ LOA", null, "PN"],
    ["LC_HoaSen1_TĐ", "LC", "HOA SEN 1", null, "TĐ"],
    ["LC_TríTuệViệt_BTAN", "LC", "TRÍ TUỆ VIỆT", null, "BTAN"],
    ["LC_ChuVănAn_BTAN", "LC", "CHU VĂN AN", null, "BTAN"],
    ["LC_QuangTrungNguyễnHuệ_Q5", "LC", "QUANG TRUNG NGUYỄN HUỆ", null, "Q5"],
    ["bot test", null, "BOT TEST", null, null],
];

for (const [input, capHoc, tenRieng, coSo, khuVuc] of cases) {
    test(`parseGroupName(${JSON.stringify(input)})`, () => {
        const r = parseGroupName(input);
        assert.equal(r.khuVuc, khuVuc);
        if (tenRieng === null) assert.equal(r.truong, null);
        else assert.deepEqual(r.truong, { capHoc, tenRieng, coSo });
    });
}
