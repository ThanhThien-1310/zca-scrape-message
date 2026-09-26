# Hướng dẫn cài đặt và chạy tự động với agent

Tài liệu này hướng dẫn dựng quy trình báo cáo buổi dạy trên một máy Windows, cho các bot chạy nền và cho agent OpenClaw giám sát nó. Chi tiết từng bước của quy trình, các file sinh ra và cách xử lý sự cố nằm ở [QUY-TRINH.md](QUY-TRINH.md).

Các đường dẫn bên dưới tính từ thư mục workspace của OpenClaw (`~\.openclaw\THDD_OpenClaw\openclaw\workspace`); thư mục dự án là `zca-scrape-message\`.

## Tổng quan: ai làm gì

Hệ thống gồm bốn thành phần chạy độc lập. Ba bot là tiến trình Node chạy nền trên máy, còn agent chạy theo lịch của OpenClaw.

| Thành phần | Việc | Chạy bằng |
|---|---|---|
| `bot:watch` | **Nơi duy nhất nghe tin** từ Zalo Desktop. Mỗi tin mới nó chia vào hai luồng: hàng chờ cào (cho runner) và hộp thư chat (cho bot chat). Ghi nhịp tim để biết khi nó chết | `npm run bot:watch` |
| `bot:runner` | Nhìn hàng chờ; khi có nhóm và hàng chờ yên lặng thì cào, đồng bộ DB, trích xuất, ghi đè file Excel của buổi | `npm run bot:runner` |
| `bot:chat` | Đọc hộp thư chat, trả lời bằng câu có sẵn theo kịch bản `chat-rules.json` (tùy chọn) | `npm run bot:chat` |
| Agent OpenClaw | **Giám sát**: kiểm tra runner còn sống, xem các mục cần xem trong `review.json`, dựng lại buổi sau khi sửa | `openclaw cron` |

```
Zalo Desktop ──► bot:watch ──┬──► hàng chờ cào ──► bot:runner ──► DB + file Excel ──► agent giám sát
                             └──► hộp thư chat ──► bot:chat ──► trả lời trong nhóm
```

Cả `bot:runner` và `bot:chat` điều khiển giao diện Zalo Desktop (cào, gõ tin), nên chúng dùng chung một khóa (`data\.scrape.lock`) để không chạy cùng lúc.

## 1. Yêu cầu

| Yêu cầu | Ghi chú |
|---|---|
| Windows 10 trở lên, **đăng nhập sẵn** | Zalo Desktop và Excel chạy trong phiên đăng nhập của bạn; không đăng xuất khi chạy tự động |
| Node.js 22 trở lên | `node -v` |
| Zalo Desktop, đã đăng nhập | Bản cài dạng `Zalo-<phiên bản>\Zalo.exe` trong `AppData\Local\Programs\Zalo` |
| Microsoft Excel | Bước điền báo cáo dùng Excel qua PowerShell (COM) |
| PowerShell 5.1 | Có sẵn trên Windows |
| SQL Server | Bảng `Zalo_CrawlMessage`, hàm `dbo.fn_LookupRoomIds`, kiểu bảng `RoomSchoolArea` và bảng `Room` (xem mục 3) |
| OpenClaw 2026.5.20 trở lên | Lệnh `openclaw` có trong PATH |

## 2. Cài đặt dự án

```powershell
cd zca-scrape-message
npm install
```

### 2.1. Kết nối DB (`.env`)

Tạo file `.env` trong `zca-scrape-message\` (file này bị gitignore, không commit):

```
DB_SERVER=<địa chỉ máy chủ SQL>
DB_PORT=1433
DB_NAME=<tên cơ sở dữ liệu>
DB_USER=<tài khoản>
DB_PASSWORD=<mật khẩu>
DB_ENCRYPT=true
DB_TRUST_CERT=true
```

Kiểm tra kết nối (chỉ đọc, không ghi gì):

```powershell
npx tsx src/cli/debug/db-check.ts
```

Kết quả đúng: in `connected: <tên DB> as <tài khoản>` và danh sách cột của `Zalo_CrawlMessage`.

### 2.2. Cấu hình (`config.ts`)

`config.ts` là **nơi duy nhất** để chỉnh thông số vận hành. File chia 8 mục (Zalo, Nhóm theo dõi, Cào, Watch, Runner, Khôi phục, Chat, Buổi học) và mỗi thông số có chú thích ý nghĩa, đơn vị và ví dụ cách đặt ngay cạnh giá trị.

- **Xem toàn bộ giá trị:** `npm run config:show` (đơn vị, mặc định, bot nào đọc). Giá trị khác mặc định có dấu `*` ở đầu dòng.
- **Sửa:** mở `config.ts`, đổi giá trị, rồi **khởi động lại bot liên quan** (bot chỉ đọc file lúc khởi động). Giá trị sai (âm, không nguyên, `runner.quietSeconds` lớn hơn `runner.maxWaitSeconds`, giờ buổi không tăng dần...) làm bot không khởi động và báo tên khóa sai.

Thông số đầu tiên bạn phải đặt là `targets`: **đúng tên hiển thị** của các nhóm trong thanh bên Zalo Desktop, ví dụ:

```ts
targets: ["LC_ChuVănAn_BTAN", "LC_HoaSen1_TĐ", "LC_TríTuệViệt_BTAN"] as string[],
```

Nhóm thử nghiệm (ví dụ `bot test`) có ba cách xử lý khi chạy thật: xóa khỏi `targets`; để trong `recoveryIgnoreTargets` (không bị coi là "thiếu báo cáo" và không bị cào lại khi khôi phục); hoặc, nếu nó chỉ dùng cho bot chat, đặt `"scrape": false` trong `chat-rules.json` (mục 8.1c). Hai thiết lập khác cần biết:

- `sinceTs` (mặc định 06:00 hôm nay): `bot:scrape` chạy tay chỉ lấy tin từ mốc này trở đi. Giá trị này chỉ được tính **một lần lúc bot khởi động**, nên bot chạy qua đêm giữ mốc của ngày hôm qua (`bot:runner` tự tính lại mỗi vòng nên không bị ảnh hưởng).
- `targetMessageCount` (mặc định 2000): số tin tối đa mỗi nhóm mỗi lần cào.

### 2.3. Kiểm tra mã

```powershell
npm test
npm run typecheck
```

Cả hai phải đạt.

### 2.4. Các thay đổi cấu hình thường gặp

1. **Runner cào nhanh hơn hoặc chậm hơn:** đổi `runner.quietSeconds` (mặc định 120). Ví dụ nhóm nhắn lúc 08:00:20, đặt 120 thì cào lúc 08:02:20, đặt 30 thì cào lúc 08:00:50. Giá trị nhỏ hơn thì nhiều vòng nhỏ hơn chiếm giao diện Zalo. Phải nhỏ hơn hoặc bằng `runner.maxWaitSeconds`.
2. **Đổi ranh giới buổi chiều:** đổi `sessions.toiFromHour` (mặc định 18). Ví dụ 17 thì chiều là 12:00 đến 17:00 và tối từ 17:00; nhớ dời lịch chạy buổi chiều của agent thành 17:05 (mục 8.3). Đổi giờ chỉ ảnh hưởng dữ liệu mới, báo cáo đã dựng theo ranh giới cũ không tự dựng lại.
3. **Thêm nhóm mới:** xem mục 8.1d.
4. **Nhịp tim và ngưỡng "chết":** `watch.heartbeatSeconds` và `watch.deadAfterSeconds` cũng là nhịp tim và ngưỡng chết mà `runner:status` và `chat:status` dùng. `deadAfterSeconds` phải chứa ít nhất 2 nhịp tim (khuyến nghị 3), và cũng phải chứa ít nhất 2 nhịp của `chat.heartbeatSeconds`.
5. **Ngày cụ thể hoặc khung giờ cho `bot:scrape` chạy tay:** `sinceTs` và `untilTs`. `untilTs` chỉ áp dụng cho `bot:scrape` chạy tay; `bot:runner` và khôi phục luôn cào đến hiện tại.

## 3. Yêu cầu về cơ sở dữ liệu

Tài khoản trong `.env` cần quyền:

| Việc | Quyền |
|---|---|
| Đọc bảng `Room` và các bảng trường/khu vực mà hàm tra cứu dùng | SELECT |
| Gọi `dbo.fn_LookupRoomIds` và `dbo.fn_LookupSchoolIds` | SELECT trên hàm |
| Bảng `Zalo_CrawlMessage` | SELECT, INSERT, UPDATE |

Kiểu bảng `RoomSchoolArea` phải tồn tại (hàm tra cứu nhận nó làm tham số). Cấu trúc bảng `Zalo_CrawlMessage` và ý nghĩa `StatusId` xem `Zalo_CrawlMessage.md`.

## 4. File Excel mẫu

File mẫu nằm ở `templates\Temp_RoomFacility_rpt.xlsm` (cạnh `zca-scrape-message\`). Nó phải có sheet `data` (20 cột ở hàng 1), sheet ẩn `filter`, 5 sheet báo cáo và macro `Workbook_Open`.

Nếu file được tải từ Internet, Windows có thể chặn nó. Bỏ chặn một lần:

```powershell
Unblock-File ..\templates\Temp_RoomFacility_rpt.xlsm
```

Thử điền file bằng dữ liệu đã cào (không cần agent):

```powershell
npm run extract:reports -- --day 2026-09-24 --buoi sang
npm run fill:report -- output/output.json
```

Kết quả đúng: log có `macro OK: ThisWorkbook.Workbook_Open`, mỗi trong 5 bảng có số dòng lớn hơn 0, và file `data\export\baocaobuoisang_240926.xlsm` được tạo. Mở file ra kiểm tra bằng mắt lần đầu.

Khi `bot:runner` dựng file, nó ghi qua một file tạm rồi đổi tên đè lên file chính (chỉ còn một file). Nếu bạn đang mở file chính trong Excel thì bản mới lưu thành `..._moi.xlsm` và bản cũ giữ nguyên; đóng file gốc là vòng sau tự đè và xóa `_moi`.

## 5. Chạy thử từng bước bằng tay

Nên chạy đủ một lượt bằng tay trước khi để các bot chạy nền.

1. Mở Zalo Desktop, đăng nhập.
2. Terminal 1: `npm run bot:watch` (để nguyên). Nó tắt và mở lại Zalo Desktop, rồi in `listening for new messages`.
3. Nhờ một tài khoản khác gửi tin vào một nhóm trong `config.targets`. Terminal 1 in `[watch] queued "<tên nhóm>"`; file `data\.scrape-events-<ngày>.jsonl` có thêm một dòng chứa tên nhóm đó (xem nhanh hàng chờ bằng `npm run runner:status`).
4. Terminal 2: `npm run bot:scrape`. Kết quả đúng: nhóm được cào, `data\<groupId>.json` có tin mới, hàng chờ rỗng (`runner:status`). (Khi `bot:runner` đang chạy thì nó làm bước này và các bước 5 đến 8 giúp bạn: xem mục 8.1b.)
5. `npm run sync:db` (chạy thử), rồi `npm run sync:db -- --apply` khi thấy số liệu hợp lý.
6. `npm run extract:reports -- --buoi <buổi hiện tại>`, xem `output\review.json`.
7. `npm run fill:report -- output/output.json`.
8. `npm run mark:messages -- output/marks.json --dry-run`, rồi chạy thật khi đồng ý.
9. `npm run watch:status`: phải báo `ĐANG CHẠY` với cả hai nguồn `active`.

## 6. Cài skill cho agent

OpenClaw chỉ nạp skill nằm trong `skills\` của workspace. Skill của quy trình này được viết ở `zca-scrape-message\Teach-lesson-skills-V2\SKILL.md`, nên phải đưa nó vào `skills\`:

```powershell
# từ thư mục workspace
New-Item -ItemType Directory -Force skills\teach-lesson-skills-v2
Copy-Item zca-scrape-message\Teach-lesson-skills-V2\SKILL.md skills\teach-lesson-skills-v2\SKILL.md
openclaw skills info teach-lesson-skills-v2
openclaw skills check
```

Tên thư mục đặt chữ thường cho khớp trường `name` trong file (`teach-lesson-skills-v2`). Mỗi lần sửa `SKILL.md` ở `zca-scrape-message\Teach-lesson-skills-V2\`, chép lại sang `skills\`.

**Tránh hai skill cùng kích hoạt.** Skill cũ `teacher-lesson-report-extraction` có cùng câu kích hoạt ("trích xuất thông tin báo cáo buổi dạy") và gọi API cũ. Hãy chỉ để một skill: gỡ hoặc đổi tên thư mục `skills\teacher-lesson-report-extraction\` trước khi chạy tự động. Kiểm tra bằng `openclaw skills list`. (Lưu ý: file `SKILL.md` của skill cũ trong git đang chứa bản nháp spec thay vì nội dung gốc; nội dung gốc còn trong lịch sử git.)

## 7. Cho phép agent chạy lệnh

Agent phải chạy các lệnh `npm run ...`. OpenClaw có cơ chế phê duyệt thực thi; nếu chưa cho phép, agent sẽ dừng chờ phê duyệt và lịch chạy tự động sẽ không xong. Xem trạng thái và thêm lệnh vào danh sách cho phép:

```powershell
openclaw approvals get
openclaw approvals allowlist add "C:\Program Files\nodejs\npm.cmd"
```

Đường dẫn trên là ví dụ; dùng `where.exe npm` để lấy đường dẫn thật trên máy bạn, rồi kiểm tra lại bằng `openclaw approvals get`. Nếu cách khớp mẫu của phiên bản OpenClaw bạn dùng khác, xem `openclaw approvals allowlist --help`.

Cần biết các lệnh có **ghi vào DB**: `npm run sync:db -- --apply` (thêm dòng vào `Zalo_CrawlMessage`) và `npm run mark:messages` (cập nhật `StatusId`, `HasRead`). Khi `bot:runner` chạy, chính runner chạy chúng sau mỗi vòng cào; agent chỉ chạy `runner:status`, `runner:once` và đọc file. Chỉ bật runner khi bạn đã kiểm tra thủ công (mục 5) và tin vào kết quả.

## 8. Chạy tự động

Bốn thành phần ở phần Tổng quan chạy độc lập. Thứ tự bật khuyến nghị: `bot:watch` trước (nó tắt và mở lại Zalo), rồi `bot:runner`, rồi `bot:chat` (nếu dùng), cuối cùng là lịch của agent. Runner tự đợi khoảng 90 giây sau khi watch khởi động (`runner.watchWarmupSeconds`) mới làm gì.

Xem tình trạng bất cứ lúc nào:

| Lệnh | Cho biết |
|---|---|
| `npm run watch:status` | `bot:watch` đang chạy, đã dừng hay có vẻ đã chết; hai nguồn phát hiện; các khoảng gián đoạn 24 giờ qua |
| `npm run runner:status` | Runner sống hay chết, vòng gần nhất (thời gian từng bước, từng nhóm), hàng chờ, các buổi có báo cáo chưa dựng |
| `npm run runner:timing -- --last 50` | Thống kê thời gian: mỗi vòng mất bao lâu, mỗi nhóm cào mất bao lâu (trung bình, p95, lâu nhất), ước tính cào 100 nhóm. Cho ra số thật để biết hệ thống chịu được bao nhiêu nhóm |
| `npm run chat:status` | Bot chat sống hay chết, gửi thật hay dry-run, nhóm nào, số tin chờ |
| `npm run config:show` | Toàn bộ cấu hình đang dùng |

Mã thoát `2` của `runner:status` và `chat:status` nghĩa là tiến trình không sống (chết, đã dừng, ở trạng thái `LỖI` hoặc chưa từng chạy) và cần người khởi động lại. `watch:status` không kèm `--buoi` luôn thoát mã 0; kèm `--buoi`, mã `2` nghĩa là có khoảng gián đoạn của watch chồng lên buổi đó (mục 8.5).

### 8.1. `bot:watch` luôn chạy nền

`bot:watch` là một tiến trình Node bình thường: đóng cửa sổ là nó tắt, và không tự chạy lại khi lỗi. Để nó tự khởi động cùng phiên đăng nhập, tạo tác vụ Windows (chạy trong `cmd`):

```
schtasks /Create /TN "Zalo Watch" /SC ONLOGON /TR "cmd /c cd /d C:\Users\Admin\.openclaw\THDD_OpenClaw\openclaw\workspace\zca-scrape-message && npm run bot:watch >> data\watch.log 2>&1" /F
```

Sửa đường dẫn theo máy của bạn. Xem log ở `data\watch.log`. Nếu `bot:watch` mất kết nối với cửa sổ thông báo của Zalo, nó tự thoát (log ghi `lost connection`): cần chạy lại tác vụ.

Khi `bot:watch` khởi động, nó tắt và mở lại Zalo Desktop. Đừng khởi động nó lúc đang dùng Zalo.

**Cách dừng `bot:watch`:** nhấn Ctrl+C trong cửa sổ đang chạy nó, hoặc `Stop-Process -Id <PID của tiến trình node>`. **Không** dừng cả cây tiến trình (ví dụ `taskkill /T`): Zalo Desktop là tiến trình con của nó và sẽ bị đóng theo.

### 8.1b. `bot:runner` luôn chạy nền

`bot:runner` cũng là một tiến trình Node bình thường; chạy nó cạnh `bot:watch` để hàng chờ được xử lý tự động (cào, đồng bộ DB, trích xuất, ghi đè Excel). Tạo tác vụ khởi động cùng phiên đăng nhập:

```
schtasks /Create /TN "Zalo Runner" /SC ONLOGON /TR "cmd /c cd /d C:\Users\Admin\.openclaw\THDD_OpenClaw\openclaw\workspace\zca-scrape-message && npm run bot:runner >> data\runner.log 2>&1" /F
```

Sửa đường dẫn theo máy của bạn. Cách khác là PM2 chạy như dịch vụ Windows (tự khởi động lại khi tiến trình chết); mã không phụ thuộc vào cách bạn giữ tiến trình sống. Kiểm tra bằng `npm run runner:status`.

**Runner hoạt động thế nào:**

- Hàng chờ có nhóm thì runner đợi hàng chờ **yên lặng** (`runner.quietSeconds`, mặc định 2 phút, tính từ tin mới nhất của nhóm) rồi mới chạy một vòng; nhóm nhắn liên tục thì tối đa `runner.maxWaitSeconds` (mặc định 10 phút) kể từ nhóm đầu tiên. Trạng thái `waiting` trong `runner:status` là bình thường.
- Một vòng: khôi phục (chỉ khi `bot:watch` có khoảng gián đoạn **chưa khôi phục**), cào các nhóm trong hàng chờ, đồng bộ DB, rồi với mỗi buổi có báo cáo đầu/cuối buổi mới thì trích xuất, ghi đè Excel và đánh dấu tin. Báo cáo đã nằm trên đĩa mà chưa dựng (do crash hoặc cào tay) được nhận ra và dựng ở lần kiểm tra kế tiếp.
- Runner không khởi động lại `bot:watch`. Việc cào điều khiển giao diện Zalo Desktop (như `bot:scrape`, và mở lại Zalo nếu cổng debug đóng) nên có thể làm gián đoạn người đang gõ; thời gian yên lặng chỉ giảm tần suất.
- Sau 3 vòng lỗi liên tiếp runner ngừng tự thử (`runner:status` báo `LỖI`, hàng chờ vẫn nguyên): xem `output\runner-log.jsonl`, sửa nguyên nhân rồi khởi động lại tay. Lỗi dựng của riêng một buổi không làm runner ngừng; buổi đó được báo (`lỗi dựng`) và thử lại sau 5 phút.
- Khi runner chạy, lịch của agent chỉ còn là **giám sát** (mục 8.3, 9).

**Dựng lại một buổi không cào** (sau khi sửa `output\overrides.json`): `npm run runner:once -- --day <ngày> --buoi <buổi>`. Lệnh này từ chối nếu đang có vòng của runner hoặc lần cào tay chạy (dùng chung `output\`); thử lại sau vài phút.

### 8.1c. `bot:chat` trả lời tự động

`bot:chat` trả lời tin trong các nhóm liệt kê ở `chat-rules.json` theo tình huống bạn viết sẵn (ví dụ báo cáo có máy lỗi thì trả lời "đã nhận thông tin có máy lỗi"). Thứ tự bật:

1. **Khởi động lại `bot:watch`** để nạp mã chia tin vào hộp thư chat (việc này tắt và mở lại Zalo Desktop, làm lúc không dùng Zalo). Không khởi động lại thì `bot:chat` không nhận được tin nào.
2. Sửa `chat-rules.json` (mẫu: `docs\superpowers\specs\2026-09-25-bot-chat-rules.sample.json`). Nên đặt `"dryRun": true` trước để xem log "sẽ trả lời gì" mà chưa gửi thật; nhóm `bot test` là nơi thử gửi thật đầu tiên. Tên nhóm phải có trong `config.targets`.
3. `npm run bot:chat` (cửa sổ riêng), rồi `npm run chat:status` để xem trạng thái.
4. Giữ chạy nền bằng tác vụ Windows tương tự runner: `schtasks /Create /TN "Zalo Chat" /SC ONLOGON /TR "cmd /c cd /d <đường dẫn>\zca-scrape-message && npm run bot:chat >> data\chat.log 2>&1" /F`.

Cách viết một tình huống: `when` gồm `loaiBaoCao` (`DauBuoi`/`CuoiBuoi`), `mayLoi: true` (số máy lỗi lớn hơn 0 hoặc có ghi chú như "IT bảo trì"; số 0 thì không khớp) và `keywords` (không phân biệt dấu và hoa thường); các tình huống được xét theo thứ tự và tình huống đầu tiên khớp thì trả lời. `reply` có thể chèn `{senderName}`. Tin không khớp tình huống nào thì bị bỏ qua và **không có dòng log nào** cho nó. Gõ sai chính tả thật sự (không chỉ thiếu dấu hoặc sai chữ hoa) thì không khớp; muốn bắt cụm hay gõ sai thì thêm cụm đó vào `keywords`.

- **Dừng khẩn cấp:** tạo tệp `data\.chat-off` (bot vẫn đọc hộp thư nhưng không gửi gì); xóa tệp để gửi lại.
- **Nhóm chỉ chat, không cào:** thêm `"scrape": false` vào nhóm trong `chat-rules.json` (ví dụ `"bot test": { "scrape": false, "rules": [...] }`). Tin của nhóm vẫn vào hộp thư chat để bot trả lời, nhưng nhóm không vào hàng chờ cào và runner không khôi phục nó. Khởi động lại `bot:watch`, `bot:runner` và `bot:chat` sau khi đổi.
- Bot không trả lời tin quá `maxReplyDelaySeconds`, không lặp lại cùng một tình huống trong `cooldownSecondsPerRule`, và không gửi quá `maxRepliesPerMinute` tin mỗi phút. Ô soạn tin đang có chữ dở (bạn đang gõ) thì bot hoãn (nghỉ `chat.skipBackoffSeconds` rồi thử lại), không gõ đè.
- Sau khi trả lời, bot **ở lại nhóm vừa gửi** (ví dụ `bot test`) theo mặc định. Đặt `chat.restorePreviousConversation: true` trong `config.ts` (rồi khởi động lại `bot:chat`) nếu muốn nó quay về cuộc trò chuyện Zalo Desktop đang mở trước đó (ví dụ nhóm mà runner vừa cào xong).
- Tài khoản dùng cho bot nên dành riêng: việc tự động gửi tin có thể bị Zalo coi là bất thường, và mỗi lần gửi bot chuyển cuộc trò chuyện đang mở.

### 8.1d. Thêm một nhóm mới

`bot:watch` nhận biết nhóm qua mã nhóm (`groupId`) mà nó học từ dữ liệu đã cào, nên nhóm mới cần được cào ít nhất một lần.

1. Thêm tên nhóm **đúng như thanh bên Zalo** vào `targets` trong `config.ts`.
2. Khởi động lại `bot:watch`, `bot:runner` và `bot:chat` (cả ba đọc `targets` lúc khởi động).
3. Xếp nhóm vào hàng chờ cào ngay, không phải chờ ai đó nhắn: `npm run scrape:add -- "Tên nhóm"`. Tên gõ không cần đúng hoàn toàn (sai chữ hoa, thiếu dấu vẫn được nếu không nhập nhằng); tên không có trong `targets` bị từ chối và gợi ý tên gần đúng. `bot:runner` cào nó sau thời gian yên lặng, hoặc chạy `npm run bot:scrape`.
4. Khi `data\` đã có file của nhóm, khởi động lại `bot:watch` một lần nữa để nó nạp mã nhóm.
5. Nếu nhóm cần bot chat trả lời: thêm nhóm vào `chat-rules.json` (đặt `"scrape": false` nếu không muốn cào nữa) rồi khởi động lại `bot:watch`, `bot:runner`, `bot:chat`.

### 8.2. Gateway OpenClaw

Lịch chạy của agent do gateway OpenClaw quản lý. Cấu hình hiện tại chạy gateway cục bộ ở cổng 18789 (tác vụ Windows `OpenClaw Gateway`, script `~\.openclaw\gateway.cmd`). Kiểm tra gateway đang chạy:

```powershell
openclaw cron status
```

Nếu báo `gateway closed` thì gateway chưa chạy: khởi động tác vụ `OpenClaw Gateway`, hoặc chạy `openclaw doctor` để chẩn đoán.

### 8.3. Lịch cho agent (`openclaw cron`)

Khi `bot:runner` chạy, agent không cào hay đồng bộ nữa mà **giám sát**: kiểm tra runner còn sống, xem các mục cần xem (`output\review_<ngày>_<buổi>.json`), ghi `overrides.json` khi cần rồi dựng lại bằng `runner:once`, kiểm tra file Excel và báo kết quả (mục 9). Mỗi buổi một công việc, chạy **sau khi buổi kết thúc** và truyền rõ buổi trong câu lệnh. Ví dụ buổi sáng chạy lúc 12:05 và buổi chiều lúc 18:05, các ngày thứ Hai đến thứ Bảy (đổi giờ và ngày theo lịch dạy của bạn; nếu bạn đổi `sessions` trong `config.ts` thì đổi giờ chạy theo):

```powershell
openclaw cron add --name "bao-cao-buoi-sang" `
  --description "Trích xuất và xuất báo cáo buổi dạy buổi sáng" `
  --cron "5 12 * * 1-6" --tz Asia/Ho_Chi_Minh --exact `
  --agent main --session isolated `
  --message "Trích xuất thông tin báo cáo buổi dạy buổi sáng hôm nay" `
  --tools exec,read,write --timeout-seconds 1800

openclaw cron add --name "bao-cao-buoi-chieu" `
  --description "Trích xuất và xuất báo cáo buổi dạy buổi chiều" `
  --cron "5 18 * * 1-6" --tz Asia/Ho_Chi_Minh --exact `
  --agent main --session isolated `
  --message "Trích xuất thông tin báo cáo buổi dạy buổi chiều hôm nay" `
  --tools exec,read,write --timeout-seconds 1800
```

Các tham số trên theo `openclaw cron add --help` của phiên bản 2026.5.20. Ý nghĩa: `--cron` và `--tz` đặt giờ theo múi giờ Việt Nam; `--exact` tắt độ trễ ngẫu nhiên; `--session isolated` cho mỗi lần chạy một phiên riêng; `--tools` giới hạn công cụ agent được dùng; `--timeout-seconds` đủ dài phòng khi phải dựng lại Excel. Thêm `--announce` (kèm `--channel`, `--to`) nếu muốn gửi kết quả (`xong` hoặc lỗi) vào một cuộc chat.

Câu lệnh phải chứa câu kích hoạt ("trích xuất thông tin báo cáo buổi dạy") và tên buổi để agent truyền đúng `--buoi`.

Quản lý và thử:

```powershell
openclaw cron list                     # xem các công việc
openclaw cron run <id>                 # chạy ngay một lần để thử
openclaw cron runs                     # lịch sử các lần chạy
openclaw cron disable <id>             # tạm dừng
openclaw cron rm <id>                  # xóa
```

Lần đầu nên chạy bằng `openclaw cron run` và xem kết quả trước khi để chạy theo lịch.

### 8.4. Chạy một lần theo yêu cầu

Không cần lịch: nhờ agent trong cuộc chat "Trích xuất thông tin báo cáo buổi dạy buổi sáng hôm nay", hoặc từ terminal:

```powershell
openclaw agent --agent main --message "Trích xuất thông tin báo cáo buổi dạy buổi sáng hôm nay" --timeout 1800
```

Muốn xử lý ngày khác, nói rõ ngày ("...buổi sáng ngày 24/09/2026"); agent truyền `--day`.

### 8.5. Phát hiện `bot:watch` chết và khôi phục tin bị lỡ

`bot:watch` ghi nhịp tim mỗi 30 giây (`watch.heartbeatSeconds`) vào `data\.watch-state.json` (kèm trạng thái hai nguồn phát hiện) và ghi các khoảng nó không lắng nghe vào `data\.watch-gaps.json`.

- Xem tình trạng bất cứ lúc nào: `npm run watch:status`.
- **Khi `bot:runner` chạy, khôi phục là tự động:** mỗi khoảng gián đoạn của watch chồng lên buổi hiện tại được khôi phục hai lần (lúc nó còn mở và lúc nó đóng), chỉ cào lại các nhóm còn thiếu báo cáo, và mỗi khoảng chỉ một lần (không lặp lại ở các vòng sau). Khôi phục tay: `npm run recover:missing -- --day <ngày> --buoi <buổi>` (thêm `--dry-run` để xem trước); lệnh này xét mọi khoảng gián đoạn của buổi.
- **Khôi phục không cào nhóm `bot test` và các nhóm `"scrape": false`**, và không cào nhóm trong `recoveryIgnoreTargets`.
- Khi runner **không** chạy, agent quyết định tự động bằng mã thoát của `npm run watch:status -- --day <ngày> --buoi <buổi>`: mã `0` là `bot:watch` lắng nghe suốt buổi (bỏ qua khôi phục); mã `2` là nó chết, dừng hoặc mù trong buổi, và agent **bắt buộc** chạy `recover:missing`. Nếu `bot:watch` đang không hoạt động, agent báo cần khởi động lại nhưng không tự khởi động (để không làm gián đoạn Zalo Desktop).
- Khởi động lại `bot:watch` sau khi nó chết: lần khởi động đó tự ghi lại khoảng gián đoạn và cảnh báo. Nếu đã có một `bot:watch` khác đang chạy thì bản mới từ chối chạy, để hai bản không cùng khởi động lại Zalo Desktop.

## 9. Agent làm gì mỗi lần chạy

Agent làm theo skill (`SKILL.md`), có hai chế độ:

**Khi `bot:runner` đang chạy (chế độ giám sát, bình thường):** chạy `npm run runner:status` (mã thoát `0` là runner sống); đọc `output\runner-log.jsonl` của buổi được yêu cầu (lỗi và cảnh báo được nêu trong báo cáo cuối); đọc `output\review_<ngày>_<buổi>.json` và sửa bằng `output\overrides.json` khi cần, rồi chạy `runner:once -- --day <ngày> --buoi <buổi>` để dựng lại; kiểm tra file Excel có mặt và không còn `_moi.xlsm`; báo `xong` hoặc lỗi chi tiết. Agent **không** chạy `bot:scrape`, `sync:db`, `mark:messages` hay khôi phục riêng lẻ và **không tự khởi động lại** runner.

**Khi runner không chạy (`runner:status` thoát mã 2):** agent báo "bot:runner đang không hoạt động, cần khởi động lại" và, nếu được yêu cầu chạy, dùng luồng chạy tay: `watch:status -- --day --buoi`; `bot:scrape` (hàng chờ rỗng không làm dừng: dữ liệu có thể đã được cào trước đó); `recover:missing` nếu `watch:status` trả mã 2; `sync:db -- --apply`; `extract:reports -- --buoi <buổi>`; đọc `output\review.json` và sửa bằng `overrides.json` rồi chạy lại `extract:reports`; `fill:report`; `mark:messages`.

Kết quả nằm ở `data\export\baocaobuoi<buoi>_<ddMMyy>.xlsm`. Mô tả đầy đủ trong [QUY-TRINH.md](QUY-TRINH.md).

## 10. Danh sách kiểm tra trước khi bật tự động

- [ ] `npm test` và `npm run typecheck` đạt.
- [ ] `npx tsx src/cli/debug/db-check.ts` kết nối được DB.
- [ ] `npm run config:show` cho thấy các giá trị bạn chủ ý (khóa khác mặc định có dấu `*`); `targets` đúng tên nhóm thật.
- [ ] Một lượt chạy tay (mục 5) cho ra file Excel đúng.
- [ ] Skill V2 đã có trong `skills\` và skill cũ cùng câu kích hoạt đã gỡ.
- [ ] Agent được phép chạy `npm` (mục 7) và bạn chấp nhận việc runner ghi vào DB.
- [ ] `bot:watch` và `bot:runner` chạy nền; gateway OpenClaw đang chạy (`openclaw cron status`).
- [ ] `npm run watch:status` báo `ĐANG CHẠY` với hai nguồn `active`; `npm run runner:status` báo `ĐANG CHẠY`.
- [ ] Nếu dùng bot chat: `chat-rules.json` hợp lệ, đã thử với `"dryRun": true` rồi gửi thật ở nhóm `bot test`, `npm run chat:status` báo `ĐANG CHẠY`.
- [ ] Máy đã đăng nhập, Excel và Zalo Desktop mở được trong phiên đó.
- [ ] Một lần `openclaw cron run <id>` chạy xong và cho kết quả đúng.

## 11. Xử lý sự cố nhanh

| Hiện tượng | Nguyên nhân thường gặp | Việc cần làm |
|---|---|---|
| Hàng chờ có nhóm nhưng runner chưa cào | Runner đang `waiting`: chờ hàng chờ yên lặng `runner.quietSeconds` (tối đa `runner.maxWaitSeconds`) | Chờ; chỉ là lỗi nếu `runner:status` báo `LỖI` hoặc `CÓ VẺ ĐÃ CHẾT`, hoặc nhóm nằm hàng chờ quá `maxWaitSeconds` |
| `runner:status` báo `LỖI` | 3 vòng lỗi liên tiếp (Zalo không kết nối, DB không kết nối...) | Xem `output\runner-log.jsonl`, sửa nguyên nhân, khởi động lại `bot:runner` |
| `runner:status` báo có buổi "chưa dựng xong" kèm `lỗi dựng` | Dựng một buổi lỗi (Excel/COM, mẫu bị chặn...) | Sửa nguyên nhân; runner thử lại sau 5 phút, hoặc `runner:once` |
| `watch:status` báo `CÓ VẺ ĐÃ CHẾT` hoặc `ĐÃ DỪNG` | Tiến trình `bot:watch` đã thoát (máy ngủ, lỗi, đóng cửa sổ) | Khởi động lại `bot:watch` (mở lại Zalo); runner tự khôi phục khoảng gián đoạn |
| Log watch có `fatal error ... EPERM ... rename ... .watch-state.json.tmp` | Windows không cho đổi tên đè lên file đang bị tiến trình khác đọc. Đã sửa: bản hiện tại thử lại và không còn thoát vì lỗi này | Cập nhật mã, khởi động lại `bot:watch` |
| Runner cào lại các nhóm không nằm trong hàng chờ | Bản cũ quét lại mọi nhóm thiếu báo cáo ở mỗi vòng. Đã sửa: chỉ khôi phục các khoảng gián đoạn chưa khôi phục | Cập nhật mã, khởi động lại `bot:runner` |
| Bot chat không trả lời | Nhiều nguyên nhân | Kiểm tra theo thứ tự: `chat:status` sống? `bot:watch` đã khởi động lại sau khi bật chat? Nhóm có trong `chat-rules.json` và `config.targets`? Nhóm đã được cào ít nhất một lần? Có tệp `data\.chat-off` không? `dryRun` đang `true`? Tin có khớp tình huống (tin không khớp không có log)? Ô soạn tin có chữ dở không? |
| Bot khởi động báo `config.ts không hợp lệ` | Một giá trị trong `config.ts` sai | Đọc tên khóa trong thông báo, sửa, `npm run config:show` để kiểm |
| `scrape:add` báo không có nhóm trong `config.targets` | Tên nhóm gõ sai hoặc nhóm chưa thêm vào `config.ts` | Dùng tên gợi ý, hoặc thêm nhóm vào `targets` rồi khởi động lại bot (mục 8.1d) |
| File Excel của buổi có thêm `..._moi.xlsm` | Tệp gốc đang mở trong Excel nên không ghi đè được | Đóng tệp gốc; vòng sau tự đè và xóa `_moi` |
