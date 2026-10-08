import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "./src/config/configCheck.js";
import type { ReportSetConfig } from "./src/types/index.js";

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

    /**
     * Thư mục GỐC chứa báo cáo trạng thái (7 file của 4 giai đoạn và 7 file `-auto` của bot:total). Mỗi ngày nằm ở
     * <gốc>/<yyMM>/<yyMMdd>/, ví dụ "D:/BaoCao" cho ra D:/BaoCao/2610/261001/TÌNH TRẠNG ÂM THANH_261001_T5_0900.xlsx.
     * Phải là đường dẫn TUYỆT ĐỐI (có thể là ổ mạng, tài khoản chạy bot cần quyền ghi); thư mục tự tạo nếu chưa có.
     * Mặc định để như cũ, nằm trong project. Đổi giá trị thì file cũ KHÔNG tự chuyển sang, bot chỉ dùng chỗ mới từ lần xuất sau
     * (file cũ ở chỗ cũ không bị xoá khi xuất lại). Cần khởi động lại bot:runner và bot:total sau khi đổi.
     */
    statusExportDir: path.join(repoRoot, "data", "export", "trang-thai"),

    /**
     * Bộ báo cáo theo NGƯỜI PHỤ TRÁCH. Mỗi bộ có `id` (tên thư mục của người: <statusExportDir>/<yyMM>/<yyMMdd>/<id>/, bot tự tạo) và
     * `reports` (các loại báo cáo của người đó, theo MÃ NỘI BỘ: netsupport, loa, internet, mayTinh, dien, cleaning, attendance; xem
     * `npm run reports:list`). KHÔNG có mặc định: bộ không khai `reports` thì không xuất gì. Mọi tin từ mọi nhóm trong `targets` đi qua
     * mọi bộ; một mã có thể nằm ở nhiều bộ. Cấu hình sai không làm bot dừng: phần sai bị tắt và báo lỗi ồn ào (màn hình khởi động,
     * `runner:status`, `total:status`, `config:show`). Khởi động lại bot:runner và bot:total sau khi đổi. Đổi `id` coi như bộ mới
     * (file cũ ở thư mục cũ không bị xoá).
     */
    reportSets: [
        { id: "Như", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] },
        // Nhi phụ trách 4 báo cáo mới: lịch nghỉ phép (leave) đã có; thời gian bảo trì phòng máy, trạng thái kết nối internet, quản lý biên bản trường chưa có mã
        // (cần viết code, xem docs/superpowers/specs): khi mỗi loại xong thì thêm mã của nó vào đây.
        { id: "Nhi", reports: ["leave", "maintenance", "internetSpeed", "minutes"] },
    ] as ReportSetConfig[],

    // ═══════════════════════════════════════════════════════════════════════
    // 2. NHÓM THEO DÕI
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Tên nhóm ĐÚNG NHƯ HIỆN Ở THANH BÊN Zalo. Chỉ nhóm nằm ở đây mới được theo dõi, cào và (nếu có trong
     * chat-rules.json) trả lời. Ví dụ thêm một nhóm: ["bot test", "LC_HoaSen1_TĐ", "LC_MoiThem_Q1"].
     * Đổi tên nhóm trong Zalo thì phải sửa ở đây. Không được trùng tên.
     */

    //"LC_ChuVănAn_BTAN", "LC_HoaSen1_TĐ", "LC_TríTuệViệt_BTAN", "LC_QuangTrungNguyễnHuệ_Q5
    targets: ["Test BC Kỹ thuật"] as string[],

    /**
     * Nhóm KHÔNG BAO GIỜ gửi báo cáo buổi dạy (nhóm thử). Khôi phục không coi chúng là "thiếu báo cáo" và không cào lại
     * chúng. Phải là tập con của targets. Ví dụ: ["bot test"].
     */
    recoveryIgnoreTargets: ["Test BC Kỹ thuật"] as string[],

    /**
     * Nhóm THỬ được ĐỌC NHƯ một nhóm trường thật khi trích xuất báo cáo: tên nhóm thử -> tên một nhóm trường thật, theo kiểu đặt tên
     * nhóm thật (cấp học_tên trường_khu vực). Nhờ vậy báo cáo gửi vào nhóm thử có trường, khu vực, mã phòng và ra một dòng trong Excel,
     * để chạy thử cả quy trình. Phòng máy lấy từ chính tin nhắn: ghi "Phòng Máy: PM3" để không trùng phòng thật PM1.
     * CHỈ ĐỂ THỬ: dòng của nhóm thử nằm trong file Excel THẬT của buổi. Khi thử xong, xóa dòng này (đặt {}), khởi động lại bot rồi dựng lại
     * buổi (npm run runner:once -- --day <ngày> --buoi <buổi>) thì dòng đó biến mất. Khóa phải nằm trong targets. Mặc định: {}.
     * Ví dụ: { "bot test": "LC_ChuVănAn_BTAN" }.
     */
    groupAliases: {} as Record<string, string>,

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
        heartbeatSeconds: 15,

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

        /**
         * Bao lâu bot:watch kiểm tra một lần xem Zalo còn trả lời trên cổng gỡ lỗi không. Hai lần liên tiếp không trả lời thì
         * tự tắt, mở lại Zalo và gắn lại (chạy 24/24 không cần ai khởi động lại tay). Đơn vị: giây.
         */
        probeSeconds: 30,

        /**
         * Quá bấy nhiêu phút KHÔNG nhận được bất kỳ khung WebSocket nào của Zalo (kể cả khung nhịp) thì coi như đã mù và tự
         * tắt, mở lại Zalo. 0 là tắt kiểm tra này (khuyến nghị lúc đầu: xem file data/.watch-frames.log vài ngày để biết ban đêm
         * Zalo có gửi khung nhịp không, rồi mới đặt, ví dụ 15). Đặt khi Zalo không gửi khung nhịp sẽ khiến Zalo bị khởi động lại
         * nhầm lúc vắng tin. Đơn vị: phút.
         */
        silenceRestartMinutes: 0,

        /**
         * Nối lại sau khi mất kết nối thì chờ giãn dần (5, 10, 20... giây) nhưng không quá bấy nhiêu giây giữa hai lần thử. Đơn vị: giây.
         */
        reconnectMaxSeconds: 300,
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

        /**
         * Sau khi runner ngừng vì lỗi liên tiếp (maxConsecutiveFailures), nó thử lại sau bấy nhiêu phút nếu hàng chờ còn việc,
         * thay vì nằm im tới khi có người khởi động lại. 0 là giữ cách cũ (ngừng hẳn). Đơn vị: phút.
         */
        errorRetryMinutes: 10,

        /**
         * Lưới an toàn khi bot:watch mù mà không biết: cứ bấy nhiêu phút runner tự xếp mọi nhóm (trừ nhóm chỉ chat) vào hàng chờ
         * để cào bù tin chữ từ đầu ngày. Ảnh album không cứu được bằng cách này (ảnh gốc chỉ tải được lúc bot:watch thấy tin).
         * 0 là tắt. Đơn vị: phút.
         */
        sweepMinutes: 60,
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

    // ═══════════════════════════════════════════════════════════════════════
    // 9. GIAI ĐOẠN BÁO CÁO (giờ Việt Nam) — thay cho buổi sáng/chiều/tối cũ.
    // ═══════════════════════════════════════════════════════════════════════
    /** Giai đoạn báo cáo trạng thái thiết bị (thay cho buổi sáng/chiều/tối cũ) — xem `phaseOf`/`classifyPhase` trong src/lesson/time.ts. */
    phases: {
        /** Giờ bắt đầu "cuối buổi sáng" (0-24, có thể lẻ). */
        morningEndFromHour: 9,
        /** Giờ bắt đầu "đầu buổi chiều". */
        afternoonStartFromHour: 12.5,
        /** Giờ bắt đầu "cuối buổi chiều". */
        afternoonEndFromHour: 15,
        /** Giờ bắt đầu "đầu buổi sáng NGÀY MAI" (wrap qua nửa đêm). Yêu cầu morningEndFromHour < afternoonStartFromHour < afternoonEndFromHour < morningStartFromHour. */
        morningStartFromHour: 17.5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 10. BÁO CÁO TỔNG (bot:total, giờ Việt Nam) — hai đợt mỗi ngày xuất 7 file `-auto`.
    // ═══════════════════════════════════════════════════════════════════════
    total: {
        /** Giờ bắt đầu khung dữ liệu của MỌI đợt (0-24, có thể lẻ). Ví dụ 6.5 là 6:30; tin gửi trước mốc này không được tính. */
        windowStartHour: 6.5,
        /** Giờ chạy đợt sáng, cũng là cuối khung dữ liệu của đợt: lấy tin từ windowStartHour đến trước giờ này. Ví dụ 9 là 9:00. */
        morningHour: 9,
        /** Giờ chạy đợt chiều: lấy tin từ windowStartHour đến trước giờ này (cộng dồn cả buổi sáng). Yêu cầu 0 <= windowStartHour < morningHour < afternoonHour <= 24. */
        afternoonHour: 15,
        /** Tới giờ đợt mà runner còn bận (hàng chờ chưa rỗng), đợi tối đa bấy nhiêu phút rồi vẫn xuất bằng dữ liệu có sẵn kèm cảnh báo. Đơn vị: phút. */
        waitMaxMinutes: 10,
        /** Lần xuất đầu thiếu dữ liệu vì runner bận thì xuất lại mỗi bấy nhiêu phút (hoặc ngay khi hàng chờ rỗng). Đơn vị: phút. */
        refreshEveryMinutes: 10,
        /** Ngừng xuất lại sau bấy nhiêu phút kể từ giờ đợt. Đơn vị: phút. */
        refreshUntilMinutes: 60,
        /** Bao lâu bot xem lại một lần xem đã tới giờ đợt chưa. Đơn vị: giây. */
        pollSeconds: 5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 11. IN TỰ ĐỘNG (bot:total) — in các file báo cáo tổng ngay sau lần xuất đầu tiên của mỗi đợt.
    // ═══════════════════════════════════════════════════════════════════════
    print: {
        /**
         * Bật in tự động. Mặc định TẮT cho tới khi bạn đã thấy máy in thật sự ra giấy. In ra MÁY IN MẶC ĐỊNH của Windows, 1 bản,
         * chỉ ở lần xuất đầu của mỗi đợt, MỌI file kể cả file chưa có dòng dữ liệu, chỉ sheet chính (VỆ SINH: sheet HANG NGAY). Lề, hướng giấy, khổ
         * giấy lấy theo cài đặt trang in lưu sẵn trong file mẫu `data/mau bao cao new`. Đổi xong thì KHỞI ĐỘNG LẠI bot:total.
         * Lệnh tay `total:once --print` luôn in, không phụ thuộc khoá này. Ví dụ: true.
         */
        enabled: true,
        /**
         * Khi in, căn nội dung GIỮA TRANG theo chiều ngang và đặt lề trái = lề phải (lấy lề LỚN hơn trong hai lề của file, nên bảng không
         * bị cắt). Chỉ áp cho bản in; file xuất ra không bị sửa. Cần vì nhiều mẫu đang có lề trái 0.5" mà lề phải 0.25", bảng in ra lệch
         * khỏi giữa trang. Đặt false nếu bạn muốn in đúng từng lề đã đặt trong mẫu. Ví dụ: true.
         */
        centerPage: false,
        /** Mỗi file in tối đa bấy nhiêu trang (từ trang đầu); nhiều hơn thì cắt và ghi cảnh báo, để một lần chạy không in cả chục tờ. Đơn vị: trang. */
        maxPagesPerFile: 5,
    },

    // ═══════════════════════════════════════════════════════════════════════
    // 12. ĐỌC ẢNH (photos:*, báo cáo LỊCH NGHỈ PHÉP) — agent đọc ảnh báo cáo gửi vào nhóm Zalo.
    // ═══════════════════════════════════════════════════════════════════════
    vision: {
        /** Bật việc đọc ảnh TỰ ĐỘNG trong bot:runner (chỉ ảnh của các nhóm ở `leave.groups`). Tắt thì bot không gọi agent; các lệnh photos:* chạy tay luôn chạy được. Ví dụ: true. */
        enabled: true,
        /** Cách đọc ảnh. Hiện chỉ có "openrouter" (gọi API OpenRouter; khoá đặt trong file .env hoặc biến môi trường OPENROUTER_API_KEY, KHÔNG ghi vào file này). */
        reader: "openrouter" as const,
        /** Model cho lần đọc thứ nhất, tên model của OpenRouter (phải đọc được ảnh). Ví dụ: "google/gemini-2.5-flash". */
        model: "dots-studio/dots-3-note-preview:free",
        /** Model cho lần đọc thứ hai (độc lập với lần một). Đặt model khác lần một để hai lần đọc ít sai giống nhau. Ví dụ: "google/gemini-2.5-flash". */
        secondModel: "dots-studio/dots-3-note-preview:free",
        /** Chờ tối đa bấy nhiêu giây cho MỘT lần gọi model đọc một bộ ảnh; quá hạn thì bộ đó báo lỗi và vẫn chưa đọc. Đơn vị: giây. */
        timeoutSeconds: 180,
        /** Mỗi lần chạy (photos:read hoặc một chu trình runner) đọc tối đa bấy nhiêu bộ (chặn tốn tiền API). Đơn vị: bộ. */
        maxBundlesPerRun: 3,
        bundle: {
            /** Hai ảnh liên tiếp của cùng một người cách nhau không quá bấy nhiêu phút thì cùng một bộ. Đơn vị: phút. */
            gapMinutes: 3,
            /** Tin chữ của cùng người gửi trong khoảng bấy nhiêu phút quanh bộ được đính kèm làm tiêu đề hoặc chú thích. Đơn vị: phút. */
            textWindowMinutes: 10,
        },
        speed: {
            /** Nhóm được đọc ảnh ĐO TỐC ĐỘ MẠNG (báo cáo TRẠNG THÁI KẾT NỐI INTERNET): nhóm nơi IT gửi "BÁO CÁO CUỐI BUỔI" kèm ảnh đo tốc độ (tên đúng như trong `targets`). Ảnh ở nhóm khác không bao giờ bị đọc. Ví dụ: ["bot test"]. */
            groups: ["Test BC Kỹ thuật"],
        },
        leave: {
            /** Nhóm được đọc ảnh nghỉ phép (tên đúng như trong `targets`). Ảnh ở nhóm khác không bao giờ bị đưa cho agent. Ví dụ: ["bot test"]. */
            groups: ["Test BC Kỹ thuật"],
            /** Chỉ đọc ảnh của các người gửi này (tên hiển thị trong Zalo). Để trống [] là đọc ảnh của mọi người trong các nhóm trên. */
            senders: [],
            /** Bộ ảnh nghỉ phép được coi là đủ ảnh sau khi yên bấy nhiêu giây kể từ ảnh cuối. PHẢI nhỏ hơn `runner.quietSeconds`, nếu không bộ chưa đóng khi chu trình chạy. Đơn vị: giây. */
            settleSeconds: 20,
            /** Tìm ảnh nghỉ phép trong bấy nhiêu ngày gần nhất khi dựng file; kỳ nghỉ của ảnh cũ hơn bị bỏ qua. Đơn vị: ngày. */
            lookbackDays: 60,
            /** Ngày bắt đầu nghỉ ghi trên ảnh không được sớm hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem (đọc sai năm). Đơn vị: ngày. */
            maxPastDays: 7,
            /** Ngày bắt đầu nghỉ ghi trên ảnh không được muộn hơn ngày gửi ảnh quá bấy nhiêu ngày, nếu không dòng đó chờ xem. Đơn vị: ngày. */
            maxFutureDays: 120,
        },
    },
};

export type BotConfig = typeof config;

for (const warning of validateConfig(config)) console.warn(`[config] ${warning}`);
