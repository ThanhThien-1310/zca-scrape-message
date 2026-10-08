import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { setOutputDir, setReportDir } from "../core/paths.js";
import { leaveForDay } from "../leave/buildDay.js";
import { loadMinutesByMessage } from "../minutes/measures.js";
import { loadSpeedByMessage } from "../speed/measures.js";
import { addDays } from "../lesson/time.js";
import { photoReportsDir } from "../core/paths.js";
import { realLeaveIO } from "../leave/realIo.js";
import { runFillTemplate } from "../lesson/excelFill.js";
import { readOverrides } from "../lesson/overrides.js";
import { readTemplateTitle } from "../lesson/statusReportLayout.js";
import { MessageStore } from "../store/messageStore.js";
import type { SourceMessage } from "../types/index.js";
import type { TotalDeps } from "./runTotal.js";
import { DEFAULT_TOTAL_FILES } from "./totalState.js";

/** Phụ thuộc thật của `runTotalOnce`: kho tin cục bộ, Excel COM, mẫu ở `data/mau bao cao new`, thư mục xuất của từng bộ báo cáo. */
export function realTotalDeps(): TotalDeps {
    return {
        loadMessages: async () => {
            const store = new MessageStore();
            const all: SourceMessage[] = [];
            for (const groupId of store.listThreads()) all.push(...(await store.readThread(groupId)));
            return all;
        },
        readOverrides: (setId) => readOverrides(path.join(setOutputDir(setId), "overrides.json")),
        fill: runFillTemplate,
        templateTitle: readTemplateTitle,
        templatesSrc: path.join(config.dataDir, "mau bao cao new"),
        outDirFor: (day, setId) => {
            const dir = setReportDir(config.statusExportDir, setId, day);
            fs.mkdirSync(dir, { recursive: true });
            return dir;
        },
        trackerFile: DEFAULT_TOTAL_FILES.tracker,
        removeFile: (file) => fs.rmSync(file, { force: true }),
        leave: (day) => leaveForDay(day, realLeaveIO(), config.vision.leave),
        speed: (day) => loadSpeedByMessage(photoReportsDir(config.dataDir), addDays(day, -1)),
        minutes: (day) => loadMinutesByMessage(photoReportsDir(config.dataDir), addDays(day, -1)),
    };
}
