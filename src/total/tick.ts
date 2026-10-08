import { todayVietnam } from "../lesson/time.js";
import { decideTotal, giveUp, recordAfterCrash, recordAfterRun, shouldPrintAfterRun, withPrinted, type RunnerSnapshot, type SlotRecord } from "./decide.js";
import type { PrintSummary } from "./printFiles.js";
import type { TotalRunResult } from "./runTotal.js";
import { slotKey, slotsOfDay, type TotalSlot } from "./slots.js";
import type { SlotMap, TotalPhase } from "./totalState.js";

/** Mọi thứ một lần kiểm tra lịch của `bot:total` cần từ bên ngoài (bản thật nằm trong `src/cli/bot-total.ts`), để test được. */
export interface TickDeps {
    readSlots(): SlotMap;
    saveSlot(key: string, record: SlotRecord, now: number): void;
    readQueue(): string[];
    runnerSnapshot(now: number): RunnerSnapshot;
    runTotal(slot: TotalSlot, now: number): Promise<TotalRunResult>;
    setPhase(phase: TotalPhase): void;
    log(message: string): void;
    /** Đồng hồ thật, dùng đóng dấu `lastRunAt` SAU khi một lần xuất xong (có thể mất vài phút). */
    clock(): number;
    /** `config.print.enabled`: có tự in sau lần xuất đầu của mỗi đợt không. */
    printEnabled: boolean;
    /** In các file vừa xuất (src/total/printFiles.ts); có thể ném lỗi, tick sẽ nuốt và ghi log. */
    print(result: TotalRunResult): PrintSummary;
}

/**
 * Một lần kiểm tra lịch: duyệt hai đợt của hôm nay (`now`), hỏi `decideTotal`, rồi đợi, bỏ cuộc hoặc xuất (tối đa một lần xuất mỗi
 * lần kiểm tra). KHÔNG BAO GIỜ ném lỗi: lỗi ở bất cứ chỗ nào (đọc/ghi file trạng thái bị khoá, ghi kết quả lỗi...) chỉ được ghi vào
 * log và đưa bot về `idle`, để bot không chết im lặng và bỏ lỡ báo cáo 15:00.
 */
export async function tickTotal(now: number, deps: TickDeps): Promise<void> {
    try {
        const slots = deps.readSlots();
        let busy = false;
        for (const slot of slotsOfDay(todayVietnam(now))) {
            const key = slotKey(slot);
            const prev = slots[key];
            const decision = decideTotal({ now, slot, record: prev, runner: deps.runnerSnapshot(now), queue: deps.readQueue() });
            if (decision.action === "idle") continue;
            if (decision.action === "wait") {
                deps.setPhase("waiting");
                busy = true;
                break;
            }
            if (decision.action === "give-up") {
                deps.saveSlot(key, giveUp(prev!, "đã hết thời hạn xuất lại hoặc lỗi quá nhiều lần: không xuất lại nữa"), now);
                deps.log(`[total] đợt ${slot.name}: bỏ cuộc, không xuất lại nữa.`);
                continue;
            }
            deps.setPhase("running");
            busy = true;
            deps.log(`[total] xuất đợt ${slot.name} (${decision.kind}, ${decision.reason}).`);
            try {
                const result = await deps.runTotal(slot, now);
                const record = recordAfterRun(prev, decision, result, deps.clock());
                deps.saveSlot(key, record, deps.clock());
                for (const w of result.warnings) deps.log(`[total] cảnh báo: ${w}`);
                deps.log(`[total] đợt ${slot.name} xong: ${result.files.length}/${result.expected ?? 7} file${decision.complete ? "" : `, CHƯA ĐỦ (còn ${decision.pending.length} nhóm chưa cào)`}${result.failed.length > 0 ? `, lỗi: ${result.failed.join(", ")}` : ""}.`);
                if (shouldPrintAfterRun(prev, result, deps.printEnabled)) {
                    // Lỗi in KHÔNG được biến đợt đã xuất xong thành đợt lỗi (không có bản ghi sự cố) và không thử in lại (tránh in trùng).
                    try {
                        const summary = deps.print(result);
                        deps.saveSlot(key, withPrinted(record, summary, deps.clock()), deps.clock());
                        for (const w of summary.warnings) deps.log(`[total] cảnh báo in: ${w}`);
                        deps.log(`[total] đợt ${slot.name}: đã gửi lệnh in ${summary.sent.length} file; giấy ra hay chưa phải xem ở máy in.`);
                    } catch (err) {
                        deps.log(`[total] đợt ${slot.name}: lỗi khi in (file đã xuất xong, không thử in lại): ${(err as Error).message}`);
                    }
                }
            } catch (err) {
                deps.saveSlot(key, recordAfterCrash(prev, deps.clock(), (err as Error).message), deps.clock());
                deps.log(`[total] đợt ${slot.name} lỗi: ${(err as Error).message}`);
            }
            deps.setPhase("idle");
            break;
        }
        if (!busy) deps.setPhase("idle");
    } catch (err) {
        deps.log(`[total] lỗi vòng kiểm tra (bot vẫn chạy): ${(err as Error).message}`);
        try {
            deps.setPhase("idle");
        } catch {
            // không ghi được trạng thái thì thôi, vòng sau thử lại
        }
    }
}
