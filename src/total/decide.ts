import { config } from "../../config.js";
import type { Health, RunnerPhase } from "../types/index.js";
import type { TotalSlot } from "./slots.js";

/** Đợi runner rảnh tối đa chừng này kể từ giờ đợt, rồi xuất bằng dữ liệu có sẵn. */
export const WAIT_MAX_MS = config.total.waitMaxMinutes * 60_000;
/** Lần xuất đầu thiếu dữ liệu thì xuất lại sau chừng này. */
export const REFRESH_EVERY_MS = config.total.refreshEveryMinutes * 60_000;
/** Ngừng xuất lại sau chừng này kể từ giờ đợt. */
export const REFRESH_UNTIL_MS = config.total.refreshUntilMinutes * 60_000;
/** Bot xem lại lịch chừng này một lần. */
export const POLL_MS = config.total.pollSeconds * 1000;
/** Số lần lỗi liên tiếp của một đợt trước khi bỏ cuộc. */
export const MAX_FAILURES = 3;
/**
 * Hai lần xuất của cùng một đợt cách nhau ít nhất chừng này: tên file chỉ có giờ:phút (`HHmm`), nên hai lần trong cùng một
 * phút sẽ ghi CÙNG một tên và lần sau đè lên bản vừa xuất (Copy-Item của script Excel chép mẫu đè lên trước khi điền).
 */
export const MIN_RERUN_MS = 60_000;

/** Kết quả đã lưu của một đợt (data/.total-slots.json). */
export interface SlotRecord {
    firstRunAt: number;
    lastRunAt: number;
    /** Lần xuất gần nhất đã thấy hàng chờ rỗng và runner rảnh (hoặc runner không có gì để cào). */
    complete: boolean;
    /** Không xuất lại nữa. */
    final: boolean;
    /** Nhóm còn trong hàng chờ cào lúc xuất. */
    pending: string[];
    files: string[];
    warnings: string[];
    /** Số lần lỗi liên tiếp. */
    failures: number;
    /** Lúc đã GỬI LỆNH IN (không có nghĩa là giấy đã ra); vắng mặt = chưa in. Đợt đã có dấu này thì không bao giờ in lại. */
    printedAt?: number;
    /** Tên các file đã gửi lệnh in. */
    printed?: string[];
}

export interface RunnerSnapshot {
    health: Health;
    phase: RunnerPhase | null;
}

export interface DecideInput {
    now: number;
    slot: TotalSlot;
    record: SlotRecord | undefined;
    runner: RunnerSnapshot;
    queue: string[];
    waitMaxMs?: number;
    refreshEveryMs?: number;
    refreshUntilMs?: number;
    maxFailures?: number;
}

export type TotalDecision =
    | { action: "idle" }
    | { action: "wait"; reason: "runner-busy" | "refresh-later" }
    | { action: "run"; kind: "first" | "refresh"; reason: "runner-idle" | "runner-down" | "wait-expired" | "queue-drained" | "refresh-due"; complete: boolean; final: boolean; pending: string[] }
    | { action: "give-up" };

function run(kind: "first" | "refresh", reason: Extract<TotalDecision, { action: "run" }>["reason"], complete: boolean, final: boolean, pending: string[]): TotalDecision {
    return { action: "run", kind, reason, complete, final, pending };
}

/**
 * Hàm THUẦN quyết định, mỗi lần bot xem lịch, đợt `slot` cần làm gì:
 * - chưa tới giờ hoặc đã `final`: không làm gì;
 * - chưa có kết quả: runner rảnh (còn sống, `idle`, hàng chờ rỗng) thì xuất ngay và đủ; runner không chạy (chết, dừng, lỗi)
 *   thì KHÔNG đợi, xuất ngay (đủ nếu hàng chờ rỗng); runner bận thì đợi tới `waitMaxMs` rồi xuất bằng dữ liệu có sẵn (chưa đủ);
 * - đã xuất nhưng chưa đủ: bỏ cuộc khi quá `refreshUntilMs` hoặc lỗi quá `maxFailures` lần; đợi `refreshEveryMs` giữa các lần
 *   thử sau lỗi; hàng chờ rỗng và runner rảnh thì xuất lại lần cuối (đủ); runner không chạy thì đợi (không xuất lại vô ích);
 *   còn lại xuất lại mỗi `refreshEveryMs`.
 */
export function decideTotal(input: DecideInput): TotalDecision {
    const { now, slot, record, runner, queue } = input;
    const waitMaxMs = input.waitMaxMs ?? WAIT_MAX_MS;
    const refreshEveryMs = input.refreshEveryMs ?? REFRESH_EVERY_MS;
    const refreshUntilMs = input.refreshUntilMs ?? REFRESH_UNTIL_MS;
    const maxFailures = input.maxFailures ?? MAX_FAILURES;

    if (now < slot.atMs) return { action: "idle" };
    if (record?.final) return { action: "idle" };

    const down = runner.health !== "alive";
    const drained = !down && runner.phase === "idle" && queue.length === 0;
    const since = now - slot.atMs;

    if (!record) {
        if (drained) return run("first", "runner-idle", true, true, []);
        if (down) return run("first", "runner-down", queue.length === 0, queue.length === 0, queue);
        if (since >= waitMaxMs) return run("first", "wait-expired", false, false, queue);
        return { action: "wait", reason: "runner-busy" };
    }

    if (record.failures >= maxFailures || since >= refreshUntilMs) return { action: "give-up" };
    if (now - record.lastRunAt < MIN_RERUN_MS) return { action: "wait", reason: "refresh-later" };
    if (record.failures > 0 && now - record.lastRunAt < refreshEveryMs) return { action: "wait", reason: "refresh-later" };
    if (drained) return run("refresh", "queue-drained", true, true, []);
    if (down) {
        // Runner không chạy thì không có dữ liệu mới, nhưng file lỗi lần trước vẫn phải được thử lại (vd người dùng đã đóng Excel).
        if (record.failures > 0) return run("refresh", "runner-down", queue.length === 0, queue.length === 0, queue);
        return { action: "wait", reason: "refresh-later" };
    }
    if (now - record.lastRunAt >= refreshEveryMs) return run("refresh", "refresh-due", false, false, queue);
    return { action: "wait", reason: "refresh-later" };
}

export interface RunFlags {
    complete: boolean;
    final: boolean;
    pending: string[];
}

/** Kết quả đợt sau một lần chạy xong: file nào lỗi thì đợt chưa đủ, chưa final và tính một lần lỗi. */
export function recordAfterRun(prev: SlotRecord | undefined, flags: RunFlags, result: { files: string[]; failed: string[]; warnings: string[] }, now: number): SlotRecord {
    const failed = result.failed.length > 0;
    return {
        firstRunAt: prev?.firstRunAt ?? now,
        lastRunAt: now,
        complete: flags.complete && !failed,
        final: flags.final && !failed,
        pending: flags.pending,
        files: result.files,
        warnings: result.warnings,
        failures: failed ? (prev?.failures ?? 0) + 1 : 0,
        ...printStamp(prev),
    };
}

/** Dấu "đã gửi lệnh in" của kết quả trước, để các lần xuất lại sau đó không quên là đợt này đã in. */
function printStamp(prev: SlotRecord | undefined): Pick<SlotRecord, "printedAt" | "printed"> {
    return prev?.printedAt === undefined ? {} : { printedAt: prev.printedAt, printed: prev.printed ?? [] };
}

/** Kết quả đợt khi cả lần chạy ném lỗi (ví dụ không đọc được kho tin): giữ những gì đã biết và tính một lần lỗi. */
export function recordAfterCrash(prev: SlotRecord | undefined, now: number, message: string): SlotRecord {
    return {
        firstRunAt: prev?.firstRunAt ?? now,
        lastRunAt: now,
        complete: false,
        final: false,
        pending: prev?.pending ?? [],
        files: prev?.files ?? [],
        warnings: [`lỗi: ${message}`],
        failures: (prev?.failures ?? 0) + 1,
        ...printStamp(prev),
    };
}

/**
 * Có nên in sau lần chạy vừa xong không: chỉ khi in đang bật, lần chạy đã ghi được ít nhất một file, đợt CHƯA có lần xuất nào
 * thành công trước đó (các lần xuất lại không tự in) và chưa từng gửi lệnh in.
 */
export function shouldPrintAfterRun(prev: SlotRecord | undefined, result: { files: string[] }, enabled: boolean): boolean {
    if (!enabled || result.files.length === 0) return false;
    if (prev !== undefined && prev.files.length > 0) return false;
    return prev?.printedAt === undefined;
}

/** Đóng dấu đã gửi lệnh in (giờ và các file) vào kết quả đợt, kèm cảnh báo của bước in. */
export function withPrinted(record: SlotRecord, summary: { sent: string[]; warnings: string[] }, now: number): SlotRecord {
    return { ...record, printedAt: now, printed: summary.sent, warnings: [...record.warnings, ...summary.warnings] };
}

/** Đánh dấu đợt không xuất lại nữa, kèm lý do trong cảnh báo. */
export function giveUp(prev: SlotRecord, reason: string): SlotRecord {
    return { ...prev, final: true, warnings: [...prev.warnings, reason] };
}

/**
 * Chạy tay `total:once --set X` chỉ xuất MỘT phần các bộ: nếu vẫn ghi đợt là "xong, không xuất lại" (`final`) thì `bot:total` sẽ không bao giờ xuất
 * các bộ còn lại của đợt đó. Chỉ ghi đợt khi lần chạy phủ MỌI bộ đang chạy.
 */
export function shouldRecordSlot(chosenSetIds: string[], activeSetIds: string[]): boolean {
    return activeSetIds.length > 0 && activeSetIds.every((id) => chosenSetIds.includes(id));
}
