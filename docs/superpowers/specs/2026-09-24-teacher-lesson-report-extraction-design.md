# Skill teacher-lesson-report-extraction V2

Ngày: 2026-09-24

## Điều kiện kích hoạt

Khi người dùng yêu cầu **"trích xuất thông tin báo cáo buổi dạy"**.

## Mục tiêu

Lấy được những thông tin cần thiết từ các tin nhắn báo cáo đầu và cuối buổi dạy của giáo viên gửi trong nhóm.

Skill này giữ nguyên điều kiện kích hoạt và mục tiêu của skill cũ. Chỉ thay cách lấy dữ liệu vào và đưa dữ liệu ra: dùng script cục bộ trong `zca-scrape-message/` thay cho API (`save-report`, `mark-message-as-read`).

## Luồng chạy

Workdir: `zca-scrape-message/`.

| Bước | Việc | Lệnh |
|---|---|---|
| 1 | Cào tin nhắn (chỉ các nhóm đang có trong hàng chờ) | `npm run bot:scrape` |
| 2 | Đưa lên DB | `npm run sync:db -- --apply` |
| 3 | Trích xuất bằng script | `npm run extract:reports` |
| 4 | Agent giám sát: đọc kết quả và `output/review.json`, sửa nếu cần rồi chạy lại bước 3 | agent ghi `output/overrides.json` |
| 5 | Điền file Excel mẫu và chạy macro | `npm run fill:report -- output/output.json` |
| 6 | Cập nhật DB | `npm run mark:messages -- output/marks.json` |
| 7 | Thông báo | `"xong"` nếu thành công, ngược lại báo lỗi chi tiết |

Nếu bước 1 hoặc 2 lỗi thì dừng và báo lỗi. Nếu hàng chờ rỗng thì `bot:scrape` thoát ngay (xem spec hàng chờ) và skill báo "không có tin mới". Nếu không có tin nhắn báo cáo hợp lệ thì bỏ qua bước 5, vẫn chạy bước 6 để đánh dấu các tin nhắn còn lại là `-1`.

## Đối chiếu tên trường

| SKILL.md cũ | JSON hiện tại (`data/<groupId>.json`) |
|---|---|
| `group_id` | `groupId` |
| `group_name` | `groupName` |
| `msg_id` | `msgId` |
| `msg_text` | `content` |
| `sender_id` | `senderId` (kèm `senderName`) |
| `timestamp` | `ts` (mili giây) |
| không có | `msgType` (`desktop.text`, `chat.photo`), `isSelf`, `threadType` |

Chỉ xét tin nhắn có `msgType = desktop.text`. Các tin nhắn khác (ảnh, bot gửi) được gán `maTrangThai = -1`.

## Tin nhắn cần xử lý

Mỗi lần chạy chỉ xử lý tin nhắn của **một buổi trong một ngày** (giờ Việt Nam), không gộp các ngày hay các buổi khác. Lý do: file JSON tích lũy nhiều ngày; xử lý cả những tin cũ sẽ làm Excel bị trùng và lẫn báo cáo của buổi khác.

- Buổi (theo giờ gửi tin nhắn): `sang` 00:00–11:59, `chieu` 12:00–17:59, `toi` 18:00–23:59.
- Tham số: `--day YYYY-MM-DD` (mặc định hôm nay) và `--buoi sang|chieu|toi` (mặc định là buổi của thời điểm chạy). Người dùng nói "báo cáo buổi sáng" thì agent truyền `--buoi sang`.
- Chỉ các tin nhắn nằm trong buổi đó được xét và được ghi vào `marks.json`; tin ngoài buổi không bị đụng tới.
- Mỗi lần chạy tạo một file Excel riêng cho buổi đó, tên `baocaobuoi<buoi>_<ddMMyy>.xlsm` (ví dụ buổi sáng 25/09/2026 là `baocaobuoisang_250926.xlsm`), trong `data/export/`; chạy lại cùng ngày và buổi thì ghi đè.
- `extract:reports` ghi thêm `output/meta.json` (`{ "day", "buoi" }`) để `fill:report` biết đặt tên file mà không cần truyền lại tham số.

## Script trích xuất và agent giám sát

Script `extractLessonReports.ts` (lệnh `extract:reports`) thực hiện toàn bộ quy tắc trích xuất bên dưới. Agent không tự trích xuất mà đọc kết quả, đối chiếu với tin nhắn gốc và sửa những chỗ script làm sai hoặc không chắc chắn.

Đầu vào: `data/*.json`, chỉ tin nhắn trong ngày và buổi cần xử lý (mục "Tin nhắn cần xử lý"). Tham số: `--day YYYY-MM-DD` (mặc định hôm nay theo giờ Việt Nam), `--buoi sang|chieu|toi` (mặc định buổi hiện tại), `--no-db` (bỏ qua bước tra `RoomId`, dùng khi kiểm thử).

Đầu ra trong `output/`:
- `output.json`: các báo cáo hợp lệ, định dạng như mục "Định dạng đầu ra" của SKILL.md V2, thêm trường `data.maPhong` (`RoomId` tra từ DB, hoặc `null`).
- `marks.json`: `maTrangThai` của mọi tin nhắn đã xét (báo cáo hợp lệ và các tin `-1`).
- `review.json`: các báo cáo cần agent xem, mỗi mục gồm `key` (`maNhom`, `maTinNhan`), `lyDo` (danh sách, một báo cáo có thể có nhiều lý do), `raw` (nguyên văn `content`), `draft` (kết quả script), `truongCanXem` (danh sách trường nghi ngờ).
- Bản tóm tắt in ra màn hình: số tin đã xét, số báo cáo, số mục cần xem theo từng lý do.

Các lý do đưa vào `review.json` (`lyDo`):
- `khong_nhan_ra_nhan`: có dòng dạng `Nhãn: giá trị` trông giống một trong 8 dòng cần lấy (chứa "tình trạng", "phòng", "giáo viên", "lỗi", "thiếu" hoặc "máy ") nhưng không khớp nhãn nào và không thuộc nhóm dòng bỏ qua đã biết (`Tên trợ giảng`, `Tổng số máy`, `Số lượng HS`, ...).
- `thieu_dong`: báo cáo thiếu một trong 8 dòng cần lấy (script vẫn gán `maTrangThai = 2`; agent xem có phải do nhãn viết lệch hay thật sự thiếu).
- `gan_giong_tieu_de`: tin nhắn chứa cụm "báo cáo" và "đầu buổi" hoặc "cuối buổi" nhưng không khớp tiêu đề chuẩn.
- `phong_khong_tim_thay`: `fn_LookupRoomIds` không tìm ra phòng (`maPhong = null`).
- `truong_khong_nhan_ra`: `khuVuc` hoặc `truong` không xác định được từ tên nhóm.
- `so_khong_hop_le`: `Tổng số máy bị lỗi` hoặc `Số máy còn thiếu cho HS` có chữ thay vì số (ví dụ `IT bảo trì`).

Agent sửa bằng `output/overrides.json`: mảng các mục `{ "key": { "maNhom", "maTinNhan" }, "sua": { ... } }`, trong đó `sua` chỉ gồm các trường thô cần ghi đè: `phongMay`, `giaoVien`, `truong`, `khuVuc`, `loaiBaoCao`, `thieu`, `loi`, `ghiChuLoi`, `xepLoai` của từng cơ sở vật chất (`amThanh`, `netSupport`, `mayLanh`, `internet`), và `loaiBo: true` để loại tin nhắn khỏi báo cáo (gán `-1`). Agent không được ghi `xepLoai` của máy tính hay `maTrangThai`: script luôn tự tính lại từ các trường thô. Chạy lại `extract:reports` sẽ áp dụng `overrides.json`; mục có `key` không tồn tại trong dữ liệu bị bỏ qua kèm cảnh báo.

`maTrangThai = 2` khi `maPhong = null`: phòng không khớp DB nên báo cáo không được đưa vào Excel (bước 5) nhưng vẫn được đánh dấu đã đọc.

## Quy tắc trích xuất

Nội dung quy tắc giữ nguyên như SKILL.md hiện tại và do script `extractLessonReports.ts` thực hiện. Chỉ đổi tên trường và giá trị sang tiếng Việt:

| Tên cũ | Tên mới | Ghi chú |
|---|---|---|
| `messageId` | `maTinNhan` | lấy từ `msgId` |
| `senderId` | `maNguoiGui` | lấy từ `senderId` |
| `groupId` | `maNhom` | lấy từ `groupId` |
| `timestamp` | `thoiGian` | lấy từ `ts` |
| `type` | `loaiBaoCao` | `DauBuoi` (đầu buổi), `CuoiBuoi` (cuối buổi) |
| `data.statusId` | `data.maTrangThai` | mặc định 1 |
| `data.school` | `data.truong` | gồm `capHoc`, `tenRieng`, `coSo` |
| `data.area` | `data.khuVuc` | |
| `data.room` | `data.phongMay` | |
| `data.employee` | `data.giaoVien` | |
| `data.facilities` | `data.coSoVatChat` | mảng |
| `facilities[].type` | `coSoVatChat[].loai` | `AmThanh` (loa, âm ly), `NetSupport`, `MayLanh` (máy lạnh, máy quạt), `Internet`, `MayTinh` |
| `facilities[].grade` | `coSoVatChat[].xepLoai` | `T`/`B`/`K`, riêng máy tính là `A`/`B`/`C`/`D` |
| `quantities` | `soLuong` | chỉ dùng cho `MayTinh` |
| `quantities[].type` | `soLuong[].loai` | `Thieu` (số máy còn thiếu), `Loi` (tổng số máy bị lỗi) |
| `quantities[].quantity` | `soLuong[].so` | |
| `quantities[].note` | `soLuong[].ghiChu` | chỉ dùng cho `Loi` |
| `Missing` / `Faulty` / `FaultyNote` | `Thieu` / `Loi` / `GhiChuLoi` | tên gọi tắt trong quy tắc tính `xepLoai` |

Quy tắc chính (tên mới): `phongMay`, `giaoVien`, `coSoVatChat`, bảng `xepLoai` máy tính theo `Thieu` và `Loi`, `maTrangThai` 1 hoặc 2, `truong`/`khuVuc` lấy qua skill `school-and-area-extraction`.

Bổ sung:
- Chỉ lấy 8 dòng đã định nghĩa trong SKILL.md. Các dòng `Tên Trợ Giảng`, `Tổng số máy`, `GV Quản Nhiệm có mặt tại lớp` bỏ qua.
- `BÁO CÁO CHUYÊN MÔN` và `BÁO CÁO CHUYÊN MÔN 2` là báo cáo loại khác, gán `maTrangThai = -1`, không đưa vào kết quả.
- Dòng báo cáo có tiền tố `- `. Bỏ tiền tố trước khi khớp nhãn.
- Nhãn khớp không phân biệt hoa thường và chịu được thiếu dấu cách sau `:` (ví dụ `Internet:T`).
- Ví dụ thật: `Tổng số máy bị lỗi: IT bảo trì` không có số nên `Loi = null`, `xepLoai = null`, `maTrangThai = 2`.
- Ví dụ thật: `Tổng số máy bị lỗi: 3(máy 35 ...)` không có dấu cách trước ngoặc, vẫn lấy `Loi = 3` và `GhiChuLoi`.

## Script mới

### `fillRoomFacilityReport.ts` (lệnh `fill:report`)

Đầu vào: `output/output.json`.
File mẫu: `workspace/templates/Temp_RoomFacility_rpt.xlsm`. Không sửa bản gốc.
Đầu ra: bản sao `data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm` (xem mục "Tin nhắn cần xử lý"), đã điền dữ liệu và đã chạy macro, ghi đè nếu trùng ngày và buổi.

Các bước:
1. Dựng các dòng phẳng cho sheet `data` (mục "Cột sheet `data`" bên dưới).
2. `RoomId` lấy từ `data.maPhong` của `output.json` (script trích xuất đã tra bằng `dbo.fn_LookupRoomIds`, truyền cả lô qua kiểu bảng `RoomSchoolArea`: `Room`, `SchoolLevel`, `SchoolBaseName`, `SchoolBranch`, `Area`). Khi tra, bỏ tiền tố `PM` khỏi tên phòng (`PM1` thành `1`) vì bảng `Room` lưu tên không có `PM`; cột `Room` trong Excel vẫn giữ đúng chữ trong tin nhắn. Báo cáo có `maPhong = null` bị bỏ qua.
3. Gọi một script PowerShell điều khiển Excel (COM): mở bản sao của file mẫu với `EnableEvents = False` (để `Workbook_Open` không chạy khi sheet `data` còn trống), ghi các dòng vào sheet `data` từ ô `A2`, bật lại `EnableEvents`, gọi `Application.Run "ThisWorkbook.Workbook_Open"`, rồi lưu dạng `.xlsm`. Việc điền 5 bảng báo cáo nằm trong `Workbook_Open` của file mẫu (`WriteData` chỉ là hàm phụ nhận tham số, không gọi trực tiếp được). Dùng chính Excel để mở và lưu nên macro, bảng và định dạng được giữ nguyên.
4. Sheet `filter` (ẩn) để nguyên như file mẫu: đã chạy thử với `filter` trống, macro chạy đúng và không ẩn sheet nào.

Ràng buộc của VBA trong file mẫu (đã kiểm chứng khi chạy thử):
- Chỉ xét dòng có `TypeId` là 1 hoặc 2. `Timestamp` và `Date` phải là số (`Date` là số ngày kiểu Excel, định dạng `dd/mm/yyyy`).
- Với mỗi cặp (ngày, `RoomId`) chỉ giữ báo cáo có `Timestamp` lớn nhất, nên bảng báo cáo hiển thị báo cáo mới nhất của phòng trong ngày, không phải mọi báo cáo.
- Các dòng có `RoomId` trống đều bị gộp thành một dòng cho mỗi ngày, nên script `fill:report` bỏ qua các báo cáo có `maPhong = null` (không đưa vào sheet `data`).
- Nếu 5 bảng đã có dữ liệu thì `Workbook_Open` không chạy lại.

Yêu cầu: máy chạy skill phải cài Microsoft Office và file mẫu được phép chạy macro (không bị chặn do tải từ Internet).

#### Cột sheet `data`

Đúng thứ tự, đã có sẵn ở hàng 1 của file mẫu: `Id`, `MessageId`, `SenderId`, `GroupId`, `Timestamp`, `Date`, `Time`, `TypeId`, `Employee`, `RoomId`, `School`, `Area`, `Room`, `FacilityId`, `FacilityTypeId`, `FacilityGrade`, `FacilityNote`, `QuantityTypeId`, `Quantity`, `QuantityNote`.

Dạng phẳng: một dòng cho mỗi cặp (cơ sở vật chất, số lượng) của một báo cáo. Một báo cáo có 5 cơ sở vật chất thì có 5 dòng; riêng máy tính có 2 dòng số lượng (thiếu, lỗi) nên tạo 2 dòng, và các dòng còn lại để trống ba cột `QuantityTypeId`, `Quantity`, `QuantityNote`. Các cột của báo cáo (`Id`, `MessageId`, `SenderId`, `GroupId`, `Timestamp`, `Date`, `Time`, `TypeId`, `Employee`, `RoomId`, `School`, `Area`, `Room`) lặp lại trên mọi dòng của báo cáo đó.

Cách điền:
- `Id`: GUID mới cho mỗi báo cáo. `FacilityId`: GUID mới cho mỗi cơ sở vật chất, dòng cùng cơ sở vật chất dùng chung.
- `MessageId`, `SenderId`, `GroupId`, `Timestamp`: từ `maTinNhan`, `maNguoiGui`, `maNhom`, `thoiGian`.
- `Date`, `Time`: tách từ `Timestamp` theo giờ Việt Nam.
- `TypeId`, `FacilityTypeId`, `QuantityTypeId`: theo bảng mã bên dưới.
- `RoomId`: kết quả tra ở bước 2.
- `Employee`: `giaoVien`.
- `School`: tên trường dạng `LC HOA SEN 1` (ghép `capHoc`, `tenRieng`, thêm `coSo` nếu có). `Area`: tên khu vực như skill `school-and-area-extraction` trả về (`TĐ`, `BTAN`...). `Room`: `phongMay` giữ đúng như người báo cáo viết.
- `FacilityGrade`: `xepLoai`. `FacilityNote`: để trống. `QuantityNote`: `GhiChuLoi`.

## Bảng mã (đặt trong SKILL.md V2)

Nguồn: bảng mã trong DB.

| Nhóm | Giá trị | Code | Tên | Tên trong `output.json` |
|---|---|---|---|---|
| `TypeId` (loại báo cáo) | 1 | RoomFacilityLessonStart | Đầu buổi | `DauBuoi` |
| | 2 | RoomFacilityLessonEnd | Cuối buổi | `CuoiBuoi` |
| `FacilityTypeId` | 1 | Computer | Máy tính | `MayTinh` |
| | 2 | NetSupport | NetSupport | `NetSupport` |
| | 3 | Internet | Internet | `Internet` |
| | 4 | Speaker | Loa | `AmThanh` |
| | 5 | AirConditioner | Máy lạnh | `MayLanh` |
| `QuantityTypeId` | 1 | Missing | SL máy thiếu | `Thieu` |
| | 2 | Faulty | SL máy lỗi | `Loi` |

### `markMessages.ts`

Đầu vào: `output/marks.json`, dạng `[{ "maNhom": "...", "maTinNhan": "...", "maTrangThai": 1 }]`. Agent ghi file này ở bước 4, gồm cả tin nhắn được phân loại `-1`.

Việc làm: với mỗi phần tử, cập nhật `StatusId = <maTrangThai>` và `HasRead = 1` cho dòng có `GroupId` và `MessageId` khớp trong `Zalo_CrawlMessage`. Chạy trong một transaction, lỗi thì rollback. Dùng `store/db.ts`. Mặc định là chạy thật; thêm `--dry-run` để chỉ in ra, không ghi DB. In ra số dòng đã cập nhật và cảnh báo nếu có phần tử không tìm thấy dòng.

Hai script thêm vào `package.json`: `fill:report`, `mark:messages`.

## Xử lý lỗi

- Lỗi cào hoặc kết nối DB ở bước 1, 2: dừng và báo.
- Không có tin nhắn báo cáo hợp lệ: không tạo Excel, vẫn đánh dấu các tin nhắn khác là `-1`.
- `markMessages` không tìm thấy dòng cho một `maNhom` + `maTinNhan`: cảnh báo, các dòng khác vẫn cập nhật.

## Kiểm thử

Không có bộ test trong repo. Kiểm tra bằng dữ liệu thật trong `data/`:
- Chạy trích xuất trên các file JSON hiện có, so sánh với các báo cáo đầu buổi thật.
- Chạy `fill:report` trên `output.json` thật, mở file `.xlsm` kiểm tra sheet `data` và 5 bảng báo cáo đã được macro điền.
- Chạy `mark:messages` với `--dry-run` (in ra, không ghi DB) trước khi chạy thật.

## Quyết định đã chốt

0. Script trích xuất toàn bộ, agent đọc và giám sát (thay cho việc agent tự trích xuất). Script `exportLessonReport.ts` cũ (xuất Excel cấu trúc cũ) bỏ qua, không dùng.
1. File mẫu dùng bản trong `workspace/templates/`.
2. Script tự chạy macro của file mẫu (`ThisWorkbook.Workbook_Open`) sau khi điền sheet `data`.
3. `School` và `Area` điền tên (không điền ID).

## Giả định còn lại

0. Báo cáo có phòng không tìm thấy trong DB (`maPhong = null`) bị loại khỏi Excel và có `maTrangThai = 2`. Chưa được người dùng xác nhận; đổi sang "vẫn đưa vào Excel" chỉ cần bỏ bước lọc trong `fill:report`.

1. Khoảng thời gian mặc định là ngày hiện tại.
2. Ranh giới các buổi: sáng trước 12:00, chiều 12:00–17:59, tối từ 18:00 (người dùng chưa nêu, có thể đổi trong `lesson/time.ts`).
3. `Area` điền mã khu vực như `TĐ`, `BTAN` (không đổi sang tên đầy đủ như "Thủ Đức").
