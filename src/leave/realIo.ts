import path from "node:path";
import { config } from "../../config.js";
import { photoReportsDir } from "../core/paths.js";
import type { LeaveIO } from "./buildDay.js";
import { LEAVE_LAYOUT } from "./layout.js";
import { readRoster } from "./roster.js";
import { countUnreadBundles, loadLeaveRows } from "./sources.js";

/** Bản thật của `LeaveIO`: danh sách tên đọc từ file mẫu ở `data/mau bao cao new`, các dòng đọc từ `data/photo-reports`. */
export function realLeaveIO(): LeaveIO {
    const root = photoReportsDir(config.dataDir);
    return {
        readRoster: () => readRoster(path.join(config.dataDir, "mau bao cao new", LEAVE_LAYOUT.templateFile), LEAVE_LAYOUT.sheet),
        loadRows: (sinceDay) => loadLeaveRows(root, sinceDay),
        countUnread: (sinceDay) => countUnreadBundles(root, sinceDay, config.vision.leave.groups),
    };
}
