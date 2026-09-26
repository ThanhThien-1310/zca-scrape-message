/** 8 mục theo thứ tự trong config.ts. */
export const SECTIONS = ["1. ZALO", "2. NHÓM THEO DÕI", "3. CÀO", "4. WATCH (bot:watch)", "5. RUNNER (bot:runner)", "6. KHÔI PHỤC", "7. CHAT (bot:chat)", "8. BUỔI HỌC"];

export interface Setting {
    section: string;
    /** Đường dẫn khóa trong `config`, ví dụ "runner.quietSeconds". */
    path: string;
    unit: string;
    /** Giá trị mặc định (để đánh dấu * khi bạn đã đổi); bỏ trống với giá trị phụ thuộc máy hoặc ngày. */
    default?: unknown;
    /** Mô tả mặc định khi nó không cố định (ví dụ "06:00 hôm nay"). */
    defaultLabel?: string;
    /** Bot nào đọc thông số này. */
    readers: string[];
    /** Một dòng ý nghĩa; bản đầy đủ kèm ví dụ nằm ở chú thích trong config.ts. */
    note: string;
    format?: (value: unknown) => string;
}

const ALL = ["bot:watch", "bot:runner", "bot:chat", "bot:scrape"];
const hhmm = (ts: unknown): string => {
    if (ts === null) return "không giới hạn";
    const d = new Date(ts as number);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export const SETTINGS: Setting[] = [
    { section: SECTIONS[0], path: "cdpPort", unit: "", default: 9222, readers: ALL, note: "Cổng gỡ lỗi mà Zalo Desktop được mở ra để bot điều khiển." },
    { section: SECTIONS[0], path: "zaloExePath", unit: "", defaultLabel: "tự dò", readers: ALL, note: "Đường dẫn Zalo.exe; chỉ đặt tay khi tự dò sai." },
    { section: SECTIONS[0], path: "autoLaunchZalo", unit: "", default: true, readers: ALL, note: "Tự tắt và mở lại Zalo khi chưa có cổng gỡ lỗi." },
    { section: SECTIONS[0], path: "dataDir", unit: "", defaultLabel: "./data", readers: ALL, note: "Nơi lưu tin đã cào và các tệp trạng thái." },

    { section: SECTIONS[1], path: "targets", unit: "", defaultLabel: "theo máy bạn", readers: ["bot:watch", "bot:runner", "bot:chat", "bot:scrape"], note: "Tên nhóm đúng như thanh bên Zalo; chỉ nhóm ở đây mới được theo dõi." },
    { section: SECTIONS[1], path: "recoveryIgnoreTargets", unit: "", defaultLabel: "bot test", readers: ["bot:runner", "recover:missing"], note: "Nhóm không gửi báo cáo buổi dạy; khôi phục không cào lại chúng." },

    { section: SECTIONS[2], path: "sinceTs", unit: "mốc giờ", defaultLabel: "06:00 hôm nay", readers: ["bot:scrape", "recover:missing"], note: "Chỉ giữ tin từ mốc này; tính một lần lúc bot khởi động.", format: hhmm },
    { section: SECTIONS[2], path: "untilTs", unit: "mốc giờ", default: null, readers: ["bot:scrape"], note: "Chỉ giữ tin đến mốc này (bộ lọc kết quả).", format: hhmm },
    { section: SECTIONS[2], path: "targetMessageCount", unit: "tin", default: 2000, readers: ["bot:scrape", "bot:runner"], note: "Trần an toàn số tin mỗi nhóm mỗi lần cào." },
    { section: SECTIONS[2], path: "scrollDelayMs", unit: "ms", default: { min: 500, max: 1200 }, readers: ["bot:scrape", "bot:runner"], note: "Nghỉ ngẫu nhiên giữa hai bước cuộn.", format: (v) => `${(v as { min: number }).min}–${(v as { max: number }).max} ms` },

    { section: SECTIONS[3], path: "watch.heartbeatSeconds", unit: "giây", default: 30, readers: ["bot:watch", "bot:runner"], note: "Bao lâu ghi nhịp tim (cũng là nhịp tim của bot:runner)." },
    { section: SECTIONS[3], path: "watch.deadAfterSeconds", unit: "giây", default: 90, readers: ["bot:watch", "bot:runner", "bot:chat"], note: "Quá bấy nhiêu giây không có nhịp tim thì coi bot đã chết." },
    { section: SECTIONS[3], path: "watch.minBlindSeconds", unit: "giây", default: 60, readers: ["bot:watch", "bot:runner"], note: "Khoảng mù ngắn hơn giá trị này bị coi là nhiễu khởi động." },

    { section: SECTIONS[4], path: "runner.quietSeconds", unit: "giây", default: 120, readers: ["bot:runner"], note: "Hàng chờ yên lặng bấy nhiêu giây rồi mới cào." },
    { section: SECTIONS[4], path: "runner.maxWaitSeconds", unit: "giây", default: 600, readers: ["bot:runner"], note: "Trần chờ tính từ nhóm đầu tiên vào hàng chờ." },
    { section: SECTIONS[4], path: "runner.pollSeconds", unit: "giây", default: 5, readers: ["bot:runner"], note: "Bao lâu xem lại hàng chờ một lần." },
    { section: SECTIONS[4], path: "runner.dirtyCheckSeconds", unit: "giây", default: 60, readers: ["bot:runner"], note: "Bao lâu kiểm báo cáo chưa dựng vào Excel." },
    { section: SECTIONS[4], path: "runner.dirtyRetrySeconds", unit: "giây", default: 300, readers: ["bot:runner"], note: "Thử lại một buổi dựng lỗi sau bấy nhiêu giây." },
    { section: SECTIONS[4], path: "runner.watchWarmupSeconds", unit: "giây", default: 90, readers: ["bot:runner"], note: "Không đụng vào Zalo trong bấy nhiêu giây sau khi bot:watch khởi động." },
    { section: SECTIONS[4], path: "runner.maxConsecutiveFailures", unit: "vòng", default: 3, readers: ["bot:runner"], note: "Bấy nhiêu vòng lỗi liên tiếp thì runner ngừng tự thử." },
    { section: SECTIONS[4], path: "runner.maxScrapeAttempts", unit: "lần", default: 3, readers: ["bot:runner", "bot:scrape"], note: "Nhóm cào lỗi ở lại hàng chờ, thử tối đa bấy nhiêu lần rồi bỏ." },

    { section: SECTIONS[5], path: "recovery.marginMinutes", unit: "phút", default: 5, readers: ["bot:runner", "recover:missing"], note: "Cào lại từ trước lúc watch chết bấy nhiêu phút." },

    { section: SECTIONS[6], path: "chat.pollSeconds", unit: "giây", default: 3, readers: ["bot:chat"], note: "Bao lâu kiểm hộp thư chat một lần." },
    { section: SECTIONS[6], path: "chat.heartbeatSeconds", unit: "giây", default: 30, readers: ["bot:chat"], note: "Nhịp tim của bot chat." },
    { section: SECTIONS[6], path: "chat.skipBackoffSeconds", unit: "giây", default: 45, readers: ["bot:chat"], note: "Sau một lần gửi bị hoãn, không đụng vào Zalo lại trong bấy nhiêu giây." },
    { section: SECTIONS[6], path: "chat.sentLedgerMinutes", unit: "phút", default: 10, readers: ["bot:chat", "bot:watch"], note: "Giữ sổ câu bot vừa gửi bấy nhiêu phút." },
    { section: SECTIONS[6], path: "chat.echoWindowSeconds", unit: "giây", default: 120, readers: ["bot:watch"], note: "Cửa sổ nhận ra tin dội lại của bot." },

    { section: SECTIONS[7], path: "sessions.chieuFromHour", unit: "giờ", default: 12, readers: ["bot:runner", "extract:reports", "recover:missing"], note: "Giờ bắt đầu buổi chiều." },
    { section: SECTIONS[7], path: "sessions.toiFromHour", unit: "giờ", default: 18, readers: ["bot:runner", "extract:reports", "recover:missing"], note: "Giờ bắt đầu buổi tối." },
];

const getPath = (obj: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o === undefined || o === null ? undefined : (o as Record<string, unknown>)[k]), obj);

function show(setting: Setting, value: unknown): string {
    if (setting.format) return setting.format(value);
    if (Array.isArray(value)) return value.join(", ");
    if (value === null || value === undefined) return String(value);
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return setting.unit && typeof value === "number" ? `${text} ${setting.unit}` : text;
}

/** In từng mục với giá trị hiện tại, mặc định, bot nào đọc. Khóa khác mặc định có dấu `*` ở đầu dòng. */
export function formatConfig(cfg: object, settings: Setting[] = SETTINGS): string[] {
    const lines: string[] = [];
    for (const section of SECTIONS) {
        lines.push("", `── ${section} ──`);
        for (const s of settings.filter((x) => x.section === section)) {
            const value = getPath(cfg, s.path);
            const differs = s.default !== undefined && JSON.stringify(value) !== JSON.stringify(s.default);
            const def = s.default !== undefined ? show(s, s.default) : (s.defaultLabel ?? "-");
            lines.push(`${differs ? " * " : "   "}${s.path} = ${show(s, value)}   (mặc định ${def}) | đọc bởi: ${s.readers.join(", ")} | ${s.note}`);
        }
    }
    return lines;
}
