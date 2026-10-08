import path from "node:path";
import { groupAttendanceByDay } from "../lesson/attendanceDays.js";
import { ATTENDANCE_LAYOUT, attendanceHeaderCells, buildAttendanceRows } from "../lesson/attendanceRows.js";
import { buildCleaningRows, CLEANING_LAYOUT, cleaningHeaderCells } from "../lesson/cleaningRows.js";
import type { FillTemplateArgs } from "../lesson/excelFill.js";
import type { LeaveDay } from "../leave/buildDay.js";
import { LEAVE_LAYOUT } from "../leave/layout.js";
import { internetSpeedEntries } from "../lesson/internetSpeedReport.js";
import { minutesEntries } from "../lesson/minutesReport.js";
import { buildMinutesRows, MINUTES_LAYOUT, minutesHeaderCells } from "../lesson/minutesRows.js";
import type { MinutesForMessage } from "../minutes/measures.js";
import { buildInternetSpeedRows, INTERNET_SPEED_LAYOUT, internetSpeedHeaderCells } from "../lesson/internetSpeedRows.js";
import { buildMaintenanceRows, MAINTENANCE_LAYOUT, maintenanceHeaderCells } from "../lesson/maintenanceRows.js";
import type { SpeedForMessage } from "../speed/measures.js";
import { electricEntriesOfDay } from "../lesson/electricReport.js";
import { readTracker, staleName, writeTracker } from "../lesson/statusFileTracker.js";
import { buildFillSpecs, FILE_LAYOUT, legendFormulaCells, type FileLayout, type FormulaCell, type HeaderCell } from "../lesson/statusReportLayout.js";
import { hhmmVietnam } from "../lesson/time.js";
import type { ReportKey } from "../reportSets/registry.js";
import type { ResolvedSet } from "../reportSets/resolve.js";
import { autoFileName, inSlotWindow, type SlotName, type TotalSlot } from "./slots.js";
import { attendanceEntriesInWindow, cleaningEntriesInWindow, latestGradedPerRoom, maintenanceEntriesInWindow, reportsInWindow } from "./windowReports.js";
import type { Cell, Override, SourceMessage } from "../types/index.js";

/** Mọi thứ lõi cần từ bên ngoài, truyền vào để test được mà không cần Excel hay đĩa thật (bản thật: `realDeps.ts`). */
export interface TotalDeps {
    loadMessages(): Promise<SourceMessage[]>;
    readOverrides(setId: string): Override[];
    fill(args: FillTemplateArgs): string;
    templateTitle(templatePath: string, sheet: string): string;
    templatesSrc: string;
    outDirFor(day: string, setId: string): string;
    trackerFile: string;
    removeFile(file: string): void;
    /** Gọi TRƯỚC mỗi file: mỗi lần điền Excel chặn vòng lặp sự kiện (`execFileSync`), nên bot dùng nó để ghi nhịp tim giữa các file. */
    onProgress?(): void;
    /**
     * Dữ liệu LỊCH NGHỈ PHÉP của ngày `day`, dựng từ KẾT QUẢ ĐÃ ĐỌC trên đĩa (không bao giờ gọi agent); chỉ dùng khi bộ bật mã `leave`. Không khai hoặc ném lỗi thì file
     * nghỉ phép vẫn được xuất (không ô nào được điền; lỗi thành cảnh báo), nên một lỗi đọc dữ liệu nghỉ phép không làm mất 7 file kia.
     */
    leave?(day: string): LeaveDay;
    /** Các lần đo tốc độ mạng đã đọc (msgId của tin báo cáo -> lần đo) từ kết quả đã có trên đĩa, không gọi agent; chỉ dùng khi bộ bật mã `internetSpeed`. Không khai hoặc ném lỗi thì file vẫn xuất, tốc độ để trống. */
    speed?(day: string): Map<string, SpeedForMessage>;
    /** Các biên bản đã đọc (msgId của tin báo cáo -> biên bản) từ kết quả đã có trên đĩa, không gọi agent; chỉ dùng khi bộ bật mã `minutes`. Không khai hoặc ném lỗi thì file vẫn xuất, không có dòng nào. */
    minutes?(day: string): Map<string, MinutesForMessage>;
}

export interface TotalRunResult {
    slot: SlotName;
    day: string;
    /** Bộ báo cáo của kết quả này; vắng mặt ở kết quả gộp nhiều bộ (`runTotalForSets`). */
    setId?: string;
    /** Số file dự kiến (tổng số mã báo cáo của các bộ); vắng mặt thì coi là 7 (một bộ đủ 7 loại). */
    expected?: number;
    /** Tên các file đã ghi (theo thứ tự đầu ra). */
    files: string[];
    /** Số dòng dữ liệu của từng đầu ra, theo khoá `loa`, `mayTinh`, `netsupport`, `internet`, `dien`, `cleaning`, `attendance`. */
    counts: Record<string, number>;
    /** Khoá các đầu ra điền lỗi. */
    failed: string[];
    warnings: string[];
    /** Các file ĐÃ ghi thành công, theo thứ tự đầu ra: đường dẫn đầy đủ, sheet chính (sheet sẽ in) và số dòng dữ liệu. Bước in đọc danh sách này. */
    written: Array<{ name: string; file: string; sheet: string; rows: number }>;
}

/** Khoá tracker của file `-auto`: có `setId` (mỗi bộ ghi vào thư mục riêng) và tách khỏi khoá của 4 giai đoạn (`<bộ>|<ngày>|<giai đoạn>|<tiêu đề>`). */
export const totalTrackerKey = (setId: string, day: string, slot: SlotName, title: string): string => `${setId}|${day}|total-${slot}|${title}`;

/** Tên đầu ra gắn bộ (`<bộ>-<mã>`) cho kết quả gộp; không chứa dấu phân cách đường dẫn nên dùng được làm tên file tạm của bước in. */
export const qualify = (setId: string, key: string): string => `${setId}-${key}`;

interface Output {
    name: string;
    layout: FileLayout;
    rows: Array<Record<string, Cell>>;
    headerCells: HeaderCell[];
    formulaCells: FormulaCell[];
    /** Số dòng đã điền khi `rows` rỗng vì điền tại chỗ (nghỉ phép); thiếu thì dùng `rows.length`. */
    count?: number;
}

/**
 * Lõi của báo cáo tổng: dựng 7 file `-auto` của đợt `slot` từ kho tin hiện có (KHÔNG cào, KHÔNG đụng khoá cào, KHÔNG dùng
 * `output/output.json`). Mỗi file điền trong một tiến trình Excel riêng (`deps.fill`); file lỗi chỉ ghi cảnh báo, bản cũ của
 * nó được giữ và 6 file còn lại vẫn xuất. Sau khi file mới ghi xong mới xoá bản cũ CỦA ĐÚNG ĐỢT NÀY (qua tracker riêng).
 */
export async function runTotalOnce(opts: { slot: TotalSlot; now: number; set: ResolvedSet }, deps: TotalDeps): Promise<TotalRunResult> {
    const { slot, now, set } = opts;
    const day = slot.day;
    const messages = await deps.loadMessages();

    const reports = latestGradedPerRoom(reportsInWindow(messages, deps.readOverrides(set.id), slot));
    const specs = buildFillSpecs(reports, day, now, electricEntriesOfDay(messages, day));
    const cleaningRows = buildCleaningRows(cleaningEntriesInWindow(messages, slot), day);
    const attendanceRows = buildAttendanceRows(groupAttendanceByDay(attendanceEntriesInWindow(messages, slot)), day);
    const maintenanceRows = buildMaintenanceRows(maintenanceEntriesInWindow(messages, slot), day);
    let speedMap = new Map<string, SpeedForMessage>();
    const speedWarnings: string[] = [];
    if (set.reports.includes("internetSpeed") && deps.speed) {
        try {
            speedMap = deps.speed(day);
        } catch (err) {
            speedWarnings.push(`internetSpeed: ${(err as Error).message}`);
        }
    }
    let minutesMap = new Map<string, MinutesForMessage>();
    if (set.reports.includes("minutes") && deps.minutes) {
        try {
            minutesMap = deps.minutes(day);
        } catch (err) {
            speedWarnings.push(`minutes: ${(err as Error).message}`);
        }
    }
    const minutesRows = buildMinutesRows(minutesEntries(messages, (ts) => inSlotWindow(ts, slot), minutesMap));
    const internetRows = buildInternetSpeedRows(internetSpeedEntries(messages, (ts) => inSlotWindow(ts, slot), speedMap), day);
    let leave: LeaveDay | null = null;
    const leaveWarnings: string[] = [];
    if (set.reports.includes("leave") && deps.leave) {
        try {
            leave = deps.leave(day);
        } catch (err) {
            leaveWarnings.push(`leave: ${(err as Error).message}`);
        }
    }

    const outputs: Output[] = [
        ...(Object.keys(FILE_LAYOUT) as Array<keyof typeof FILE_LAYOUT>).map((key) => ({
            name: key,
            layout: FILE_LAYOUT[key],
            rows: specs[key].rows,
            headerCells: specs[key].headerCells,
            formulaCells: specs[key].formulaCells,
        })),
        {
            name: "cleaning",
            layout: CLEANING_LAYOUT,
            rows: cleaningRows,
            headerCells: cleaningHeaderCells(day, now),
            formulaCells: legendFormulaCells(CLEANING_LAYOUT, cleaningRows.length),
        },
        {
            name: "attendance",
            layout: ATTENDANCE_LAYOUT,
            rows: attendanceRows,
            headerCells: attendanceHeaderCells(day, now),
            formulaCells: [],
        },
        { name: "leave", layout: LEAVE_LAYOUT, rows: [], headerCells: leave?.headerCells ?? [], formulaCells: [], count: leave?.filled.length ?? 0 },
        { name: "maintenance", layout: MAINTENANCE_LAYOUT, rows: maintenanceRows, headerCells: maintenanceHeaderCells(day), formulaCells: legendFormulaCells(MAINTENANCE_LAYOUT, maintenanceRows.length) },
        { name: "internetSpeed", layout: INTERNET_SPEED_LAYOUT, rows: internetRows, headerCells: internetSpeedHeaderCells(day), formulaCells: [] },
        { name: "minutes", layout: MINUTES_LAYOUT, rows: minutesRows, headerCells: minutesHeaderCells(day), formulaCells: [] },
    ];

    const wanted = outputs.filter((o) => set.reports.includes(o.name as ReportKey));
    const outDir = deps.outDirFor(day, set.id);
    const hhmm = hhmmVietnam(now);
    const tracker = readTracker(deps.trackerFile);
    const result: TotalRunResult = { slot: slot.name, day, setId: set.id, expected: wanted.length, files: [], counts: {}, failed: [], warnings: [], written: [] };
    result.warnings.push(...speedWarnings, ...leaveWarnings, ...(leave?.warnings ?? []), ...(leave?.notes ?? []));

    for (const o of wanted) {
        deps.onProgress?.();
        result.counts[o.name] = o.count ?? o.rows.length;
        // Đọc tiêu đề mẫu nằm TRONG try: thiếu một file mẫu chỉ làm hỏng file đó, không được dừng các file còn lại (và làm mất sổ tracker).
        let title = "";
        let outName = "";
        let key = "";
        try {
            title = deps.templateTitle(path.join(deps.templatesSrc, o.layout.templateFile), o.layout.sheet);
            outName = autoFileName(title, day, hhmm);
            key = totalTrackerKey(set.id, day, slot.name, title);
            deps.fill({ name: `total-${o.name}`, templatesSrc: deps.templatesSrc, layout: o.layout, outDir, outName, rows: o.rows, headerCells: o.headerCells, formulaCells: o.formulaCells });
        } catch (err) {
            result.failed.push(o.name);
            result.warnings.push(`${o.name}: ${(err as Error).message}`);
            if (outName) {
                try {
                    deps.removeFile(path.join(outDir, outName)); // bản mới ghi dở: bỏ đi, giữ nguyên bản cũ
                } catch {
                    // bản ghi dở đang bị khoá thì để đó, lần sau ghi đè
                }
            }
            continue;
        }
        const old = staleName(tracker, key, outName);
        if (old) {
            try {
                deps.removeFile(path.join(outDir, old));
            } catch (err) {
                result.warnings.push(`không xoá được bản cũ "${old}" (đang mở trong Excel?): ${(err as Error).message}`);
            }
        }
        tracker[key] = outName;
        result.files.push(outName);
        result.written.push({ name: o.name, file: path.join(outDir, outName), sheet: o.layout.sheet, rows: o.count ?? o.rows.length });
    }

    writeTracker(tracker, deps.trackerFile);
    return result;
}

/**
 * Dựng các file `-auto` của đợt cho MỌI bộ, lần lượt theo thứ tự cấu hình. Mỗi bộ chạy trong try riêng: một bộ lỗi (không tạo được thư mục
 * của nó, kho tin hỏng...) chỉ là một mục `failed` mang id của bộ, các bộ khác vẫn xuất. Kho tin chỉ nạp MỘT lần cho cả đợt.
 */
export async function runTotalForSets(opts: { slot: TotalSlot; now: number; sets: ResolvedSet[] }, deps: TotalDeps): Promise<TotalRunResult> {
    let cached: Promise<SourceMessage[]> | null = null;
    const shared: TotalDeps = { ...deps, loadMessages: () => (cached ??= deps.loadMessages()) };
    const combined: TotalRunResult = { slot: opts.slot.name, day: opts.slot.day, files: [], counts: {}, failed: [], warnings: [], written: [], expected: 0 };
    for (const set of opts.sets) {
        combined.expected = (combined.expected ?? 0) + set.reports.length;
        try {
            const r = await runTotalOnce({ slot: opts.slot, now: opts.now, set }, shared);
            combined.files.push(...r.files);
            for (const [key, n] of Object.entries(r.counts)) combined.counts[qualify(set.id, key)] = n;
            combined.failed.push(...r.failed.map((key) => qualify(set.id, key)));
            combined.warnings.push(...r.warnings.map((w) => `${set.id}: ${w}`));
            combined.written.push(...r.written.map((w) => ({ ...w, name: qualify(set.id, w.name) })));
        } catch (err) {
            combined.failed.push(set.id);
            combined.warnings.push(`${set.id}: ${(err as Error).message}`);
        }
    }
    return combined;
}
