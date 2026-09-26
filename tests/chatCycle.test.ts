import "./helpers/pinConfig.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runChatCycle, type ChatDeps } from "../src/chat/cycle.js";
import { createLimiter } from "../src/chat/limits.js";
import { parseRules } from "../src/chat/rules.js";
import type { SendHooks } from "../src/chat/send.js";
import { COMPLETE, FAULTY_WITH_NOTE } from "./fixtures.js";
import type { InboxEntry, InboxItem, SendResult } from "../src/types/index.js";

const NOW = 1_000_000;
const rules = (over: Record<string, unknown> = {}) =>
    parseRules(
        {
            version: 1,
            dryRun: false,
            limits: { maxRepliesPerMinute: 6, maxReplyDelaySeconds: 180, cooldownSecondsPerRule: 30 },
            groups: { "bot test": { rules: [{ id: "may-loi", when: { loaiBaoCao: ["DauBuoi", "CuoiBuoi"], mayLoi: true }, reply: "Đã nhận thông tin có máy lỗi." }, { id: "tu-khoa", when: { keywords: ["máy hỏng"] }, reply: "Đã nhận {senderName}." }] } },
            ...over,
        },
        ["bot test", "LC_HoaSen1_TĐ"],
    );
const item = (n: number, text: string, over: Partial<InboxEntry> = {}): InboxItem => ({ entry: { groupName: "bot test", groupId: "g1", msgId: `m${n}`, senderId: "u", senderName: "Cô Lan", ts: NOW - 5_000, text, ...over }, end: n * 100 });

function harness(items: InboxItem[], opts: { rules?: ReturnType<typeof rules>; send?: (g: string, t: string, hooks: SendHooks) => Promise<SendResult>; locked?: boolean; off?: boolean; done?: string[]; clock?: { now: number } } = {}) {
    const r = opts.rules ?? rules();
    const calls: string[] = [];
    const done = new Set(opts.done ?? []);
    let committed: number | null = null;
    const sentLedger: Array<[string, string]> = [];
    const deps: ChatDeps = {
        now: () => (opts.clock ? opts.clock.now : NOW),
        deferUntil: new Map<string, number>(),
        rules: r,
        limiter: createLimiter(r.limits),
        readNew: () => items,
        commit: (end) => void (committed = end),
        isDone: (id) => done.has(id),
        markDone: (id) => void done.add(id),
        recordSent: (g, t) => void (calls.push("ledger"), sentLedger.push([g, t])),
        withLock: async (fn) => (opts.locked ? { acquired: false } : { acquired: true, result: await fn() }),
        send:
            opts.send ??
            (async (g, t, hooks) => {
                hooks.beforeType?.();
                calls.push(`send:${g}:${t}`);
                hooks.beforeEnter?.();
                return { status: "sent" };
            }),
        off: () => !!opts.off,
        log: () => undefined,
    };
    return { deps, calls, done, sentLedger, get committed() { return committed; } };
}

test("a matching message is answered once, recorded as done, and the cursor moves past it", async () => {
    const h = harness([item(1, FAULTY_WITH_NOTE)]);
    const s = await runChatCycle(h.deps);
    assert.deepEqual(h.calls, ["ledger", "send:bot test:Đã nhận thông tin có máy lỗi."]);
    assert.equal(s.sent, 1);
    assert.ok(h.done.has("m1"));
    assert.equal(h.committed, 100);
});

test("the sent reply is written to the echo ledger BEFORE it is sent", async () => {
    const h = harness([item(1, "máy hỏng")]);
    await runChatCycle(h.deps);
    assert.equal(h.calls[0], "ledger");
    assert.deepEqual(h.sentLedger, [["bot test", "Đã nhận Cô Lan."]]);
});

test("a normal report with zero faulty machines gets no reply", async () => {
    const h = harness([item(1, COMPLETE)]);
    const s = await runChatCycle(h.deps);
    assert.deepEqual(h.calls, []);
    assert.equal(s.ignored, 1);
    assert.equal(h.committed, 100);
});

test("a message already handled (seen again after a restart) is not answered twice", async () => {
    const h = harness([item(1, FAULTY_WITH_NOTE)], { done: ["m1"] });
    await runChatCycle(h.deps);
    assert.deepEqual(h.calls, []);
});

test("a group that has no rules, and a message older than the allowed delay, are ignored", async () => {
    const h = harness([item(1, "máy hỏng", { groupName: "LC_HoaSen1_TĐ" }), item(2, "máy hỏng", { ts: NOW - 181_000 })]);
    const s = await runChatCycle(h.deps);
    assert.deepEqual(h.calls, []);
    assert.equal(s.ignored, 2);
    assert.equal(h.committed, 200);
});

test("the same rule in the same group answers only once inside the cooldown", async () => {
    const h = harness([item(1, "máy hỏng"), item(2, "máy hỏng")]);
    const s = await runChatCycle(h.deps);
    assert.equal(s.sent, 1);
    assert.equal(s.ignored, 1);
});

test("hitting the per-minute limit defers the message (it stays in the inbox) instead of dropping it", async () => {
    const r = rules({ limits: { maxRepliesPerMinute: 1, maxReplyDelaySeconds: 180, cooldownSecondsPerRule: 1 } });
    const h = harness([item(1, "máy hỏng"), item(2, FAULTY_WITH_NOTE), item(3, "máy hỏng")], { rules: r });
    const s = await runChatCycle(h.deps);
    assert.equal(s.sent, 1);
    assert.equal(s.deferred, 1);
    assert.equal(h.committed, 100); // stops before m2 so it is retried
});

test("when someone else holds the Zalo lock the message is deferred, nothing is recorded as done", async () => {
    const h = harness([item(1, "máy hỏng")], { locked: true });
    const s = await runChatCycle(h.deps);
    assert.equal(s.deferred, 1);
    assert.equal(h.done.has("m1"), false);
    assert.equal(h.committed, null);
});

test("a skipped send (draft in the composer, chat not opened) is deferred for a later cycle", async () => {
    const h = harness([item(1, "máy hỏng")], { send: async () => ({ status: "skipped", reason: "draft" }) });
    const s = await runChatCycle(h.deps);
    assert.equal(s.deferred, 1);
    assert.equal(h.done.has("m1"), false);
});

test("a failed send is marked done and not retried (an unconfirmed send may already be out)", async () => {
    const h = harness([item(1, "máy hỏng")], { send: async () => ({ status: "failed", reason: "không xác nhận được", unconfirmed: true }) });
    const s = await runChatCycle(h.deps);
    assert.equal(s.failed, 1);
    assert.ok(h.done.has("m1"));
    assert.equal(h.committed, 100);
});

test("an exception while sending becomes a failure, not a crash", async () => {
    const h = harness([item(1, "máy hỏng")], {
        send: async () => {
            throw new Error("CDP not reachable");
        },
    });
    const s = await runChatCycle(h.deps);
    assert.equal(s.failed, 1);
});

test("dry-run sends nothing, but counts as handled and respects the cooldown", async () => {
    const h = harness([item(1, "máy hỏng"), item(2, "máy hỏng")], { rules: rules({ dryRun: true }) });
    const s = await runChatCycle(h.deps);
    assert.deepEqual(h.calls, []);
    assert.equal(s.dryRun, 1);
    assert.equal(s.ignored, 1);
    assert.equal(h.committed, 200);
});

test("the kill switch stops all sending and consumes the messages", async () => {
    const h = harness([item(1, "máy hỏng")], { off: true });
    const s = await runChatCycle(h.deps);
    assert.deepEqual(h.calls, []);
    assert.equal(s.ignored, 1);
    assert.equal(h.committed, 100);
});

test("the ledger is written by the sender only after its guards passed: a skipped send leaves no ledger entry", async () => {
    const h = harness([item(1, "máy hỏng")], { send: async () => ({ status: "skipped", reason: "draft" }) });
    await runChatCycle(h.deps);
    assert.deepEqual(h.sentLedger, []);
});

test("a message is marked done BEFORE Enter is pressed, so a crash right after Enter cannot cause a second reply", async () => {
    let doneAtEnter: boolean | null = null;
    const h = harness([item(1, "máy hỏng")], {
        send: async (_g, _t, hooks) => {
            hooks.beforeType?.();
            hooks.beforeEnter?.();
            doneAtEnter = h.done.has("m1");
            return { status: "sent" };
        },
    });
    await runChatCycle(h.deps);
    assert.equal(doneAtEnter, true);
});

test("a skipped send backs off: the next cycles do not touch Zalo again until the delay has passed", async () => {
    const clock = { now: NOW };
    let attempts = 0;
    const h = harness([item(1, "máy hỏng")], {
        clock,
        send: async () => {
            attempts++;
            return { status: "skipped", reason: "draft" };
        },
    });
    await runChatCycle(h.deps);
    assert.equal(attempts, 1);
    clock.now = NOW + 10_000;
    await runChatCycle(h.deps);
    assert.equal(attempts, 1); // still backing off
    clock.now = NOW + 46_000;
    await runChatCycle(h.deps);
    assert.equal(attempts, 2);
});
