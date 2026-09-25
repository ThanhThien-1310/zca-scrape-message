# Hướng dẫn cài đặt và chạy tự động với agent

Tài liệu này hướng dẫn dựng quy trình báo cáo buổi dạy trên một máy Windows và cho agent OpenClaw chạy nó theo lịch. Chi tiết từng bước của quy trình, các file sinh ra và cách xử lý sự cố nằm ở [QUY-TRINH.md](QUY-TRINH.md).

Các đường dẫn bên dưới tính từ thư mục workspace của OpenClaw (`~\.openclaw\THDD_OpenClaw\openclaw\workspace`); thư mục dự án là `zca-scrape-message\`.

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
npx tsx dbCheck.ts
```

Kết quả đúng: in `connected: <tên DB> as <tài khoản>` và danh sách cột của `Zalo_CrawlMessage`.

### 2.2. Các nhóm cần theo dõi (`config.ts`)

Trong `config.ts`, sửa `targets` thành **đúng tên hiển thị** của các nhóm trong thanh bên Zalo Desktop, ví dụ:

```ts
targets: ["LC_ChuVănAn_BTAN", "LC_HoaSen1_TĐ", "LC_TríTuệViệt_BTAN"] as string[],
```

Xóa các nhóm thử nghiệm (ví dụ `bot test`) khi chạy thật, hoặc để chúng trong `recoveryIgnoreTargets` (cùng file `config.ts`): các nhóm đó không bao giờ bị coi là "thiếu báo cáo" và không bị cào lại khi khôi phục. Hai thiết lập khác cần biết:

- `sinceTs` (mặc định 06:00 hôm nay): `bot:scrape` chỉ lấy tin từ mốc này trở đi. Nếu cần cào tin của ngày cũ thì đổi mốc này.
- `targetMessageCount` (mặc định 2000): số tin tối đa mỗi nhóm mỗi lần cào.

### 2.3. Kiểm tra mã

```powershell
npm test
npm run typecheck
```

Cả hai phải đạt.

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

## 5. Chạy thử từng bước bằng tay

Nên chạy đủ một lượt bằng tay trước khi giao cho agent.

1. Mở Zalo Desktop, đăng nhập.
2. Terminal 1: `npm run bot:watch` (để nguyên). Nó tắt và mở lại Zalo Desktop, rồi in `listening for new messages`.
3. Nhờ một tài khoản khác gửi tin vào một nhóm trong `config.targets`. Terminal 1 in `[watch] queued "<tên nhóm>"`; file `data\.scrape-queue.json` chứa tên nhóm đó.
4. Terminal 2: `npm run bot:scrape`. Kết quả đúng: nhóm được cào, `data\<groupId>.json` có tin mới, hàng chờ về `[]`.
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

Cần biết các lệnh agent sẽ chạy **có ghi vào DB**: `npm run sync:db -- --apply` (thêm dòng vào `Zalo_CrawlMessage`) và `npm run mark:messages` (cập nhật `StatusId`, `HasRead`). Chỉ cho phép khi bạn đã kiểm tra thủ công (mục 5) và tin vào kết quả.

## 8. Chạy tự động

Có hai phần chạy độc lập: `bot:watch` (luôn chạy nền) và agent (chạy theo lịch).

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

Sửa đường dẫn theo máy của bạn. Cách khác là PM2 chạy như dịch vụ Windows (tự khởi động lại khi tiến trình chết); mã không phụ thuộc vào cách bạn giữ tiến trình sống. Kiểm tra bằng `npm run watch:status` và `npm run runner:status` (mã thoát 2 nghĩa là tiến trình không sống, cần người khởi động lại).

- Runner **không** khởi động lại Zalo Desktop hay `bot:watch`. Việc cào điều khiển giao diện Zalo Desktop nên có thể làm gián đoạn người đang gõ; debounce 2 phút chỉ giảm tần suất.
- Sau 3 vòng lỗi liên tiếp runner ngừng tự thử (`runner:status` báo `LỖI`, hàng chờ vẫn nguyên): xem `output/runner-log.jsonl`, sửa nguyên nhân rồi khởi động lại tay.
- Khi runner chạy, lịch của agent chỉ còn là **giám sát**: nó đọc `runner:status`, xử lý `output/review.json` và chạy `runner:once` để dựng lại sau khi sửa; nó không cào hay đồng bộ nữa.

### 8.2. Gateway OpenClaw

Lịch chạy của agent do gateway OpenClaw quản lý. Cấu hình hiện tại chạy gateway cục bộ ở cổng 18789 (tác vụ Windows `OpenClaw Gateway`, script `~\.openclaw\gateway.cmd`). Kiểm tra gateway đang chạy:

```powershell
openclaw cron status
```

Nếu báo `gateway closed` thì gateway chưa chạy: khởi động tác vụ `OpenClaw Gateway`, hoặc chạy `openclaw doctor` để chẩn đoán.

### 8.3. Lịch cho agent (`openclaw cron`)

Mỗi buổi một công việc, chạy **sau khi buổi kết thúc** và truyền rõ buổi trong câu lệnh. Ví dụ buổi sáng chạy lúc 12:05 và buổi chiều lúc 18:05, các ngày thứ Hai đến thứ Bảy (đổi giờ và ngày theo lịch dạy của bạn):

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

Các tham số trên theo `openclaw cron add --help` của phiên bản 2026.5.20. Ý nghĩa: `--cron` và `--tz` đặt giờ theo múi giờ Việt Nam; `--exact` tắt độ trễ ngẫu nhiên; `--session isolated` cho mỗi lần chạy một phiên riêng; `--tools` giới hạn công cụ agent được dùng; `--timeout-seconds` đủ dài vì bước cào và điền Excel mất vài phút. Thêm `--announce` (kèm `--channel`, `--to`) nếu muốn gửi kết quả (`xong` hoặc lỗi) vào một cuộc chat.

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

`bot:watch` ghi nhịp tim mỗi 30 giây vào `data\.watch-state.json` (kèm trạng thái hai nguồn phát hiện) và ghi các khoảng nó không lắng nghe vào `data\.watch-gaps.json`.

- Xem tình trạng bất cứ lúc nào: `npm run watch:status`. Kết quả cho biết đang chạy, đã dừng, có vẻ đã chết (kèm giờ nhịp tim cuối) hoặc đang chạy nhưng mù (cả hai nguồn mất), cùng các khoảng gián đoạn 24 giờ qua.
- Khôi phục tin bị lỡ: `npm run recover:missing -- --day <ngày> --buoi <buổi>`. Lệnh chỉ làm việc khi khoảng gián đoạn chồng lên buổi đó, chỉ cào lại các nhóm còn thiếu báo cáo, rồi in ra những tin đã bị lỡ. Thêm `--dry-run` để xem trước.
- Agent quyết định tự động, không cần đặt thêm lịch: mỗi lần chạy, bước 0 của skill chạy `npm run watch:status -- --day <ngày> --buoi <buổi>` và đọc mã thoát. Mã `0` nghĩa là `bot:watch` lắng nghe suốt buổi (bỏ qua khôi phục); mã `2` nghĩa là log ghi nhận nó chết, dừng hoặc mù trong buổi, và agent **bắt buộc** chạy `recover:missing`. Nếu `bot:watch` đang không hoạt động, agent báo cần khởi động lại nhưng không tự khởi động (để không làm gián đoạn Zalo Desktop).
- Khởi động lại `bot:watch` sau khi nó chết: lần khởi động đó tự ghi lại khoảng gián đoạn và cảnh báo. Nếu đã có một `bot:watch` khác đang chạy thì bản mới từ chối chạy, để hai bản không cùng khởi động lại Zalo Desktop.

## 9. Agent làm gì mỗi lần chạy

Agent làm theo skill (`SKILL.md`): chạy `watch:status -- --day --buoi` để đọc log nhịp tim; chạy `bot:scrape` (hàng chờ rỗng không làm dừng: dữ liệu có thể đã được cào trước đó); nếu `watch:status` trả mã 2 thì chạy `recover:missing`; rồi chạy `sync:db -- --apply`, `extract:reports -- --buoi <buổi>`, đọc `output\review.json` và sửa bằng `output\overrides.json` khi cần rồi chạy lại `extract:reports`, chạy `fill:report`, `mark:messages`, và trả `xong` hoặc lỗi chi tiết. Kết quả nằm ở `data\export\baocaobuoi<buoi>_<ddMMyy>.xlsm`. Mô tả đầy đủ trong [QUY-TRINH.md](QUY-TRINH.md).

## 10. Danh sách kiểm tra trước khi bật tự động

- [ ] `npm test` và `npm run typecheck` đạt.
- [ ] `npx tsx dbCheck.ts` kết nối được DB.
- [ ] `config.targets` đúng tên nhóm thật, đã bỏ nhóm thử.
- [ ] Một lượt chạy tay (mục 5) cho ra file Excel đúng.
- [ ] Skill V2 đã có trong `skills\` và skill cũ cùng câu kích hoạt đã gỡ.
- [ ] Agent được phép chạy `npm` (mục 7) và bạn chấp nhận việc agent ghi vào DB.
- [ ] `bot:watch` chạy nền và gateway OpenClaw đang chạy (`openclaw cron status`).
- [ ] `npm run watch:status` báo `ĐANG CHẠY` và cả hai nguồn `active`.
- [ ] Máy đã đăng nhập, Excel và Zalo Desktop mở được trong phiên đó.
- [ ] Một lần `openclaw cron run <id>` chạy xong và cho kết quả đúng.
