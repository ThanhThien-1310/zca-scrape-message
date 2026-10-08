import { config } from "../../config.js";
import { leaveForDay } from "../leave/buildDay.js";
import { realLeaveIO } from "../leave/realIo.js";
import { formatLeaveDay } from "../leave/show.js";
import { todayVietnam } from "../lesson/time.js";

/**
 * In những gì báo cáo nghỉ phép sẽ điền cho một ngày (mặc định hôm nay): dòng Excel, NGÀY, BUỔI; tên chưa khớp danh sách của file mẫu kèm gợi ý; dòng đang chờ
 * xem; ghi chú và cảnh báo. Chỉ đọc đĩa, không ghi gì, không mở Excel, không gọi agent. Dùng để kiểm TRƯỚC khi mở file.
 *
 *   npm run leave:show -- [--day YYYY-MM-DD]
 */
function option(name: string): string | undefined {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const day = option("--day") ?? todayVietnam();
try {
    for (const line of formatLeaveDay(day, leaveForDay(day, realLeaveIO(), config.vision.leave))) console.log(line);
} catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
}
