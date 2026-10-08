import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { forgetToday, targetsToScrape, toRunResult, todaySessions } from "../src/runner/todayPlan.js";
import { messageKey } from "../src/lesson/recovery.js";
import { at, COMPLETE, DAY, IT_MAINTENANCE, msg, YESTERDAY } from "./fixtures.js";

const keyOf = (m: ReturnType<typeof msg>): string => messageKey(m);

test("targetsToScrape: every configured group except the chat-only ones, in the configured order", () => {
    assert.deepEqual(targetsToScrape(["A", "B", "C", "D"], new Set(["B", "D"])), ["A", "C"]);
    assert.deepEqual(targetsToScrape(["A", "B"], new Set()), ["A", "B"]);
    assert.deepEqual(targetsToScrape([], new Set(["B"])), []);
});

test("todaySessions: only the phases of TODAY that have a start/end report; yesterday, tomorrow's evening reports and non-reports are left out", () => {
    const morningStart = msg(COMPLETE, at(7, 0)); // đầu buổi sáng
    const morningEnd = msg(IT_MAINTENANCE, at(11, 0)); // cuối buổi sáng
    const yesterday = msg(COMPLETE, YESTERDAY);
    const tonight = msg(COMPLETE, at(18, 0)); // sau 17:30: thuộc morningstart của NGÀY MAI
    const chat = msg("ok anh", at(8, 0));
    const sessions = todaySessions([morningStart, morningEnd, yesterday, tonight, chat], DAY);
    assert.deepEqual(sessions, [{ day: DAY, buoi: "morningstart" }, { day: DAY, buoi: "morningend" }]);
    assert.deepEqual(todaySessions([], DAY), []);
});

test("forgetToday: removes today's report keys from the chosen sets only, keeps older keys, and never mutates the map it was given", () => {
    const todayReport = msg(COMPLETE, at(7, 0));
    const todayEnd = msg(IT_MAINTENANCE, at(11, 0));
    const olderReport = msg(COMPLETE, YESTERDAY);
    const messages = [todayReport, todayEnd, olderReport];
    const all = (): Set<string> => new Set(messages.map(keyOf));
    const built = new Map([["A", all()], ["B", all()]]);

    const { built: after, forgotten } = forgetToday(built, messages, DAY, ["A"]);
    assert.deepEqual([...after.get("A")!], [keyOf(olderReport)]);
    assert.deepEqual([...after.get("B")!].sort(), [...all()].sort());
    assert.equal(forgotten, 2);
    assert.deepEqual([...built.get("A")!].sort(), [...all()].sort()); // bản gốc không bị sửa
});

test("forgetToday: a set that has no entry yet is left alone, and nothing today means nothing forgotten", () => {
    const old = msg(COMPLETE, YESTERDAY);
    const built = new Map([["A", new Set([keyOf(old)])]]);
    assert.equal(forgetToday(built, [old], DAY, ["A", "Z"]).forgotten, 0);
    assert.deepEqual([...forgetToday(built, [old], DAY, ["A", "Z"]).built.get("A")!], [keyOf(old)]);
    assert.equal(forgetToday(built, [old], DAY, ["A", "Z"]).built.has("Z"), false);
});

test("toRunResult: a scrape of every group in one go becomes the queue-run shape; groups with an error are listed as failed", () => {
    const result = toRunResult(["A", "B", "C"], [{ target: "A", ms: 1000, scraped: 5, written: 2 }, { target: "B", error: "không mở được nhóm" }, { target: "C", ms: 900, scraped: 0, written: 0 }]);
    assert.deepEqual(result, {
        status: "done",
        targets: ["A", "B", "C"],
        failed: ["B"],
        gaveUp: [],
        outcomes: [{ target: "A", ms: 1000, scraped: 5, written: 2 }, { target: "B", error: "không mở được nhóm" }, { target: "C", ms: 900, scraped: 0, written: 0 }],
    });
    assert.deepEqual(toRunResult([], []), { status: "done", targets: [], failed: [], gaveUp: [], outcomes: [] });
});
