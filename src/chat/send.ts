import type { CdpPage } from "../scrape/cdp.js";
import { isEveryone, nameKey } from "./mentions.js";
import type { ComposerState, OutgoingReply, SendResult } from "../types/index.js";

/** Phần của một trang CDP mà việc gửi cần; tiêm được để kiểm thử bằng trang giả. */
export interface SendPage {
    evaluate<T>(expression: string): Promise<T>;
    input(method: string, params: object): Promise<void>;
}

export const toSendPage = (page: CdpPage): SendPage => ({
    evaluate: (expression) => page.evaluate(expression),
    input: (method, params) => page.dispatchInput(method, params as Record<string, unknown>),
});

/** Móc gọi đúng lúc, để người gọi ghi sổ TRƯỚC khi có gì đó ra ngoài. */
export interface SendHooks {
    /** Sau khi mọi chốt chặn đã qua và ô soạn tin trống, ngay trước khi gõ chữ đầu tiên. */
    beforeType?(): void;
    /** Chữ đã nằm đúng trong ô soạn tin, ngay trước khi bấm Enter. */
    beforeEnter?(): void;
}

export interface SendDeps extends SendHooks {
    delay(ms: number): Promise<void>;
    log(message: string): void;
    /** Sau khi xong, mở lại cuộc trò chuyện đang mở trước đó (mặc định true; `bot:chat` truyền `config.chat.restorePreviousConversation`). */
    restorePrevious?: boolean;
}

const norm = (s: string): string => s.normalize("NFC").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();

/**
 * Chốt chặn kép: tên nhóm đang chọn bằng đúng nhóm đích VÀ placeholder của ô soạn tin kết thúc bằng
 * "tới <nhóm đích>" (đo độc lập với thanh bên). Thiếu một trong hai thì coi như sai nhóm.
 */
export function chatIsTarget(s: ComposerState, target: string): boolean {
    if (s.title === null || s.placeholder === null) return false;
    const want = norm(target);
    // Placeholder that Zalo really has: "Nhập @, tin nhắn tới  <tên nhóm>"; "Phòng bot test" must not count as "bot test".
    return norm(s.title) === want && norm(s.placeholder).endsWith(` tới ${want}`);
}

const STATE = `/*state*/(() => {
    const t = document.querySelector(".conv-item.selected .conv-item-title__name");
    const r = document.getElementById("richInput");
    return { title: t ? t.textContent : null, placeholder: r ? r.getAttribute("placeholder") : null, empty: r ? r.classList.contains("empty") : null, text: r ? r.innerText : null };
})()`;

const search = (query: string) => `/*search*/(() => {
    const spec = { "query": ${JSON.stringify(query)} };
    const i = document.querySelector("#contact-search-input");
    if (!i) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, spec.query);
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.blur();
    return true;
})()`;

const click = (name: string) => `/*click*/(() => {
    const n = (s) => s.normalize("NFC").replace(/[\\u200B-\\u200D\\uFEFF]/g, "").replace(/\\s+/g, " ").trim();
    const w = n(${JSON.stringify(name)});
    const t = Array.from(document.querySelectorAll(".conv-item-title__name")).find((x) => n(x.textContent || "") === w);
    if (!t) return false;
    const it = t.closest(".conv-item");
    if (!it) return false;
    it.click();
    return true;
})()`;

const FOCUS = `/*focus*/(() => { const r = document.getElementById("richInput"); if (!r) return false; r.focus(); r.click(); return true; })()`;

const LAST_ROW = `/*lastRow*/(() => { const rows = document.querySelectorAll(".chat-message"); const last = rows[rows.length - 1]; return last ? (last.innerText || "") : ""; })()`;

/** Chỉ điều hướng (tìm rồi bấm một mục ở thanh bên, xóa ô tìm); không gõ vào cuộc trò chuyện nào. */
async function open(page: SendPage, name: string, deps: SendDeps): Promise<void> {
    try {
        await page.evaluate<boolean>(search(name));
        await deps.delay(1000);
        await page.evaluate<boolean>(click(name));
    } finally {
        await page.evaluate<boolean>(search(""));
    }
}

const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };

interface MentionItem {
    text: string;
    /** Mục đang được tô sáng (Enter sẽ chọn mục này). */
    active: boolean;
}

interface MentionList {
    open: boolean;
    items: MentionItem[];
}

/** Danh sách gợi ý khi gõ "@" (`#mentionPopover`): mỗi người là một `.mention-popover__item`, đầu tiên là "Báo cho cả nhóm @All". */
const MENTIONS = `/*mentions*/(() => {
    const p = document.getElementById("mentionPopover");
    if (!p) return { open: false, items: [] };
    const items = Array.from(p.querySelectorAll(".mention-popover__item")).map((e) => ({ text: (e.innerText || "").replace(/\\s+/g, " ").trim(), active: /active-bg/.test(e.className) }));
    return { open: items.length > 0, items };
})()`;

/** Ô soạn tin có một phần tử đại diện cho thẻ của `name` (chữ thường gõ tay chỉ là văn bản trực tiếp trong dòng, không có phần tử riêng). */
const chip = (name: string) => `/*chip*/(() => {
    const spec = { "name": ${JSON.stringify(name)} };
    const n = (s) => s.normalize("NFC").replace(/[\\u200B-\\u200D\\uFEFF]/g, "").replace(/\\s+/g, " ").trim().toLowerCase();
    const r = document.getElementById("richInput");
    if (!r) return false;
    const want = n(spec.name);
    return Array.from(r.querySelectorAll("*")).some((e) => !/^input_line_/.test(e.id || "") && n(e.textContent || "").replace(/^@/, "") === want);
})()`;

const arrow = (name: "ArrowDown" | "ArrowUp") => ({ key: name, code: name, windowsVirtualKeyCode: name === "ArrowDown" ? 40 : 38, nativeVirtualKeyCode: name === "ArrowDown" ? 40 : 38 });

async function tap(page: SendPage, k: object): Promise<void> {
    await page.input("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k });
    await page.input("Input.dispatchKeyEvent", { type: "keyUp", ...k });
}

const BACKSPACE = { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 };

/** Tên những người đang có trên danh sách (để ghi vào log khi không tìm thấy); bỏ các mục đặc biệt "cả nhóm", GIF, sticker. */
const seenNames = (list: MentionList): string => {
    const names = list.items.filter((i) => !isEveryone(i.text) && !/@(gif|sticker)\b/i.test(i.text)).map((i) => i.text);
    return names.length === 0 ? "không có ai" : names.slice(0, 8).join(", ") + (names.length > 8 ? ", ..." : "");
};

/** Vị trí các mục khớp đúng tên người (không bao giờ tính mục "cả nhóm"). */
const matchesOf = (list: MentionList, name: string): number[] => list.items.flatMap((it, i) => (!isEveryone(it.text) && nameKey(it.text) === nameKey(name) ? [i] : []));

/**
 * Gắn thẻ một người: gõ "@", đọc danh sách gợi ý, tìm ĐÚNG người theo tên (một mục duy nhất, không phải "cả nhóm"), đưa mục
 * sáng tới người đó bằng phím mũi tên, Enter để chọn (chưa gửi gì), rồi kiểm tra ô soạn tin thật sự có thẻ. Trả về lý do
 * thất bại, hoặc null khi xong. Trước mỗi phím đều kiểm tra lại đang ở đúng nhóm; người gọi lo xóa bản nháp khi thất bại.
 */
async function insertMention(page: SendPage, name: string, deps: SendDeps, guarded: () => Promise<ComposerState | null>): Promise<string | null> {
    const read = () => page.evaluate<MentionList>(MENTIONS);
    await page.input("Input.insertText", { text: "@" });
    await deps.delay(600);
    let list = await read();
    if (!list.open) return "danh sách thẻ @ không hiện";

    // Gõ ngay tên đầy đủ để Zalo thu danh sách về đúng người đó (nhóm đông người thì người cần gắn thường không hiện sẵn).
    if (!(await guarded())) return "nhóm đang mở đã đổi";
    await page.input("Input.insertText", { text: name });
    await deps.delay(600);
    list = await read();
    let hits = list.open ? matchesOf(list, name) : [];
    if (hits.length === 0) {
        // Sau khi gõ tên mà không thấy người đó (danh sách đóng hoặc không lọc như dự đoán): xóa đúng phần tên vừa gõ
        // và tìm trong danh sách đầy đủ bằng phím mũi tên.
        for (let i = 0; i < [...name].length; i++) {
            if (!(await guarded())) return "nhóm đang mở đã đổi";
            await tap(page, BACKSPACE);
        }
        await deps.delay(600);
        list = await read();
        if (!list.open) return `danh sách thẻ đóng sau khi gõ tên "${name}"`;
        hits = matchesOf(list, name);
    }
    if (hits.length === 0) return `không thấy "${name}" trong danh sách thẻ (đang có: ${seenNames(list)})`;
    if (hits.length > 1) return `có ${hits.length} người tên "${name}" trong nhóm, không biết chọn ai`;

    for (let step = 0; ; step++) {
        const wanted = matchesOf(list, name);
        const active = list.items.findIndex((i) => i.active);
        if (wanted.length !== 1) return "danh sách thẻ đổi khi đang chọn";
        if (active < 0) return "không biết mục nào đang được chọn";
        if (active === wanted[0]) break;
        if (step >= 30) return "không chuyển được sang đúng người";
        if (!(await guarded())) return "nhóm đang mở đã đổi";
        await tap(page, arrow(wanted[0] > active ? "ArrowDown" : "ArrowUp"));
        await deps.delay(150);
        list = await read();
        if (!list.open) return "danh sách thẻ đóng khi đang chọn";
    }

    if (!(await guarded())) return "nhóm đang mở đã đổi";
    await tap(page, key); // chọn người; chưa phải gửi vì danh sách đang mở
    await deps.delay(700);
    if ((await read()).open) return "danh sách thẻ vẫn mở sau khi chọn";
    if (!(await page.evaluate<boolean>(chip(name)))) return "thẻ chưa được tạo (tên chỉ thành chữ thường)";
    return null;
}

/** Ô soạn tin chứa đúng dòng đầu của câu trả lời (so sau khi chuẩn hóa khoảng trắng, kể cả NBSP). */
const holds = (composer: ComposerState, text: string): boolean => norm(composer.text ?? "").includes(norm(text.split("\n")[0]));

/**
 * Xóa bản nháp ta vừa gõ dở (Ctrl+A rồi Backspace), CHỈ khi chốt chặn vẫn xác nhận đang ở nhóm đích:
 * nếu nhóm đã đổi thì ô soạn tin đang mở là của người khác và không được đụng vào.
 */
async function clearDraft(page: SendPage, guarded: () => Promise<ComposerState | null>): Promise<void> {
    if (!(await guarded())) return;
    await page.input("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await page.input("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await page.input("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
    await page.input("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
}

/**
 * Gửi một tin vào nhóm `target` qua giao diện Zalo Desktop. Người gọi phải giữ khóa `data/.scrape.lock`.
 * Trước MỖI thao tác gõ hoặc Enter đều đọc lại trạng thái và kiểm `chatIsTarget`; sai thì dừng, không gõ tiếp.
 * Lỗi sau khi đã bấm Enter mà không xác nhận được thì báo `unconfirmed` và KHÔNG tự gửi lại (tránh gửi trùng).
 * Mở lại cuộc trò chuyện đang mở trước đó (chỉ điều hướng) trừ khi `deps.restorePrevious` là false.
 */
export async function sendReply(page: SendPage, target: string, reply: string | OutgoingReply, deps: SendDeps): Promise<SendResult> {
    const { text, mentions } = typeof reply === "string" ? { text: reply, mentions: [] as string[] } : reply;
    const read = () => page.evaluate<ComposerState>(STATE);
    const guarded = async (): Promise<ComposerState | null> => {
        const s = await read();
        return chatIsTarget(s, target) ? s : null;
    };

    const previous = (await read()).title;
    try {
        await open(page, target, deps);
        await deps.delay(1200);

        const opened = await guarded();
        if (!opened) return { status: "skipped", reason: "not-opened" };
        if (opened.empty !== true) return { status: "skipped", reason: "draft" };

        await page.evaluate<boolean>(FOCUS);
        await deps.delay(300);

        if (!(await guarded())) return { status: "failed", reason: "nhóm đang mở đã đổi trước khi gõ" };
        deps.beforeType?.();
        for (const name of mentions) {
            const problem = await insertMention(page, name, deps, guarded);
            if (problem !== null) {
                await clearDraft(page, guarded);
                return { status: "failed", reason: `gắn thẻ @${name}: ${problem}; đã xóa bản nháp, chưa gửi gì` };
            }
            await page.input("Input.insertText", { text: " " });
        }
        await page.input("Input.insertText", { text });
        await deps.delay(500);

        let after = await read();
        // Chỉ thử gõ từng ký tự khi chưa có gì vào ô soạn tin. Chữ đã vào một phần (Zalo viết lại chữ) thì
        // gõ chồng lên sẽ để lại hai bản trong ô, nên chuyển sang xóa bản nháp bên dưới.
        if (!holds(after, text) && after.empty === true) {
            deps.log("[chat] insertText không vào ô soạn tin, thử gửi từng ký tự");
            const chars = [...text];
            for (let i = 0; i < chars.length; i++) {
                if (i > 0 && i % 10 === 0 && !(await guarded())) return { status: "failed", reason: "nhóm đang mở đã đổi giữa lúc gõ từng ký tự" };
                const ch = chars[i];
                await page.input("Input.dispatchKeyEvent", ch === "\n" ? { type: "char", text: "\n", key: "Enter", modifiers: 8 } : { type: "char", text: ch });
            }
            await deps.delay(500);
            after = await read();
        }
        if (!chatIsTarget(after, target)) return { status: "failed", reason: "nhóm đang mở đã đổi sau khi gõ; không gửi" };
        if (!holds(after, text)) {
            await clearDraft(page, guarded);
            return { status: "failed", reason: "chữ trong ô soạn tin không khớp câu trả lời; đã xóa bản nháp, chưa gửi gì" };
        }

        if (!(await guarded())) return { status: "failed", reason: "nhóm đang mở đã đổi trước khi bấm Enter" };
        deps.beforeEnter?.();
        await page.input("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
        await page.input("Input.dispatchKeyEvent", { type: "char", text: "\r", ...key });
        await page.input("Input.dispatchKeyEvent", { type: "keyUp", ...key });
        await deps.delay(1500);

        const final = await read();
        const lastRow = await page.evaluate<string>(LAST_ROW);
        if (final.empty === true && norm(lastRow).includes(norm(text))) return { status: "sent" };
        return { status: "failed", reason: "đã bấm Enter nhưng không xác nhận được tin đã gửi", unconfirmed: true };
    } finally {
        if (deps.restorePrevious !== false && previous && norm(previous) !== norm(target)) {
            try {
                await open(page, previous, deps);
            } catch {
                /* điều hướng lại chỉ là tiện lợi */
            }
        }
    }
}
