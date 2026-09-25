import type { CdpPage } from "../history/cdp.js";

/** Phần của một trang CDP mà việc gửi cần; tiêm được để kiểm thử bằng trang giả. */
export interface SendPage {
    evaluate<T>(expression: string): Promise<T>;
    input(method: string, params: object): Promise<void>;
}

export const toSendPage = (page: CdpPage): SendPage => ({
    evaluate: (expression) => page.evaluate(expression),
    input: (method, params) => page.dispatchInput(method, params as Record<string, unknown>),
});

export interface ComposerState {
    /** Tên nhóm đang được chọn ở thanh bên. */
    title: string | null;
    /** `placeholder` của ô soạn tin, dạng "Nhập @, tin nhắn tới  <tên nhóm>". */
    placeholder: string | null;
    /** Ô soạn tin đang trống (class `empty`). */
    empty: boolean | null;
    text: string | null;
}

export type SendResult =
    | { status: "sent" }
    | { status: "skipped"; reason: "draft" | "not-opened" }
    | { status: "failed"; reason: string; unconfirmed?: boolean };

export interface SendDeps {
    delay(ms: number): Promise<void>;
    log(message: string): void;
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

/**
 * Gửi một tin vào nhóm `target` qua giao diện Zalo Desktop. Người gọi phải giữ khóa `data/.scrape.lock`.
 * Trước MỖI thao tác gõ hoặc Enter đều đọc lại trạng thái và kiểm `chatIsTarget`; sai thì dừng, không gõ tiếp.
 * Lỗi sau khi đã bấm Enter mà không xác nhận được thì báo `unconfirmed` và KHÔNG tự gửi lại (tránh gửi trùng).
 * Luôn mở lại cuộc trò chuyện đang mở trước đó (chỉ điều hướng).
 */
export async function sendReply(page: SendPage, target: string, text: string, deps: SendDeps): Promise<SendResult> {
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
        await page.input("Input.insertText", { text });
        await deps.delay(500);

        let after = await read();
        if (!(after.text ?? "").includes(text.split("\n")[0])) {
            deps.log("[chat] insertText không vào ô soạn tin, thử gửi từng ký tự");
            if (!(await guarded())) return { status: "failed", reason: "nhóm đang mở đã đổi trước khi gõ từng ký tự" };
            for (const ch of text) await page.input("Input.dispatchKeyEvent", ch === "\n" ? { type: "char", text: "\n", key: "Enter", modifiers: 8 } : { type: "char", text: ch });
            await deps.delay(500);
            after = await read();
        }
        if (!chatIsTarget(after, target)) return { status: "failed", reason: "nhóm đang mở đã đổi sau khi gõ; không gửi" };
        if (!(after.text ?? "").includes(text.split("\n")[0])) return { status: "failed", reason: "không nhập được chữ vào ô soạn tin; chưa gửi gì" };

        if (!(await guarded())) return { status: "failed", reason: "nhóm đang mở đã đổi trước khi bấm Enter" };
        await page.input("Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
        await page.input("Input.dispatchKeyEvent", { type: "char", text: "\r", ...key });
        await page.input("Input.dispatchKeyEvent", { type: "keyUp", ...key });
        await deps.delay(1500);

        const final = await read();
        const lastRow = await page.evaluate<string>(LAST_ROW);
        if (final.empty === true && norm(lastRow).includes(norm(text))) return { status: "sent" };
        return { status: "failed", reason: "đã bấm Enter nhưng không xác nhận được tin đã gửi", unconfirmed: true };
    } finally {
        if (previous && norm(previous) !== norm(target)) {
            try {
                await open(page, previous, deps);
            } catch {
                /* điều hướng lại chỉ là tiện lợi */
            }
        }
    }
}
