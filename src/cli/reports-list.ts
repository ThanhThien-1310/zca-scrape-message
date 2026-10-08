import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { formatReportsList } from "../reportSets/reportsList.js";

/**
 * In các mã báo cáo hợp lệ để điền vào config.reportSets[].reports, kèm loại, tiêu đề tin nguồn, mẫu Excel và việc mẫu có trên máy này
 * không. Chỉ đọc.
 *
 *   npm run reports:list
 */
const templatesSrc = path.join(config.dataDir, "mau bao cao new");
for (const line of formatReportsList((file) => fs.existsSync(path.join(templatesSrc, file)))) console.log(line);
