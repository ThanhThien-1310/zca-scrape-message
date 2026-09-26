# zca-scrape-message

Đọc lịch sử tin nhắn của các nhóm/hội thoại chỉ định từ **Zalo Desktop**
(app Windows, không phải web), chạy theo lịch hoặc theo thời gian thực, ghi
ra file JSON (+ Excel export theo yêu cầu). Không gửi tin, không có bước
đăng nhập riêng của bot — nội dung tin nhắn luôn đọc qua DOM của phiên Zalo
Desktop bạn đã đăng nhập sẵn theo thói quen dùng hàng ngày; chế độ theo dõi
thời gian thực còn quan sát thêm WebSocket nội bộ mà Zalo Desktop tự mở tới
backend của nó (qua CDP `Network` domain) để phát hiện tin mới nhanh hơn,
nhưng đây chỉ là nguồn kích hoạt phụ, không thay thế bước đọc DOM.

> [!NOTE]
> Đây là công cụ tự động hoá cá nhân, không phải sản phẩm dùng cho tổ chức
> hay nhiều người dùng. Nó phụ thuộc trực tiếp vào cấu trúc DOM hiện tại của
> Zalo Desktop — xem [Bảo trì & giới hạn đã biết](#bảo-trì--giới-hạn-đã-biết)
> trước khi đưa vào vận hành lâu dài.

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
22 / Chrome 108). Vì vậy `history/cdp.ts` tự cài một client CDP tối giản qua
WebSocket thô (`Runtime.evaluate`) thay vì dùng Playwright.

## Tính năng

| Chế độ | Script | Mô tả |
|---|---|---|
| Quét theo hàng chờ | `npm run bot:scrape` | Chạy tay: đọc hàng chờ `data/.scrape-queue.json`, chỉ mở các nhóm đang có trong đó, cuộn lấy lịch sử theo khung giờ cấu hình, rồi xóa các nhóm vừa xử lý khỏi hàng chờ và thoát. Hàng chờ rỗng thì thoát ngay, không đụng Zalo Desktop. |
| Theo dõi thời gian thực | `npm run bot:watch` | Đứng chạy liên tục, **chỉ phát hiện** nhóm nào có tin mới (WebSocket nội bộ của Zalo Desktop — xem `history/realtimeListener.ts` — và popup thông báo) rồi ghi tên nhóm vào hàng chờ. Không cào, không ghi `data/`. |
| Xuất Excel | `npm run export:excel` | Xuất tin đã cào sẵn của 1 nhóm ra file `.xlsx`, có thể lọc theo người gửi. |
| MCP server | `npm run mcp` | Phơi dữ liệu đã cào ra cho Claude Code/Claude Desktop qua 3 tool chỉ-đọc. |

Chỉ `bot:scrape` ghi vào kho `data/<groupId>.json` (1 file JSON dạng mảng cho
mỗi cuộc trò chuyện, dedupe theo `msgId`). `bot:watch` và `bot:scrape` phối hợp
qua **hàng chờ** `data/.scrape-queue.json` (danh sách tên nhóm, không trùng):
`bot:watch` thêm vào, `bot:scrape` đọc, cào đúng các nhóm đó rồi xóa đúng các
nhóm vừa xử lý (nhóm được thêm trong lúc đang cào vẫn còn). Vì `bot:watch`
không bao giờ điều khiển giao diện Zalo Desktop nên chạy song song 2 script là
an toàn — xem mục [Hàng chờ giữa `bot:watch` và
`bot:scrape`](#hàng-chờ-giữa-botwatch-và-botscrape).

## Bắt đầu nhanh

**Yêu cầu:**
- Windows, đã cài **Zalo Desktop** và đăng nhập sẵn tài khoản cần lấy dữ liệu
- [Node.js ≥ 22](https://nodejs.org/)

```bash
npm install
```

Mở `config.ts`, sửa `targets` thành đúng tên hiển thị của các nhóm/hội
thoại cần lấy (xem chi tiết bảng cấu hình bên dưới), rồi chạy:

```bash
npm run bot:scrape
```

Không cần đăng nhập gì thủ công — miễn Zalo Desktop trên máy đã đăng nhập
tài khoản cần lấy dữ liệu theo cách dùng bình thường. Lần chạy đầu, bot sẽ
tự tắt/mở lại Zalo Desktop để bật cổng debug (xem [Luồng hoạt động](#luồng-hoạt-động-chi-tiết)) — phiên đăng nhập không mất vì nó nằm trong profile
cục bộ của app, không phải trong tiến trình.

## Cấu hình (`config.ts`)

`config.ts` là **nơi duy nhất** để chỉnh thông số vận hành của các bot, chia 8 mục: Zalo, Nhóm theo dõi, Cào, Watch, Runner, Khôi phục, Chat, Buổi học. Mỗi thông số có chú thích ý nghĩa, đơn vị và ví dụ cách đặt ngay trong file. Đổi giá trị xong thì **khởi động lại bot liên quan** (bot chỉ đọc file lúc khởi động). Giá trị sai (âm, không nguyên, `runner.quietSeconds` lớn hơn `runner.maxWaitSeconds`, giờ buổi không tăng dần...) làm bot từ chối chạy và báo tên khóa sai. `chat-rules.json` là kịch bản trả lời riêng, không thuộc `config.ts`.

```bash
npm run config:show     # in toàn bộ giá trị theo mục kèm đơn vị, mặc định, bot nào đọc; khóa khác mặc định có dấu *
```

Các mục mới (ngoài các khóa cũ `cdpPort`, `targets`, `sinceTs`, `scrollDelayMs`...):

| Đối tượng | Khóa (mặc định) |
|---|---|
| `watch` | `heartbeatSeconds` 30, `deadAfterSeconds` 90, `minBlindSeconds` 60 |
| `runner` | `quietSeconds` 120, `maxWaitSeconds` 600, `pollSeconds` 5, `dirtyCheckSeconds` 60, `dirtyRetrySeconds` 300, `watchWarmupSeconds` 90, `maxConsecutiveFailures` 3 |
| `recovery` | `marginMinutes` 5 |
| `chat` | `pollSeconds` 3, `heartbeatSeconds` 30, `skipBackoffSeconds` 45, `sentLedgerMinutes` 10, `echoWindowSeconds` 120 |
| `sessions` | `chieuFromHour` 12, `toiFromHour` 18 |


| Trường | Ý nghĩa |
|---|---|
| `cdpPort` / `cdpUrl` | Cổng debug CDP dùng để mở/kết nối Zalo Desktop (mặc định `9222`). |
| `zaloExePath` | Đường dẫn `Zalo.exe`, **tự dò** trong `%LOCALAPPDATA%\Programs\Zalo\Zalo-*\Zalo.exe` (lấy bản mới nhất). Chỉ cần set tay nếu tự dò thất bại. |
| `autoLaunchZalo` | `true` = tự tắt/mở lại Zalo Desktop kèm cờ debug khi cần (bắt buộc `true` để chạy không người trực lúc lên lịch). |
| `dataDir` | Thư mục gốc chứa `data/` (1 file `.json` mỗi nhóm). |
| `targets` | Danh sách **tên hiển thị chính xác** của hội thoại/nhóm cần lấy, đúng như hiện trên sidebar Zalo Desktop. Hỗ trợ nhiều nhóm cùng lúc — xem ghi chú hiệu năng bên dưới. |
| `sinceTs` | Mốc thời gian **chặn dưới** (unix ms). Dùng `todayAt(giờ, phút)` — tự tính theo **ngày hiện tại lúc bot chạy**, vì `todayAt` gọi `new Date()` mỗi lần `config.ts` được import. `null` = không chặn dưới. |
| `untilTs` | Mốc thời gian **chặn trên** (unix ms). Chỉ lọc kết quả cuối, không ảnh hưởng việc cuộn. `null` = không chặn trên (lấy tới lúc chạy thật sự). Dùng để cố định khung giờ (VD 8h–12h) không bị trôi nếu job chạy trễ. |
| `targetMessageCount` | Giới hạn an toàn số tin tối đa lấy mỗi nhóm mỗi lần chạy. |
| `scrollDelayMs` | Khoảng random (ms) giữa các lần cuộn, tránh cuộn dồn dập. |

**Ví dụ khung giờ:**
- 8h–12h cố định: `sinceTs: todayAt(8, 0)`, `untilTs: todayAt(12, 0)`.
- 6h sáng tới lúc chạy (không giới hạn trên): `sinceTs: todayAt(6, 0)`, `untilTs: null`.

> [!TIP]
> `targets` càng nhiều nhóm thì 1 lần chạy `bot:scrape` càng lâu — cả tiến
> trình xử lý **tuần tự từng nhóm một** trên cùng 1 kết nối CDP, không chạy
> song song. Không có giới hạn cứng về số lượng nhóm; đây thuần là đánh đổi
> thời gian chạy, không phải giới hạn kỹ thuật.

## Luồng hoạt động chi tiết

Mỗi lần chạy `index.ts` (`bot:scrape`):

1. **`ensureZaloReady()`** (`history/desktopScraper.ts`): kiểm tra cổng
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
4. Với mỗi tên hội thoại trong `config.targets`:
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
     đều cũ hơn `config.sinceTs` (không cần cuộn tiếp).
   - Lọc lại theo cả `sinceTs` (chặn dưới) và `untilTs` (chặn trên).
   - Ghi vào `MessageStore` (`data/<groupId>.json`, dedupe theo `msgId`).

### Chế độ theo dõi thời gian thực (`watch`)

`npm run bot:watch` đứng chạy liên tục và phát hiện ngay khi có tin mới, từ
**2 nguồn** độc lập (`history/watch.ts`); mỗi lần phát hiện chỉ ghi tên nhóm
vào hàng chờ (không mở giao diện, không cào, không lưu tin):

1. **WebSocket nội bộ của Zalo Desktop (`history/realtimeListener.ts`,
   nhanh nhất)** — Zalo Desktop tự mở 1 kết nối WebSocket tới backend chat
   của nó để tự cập nhật UI; bot chỉ **quan sát** kết nối đó qua CDP
   `Network` domain (không tạo kết nối riêng, không cần đăng nhập gì thêm).
   Giải mã frame `cmd=501`/`521` (tin nhắn mới) để lấy `idTo` (id hội thoại),
   so khớp với `groupId` đã biết của `config.targets` (học từ dữ liệu đã
   cào trước đó trong `data/`), rồi đưa đúng nhóm đó vào hàng chờ — kể cả khi
   nhóm đó đang là nhóm bạn mở/focus. Cần **key mã hoá trao đổi lúc kết nối
   mở** nên `bot:watch` luôn tắt/mở lại Zalo Desktop lúc khởi động (xem mục
   Bảo trì #4) để chắc chắn bắt được key này; nhóm chưa từng được cào lần
   nào thì chưa có `groupId` để so khớp, nguồn này sẽ bỏ qua nhóm đó cho tới
   khi có ít nhất 1 lần quét (qua `bot:scrape`).
2. **Observer thông báo (toast, dự phòng)** — gắn CDP vào cửa sổ popup
   thông báo riêng của Zalo Desktop (`znotification.html`). Theo dõi bằng
   `MutationObserver`, mỗi khi đổi nội dung sẽ push sự kiện về Node qua CDP
   binding (không polling). Tên nhóm trong thông báo có dạng `"Nhóm: <tên>"`;
   chỉ những tên khớp `config.targets` mới kích hoạt.

### Hàng chờ giữa `bot:watch` và `bot:scrape`

- File: `data/.scrape-queue.json` — mảng JSON tên nhóm đúng như `config.targets`, không trùng. Ghi nguyên tử (file tạm rồi đổi tên).
- `bot:watch` chỉ **thêm** tên nhóm khi phát hiện tin mới. Không bao giờ chạm vào giao diện Zalo Desktop.
- `bot:scrape` (chạy tay hoặc do skill gọi) chụp lại hàng chờ, cào đúng các nhóm đó rồi xóa đúng các nhóm vừa xử lý; nhóm `bot:watch` thêm trong lúc đang cào vẫn còn cho lần sau. Hàng chờ rỗng: thoát ngay, in `hàng chờ rỗng`.
- Nhóm lỗi hoặc không có tin vẫn bị xóa khỏi hàng chờ và được ghi log; nếu không kết nối được Zalo Desktop thì không xóa gì.
- Vì chỉ `bot:scrape` điều khiển giao diện nên không còn nguy cơ 2 tiến trình cùng click/cuộn 1 cửa sổ Zalo.

> [!NOTE]
> Watcher hiện chỉ là 1 tiến trình Node bình thường — đóng terminal là nó
> tắt theo, không tự phục hồi khi crash hay khi máy khởi động lại. Muốn
> chạy thật sự "nền" kiểu service thì cần thêm lớp quản lý tiến trình (pm2,
> Windows Service qua NSSM, hoặc Task Scheduler với trigger "khi khởi động
> máy") — chưa được thiết lập.

## Sử dụng

```bash
npm run bot:scrape          # cào các nhóm đang trong hàng chờ (rỗng thì thoát ngay)
npm run bot:watch           # theo dõi liên tục, chỉ đưa nhóm có tin mới vào hàng chờ
npm run export:excel <groupId> [senderName]    # xuất .xlsx từ dữ liệu đã cào
npm run mcp                 # MCP server (stdio) cho Claude Code/Desktop
npm run zalo:debug          # chỉ mở Zalo Desktop kèm cổng debug, không quét
npm run typecheck           # tsc --noEmit
```

`export:excel` đọc dữ liệu **đã có sẵn** trong `data/<groupId>.json`
(không tự cào), nên cần chạy `bot:scrape` hoặc `bot:watch` trước ít nhất 1
lần cho nhóm đó. Tìm `groupId` bằng cách xem tên file trong `data/`, hoặc
gọi tool `list_threads` qua MCP server (trả về cả `groupId` lẫn `groupName`).

### Chạy debug thủ công (mở cổng CDP mà không qua bot)

Muốn tự mở Zalo Desktop kèm cổng debug để soi DOM/probe CDP thủ công (VD
khi cần cập nhật lại selector) mà không cần chạy cả một lượt quét:

```bash
npm run zalo:debug
```

Lệnh này chỉ gọi `ensureZaloReady()` rồi in ra URL debug và thoát, **không**
đụng vào `config.targets` hay `data/`. `debug-active-conversation.ts` và
`debug-zalo.ts` ở thư mục gốc là các script chẩn đoán một lần dùng để dò
lại selector khi Zalo Desktop đổi giao diện.

Kiểm tra cổng debug đã mở chưa:

```bash
curl http://127.0.0.1:9222/json/version
```

Có kết quả JSON (không lỗi connection refused) nghĩa là CDP đã sẵn sàng.
Đổi `9222` nếu bạn đã đổi `config.cdpPort`.

### `bot:runner`: tự động cào, trích xuất và điền Excel

`bot:runner` là tiến trình thứ ba, chạy 24/24 cạnh `bot:watch`. Nó theo dõi hàng chờ; khi có nhóm và hàng chờ **yên lặng 2 phút** (trần 10 phút kể từ nhóm đầu tiên) thì chạy một vòng: khôi phục nếu `bot:watch` từng gián đoạn, cào các nhóm trong hàng chờ, đồng bộ DB, rồi với mỗi buổi có báo cáo đầu/cuối buổi mới thì trích xuất, ghi đè Excel `data/export/baocaobuoi<buổi>_<ddMMyy>.xlsm` (qua tệp tạm; nếu tệp đang mở thì lưu `..._moi.xlsm`) và đánh dấu tin. Sau 3 vòng lỗi liên tiếp nó ngừng tự thử cho đến khi được khởi động lại (hàng chờ vẫn nguyên).

```bash
npm run bot:runner                                   # chạy nền; không khởi động lại bot:watch (một lần cào vẫn mở lại Zalo nếu cổng debug đóng, như bot:scrape)
npm run runner:status                                # sống hay chết, vòng gần nhất, hàng chờ, buổi chưa dựng xong (thoát mã 2 nếu không sống)
npm run runner:once -- [--day D] [--buoi B]          # dựng lại MỘT buổi, không cào (dùng sau khi sửa output/overrides.json)
```

Tệp trạng thái: `data/.runner-state.json` (nhịp tim), `output/runner-log.jsonl` (mỗi vòng một dòng), `data/.runner-built.json` (các báo cáo đã dựng vào Excel: báo cáo nằm trên đĩa mà chưa có ở đây sẽ được dựng, nên crash giữa vòng hay cào tay không làm mất buổi nào), `data/.scrape-queue-meta.json` và `data/.scrape-queue-seen.json` (thời điểm nhóm vào hàng chờ, và tin đến khi nhóm đang nằm trong hàng chờ nên không bị bỏ sót), `data/.scrape.lock` (khóa chung: mọi thứ điều khiển giao diện Zalo, gồm `bot:scrape` chạy tay, không chạy cùng lúc). Giới hạn đã biết: cào điều khiển giao diện Zalo Desktop (nhấp, cuộn) nên có thể làm gián đoạn người đang gõ trong Zalo.

### `bot:chat`: tự động trả lời theo kịch bản

`bot:chat` đọc tin chữ mới trong các nhóm liệt kê ở `chat-rules.json` và trả lời bằng câu có sẵn theo tình huống (ví dụ báo cáo có máy lỗi). `bot:watch` vẫn là nơi duy nhất nghe tin (WebSocket) và chia mỗi tin thành hai luồng độc lập: hàng chờ cào (cho `bot:runner`) và hộp thư chat `data/.chat-inbox.jsonl` (cho `bot:chat`). Câu bot gửi ra được ghi vào sổ để `bot:watch` bỏ qua khi nó dội lại (không cào thừa, không tự trả lời chính mình). Gửi qua giao diện Zalo Desktop (CDP) và giữ khóa `data/.scrape.lock` chung với `bot:runner`.

```bash
npm run bot:chat        # chạy nền; nạp lại chat-rules.json khi tệp đổi (tệp sai thì giữ bản cũ)
npm run chat:status     # còn sống không, gửi thật hay dry-run, nhóm nào, còn bao nhiêu tin chờ (thoát mã 2 nếu không sống)
```

`chat-rules.json` (mẫu: `docs/superpowers/specs/2026-09-25-bot-chat-rules.sample.json`): `dryRun`; `limits` (`maxRepliesPerMinute`, `maxReplyDelaySeconds`, `cooldownSecondsPerRule`); `groups` với tên nhóm (bắt buộc thuộc `config.targets`) và `rules` xét theo thứ tự, tình huống đầu tiên khớp thì trả lời. `when`: `loaiBaoCao` (`DauBuoi`/`CuoiBuoi`), `mayLoi: true` (số máy lỗi > 0 hoặc có ghi chú như "IT bảo trì"; số 0 thì không), `keywords` (không phân biệt dấu và hoa thường). `reply` có thể chèn `{senderName}`. **Nhóm chỉ chat:** thêm `"scrape": false` vào một nhóm (cạnh `"rules"`) thì `bot:watch` vẫn đưa tin của nhóm đó vào hộp thư chat nhưng **không xếp nó vào hàng chờ cào**, và khôi phục (`bot:runner`, `recover:missing`) tự bỏ qua nhóm đó; nhóm này không có dữ liệu mới trong `data/` và DB. Nhóm vẫn phải nằm trong `config.targets` và (nếu chưa từng được cào) phải được cào một lần để watch biết mã nhóm. Mặc định là `true`. Đổi xong thì khởi động lại `bot:watch`, `bot:runner` và `bot:chat`.

Tệp trạng thái: `data/.chat-inbox.jsonl` và `data/.chat-inbox.cursor` (hộp thư và vị trí đã đọc), `data/.chat-done.json` (tin đã xử lý), `data/.chat-sent.json` (câu vừa gửi, để nhận ra tin dội lại), `data/.chat-state.json` (nhịp tim). Tạo tệp `data/.chat-off` để dừng gửi ngay. Giới hạn đã biết: chỉ tin chữ; chưa trả lời dạng trích dẫn; mỗi lần gửi chiếm giao diện Zalo (nên dành riêng một bản Zalo cho bot khi có nhiều nhóm); nội dung chỉ lấy từ WebSocket của `bot:watch`, mất WebSocket thì bot không trả lời; tự động gửi tin có thể bị Zalo coi là bất thường.

## Báo cáo buổi dạy (skill Teach-lesson-skills-V2)

Luồng: `bot:scrape` → `sync:db -- --apply` → `extract:reports -- --buoi <sang|chieu|toi>` → agent xem
`output/review.json` (sửa qua `output/overrides.json`) → `fill:report -- output/output.json` →
`mark:messages -- output/marks.json`. Mỗi lần chỉ xử lý một buổi của một ngày và tạo file
`data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm`.
Chi tiết từng bước: [docs/QUY-TRINH.md](docs/QUY-TRINH.md). Cài đặt và chạy tự động với agent:
[docs/GUIDE.md](docs/GUIDE.md). Quy tắc trích xuất trong `Teach-lesson-skills-V2/SKILL.md`; bản thiết kế
gốc ở `docs/superpowers/specs/2026-09-24-teacher-lesson-report-extraction-design.md`.
Mã trích xuất nằm trong `lesson/` và có test (`npm test`); `fill:report` cần Microsoft Excel.

`bot:watch` ghi nhịp tim và các khoảng gián đoạn (`data/.watch-state.json`, `data/.watch-gaps.json`). Xem
tình trạng bằng `npm run watch:status`; khi nó từng chết, `npm run recover:missing` chỉ cào lại các nhóm còn thiếu
báo cáo và cho biết những tin đã bị lỡ (bước 1b trong QUY-TRINH.md).

## Cấu trúc dự án

```
config.ts                        SỬA Ở ĐÂY để đổi khung giờ, nhóm cần lấy, v.v.
index.ts                         chế độ quét theo lịch (npm run bot:scrape)
watch.ts                         chế độ theo dõi liên tục (npm run bot:watch)
debug-zalo.ts                    mở Zalo Desktop kèm cổng debug, không quét
debug-active-conversation.ts     chẩn đoán: in className của item sidebar đang active

history/
  desktopScraper.ts              logic chính: ensureZaloReady, tìm nhóm, cuộn, cào,
                                  đọc groupId/groupName/senderId thật qua React fiber
  watch.ts                       logic watcher: nguồn WS realtime + notification popup,
                                  chung 1 debounce + queue
  realtimeListener.ts            nghe WebSocket nội bộ của Zalo Desktop qua CDP Network
                                  domain (best-effort, xem mục Bảo trì)
  cdp.ts                         client CDP thô (WebSocket) thay Playwright
  scrapeSelectors.ts             CSS selector DOM Zalo Desktop
  exportExcel.ts / exportExc
  elCli.ts   xuất .xlsx từ dữ liệu đã cào

store/
  messageStore.ts                ghi/đọc data/<groupId>.json (mảng JSON), dedupe

mcp/
  server.ts                      MCP server chỉ-đọc: list_threads,
                                  get_recent_messages, search_messages

data/                             DỮ LIỆU ĐẦU RA (không commit, .gitignore)
  <groupId>.json                   lưu vĩnh viễn, mảng JSON ghi đè mỗi lần lưu,
                                    dedupe theo msgId, đặt tên theo group id thật
                                    (bền vững khi đổi tên nhóm)
```

## Dữ liệu đầu ra

### `data/<groupId>.json` — kho lưu vĩnh viễn duy nhất

Một file JSON (mảng, pretty-print, sắp theo `ts` tăng dần) cho mỗi cuộc trò
chuyện — đây là **nơi lưu trữ duy nhất**, không có kho phụ hay bản xuất
riêng theo ngày. Mỗi lần lưu tin mới, cả mảng được ghi đè lại (qua file tạm
rồi rename, tránh hỏng file nếu bị ngắt giữa chừng), dedupe theo `msgId` —
chạy lại `bot:scrape`/`bot:watch` không tạo tin trùng. Tên file là `groupId`
thật (không phải slug tên nhóm), nên **không bị vỡ lịch sử khi nhóm đổi
tên**. Shape `NormalizedMessage` (`store/messageStore.ts`):

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
thay vì một file export tự động sinh mỗi ngày.

## Bảo trì & giới hạn đã biết

Xếp theo khả năng gặp phải, cao → thấp:

1. **Đọc `groupId`/`senderId` qua React internal fiber (`history/desktopScraper.ts:readMsgIdentitySrc`)** —
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

2. **Selector DOM (`history/scrapeSelectors.ts`)** — gắn chặt vào bản UI
   hiện tại của Zalo Desktop. Mỗi lần Zalo tự động update giao diện, các
   class này có thể đổi và scraper sẽ âm thầm trả về rỗng hoặc báo
   `"sidebar item for ... not found"`. Cách sửa: chạy `npm run zalo:debug`,
   dùng `debug-active-conversation.ts` hoặc `Runtime.evaluate` thủ công
   qua `history/cdp.ts` để soi DOM mới và cập nhật lại selector.

3. **Định dạng `msgId`/timestamp có thể thay đổi theo loại tin nhắn** — đã
   từng gặp: tin nhắn dạng album ảnh có id `bb_msg_id_<ts>_<n>_<groupId>`
   khác với tin text thường (`bb_msg_id_<ts>`). Đã vá bằng cách chỉ lấy số
   ở đoạn đầu id, nhưng các loại tin khác (sticker, file, voice, tin nhắn
   bị thu hồi...) chưa được test kỹ — nếu thấy `content: ""` hoặc
   `timeLocal` bất thường trong file export, khả năng cao là một định dạng
   id mới chưa được xử lý.

4. **Nguồn WS realtime (`history/realtimeListener.ts`) dựa trên giao thức
   nhị phân chưa công bố của Zalo** (mã lệnh cmd/subCmd, mã hoá AES-GCM +
   nén gzip) — dò ngược qua dự án `zca-js` và xác nhận lại bằng cách bắt
   trực tiếp gói tin qua CDP `Network` domain, không phải API chính thức.
   Zalo đổi giao thức bất cứ lúc nào mà không có dấu hiệu gì ở UI. Vì đây
   chỉ là **nguồn trigger phụ, best-effort** (song song với popup thông
   báo), nếu nó hỏng thì `bot:watch` tự động chỉ còn chạy bằng cơ chế
   notification cũ — không mất khả năng theo dõi, chỉ mất phần "tức thời
   hơn". Triệu chứng hỏng: không còn thấy log `[watch] realtime-ws: new
   message detected` dù có tin nhắn mới.

5. **`zaloExePath` tự dò theo cấu trúc thư mục cài đặt hiện tại**
   (`%LOCALAPPDATA%\Programs\Zalo\Zalo-<version>\Zalo.exe`). Nếu Zalo đổi
   cách cài đặt (VD chuyển sang Microsoft Store/MSIX) thì auto-detect sẽ
   thất bại — lúc đó cần set `zaloExePath` thủ công trong `config.ts`.

6. **`autoLaunchZalo: true` sẽ tắt Zalo Desktop bất kể bạn đang dùng dở** —
   với `bot:scrape`, chỉ xảy ra khi debug port chưa mở; với `bot:watch`,
   xảy ra **mỗi lần khởi động**, kể cả khi Zalo đã mở sẵn — cần thiết để
   nguồn WS realtime bắt được cipher key trao đổi lúc kết nối (xem
   `history/realtimeListener.ts`). Không mất dữ liệu, chỉ gián đoạn UI vài
   giây. Nếu thấy phiền, có thể tắt `autoLaunchZalo`, nhưng khi đó `bot:watch`
   sẽ mất nguồn WS realtime (vẫn còn popup thông báo làm dự phòng).

7. **Không có cơ chế bù lại (backfill) nếu job bị bỏ lỡ** — máy tắt/ngủ
   đúng giờ lên lịch, hoặc Task Scheduler bị lỗi, thì ngày đó coi như mất,
   `sinceTs`/`untilTs` không tự lùi lại quét bù.

8. **Không có cảnh báo khi chạy lỗi** — script chỉ log ra console và thoát
   mã lỗi khác 0; nếu chạy qua Task Scheduler không ai để ý, lỗi sẽ không
   ai biết trừ khi chủ động kiểm tra lịch sử tác vụ hoặc log.

9. **`data/` không có dọn dẹp tự động** — mỗi `data/<groupId>.json` tăng
   dần vô hạn theo số tin nhắn của nhóm đó. Không ảnh hưởng chức năng nhưng
   nên để ý dung lượng nếu chạy lâu dài (mỗi lần lưu ghi đè lại toàn bộ file,
   nên file càng lớn thì mỗi lần lưu càng chậm hơn một chút).

10. **`senderId` là id số thật, không phải dữ liệu ẩn danh** — dữ liệu nội
   bộ Zalo đọc qua React fiber (`readMsgIdentitySrc`) còn chứa cả số điện
   thoại, ngày sinh, avatar... của người gửi, nhưng scraper **chỉ trích
   xuất đúng `fromUid`/`userId`**, không lưu các trường nhạy cảm khác. Nếu
   sau này mở rộng để lấy thêm thông tin từ đó, cân nhắc kỹ trước khi ghi
   vào `data/` — file này không mã hoá và không nên chia sẻ tuỳ tiện.

## Lên lịch chạy tự động

Chưa cấu hình Task Scheduler — hiện phải chạy tay `npm run bot:scrape`.
Khi cần chạy tự động (VD 12:00 hằng ngày), tạo một Scheduled Task Windows
gọi đúng lệnh đó trong thư mục repo; `autoLaunchZalo: true` đảm bảo Zalo
Desktop sẽ tự khởi động lại kèm cổng debug kể cả khi máy chưa mở Zalo hoặc
Zalo đang mở không kèm cờ debug.
