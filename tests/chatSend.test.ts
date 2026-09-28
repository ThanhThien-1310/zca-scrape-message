import { test } from "node:test";
import assert from "node:assert/strict";
import { chatIsTarget, sendReply, type SendPage } from "../src/chat/send.js";
import type { ComposerState } from "../src/types/index.js";

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
    /** The group's members as shown in the @ suggestions (the account's own name is not listed). */
    members: string[];
    /** Typing "@" opens the suggestion list. */
    popover: boolean;
    /** The members are in the list as soon as "@" is typed (false: only when the name has been typed, like a long member list). */
    showMembers: boolean;
    /** Enter on the highlighted suggestion picks it. */
    enterPicks: boolean;
    /** Picking a suggestion turns it into a real tag (false: the name is left as plain text). */
    chipWorks: boolean;
    /** Typing after "@" narrows the suggestions to the names that contain it (false: the list stays as it was). */
    filterWorks: boolean;
    /** The suggestion list disappears as soon as something is typed after "@" (it comes back when the typed text is deleted). */
    closeOnType: boolean;
}

const EVERYONE = "Báo cho cả nhóm @All";
const EXTRAS = ["Tìm kiếm GIF @GIF", "Tìm sticker @STICKER"];

function fake(target: string, over: Partial<Script> = {}) {
    const s: Script = {
        startTitle: "LC_KhacNhom", opens: true, draft: false, insertWorks: true, charWorks: true, enterWorks: true, switchAfterInsert: false, insertMangles: false,
        members: ["Mai Anh Khoa", "Nguyễn Trọng Phúc"], popover: true, showMembers: true, enterPicks: true, chipWorks: true, filterWorks: true, closeOnType: false,
        ...over,
    };
    const st = { title: s.startTitle as string | null, empty: true, text: "", lastRow: "", selectAll: false, pop: { open: false, items: [] as string[], active: 0, typed: "" }, chips: [] as string[] };
    const suggestions = (typed: string): string[] => [
        EVERYONE,
        ...(s.showMembers || typed !== "" ? s.members.filter((m) => !s.filterWorks || m.toLowerCase().includes(typed.toLowerCase())) : []),
        ...EXTRAS,
    ];
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
            if (expr.includes("/*mentions*/")) return { open: st.pop.open, items: st.pop.items.map((text, i) => ({ text, active: i === st.pop.active })) } as T;
            if (expr.includes("/*chip*/")) {
                const m = /"name":\s*"([^"]*)"/.exec(expr);
                return st.chips.some((c) => c.normalize("NFC").toLowerCase() === (m?.[1] ?? "").normalize("NFC").toLowerCase()) as T;
            }
            if (expr.includes("/*lastRow*/")) return st.lastRow as T;
            throw new Error(`unexpected expression: ${expr.slice(0, 40)}`);
        },
        async input(method: string, params: any) {
            inputs.push({ method, params });
            if (method === "Input.insertText" && s.insertWorks) {
                st.text += s.insertMangles ? "###" : params.text;
                st.empty = false;
                if (s.switchAfterInsert) st.title = "LC_KhacNhom";
                if (params.text === "@" && s.popover) st.pop = { open: true, items: suggestions(""), active: 0, typed: "" };
                else if (st.pop.open) {
                    if (s.closeOnType) st.pop = { open: false, items: [], active: 0, typed: params.text };
                    else {
                        st.pop.typed += params.text;
                        st.pop.items = suggestions(st.pop.typed);
                        st.pop.active = 0;
                    }
                } else if (s.closeOnType && s.popover && !st.pop.open && st.pop.typed !== "") st.pop.typed += params.text;
            }
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && (params.key === "ArrowDown" || params.key === "ArrowUp") && st.pop.open) {
                st.pop.active = Math.max(0, Math.min(st.pop.items.length - 1, st.pop.active + (params.key === "ArrowDown" ? 1 : -1)));
            }
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && params.key === "Enter" && st.pop.open) {
                // Enter while the suggestions are open picks one; it never sends the message.
                const picked = st.pop.items[st.pop.active];
                if (s.enterPicks) {
                    st.text = st.text.replace(/@[^@]*$/, "") + (s.chipWorks ? `@${picked}` : `@${st.pop.typed}`);
                    if (s.chipWorks) st.chips.push(picked === EVERYONE ? "@All" : picked);
                }
                st.pop = { open: false, items: [], active: 0, typed: "" };
                return;
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
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && params.key === "Backspace" && !st.selectAll && st.text !== "") {
                // Deleting one character; back at a bare "@" the suggestions come back.
                st.text = st.text.slice(0, -1);
                if (st.pop.open) {
                    st.pop.typed = st.pop.typed.slice(0, -1);
                    st.pop.items = suggestions(st.pop.typed);
                } else if (st.text.endsWith("@") && s.popover) st.pop = { open: true, items: suggestions(""), active: 0, typed: "" };
                else if (st.pop.typed !== "") st.pop.typed = st.pop.typed.slice(0, -1);
                st.empty = st.text === "";
                return;
            }
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && params.key === "a" && params.modifiers === 2) st.selectAll = true;
            if (method === "Input.dispatchKeyEvent" && params.type === "rawKeyDown" && params.key === "Backspace" && st.selectAll) {
                st.text = "";
                st.empty = true;
                st.selectAll = false;
                st.chips = [];
                st.pop = { open: false, items: [], active: 0, typed: "" };
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

// ---- tagging people (@) ----
const keys = (inputs: Array<{ method: string; params: any }>, key: string) => inputs.filter((i) => i.method === "Input.dispatchKeyEvent" && i.params.type === "rawKeyDown" && i.params.key === key).length;
const PHUC = "Nguyễn Trọng Phúc";

test("a tag: types @, moves the highlight to the person with the arrow keys, picks with Enter, then types the text and sends once", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", { text: "Ghi nhận kiểm tra.", mentions: [PHUC] }, deps);
    assert.deepEqual(r, { status: "sent" });
    assert.deepEqual(typed(f.inputs).map((i) => i.params.text), ["@", PHUC, " ", "Ghi nhận kiểm tra."]); // the whole name is typed right after the @
    assert.equal(keys(f.inputs, "ArrowDown"), 1); // the list is narrowed to the person, but "Báo cho cả nhóm @All" is still the highlighted one, so one step down
    assert.equal(enters(f.inputs), 2); // one to pick the person, one to send
    assert.deepEqual(f.st.chips, [PHUC]);
    assert.match(f.st.lastRow, /@Nguyễn Trọng Phúc.*Ghi nhận kiểm tra\./);
});

test("the tag Enter never counts as the send: the ledger hook fires before the first key, the send hook only before the last Enter", async () => {
    const f = fake("bot test");
    const seen: string[] = [];
    await sendReply(f.page, "bot test", { text: "x", mentions: [PHUC] }, {
        ...deps,
        beforeType: () => seen.push(`type@${f.inputs.length}`),
        beforeEnter: () => seen.push(`enter@${f.inputs.length}:enters=${enters(f.inputs)}:chips=${f.st.chips.length}`),
    });
    assert.equal(seen[0], "type@0"); // before any key, including the "@"
    assert.match(seen[1], /enters=1:chips=1$/); // the tag was already picked, the send Enter had not been pressed
    assert.equal(seen.length, 2);
});

test("several tags are added in the order given", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", { text: "Xin chào.", mentions: [PHUC, "Mai Anh Khoa"] }, deps);
    assert.equal(r.status, "sent");
    assert.deepEqual(f.st.chips, [PHUC, "Mai Anh Khoa"]);
    assert.deepEqual(typed(f.inputs).map((i) => i.params.text), ["@", PHUC, " ", "@", "Mai Anh Khoa", " ", "Xin chào."]);
});

test("a person who is not among the first suggestions (long member list) is found because the name is typed", async () => {
    const f = fake("bot test", { showMembers: false });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(r.status, "sent");
    assert.deepEqual(typed(f.inputs).map((i) => i.params.text), ["@", PHUC, " ", "ok"]);
    assert.deepEqual(f.st.chips, [PHUC]);
});

test("if Zalo does not narrow the list to what was typed, the person is still found in the full list with the arrow keys", async () => {
    const f = fake("bot test", { filterWorks: false });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(r.status, "sent");
    assert.equal(keys(f.inputs, "ArrowDown"), 2); // @All, Mai Anh Khoa, then the person
    assert.deepEqual(f.st.chips, [PHUC]);
});

test("if the list disappears once the name is typed, the typed name is deleted and the person is found in the full list", async () => {
    const f = fake("bot test", { closeOnType: true });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(r.status, "sent");
    assert.equal(keys(f.inputs, "Backspace"), [...PHUC].length); // only what was typed is deleted
    assert.equal(keys(f.inputs, "ArrowDown"), 2);
    assert.deepEqual(f.st.chips, [PHUC]);
    assert.match(f.st.lastRow, /^@Nguyễn Trọng Phúc/); // no leftover of the typed name in front of the tag
});

test("when the person cannot be found the log says which names were on the list", async () => {
    const f = fake("bot test", { members: ["Mai Anh Khoa", "Trần Văn B"] });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: ["Người Lạ"] }, deps);
    assert.equal(r.status, "failed");
    assert.match((r as { reason: string }).reason, /không thấy "Người Lạ".*đang có: Mai Anh Khoa, Trần Văn B/);
    assert.doesNotMatch((r as { reason: string }).reason, /@All|GIF|STICKER|cả nhóm/); // only people, never the special entries
});

test("the name is matched ignoring letter case and the different ways a letter can be encoded", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC.toUpperCase().normalize("NFD")] }, deps);
    assert.equal(r.status, "sent");
});

const noTagSent = (f: ReturnType<typeof fake>) => {
    assert.equal(f.st.lastRow, ""); // nothing reached the chat
    assert.equal(f.st.text, ""); // and the draft was cleared
    assert.deepEqual(f.st.chips, []);
};

test("if the @ list does not open nothing is sent and the draft is cleared", async () => {
    const f = fake("bot test", { popover: false });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(r.status, "failed");
    assert.match((r as { reason: string }).reason, /danh sách thẻ @ không hiện/);
    assert.equal(enters(f.inputs), 0);
    noTagSent(f);
});

test("a name that is not in the group is never guessed: nothing is sent", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: ["Người Lạ"] }, deps);
    assert.equal(r.status, "failed");
    assert.match((r as { reason: string }).reason, /không thấy "Người Lạ"/);
    assert.equal(enters(f.inputs), 0);
    noTagSent(f);
});

test("tagging everyone is never done, even when asked by a name that matches its entry", async () => {
    for (const name of ["All", "@All", "Báo cho cả nhóm"]) {
        const f = fake("bot test");
        const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [name] }, deps);
        assert.equal(r.status, "failed", name);
        assert.equal(enters(f.inputs), 0, name);
        assert.deepEqual(f.st.chips, [], name);
    }
});

test("two people with the same name: the tag is refused rather than choosing one", async () => {
    const f = fake("bot test", { members: [PHUC, PHUC] });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(r.status, "failed");
    assert.match((r as { reason: string }).reason, /2 người tên/);
    assert.equal(enters(f.inputs), 0);
    noTagSent(f);
});

test("if Enter leaves the name as plain text instead of a real tag, the message is not sent", async () => {
    const f = fake("bot test", { chipWorks: false });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(r.status, "failed");
    assert.match((r as { reason: string }).reason, /thẻ chưa được tạo/);
    assert.equal(enters(f.inputs), 1); // only the pick Enter; the send Enter was never pressed
    noTagSent(f);
});

test("if the open chat changes while tagging, nothing more is typed and no Enter is pressed", async () => {
    const f = fake("bot test", { switchAfterInsert: true });
    const r = await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(r.status, "failed");
    assert.equal(enters(f.inputs), 0);
    assert.equal(f.st.lastRow, "");
});

test("a plain string still works exactly as before (no tag, one Enter)", async () => {
    const f = fake("bot test");
    const r = await sendReply(f.page, "bot test", "Đã nhận.", deps);
    assert.deepEqual(r, { status: "sent" });
    assert.deepEqual(typed(f.inputs).map((i) => i.params.text), ["Đã nhận."]);
    assert.equal(enters(f.inputs), 1);
    assert.equal(keys(f.inputs, "ArrowDown"), 0);
});

test("the previous chat is restored after a tagged send too", async () => {
    const f = fake("bot test");
    await sendReply(f.page, "bot test", { text: "ok", mentions: [PHUC] }, deps);
    assert.equal(f.st.title, "LC_KhacNhom");
});
