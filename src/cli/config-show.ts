import { config } from "../../config.js";
import { formatConfig } from "../config/configDoc.js";
import { formatSetsReport, loadReportSets } from "../reportSets/cliSet.js";

/**
 * In toàn bộ cấu hình theo mục: giá trị hiện tại, mặc định, bot nào đọc, ý nghĩa. Khóa khác mặc định có dấu * ở đầu dòng.
 * Chỉ đọc; không kết nối gì.
 *
 *   npm run config:show
 */
console.log("Cấu hình hiện tại (sửa ở config.ts; đổi giá trị thì khởi động lại bot liên quan). Dấu * = khác mặc định.");
for (const line of formatConfig(config)) console.log(line);
for (const line of formatSetsReport(loadReportSets())) console.log(line);
