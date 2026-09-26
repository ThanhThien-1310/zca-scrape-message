import fs from "node:fs";
import path from "node:path";

/**
 * Ghi tệp "nguyên tử" (ghi tệp tạm rồi đổi tên đè lên) mà chịu được Windows.
 *
 * Trên Windows, đổi tên đè lên một tệp đang bị tiến trình khác mở (kể cả chỉ để đọc trong một phần nghìn giây) thất bại
 * với `EPERM`/`EBUSY`/`EACCES`. `bot:runner`, `bot:chat` và `watch:status` đọc các tệp trạng thái của `bot:watch` liên tục,
 * nên thỉnh thoảng nhịp tim của watch đụng độ; đo thật: khi có hai tiến trình đọc dồn dập thì 2991/3000 lần đổi tên lỗi.
 * Vì vậy: thử lại vài lần với khoảng nghỉ ngắn. Người gọi vẫn phải coi lỗi cuối cùng là có thể xảy ra (xem `swallow`).
 */
export interface AtomicFs {
    mkdirSync(dir: string, opts: { recursive: true }): unknown;
    writeFileSync(file: string, data: string, encoding: "utf8"): void;
    renameSync(from: string, to: string): void;
    rmSync(file: string, opts: { force: true }): void;
}

const RETRYABLE = new Set(["EPERM", "EBUSY", "EACCES"]);

const blockingSleep = (ms: number): void => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

export interface AtomicOptions {
    io?: AtomicFs;
    /** Số lần thử đổi tên tối đa (mặc định 20). */
    attempts?: number;
    /** Nghỉ giữa các lần thử, mili giây (mặc định 5). */
    sleepMs?: number;
    sleep?: (ms: number) => void;
}

export function writeFileAtomic(file: string, text: string, opts: AtomicOptions = {}): void {
    const io = opts.io ?? (fs as unknown as AtomicFs);
    const attempts = opts.attempts ?? 20;
    const sleepMs = opts.sleepMs ?? 5;
    const sleep = opts.sleep ?? blockingSleep;

    io.mkdirSync(path.dirname(file), { recursive: true });
    // Tên tạm riêng cho từng tiến trình: hai tiến trình cùng ghi một tệp không dẫm lên tệp tạm của nhau.
    const tmp = `${file}.${process.pid}.tmp`;
    io.writeFileSync(tmp, text, "utf8");

    let last: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            io.renameSync(tmp, file);
            return;
        } catch (err) {
            last = err;
            const code = (err as NodeJS.ErrnoException).code;
            if (!code || !RETRYABLE.has(code)) break;
            if (attempt < attempts) sleep(sleepMs);
        }
    }
    try {
        io.rmSync(tmp, { force: true });
    } catch {
        /* tệp tạm còn sót sẽ bị ghi đè ở lần sau */
    }
    throw last;
}

/**
 * Chạy `fn`; nếu nó ném lỗi thì cảnh báo và tiếp tục (trả về false) thay vì để lỗi thoát ra ngoài.
 * Dùng cho việc ghi nhịp tim/trạng thái trong `bot:watch`: mất một nhịp tim là vô hại, còn để nó làm chết tiến trình
 * (trình xử lý `uncaughtException`) thì mất luôn việc phát hiện tin.
 */
export function swallow(label: string, fn: () => void, warn: (message: string) => void = (m) => console.warn(m)): boolean {
    try {
        fn();
        return true;
    } catch (err) {
        warn(`[watch] ${label} lỗi, bỏ qua lần này: ${(err as Error).message}`);
        return false;
    }
}
