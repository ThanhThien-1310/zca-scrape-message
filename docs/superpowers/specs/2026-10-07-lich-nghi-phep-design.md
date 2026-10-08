# Báo cáo LỊCH NGHỈ PHÉP KỸ THUẬT (đọc từ ảnh): thiết kế

Ngày: 2026-10-07. Trạng thái: chờ người dùng duyệt.

Đây là phần 3 trong 5 phần của kế hoạch bốn báo cáo mới (0 bộ đọc chung, 1 bảo trì, 2 bộ đọc ảnh, 3 nghỉ phép, 4 internet, 5 biên bản). Người dùng chọn làm phần này trước, nên spec này **gồm cả phần tối thiểu của bộ đọc ảnh** mà nghỉ phép cần. Nó thay thế phần "bản chạy thử, chưa nối vào `bot:runner`" của `2026-10-07-doc-anh-agent-design.md` cho riêng loại ảnh nghỉ phép: ở đây có nối vào `bot:runner`, `bot:total` và in. Hai loại ảnh còn lại (tốc độ mạng, biên bản) dùng lại cùng bộ đọc nhưng có spec riêng sau.

## 1. Mục tiêu

Nhân viên nhân sự gửi vào nhóm Zalo **một ảnh "KỸ THUẬT NGHỈ PHÉP ĐÃ DUYỆT"** (bảng HỌ TÊN, TỪ giờ/thứ/ngày, ĐẾN giờ/thứ/ngày, SỐ NGÀY, LÝ DO). Ảnh **không có chữ kèm theo và không có tiêu đề**. Bot đọc ảnh, khớp họ tên với danh sách trong file mẫu `data/mau bao cao new/LICH NGHI PHEP KY THUAT.xlsx`, rồi **chỉ điền hai cột NGÀY và BUỔI** của đúng dòng người đó. Mọi ô khác giữ nguyên: SỐ NGÀY, XẾP LOẠI, K/C là công thức có sẵn của file mẫu, tự tính từ cột NGÀY.

## 2. Các quyết định đã chốt với người dùng

| # | Quyết định |
|---|---|
| 1 | Tên trong ảnh không có trong danh sách của file: **không điền gì, đưa vào "cần xem"** kèm gợi ý tên gần giống. Không thêm dòng, không sửa tên. |
| 2 | Nhận ra ảnh bằng **nội dung ảnh**, không cần tiêu đề. Chỉ đọc ảnh của các **nhóm khai trong `config.vision.leave.groups`** (lúc đầu chỉ `bot test`), tùy chọn lọc thêm theo người gửi (`senders`; trống là mọi người). Ảnh phòng máy, thiết bị mạng ở nhóm khác không bao giờ bị đưa cho agent. |
| 3 | BUỔI tính theo giờ trên ảnh (mục 6). Nghỉ nhiều ngày mà ngày đầu bắt đầu buổi sáng và ngày cuối kết thúc buổi chiều chỉ ghi **"Cả ngày"** (không ghi "Cả ngày - Cả ngày"). |
| 4 | File mỗi ngày dựng lại từ **mọi ảnh nghỉ phép đã nhận mà kỳ nghỉ chưa kết thúc**; người có ở nhiều ảnh thì lấy ảnh mới nhất; kỳ nghỉ đã qua tự biến mất khỏi file của ngày sau. |
| 5 | Người có **nhiều dòng** trong file (Đinh Đình Chinh ở dòng 6 và 27): **điền cả hai dòng**. |
| 6 | Dòng nào qua kiểm tra mới tự điền; dòng nghi ngờ **để trống và vào "cần xem"** cho đến khi người xác nhận hoặc sửa. |
| 7 | Báo cáo nghỉ phép **vào báo cáo tổng và vào đợt in**, là file thứ 8 (cuối thứ tự xuất và in). |

## 3. Luồng dữ liệu

```
tin chat.photo của nhóm trong vision.leave.groups
   -> photos:bundle   gom ảnh thành bộ, đóng gói data/photo-reports/<ngày>/<mã nhóm>/<mã bộ>/
   -> photos:read     agent phân loại từng ảnh (nghỉ phép hoặc khác), trích các dòng, kiểm tra
   -> (photos:review) người xác nhận các dòng "cần xem"
   -> fill:leave-report   gom mọi dòng còn hiệu lực, khớp tên, điền file Excel của hôm nay
```

- **Trong `bot:runner`:** hai bước đầu chạy **cuối chu trình** (sau các báo cáo khác, để việc đọc ảnh không làm chậm việc cào và dựng báo cáo), rồi `fill:leave-report`. Bước đọc ảnh chỉ chạy khi `config.vision.enabled` là true, bị chặn bởi `maxBundlesPerRun` và `timeoutSeconds`, và **lỗi ở đây chỉ là cảnh báo**, không làm hỏng chu trình. Không dùng khoá cào Zalo vì không đụng giao diện Zalo.
- **Trong `bot:total`:** chỉ **đọc kết quả đã có** (`reading.json`, `review.json`), không bao giờ gọi agent. Ảnh nghỉ phép chưa kịp đọc ở thời điểm xuất thì ghi cảnh báo "N ảnh nghỉ phép chưa đọc" và file dùng dữ liệu hiện có.
- **Tự đủ:** không cần bảng DB mới. Trạng thái nằm trong `data/photo-reports/`.

## 4. Bộ đọc ảnh tối thiểu

Lấy nguyên thiết kế của `2026-10-07-doc-anh-agent-design.md` các mục 4 (thư mục), 5 (gom bộ), 6 (khung luật), 7 (`VisionReader`, `claude -p`, Haiku 4.5), 8 (review ba lớp), 9 (ba lệnh `photos:bundle|read|review`), 10 (`config.vision`). Điều chỉnh cho nghỉ phép:

- **Chỉ một luật `leave`** ở `photo-rules/leave.json`. Luật `speedtest` và `handover` không thuộc spec này (phần 4 và 5; `handover` sẽ đổi thành `bien_ban`).
- **Ảnh phân loại từng ảnh**, nên một bộ có thể lẫn ảnh khác; ảnh không phải nghỉ phép xếp `khac` và bỏ qua. `soLuongMoiBo` của luật `leave` là 1 đến 5 ảnh; các dòng của mọi ảnh nghỉ phép trong bộ được gộp (ảnh về sau thắng nếu trùng tên).
- **Review theo từng dòng**, không theo cả bộ: mỗi dòng nghỉ có trạng thái `tu_dong_dat | can_xem | da_xac_nhan | da_sua | da_bo`. Trạng thái của bộ là trạng thái xấu nhất của các dòng. Chỉ dòng `tu_dong_dat`, `da_xac_nhan`, `da_sua` đi vào Excel.
- Thêm trạng thái **`da_bo`** (người xem bỏ dòng này): không vào Excel và không hiện lại.
- Nhóm `bot test` có tên gốc khác tên nhóm thật: `groupAliases` đã có sẵn, không cần xử lý thêm.

### Luật `leave.json` (các trường)

Đầu bảng (một lần mỗi ảnh): `ngayBaoCao` (ngày), `nguoiBaoCao` (chữ), `boPhan` (chữ). Mỗi dòng:

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `hoTen` | chữ | bắt buộc |
| `tuGio`, `denGio` | chữ dạng `H:mm` | bắt buộc, ví dụ `8:00`, `13:30` |
| `tuThu`, `denThu` | số 1 đến 7 | CN = 1, thứ hai = 2, ..., thứ bảy = 7 (cách đánh số của Excel `WEEKDAY`) |
| `tuNgay`, `denNgay` | ngày `dd/MM/yyyy` | bắt buộc |
| `soNgay` | số | số ngày nghỉ ghi trên ảnh |
| `lyDo` | chữ | không dùng để điền, chỉ lưu |

## 5. Kiểm tra

**Lớp 1, luật (mỗi dòng, không tốn token).**

*Luật cứng (vi phạm là `can_xem`):*
- `hoTen`, ngày và giờ đọc được và đúng dạng.
- `denNgay` không trước `tuNgay`; nếu cùng ngày thì `denGio` sau `tuGio`.
- Năm hợp lý: `tuNgay` không quá `config.vision.leave.maxPastDays` ngày trước ngày gửi ảnh và không quá `maxFutureDays` ngày sau (mặc định 7 và 120).
- **Kiểm chứng chéo (ba phép):** (a) `tuThu` khớp thứ của `tuNgay`, (b) `denThu` khớp thứ của `denNgay`, (c) `soNgay` bằng số ngày từ `tuNgay` đến `denNgay` **không tính Chủ nhật** (đúng công thức SỐ NGÀY của file mẫu). **Lệch từ hai phép trở lên là `can_xem`** (nhiều khả năng đọc sai ngày). **Lệch đúng một phép chỉ cảnh báo**, vì thường là lỗi gõ của người lập bảng chứ không phải đọc sai.

*Cảnh báo (không chặn):* `ngayBaoCao` lệch quá 2 ngày so với ngày gửi ảnh; tên gần giống một tên trong danh sách (mục 7).

Thử trên **ảnh mẫu** (báo cáo 02/10/2026): dòng Trần Nguyên Lộc ghi `tuThu = 2` cho 03/10/2026, nhưng 03/10/2026 là thứ bảy (7). `denThu = 2` (05/10 là thứ hai) và `soNgay = 2` (thứ bảy và thứ hai, không tính Chủ nhật) đều đúng, nên chỉ một phép lệch: **cảnh báo, không chặn**. Hai dòng còn lại không lệch phép nào.

**Lớp 2, đọc lần hai độc lập.** Chỉ chạy khi lần một có dòng bị lớp 1 nghi ngờ hoặc có trường tin cậy `thap` (`docLanHai: "khi_tin_cay_thap"`). Hai lần đọc so từng trường của từng dòng (khớp dòng theo `hoTen` đã chuẩn hóa); lệch thì dòng đó `can_xem` và ghi `{trường, lần một, lần hai}`.

**Lớp 3, người xem** (`photos:review`): liệt kê các dòng `can_xem` kèm ảnh gốc và lý do; chọn đúng, sửa trường, hoặc bỏ (`da_bo`).

## 6. Quy tắc BUỔI và NGÀY

Giờ đọc thành số thập phân (`13:30` là 13,5). Mốc là **12:00** (`config.sessions.chieuFromHour`).

- **Cùng một ngày:** bắt đầu từ 12:00 trở đi là `Chiều`. Bắt đầu trước 12:00 và kết thúc từ 12:00 trở xuống là `Sáng`; kết thúc sau 12:00 là `Cả ngày`.
- **Nhiều ngày:** buổi của ngày đầu là `Cả ngày` nếu bắt đầu trước 12:00, còn lại là `Chiều`. Buổi của ngày cuối là `Cả ngày` nếu kết thúc sau 12:00, còn lại là `Sáng`. Ghi `<ngày đầu> - <ngày cuối>`, riêng khi cả hai đều `Cả ngày` thì ghi `Cả ngày`.

| Ví dụ | BUỔI |
|---|---|
| 08/10 8:00 đến 08/10 18:00 | Cả ngày |
| 08/10 8:00 đến 08/10 11:30 | Sáng |
| 08/10 13:30 đến 08/10 18:00 | Chiều |
| 08/10 13:30 đến 10/10 18:00 | Chiều - Cả ngày |
| 08/10 13:30 đến 10/10 11:30 | Chiều - Sáng |
| 08/10 8:00 đến 10/10 11:30 | Cả ngày - Sáng |
| 08/10 8:00 đến 10/10 18:00 | Cả ngày |

**Cột NGÀY** là chữ (ô được đặt `NumberFormat "@"` trước khi ghi, để Excel không đổi thành ngày): một ngày là `dd/MM/yyyy`, nhiều ngày là `dd/MM/yyyy - dd/MM/yyyy`. Đúng dạng mà công thức SỐ NGÀY và K/C của file mẫu đọc được.

## 7. Khớp tên và chọn kỳ nghỉ

**Chuẩn hóa tên:** chữ thường, bỏ dấu (`đ` thành `d`), gộp khoảng trắng, bỏ dấu câu. Hai tên khớp khi chuẩn hóa xong bằng nhau.

**Khớp danh sách:** danh sách là cột B của file mẫu (các ô đang có chữ từ dòng 4; bỏ dòng "TỔNG" và dòng trống). Danh sách **đọc từ file mẫu mỗi lần dựng**, nên sửa file mẫu là danh sách đổi theo, không cần sửa code. Một tên có thể ở nhiều dòng: điền **mọi dòng khớp**.

**Tên không khớp:** đưa vào "cần xem" với lý do "không có trong danh sách"; gợi ý tối đa 3 tên gần nhất (cùng các từ nhưng khác thứ tự hoặc thiếu chữ đệm, hoặc cách nhau tối đa 2 ký tự sau khi chuẩn hóa). **Không tự điền theo gợi ý.** Người xem có thể chọn gợi ý đúng bằng `photos:review` (ghi vào `hoTen` đã sửa, trạng thái `da_sua`).

**Chọn kỳ nghỉ của mỗi người, từng bước:**
1. Gom mọi dòng đã vào Excel được (`tu_dong_dat`, `da_xac_nhan`, `da_sua`) của mọi bộ trong khoảng `lookbackDays` ngày gần nhất (mặc định 60), giữ dòng có `denNgay` từ hôm nay trở đi.
2. Một người có ở nhiều ảnh: **lấy dòng của ảnh mới nhất** (theo giờ gửi ảnh). Nếu ảnh mới nhất của người đó có dòng đang `can_xem` thì vẫn dùng dòng tốt mới nhất trước đó và ghi cảnh báo "có bản mới hơn đang chờ xem".
3. Một người có hai dòng trong **cùng một ảnh** (hai kỳ nghỉ rời nhau): lấy kỳ **có `denNgay` nhỏ nhất từ hôm nay trở đi**, kỳ còn lại thành `can_xem` với lý do "nhiều kỳ nghỉ, file chỉ có một ô".

## 8. Điền Excel

File mẫu: `LICH NGHI PHEP KY THUAT.xlsx`, sheet `BAO CAO`. Tiêu đề lấy từ dòng hai của ô A1 (`LỊCH NGHỈ PHÉP KỸ THUẬT`) bằng `readTemplateTitle` (đã có), tên file `<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx` như các báo cáo theo ngày khác.

**Điền tại chỗ, không chèn hay xoá dòng.** Script `fill-status-template.ps1` hiện chỉ biết ghi một khối dòng liên tục rồi chèn hoặc xoá dòng trước dòng tổng; danh sách nghỉ phép có dòng trống và hai khối nên không dùng được. Thêm vào đặc tả điền một cờ **`inPlace: true`**: khi bật, script bỏ qua toàn bộ phần dòng dữ liệu và chỉ ghi các ô trong `headerCells` (đã hỗ trợ `ref`, `value`, `numberFormat`). Với nghỉ phép, mỗi ô cần ghi là một phần tử `headerCells`: ô `F<dòng>` (NGÀY, `numberFormat: "@"`) và ô `E<dòng>` (BUỔI). Các báo cáo khác không bật cờ nên hành vi không đổi.

Không động vào: A (STT), B, C, D (công thức), G, H, I, J, K (công thức), `H2 =TODAY()`, "Nhân viên báo cáo", "Bộ phận". Người không nghỉ giữ nguyên NGÀY trống.

**Dựng lại khi nào:** như ĐIỆN: mỗi ngày một file, chỉ dựng lại khi chữ ký các ô cần ghi đổi so với lần dựng trước (`data/.leave-report.<id>.json`: ngày, chữ ký, tên file); bản cũ trong ngày bị thay sau khi bản mới ghi xong. Ngày chưa có kỳ nghỉ nào còn hiệu lực **không dựng file riêng** (không có gì để điền), nhưng báo cáo tổng vẫn xuất file (mục 9).

## 9. Đăng ký báo cáo, báo cáo tổng và in

- Mã báo cáo mới **`leave`**, loại `day`, nhãn "LỊCH NGHỈ PHÉP KỸ THUẬT", nguồn "ẢNH NGHỈ PHÉP (không có tiêu đề)". Thêm `"leave"` vào `reportSets` của bộ "Như". **Thứ tự cuối cùng** trong `REPORT_KEYS` (sau `attendance`), nghĩa là thứ tự xuất và in là 8 file.
- `bot:total`: thêm đầu ra thứ 8 vào `runTotalOnce`. **Không theo cửa sổ giờ** của đợt (khác các báo cáo tin nhắn): dùng mọi kỳ nghỉ còn hiệu lực tại ngày của đợt, từ kết quả đã đọc. Vẫn xuất file khi không có kỳ nghỉ nào (chỉ có danh sách tên, mọi NGÀY trống), vì bước in gửi mọi file đã xuất.
- Mọi chỗ ghi "7 file" cập nhật thành 8: `bot:total`, `total:status`, `reports:list`, `config:show`, README, `CLAUDE.md`, skill `du-lieu-dau-ra`, `them-loai-bao-cao-moi`, `cau-hinh-nguoi-phu-trach` (chạy `skills:sync`).
- Các bộ khác ngoài "Như" mà không bật `leave` thì không thấy gì khác.

## 10. Cấu hình (`config.vision`, thêm mục `leave`)

```
enabled / reader / model / secondModel / timeoutSeconds / maxBundlesPerRun / bundle.*   (spec đọc ảnh, mục 10)
leave.groups         nhóm được đọc ảnh nghỉ phép (tên như trong config.targets); mặc định ["bot test"]
leave.senders        chỉ đọc ảnh của các người gửi này; mặc định [] (mọi người)
leave.lookbackDays   tìm ảnh trong bấy nhiêu ngày gần nhất; mặc định 60
leave.maxPastDays    tuNgay không sớm hơn ngày gửi ảnh quá bấy nhiêu ngày; mặc định 7
leave.maxFutureDays  tuNgay không muộn hơn ngày gửi ảnh quá bấy nhiêu ngày; mặc định 120
```

`enabled` mặc định **false**: người dùng bật khi sẵn sàng. `configCheck.ts` kiểm tra khi khởi động (nhóm phải nằm trong `targets`), `configDoc.ts` mô tả để `config:show` in ra.

## 11. Lệnh

- `photos:bundle`, `photos:read`, `photos:review`: như spec đọc ảnh (mục 9), thêm `--rule leave`.
- `npm run fill:leave-report -- [--set <id>] [--now <unix ms>] [--force]`: dựng file hôm nay (mục 8). `runner:once` và `today` gọi nó như `fill:electric-report`.
- `npm run leave:show -- [--day D]`: in danh sách kỳ nghỉ sẽ được điền (tên, dòng Excel, NGÀY, BUỔI) và các dòng "cần xem", không ghi gì. Dùng để kiểm trước khi mở file.

## 12. Kiểm thử

- **Test đơn vị (không gọi agent, không cần Excel):** chuẩn hóa và khớp tên (dấu, hoa thường, khoảng trắng, tên trùng hai dòng, tên gần giống, tên lạ); toàn bộ bảng BUỔI ở mục 6 kể cả biên giờ (đúng 12:00, `8:00` và `08:00`); NGÀY một và nhiều ngày; ba phép kiểm chứng chéo (không lệch, lệch một, lệch hai); `denNgay` trước `tuNgay`; năm vô lý; chọn kỳ nghỉ (ảnh mới thắng, dòng mới đang chờ xem, hai kỳ trong một ảnh, kỳ nghỉ kết thúc hôm qua bị bỏ, kết thúc đúng hôm nay vẫn giữ); dựng danh sách ô `headerCells` (đúng ô `E`/`F`, `numberFormat "@"`, hai dòng cho người trùng tên); chữ ký dựng lại và không dựng lại; đăng ký `leave` làm đầu ra thứ 8 của `bot:total`.
- **`VisionReader` giả** truyền vào để chạy cả đường `photos:read` với dòng đọc lệch, tin cậy thấp, lỗi hết giờ, JSON sai.
- **Đáp án đúng** `photo-golden/leave.json` (commit): ảnh mẫu nghỉ phép, ba dòng như trên ảnh (Nguyễn Quốc Pháp 03/10, Trần Nguyên Lộc 03/10 đến 05/10, Hồ Đình Huy 05/10 đến 06/10), kèm kỳ vọng "một cảnh báo ở dòng Lộc". `photos:golden --rule leave` đọc ảnh thật và so; không chạy trong `npm test` vì tốn hạn mức.
- **Chạy thật:** người dùng gửi ảnh vào nhóm `bot test`, chạy `photos:*` rồi `fill:leave-report`, mở file Excel kiểm. Ba tên trong ảnh mẫu **không có** trong danh sách của file mẫu nên kết quả đúng của lần thử này là **không điền ô nào và ba dòng "cần xem"**. Muốn thấy ô được điền thì cần ảnh có tên nằm trong danh sách (hoặc tạm thêm tên vào file mẫu trên máy thử).

## 13. Rủi ro và điều cần biết

- **Máy có `VALUE("03/10/2026")` đọc sai ngày.** Công thức SỐ NGÀY và K/C của file mẫu đọc cột NGÀY (chữ) bằng `VALUE`, mà `VALUE` phụ thuộc cài đặt vùng của Windows. Máy đặt vùng `en-US` đọc `03/10/2026` là ngày 10 tháng 3 hoặc báo `#VALUE!`. Máy hiện tại đặt vùng Việt Nam (`dd/MM/yyyy`) nên đúng. **Máy mới phải đặt định dạng ngày Windows là `dd/MM/yyyy`** (ghi vào hướng dẫn cài máy mới trong README). Bot không tự kiểm ở bản này; cách phát hiện là mở file xem cột SỐ NGÀY có `#VALUE!` hay số lạ.
- **Danh sách tên sống trong file mẫu.** Nhân viên mới hay nghỉ việc phải sửa file mẫu bằng tay; bot không tự thêm hay bớt.
- **Hạn mức subscription và điều khoản** của `claude -p`, **quyền riêng tư** của ảnh: như spec đọc ảnh mục 12. Ảnh nghỉ phép chứa họ tên và lý do nghỉ (cá nhân, sức khỏe): người dùng cần chắc quy định công ty cho phép đưa ra dịch vụ bên ngoài.
- **Một người có hai kỳ nghỉ rời nhau ở hai ảnh khác nhau.** Theo quyết định 4, ảnh mới nhất thắng, kỳ nghỉ còn hiệu lực của ảnh cũ bị mất khỏi file. Bot ghi cảnh báo khi ảnh mới thay một kỳ nghỉ cũ chưa kết thúc mà không chồng nhau để người dùng thấy.
- **Chữ ký dựng lại bỏ qua `H2 =TODAY()`.** Cột K/C đổi mỗi ngày theo ngày mở file, nhưng đó là việc của Excel khi mở, không phải thay đổi dữ liệu nên không kích hoạt dựng lại.

## 14. Thứ tự thực hiện

1. Hàm thuần: chuẩn hóa tên, khớp, BUỔI, NGÀY, kiểm chứng chéo, chọn kỳ nghỉ (có test).
2. Khung luật ảnh và luật `leave.json`, sinh lược đồ và prompt.
3. Gom bộ và `photos:bundle`.
4. `VisionReader` (giao diện, `claude -p`, agent giả) và `photos:read`, review lớp 1 và 2 theo từng dòng.
5. `photos:review` và `leave:show`.
6. Cờ `inPlace` của script điền, `fill:leave-report`, đăng ký `leave` (registry, `bot:total`, in, `runner`, `today`).
7. Cấu hình `config.vision`, tài liệu và skill, đáp án đúng `photo-golden/leave.json`.
