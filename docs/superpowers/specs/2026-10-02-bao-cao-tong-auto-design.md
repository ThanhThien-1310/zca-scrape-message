# Báo cáo tổng tự động (9:00 và 15:00) và in tự động — Thiết kế

**Trạng thái:** phần B (báo cáo tổng) đã chốt qua trao đổi trực tiếp (2026-10-02 và 2026-10-03): **bot riêng** `bot:total`, chạy **song song** runner, trong phiên đăng nhập của người dùng. Dự án A (bộ mẫu mới 7 file, bỏ SỐ LẦN) đã cài đặt, xem `2026-10-03-bo-mau-moi-7-file-design.md`; B dùng lại phần dựng file của A. Phần C (in tự động) là **nghiên cứu**, làm sau B. Kế hoạch thực hiện B: `docs/superpowers/plans/2026-10-03-bao-cao-tong-auto.md`.

**Quy ước đặt tên:** identifier MỚI bằng tiếng Anh (xem spec giai đoạn 4 buổi).

## Mục tiêu

Mỗi ngày xuất thêm hai đợt "báo cáo tổng" bên cạnh 4 giai đoạn hiện có:

| Đợt | Giờ chạy | Dữ liệu lấy |
|---|---|---|
| Sáng (`morning`) | 9:00 | tin gửi từ **6:30** đến **9:00** |
| Chiều (`afternoon`) | 15:00 | tin gửi từ **6:30** đến **15:00** (cộng dồn cả sáng) |

Mỗi đợt xuất **đúng 7 file** theo bộ mẫu mới: LOA, MÁY TÍNH, NETSUPPORT, INTERNET, ĐIỆN (tạm rỗng), VỆ SINH, NỘI QUY. Cùng thư mục `data/export/trang-thai/<yyMM>/<yyMMdd>/` của 4 giai đoạn, tên file như hiện nay và thêm `-auto` trước `.xlsx`:

```
<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>-auto.xlsx      HHmm = giờ xuất THỰC TẾ
```

Sau khi xuất xong, đợt đầu tiên của mỗi slot sẽ tự in (phần C, mục "Giai đoạn 2").

## Ngoài phạm vi

- Không đổi cách chia 4 giai đoạn (`classifyPhase`, mốc 9:00 / 12:30 / 15:00 / 17:30), tên file, tracker hay thư mục của chúng.
- Không cào Zalo, không đồng bộ DB, không đánh dấu tin trong DB (đó là việc của `bot:runner`).
- Không in (làm ở phần C).

## Quy tắc dữ liệu

- **Khung giờ** theo **giờ gửi thật** của tin (giờ Việt Nam), nửa mở: `6:30 ≤ giờ < mốc`. Tin lúc 9:00:00 thuộc đợt chiều, không thuộc đợt sáng; tin trước 6:30 không được tính. Không dùng luật dời giai đoạn của `classifyPhase`.
- **Mỗi phòng một dòng**: gộp theo (nhóm, tên phòng IN HOA đã trim), lấy báo cáo **mới nhất có xếp loại**. Báo cáo muộn hơn nhưng **trống mọi xếp loại** (ví dụ "Học tại lớp") **không đè** báo cáo có xếp loại trước đó của cùng phòng; nếu cả hai đều trống thì lấy báo cáo muộn hơn. Quy tắc này chỉ áp dụng cho báo cáo tổng, 4 giai đoạn vẫn dùng `latestPerRoom`. Báo cáo không có tên phòng giữ nguyên hết.
- **VỆ SINH, NỘI QUY**: lấy tin vệ sinh và tin điểm danh có giờ gửi trong cùng khung. Đợt sáng chỉ có điểm danh sáng; đợt chiều có cả sáng và chiều.
- **Áp `output/overrides.json`** (loại bỏ, đổi loại báo cáo, sửa trường) giống 4 giai đoạn.
- Giờ trong phần đầu mỗi file ("Thời gian: hh:mm") là giờ xuất thực tế.

## Kiến trúc: bot riêng, lõi một lệnh

Chọn **bot riêng** thay vì tích hợp vào `bot:runner` hay Windows Task Scheduler:

- Giữ nguyên 4 giai đoạn: phần mới hỏng hay chậm không làm trễ vòng cào của runner, và runner dừng cũng không kéo theo báo cáo tổng.
- Báo cáo tổng chạy theo **đồng hồ**, runner chạy theo **sự kiện** hàng chờ.
- In bằng Excel qua máy in mạng `\\192.168.4.189\MayInMau` là **kết nối theo từng người dùng** (kiểu Connection) nên cần chạy trong phiên của người dùng; Task Scheduler chạy khác tài khoản sẽ không thấy máy in, và Excel COM cần màn hình làm việc.
- Phù hợp mô hình dự án (mỗi bot có file trạng thái, nhịp tim và lệnh `*:status`), bật/tắt được từ trang quản trị về sau.
- Mỗi lần điền Excel là một phiên Excel riêng nên chạy cùng lúc với runner không đè nhau (chỉ tốn CPU hơn).

```
bot:total (vỏ hẹn giờ)                 total:once --slot morning|afternoon [--day D]  (lõi, chạy tay được)
  mỗi 5 giây: tới giờ đợt chưa?            1. đọc kho tin cục bộ (MessageStore)
  runner bận -> đợi (tối đa 10 phút)  ───► 2. lọc khung 6:30..mốc, áp overrides
  gọi lõi, ghi kết quả vào slot            3. mỗi phòng một báo cáo mới nhất có xếp loại
  xuất lại nếu lần đầu thiếu dữ liệu       4. dựng 7 file, tên <...>_<HHmm>-auto.xlsx
  nhịp tim + total:status                  5. ghi tracker, xoá bản cũ của ĐÚNG đợt
```

### Cô lập khỏi runner

Bot total **không** lấy `data/.scrape.lock`, **không** dùng `output/output.json`, `data/.runner-built.json`, `output/overrides.json` ngoài việc đọc overrides, **không** gọi `mark:messages`. Nó có file riêng: `data/.total-state.json` (nhịp tim), `data/.total-slots.json` (kết quả từng đợt), `data/.total-report-files.json` (tracker file `-auto`). Tên file spec/log của lần điền Excel có tiền tố `total-` (`output/fill-spec-total-loa.json`) để không trùng với runner.

## Lịch chạy và khi runner bận hoặc kẹt

Slot đến hạn khi `now >= giờ đợt` (hôm nay) và chưa có kết quả. Bot đọc `data/.runner-state.json` (nhịp tim, trạng thái) và hàng chờ cào (`readQueue`), rồi quyết định:

| Tình trạng runner | Dấu hiệu | Bot total |
|---|---|---|
| Rảnh | còn sống, `idle`, hàng chờ rỗng | xuất **ngay**; đủ dữ liệu, không xuất lại |
| Đang chờ yên lặng / đang cào / đang dựng | `waiting` hoặc `running`, hoặc hàng chờ chưa rỗng | **đợi** tối đa `waitMaxMinutes` (10) kể từ giờ đợt; hết hạn thì xuất bằng dữ liệu có sẵn, **chưa đủ**, kèm cảnh báo liệt kê nhóm chưa cào |
| Chết, dừng, báo lỗi | nhịp tim quá hạn, `stopped`, `error` | **không đợi**, xuất ngay; nếu hàng chờ còn nhóm thì **chưa đủ** |
| Treo nhưng nhịp tim vẫn đập | `running` kéo dài | đợi hết `waitMaxMinutes` rồi xuất (một vòng dựng bình thường mất 25 giây đến 3 phút) |

**Xuất lại khi lần đầu chưa đủ:** mỗi `refreshEveryMinutes` (10) phút, hoặc ngay khi hàng chờ rỗng và runner rảnh, xuất lại cho tới khi đủ dữ liệu hoặc quá `refreshUntilMinutes` (60) phút kể từ giờ đợt; thay file `-auto` cũ **của đúng đợt đó**. Runner đang chết thì chờ (không xuất lại vô ích) cho tới khi nó sống lại hoặc hết hạn.

**Chạy bù:** bot bật muộn hoặc máy tắt qua giờ đợt thì khi chạy lại, thấy đợt hôm nay chưa có kết quả và chạy ngay; khung dữ liệu vẫn kết thúc đúng giờ đợt (không phải giờ chạy bù). Không chạy bù đợt của ngày hôm trước. Kết quả từng đợt lưu ở `data/.total-slots.json` nên khởi động lại bot không xuất trùng.

**Lỗi:** một file điền lỗi (ví dụ đang mở trong Excel) chỉ ghi cảnh báo, các file khác vẫn xuất và bản cũ của file lỗi được giữ nguyên. Đợt có file lỗi được thử lại sau `refreshEveryMinutes`, tối đa 3 lần rồi bỏ cuộc (ghi cảnh báo).

**In (phần C):** chỉ in ở **lần xuất đầu tiên** của mỗi đợt, kể cả khi chưa đủ dữ liệu (giấy cần có đúng giờ); các lần xuất lại **không tự in** (muốn in lại thì chạy tay với `--print`).

## Thành phần

- `src/total/slots.ts`: toán khung giờ (`slotsOfDay`, `inSlotWindow`, `slotKey`), tên file `-auto` (`autoFileName`).
- `src/total/windowReports.ts`: `reportsInWindow`, `latestGradedPerRoom`, `cleaningEntriesInWindow`, `attendanceEntriesInWindow`.
- `src/total/decide.ts`: `decideTotal`, `SlotRecord`, `recordAfterRun`, `recordAfterCrash`, `giveUp` (thuần, không đụng đĩa).
- `src/total/totalState.ts`: file trạng thái bot, nhịp tim, `totalHealth`, kết quả từng đợt (`readSlots`/`writeSlots`/`pruneSlots`).
- `src/total/runnerSnapshot.ts`: `takeRunnerSnapshot` (đọc sức khoẻ và trạng thái runner).
- `src/total/runTotal.ts`: `runTotalOnce` (lõi, nhận phụ thuộc để test được), `src/total/realDeps.ts` (phụ thuộc thật).
- `src/total/totalStatusReport.ts`: `formatTotalStatus`.
- `src/cli/total-once.ts`, `src/cli/bot-total.ts`, `src/cli/total-status.ts`; scripts `total:once`, `bot:total`, `total:status`.
- Cấu hình mới mục "10. BÁO CÁO TỔNG" trong `config.ts` (`total.windowStartHour` 6.5, `morningHour` 9, `afternoonHour` 15, `waitMaxMinutes` 10, `refreshEveryMinutes` 10, `refreshUntilMinutes` 60, `pollSeconds` 5), khai báo cả trong `configCheck.ts` và `configDoc.ts`.

## Kiểm thử

- Khung giờ: tin 6:29:59 loại, 6:30 giữ, 8:59 giữ ở đợt sáng, 9:00 loại ở đợt sáng nhưng giữ ở đợt chiều, 14:59 giữ, 15:00 loại.
- Phòng lỗi lúc 10h rồi bình thường lúc 14h: đợt chiều một dòng bình thường; đợt sáng vẫn lỗi. Báo cáo muộn hơn nhưng trống xếp loại không đè báo cáo có xếp loại.
- `decideTotal` theo bảng ở trên (rảnh, bận quá hạn, chết, xuất lại, bỏ cuộc, giữ nhịp thử lại khi lỗi).
- `runTotalOnce` với phụ thuộc giả: 7 file, tên có `-auto` và giờ xuất, thay đúng file cũ của đợt đó và không đụng đợt khác, một file lỗi không chặn 6 file còn lại.
- Trạng thái bot, nhịp tim, kết quả đợt (đọc/ghi/dọn), `formatTotalStatus`, cấu hình.
- Chạy thật bằng Excel trên ngày có dữ liệu: `total:once --slot afternoon --day 2026-10-02`, rồi chạy lại để kiểm tra bản cũ của đợt bị thay.
- Hồi quy: toàn bộ test hiện có vẫn xanh; kết quả 4 giai đoạn không đổi.

## Giai đoạn 2 (C): in tự động — nghiên cứu

**Mục tiêu:** khi một đợt báo cáo tổng xuất xong thì tự in các file có dữ liệu ra máy in hiện có. Đây là **nghiên cứu**, chưa có quyết định. Phân biệt cái đã kiểm chứng với giả thuyết.

### Đã kiểm chứng trên máy này (2026-10-02, 2026-10-03)

- Máy in mặc định: `\\192.168.4.189\MayInMau`, driver **Brother DCP-T520W** (phun màu), cổng `USB001`, kiểu **Connection**, đang chia sẻ: máy in cắm USB vào **một máy khác** (192.168.4.189), máy này in qua mạng. Máy kia tắt thì lệnh in kẹt.
- Máy in ảo sẵn có (`Microsoft Print to PDF`, `XPS`) mở hộp thoại hỏi nơi lưu, nên không thử tự động hoàn toàn bằng cách đó.
- Spooler đang chạy; Excel cài tại `C:\Program Files\Microsoft Office\Root\Office16\EXCEL.EXE`.
- Excel COM `Worksheet.PrintOut()` gửi lệnh in được: Excel tự trỏ `ActivePrinter` về `\\192.168.4.189\MayInMau on Ne03:` (máy in mặc định). Hai lần in thử file TÌNH TRẠNG LỖI MÁY TÍNH (1 trang A4 ngang): Excel báo gửi thành công, hàng đợi trên máy này rỗng ngay sau đó. **Chưa xác nhận được giấy đã ra** (nhật ký in của Windows đang tắt, máy này không thấy tình trạng máy in ở máy kia). Tra cứu quyền từ xa (`net view`, `Get-Printer -ComputerName`) bị từ chối ("Access is denied").
- Số trang: với dữ liệu thử, mỗi file 1 trang (mẫu `fitToHeight=0` nên dữ liệu thật 300 nhóm có thể nhiều trang). Sheet thứ hai của MÁY TÍNH in 0 trang; file VỆ SINH có 2 sheet.
- Các mẫu đã có cài đặt trang in A4 nằm ngang, vừa chiều rộng một trang. Mẫu VỆ SINH cũ chưa có cài đặt; bộ mẫu mới cần kiểm lại.

### Các hướng

| Hướng | Cách | Nhận xét |
|---|---|---|
| **A. Excel in trực tiếp** | Excel COM `PrintOut` (có `ActivePrinter`, `Copies`) | Đề xuất: tôn trọng cài đặt trang in của mẫu, không thêm phần mềm, đã gửi lệnh in được. Cần cách chỉ định máy in mạng mà không đổi máy in mặc định |
| B. Shell `PrintTo` | `Start-Process <file> -Verb PrintTo <máy in>` | Phụ thuộc phần mềm gắn với `.xlsx`, mở giao diện, kém ổn định |
| C. Xuất PDF rồi in | Excel `ExportAsFixedFormat` ra PDF, in bằng phần mềm đọc PDF dòng lệnh | Thêm phần mềm; PDF dùng được làm bản xem trước/lưu trữ |

### Quy tắc đã thống nhất cho khi làm

- Mặc định in **tắt** (`print.enabled = false`) cho tới khi máy in được kiểm chứng ra giấy.
- Máy in mặc định, một bản, **chỉ in lần xuất đầu** của mỗi đợt, không in lại khi xuất lại; có chế độ `--dry-run` chỉ liệt kê file sẽ in.
- Bỏ qua file **ĐIỆN khi còn rỗng**; file VỆ SINH in cả hai sheet; giới hạn số trang tối đa mỗi file.
- Lỗi máy in (tắt, hết giấy, kẹt hàng đợi) chỉ ghi cảnh báo trong trạng thái bot, không làm hỏng việc xuất file. Bot chỉ báo **"đã gửi lệnh in"**, không báo "đã in xong" vì không có cách xác nhận từ máy này.

### Còn mở cho phần C

1. Cách chỉ định máy in mạng trong Excel mà không đổi máy in mặc định (hoặc cứ dùng máy in mặc định).
2. Xác nhận bằng mắt rằng giấy ra; nên cân nhắc thêm máy in thẳng bằng địa chỉ IP của Brother (có Wi-Fi) để không phụ thuộc máy 192.168.4.189 phải bật.
3. In màu hay đen trắng (báo cáo có tô màu theo xếp loại).
4. Giới hạn số trang cụ thể.

### Đã làm (2026-10-03): in tích hợp vào `bot:total`

Hướng A (Excel COM `PrintOut`), **cài đặt trang in (lề, hướng giấy, tỷ lệ) nằm sẵn trong mẫu Excel**, lúc chạy không ghi đè gì; máy in là máy in mặc định của Windows (muốn đổi máy in thì đặt máy in khác làm mặc định).

- Cấu hình mục 11 `print`: `enabled` (mặc định `false`), `maxPagesPerFile` (mặc định 5).
- `src/total/printFiles.ts` (`printTotalFiles`, `runPrintScript`) + `scripts/print-xlsx.ps1` (mỗi file một tiến trình PowerShell, mở file chỉ đọc, `PrintOut(1, min(trang, tối đa))`, ghi log JSON). In **mọi file đã xuất, kể cả file chưa có dòng dữ liệu** (đổi 2026-10-05; trước đó file rỗng bị bỏ qua) và chỉ **sheet chính** (VỆ SINH: `HANG NGAY`, bỏ sheet `TONG` đang trống — khác dự kiến "in cả hai sheet" ở trên vì sheet `TONG` ra 2-3 trang gần như trắng). File dài hơn giới hạn chỉ in các trang đầu và ghi cảnh báo.
- `tickTotal`: sau **lần xuất đầu thành công** của một đợt (`shouldPrintAfterRun`) thì in; kết quả đợt có thêm `printedAt`, `printed` (`withPrinted`), các lần xuất lại sau đó giữ dấu này và không in lại. Lỗi in chỉ ghi log + cảnh báo, không tạo bản ghi sự cố, không thử in lại (tránh in trùng). Nhịp tim được ghi trước mỗi file in.
- `total:status` ghi "đã gửi lệnh in N file lúc HH:mm", không bao giờ nói "đã in xong".
- `total:once --print` luôn in (không phụ thuộc `print.enabled`); `--print --dry-run` chỉ đếm trang và liệt kê file sẽ in, không in giấy.
- Đã kiểm: 567 test đạt; chạy thử `total:once --slot morning --print --dry-run` trên dữ liệu thật báo sẽ in 6 file (ĐIỆN rỗng bị bỏ qua). **Chưa in giấy thật bằng đường này** và chưa xác nhận giấy ra.

## Thứ tự thực hiện

1. **B:** `bot:total`, `total:once`, `total:status` — không in.
2. **C:** gắn bước in vào cuối lần xuất đầu của mỗi đợt (mặc định tắt) — đã làm, xem trên.
