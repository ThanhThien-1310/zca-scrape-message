import { config } from "../../config.js";

/** Thời gian của bot chat, tính từ `config.chat` (config.ts mục 7). Các mô-đun chat không tự khai báo số nào. */
export const CHAT_POLL_MS = config.chat.pollSeconds * 1000;
export const CHAT_HEARTBEAT_MS = config.chat.heartbeatSeconds * 1000;
/** Sau một lần gửi bị hoãn (ô soạn tin đang có chữ dở, chưa mở được nhóm) không chạm vào Zalo lại trong khoảng này. */
export const SKIP_BACKOFF_MS = config.chat.skipBackoffSeconds * 1000;
/** Sổ các câu bot vừa gửi được giữ bấy lâu. */
export const KEEP_SENT_MS = config.chat.sentLedgerMinutes * 60_000;
/** Tin của chính tài khoản khớp một câu trong sổ trong khoảng này được coi là tin dội lại của bot. */
export const ECHO_WINDOW_MS = config.chat.echoWindowSeconds * 1000;
