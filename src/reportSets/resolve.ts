import { isReportKey, REPORT_DEFS, REPORT_KEYS, type ReportKey } from "./registry.js";

/** Một bộ đã qua kiểm tra: chỉ chứa mã hợp lệ, theo thứ tự xuất/in của bảng đăng ký. */
export interface ResolvedSet {
    id: string;
    reports: ReportKey[];
    /** Mã dựng theo giai đoạn (đọc từ tin "báo cáo đầu/cuối buổi dạy"). */
    phaseKeys: ReportKey[];
    /** Mã dựng theo ngày (điện, vệ sinh, nội quy). */
    dayKeys: ReportKey[];
}

export interface SetProblem {
    level: "error" | "warning";
    /** Bộ liên quan; null khi vấn đề chung (không có bộ nào, id trùng...). */
    setId: string | null;
    message: string;
}

export interface ResolveResult {
    active: ResolvedSet[];
    problems: SetProblem[];
}

const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** null nếu `id` dùng được làm tên thư mục trên Windows; ngược lại là lý do (tiếng Việt). */
export function invalidSetIdReason(id: unknown): string | null {
    if (typeof id !== "string") return "id phải là chuỗi";
    if (id.trim() === "") return "id không được rỗng";
    if (id !== id.trim()) return "id không được có khoảng trắng ở đầu hoặc cuối";
    if (INVALID_CHARS.test(id)) return 'id không được chứa \\ / : * ? " < > | hay ký tự điều khiển';
    if (id.endsWith(".")) return "id không được kết thúc bằng dấu chấm";
    if (RESERVED_NAMES.test(id.split(".")[0])) return `id "${id}" là tên thiết bị dành riêng của Windows`;
    if (id.length > 100) return "id dài quá 100 ký tự";
    return null;
}

/**
 * Đọc `config.reportSets`. KHÔNG BAO GIỜ ném lỗi: phần nào sai thì bị tắt và thành một `SetProblem`, phần còn lại vẫn chạy
 * (bot không dừng vì một lỗi gõ ở bộ này). Việc đưa các vấn đề ra màn hình/`runner:status` là của nơi gọi (`cliSet.ts`).
 */
export function resolveReportSets(raw: unknown): ResolveResult {
    const problems: SetProblem[] = [];
    const error = (setId: string | null, message: string): void => void problems.push({ level: "error", setId, message });
    const warn = (setId: string | null, message: string): void => void problems.push({ level: "warning", setId, message });

    if (!Array.isArray(raw)) {
        error(null, `reportSets phải là một mảng các bộ { id, reports } (đang là ${raw === undefined ? "chưa khai" : raw === null ? "null" : typeof raw}). Bot không xuất file nào cho tới khi sửa config.ts.`);
        return { active: [], problems };
    }
    if (raw.length === 0) {
        error(null, "reportSets đang rỗng: không có bộ nào xuất file. Thêm ít nhất một bộ { id, reports } trong config.ts.");
        return { active: [], problems };
    }

    interface Candidate {
        index: number;
        id: string;
        reports: unknown;
    }
    const candidates: Candidate[] = [];
    raw.forEach((entry, index) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            error(null, `reportSets[${index}] phải là một đối tượng { id, reports }. Mục này bị bỏ qua.`);
            return;
        }
        const { id, reports } = entry as Record<string, unknown>;
        const reason = invalidSetIdReason(id);
        if (reason !== null) {
            error(typeof id === "string" ? id : null, `reportSets[${index}]: ${reason}. Bộ này bị tắt.`);
            return;
        }
        candidates.push({ index, id: id as string, reports });
    });

    // Windows không phân biệt hoa thường: "NguyenVanA" và "nguyenvana" là CÙNG một thư mục.
    const byLower = new Map<string, Candidate[]>();
    for (const c of candidates) byLower.set(c.id.toLowerCase(), [...(byLower.get(c.id.toLowerCase()) ?? []), c]);
    const unique: Candidate[] = [];
    for (const group of byLower.values()) {
        if (group.length === 1) unique.push(group[0]);
        else error(null, `id trùng nhau (không phân biệt hoa thường): ${group.map((c) => `"${c.id}"`).join(", ")}. Các bộ này đều bị tắt.`);
    }
    unique.sort((a, b) => a.index - b.index);

    const active: ResolvedSet[] = [];
    for (const c of unique) {
        if (!Array.isArray(c.reports) || c.reports.length === 0) {
            error(c.id, `bộ "${c.id}" chưa khai reports (hoặc để rỗng) nên không xuất gì. Khai các mã: ${REPORT_KEYS.join(", ")}.`);
            continue;
        }
        const wanted = new Set<ReportKey>();
        for (const item of c.reports) {
            if (!isReportKey(item)) {
                error(c.id, `bộ "${c.id}": mã báo cáo ${JSON.stringify(item)} không tồn tại, bỏ qua mục này. Mã hợp lệ: ${REPORT_KEYS.join(", ")}.`);
                continue;
            }
            if (wanted.has(item)) {
                warn(c.id, `bộ "${c.id}": mã "${item}" khai hai lần, chỉ tính một.`);
                continue;
            }
            wanted.add(item);
        }
        const reports = REPORT_KEYS.filter((k) => wanted.has(k));
        if (reports.length === 0) {
            error(c.id, `bộ "${c.id}" không còn mã báo cáo hợp lệ nào nên bị tắt.`);
            continue;
        }
        active.push({ id: c.id, reports, phaseKeys: reports.filter((k) => REPORT_DEFS[k].kind === "phase"), dayKeys: reports.filter((k) => REPORT_DEFS[k].kind === "day") });
    }

    for (const key of REPORT_KEYS) {
        const owners = active.filter((s) => s.reports.includes(key)).map((s) => s.id);
        if (owners.length > 1) warn(null, `mã "${key}" có ở nhiều bộ (${owners.join(", ")}): file được xuất ra cả các thư mục đó.`);
    }
    if (active.length === 0) error(null, "Không có bộ báo cáo hợp lệ nào: bot không xuất file nào cho tới khi sửa config.ts.");
    return { active, problems };
}
