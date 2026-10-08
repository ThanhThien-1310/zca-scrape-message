# zca-scrape-message

Đọc lịch sử tin nhắn của các nhóm/hội thoại chỉ định từ **Zalo Desktop**
(app Windows, không phải web), theo dõi tin mới theo thời gian thực, ghi ra
file JSON, đồng bộ lên SQL Server, dựng file Excel báo cáo buổi dạy và
(tùy chọn) tự động trả lời trong một số nhóm theo kịch bản có sẵn. Không có
bước đăng nhập riêng của bot — nội dung tin nhắn luôn đọc qua DOM của phiên
Zalo Desktop bạn đã đăng nhập sẵn theo thói quen dùng hàng ngày; chế độ
theo dõi thời gian thực còn quan sát thêm WebSocket nội bộ mà Zalo Desktop
tự mở tới backend của nó (qua CDP `Network` domain) để phát hiện tin mới
nhanh hơn. Phần **đọc** không gửi gì đi; chỉ `bot:chat` (tùy chọn, mặc định
không bật) gửi tin, bằng cách gõ vào ô soạn tin của chính phiên Zalo Desktop
đó.

> [!NOTE]
> Đây là công cụ tự động hoá cá nhân, không phải sản phẩm dùng cho tổ chức
> hay nhiều người dùng. Nó phụ thuộc trực tiếp vào cấu trúc DOM hiện tại của
> Zalo Desktop — xem [Bảo trì & giới hạn đã biết](#bảo-trì--giới-hạn-đã-biết)
> trước khi đưa vào vận hành lâu dài.

Tài liệu liên quan: [docs/GUIDE.md](docs/GUIDE.md) (cài đặt, chạy nền, xử lý
sự cố nhanh), [docs/QUY-TRINH.md](docs/QUY-TRINH.md) (chi tiết quy trình báo
cáo buổi dạy).

## Vì sao dùng Zalo Desktop thay vì web hay API `zca-js`

Hai hướng khác đã thử và bỏ:

- **Web (`chat.zalo.me`) qua Playwright + login QR của `zca-js`**: mỗi lần
  bot chạy phải xác thực lại (`zalo.login()` + phiên trình duyệt riêng).
  Zalo chỉ cho **1 client hoạt động cùng lúc**, nên phiên bot và phiên bạn
  đang dùng tranh nhau — phiên sau bị kick, phải quét QR lại liên tục.
- **Zalo Desktop**: về bản chất là app Electron (bọc cùng lõi web), DOM đọc
  được qua **Chrome DevTools Protocol (CDP)** giống hệt trình duyệt. Bot đọc
  thẳng vào phiên đã đăng nhập sẵn của bạn thay vì tự tạo phiên riêng, nên
  **không có bước đăng nhập/QR nào cho bot cả**, và không có xung đột client.

Playwright's `connectOverCDP` không attach thẳng được vào Electron của Zalo
Desktop (lỗi `Browser.setDownloadBehavior`, do bản CDP cũ — Electron
22 / Chrome 108). Vì vậy `src/scrape/cdp.ts` tự cài một client CDP tối giản qua
WebSocket thô (`Runtime.evaluate`, và `Input.*` cho việc gõ của `bot:chat`)
thay vì dùng Playwright.

## Tính năng

| Chế độ | Lệnh | Mô tả |
|---|---|---|
| Theo dõi thời gian thực | `npm run bot:watch` | Đứng chạy liên tục, **nơi duy nhất nghe tin** (WebSocket nội bộ của Zalo Desktop — xem `src/watch/realtimeListener.ts` — và popup thông báo). Mỗi tin nó chia vào hai luồng: hàng chờ cào `data/.scrape-events-<ngày>.jsonl` và hộp thư chat `data/.chat-inbox.jsonl`. Không cào, không ghi `data/<groupId>.json`. |
| Tự động cào và dựng báo cáo | `npm run bot:runner` | Chạy nền: hàng chờ có nhóm và yên lặng thì cào, đồng bộ DB, trích xuất, ghi đè Excel của buổi, đánh dấu tin; tự khôi phục khi `bot:watch` từng gián đoạn. |
| Quét theo hàng chờ (tay) | `npm run bot:scrape` | Chạy tay khi runner không chạy: đọc hàng chờ, chỉ mở các nhóm đang có trong đó, cuộn lấy lịch sử, xóa các nhóm vừa xử lý khỏi hàng chờ rồi thoát. Hàng chờ rỗng thì thoát ngay, không đụng Zalo Desktop. |
| Xếp nhóm vào hàng chờ | `npm run scrape:add -- "Tên nhóm"` | Xếp nhóm (phải có trong `config.targets`) vào hàng chờ bằng tay: nhóm mới chưa từng cào, hoặc ép cào lại. Chỉ ghi file, không đụng Zalo. |
| Trả lời tự động (tùy chọn) | `npm run bot:chat` | Đọc hộp thư chat, trả lời bằng câu có sẵn theo kịch bản `chat-rules.json`. |
| Trạng thái | `npm run watch:status`, `runner:status`, `chat:status` | Bot còn sống không, vòng gần nhất, hàng chờ, các khoảng gián đoạn. |
| Khôi phục | `npm run recover:missing` | Nếu `bot:watch` từng chết: cào lại đúng các nhóm còn thiếu báo cáo và cho biết tin đã lỡ. |
| Xem cấu hình | `npm run config:show` | In toàn bộ thông số theo mục kèm mặc định (khóa khác mặc định có dấu `*`). |
| Xuất Excel | `npm run export:excel` | Xuất tin đã cào sẵn của 1 nhóm ra file `.xlsx`, có thể lọc theo người gửi. |
| MCP server | `npm run mcp` | Phơi dữ liệu đã cào ra cho Claude Code/Claude Desktop qua 3 tool chỉ-đọc. |

Kho `data/<groupId>.json` (1 file JSON dạng mảng cho mỗi cuộc trò chuyện,
dedupe theo `msgId`) do các tiến trình **có cào** ghi: `bot:runner`,
`bot:scrape` và `recover:missing`. `bot:watch` và `bot:scrape` phối hợp qua
**hàng chờ** `data/.scrape-events-<ngày>.jsonl` (mỗi tin một dòng chỉ được nối thêm; hàng chờ là các nhóm còn dòng chưa cào):
`bot:watch` thêm vào, runner (hoặc `bot:scrape`) đọc, cào đúng các nhóm đó rồi
xóa đúng các nhóm vừa xử lý (nhóm được thêm trong lúc đang cào vẫn còn). Vì
`bot:watch` không bao giờ điều khiển giao diện Zalo Desktop nên chạy song song
với runner là an toàn; mọi thứ điều khiển giao diện (runner, `bot:scrape` chạy
tay, `bot:chat`) dùng chung khóa `data/.scrape.lock` để không chạy cùng lúc.
Xem mục [Hàng chờ giữa `bot:watch` và
`bot:scrape`](#hàng-chờ-giữa-botwatch-và-botscrape).

## Bắt đầu nhanh

**Yêu cầu:**
- Windows, đã cài **Zalo Desktop** và đăng nhập sẵn tài khoản cần lấy dữ liệu
- [Node.js ≥ 22](https://nodejs.org/)

```bash
npm install
```

Mở `config.ts`, sửa `targets` thành đúng tên hiển thị của các nhóm/hội
thoại cần lấy (xem bảng cấu hình bên dưới), rồi chạy hai bot nền (mỗi lệnh một
cửa sổ terminal):

```bash
npm run bot:watch      # nghe tin, xếp nhóm vào hàng chờ (tắt và mở lại Zalo Desktop lúc khởi động)
npm run bot:runner     # cào hàng chờ và dựng báo cáo tự động
```

Chỉ muốn cào một lần bằng tay: xếp nhóm vào hàng chờ (`npm run scrape:add --
"Tên nhóm"`) rồi `npm run bot:scrape`. Không cần đăng nhập gì thủ công — miễn
Zalo Desktop trên máy đã đăng nhập tài khoản cần lấy dữ liệu theo cách dùng
bình thường. Lần chạy đầu, bot sẽ tự tắt/mở lại Zalo Desktop để bật cổng
debug (xem [Luồng hoạt động](#luồng-hoạt-động-chi-tiết)) — phiên đăng nhập
không mất vì nó nằm trong profile cục bộ của app, không phải trong tiến
trình. Hướng dẫn đầy đủ (DB, Excel mẫu, chạy nền, agent): [docs/GUIDE.md](docs/GUIDE.md).

## Cấu hình (`config.ts`)

`config.ts` là **nơi duy nhất** để chỉnh thông số vận hành của các bot, chia 8 mục: Zalo, Nhóm theo dõi, Cào, Watch, Runner, Khôi phục, Chat, Buổi học. Mỗi thông số có chú thích ý nghĩa, đơn vị và ví dụ cách đặt ngay trong file. Đổi giá trị xong thì **khởi động lại bot liên quan** (bot chỉ đọc file lúc khởi động). Giá trị sai (âm, không nguyên, `runner.quietSeconds` lớn hơn `runner.maxWaitSeconds`, `chat.heartbeatSeconds` quá lớn so với `watch.deadAfterSeconds`, giờ buổi không tăng dần...) làm bot từ chối chạy và báo tên khóa sai. `chat-rules.json` là kịch bản trả lời riêng, không thuộc `config.ts`.

```bash
npm run config:show     # in toàn bộ giá trị theo mục kèm đơn vị, mặc định, bot nào đọc; khóa khác mặc định có dấu *
```

| Trường | Ý nghĩa |
|---|---|
| `cdpPort` / `cdpUrl` | Cổng debug CDP dùng để mở/kết nối Zalo Desktop (mặc định `9222`). |
| `zaloExePath` | Đường dẫn `Zalo.exe`, **tự dò** trong `%LOCALAPPDATA%\Programs\Zalo\Zalo-*\Zalo.exe` (lấy bản mới nhất). Chỉ cần set tay nếu tự dò thất bại. |
| `autoLaunchZalo` | `true` = tự tắt/mở lại Zalo Desktop kèm cờ debug khi cần. **Phải `true` để `bot:watch` chạy được** (nó luôn khởi động lại Zalo lúc bắt đầu) và để chạy không người trực. |
| `dataDir` | Thư mục gốc chứa `data/` (1 file `.json` mỗi nhóm). |
| `targets` | Danh sách **tên hiển thị chính xác** của hội thoại/nhóm cần lấy, đúng như hiện trên sidebar Zalo Desktop. Chỉ nhóm ở đây mới được theo dõi, cào và (nếu có trong `chat-rules.json`) trả lời. Hỗ trợ nhiều nhóm cùng lúc — xem ghi chú hiệu năng bên dưới. |
| `recoveryIgnoreTargets` | Nhóm không bao giờ gửi báo cáo buổi dạy (nhóm thử): khôi phục không coi chúng là "thiếu báo cáo" và không cào lại. Phải là tập con của `targets`. |
| `groupAliases` | Chỉ để thử/demo: `{ "bot test": "LC_ChuVănAn_BTAN" }` làm cho báo cáo gửi vào nhóm thử được đọc như của nhóm trường thật đó (có trường, khu vực, mã phòng) nên ra dòng trong Excel; ghi "Phòng Máy: PM3" trong tin để không trùng phòng thật PM1. Dòng của nhóm thử nằm trong Excel THẬT của buổi; thử xong đặt `{}` rồi `runner:once` dựng lại buổi. |
| `sinceTs` | Mốc thời gian **chặn dưới** (unix ms) cho `bot:scrape` chạy tay. Dùng `todayAt(giờ, phút)` — tính **một lần lúc bot khởi động** (`new Date()` mỗi lần `config.ts` được import), nên bot chạy qua đêm giữ mốc của hôm qua. `null` = không chặn dưới. `bot:runner` không dùng nó: nó tự tính lại mỗi vòng (từ đầu ngày hôm nay). |
| `untilTs` | Mốc thời gian **chặn trên** (unix ms), **chỉ áp dụng cho `bot:scrape` chạy tay** (runner và khôi phục luôn cào đến hiện tại). Chỉ lọc kết quả cuối, không ảnh hưởng việc cuộn. `null` = không chặn trên. Dùng để cố định khung giờ (VD 8h–12h) không bị trôi nếu job chạy trễ. |
| `targetMessageCount` | Giới hạn an toàn số tin tối đa lấy mỗi nhóm mỗi lần chạy. |
| `scrollDelayMs` | Khoảng random (ms) giữa các lần cuộn, tránh cuộn dồn dập. |

Các thông số vận hành nằm trong các đối tượng con (mặc định trong ngoặc):

| Đối tượng | Khóa (mặc định) |
|---|---|
| `watch` | `heartbeatSeconds` 30, `deadAfterSeconds` 90, `minBlindSeconds` 60 |
| `runner` | `quietSeconds` 120, `maxWaitSeconds` 600, `pollSeconds` 5, `dirtyCheckSeconds` 60, `dirtyRetrySeconds` 300, `watchWarmupSeconds` 90, `maxConsecutiveFailures` 3 |
| `recovery` | `marginMinutes` 5 |
| `chat` | `pollSeconds` 3, `heartbeatSeconds` 30, `skipBackoffSeconds` 45, `sentLedgerMinutes` 10, `echoWindowSeconds` 120, `restorePreviousConversation` false |
| `sessions` | `chieuFromHour` 12, `toiFromHour` 18 |

**Ví dụ khung giờ:**
- 8h–12h cố định (chạy tay): `sinceTs: todayAt(8, 0)`, `untilTs: todayAt(12, 0)`.
- 6h sáng tới lúc chạy (không giới hạn trên): `sinceTs: todayAt(6, 0)`, `untilTs: null`.

> [!TIP]
> `targets` càng nhiều nhóm thì 1 lần cào càng lâu — cả tiến trình xử lý
> **tuần tự từng nhóm một** trên cùng 1 kết nối CDP, không chạy song song. Vì
> chỉ có một cửa sổ Zalo (mở được một cuộc trò chuyện tại một thời điểm),
> cào và gửi của `bot:chat` cũng xếp hàng dùng chung. Không có giới hạn cứng
> về số lượng nhóm; đây thuần là đánh đổi thời gian chạy.

## Luồng hoạt động chi tiết

Mỗi lần cào (`bot:scrape`, hay một vòng của `bot:runner`):

0. **Giữ khóa Zalo** (`data/.scrape.lock`, `src/core/scrapeLock.ts`). Đang có
   tiến trình khác điều khiển giao diện thì `bot:scrape` từ chối và báo ai
   đang giữ; runner thì thử lại sau.
1. **`ensureZaloReady()`** (`src/scrape/desktopScraper.ts`): kiểm tra cổng
   debug CDP (`config.cdpPort`) đã mở chưa.
   - Nếu **chưa**: tắt hẳn mọi tiến trình `Zalo.exe` đang chạy
     (`taskkill /IM Zalo.exe /F`) rồi mở lại kèm
     `--remote-debugging-port=9222`. Zalo Desktop là app single-instance
     (Electron `requestSingleInstanceLock`) nên mở thêm 1 lần nữa trong khi
     đang chạy sẽ không có tác dụng — bắt buộc phải tắt rồi mở lại mới gắn
     được cờ.
   - Nếu **đã mở sẵn**: bỏ qua, dùng luôn.
2. Kết nối tới cửa sổ chính của Zalo Desktop qua CDP
   (`connectToZaloMainPage`), có retry ~20s vì ngay sau khi mở lại app,
   cửa sổ cần vài giây để load xong `index.html`.
3. Chờ sidebar (danh sách hội thoại) render xong (`waitForSidebarLoaded`).
4. Với mỗi tên hội thoại cần cào (các nhóm trong hàng chờ):
   - **Gõ tên nhóm vào ô tìm kiếm sidebar** (`#contact-search-input`) để
     lọc, rồi tìm+click đúng nhóm khớp tên trong tập đã lọc. Sidebar mặc
     định của Zalo Desktop chỉ render một tập con "đang hoạt động gần đây"
     — nhóm nào lâu không có tin mới có thể hoàn toàn vắng mặt trong DOM dù
     không cuộn gì, kể cả với retry dài; tìm qua ô search tránh được vấn đề
     này vì nó query trực tiếp theo tên, không phụ thuộc nhóm có "gần đây"
     hay không. Ô search luôn được dọn sạch lại sau mỗi lần tìm (kể cả khi
     thất bại), vì bot đang thao tác trên chính cửa sổ Zalo Desktop bạn
     dùng hàng ngày.
   - Cuộn vùng tin nhắn lên đầu lặp lại để tải thêm lịch sử cũ hơn, dừng khi:
     tới giới hạn `config.targetMessageCount`, hoặc chiều cao vùng cuộn
     không đổi 3 lần liên tiếp (hết lịch sử để tải), hoặc mọi tin đang thấy
     đều cũ hơn mốc `sinceTs` (không cần cuộn tiếp).
   - Lọc lại theo cả `sinceTs` (chặn dưới) và `untilTs` (chặn trên; runner và
     khôi phục truyền `null` nên không bị chặn trên).
   - Ghi vào `MessageStore` (`data/<groupId>.json`, dedupe theo `msgId`).

### Chế độ theo dõi thời gian thực (`watch`)

`npm run bot:watch` đứng chạy liên tục và phát hiện ngay khi có tin mới, từ
**1 nguồn** là WebSocket (`src/watch/watch.ts`); mỗi lần phát hiện chỉ ghi tên nhóm
vào hàng chờ (không mở giao diện, không cào, không lưu tin), và nếu nhóm nằm
trong `chat-rules.json` thì ghi thêm tin chữ vào hộp thư chat:

**WebSocket nội bộ của Zalo Desktop (`src/watch/realtimeListener.ts`)** — Zalo Desktop tự mở 1 kết nối WebSocket tới backend chat
   của nó để tự cập nhật UI; bot chỉ **quan sát** kết nối đó qua CDP
   `Network` domain (không tạo kết nối riêng, không cần đăng nhập gì thêm).
   Giải mã frame `cmd=501`/`521` (tin nhắn mới) để lấy `idTo` (id hội thoại),
   nội dung tin chữ và người gửi, so khớp `idTo` với `groupId` đã biết của
   `config.targets` (học từ dữ liệu đã cào trước đó trong `data/`), rồi đưa
   đúng nhóm đó vào hàng chờ — kể cả khi nhóm đó đang là nhóm bạn mở/focus.
   Cần **key mã hoá trao đổi lúc kết nối mở** nên `bot:watch` luôn tắt/mở lại
   Zalo Desktop lúc khởi động (xem mục Bảo trì #4) để chắc chắn bắt được key
   này — và cũng vì vậy **chỉ `bot:watch` đọc được nội dung tin**: một tiến
   trình khác gắn vào sau không có key. Nhóm chưa từng được cào lần nào thì
   chưa có `groupId` để so khớp, nguồn này sẽ bỏ qua nhóm đó cho tới khi có
   ít nhất 1 lần quét (`npm run scrape:add -- "Tên nhóm"` rồi để runner hoặc
   `bot:scrape` cào, sau đó khởi động lại `bot:watch`).
Trước đây còn một nguồn thứ hai là popup thông báo (toast, `znotification.html`) làm dự
phòng; đã bỏ vì toast là thông báo của Windows chứ không phải cửa sổ Zalo nên không bắt
được tin, và việc nối vào cửa sổ đó làm `bot:watch` tự thoát khi nó đóng. Tin sót khi
WebSocket hỏng được vớt bằng `recover:missing` và lần cào bù của runner.

`bot:watch` ghi nhịp tim và các khoảng gián đoạn (`data/.watch-state.json`,
`data/.watch-gaps.json`); lỗi ghi các tệp này (ví dụ Windows chặn đổi tên đè
lên tệp đang bị tiến trình khác đọc) được thử lại và không làm nó thoát.

### Hàng chờ giữa `bot:watch` và `bot:scrape`

- File: `data/.scrape-events-<ngày>.jsonl` (một file mỗi ngày Việt Nam), mỗi dòng `{"t": tên nhóm đúng như config.targets, "at": thời điểm}`. **Chỉ được nối thêm**: `bot:watch` và `scrape:add` không đọc-sửa-ghi lại file nào, nên không thể ghi đè lẫn nhau (bản cũ dùng một file JSON chung và có thể làm mất nhóm khi watch và runner ghi cùng lúc). Tệp thứ hai `data/.scrape-events.handled.jsonl` do runner hoặc `bot:scrape` (đang giữ khóa) nối thêm sau mỗi lần cào: nó ghi từng file ngày đã đọc tới byte nào. Một nhóm nằm trong hàng chờ khi còn dòng của nó nằm sau mốc đó; dùng vị trí byte thay vì đồng hồ nên tin đến đúng lúc bắt đầu cào cũng không bị nuốt. File sự kiện cũ hơn `runner.queueKeepDays` ngày (mặc định 3, không tính hôm nay) tự bị xóa sau mỗi lần cào. Hàng chờ cũ `data/.scrape-queue.json` (nếu còn) được nhập một lần khi watch, runner hoặc `bot:scrape` khởi động, rồi đổi tên `.migrated`.
- `bot:watch` chỉ **thêm** tên nhóm khi phát hiện tin mới (trừ nhóm chỉ chat `"scrape": false`). Không bao giờ chạm vào giao diện Zalo Desktop. Có thể thêm tay: `npm run scrape:add -- "Tên nhóm"`.
- Runner (hoặc `bot:scrape` chạy tay) chụp lại hàng chờ (kèm mốc byte), cào đúng các nhóm đó rồi đánh dấu đã cào tới mốc; nhóm hoặc tin được thêm trong lúc đang cào nằm sau mốc nên vẫn còn cho lần sau. Hàng chờ rỗng: thoát ngay, in `hàng chờ rỗng`.
- Nhóm cào **lỗi** vẫn ở lại hàng chờ và được thử lại ở vòng sau (tối đa `runner.maxScrapeAttempts` lần, mặc định 3, mỗi lần cách nhau thời gian yên lặng); hết số lần thì bỏ khỏi hàng chờ, ghi log và một cảnh báo trong vòng của runner kèm lệnh `scrape:add` để cào lại. Nhóm không có tin mới vẫn được coi là đã cào. Nếu không kết nối được Zalo Desktop thì không đánh dấu gì.
- Chỉ các tiến trình giữ khóa `data/.scrape.lock` mới điều khiển giao diện, nên không còn nguy cơ 2 tiến trình cùng click/cuộn 1 cửa sổ Zalo.

> [!NOTE]
> Các bot hiện là những tiến trình Node bình thường — đóng terminal là chúng
> tắt theo, không tự phục hồi khi crash hay khi máy khởi động lại. Muốn chạy
> nền tự khởi động cùng phiên đăng nhập, xem [docs/GUIDE.md](docs/GUIDE.md)
> mục 8 (tác vụ Windows `schtasks`, hoặc PM2 như một dịch vụ Windows) — mã
> không phụ thuộc vào cách bạn giữ tiến trình sống.

## Sử dụng

```bash
npm run bot:watch           # theo dõi liên tục: xếp nhóm có tin mới vào hàng chờ, ghi hộp thư chat
npm run bot:runner          # tự cào hàng chờ, đồng bộ DB, trích xuất, dựng Excel
npm run bot:chat            # trả lời tự động theo chat-rules.json (tùy chọn)
npm run bot:scrape          # cào tay các nhóm trong hàng chờ (rỗng thì thoát ngay)
npm run scrape:add -- "Tên nhóm"                 # xếp nhóm vào hàng chờ cào bằng tay
npm run watch:status | runner:status | chat:status   # tình trạng các bot (thoát mã 2 nếu không sống)
npm run runner:once -- [--day D] [--buoi B]      # dựng lại MỘT buổi, không cào
npm run recover:missing -- [--day D] [--buoi B] [--dry-run]   # khôi phục tin bị lỡ khi watch từng chết
npm run config:show         # xem toàn bộ cấu hình
npm run export:excel <groupId> [senderName]    # xuất .xlsx từ dữ liệu đã cào
npm run mcp                 # MCP server (stdio) cho Claude Code/Desktop
npm run zalo:debug          # chỉ mở Zalo Desktop kèm cổng debug, không quét
npm test                    # unit test
npm run typecheck           # tsc --noEmit
```

`export:excel` đọc dữ liệu **đã có sẵn** trong `data/<groupId>.json`
(không tự cào), nên cần cào ít nhất 1 lần cho nhóm đó (runner hoặc
`bot:scrape`). Tìm `groupId` bằng cách xem tên file trong `data/`, hoặc
gọi tool `list_threads` qua MCP server (trả về cả `groupId` lẫn `groupName`).

### Chạy debug thủ công (mở cổng CDP mà không qua bot)

Muốn tự mở Zalo Desktop kèm cổng debug để soi DOM/probe CDP thủ công (VD
khi cần cập nhật lại selector) mà không cần chạy cả một lượt quét:

```bash
npm run zalo:debug
```

Lệnh này chỉ gọi `ensureZaloReady()` rồi in ra URL debug và thoát, **không**
đụng vào `config.targets` hay `data/`. `src/cli/debug/active-conversation.ts` và
`src/cli/debug/zalo.ts` ở thư mục gốc là các script chẩn đoán một lần dùng để dò
lại selector khi Zalo Desktop đổi giao diện.

Kiểm tra cổng debug đã mở chưa:

```bash
curl http://127.0.0.1:9222/json/version
```

Có kết quả JSON (không lỗi connection refused) nghĩa là CDP đã sẵn sàng.
Đổi `9222` nếu bạn đã đổi `config.cdpPort`.

### `bot:runner`: tự động cào, trích xuất và điền Excel

`bot:runner` là tiến trình thứ ba, chạy 24/24 cạnh `bot:watch`. Nó theo dõi hàng chờ; khi có nhóm và hàng chờ **yên lặng** `runner.quietSeconds` (mặc định 2 phút; trần `runner.maxWaitSeconds`, 10 phút, kể từ nhóm đầu tiên) thì chạy một vòng: khôi phục nếu `bot:watch` có khoảng gián đoạn **chưa được khôi phục**, cào các nhóm trong hàng chờ, đồng bộ DB, rồi với mỗi buổi có báo cáo đầu/cuối buổi mới thì trích xuất, ghi đè Excel `data/export/baocaobuoi<buổi>_<ddMMyy>.xlsm` (qua tệp tạm; nếu tệp đang mở thì lưu `..._moi.xlsm`) và đánh dấu tin. Sau `runner.maxConsecutiveFailures` (3) vòng lỗi liên tiếp (cào hoặc đồng bộ) nó ngừng tự thử cho đến khi được khởi động lại (hàng chờ vẫn nguyên); lỗi dựng của riêng một buổi chỉ được báo và thử lại sau 5 phút.

```bash
npm run bot:runner                                   # chạy nền; không khởi động lại bot:watch (một lần cào vẫn mở lại Zalo nếu cổng debug đóng, như bot:scrape)
npm run runner:status                                # sống hay chết, vòng gần nhất (kèm thời gian từng bước và từng nhóm), hàng chờ, buổi chưa dựng xong (thoát mã 2 nếu không sống)
npm run runner:timing -- [--last N]                  # thống kê thời gian các vòng và thời gian cào từng nhóm (trung bình, p95, lâu nhất) từ output/runner-log.jsonl
npm run runner:once -- [--set <id>] [--day D] [--buoi B]   # dựng lại MỘT buổi, không cào (dùng sau khi sửa output/<id>/overrides.json)
```

Tệp trạng thái: `data/.runner-state.json` (nhịp tim), `output/runner-log.jsonl` (mỗi vòng một dòng), `data/.runner-built.json` (các báo cáo đã dựng vào Excel: báo cáo nằm trên đĩa mà chưa có ở đây sẽ được dựng, nên crash giữa vòng hay cào tay không làm mất buổi nào), `output/<id>/review_<ngày>_<buổi>.json` (các mục cần xem của từng buổi), `data/.scrape.lock` (khóa chung: mọi thứ điều khiển giao diện Zalo, gồm `bot:scrape` chạy tay, `bot:chat` và `recover:missing`, không chạy cùng lúc). Giới hạn đã biết: cào điều khiển giao diện Zalo Desktop (nhấp, cuộn) nên có thể làm gián đoạn người đang gõ trong Zalo.

### `bot:chat`: tự động trả lời theo kịch bản

`bot:chat` đọc tin chữ mới trong các nhóm liệt kê ở `chat-rules.json` và trả lời bằng câu có sẵn theo tình huống (ví dụ báo cáo có máy lỗi). `bot:watch` vẫn là nơi duy nhất nghe tin (WebSocket) và chia mỗi tin thành hai luồng độc lập: hàng chờ cào (cho `bot:runner`) và hộp thư chat `data/.chat-inbox.jsonl` (cho `bot:chat`). Câu bot gửi ra được ghi vào sổ **trước khi** gửi để `bot:watch` bỏ qua khi nó dội lại (không cào thừa, không tự trả lời chính mình). Gửi qua giao diện Zalo Desktop (CDP): mở đúng nhóm, gõ vào ô soạn tin, Enter, và trước **mỗi** thao tác gõ đều kiểm lại rằng cả tên nhóm đang chọn lẫn `placeholder` của ô soạn tin đúng là nhóm đích; ô soạn tin đang có chữ dở thì hoãn, không gõ đè. Giữ khóa `data/.scrape.lock` chung với `bot:runner`.

```bash
npm run bot:chat        # chạy nền; nạp lại chat-rules.json khi tệp đổi (tệp sai thì giữ bản cũ)
npm run chat:status     # còn sống không, gửi thật hay dry-run, nhóm nào, còn bao nhiêu tin chờ (thoát mã 2 nếu không sống)
```

`chat-rules.json` (mẫu: `docs/superpowers/specs/2026-09-25-bot-chat-rules.sample.json`): `dryRun`; `limits` (`maxRepliesPerMinute`, `maxReplyDelaySeconds`, `cooldownSecondsPerRule`); `groups` với tên nhóm (bắt buộc thuộc `config.targets`) và `rules` xét theo thứ tự, tình huống đầu tiên khớp thì trả lời. `when`: `loaiBaoCao` (`DauBuoi`/`CuoiBuoi`), `mayLoi: true` (số máy lỗi > 0 hoặc có ghi chú như "IT bảo trì"; số 0 thì không), `keywords` (không phân biệt dấu và hoa thường). `reply` có thể chèn `{senderName}`, `{soMayLoi}`, `{chiTietLoi}`. **Gắn thẻ người (@):** thêm `"mention": ["Nguyễn Trọng Phúc"]` vào một tình huống (tối đa 5 tên, đúng như hiện trong danh sách thành viên của nhóm) thì bot gõ `@`, gõ luôn tên người đó để danh sách gợi ý của Zalo thu về đúng người (nếu Zalo không thu gọn thì xóa phần tên vừa gõ và tìm trong danh sách đầy đủ bằng phím mũi tên), chọn đúng người rồi mới gõ `reply`, kết quả là tin `@Nguyễn Trọng Phúc <reply>` với thẻ thật. Bot **không bao giờ** gắn thẻ cả nhóm (@All), và **không gửi gì** nếu không gắn được thẻ (không thấy tên, hai người trùng tên, danh sách không hiện, Enter không tạo thẻ): nó xóa bản nháp và ghi log `gắn thẻ @...: <lý do>`. Ví dụ: `"mention": ["Nguyễn Trọng Phúc"], "reply": "{chiTietLoi}. Ghi nhận kiểm tra."` gửi `@Nguyễn Trọng Phúc máy 35 không lên; máy 41 hỏng màn hình. Ghi nhận kiểm tra.` **Nhóm chỉ chat:** thêm `"scrape": false` vào một nhóm (cạnh `"rules"`) thì `bot:watch` vẫn đưa tin của nhóm đó vào hộp thư chat nhưng **không xếp nó vào hàng chờ cào**, và khôi phục (`bot:runner`, `recover:missing`) tự bỏ qua nhóm đó; nhóm này không có dữ liệu mới trong `data/` và DB. Nhóm vẫn phải nằm trong `config.targets` và (nếu chưa từng được cào) phải được cào một lần để watch biết mã nhóm. Mặc định là `true`. Đổi xong thì khởi động lại `bot:watch`, `bot:runner` và `bot:chat`.

Tệp trạng thái: `data/.chat-inbox.jsonl` và `data/.chat-inbox.cursor` (hộp thư và vị trí đã đọc), `data/.chat-done.json` (tin đã xử lý), `data/.chat-sent.json` (câu vừa gửi, để nhận ra tin dội lại), `data/.chat-state.json` (nhịp tim). Tạo tệp `data/.chat-off` để dừng gửi ngay. Giới hạn đã biết: chỉ tin chữ; chưa trả lời dạng trích dẫn; mỗi lần gửi chiếm giao diện Zalo (nên dành riêng một bản Zalo cho bot khi có nhiều nhóm); nội dung chỉ lấy từ WebSocket của `bot:watch`, mất WebSocket thì bot không trả lời; tin không khớp tình huống nào bị bỏ qua không có dòng log; tự động gửi tin có thể bị Zalo coi là bất thường.

## Bộ báo cáo theo người phụ trách

Báo cáo thuộc về **người**, không thuộc về nhóm Zalo. Mỗi người là một "bộ" trong `config.reportSets`; file của họ ra thư mục riêng
`<statusExportDir>/<yyMM>/<yyMMdd>/<id>/` (bot tự tạo thư mục):

```ts
reportSets: [
    { id: "NguyenVanA", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] },
    // { id: "NguyenVanB", reports: [/* các mã báo cáo của người B */] },
],
```

- `id` là tên thư mục (không chứa `\ / : * ? " < > |`, không trùng giữa các bộ, không phân biệt hoa thường). `reports` là **mã nội bộ**, không có mặc định:
  xem danh sách, loại, tiêu đề tin nguồn và mẫu Excel bằng `npm run reports:list`. Mọi tin từ mọi nhóm trong `targets` đi qua mọi bộ; một mã có thể ở nhiều bộ.
- **Cấu hình sai không làm bot dừng**: bộ hoặc mục sai bị tắt và báo lỗi ồn ào (màn hình khởi động của `bot:runner`/`bot:total`, `runner:status` và
  `total:status` thoát mã 2, `config:show`, tóm tắt vòng), các bộ khác chạy bình thường.
- **Mỗi (bộ, mã báo cáo) cô lập lỗi**: mẫu thiếu hay file đang mở trong Excel chỉ làm hỏng đúng file đó, bản cũ được giữ và vòng sau thử lại
  riêng file đó trong ngày (`data/.runner-failed.json`; qua ngày thì bỏ). Dấu `StatusId` chưa ghi được vào DB nằm ở `data/.runner-marks-pending.json` và được ghi nốt ở vòng sau. Mỗi bộ có thư mục làm việc riêng `output/<id>/` (gồm `overrides.json`), nên sửa dữ liệu của bộ này không đụng bộ khác.
- File chỉnh sửa cũ `output/overrides.json` không còn được dùng: chép tay vào `output/<id>/overrides.json` (runner sẽ cảnh báo).
- Thêm một người mới: dùng skill `SKILLS-Agent/cau-hinh-nguoi-phu-trach`. Thêm một **loại** báo cáo mới còn cần code (đăng ký mã, cách đọc tin, bố cục mẫu, test).
- Thiết kế: [docs/superpowers/specs/2026-10-06-bo-bao-cao-theo-nguoi-design.md](docs/superpowers/specs/2026-10-06-bo-bao-cao-theo-nguoi-design.md).

## Báo cáo buổi dạy (skill Teach-lesson-skills-V2)

Luồng tự động: `bot:watch` → hàng chờ → `bot:runner` (cào → `sync:db` → trích xuất → điền Excel → `mark:messages`) →
agent giám sát (`runner:status`, các mục cần xem `output/<id>/review_<ngày>_<buổi>.json`, sửa qua
`output/<id>/overrides.json` rồi `runner:once`). Luồng chạy tay khi runner không chạy: `bot:scrape` →
`sync:db -- --apply` → `extract:reports -- --buoi <sang|chieu|toi>` → xem `output/<id>/review.json` →
`fill:status-reports -- output/<id>/output.json` → `mark:messages -- output/<id>/marks.json`. Mỗi lần chỉ xử lý một buổi
của một ngày (ranh giới buổi ở `config.sessions`) và tạo các file trạng thái trong `<statusExportDir>/<yyMM>/<yyMMdd>/<id>/`.
Chi tiết từng bước: [docs/QUY-TRINH.md](docs/QUY-TRINH.md). Cài đặt và chạy tự động với agent:
[docs/GUIDE.md](docs/GUIDE.md). Quy tắc trích xuất trong `Teach-lesson-skills-V2/SKILL.md`; bản thiết kế
gốc ở `docs/superpowers/specs/2026-09-24-teacher-lesson-report-extraction-design.md`.
Mã trích xuất nằm trong `lesson/` và có test (`npm test`); `fill:report` cần Microsoft Excel.

`bot:watch` ghi nhịp tim và các khoảng gián đoạn (`data/.watch-state.json`, `data/.watch-gaps.json`). Xem
tình trạng bằng `npm run watch:status`; khi nó từng chết, runner tự khôi phục (chỉ cào lại các nhóm còn
thiếu báo cáo) và `npm run recover:missing` làm việc đó bằng tay và cho biết những tin đã bị lỡ (bước 1b
trong QUY-TRINH.md).

## Cấu trúc dự án

Mã nguồn nằm trong `src/`; ở gốc chỉ có cấu hình, tài liệu và dữ liệu. Các kiểu dùng chung nằm tập trung ở `src/types/`.

```
config.ts                        SỬA Ở ĐÂY: nhóm cần theo dõi, mọi thông số vận hành (8 mục)
chat-rules.json                  kịch bản trả lời của bot:chat (theo nhóm)
package.json  tsconfig.json  README.md  CLAUDE.md

src/
  cli/                           mọi lệnh chạy (mỗi `npm run ...` trỏ tới một file ở đây)
    bot-watch.ts                 bot:watch (nghe tin, xếp hàng chờ, hộp thư chat)
    bot-runner.ts                bot:runner (cào, đồng bộ DB, trích xuất, dựng Excel)
    bot-chat.ts                  bot:chat (trả lời theo kịch bản)
    bot-scrape.ts                bot:scrape (cào tay theo hàng chờ)
    scrape-add.ts                scrape:add
    watch-status.ts / runner-status.ts / runner-timing.ts / chat-status.ts   xem trạng thái, thời gian
    runner-once.ts               runner:once (dựng lại một buổi, không cào)
    recover-missing.ts           recover:missing
    extract-reports.ts / fill-report.ts / sync-db.ts / mark-messages.ts   các bước trích xuất, điền Excel, đồng bộ, đánh dấu DB
    config-show.ts               config:show
    export-excel.ts / export-lesson-report.ts   xuất .xlsx từ dữ liệu đã cào
    debug/                       công cụ chẩn đoán (zalo.ts mở Zalo kèm cổng debug; db-check.ts; active-conversation.ts)
  types/                         CÁC KIỂU DÙNG CHUNG: message, report, session, queue, runner, watch, chat, config, core
                                 (nhập bằng `import type { ... } from "../types/index.js"`)
  core/                          hạ tầng dùng chung: paths.ts (mọi đường dẫn theo vị trí dự án), atomicWrite.ts (ghi tệp
                                 nguyên tử chịu được Windows), scrapeLock.ts (khóa chung cho mọi thứ điều khiển giao diện Zalo)
  config/                        configCheck.ts (kiểm giá trị lúc khởi động), configDoc.ts (mô tả từng thông số cho config:show)
  scrape/                        cào Zalo Desktop: desktopScraper.ts (ensureZaloReady, tìm nhóm, cuộn, cào, đọc groupId thật qua
                                 React fiber), cdp.ts (client CDP thô thay Playwright), scrapeSelectors.ts (CSS selector DOM),
                                 scrapeQueue.ts / queueRun.ts / queueAdd.ts (hàng chờ cào, một lần chạy theo hàng chờ, scrape:add)
  watch/                         watch.ts (nguồn WS realtime, chia tin vào hàng chờ và hộp thư chat),
                                 realtimeListener.ts (WebSocket nội bộ của Zalo qua CDP Network), watchState.ts (nhịp tim, khoảng gián đoạn)
  runner/                        bot:runner: lịch chờ, một vòng, trạng thái, thời gian, dựng Excel an toàn
  chat/                          bot:chat: kịch bản, khớp tình huống, hộp thư, gửi tin, giới hạn
  lesson/                        trích xuất báo cáo buổi dạy, chia buổi, khôi phục
  store/                         messageStore.ts (data/<groupId>.json, dedupe), kết nối DB
  export/                        exportExcel.ts (xuất .xlsx từ dữ liệu đã cào)
  mcp/                           server.ts: MCP server chỉ-đọc (list_threads, get_recent_messages, search_messages)
scripts/                         fill-template.ps1 (điền template Excel qua COM), benchLoad.ts (đo tải giả lập)
tests/                           unit test (node:test)
docs/                            GUIDE.md, QUY-TRINH.md, các spec và kế hoạch

data/                             DỮ LIỆU ĐẦU RA (không commit, .gitignore)
  <groupId>.json                   lưu vĩnh viễn, mảng JSON ghi đè mỗi lần lưu,
                                    dedupe theo msgId, đặt tên theo group id thật
                                    (bền vững khi đổi tên nhóm)
  .scrape-events*.jsonl, .watch-*.json, .runner-*.json, .chat-*.json, .scrape.lock
                                   hàng chờ, nhịp tim, trạng thái, khóa (xem các mục trên)
  export/                          các file Excel báo cáo baocaobuoi<buổi>_<ddMMyy>.xlsm
output/                           kết quả trung gian của trích xuất và nhật ký runner (không commit)
```

## Dữ liệu đầu ra

### `data/<groupId>.json` — kho lưu vĩnh viễn duy nhất

Một file JSON (mảng, pretty-print, sắp theo `ts` tăng dần) cho mỗi cuộc trò
chuyện — đây là **nơi lưu trữ duy nhất** của tin đã cào, không có kho phụ hay
bản xuất riêng theo ngày. Mỗi lần lưu tin mới, cả mảng được ghi đè lại (qua
file tạm rồi rename, tránh hỏng file nếu bị ngắt giữa chừng), dedupe theo
`msgId` — chạy lại cào không tạo tin trùng. Tên file là `groupId` thật
(không phải slug tên nhóm), nên **không bị vỡ lịch sử khi nhóm đổi tên**.
Shape `NormalizedMessage` (`src/store/messageStore.ts`):

```ts
{
  msgId: string;        // id gốc từ Zalo Desktop, hoặc hash nếu không có
  groupId: string;      // id hội thoại thật của Zalo — nhóm: "g<digits>"; DM: id số của người kia
  groupName: string;    // tên hiển thị tại thời điểm cào — chỉ để tham khảo, không dùng làm khoá
  threadType: "group" | "user";
  senderId: string;     // id số thật của người gửi (đọc qua React fiber, không phải từ DOM)
  senderName: string;   // rỗng nếu là tin của chính tài khoản (isSelf)
  isSelf: boolean;
  ts: number;            // unix ms
  msgType: string;       // "desktop.text"
  content: unknown;      // nội dung text
  source: "history" | "realtime";
}
```

> [!NOTE]
> `groupId`/`senderId` không lấy được từ DOM/CSS như các trường còn lại —
> chúng được đọc qua **React internal fiber** (`__reactFiber$...` gắn trên
> chính DOM node), vì Zalo Desktop không hề render các id này ra text/
> attribute nào cả. Xem điểm bảo trì #1 bên dưới — đây là phần dễ vỡ nhất
> trong toàn bộ scraper.

Cần bản xuất dễ đọc/chia sẻ (kèm giờ Việt Nam, lọc theo người gửi)? Dùng
`npm run export:excel <groupId> [senderName]` để xuất `.xlsx` theo yêu cầu,
thay vì một file export tự động sinh mỗi ngày. File Excel **báo cáo buổi dạy**
là thứ khác: nó nằm ở `data/export/baocaobuoi<buổi>_<ddMMyy>.xlsm` do runner dựng.

## Bảo trì & giới hạn đã biết

Xếp theo khả năng gặp phải, cao → thấp:

1. **Đọc `groupId`/`senderId` qua React internal fiber (`src/scrape/desktopScraper.ts:readMsgIdentitySrc`)** —
   điểm dễ vỡ nhất trong toàn bộ scraper, dễ vỡ hơn cả selector CSS bên
   dưới. Kỹ thuật này đọc thẳng property nội bộ của React
   (`__reactFiber$...`/`memoizedProps`) gắn trên DOM node, hoàn toàn không
   phải API công khai của Zalo lẫn của React — chỉ cần Zalo **nâng cấp
   phiên bản React** (không cần đổi UI/class CSS gì cả) là cấu trúc fiber
   có thể đổi khác hẳn. Scraper đã có cơ chế tự vệ: nếu không đọc được
   `groupId` từ dòng nào trong cả batch, nó **bỏ qua lưu** (log cảnh báo
   `"could not read groupId..."`) thay vì ghi sai dữ liệu — nhưng nếu thấy
   cảnh báo này liên tục, cần soi lại cấu trúc fiber mới qua
   `npm run zalo:debug` + `Runtime.evaluate` thủ công.

2. **Selector DOM (`src/scrape/scrapeSelectors.ts`)** — gắn chặt vào bản UI
   hiện tại của Zalo Desktop. Mỗi lần Zalo tự động update giao diện, các
   class này có thể đổi và scraper sẽ âm thầm trả về rỗng hoặc báo
   `"sidebar item for ... not found"`. Cách sửa: chạy `npm run zalo:debug`,
   dùng `src/cli/debug/active-conversation.ts` hoặc `Runtime.evaluate` thủ công
   qua `src/scrape/cdp.ts` để soi DOM mới và cập nhật lại selector. **`bot:chat`
   phụ thuộc thêm vào ô soạn tin** (`#richInput`, `placeholder` dạng "Nhập @,
   tin nhắn tới <tên nhóm>", class `empty`) — cũng có thể đổi khi Zalo cập nhật;
   khi đó bot từ chối gửi (chốt chặn kiểm nhóm đích thất bại) thay vì gõ nhầm.

3. **Định dạng `msgId`/timestamp có thể thay đổi theo loại tin nhắn** — đã
   từng gặp: tin nhắn dạng album ảnh có id `bb_msg_id_<ts>_<n>_<groupId>`
   khác với tin text thường (`bb_msg_id_<ts>`). Đã vá bằng cách chỉ lấy số
   ở đoạn đầu id, nhưng các loại tin khác (sticker, file, voice, tin nhắn
   bị thu hồi...) chưa được test kỹ — nếu thấy `content: ""` hoặc
   `timeLocal` bất thường trong file export, khả năng cao là một định dạng
   id mới chưa được xử lý.

4. **Nguồn WS realtime (`src/watch/realtimeListener.ts`) dựa trên giao thức
   nhị phân chưa công bố của Zalo** (mã lệnh cmd/subCmd, mã hoá AES-GCM +
   nén gzip) — dò ngược qua dự án `zca-js` và xác nhận lại bằng cách bắt
   trực tiếp gói tin qua CDP `Network` domain, không phải API chính thức.
   Zalo đổi giao thức bất cứ lúc nào mà không có dấu hiệu gì ở UI. Với việc
   **phát hiện nhóm có tin mới**, đây là nguồn duy nhất của `bot:watch`: nếu nó
   hỏng thì `bot:watch` mù (`watch:status` báo "MÙ", ghi khoảng gián đoạn "blind")
   và phải dùng `recover:missing` để vớt tin sót. **`bot:chat` cũng phụ thuộc
   hoàn toàn vào nguồn này**, nên khi WebSocket hỏng bot chat ngừng trả lời
   chứ không đoán nội dung. Triệu chứng
   hỏng: không còn thấy log `[watch] realtime-ws: new message detected` dù có
   tin nhắn mới.

5. **`zaloExePath` tự dò theo cấu trúc thư mục cài đặt hiện tại**
   (`%LOCALAPPDATA%\Programs\Zalo\Zalo-<version>\Zalo.exe`). Nếu Zalo đổi
   cách cài đặt (VD chuyển sang Microsoft Store/MSIX) thì auto-detect sẽ
   thất bại — lúc đó cần set `zaloExePath` thủ công trong `config.ts`.

6. **`autoLaunchZalo: true` sẽ tắt Zalo Desktop bất kể bạn đang dùng dở** —
   với `bot:scrape` và runner, chỉ xảy ra khi debug port chưa mở; với
   `bot:watch`, xảy ra **mỗi lần khởi động**, kể cả khi Zalo đã mở sẵn — cần
   thiết để nguồn WS realtime bắt được cipher key trao đổi lúc kết nối (xem
   `src/watch/realtimeListener.ts`). Không mất dữ liệu, chỉ gián đoạn UI vài
   giây. **Không thể tắt `autoLaunchZalo` khi dùng `bot:watch`**: nó luôn cần
   khởi động lại Zalo và sẽ báo lỗi nếu giá trị là `false`. Vì vậy đừng khởi
   động `bot:watch` lúc đang dùng Zalo dở.

7. **Bù lại tin bị lỡ có giới hạn.** Khi `bot:watch` chết, khoảng gián đoạn
   được ghi lại và runner (hoặc `recover:missing`) cào lại các nhóm còn thiếu
   báo cáo của buổi đó. Nhưng máy tắt/ngủ đúng giờ lên lịch của agent, hoặc cả
   watch lẫn runner cùng không chạy cả ngày, thì không có gì tự quét bù cho
   ngày đó (chạy tay `recover:missing --day ... --buoi ...` khi cần), và khôi
   phục chỉ xét buổi hiện tại.

8. **Cảnh báo lỗi chỉ có trạng thái, không có thông báo đẩy** — các bot ghi
   log ra console/tệp và có lệnh `...:status` (thoát mã 2 khi không sống),
   nhưng không có gì tự gửi cảnh báo cho bạn. Nếu chạy qua Task Scheduler thì
   phải chủ động xem `runner:status`, `watch:status`, `chat:status` hoặc
   agent giám sát (báo `runner:status` mã 2 trong báo cáo cuối).

9. **`data/` không có dọn dẹp tự động** — mỗi `data/<groupId>.json` tăng
   dần vô hạn theo số tin nhắn của nhóm đó. Không ảnh hưởng chức năng nhưng
   nên để ý dung lượng nếu chạy lâu dài (mỗi lần lưu ghi đè lại toàn bộ file,
   nên file càng lớn thì mỗi lần lưu càng chậm hơn một chút). Hộp thư chat
   `data/.chat-inbox.jsonl` cũng chưa được xoay tệp.

10. **`senderId` là id số thật, không phải dữ liệu ẩn danh** — dữ liệu nội
   bộ Zalo đọc qua React fiber (`readMsgIdentitySrc`) còn chứa cả số điện
   thoại, ngày sinh, avatar... của người gửi, nhưng scraper **chỉ trích
   xuất đúng `fromUid`/`userId`**, không lưu các trường nhạy cảm khác. Nếu
   sau này mở rộng để lấy thêm thông tin từ đó, cân nhắc kỹ trước khi ghi
   vào `data/` — file này không mã hoá và không nên chia sẻ tuỳ tiện.

11. **Ghi tệp trạng thái trên Windows.** Đổi tên đè lên một tệp đang bị tiến
    trình khác mở (kể cả chỉ để đọc) báo `EPERM`. Các tệp trạng thái của bot
    (nhịp tim, hàng chờ, sổ chat...) dùng `src/core/atomicWrite.ts` để thử lại
    và lỗi ghi nhịp tim không làm `bot:watch` thoát. `src/store/messageStore.ts`
    (tệp `data/<groupId>.json`) vẫn dùng cách đổi tên cũ; nguy cơ thấp hơn vì
    chỉ runner đọc chúng và runner cào tuần tự.

12. **Tự động gửi tin (`bot:chat`) có rủi ro với tài khoản** — Zalo có thể coi
    việc gõ tự động là hành vi bất thường; mỗi lần gửi bot chuyển cuộc trò
    chuyện đang mở của phiên Zalo Desktop và có thể làm gián đoạn người đang
    dùng. Nên dành riêng một bản Zalo cho bot khi có nhiều nhóm, thử ở nhóm
    `bot test` với `"dryRun": true` trước, và biết công tắc dừng khẩn cấp
    (`data/.chat-off`).

## Lên lịch chạy tự động

Các bot chạy nền (`bot:watch`, `bot:runner`, `bot:chat`) không cần lịch: chỉ cần
được khởi động cùng phiên đăng nhập và giữ sống. Cách làm (tác vụ Windows
`schtasks`, hoặc PM2 như dịch vụ Windows) và lịch giám sát của agent
(`openclaw cron`, chạy sau mỗi buổi) nằm ở [docs/GUIDE.md](docs/GUIDE.md) mục 8.
`autoLaunchZalo: true` đảm bảo Zalo Desktop sẽ tự khởi động lại kèm cổng debug
kể cả khi máy chưa mở Zalo hoặc Zalo đang mở không kèm cờ debug.
