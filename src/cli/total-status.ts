import { todayVietnam } from "../lesson/time.js";
import { hasSetErrors, loadReportSets } from "../reportSets/cliSet.js";
import { slotsOfDay } from "../total/slots.js";
import { formatTotalStatus } from "../total/totalStatusReport.js";
import { readSlots, readTotalState, totalHealth } from "../total/totalState.js";

/**
 * `bot:total` còn sống không, và hai đợt hôm nay đã xuất chưa, đủ dữ liệu chưa. Chỉ đọc. Thoát mã 0 khi bot đang chạy, mã 2
 * khi không (đã chết, đã dừng hoặc chưa từng chạy) hoặc khi `config.reportSets` có lỗi làm một bộ bị tắt.
 *
 *   npm run total:status
 */
const now = Date.now();
const day = todayVietnam(now);
const state = readTotalState();
const loaded = loadReportSets();
for (const line of formatTotalStatus({ state, slots: readSlots(), day, schedule: slotsOfDay(day), now, sets: { active: loaded.active, problems: loaded.problems } })) console.log(line);
if (totalHealth(state, now) !== "alive" || hasSetErrors(loaded.problems)) process.exitCode = 2;
