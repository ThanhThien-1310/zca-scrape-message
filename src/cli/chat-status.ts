import fs from "node:fs";
import path from "node:path";
import { readInbox, DEFAULT_CURSOR_PATH, DEFAULT_INBOX_PATH } from "../chat/inbox.js";
import { config } from "../../config.js";
import { STALE_AFTER_MS } from "../watch/watchState.js";

/**
 * `bot:chat` còn sống không, đang chạy thật hay dry-run, nhóm nào, còn bao nhiêu tin chờ, công tắc dừng có bật không.
 * Chỉ đọc. Thoát mã 0 khi đang sống, 2 khi không.
 *
 *   npm run chat:status
 */
const now = Date.now();
let state: { pid?: number; startedAt?: number; lastBeat?: number; stopped?: boolean; dryRun?: boolean; groups?: string[]; lastSummary?: unknown } | null = null;
try {
    state = JSON.parse(fs.readFileSync(path.join(config.dataDir, ".chat-state.json"), "utf8"));
} catch {
    state = null;
}
const hhmm = (ts: number) => new Date(ts + 7 * 3600_000).toISOString().slice(11, 16);

let alive = false;
if (!state || typeof state.lastBeat !== "number") console.log("[chat] chưa có dữ liệu: bot:chat chưa từng chạy.");
else if (state.stopped) console.log(`[chat] ĐÃ DỪNG lúc ${hhmm(state.lastBeat)}`);
else if (now - state.lastBeat > STALE_AFTER_MS) console.log(`[chat] CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc ${hhmm(state.lastBeat)} (pid ${state.pid}).`);
else {
    alive = true;
    console.log(`[chat] ĐANG CHẠY (pid ${state.pid}) | ${state.dryRun ? "DRY-RUN (không gửi thật)" : "gửi thật"} | nhóm: ${(state.groups ?? []).join(", ") || "(không có)"}`);
    if (state.lastSummary) console.log(`  vòng gần nhất: ${JSON.stringify(state.lastSummary)}`);
}
console.log(`  tin chờ trong hộp thư: ${readInbox(DEFAULT_INBOX_PATH, DEFAULT_CURSOR_PATH).length}`);
if (fs.existsSync(path.join(config.dataDir, ".chat-off"))) console.log("  CÔNG TẮC DỪNG (data/.chat-off) đang BẬT: bot không gửi gì.");
if (!alive) process.exitCode = 2;
