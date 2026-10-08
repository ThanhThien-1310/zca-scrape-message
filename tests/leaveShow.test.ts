import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLeaveDay } from "../src/leave/show.js";
import type { LeaveDay } from "../src/leave/buildDay.js";

const empty = (): LeaveDay => ({ headerCells: [], filled: [], unmatched: [], notes: [], pending: [], warnings: [], signature: "s" });

test("nothing to fill says so plainly", () => {
    assert.deepEqual(formatLeaveDay("2026-10-07", empty()), ["Ngày 2026-10-07: không có kỳ nghỉ nào còn hiệu lực để điền."]);
});

test("filled rows, names missing from the roster, rows waiting for review, notes and warnings are all listed", () => {
    const d: LeaveDay = {
        ...empty(),
        filled: [{ row: 4, name: "Huỳnh Hữu Đức", ngay: "08/10/2026", buoi: "Cả ngày" }, { row: 6, name: "Đinh Đình Chinh", ngay: "08/10/2026 - 10/10/2026", buoi: "Chiều - Cả ngày" }],
        unmatched: [{ hoTen: "Đinh Chinh", ngay: "08/10/2026", suggestions: ["Đinh Đình Chinh"], bundleId: "b1", rowIndex: 2 }],
        pending: [{ bundleId: "b2", rowIndex: 0, sentTs: 1, hoTen: "Chờ Xem", reasons: ["ngày bắt đầu không đọc được"] }],
        notes: ["ảnh mới thay kỳ nghỉ cũ"],
        warnings: ["1 bộ ảnh nghỉ phép chưa đọc"],
    };
    const text = formatLeaveDay("2026-10-07", d).join("\n");
    assert.match(text, /2 dòng sẽ được điền/);
    assert.match(text, /dòng 4 Huỳnh Hữu Đức: NGÀY 08\/10\/2026 \| BUỔI Cả ngày/);
    assert.match(text, /dòng 6 Đinh Đình Chinh: NGÀY 08\/10\/2026 - 10\/10\/2026 \| BUỔI Chiều - Cả ngày/);
    assert.match(text, /Chưa khớp danh sách.*Đinh Chinh.*gần giống: Đinh Đình Chinh.*bộ b1, dòng 2/s);
    assert.match(text, /Đang chờ xem.*Chờ Xem.*ngày bắt đầu không đọc được/s);
    assert.match(text, /ảnh mới thay kỳ nghỉ cũ/);
    assert.match(text, /1 bộ ảnh nghỉ phép chưa đọc/);
});
