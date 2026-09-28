import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyStreaks, readStreaks, streakKey, writeStreaks, type StreakState } from "../src/lesson/faultStreaks.js";
import type { CoSoVatChat, Report } from "../src/types/index.js";

const facility = (loai: CoSoVatChat["loai"], xepLoai: string | null): CoSoVatChat => ({ loai, xepLoai });

function report(over: { maTinNhan: string; thoiGian: number; maNhom?: string; phongMay?: string | null }, facilities: CoSoVatChat[]): Report {
    return {
        maTinNhan: over.maTinNhan,
        maNguoiGui: "u1",
        maNhom: over.maNhom ?? "g1",
        thoiGian: over.thoiGian,
        loaiBaoCao: "DauBuoi",
        data: {
            maTrangThai: 1,
            maPhong: null,
            truong: { capHoc: "LC", tenRieng: "X", coSo: null },
            khuVuc: "TĐ",
            phongMay: over.phongMay === undefined ? "PM1" : over.phongMay,
            giaoVien: "GV",
            coSoVatChat: facilities,
        },
    };
}

test("a room reported K twice in a row reaches count 2, then a T report resets it to 0", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const r2 = report({ maTinNhan: "m2", thoiGian: 2000 }, [facility("Internet", "K")]);
    const r3 = report({ maTinNhan: "m3", thoiGian: 3000 }, [facility("Internet", "T")]);

    const a = applyStreaks({}, [r1]);
    assert.equal(a.perMessage.get("m1|internet"), 1);
    const b = applyStreaks(a.state, [r2]);
    assert.equal(b.perMessage.get("m2|internet"), 2);
    const c = applyStreaks(b.state, [r3]);
    assert.equal(c.perMessage.get("m3|internet"), 0);
});

test("a report with a K reported on a later timestamp still increments even out of array order", () => {
    const early = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const late = report({ maTinNhan: "m2", thoiGian: 2000 }, [facility("Internet", "K")]);
    const r = applyStreaks({}, [late, early]);
    assert.equal(r.perMessage.get("m1|internet"), 1);
    assert.equal(r.perMessage.get("m2|internet"), 2);
});

test("a report with xepLoai null for that category is skipped: the streak is untouched", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const r2 = report({ maTinNhan: "m2", thoiGian: 2000 }, [facility("Internet", null)]);
    const a = applyStreaks({}, [r1]);
    const b = applyStreaks(a.state, [r2]);
    assert.equal(b.perMessage.has("m2|internet"), false);
    assert.equal(b.state[streakKey("g1", "PM1", "internet")].count, 1);
});

test("a report with no phongMay never touches the streak", () => {
    const r = report({ maTinNhan: "m1", thoiGian: 1000, phongMay: null }, [facility("Internet", "K")]);
    const a = applyStreaks({}, [r]);
    assert.equal(a.perMessage.size, 0);
    assert.deepEqual(a.state, {});
});

test("re-running with the exact same report (same msgId) does not double-count", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K")]);
    const first = applyStreaks({}, [r1]);
    assert.equal(first.perMessage.get("m1|internet"), 1);
    const again = applyStreaks(first.state, [r1]);
    assert.equal(again.perMessage.get("m1|internet"), 1);
    assert.deepEqual(again.state, first.state);
});

test("internet and netsupport streaks for the same room are independent", () => {
    const r = report({ maTinNhan: "m1", thoiGian: 1000 }, [facility("Internet", "K"), facility("NetSupport", "T")]);
    const a = applyStreaks({}, [r]);
    assert.equal(a.perMessage.get("m1|internet"), 1);
    assert.equal(a.perMessage.get("m1|netsupport"), 0);
});

test("two different rooms of the same group get separate streaks", () => {
    const r1 = report({ maTinNhan: "m1", thoiGian: 1000, phongMay: "PM1" }, [facility("Internet", "K")]);
    const r2 = report({ maTinNhan: "m2", thoiGian: 1000, phongMay: "PM2" }, [facility("Internet", "K")]);
    const a = applyStreaks({}, [r1, r2]);
    assert.equal(a.perMessage.get("m1|internet"), 1);
    assert.equal(a.perMessage.get("m2|internet"), 1);
    assert.equal(Object.keys(a.state).length, 2);
});

test("streakKey ignores case and surrounding whitespace in the room name", () => {
    assert.equal(streakKey("g1", "pm1", "internet"), streakKey("g1", " PM1 ", "internet"));
});

test("readStreaks/writeStreaks round-trip through a real file, and a missing file reads as empty", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "streaks-")), "s.json");
    assert.deepEqual(readStreaks(file), {});
    const state: StreakState = { "g1|PM1|internet": { count: 3, lastMsgId: "m1", lastTs: 1000 } };
    writeStreaks(state, file);
    assert.deepEqual(readStreaks(file), state);
});
