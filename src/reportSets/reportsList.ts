import { REPORT_DEFS, REPORT_KEYS } from "./registry.js";

/** Các dòng của `npm run reports:list`: mã, loại, tiêu đề tin nguồn, mẫu Excel và mẫu có trên máy này không (đúng thứ tự xuất/in). */
export function formatReportsList(templateExists: (file: string) => boolean): string[] {
    const lines = ["Mã báo cáo hợp lệ cho config.reportSets[].reports (đúng thứ tự xuất và in):"];
    for (const key of REPORT_KEYS) {
        const d = REPORT_DEFS[key];
        const kind = d.kind === "phase" ? "theo giai đoạn" : "theo ngày";
        lines.push(`  ${key} (${d.label}) | ${kind} | tin nguồn: ${d.source} | mẫu: ${d.layout.templateFile} | ${templateExists(d.layout.templateFile) ? "có sẵn" : "THIẾU (chép mẫu vào data/mau bao cao new/)"}`);
    }
    return lines;
}
