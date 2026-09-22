# zca-scrape-message

Đọc lịch sử tin nhắn của các nhóm/hội thoại chỉ định từ **Zalo Desktop**
(app Windows, không phải web), chạy theo lịch hoặc theo thời gian thực, ghi
ra file JSONL + JSON/Excel export. Không gửi tin, không có bước đăng nhập
riêng của bot — chỉ đọc DOM của phiên Zalo Desktop bạn đã đăng nhập sẵn
theo thói quen dùng hàng ngày.

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
| Quét theo lịch | `npm run bot:scrape` | Chạy 1 lần: mở từng nhóm trong `config.targets`, cuộn lấy lịch sử theo khung giờ cấu hình, rồi thoát. Dùng với Task Scheduler. |
| Theo dõi thời gian thực | `npm run bot:watch` | Đứng chạy liên tục, phản ứng ngay khi có tin mới qua popup thông báo của Zalo Desktop — không cần đợi tới giờ quét kế tiếp. |
| Xuất Excel | `npm run export:excel` | Xuất tin đã cào sẵn của 1 nhóm ra file `.xlsx`, có thể lọc theo người gửi. |
| MCP server | `npm run mcp` | Phơi dữ liệu đã cào ra cho Claude Code/Claude Desktop qua 3 tool chỉ-đọc. |

Cả 2 chế độ quét đều ghi vào cùng 1 kho `data/<thread-slug>.jsonl`
(append-only, dedupe theo `msgId`), nên chạy xen kẽ giữa 2 chế độ ở các
thời điểm khác nhau không tạo dữ liệu trùng — chỉ lưu ý **không chạy đồng
thời cùng lúc** (xem cảnh báo ở mục [Theo dõi thời gian thực](#chế-độ-theo-dõi-thời-gian-thực-watch)).

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

| Trường | Ý nghĩa |
|---|---|
| `cdpPort` / `cdpUrl` | Cổng debug CDP dùng để mở/kết nối Zalo Desktop (mặc định `9222`). |
| `zaloExePath` | Đường dẫn `Zalo.exe`, **tự dò** trong `%LOCALAPPDATA%\Programs\Zalo\Zalo-*\Zalo.exe` (lấy bản mới nhất). Chỉ cần set tay nếu tự dò thất bại. |
| `autoLaunchZalo` | `true` = tự tắt/mở lại Zalo Desktop kèm cờ debug khi cần (bắt buộc `true` để chạy không người trực lúc lên lịch). |
| `dataDir` | Thư mục gốc chứa `data/` (JSONL + export). |
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
   - Ghi vào `MessageStore` (JSONL, dedupe theo `msgId`) **và** xuất một
     file JSON riêng cho lần chạy này.

### Chế độ theo dõi thời gian thực (`watch`)

`npm run bot:watch` đứng chạy liên tục và phản ứng ngay khi có tin mới,
dùng **2 observer** khác nhau (`history/watch.ts`):

1. **Observer thông báo (toast)** — gắn CDP vào cửa sổ popup thông báo
   riêng của Zalo Desktop (`znotification.html`). Theo dõi bằng
   `MutationObserver`, mỗi khi đổi nội dung sẽ push sự kiện về Node qua CDP
   binding (không polling). Tên nhóm trong thông báo có dạng `"Nhóm: <tên>"`;
   chỉ những tên khớp `config.targets` mới kích hoạt. Có debounce 2 giây để
   gộp nhiều thông báo dồn dập của cùng 1 nhóm thành 1 lần quét.
2. **Observer trong nhóm đang mở** — sau khi observer #1 mở đúng nhóm và
   đọc dữ liệu hiện có, gắn thêm 1 `MutationObserver` thẳng vào khung tin
   nhắn của nhóm đó, bắt từng tin mới render ra DOM ngay lập tức — vì khi 1
   nhóm đang mở/focus, Zalo thường không popup thông báo cho chính nhóm đó
   nữa. Mỗi tin nhắn observer #2 bắt được đều kèm theo **tên nhóm đang thật
   sự mở, đọc tươi từ sidebar tại đúng thời điểm đó** — không dùng biến nhớ
   "nhóm bot vừa mở" — nên nếu bạn tự tay chuyển sang xem nhóm khác trong
   lúc watcher đang chạy, tin nhắn của nhóm đó vẫn được gán đúng `groupId`,
   không bị lẫn vào nhóm trước đó.

> [!WARNING]
> **Không chạy đồng thời `bot:scrape` (qua Task Scheduler) và `bot:watch`.**
> Cả hai đều gọi `ensureZaloReady()`, có thể tắt/mở lại Zalo Desktop nếu
> thấy debug port chưa mở; nếu `bot:scrape` làm vậy giữa lúc `bot:watch`
> đang chạy, toàn bộ kết nối CDP của watcher sẽ bị đứt theo. Chọn 1 trong 2
> chế độ vận hành trên cùng 1 máy.

> [!NOTE]
> Watcher hiện chỉ là 1 tiến trình Node bình thường — đóng terminal là nó
> tắt theo, không tự phục hồi khi crash hay khi máy khởi động lại. Muốn
> chạy thật sự "nền" kiểu service thì cần thêm lớp quản lý tiến trình (pm2,
> Windows Service qua NSSM, hoặc Task Scheduler với trigger "khi khởi động
> máy") — chưa được thiết lập.

## Sử dụng

```bash
npm run bot:scrape          # quét 1 lần theo config.targets
npm run bot:watch           # theo dõi liên tục, phản ứng theo thông báo
npm run export:excel <groupId> [senderName]    # xuất .xlsx từ dữ liệu đã cào
npm run mcp                 # MCP server (stdio) cho Claude Code/Desktop
npm run zalo:debug          # chỉ mở Zalo Desktop kèm cổng debug, không quét
npm run typecheck           # tsc --noEmit
```

`export:excel` đọc dữ liệu **đã có sẵn** trong `data/<groupId>.jsonl`
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
  watch.ts                       logic watcher: 2 observer + debounce + queue
  cdp.ts                         client CDP thô (WebSocket) thay Playwright
  scrapeSelectors.ts             CSS selector DOM Zalo Desktop
  exportJson.ts                  xuất data/export/<groupId>_<ngày>.json
  exportExcel.ts / exportExcelCli.ts   xuất .xlsx từ dữ liệu đã cào

store/
  messageStore.ts                ghi/đọc data/<groupId>.jsonl, dedupe

mcp/
  server.ts                      MCP server chỉ-đọc: list_threads,
                                  get_recent_messages, search_messages

data/                             DỮ LIỆU ĐẦU RA (không commit, .gitignore)
  <groupId>.jsonl                  lưu vĩnh viễn, append-only, dedupe theo msgId,
                                    đặt tên theo group id thật (bền vững khi đổi tên nhóm)
  export/
    <groupId>_<YYYY-MM-DD>.json      xuất theo từng lần chạy trong ngày,
                                        chạy lại trong cùng ngày sẽ ghi đè
```

## Dữ liệu đầu ra

### 1. `data/<groupId>.jsonl` — kho lưu vĩnh viễn

Mỗi dòng 1 tin nhắn (JSON), append-only, dedupe theo `msgId` (chạy lại
không tạo tin trùng). Tên file là `groupId` thật (không phải slug tên
nhóm), nên **không bị vỡ lịch sử khi nhóm đổi tên**. Shape
`NormalizedMessage` (`store/messageStore.ts`):

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

### 2. `data/export/<groupId>_<YYYY-MM-DD>.json` — xuất theo lần chạy

Mảng JSON, pretty-print, sắp theo thời gian tăng dần, chỉ chứa tin của
**lần chạy đó** (đã áp `sinceTs`/`untilTs`). Giống `NormalizedMessage`
nhưng thêm 2 trường thời gian dễ đọc: `timeIso` (ISO 8601 UTC) và
`timeLocal` (giờ Việt Nam, `HH:mm:ss DD/MM/YYYY`).

> [!IMPORTANT]
> Chạy lại trong cùng ngày sẽ **ghi đè** file export của ngày đó (không
> cộng dồn) — file `.jsonl` mới là nơi lưu lâu dài/dedupe. Watch mode chỉ
> ghi vào `.jsonl`, **không đụng tới `data/export/...json`**, để tránh ghi
> đè snapshot đầy đủ của `bot:scrape` bằng vài dòng vừa thấy.

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

4. **`zaloExePath` tự dò theo cấu trúc thư mục cài đặt hiện tại**
   (`%LOCALAPPDATA%\Programs\Zalo\Zalo-<version>\Zalo.exe`). Nếu Zalo đổi
   cách cài đặt (VD chuyển sang Microsoft Store/MSIX) thì auto-detect sẽ
   thất bại — lúc đó cần set `zaloExePath` thủ công trong `config.ts`.

5. **`autoLaunchZalo: true` sẽ tắt Zalo Desktop bất kể bạn đang dùng dở** —
   nếu job chạy đúng lúc bạn đang gõ chat mà debug port chưa mở, Zalo sẽ bị
   tắt/mở lại đột ngột (không mất dữ liệu, chỉ gián đoạn UI). Nếu thấy
   phiền, có thể tắt `autoLaunchZalo` và tự đảm bảo Zalo luôn mở kèm
   `--remote-debugging-port=9222` (VD gắn cờ vào shortcut).

6. **Không có cơ chế bù lại (backfill) nếu job bị bỏ lỡ** — máy tắt/ngủ
   đúng giờ lên lịch, hoặc Task Scheduler bị lỗi, thì ngày đó coi như mất,
   `sinceTs`/`untilTs` không tự lùi lại quét bù.

7. **Không có cảnh báo khi chạy lỗi** — script chỉ log ra console và thoát
   mã lỗi khác 0; nếu chạy qua Task Scheduler không ai để ý, lỗi sẽ không
   ai biết trừ khi chủ động kiểm tra lịch sử tác vụ hoặc log.

8. **`data/` không có dọn dẹp tự động** — `data/*.jsonl` tăng dần vô hạn
   (append-only), `data/export/` cộng thêm 1 file/nhóm/ngày mỗi ngày chạy.
   Không ảnh hưởng chức năng nhưng nên để ý dung lượng nếu chạy lâu dài.

9. **`senderId` là id số thật, không phải dữ liệu ẩn danh** — dữ liệu nội
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
