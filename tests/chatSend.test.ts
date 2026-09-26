import { test } from "node:test";
import assert from "node:assert/strict";
import { chatIsTarget, sendReply, type ComposerState, type SendPage } from "../src/chat/send.js";

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

interface Script {
    startTitle: string;
    /** Opening the target switches the open chat to it. */
    opens: boolean;
    /** The composer already holds text (someone typing) after the chat is opened. */
    draft: boolean;
    /** Input.insertText puts text in the composer. */
    insertWorks: boolean;
    /** Per-character key events put text in the composer. */
    charWorks: boolean;
    /** Enter really sends. */
    enterWorks: boolean;
    /** The open chat silently changes right after the text is inserted. */
    switchAfterInsert: boolean;
    /** Input.insertText lands text that is not what was inserted (Zalo rewrote it). */
    insertMangles: boolean;
}

function fake(target: string, over: Partial<Script> = {}) {
    const s: Script = { startTitle: "LC_KhacNhom", opens: true, draft: false, insertWorks: true, charWorks: true, enterWorks: true, switchAfterInsert: false, insertMangles: false, ...over };
    const st = { title: s.startTitle as string | null, empty: true, text: "", lastRow: "", selectAll: false };
    const inputs: Array<{ method: string; params: any }> = [];
    const searches: string[] = [];
    let pendingName = "";
    const state = (): ComposerState => ({ title: st.title, placeholder: st.title ? `Nhập @, tin nhắn tới  ${st.title}` : null, empty: st.empty, text: st.text || "\n" });
    const page: SendPage = {
        async evaluate<T>(expr: string): Promise<T> {
            if (expr.includes("/*state*/")) return state() as T;
            if (expr.includes("/*search*/")) {
                const m = /"query":\s*"([^"]*)"/.exec(expr);
                if (m && m[1]) {
                    searches.push(m[1]);
                    pendingName = m[1];
                }
                return true as T;
            }
            if (expr.includes("/*click*/")) {
                if (pendingName === target ? s.opens : true) {
                    st.title = pendingName;
                    st.empty = !s.draft;
                    st.text = s.draft ? "đang gõ dở" : "";
                }
                return true as T;
            }
            if (expr.includes("/*focus*/")) return true as T;
            if (expr.includes("/*lastRow*/")) return st.lastRow as T;
            throw new Error(`unexpected expression: ${expr.slice(0, 40)}`);
        },
        async input(method: string, params: any) {
            inputs.push({ method, params });
            if (method === "Input.insertText" && s.insertWorks) {
                st.text += s.insertMangles ? "###" : params.text;
                st.empty = false;
                if (s.switchAfterInsert) st.title = "LC_KhacNhom";
            }
            if (method === "Input.dispatchKeyEvent" && params.type === "char" && params.key !== "Enter" && params.text !== "\r" && s.charWorks) {
                st.text += params.text;
                st.empty = false;
            }
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && params.key === "Enter" && s.enterWorks) {
                st.lastRow = st.text;
                st.text = "";
                st.empty = true;
            }
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && params.key === "a" && params.modifiers === 2) st.selectAll = true;
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && params.key === "Backspace" && st.selectAll) {
                st.text = "";
                st.empty = true;
                st.selectAll = false;
            }
        },
    };
    return { page, inputs, searches, st };
}
const deps = { delay: async () => undefined, log: () => undefined };
const enters = (inputs: Array<{ method: string; params: any }>) => inputs.filter((i) => i.method === "Input.dispatchKeyEvent" && i.params.type === "rawKeyDown" && i.params.key === "Enter").length;
const typed = (inputs: Array<{ method: string; params: any }>) => inputs.filter((i) => i.method === "Input.insertText" || (i.method === "Input.dispatchKeyEvent" && i.params.type === "char" && i.params.text !== "\r"));

test("chatIsTarget needs both the selected title and the composer placeholder to name the target", () => {
    const ok: ComposerState = { title: "bot test", placeholder: "Nhập @, tin nhắn tới  bot test", empty: true, text: "" };
    assert.equal(chatIsTarget(ok, "bot test"), true);
    assert.equal(chatIsTarget({ ...ok, title: "LC_HoaSen1_TĐ" }, "bot test"), false);
    assert.equal(chatIsTarget({ ...ok, placeholder: "Nhập @, tin nhắn tới  LC_HoaSen1_TĐ" }, "bot test"), false);
    assert.equal(chatIsTarget({ ...ok, placeholder: null }, "bot test"), false);
    assert.equal(chatIsTarget({ ...ok, title: null }, "bot test"), false);
    assert.equal(chatIsTarget({ ...ok, placeholder: "Nhập @, tin nhắn tới  Phòng bot test" }, "bot test"), false); // a longer name ending the same way
});

test("a normal send opens the target, types the reply, presses Enter once, confirms it, and goes back to the previous chat", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", "Đã nhận thông tin có máy lỗi.", deps);
    assert.deepEqual(r, { status: "sent" });
    assert.deepEqual(typed(f.inputs).map((i) => i.params.text), ["Đã nhận thông tin có máy lỗi."]);
    assert.equal(enters(f.inputs), 1);
    assert.deepEqual(f.searches, ["bot test", "LC_KhacNhom"]);
    assert.equal(f.st.title, "LC_KhacNhom"); // restored (navigation only)
});

test("with restorePrevious false the chat stays on the target after sending", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", "Đã nhận thông tin có máy lỗi.", { ...deps, restorePrevious: false });
    assert.deepEqual(r, { status: "sent" });
    assert.deepEqual(f.searches, ["bot test"]); // the previous chat is never searched for
    assert.equal(f.st.title, "bot test");
});

test("with restorePrevious false a skipped send still leaves the chat where it was opened, and nothing is typed", async () => {
    const f = fake("bot test", { draft: true });
    const r = await sendReply(f.page, "bot test", "x", { ...deps, restorePrevious: false });
    assert.deepEqual(r, { status: "skipped", reason: "draft" });
    assert.equal(f.inputs.length, 0);
    assert.deepEqual(f.searches, ["bot test"]);
});

test("restorePrevious true is the same as leaving it out: the previous chat is reopened", async () => {
    const f = fake("bot test");
    await sendReply(f.page, "bot test", "x", { ...deps, restorePrevious: true });
    assert.deepEqual(f.searches, ["bot test", "LC_KhacNhom"]);
    assert.equal(f.st.title, "LC_KhacNhom");
});

test("if the target cannot be opened nothing is typed, and the previous chat is restored", async () => {
    const f = fake("bot test", { opens: false });
    const r = await sendReply(f.page, "bot test", "x", deps);
    assert.deepEqual(r, { status: "skipped", reason: "not-opened" });
    assert.equal(f.inputs.length, 0);
});

test("a draft in the composer (someone typing) is never overwritten: skipped, nothing typed", async () => {
    const f = fake("bot test", { draft: true });
    const r = await sendReply(f.page, "bot test", "x", deps);
    assert.deepEqual(r, { status: "skipped", reason: "draft" });
    assert.equal(f.inputs.length, 0);
});

test("if the open chat changes after the text was inserted, Enter is never pressed", async () => {
    const f = fake("bot test", { switchAfterInsert: true });
    const r = await sendReply(f.page, "bot test", "x", deps);
    assert.equal(r.status, "failed");
    assert.equal(enters(f.inputs), 0);
});

test("if insertText does not land it falls back to per-character events, still guarded", async () => {
    const f = fake("bot test", { insertWorks: false });
    const r = await sendReply(f.page, "bot test", "ok", deps);
    assert.deepEqual(r, { status: "sent" });
    assert.deepEqual(f.inputs.filter((i) => i.params.type === "char" && i.params.text !== "\r").map((i) => i.params.text), ["o", "k"]);
});

test("if text cannot be entered at all, nothing is sent", async () => {
    const f = fake("bot test", { insertWorks: false, charWorks: false });
    const r = await sendReply(f.page, "bot test", "ok", deps);
    assert.equal(r.status, "failed");
    assert.equal(enters(f.inputs), 0);
});

test("if Enter is not confirmed the result is failed and unconfirmed, and Enter is not pressed again", async () => {
    const f = fake("bot test", { enterWorks: false });
    const r = await sendReply(f.page, "bot test", "x", deps);
    assert.equal(r.status, "failed");
    assert.equal((r as { unconfirmed?: boolean }).unconfirmed, true);
    assert.equal(enters(f.inputs), 1);
});

test("multi-line replies are confirmed regardless of whitespace differences", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", "Dòng 1\nDòng 2", deps);
    assert.deepEqual(r, { status: "sent" });
    assert.equal(norm(f.st.lastRow), "Dòng 1 Dòng 2");
});

test("text that landed but does not match is never typed over again: the draft is cleared and nothing is sent", async () => {
    const f = fake("bot test", { insertMangles: true });
    const r = await sendReply(f.page, "bot test", "Đã nhận thông tin có máy lỗi.", deps);
    assert.equal(r.status, "failed");
    assert.equal(typed(f.inputs).length, 1); // only the one insertText, no per-character retry on top of it
    assert.equal(enters(f.inputs), 0);
    assert.equal(f.st.text, ""); // cleared
    assert.equal(f.st.empty, true);
});

test("when the open chat changed after typing, nothing is cleared (it would erase someone else's draft)", async () => {
    const f = fake("bot test", { switchAfterInsert: true });
    await sendReply(f.page, "bot test", "x", deps);
    assert.equal(f.inputs.filter((i) => i.params.key === "Backspace").length, 0);
});

test("whitespace differences (a non-breaking space) do not make a correct insertion look like a mismatch", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", "Cảm ơn Cô Lan", deps);
    assert.deepEqual(r, { status: "sent" });
});

test("hooks: beforeType runs after the guards and before any typing; beforeEnter runs after the text is in and before Enter", async () => {
    const f = fake("bot test");
    const seen: string[] = [];
    await sendReply(f.page, "bot test", "ok", {
        ...deps,
        beforeType: () => seen.push(`beforeType inputs=${f.inputs.length}`),
        beforeEnter: () => seen.push(`beforeEnter typed=${typed(f.inputs).length} enters=${enters(f.inputs)}`),
    });
    assert.deepEqual(seen, ["beforeType inputs=0", "beforeEnter typed=1 enters=0"]);
});

test("hooks are not called when the send is skipped or the guard fails", async () => {
    for (const over of [{ opens: false }, { draft: true }, { switchAfterInsert: true }]) {
        const f = fake("bot test", over);
        const seen: string[] = [];
        await sendReply(f.page, "bot test", "x", { ...deps, beforeType: () => seen.push("t"), beforeEnter: () => seen.push("e") });
        assert.equal(seen.includes("e"), false, JSON.stringify(over));
        if ("opens" in over || "draft" in over) assert.deepEqual(seen, [], JSON.stringify(over));
    }
});
