import { test } from "node:test";
import assert from "node:assert/strict";
import { DATA_SHEET_COLUMNS } from "../src/lesson/codes.js";
import { extractAll } from "../src/lesson/extract.js";
import { roomKeyString, type RoomLookup } from "../src/lesson/roomKey.js";
import { buildRows } from "../src/lesson/rows.js";
import { at, COMPLETE, DAY, FAULTY_WITH_NOTE, msg } from "./fixtures.js";

const col = (name: (typeof DATA_SHEET_COLUMNS)[number]) => DATA_SHEET_COLUMNS.indexOf(name);
const roomId = (id: number | null): RoomLookup => async (keys) => new Map(keys.map((k) => [roomKeyString(k), id]));

test("a report becomes one row per facility, two for the computer", async () => {
    const r = await extractAll([msg(FAULTY_WITH_NOTE, at(8, 25))], { day: DAY, lookupRoomIds: roomId(399) });
    let n = 0;
    const rows = buildRows(r.reports, () => `id-${++n}`);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.length === DATA_SHEET_COLUMNS.length));

    const first = rows[0];
    assert.equal(first[col("Id")], "id-1");
    assert.equal(first[col("TypeId")], 1);
    assert.equal(first[col("Employee")], "Nguyễn Văn A");
    assert.equal(first[col("RoomId")], 399);
    assert.equal(first[col("School")], "LC HOA SEN 1");
    assert.equal(first[col("Area")], "TĐ");
    assert.equal(first[col("Room")], "PM1");
    assert.equal(first[col("Date")], 46289);
    assert.equal(first[col("Time")], (8 * 60 + 25) / 1440);

    assert.deepEqual(rows.map((x) => x[col("FacilityTypeId")]), [4, 2, 5, 3, 1, 1]);
    assert.deepEqual(rows.map((x) => x[col("FacilityGrade")]), ["B", "T", "K", "T", "B", "B"]);
    assert.equal(rows[0][col("QuantityTypeId")], null);

    const [thieu, loi] = rows.slice(4);
    assert.equal(thieu[col("FacilityId")], loi[col("FacilityId")]);
    assert.equal(thieu[col("QuantityTypeId")], 1);
    assert.equal(thieu[col("Quantity")], 0);
    assert.equal(loi[col("QuantityTypeId")], 2);
    assert.equal(loi[col("Quantity")], 3);
    assert.equal(loi[col("QuantityNote")], "máy 35 không lên; máy 41 hỏng màn hình");
    assert.equal(new Set(rows.map((x) => x[col("FacilityId")])).size, 5);
});

test("a report without a room id is left out of the sheet", async () => {
    const r = await extractAll([msg(COMPLETE, at(8))], { day: DAY, lookupRoomIds: roomId(null) });
    assert.equal(r.reports.length, 1);
    assert.deepEqual(buildRows(r.reports), []);
});

test("an invalid grade keeps its text; a blank or missing grade becomes an empty cell", async () => {
    const invalid = await extractAll([msg(COMPLETE.replace("Tình trạng Netsupport: T", "Tình trạng Netsupport: Ổn"), at(8))], { day: DAY, lookupRoomIds: roomId(1) });
    const netSupport = buildRows(invalid.reports).find((x) => x[col("FacilityTypeId")] === 2)!;
    assert.equal(netSupport[col("FacilityGrade")], "Ổn");

    const blank = await extractAll([msg(COMPLETE.replace("Tình trạng Netsupport: T", "Tình trạng Netsupport: "), at(9))], { day: DAY, lookupRoomIds: roomId(1) });
    assert.equal(buildRows(blank.reports).find((x) => x[col("FacilityTypeId")] === 2)![col("FacilityGrade")], null);
});
