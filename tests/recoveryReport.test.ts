import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRecovery } from "../src/lesson/recoveryReport.js";
import { sessionWindow } from "../src/lesson/recovery.js";
import type { RecoveryResult } from "../src/lesson/recoveryRun.js";
import { at, DAY } from "./fixtures.js";

const base = (over: Partial<RecoveryResult>): RecoveryResult => ({
    status: "recovered",
    day: DAY,
    buoi: "sang",
    window: sessionWindow(DAY, "sang"),
    gaps: [{ from: at(8), to: at(9, 30), reason: "crash" }],
    candidates: [],
    sinceTs: at(8) - 300_000,
    recovered: [],
    stillMissing: [],
    errors: [],
    ...over,
});
const text = (r: RecoveryResult) => formatRecovery(r).join("\n");

test("no gap: says recovery is not needed and mentions nothing else", () => {
    const t = text(base({ status: "no-gap", gaps: [] }));
    assert.match(t, /ngày 2026-09-24, buổi sang/);
    assert.match(t, /không có khoảng gián đoạn/);
    assert.match(t, /không cần khôi phục/);
});

test("gaps are listed with their times and a plain-language reason", () => {
    const t = text(base({ status: "nothing-missing", gaps: [{ from: at(8), to: at(9, 30), reason: "crash" }, { from: at(11), to: null, reason: "blind" }] }));
    assert.match(t, /08:00 → 09:30 \(chết đột ngột\)/);
    assert.match(t, /11:00 → đang diễn ra \(mất nguồn phát hiện WebSocket\)/);
    assert.match(t, /mọi nhóm đều đã đủ báo cáo/);
});

test("dry run shows which groups would be re-scraped and from when", () => {
    const t = text(base({ status: "dry-run", candidates: [{ target: "A", missing: ["DauBuoi", "CuoiBuoi"] }, { target: "B", missing: ["CuoiBuoi"] }] }));
    assert.match(t, /chạy thử/);
    assert.match(t, /từ 07:55/);
    assert.match(t, /A \(thiếu: đầu buổi, cuối buổi\)/);
    assert.match(t, /B \(thiếu: cuối buổi\)/);
});

test("a recovery lists the messages it brought back and what is still missing", () => {
    const t = text(
        base({
            candidates: [{ target: "B", missing: ["CuoiBuoi"] }],
            recovered: [{ groupName: "B", msgId: "m1", ts: at(11, 5), kind: "CuoiBuoi", preview: "BÁO CÁO CUỐI BUỔI DẠY" }, { groupName: "B", msgId: "m2", ts: at(11, 6), kind: null, preview: "cảm ơn" }],
            stillMissing: [{ target: "C", missing: ["DauBuoi", "CuoiBuoi"] }],
            errors: [{ target: "D", error: "sidebar item not found" }],
        }),
    );
    assert.match(t, /tin nhắn bị lỡ đã khôi phục \(2\)/);
    assert.match(t, /11:05 {2}B .*\[cuối buổi\] BÁO CÁO CUỐI BUỔI DẠY/);
    assert.match(t, /11:06 {2}B .*cảm ơn/);
    assert.match(t, /vẫn thiếu báo cáo.*\n.*C \(thiếu: đầu buổi, cuối buổi\)/);
    assert.match(t, /lỗi khi cào.*\n.*D: sidebar item not found/);
});

test("a recovery that brought nothing back says so", () => {
    const t = text(base({ candidates: [{ target: "B", missing: ["CuoiBuoi"] }] }));
    assert.match(t, /không tìm thấy tin nhắn nào bị lỡ/);
});

test("a recovered message with no text (a photo) is shown with a placeholder, not a blank line", () => {
    const t = text(base({ candidates: [{ target: "B", missing: ["CuoiBuoi"] }], recovered: [{ groupName: "B", msgId: "m3", ts: at(11, 7), kind: null, preview: "" }] }));
    assert.match(t, /11:07 {2}B — \(không có chữ, có thể là ảnh\)/);
});
