import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "./src/config/configCheck.js";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/** Unix ms for today at the given local hour:minute. */
function todayAt(hour: number, minute: number): number {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
}

/**
 * Zalo Desktop installs as C:\Users\<you>\AppData\Local\Programs\Zalo\Zalo-<version>\Zalo.exe
 * — the version segment changes on every auto-update, so this picks the
 * newest Zalo-* folder instead of hardcoding a version.
 */
function findZaloExe(): string | null {
    const programsDir = path.join(os.homedir(), "AppData", "Local", "Programs", "Zalo");
    if (!fs.existsSync(programsDir)) return null;

    const versionDirs = fs
        .readdirSync(programsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && d.name.startsWith("Zalo-"))
        .map((d) => d.name)
        .sort();
    const newest = versionDirs.at(-1);
    if (!newest) return null;

    const exePath = path.join(programsDir, newest, "Zalo.exe");
    return fs.existsSync(exePath) ? exePath : null;
}

/**
 * ĐÂY LÀ FILE DUY NHẤT CẦN SỬA để chỉnh cách các bot chạy. Chia 8 mục; mỗi thông số có ghi chú ý nghĩa, đơn vị và ví dụ.
 * Đổi giá trị xong thì KHỞI ĐỘNG LẠI bot liên quan (bot chỉ đọc file này lúc khởi động).
 * Xem toàn bộ giá trị hiện tại (khóa khác mặc định có dấu *): `npm run config:show`.
 * Giá trị sai bị từ chối khi khởi động, kèm tên khóa sai (xem src/config/configCheck.ts).
 */
export const config = {
    // ═══════════════════════════════════════════════════════════════════════
    // 1. ZALO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Cổng gỡ lỗi (Chrome DevTools) mà Zalo Desktop được mở ra để bot điều khiển.
     * Đổi khi cổng này bị chương trình khác chiếm. Ví dụ: 9333 thì Zalo được mở với --remote-debugging-port=9333.
     * Đọc bởi: mọi bot.
     */
    cdpPort: 9222,

    /** Địa chỉ suy ra từ cdpPort — http://127.0.0.1:<cdpPort>. Không sửa. */
    get cdpUrl(): string {
        return `http://127.0.0.1:${this.cdpPort}`;
    },

    /**
     * Đường dẫn Zalo.exe, tự dò (thư mục Zalo-<phiên bản> mới nhất). Chỉ đặt tay khi tự dò sai,
     * ví dụ "C:\\Users\\Admin\\AppData\\Local\\Programs\\Zalo\\Zalo-25.1.1\\Zalo.exe".
     * Zalo Desktop dựa trên Electron nên DOM đọc được qua CDP như trình duyệt; bot dùng lại phiên đăng nhập đang có,
     * không có bước quét QR nào.
     */
    zaloExePath: findZaloExe(),

    /**
     * Nếu Zalo chưa chạy với cổng gỡ lỗi thì tự tắt và mở lại. Cần cho chạy tự động không người trông; phiên đăng nhập
     * không mất vì cùng hồ sơ cục bộ. Đặt false nếu bạn muốn tự mở Zalo (bot sẽ báo lỗi thay vì mở lại giúp).
     */
    autoLaunchZalo: true,

    /** Nơi lưu tin đã cào (mỗi nhóm một file JSON) và các tệp trạng thái của bot. */
    dataDir: path.join(repoRoot, "data"),

    // ═══════════════════════════════════════════════════════════════════════
    // 2. NHÓM THEO DÕI
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Tên nhóm ĐÚNG NHƯ HIỆN Ở THANH BÊN Zalo. Chỉ nhóm nằm ở đây mới được theo dõi, cào và (nếu có trong
     * chat-rules.json) trả lời. Ví dụ thêm một nhóm: ["bot test", "LC_HoaSen1_TĐ", "LC_MoiThem_Q1"].
     * Đổi tên nhóm trong Zalo thì phải sửa ở đây. Không được trùng tên.
     */
    targets: ["bot test", "LC_ChuVănAn_BTAN", "LC_HoaSen1_TĐ", "LC_TríTuệViệt_BTAN", "LC_QuangTrungNguyễnHuệ_Q5"] as string[],

    /**
     * Nhóm KHÔNG BAO GIỜ gửi báo cáo buổi dạy (nhóm thử). Khôi phục không coi chúng là "thiếu báo cáo" và không cào lại
     * chúng. Phải là tập con của targets. Ví dụ: ["bot test"].
     */
    recoveryIgnoreTargets: ["bot test"] as string[],

    /**
     * Nhóm THỬ được ĐỌC NHƯ một nhóm trường thật khi trích xuất báo cáo: tên nhóm thử -> tên một nhóm trường thật, theo kiểu đặt tên
     * nhóm thật (cấp học_tên trường_khu vực). Nhờ vậy báo cáo gửi vào nhóm thử có trường, khu vực, mã phòng và ra một dòng trong Excel,
     * để chạy thử cả quy trình. Phòng máy lấy từ chính tin nhắn: ghi "Phòng Máy: PM3" để không trùng phòng thật PM1.
     * CHỈ ĐỂ THỬ: dòng của nhóm thử nằm trong file Excel THẬT của buổi. Khi thử xong, xóa dòng này (đặt {}), khởi động lại bot rồi dựng lại
     * buổi (npm run runner:once -- --day <ngày> --buoi <buổi>) thì dòng đó biến mất. Khóa phải nằm trong targets. Mặc định: {}.
     * Ví dụ: { "bot test": "LC_ChuVănAn_BTAN" }.
     */
    groupAliases: { "bot test": "LC_ChuVănAn_BTAN" } as Record<string, string>,

    // ═══════════════════════════════════════════════════════════════════════
    // 3. CÀO
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Chỉ giữ tin từ mốc này trở đi (unix ms) và ngừng cuộn khi cuộn qua mốc.
     * Ví dụ: todayAt(0, 0) cào từ đầu ngày; todayAt(7, 30) từ 07:30; null là không giới hạn (cuộn đến targetMessageCount).
     * LƯU Ý: giá trị này chỉ được tính MỘT LẦN lúc bot khởi động, nên bot chạy qua đêm giữ mốc của ngày hôm qua
     * (bot:runner không dùng nó mà tự tính lại mỗi vòng: từ đầu ngày hôm nay).
     */
    sinceTs: todayAt(6, 0) as number | null,

    /**
     * Chỉ giữ tin đến mốc này (unix ms); chỉ là bộ lọc kết quả, không ảnh hưởng việc cuộn.
     * Ví dụ: todayAt(12, 0) để chốt đúng buổi sáng. null là đến lúc chạy.
     * CHỈ áp dụng cho bot:scrape chạy tay: bot:runner và khôi phục luôn bỏ qua untilTs (nếu không, đặt 12:00 sẽ làm runner
     * âm thầm bỏ hết tin buổi chiều).
     */
    untilTs: null as number | null,

    /**
     * Trần an toàn số tin mỗi nhóm mỗi lần cào, kể cả khi chưa chạm sinceTs. Nhóm nhắn nhiều thì tăng lên
     * (đổi lại lần cào lâu hơn).
     */
    targetMessageCount: 2000,

    /**
     * Nghỉ ngẫu nhiên giữa hai bước cuộn (mili giây) để không dồn dập vào giao diện.
     * Cách tính: trung bình (500 + 1200) / 2 = 850 ms mỗi bước, cuộn 100 bước mất khoảng 85 giây.
     * Muốn cào nhanh hơn thì giảm (nhưng dễ làm Zalo giật). Yêu cầu 0 <= min <= max.
     */
    scrollDelayMs: { min: 500, max: 1200 },

    // ═══════════════════════════════════════════════════════════════════════
    // 4. WATCH (bot:watch). heartbeatSeconds và deadAfterSeconds cũng là nhịp tim và ngưỡng "chết" mà
    //    runner:status, chat:status và việc chống chạy trùng bot:runner dùng.
    // ═══════════════════════════════════════════════════════════════════════
    watch: {
        /**
         * Bao lâu watch ghi "tôi còn sống" vào data/.watch-state.json (cũng là nhịp tim của bot:runner).
         * Nhỏ hơn thì phát hiện chết nhanh hơn nhưng ghi file nhiều hơn. Đơn vị: giây.
         */
        heartbeatSeconds: 30,

        /**
         * Quá bấy nhiêu giây không có nhịp tim thì coi bot đã chết. NÊN BẰNG ÍT NHẤT 3 LẦN heartbeatSeconds
         * (cho phép trễ 2 nhịp); dưới 2 lần bị từ chối. Ví dụ: nhịp 30 thì đặt 90. Đơn vị: giây.
         */
        deadAfterSeconds: 90,

        /**
         * Khoảng "mù" (cả hai nguồn phát hiện cùng mất) ngắn hơn bấy nhiêu giây bị coi là nhiễu lúc khởi động,
         * không ghi thành gián đoạn. Đơn vị: giây.
         */
        minBlindSeconds: 60,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 5. RUNNER (bot:runner)
    // ═══════════════════════════════════════════════════════════════════════
    runner: {
        /**
         * Hàng chờ có nhóm thì chờ YÊN LẶNG bấy nhiêu giây rồi mới cào, để gom nhiều nhóm vào một vòng. "Yên lặng" tính từ tin
         * MỚI NHẤT của nhóm nằm trong hàng chờ. Ví dụ: nhóm A nhắn lúc 08:00:00 và tin cuối 08:00:20, đặt 120 thì cào lúc 08:02:20;
         * đặt 30 thì cào lúc 08:00:50 (nhanh hơn nhưng nhiều vòng nhỏ chiếm giao diện Zalo hơn). Đơn vị: giây.
         */
        quietSeconds: 30,

        /**
         * Trần chờ tính từ lúc nhóm ĐẦU TIÊN vào hàng chờ, để nhóm nhắn liên tục không bị hoãn mãi. Ví dụ: nhóm vào hàng chờ
         * 08:00:00 và nhắn liên tục, đặt 600 thì chắc chắn cào lúc 08:10:00. PHẢI >= quietSeconds. Đơn vị: giây.
         */
        maxWaitSeconds: 600,

        /**
         * Runner xem lại hàng chờ mỗi bấy nhiêu giây. Độ trễ tối đa xấp xỉ quietSeconds + pollSeconds. Nhỏ quá thì đọc file
         * dồn dập (dễ đụng lỗi EPERM trên Windows). Đơn vị: giây.
         */
        pollSeconds: 5,

        /**
         * Bao lâu kiểm một lần xem có báo cáo đã nằm trên đĩa mà chưa dựng vào Excel (do crash hoặc cào tay). Đơn vị: giây.
         */
        dirtyCheckSeconds: 60,

        /**
         * Sau khi một buổi DỰNG LỖI, đợi bấy nhiêu giây mới thử lại (tránh chiếm giao diện liên tục). Ví dụ: 300 là thử lại
         * mỗi 5 phút. Đơn vị: giây.
         */
        dirtyRetrySeconds: 300,

        /**
         * Sau khi bot:watch khởi động (nó tắt và mở lại Zalo), runner không đụng vào Zalo trong bấy nhiêu giây. Đặt đủ lâu để
         * watch gắn xong (thường 60 đến 90 giây). Đơn vị: giây.
         */
        watchWarmupSeconds: 90,

        /**
         * Sau bấy nhiêu vòng lỗi LIÊN TIẾP (lỗi cào hoặc đồng bộ; lỗi dựng của một buổi không tính) runner ngừng tự thử và
         * báo LỖI; hàng chờ vẫn giữ nguyên, phải khởi động lại tay. Đơn vị: số vòng.
         */
        maxConsecutiveFailures: 3,

        /**
         * Một nhóm cào LỖI (ví dụ không tìm thấy trong thanh bên Zalo) vẫn ở lại hàng chờ và được thử lại ở vòng sau,
         * tối đa bấy nhiêu lần tất cả; hết số lần thì bỏ khỏi hàng chờ và ghi log. Đơn vị: lần. Ví dụ 3: thử lần 1, 2, 3 rồi bỏ.
         * Đặt 1 nếu muốn nhóm lỗi bị bỏ ngay như trước.
         */
        maxScrapeAttempts: 3,

        /**
         * Hàng chờ cào (data/.scrape-events-<ngày>.jsonl) chỉ được nối thêm nên tự dọn theo ngày: sau mỗi lần cào, file sự kiện
         * của những ngày Việt Nam CŨ HƠN bấy nhiêu ngày bị xóa. Ngày hôm nay luôn được giữ. Ví dụ 3: đang là 26/09 thì giữ 23, 24, 25, 26
         * và xóa từ 22 trở về trước; một nhóm nằm chờ ở file đã xóa sẽ mất khỏi hàng chờ. Đặt 1 để chỉ giữ hôm nay và hôm qua
         * (file nhỏ nhất), đặt 7 nếu muốn giữ cả tuần. Đơn vị: ngày.
         */
        queueKeepDays: 3,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 6. KHÔI PHỤC (cào lại sau khi bot:watch từng chết)
    // ═══════════════════════════════════════════════════════════════════════
    recovery: {
        /**
         * Cào lại từ TRƯỚC lúc watch chết bấy nhiêu phút, để bắt tin đến sát lúc watch sập. Ví dụ: watch chết lúc 10:12 thì cào
         * từ 10:07 (nhưng không lùi quá đầu buổi). Đơn vị: phút.
         */
        marginMinutes: 5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 7. CHAT (bot:chat). Kịch bản trả lời nằm ở chat-rules.json, không nằm ở đây.
    // ═══════════════════════════════════════════════════════════════════════
    chat: {
        /** Bao lâu bot chat kiểm hộp thư một lần. Độ trễ trả lời tối thiểu xấp xỉ giá trị này cộng thời gian gửi. Đơn vị: giây. */
        pollSeconds: 3,

        /**
         * Nhịp tim của bot chat (data/.chat-state.json), dùng cho chat:status. chat:status coi bot chat là ĐÃ CHẾT khi quá
         * watch.deadAfterSeconds không có nhịp tim, nên deadAfterSeconds phải chứa ít nhất 2 nhịp này (ví dụ nhịp 30 với
         * deadAfterSeconds 90 là đúng; nhịp 60 bị từ chối). Đơn vị: giây.
         */
        heartbeatSeconds: 30,

        /**
         * Khi một lần gửi bị hoãn (ô soạn tin đang có chữ dở, chưa mở được nhóm), không đụng vào Zalo lại trong bấy nhiêu giây.
         * Cách tính: với maxReplyDelaySeconds là 180 trong chat-rules.json, đặt 45 cho tối đa khoảng 4 lần thử trước khi tin
         * bị bỏ vì quá hạn. Đơn vị: giây.
         */
        skipBackoffSeconds: 45,

        /** Sổ các câu bot vừa gửi được giữ bấy nhiêu phút rồi xóa (để bot:watch nhận ra tin dội lại). PHẢI dài hơn echoWindowSeconds. Đơn vị: phút. */
        sentLedgerMinutes: 10,

        /**
         * Một tin của chính tài khoản khớp một câu trong sổ, xuất hiện trong khoảng này thì được coi là tin dội lại của bot.
         * Tin cùng nội dung do người gõ sau khoảng này thì không bị nuốt. Đơn vị: giây.
         */
        echoWindowSeconds: 120,

        /**
         * Sau khi gửi xong một câu trả lời, bot có mở lại cuộc trò chuyện mà Zalo Desktop đang hiện TRƯỚC ĐÓ hay không.
         * false (mặc định): ở lại nhóm vừa trả lời (ví dụ bot test), ít thao tác giao diện hơn và bạn thấy ngay kết quả khi thử.
         * true: quay về nhóm cũ, dùng khi có người đang xem Zalo Desktop này và không muốn màn hình bị đổi. Ví dụ: runner vừa
         * cào nhóm LC_A và để nó mở; đặt true thì sau khi trả lời ở bot test, Zalo quay về LC_A. Kiểu: true hoặc false.
         */
        restorePreviousConversation: false,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 8. BUỔI HỌC (giờ Việt Nam). Sáng là từ 00:00 đến trước chieuFromHour.
    // ═══════════════════════════════════════════════════════════════════════
    sessions: {
        /** Giờ bắt đầu buổi chiều (0 đến 23). Ví dụ 12 nghĩa là chiều bắt đầu lúc 12:00. Đơn vị: giờ. */
        chieuFromHour: 12,

        /**
         * Giờ bắt đầu buổi tối; buổi chiều là từ chieuFromHour đến trước giờ này, buổi tối đến hết 24:00. Ví dụ đổi thành 17:
         * chiều 12:00 đến 17:00, tối từ 17:00; nhớ dời lịch chạy buổi chiều thành 17:05. Yêu cầu 0 < chieuFromHour < toiFromHour <= 23.
         * Đổi giờ chỉ ảnh hưởng dữ liệu mới; báo cáo đã dựng theo ranh giới cũ không tự dựng lại. Đơn vị: giờ.
         */
        toiFromHour: 18,
    },
};

export type BotConfig = typeof config;

for (const warning of validateConfig(config)) console.warn(`[config] ${warning}`);
