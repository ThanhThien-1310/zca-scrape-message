/** 10 mục theo thứ tự trong config.ts. */
export const SECTIONS = ["1. ZALO", "2. NHÓM THEO DÕI", "3. CÀO", "4. WATCH (bot:watch)", "5. RUNNER (bot:runner)", "6. KHÔI PHỤC", "7. CHAT (bot:chat)", "8. BUỔI HỌC", "9. GIAI ĐOẠN BÁO CÁO", "10. BÁO CÁO TỔNG (bot:total)", "11. IN TỰ ĐỘNG (bot:total)", "12. ĐỌC ẢNH (photos:*, nghỉ phép)"];

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
    { section: SECTIONS[0], path: "statusExportDir", unit: "", defaultLabel: "./data/export/trang-thai", readers: ["bot:runner", "runner:once", "bot:total", "total:once", "fill:status-reports"], note: "Thư mục gốc chứa báo cáo trạng thái, mỗi ngày ở <gốc>/<yyMM>/<yyMMdd>/. Đường dẫn tuyệt đối." },
    { section: SECTIONS[0], path: "reportSets", unit: "", defaultLabel: "một bộ NguyenVanA với đủ 8 loại", readers: ["bot:runner", "runner:once", "bot:total", "total:once", "fill:status-reports", "extract:reports"], note: "Các bộ báo cáo theo người phụ trách: id (tên thư mục) và reports (mã nội bộ). Không có mặc định; sai thì bộ/mục đó bị tắt và báo lỗi.", format: (v) => (Array.isArray(v) ? v.map((x) => { const set = x as { id?: unknown; reports?: unknown }; return `${String(set.id)} [${Array.isArray(set.reports) ? set.reports.join(", ") : "?"}]`; }).join(" | ") : String(v)) },

    { section: SECTIONS[1], path: "targets", unit: "", defaultLabel: "theo máy bạn", readers: ["bot:watch", "bot:runner", "bot:chat", "bot:scrape"], note: "Tên nhóm đúng như thanh bên Zalo; chỉ nhóm ở đây mới được theo dõi." },
    { section: SECTIONS[1], path: "groupAliases", unit: "", default: {}, readers: ["bot:runner", "bot:chat"], note: "Nhóm thử được đọc như một nhóm trường thật khi trích xuất (chỉ để thử; dòng nằm trong Excel thật).", format: (v) => (Object.keys(v as object).length === 0 ? "{} (không có)" : Object.entries(v as Record<string, string>).map(([k, a]) => `${k} -> ${a}`).join(", ")) },
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
    { section: SECTIONS[3], path: "watch.probeSeconds", unit: "giây", default: 30, readers: ["bot:watch"], note: "Kiểm tra Zalo còn trả lời cổng gỡ lỗi không; hai lần liên tiếp không trả lời thì tự tắt, mở lại Zalo và gắn lại." },
    { section: SECTIONS[3], path: "watch.silenceRestartMinutes", unit: "phút", default: 0, readers: ["bot:watch"], note: "Không nhận khung WebSocket nào quá bấy nhiêu phút thì tự khởi động lại Zalo; 0 là tắt." },
    { section: SECTIONS[3], path: "watch.reconnectMaxSeconds", unit: "giây", default: 300, readers: ["bot:watch"], note: "Thời gian chờ tối đa giữa hai lần nối lại sau khi mất kết nối." },
    { section: SECTIONS[4], path: "runner.errorRetryMinutes", unit: "phút", default: 10, readers: ["bot:runner"], note: "Sau khi ngừng vì lỗi liên tiếp, thử lại sau bấy nhiêu phút nếu còn việc; 0 là ngừng hẳn." },
    { section: SECTIONS[4], path: "runner.sweepMinutes", unit: "phút", default: 60, readers: ["bot:runner"], note: "Cứ bấy nhiêu phút xếp mọi nhóm vào hàng chờ để cào bù (lưới an toàn khi bot:watch mù); 0 là tắt." },
    { section: SECTIONS[4], path: "runner.queueKeepDays", unit: "ngày", default: 3, readers: ["bot:runner", "bot:scrape"], note: "Giữ file sự kiện của hàng chờ bấy nhiêu ngày (ngoài hôm nay); cũ hơn thì xóa sau mỗi lần cào." },

    { section: SECTIONS[5], path: "recovery.marginMinutes", unit: "phút", default: 5, readers: ["bot:runner", "recover:missing"], note: "Cào lại từ trước lúc watch chết bấy nhiêu phút." },

    { section: SECTIONS[6], path: "chat.pollSeconds", unit: "giây", default: 3, readers: ["bot:chat"], note: "Bao lâu kiểm hộp thư chat một lần." },
    { section: SECTIONS[6], path: "chat.heartbeatSeconds", unit: "giây", default: 30, readers: ["bot:chat"], note: "Nhịp tim của bot chat." },
    { section: SECTIONS[6], path: "chat.skipBackoffSeconds", unit: "giây", default: 45, readers: ["bot:chat"], note: "Sau một lần gửi bị hoãn, không đụng vào Zalo lại trong bấy nhiêu giây." },
    { section: SECTIONS[6], path: "chat.sentLedgerMinutes", unit: "phút", default: 10, readers: ["bot:chat", "bot:watch"], note: "Giữ sổ câu bot vừa gửi bấy nhiêu phút." },
    { section: SECTIONS[6], path: "chat.echoWindowSeconds", unit: "giây", default: 120, readers: ["bot:watch"], note: "Cửa sổ nhận ra tin dội lại của bot." },
    { section: SECTIONS[6], path: "chat.restorePreviousConversation", unit: "true/false", default: false, readers: ["bot:chat"], note: "Sau khi trả lời, quay về nhóm Zalo đang mở trước đó (true) hay ở lại nhóm vừa trả lời (false)." },

    { section: SECTIONS[7], path: "sessions.chieuFromHour", unit: "giờ", default: 12, readers: ["bot:runner", "extract:reports", "recover:missing"], note: "Giờ bắt đầu buổi chiều." },
    { section: SECTIONS[7], path: "sessions.toiFromHour", unit: "giờ", default: 18, readers: ["bot:runner", "extract:reports", "recover:missing"], note: "Giờ bắt đầu buổi tối." },
    { section: SECTIONS[8], path: "phases.morningEndFromHour", unit: "giờ", default: 9, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"cuối buổi sáng\"." },
    { section: SECTIONS[8], path: "phases.afternoonStartFromHour", unit: "giờ", default: 12.5, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"đầu buổi chiều\"." },
    { section: SECTIONS[8], path: "phases.afternoonEndFromHour", unit: "giờ", default: 15, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"cuối buổi chiều\"." },
    { section: SECTIONS[8], path: "phases.morningStartFromHour", unit: "giờ", default: 17.5, readers: ["extract:reports", "fill:report", "fill:status-reports"], note: "Giờ bắt đầu \"đầu buổi sáng NGÀY MAI\" (wrap qua nửa đêm)." },

    { section: SECTIONS[9], path: "total.windowStartHour", unit: "giờ", default: 6.5, readers: ["bot:total", "total:once"], note: "Giờ bắt đầu khung dữ liệu của mọi đợt báo cáo tổng; tin gửi trước mốc này không được tính." },
    { section: SECTIONS[9], path: "total.morningHour", unit: "giờ", default: 9, readers: ["bot:total", "total:once"], note: "Giờ chạy đợt sáng, cũng là cuối khung dữ liệu của đợt." },
    { section: SECTIONS[9], path: "total.afternoonHour", unit: "giờ", default: 15, readers: ["bot:total", "total:once"], note: "Giờ chạy đợt chiều (khung dữ liệu cộng dồn từ windowStartHour)." },
    { section: SECTIONS[9], path: "total.waitMaxMinutes", unit: "phút", default: 10, readers: ["bot:total"], note: "Đợi runner rảnh tối đa bấy nhiêu phút kể từ giờ đợt, rồi vẫn xuất kèm cảnh báo." },
    { section: SECTIONS[9], path: "total.refreshEveryMinutes", unit: "phút", default: 10, readers: ["bot:total"], note: "Lần xuất đầu thiếu dữ liệu thì xuất lại mỗi bấy nhiêu phút (hoặc ngay khi hàng chờ rỗng)." },
    { section: SECTIONS[9], path: "total.refreshUntilMinutes", unit: "phút", default: 60, readers: ["bot:total"], note: "Ngừng xuất lại sau bấy nhiêu phút kể từ giờ đợt." },
    { section: SECTIONS[9], path: "total.pollSeconds", unit: "giây", default: 5, readers: ["bot:total"], note: "Bao lâu xem lại một lần xem đã tới giờ đợt chưa." },

    { section: SECTIONS[10], path: "print.enabled", unit: "", default: false, readers: ["bot:total"], note: "Bật in tự động ra máy in mặc định sau lần xuất đầu của mỗi đợt; mặc định tắt cho tới khi máy in được kiểm chứng." },
    { section: SECTIONS[10], path: "print.centerPage", unit: "", default: true, readers: ["bot:total", "total:once"], note: "Khi in, căn nội dung giữa trang theo chiều ngang và đặt lề trái bằng lề phải (lấy lề lớn hơn); chỉ đổi bản in, không sửa file xuất." },
    { section: SECTIONS[10], path: "print.maxPagesPerFile", unit: "trang", default: 5, readers: ["bot:total", "total:once"], note: "Mỗi file in tối đa bấy nhiêu trang đầu; nhiều hơn thì cắt và ghi cảnh báo." },
    { section: SECTIONS[11], path: "vision.enabled", unit: "true/false", default: false, readers: ["bot:runner", "today"], note: "Bật việc đọc ảnh nghỉ phép tự động trong chu trình runner (gọi agent, tốn hạn mức). Tắt thì không gọi agent; các lệnh photos:* chạy tay luôn chạy được." },
    { section: SECTIONS[11], path: "vision.reader", unit: "", default: "openrouter", readers: ["photos:read", "photos:auto", "photos:golden"], note: "Cách đọc ảnh; hiện chỉ có openrouter (gọi API OpenRouter, khoá OPENROUTER_API_KEY trong .env hoặc biến môi trường)." },
    { section: SECTIONS[11], path: "vision.model", unit: "", default: "google/gemini-2.5-flash", readers: ["photos:read", "photos:auto", "photos:golden"], note: "Model OpenRouter cho lần đọc thứ nhất (phải đọc được ảnh)." },
    { section: SECTIONS[11], path: "vision.secondModel", unit: "", default: "google/gemini-2.5-flash", readers: ["photos:read", "photos:auto", "photos:golden"], note: "Model OpenRouter cho lần đọc thứ hai độc lập; đặt khác lần một để hai lần ít sai giống nhau." },
    { section: SECTIONS[11], path: "vision.timeoutSeconds", unit: "giây", default: 180, readers: ["photos:read", "photos:auto", "photos:golden"], note: "Chờ tối đa bấy nhiêu giây cho một lần gọi model đọc một bộ ảnh." },
    { section: SECTIONS[11], path: "vision.maxBundlesPerRun", unit: "bộ", default: 3, readers: ["photos:read", "photos:auto"], note: "Mỗi lần chạy (photos:read hoặc một chu trình runner) đọc tối đa bấy nhiêu bộ (chặn tốn hạn mức)." },
    { section: SECTIONS[11], path: "vision.bundle.gapMinutes", unit: "phút", default: 3, readers: ["photos:bundle", "photos:auto"], note: "Hai ảnh liên tiếp của cùng người cách nhau không quá bấy nhiêu phút thì cùng một bộ." },
    { section: SECTIONS[11], path: "vision.bundle.textWindowMinutes", unit: "phút", default: 10, readers: ["photos:bundle", "photos:auto"], note: "Tin chữ của cùng người trong khoảng bấy nhiêu phút quanh bộ được đính kèm." },
    { section: SECTIONS[11], path: "vision.speed.groups", unit: "", defaultLabel: "[\"bot test\"]", readers: ["photos:bundle", "photos:auto", "fill:internet-speed-report"], note: "Nhóm được đọc ảnh đo tốc độ mạng (báo cáo trạng thái kết nối internet); ảnh ở nhóm khác không bao giờ bị đọc." },
    { section: SECTIONS[11], path: "vision.leave.groups", unit: "", defaultLabel: "[\"bot test\"]", readers: ["photos:bundle", "photos:auto", "bot:total"], note: "Nhóm được đọc ảnh nghỉ phép (tên như trong targets); ảnh ở nhóm khác không bao giờ bị đọc." },
    { section: SECTIONS[11], path: "vision.leave.senders", unit: "", defaultLabel: "[] (mọi người)", readers: ["photos:bundle", "photos:auto"], note: "Chỉ đọc ảnh của các người gửi này; để trống là mọi người trong các nhóm trên." },
    { section: SECTIONS[11], path: "vision.leave.settleSeconds", unit: "giây", default: 20, readers: ["photos:bundle", "photos:auto"], note: "Bộ ảnh nghỉ phép đóng sau khi yên bấy nhiêu giây kể từ ảnh cuối; phải nhỏ hơn runner.quietSeconds." },
    { section: SECTIONS[11], path: "vision.leave.lookbackDays", unit: "ngày", default: 60, readers: ["fill:leave-report", "bot:total", "leave:show"], note: "Tìm ảnh nghỉ phép trong bấy nhiêu ngày gần nhất khi dựng file." },
    { section: SECTIONS[11], path: "vision.leave.maxPastDays", unit: "ngày", default: 7, readers: ["photos:read", "photos:auto", "fill:leave-report", "bot:total", "leave:show"], note: "Ngày bắt đầu nghỉ không sớm hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem." },
    { section: SECTIONS[11], path: "vision.leave.maxFutureDays", unit: "ngày", default: 120, readers: ["photos:read", "photos:auto", "fill:leave-report", "bot:total", "leave:show"], note: "Ngày bắt đầu nghỉ không muộn hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem." },
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
