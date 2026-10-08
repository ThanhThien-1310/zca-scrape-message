import path from "node:path";
import { outputDir, setOutputDir } from "../core/paths.js";
import type { ResolvedSet } from "./resolve.js";

/**
 * Trước khi có bộ báo cáo, mọi chỉnh sửa tin nằm ở MỘT `output/overrides.json`. Giờ mỗi bộ đọc `output/<id>/overrides.json` của riêng
 * nó (sửa dữ liệu của bộ này không đụng bộ khác), nên file cũ ở gốc không còn được dùng. Không tự chép cho mọi bộ (chủ ý: mỗi người tự
 * có chỉnh sửa của mình); thay vào đó báo ồn ào kèm lệnh chép tay. null nếu không có gì cần báo.
 */
export function legacyOverridesWarning(sets: ResolvedSet[], exists: (file: string) => boolean): string | null {
    const legacy = path.join(outputDir, "overrides.json");
    if (!exists(legacy)) return null;
    const missing = sets.filter((s) => !exists(path.join(setOutputDir(s.id), "overrides.json")));
    if (missing.length === 0) return null;
    const names = missing.map((s) => `"${s.id}"`).join(", ");
    const sample = missing[0];
    return `còn file chỉnh sửa cũ ${legacy} nhưng các bộ ${names} chưa có overrides.json riêng nên chỉnh sửa đó KHÔNG còn được áp dụng. Chép tay vào đúng bộ cần, ví dụ: New-Item -ItemType Directory -Force "${setOutputDir(sample.id)}"; Copy-Item "${legacy}" "${path.join(setOutputDir(sample.id), "overrides.json")}"`;
}
