---
name: teach-lesson-skills-v2
description: Trích xuất thông tin báo cáo buổi dạy từ tin nhắn trong nhóm (V2: script cục bộ trích xuất, agent giám sát, điền file Excel báo cáo)
---

# Skill teacher-lesson-report-extraction V2

Ngày: 2026-09-24 (cập nhật 2026-09-25)

## Điều kiện kích hoạt

Khi người dùng yêu cầu **"trích xuất thông tin báo cáo buổi dạy"**.

## Mục tiêu

Lấy được những thông tin cần thiết từ các tin nhắn báo cáo đầu và cuối buổi dạy của giáo viên gửi trong nhóm.

Skill này giữ nguyên điều kiện kích hoạt và mục tiêu của skill cũ. Chỉ thay cách lấy dữ liệu vào và đưa dữ liệu ra: dùng script cục bộ trong `zca-scrape-message/` thay cho API (`save-report`, `mark-message-as-read`). Việc trích xuất do **script** làm, còn **bạn (agent) đọc và giám sát** kết quả.

## Lưu ý quan trọng

- Mọi lệnh chạy trong thư mục `zca-scrape-message/`.
- Cần cài Microsoft Excel (bước 5) và có `.env` cấu hình kết nối DB (bước 2, 3, 6).
- Không sửa `templates/Temp_RoomFacility_rpt.xlsm`; script luôn làm việc trên bản sao.
- Khi chạy tự động, **luôn truyền tường minh** `--buoi` (lấy từ yêu cầu của người dùng: "buổi sáng" → `sang`, "buổi chiều" → `chieu`, "buổi tối" → `toi`) và `--day` nếu không phải hôm nay. Không dựa vào giá trị mặc định (buổi của thời điểm chạy).
- Không dùng `--no-db` khi chạy thật: không có `maPhong` thì không báo cáo nào vào được file Excel.
- Bước 2 (`sync:db --apply`) và bước 6 (`mark:messages`) **ghi vào DB dùng chung**.
- Không chạy hai lần song song: mọi lần chạy dùng chung thư mục `output/` và ghi đè lẫn nhau.

## Luồng chạy

Workdir: `zca-scrape-message/`.

Hai bot phối hợp: `bot:watch` chỉ theo dõi và ghi tên nhóm có tin mới vào hàng chờ `data/.scrape-queue.json`; `bot:scrape` đọc hàng chờ và cào đúng các nhóm đó. Sau đó script trích xuất, agent giám sát.

| Bước | Việc | Lệnh |
|---|---|---|
| 1 | Cào tin nhắn của các nhóm đang trong hàng chờ | `npm run bot:scrape` |
| 1b | Khôi phục nếu `bot:watch` từng gián đoạn (không làm gì nếu không có gián đoạn) | `npm run recover:missing -- --day YYYY-MM-DD --buoi sang\|chieu\|toi` |
| 2 | Đưa lên DB | `npm run sync:db -- --apply` |
| 3 | Trích xuất bằng script (chỉ tin nhắn của một buổi) | `npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang\|chieu\|toi]` |
| 4 | Agent giám sát: đọc kết quả và `output/review.json`, sửa nếu cần rồi chạy lại bước 3 | agent ghi `output/overrides.json` |
| 5 | Điền file Excel mẫu và chạy macro | `npm run fill:report -- output/output.json` |
| 6 | Cập nhật DB | `npm run mark:messages -- output/marks.json` |
| 7 | Thông báo | `"xong"` nếu thành công, ngược lại báo lỗi chi tiết |

Nếu bất kỳ bước nào (trừ bước 1b, xem mục "Khôi phục khi `bot:watch` bị gián đoạn") lỗi thì dừng và báo lỗi, **không chạy tiếp các bước sau**; đặc biệt không chạy bước 6 khi bước 3 hoặc 5 lỗi, vì bước 6 đánh dấu tin nhắn đã đọc dù chưa có kết quả. Nếu bước 1 in `hàng chờ rỗng` thì **không dừng**: chỉ có nghĩa là không có nhóm nào cần cào thêm (dữ liệu có thể đã được cào trước đó, ví dụ ai đó đã chạy `bot:scrape` tay); cứ tiếp tục bước 2–6 với dữ liệu đã có. Chỉ khi bước 3 in `xét 0 tin` thì dừng và báo "không có tin nhắn trong buổi này". Đọc kỹ output của bước 1: dòng `sidebar item ... not found` hoặc `no messages found` nghĩa là nhóm đó có thể **chưa được cào** dù lệnh vẫn thoát mã 0; nêu tên nhóm đó trong thông báo cuối. Nếu không có tin nhắn báo cáo hợp lệ (`output.json` là `[]`) thì bước 5 tự bỏ qua, vẫn chạy bước 6 để đánh dấu các tin nhắn còn lại là `-1`. Chi tiết bước 3, 4, 5, 6 ở các mục "Script trích xuất và agent giám sát", "Điền file Excel mẫu" và "`markMessages.ts`" bên dưới.

## Khôi phục khi `bot:watch` bị gián đoạn (bước 1b)

`bot:watch` là thứ duy nhất báo cho hàng chờ biết nhóm nào có tin mới. Nó ghi nhịp tim vào `data/.watch-state.json` (mỗi 30 giây, kèm trạng thái hai nguồn phát hiện: WebSocket và thông báo) và ghi mọi khoảng thời gian nó không lắng nghe vào `data/.watch-gaps.json` (chết đột ngột, dừng có chủ ý, hoặc còn sống nhưng mất cả hai nguồn). Bước 1b dùng các file này:

- Lệnh: `npm run recover:missing -- --day YYYY-MM-DD --buoi <sang|chieu|toi>` (truyền cùng `--day` và `--buoi` với bước 3). Thêm `--dry-run` để chỉ xem kế hoạch.
- Nếu không có khoảng gián đoạn nào chồng lên buổi: lệnh in "không cần khôi phục" và không làm gì. Đây là trường hợp bình thường.
- Nếu có: chỉ cào lại các nhóm còn **thiếu báo cáo đầu buổi hoặc cuối buổi** (nhóm trong `config.recoveryIgnoreTargets` được bỏ qua), từ trước khoảng gián đoạn 5 phút. Lệnh in các khoảng gián đoạn, các tin nhắn bị lỡ đã khôi phục và các nhóm vẫn thiếu, đồng thời ghi `output/recovery.json`.
- Chưa có dữ liệu nhịp tim (chưa từng chạy `bot:watch` bản mới) được coi là gián đoạn "không rõ": lệnh sẽ cào lại các nhóm đang thiếu báo cáo.
- Trong thông báo cuối, nêu: có khoảng gián đoạn nào (khi nào, vì sao), đã khôi phục bao nhiêu tin (nêu tiêu đề các báo cáo), và các nhóm **vẫn thiếu** báo cáo sau khi cào lại (người phụ trách cần nhắc; cũng có thể là nhóm không có lớp buổi đó).
- Lệnh thoát mã 1 nghĩa là có nhóm không cào được: nêu tên nhóm đó nhưng **vẫn tiếp tục** bước 2–6.
- Xem nhanh tình trạng `bot:watch` bất cứ lúc nào: `npm run watch:status` (còn sống hay đã chết lúc nào, nguồn nào đang hoạt động, các khoảng gián đoạn 24 giờ qua).

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

Mặc định agent chỉ xử lý tin nhắn có `ts` trong ngày hiện tại (giờ Việt Nam), hoặc trong ngày người dùng chỉ định. Lý do: file JSON tích lũy nhiều ngày, xử lý lại tin nhắn cũ sẽ làm Excel bị trùng. Excel được tạo lại mỗi lần chạy và ghi đè file cùng ngày.

Mỗi lần chạy chỉ xử lý **một buổi** của ngày đó, không gộp các buổi hay các ngày khác. Buổi tính theo giờ gửi tin (giờ Việt Nam): `sang` 00:00–11:59, `chieu` 12:00–17:59, `toi` 18:00–23:59. Người dùng nói "báo cáo buổi sáng" thì chạy `--buoi sang`; không nói thì mặc định là buổi của thời điểm chạy. Chỉ các tin nhắn trong buổi đó được xét và được ghi vào `marks.json`; tin nhắn ngoài buổi không bị đụng tới. Mỗi buổi tạo một file Excel riêng: `data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm` (ví dụ buổi sáng 25/09/2026 là `baocaobuoisang_250926.xlsm`). Tạm thời không xử lý ảnh (`chat.photo`): chỉ đọc tin nhắn chữ.

## Quy tắc trích xuất

Quy tắc lấy nguyên từ skill `teacher-lesson-report-extraction` bản cũ (bước 2 và 3), chỉ đổi tên trường và giá trị sang tiếng Việt như bảng ở mục "Đối chiếu tên trường" và các bảng bên dưới. Các quy tắc dưới đây do script `extract:reports` thực hiện (xem mục "Script trích xuất và agent giám sát"); agent dùng chúng để đối chiếu và sửa những trường hợp script không chắc chắn hoặc làm sai, vì các trường hợp rất đa dạng.

### Phân loại tin nhắn

**Tin nhắn báo cáo.** Một tin nhắn là **báo cáo đầu buổi dạy** hoặc **báo cáo cuối buổi dạy** nếu nội dung có một dòng tiêu đề là:

- `BÁO CÁO ĐẦU BUỔI DẠY` hoặc có ý nghĩa tương tự -> báo cáo đầu buổi dạy (`loaiBaoCao = DauBuoi`)
- `BÁO CÁO CUỐI BUỔI DẠY` hoặc có ý nghĩa tương tự -> báo cáo cuối buổi dạy (`loaiBaoCao = CuoiBuoi`)

Trong hai loại trên chỉ lấy 8 dòng sau, các dòng khác (`Tên Trợ Giảng`, `Tổng số máy`, `Số lượng HS`, `GV Quản Nhiệm có mặt tại lớp`...) bỏ qua:

| Dòng                          |
| ----------------------------- |
| Tên giáo viên                 |
| Phòng máy                     |
| Tổng số máy bị lỗi            |
| Số máy còn thiếu cho HS       |
| Tình trạng Netsupport         |
| Tình trạng internet           |
| Tình trạng loa, âm ly         |
| Tình trạng máy lạnh, máy quạt |

**Tin nhắn khác.** Mọi tin nhắn không thuộc hai loại trên (tin nhắn thường, ảnh, tin của bot, `BÁO CÁO CHUYÊN MÔN`, `BÁO CÁO CHUYÊN MÔN 2` và các báo cáo loại khác) được ghi vào `output/marks.json` với `maTrangThai = -1` (không phân loại được), không đưa vào `output/output.json`:

```jsonc
[
  { "maNhom": "groupId của tin nhắn", "maTinNhan": "msgId của tin nhắn", "maTrangThai": -1 }
]
```

### Định dạng đầu ra `output/output.json`

Mỗi tin nhắn báo cáo được biến đổi thành:

```jsonc
{
	"maTinNhan": "...", // lấy từ `msgId`
	"maNguoiGui": "...", // lấy từ `senderId`
	"maNhom": "...", // lấy từ `groupId`
	"thoiGian": 0, // lấy từ `ts` (mili giây)
	"loaiBaoCao": "DauBuoi|CuoiBuoi", // DauBuoi = báo cáo đầu buổi, CuoiBuoi = báo cáo cuối buổi
	// quy tắc trích xuất được mô tả ở dưới
	"data": {
		"maTrangThai": 1, // trạng thái của báo cáo, mặc định là 1
		"maPhong": 399, // Room.Id tra từ DB (xem mục "maPhong"), null nếu không tìm thấy phòng
		// Tên trường học
		"truong": {
			"capHoc": "mã cấp học",
			"tenRieng": "tên riêng",
			"coSo": "tên cơ sở"
		},
		"khuVuc": "tên khu vực",
		"phongMay": "tên phòng máy",
		"giaoVien": "tên giáo viên",
		// Thông tin tình trạng cơ sở vật chất
		"coSoVatChat": [
			{ "loai": "AmThanh", "xepLoai": "T|B|K" },
			{ "loai": "NetSupport", "xepLoai": "T|B|K" },
			{ "loai": "MayLanh", "xepLoai": "T|B|K" },
			{ "loai": "Internet", "xepLoai": "T|B|K" },
			{
				"loai": "MayTinh",
				"xepLoai": "A|B|C|D",
				"soLuong": [
					{ "loai": "Thieu", "so": 1 }, // số lượng máy thiếu
					{ "loai": "Loi", "so": 1, "ghiChu": "Tình trạng cụ thể" } // số lượng máy lỗi
				]
			}
		]
	}
}
```

Kết quả được ghi đè vào `output/output.json` (UTF-8, không BOM). Nếu không có tin nhắn báo cáo hợp lệ thì `output.json` là mảng rỗng `[]`; bước 5 tự bỏ qua và chuyển sang bước 6.

### Quy tắc trích xuất trường `data`

#### `truong` - Tên trường học và `khuVuc` - Tên khu vực

Chuyển giá trị `groupName` qua skill `school-and-area-extraction` để xử lý. Kết quả `level`, `baseName`, `branch`, `area` của skill đó lần lượt gán vào `capHoc`, `tenRieng`, `coSo`, `khuVuc`.

#### `phongMay` - Tên phòng máy

- Lấy từ dòng `Phòng máy`, giữ nguyên tên phòng như giáo viên viết (kể cả tiền tố `PM`), chỉ loại bỏ các từ thừa như "Phòng", "Phòng máy" đứng trước tên, và bỏ qua các thông tin ghi chú.
- Nếu `phongMay` là `null` hoặc `""` thì gán `maTrangThai` thành `2`.

| Ví dụ                                | phongMay | maTrangThai |
| ------------------------------------ | -------- | ----------- |
| Phòng máy: PM1                       | "PM1"    | 1           |
| Phòng máy: Phòng Lab                 | "Lab"    | 1           |
| Phòng máy: PM1 (Trường)              | "PM1"    | 1           |
| Phòng máy: PM2 (Phòng 42 của trường) | "PM2"    | 1           |
| Phòng máy:                           | ""       | 2           |
| Thiếu dòng `Phòng máy`               | null     | 2           |

- Nếu dòng `Phòng máy` có tên cơ sở của trường (thường viết tắt là "CS") thì ghi đè vào `truong.coSo`.
- Nếu dòng `Phòng máy` có tên cơ sở nhưng không có tên phòng máy thì `phongMay` mặc định là "PM1".
- `phongMay` giữ nguyên chữ `PM` để hiển thị; riêng khi tra `maPhong` trong DB script bỏ tiền tố `PM` (`PM1` thành `1`) vì bảng `Room` lưu tên không có `PM`.

| Ví dụ                | phongMay | truong.coSo |
| -------------------- | -------- | ----------- |
| Phòng máy: PM1 - CS2 | "PM1"    | "CS2"       |
| Phòng máy: CS2       | "PM1"    | "CS2"       |

#### `giaoVien` - Tên giáo viên dạy chính

- Lấy từ dòng `Tên giáo viên`.
- Nếu `giaoVien` là `null` hoặc `""` thì gán `maTrangThai` thành `2`.

| Ví dụ                       | giaoVien       | maTrangThai |
| --------------------------- | -------------- | ----------- |
| Tên giáo viên: Nguyễn Thị A | "Nguyễn Thị A" | 1           |
| Tên giáo viên:              | ""             | 2           |
| Thiếu dòng `Tên giáo viên`  | null           | 2           |

#### `coSoVatChat[].loai != "MayTinh"` - Cơ sở vật chất (trừ máy tính)

| Dòng                          | loai         |
| ----------------------------- | ------------ |
| Tình trạng Netsupport         | "NetSupport" |
| Tình trạng loa, âm ly         | "AmThanh"    |
| Tình trạng máy lạnh, máy quạt | "MayLanh"    |
| Tình trạng internet           | "Internet"   |

- `xepLoai` bằng chính thông tin ở phía sau dấu `:`.
- Nếu `xepLoai` là `t`, `b`, `k` thì viết hoa.
- Nếu `xepLoai` không phải một trong ba ký tự `T`, `B`, `K` thì gán `maTrangThai` thành `2`.

| Ví dụ                                      | loai         | xepLoai   | maTrangThai |
| ------------------------------------------ | ------------ | --------- | ----------- |
| Tình trạng loa, âm ly: T                   | "AmThanh"    | "T"       | 1           |
| Tình trạng Netsupport: B                   | "NetSupport" | "B"       | 1           |
| Tình trạng máy lạnh, máy quạt: k           | "MayLanh"    | "K"       | 1           |
| Tình trạng internet:                       | "Internet"   | ""        | 2           |
| Tình trạng internet: Ổn định               | "Internet"   | "Ổn định" | 2           |
| Thiếu dòng `Tình trạng máy lạnh, máy quạt` | "MayLanh"    | null      | 2           |

#### `coSoVatChat[].loai = "MayTinh"` - Máy tính

- `soLuong[loai = "Thieu"].so` lấy phần số từ dòng `Số máy còn thiếu cho HS` (gọi tắt là `Thieu`).
- `soLuong[loai = "Loi"].so` lấy phần số từ dòng `Tổng số máy bị lỗi` (gọi tắt là `Loi`).
- `soLuong[loai = "Loi"].ghiChu` lấy phần ghi chú trong `()` nằm phía sau phần số của dòng `Tổng số máy bị lỗi` (gọi tắt là `GhiChuLoi`).
- `xepLoai` tính theo bảng:

| Thieu | Loi    | xepLoai |
| ----- | ------ | ------- |
| 0     | 0      | "A"     |
| 0     | 1 -> 5 | "B"     |
| 0     | 6 -> 9 | "C"     |
| 0     | >= 10  | "D"     |
| > 0   | 0      | "C"     |
| > 0   | 1 -> 5 | "C"     |
| > 0   | 6 -> 9 | "C"     |
| > 0   | >= 10  | "D"     |

- Nếu dòng `Số máy còn thiếu cho HS` không chứa số thì `Thieu = null`.
- Nếu dòng `Tổng số máy bị lỗi` không chứa số thì `Loi = null`.
- Nếu `Thieu` hoặc `Loi` là `null` thì `xepLoai = null`.
- Nếu `xepLoai` là `null` thì gán `maTrangThai` thành `2`.

| Ví dụ                                                                 | Thieu | Loi  | xepLoai | maTrangThai |
| --------------------------------------------------------------------- | ----- | ---- | ------- | ----------- |
| Số máy còn thiếu cho HS: 0; Tổng số máy bị lỗi: 0                     | 0     | 0    | "A"     | 1           |
| Số máy còn thiếu cho HS: 0; Tổng số máy bị lỗi: 1                     | 0     | 1    | "B"     | 1           |
| Số máy còn thiếu cho HS: 0; Tổng số máy bị lỗi: 7                     | 0     | 7    | "C"     | 1           |
| Số máy còn thiếu cho HS: 0; Tổng số máy bị lỗi: 10                    | 0     | 10   | "D"     | 1           |
| Số máy còn thiếu cho HS: 1; Tổng số máy bị lỗi: 0                     | 1     | 0    | "C"     | 1           |
| Số máy còn thiếu cho HS: 1; Tổng số máy bị lỗi: 1                     | 1     | 1    | "C"     | 1           |
| Số máy còn thiếu cho HS: 1; Tổng số máy bị lỗi: 7                     | 1     | 7    | "C"     | 1           |
| Số máy còn thiếu cho HS: 1; Tổng số máy bị lỗi: 10                    | 1     | 10   | "D"     | 1           |
| Số máy còn thiếu cho HS: ; Tổng số máy bị lỗi: 10                     | null  | 10   | null    | 2           |
| Số máy còn thiếu cho HS: 3; Tổng số máy bị lỗi:                       | 3     | null | null    | 2           |
| Số máy còn thiếu cho HS: ; Tổng số máy bị lỗi:                        | null  | null | null    | 2           |
| Số máy còn thiếu cho HS: 3; Thiếu dòng `Tổng số máy bị lỗi`           | 3     | null | null    | 2           |
| Thiếu dòng `Số máy còn thiếu cho HS`; Tổng số máy bị lỗi: 3           | null  | 3    | null    | 2           |
| Thiếu dòng `Số máy còn thiếu cho HS`; Thiếu dòng `Tổng số máy bị lỗi` | null  | null | null    | 2           |

| Ví dụ                                                      | Loi | GhiChuLoi                          |
| ---------------------------------------------------------- | --- | ---------------------------------- |
| Tổng số máy bị lỗi: 0                                      | 0   | null                               |
| Tổng số máy bị lỗi: 0 ()                                   | 0   | ""                                 |
| Tổng số máy bị lỗi: 4 (máy 23, 31, 33, 34 không lên nguồn) | 4   | máy 23, 31, 33, 34 không lên nguồn |

(Bản cũ ghi nhầm `Faulty = 0` ở dòng ví dụ cuối, đã sửa thành 4.)

### Bổ sung từ dữ liệu thật

- Dòng báo cáo có thể có tiền tố `- ` hoặc không có tiền tố (chỉ thụt dòng). Bỏ tiền tố trước khi khớp nhãn.
- Nhãn khớp không phân biệt hoa thường (`Tên Giáo Viên`, `Tên giáo viên`) và chịu được thiếu dấu cách sau `:` (ví dụ `Internet:T`).
- `Tổng số máy bị lỗi: IT bảo trì` không có số nên `Loi = null`, `xepLoai = null`, `maTrangThai = 2`.
- `Tổng số máy bị lỗi: 3(máy 35 ...)` không có dấu cách trước ngoặc, vẫn lấy `Loi = 3` và `GhiChuLoi`.
- `Phòng máy: H002` giữ nguyên `"H002"`, `Phòng máy: PM1` giữ nguyên `"PM1"`: không được bỏ chữ `PM` vì người dùng cần thấy đúng như trong tin nhắn Zalo.
- `giaoVien` giữ đúng như người báo cáo viết (ví dụ `V.Minh`, `Tr. Hiếu`), không tự viết đầy đủ.
- Tin nhắn có tiêu đề như `Báo cáo` kèm nội dung khác (ví dụ `GV bàn giao PM lại cho bộ phận IT`) không phải báo cáo đầu/cuối buổi, gán `-1`.
- `maTrangThai` cuối cùng của mỗi báo cáo cũng được ghi vào `output/marks.json`, cùng với các tin nhắn `-1`.
- Nếu `maPhong` là `null` (phòng không có trong DB) thì gán `maTrangThai` thành `2`.

## Script trích xuất và agent giám sát

Script `extractLessonReports.ts` (lệnh `extract:reports`) thực hiện toàn bộ các quy tắc trích xuất ở trên. Bạn (agent) không tự trích xuất mà **đọc kết quả, đối chiếu với tin nhắn gốc và sửa** những chỗ script làm sai hoặc không chắc chắn.

Lệnh: `npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]`
- `--day`: ngày cần xử lý theo giờ Việt Nam, mặc định hôm nay. Người dùng nói ngày khác thì thêm tham số này, và thêm `--day` cho cả bước 5 (để đặt tên file Excel).
- `--buoi`: buổi cần xử lý (`sang`, `chieu` hoặc `toi`), mặc định là buổi của thời điểm chạy.
- `--no-db`: bỏ qua bước tra `maPhong` từ DB (dùng khi không có kết nối DB).

Kết quả trong `output/` (luôn ghi đủ bốn file, kể cả khi rỗng) và bản tóm tắt in ra màn hình (số tin đã xét, số báo cáo, số tin bỏ qua, số mục cần xem theo từng lý do):
- `output.json`: các báo cáo hợp lệ, đúng định dạng ở mục "Định dạng đầu ra `output/output.json`", có thêm `data.maPhong`.
- `marks.json`: `maTrangThai` của mọi tin nhắn đã xét (báo cáo hợp lệ và các tin `-1`).
- `review.json`: các báo cáo cần bạn xem.
- `meta.json`: `{ "day", "buoi" }` của lần chạy, để `fill:report` đặt tên file Excel.

### `maPhong`

`maPhong` là `Room.Id` script tra bằng hàm SQL `dbo.fn_LookupRoomIds` (một lần cho cả lô), dựa trên `truong`, `khuVuc` và `phongMay`. Khi tra, script bỏ tiền tố `PM` khỏi tên phòng (`PM1` thành `1`) vì bảng `Room` lưu tên không có `PM`; `phongMay` trong `output.json` và trong Excel vẫn giữ đúng chữ trong tin nhắn. Không tìm thấy phòng thì `maPhong = null` và `maTrangThai = 2`.

### `review.json` và các lý do

Mỗi mục gồm:

```jsonc
{
  "key": { "maNhom": "...", "maTinNhan": "..." },
  "lyDo": ["so_khong_hop_le"],       // danh sách, một báo cáo có thể có nhiều lý do
  "raw": "BÁO CÁO CUỐI BUỔI DẠY\n- Tên Giáo Viên: ...", // nguyên văn tin nhắn
  "draft": { /* kết quả script, cùng định dạng output.json; null nếu chưa xác định là báo cáo */ },
  "truongCanXem": ["loi"]            // các trường nghi ngờ
}
```

| `lyDo` | Ý nghĩa | Việc cần làm |
|---|---|---|
| `so_khong_hop_le` | `Tổng số máy bị lỗi` hoặc `Số máy còn thiếu cho HS` là chữ (ví dụ `IT bảo trì`) | Thường để nguyên (`maTrangThai = 2` là đúng). Chỉ sửa nếu tin nhắn thật sự có số mà script bỏ sót |
| `thieu_dong` | Báo cáo thiếu một trong 8 dòng cần lấy | Xem `raw`: nếu dòng có nhưng nhãn viết khác thường thì sửa; nếu thật sự thiếu thì để nguyên |
| `khong_nhan_ra_nhan` | Có dòng giống một trong 8 dòng cần lấy nhưng nhãn lạ (không thuộc nhóm dòng bỏ qua đã biết) | Xem `raw` và sửa giá trị tương ứng |
| `gan_giong_tieu_de` | Tin nhắn nhắc tới báo cáo đầu/cuối buổi nhưng tiêu đề không chuẩn | Nếu đúng là báo cáo thì sửa `loaiBaoCao`; nếu không thì để nguyên (giữ `-1`) |
| `phong_khong_tim_thay` | `fn_LookupRoomIds` không tìm ra phòng | Xem tên phòng có sai chính tả không (sửa `phongMay`); phòng thật sự không có trong DB thì để nguyên |
| `truong_khong_nhan_ra` | Không xác định được trường hoặc khu vực từ tên nhóm | Sửa `truong` và `khuVuc` |

### Cách sửa: `output/overrides.json`

Với từng mục, **đối chiếu `draft` với `raw`** rồi quyết định. Để sửa, ghi `output/overrides.json` (UTF-8) là mảng các mục `{ "key": { "maNhom", "maTinNhan" }, "sua": { ... } }`, sau đó **chạy lại bước 3**. Ví dụ:

```jsonc
[
  { "key": { "maNhom": "g5639872021926770946", "maTinNhan": "8298999766806" }, "sua": { "loi": 5, "ghiChuLoi": "IT đang sửa" } },
  { "key": { "maNhom": "g1678576816767086349", "maTinNhan": "8298341740803" }, "sua": { "loaiBo": true } }
]
```

Khi ghi `overrides.json`, ghi **cả mảng**: các mục đã có cộng mục mới. Ghi đè chỉ bằng mục mới sẽ làm mất các sửa trước đó và lần chạy lại sẽ trả kết quả về như chưa sửa. Mỗi mục gắn với một tin nhắn cụ thể nên giữ lại không ảnh hưởng buổi khác.

Chỉ ghi các trường **thô** cần sửa; script luôn tự tính lại `xepLoai` của máy tính và `maTrangThai` theo đúng các quy tắc ở trên, nên bạn **không được ghi hai giá trị này**. Các trường được phép trong `sua`: `loaiBo` (true để loại tin nhắn khỏi báo cáo, gán `-1`), `loaiBaoCao` (`DauBuoi` hoặc `CuoiBuoi`), `phongMay`, `giaoVien`, `truong` (`{ "capHoc", "tenRieng", "coSo" }`), `khuVuc`, `thieu`, `loi` (số), `ghiChuLoi`, `amThanh`, `netSupport`, `mayLanh`, `internet` (`T`, `B` hoặc `K`). Mục có `key` không tồn tại trong dữ liệu bị script bỏ qua và cảnh báo.

Ngoài các mục trong `review.json`, hãy kiểm tra nhanh vài báo cáo trong `output.json` so với tin nhắn gốc trong `data/<groupId>.json` để chắc script không sai âm thầm. Đừng sửa để "làm cho đầy đủ": nếu tin nhắn gốc thật sự không có số máy lỗi thì để trống (`maTrangThai = 2`), không tự điền.

## Bảng mã

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

`StatusId` của `Zalo_CrawlMessage`: `-1` không phân loại được, `0` phân loại được nhưng không trường/phòng nào khớp DB, `1` phân loại được và khớp toàn bộ, `2` phân loại được nhưng chỉ khớp một phần, `3` phân loại được nhưng không có thông tin nào. Skill này chỉ ghi `-1`, `1` và `2`.

## Điền file Excel mẫu (bước 5)

Lệnh: `npm run fill:report -- output/output.json [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--template <đường dẫn>]` (ngày và buổi lấy từ `output/meta.json` nếu không truyền)

- File mẫu: `../templates/Temp_RoomFacility_rpt.xlsm` (so với `zca-scrape-message/`). Không bao giờ sửa bản gốc; script làm việc trên bản sao.
- Kết quả: `data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm` (ví dụ `baocaobuoisang_250926.xlsm`; ghi đè nếu trùng ngày và buổi), đã điền dữ liệu và đã chạy macro nên 5 bảng báo cáo (MAY TINH, INTERNET, NETSUPPORT, LOA, MAY LANH) có dữ liệu.
- Cần cài Microsoft Excel và cho phép file mẫu chạy macro (không bị chặn do tải từ Internet).
- Cách làm: script dựng các dòng phẳng cho sheet `data`, mở bản sao bằng Excel (PowerShell COM) với sự kiện tắt, ghi sheet `data` từ ô `A2`, bật lại sự kiện rồi gọi `ThisWorkbook.Workbook_Open` để macro của file mẫu điền 5 bảng. Việc điền 5 bảng nằm trong `Workbook_Open` (chỉ chạy khi cả 5 bảng còn trống); `WriteData` chỉ là hàm phụ có tham số, không gọi trực tiếp được.
- Báo cáo có `maPhong = null` bị bỏ qua (không đưa vào sheet `data`), vì macro gộp mọi dòng có `RoomId` trống của một ngày thành một dòng.
- Với mỗi cặp (ngày, `RoomId`) macro chỉ giữ báo cáo có `Timestamp` lớn nhất, nên bảng báo cáo hiển thị báo cáo mới nhất của phòng trong ngày.

### Cột sheet `data`

Đúng thứ tự, đã có sẵn ở hàng 1 của file mẫu: `Id`, `MessageId`, `SenderId`, `GroupId`, `Timestamp`, `Date`, `Time`, `TypeId`, `Employee`, `RoomId`, `School`, `Area`, `Room`, `FacilityId`, `FacilityTypeId`, `FacilityGrade`, `FacilityNote`, `QuantityTypeId`, `Quantity`, `QuantityNote`.

Dạng phẳng: một dòng cho mỗi cặp (cơ sở vật chất, số lượng) của một báo cáo. Một báo cáo có 5 cơ sở vật chất thì có 5 dòng; riêng máy tính có 2 dòng số lượng (thiếu, lỗi) nên tạo 2 dòng, các dòng còn lại để trống ba cột `QuantityTypeId`, `Quantity`, `QuantityNote`. Các cột của báo cáo (`Id`, `MessageId`, `SenderId`, `GroupId`, `Timestamp`, `Date`, `Time`, `TypeId`, `Employee`, `RoomId`, `School`, `Area`, `Room`) lặp lại trên mọi dòng của báo cáo đó.

Cách điền:
- `Id`: GUID mới cho mỗi báo cáo. `FacilityId`: GUID mới cho mỗi cơ sở vật chất, các dòng cùng cơ sở vật chất dùng chung.
- `MessageId`, `SenderId`, `GroupId`, `Timestamp`: từ `maTinNhan`, `maNguoiGui`, `maNhom`, `thoiGian`.
- `Date`, `Time`: tách từ `Timestamp` theo giờ Việt Nam (`Date` là số ngày kiểu Excel, `Time` là phần thập phân của ngày). `Timestamp` và `Date` phải là số vì macro đọc bằng `CDbl`.
- `TypeId`, `FacilityTypeId`, `QuantityTypeId`: theo "Bảng mã".
- `Employee`: `giaoVien`. `RoomId`: `maPhong`.
- `School`: tên trường dạng `LC HOA SEN 1` (ghép `capHoc`, `tenRieng`, thêm `coSo` nếu có). `Area`: mã khu vực như skill `school-and-area-extraction` trả về (`TĐ`, `BTAN`...). `Room`: `phongMay` giữ đúng như người báo cáo viết.
- `FacilityGrade`: `xepLoai`. `FacilityNote`: để trống. `QuantityNote`: `GhiChuLoi`.

## `markMessages.ts` (bước 6)

Đầu vào: `output/marks.json`, dạng `[{ "maNhom": "...", "maTinNhan": "...", "maTrangThai": 1 }]` (script trích xuất ghi file này, gồm cả tin nhắn được phân loại `-1`).

Việc làm: với mỗi phần tử, cập nhật `StatusId = <maTrangThai>` và `HasRead = 1` cho dòng có `GroupId` và `MessageId` khớp trong `Zalo_CrawlMessage`. Chạy trong một transaction, lỗi thì rollback. Mặc định là chạy thật; thêm `--dry-run` để chỉ in ra, không ghi DB. In ra số dòng đã cập nhật và cảnh báo nếu có phần tử không tìm thấy dòng.

## Xử lý lỗi

- Lỗi cào hoặc kết nối DB ở bước 1, 2: dừng và báo.
- Hàng chờ rỗng (bước 1 in `hàng chờ rỗng`): không phải lỗi; tiếp tục bước 2–6 với dữ liệu đã có. Bước 3 in `xét 0 tin` thì dừng và báo "không có tin nhắn trong buổi này".
- Bước 1 in `sidebar item ... not found` hoặc `no messages found`: nhóm đó có thể chưa được cào (lệnh vẫn thoát mã 0). Nêu trong thông báo cuối; không tự coi là đã đủ dữ liệu.
- Không có tin nhắn báo cáo hợp lệ: `output.json` là `[]`, không tạo Excel, vẫn đánh dấu các tin nhắn khác là `-1`.
- `output/overrides.json` sai định dạng: script báo lỗi kèm tên file, sửa lại file rồi chạy lại bước 3.
- Excel không cài, macro bị chặn hoặc file đích đang mở: bước 5 thoát với lỗi và in nguyên nhân; đóng file rồi chạy lại.
- `markMessages` không tìm thấy dòng cho một `maNhom` + `maTinNhan`: cảnh báo, các dòng khác vẫn cập nhật.

## Giới hạn đã biết

Nêu cho người dùng khi liên quan:

- Bảng báo cáo chỉ hiện báo cáo **mới nhất** của mỗi phòng trong ngày và thay thế hoàn toàn báo cáo cũ (không gộp): báo cáo cuối buổi ghi `IT bảo trì` sẽ để trống xếp loại máy tính dù báo cáo đầu buổi có số. Sheet `data` vẫn giữ đủ mọi báo cáo.
- Tin nhắn được **sửa hoặc thu hồi** sau khi đã cào không được cập nhật (dữ liệu khử trùng theo `msgId`, chưa theo dõi thu hồi).
- Chỉ tin từ mốc `config.sinceTs` (mặc định 06:00 hôm nay) mới được cào; tin trước mốc đó hoặc của ngày trước lần cào không có trong dữ liệu.
- Buổi tính theo **giờ gửi tin**: báo cáo cuối buổi sáng gửi sau 12:00 thuộc buổi chiều.
- Báo cáo có `maPhong = null` không vào Excel (chỉ vào `review.json`).
- Nhịp tim chỉ chứng minh `bot:watch` còn sống và hai nguồn phát hiện còn kết nối; nó không biết được tin nào đã lỡ. Việc khôi phục chỉ cào lại nhóm đang **thiếu** báo cáo trong buổi có gián đoạn, nên một nhóm đã có báo cáo đầu buổi mà báo cáo thứ hai của cùng loại bị lỡ thì không được phát hiện.
- Kết quả chỉ nằm trong file Excel và `Zalo_CrawlMessage`; không ghi vào các bảng báo cáo `Technical_*`.

## Kiểm thử

- Chạy `npm test` (unit test của phần trích xuất).
- Chạy `extract:reports` trên các file JSON hiện có, so sánh với các báo cáo thật trong `data/<groupId>.json`.
- Chạy `fill:report`, mở file `.xlsm` kiểm tra sheet `data` (20 cột) và 5 bảng báo cáo đã được macro điền.
- Chạy `mark:messages` với `--dry-run` (in ra, không ghi DB) trước khi chạy thật.

## Quyết định đã chốt

1. Script trích xuất toàn bộ, agent đọc và giám sát (thay cho việc agent tự trích xuất).
2. File mẫu dùng bản trong `templates/`; script tự chạy macro của file mẫu sau khi điền sheet `data`.
3. `School` và `Area` điền tên (không điền ID).
4. Hai bot phối hợp qua hàng chờ: `bot:watch` chỉ phát hiện tin mới và ghi tên nhóm vào `data/.scrape-queue.json`; `bot:scrape` cào các nhóm trong hàng chờ.
5. Mỗi lần chạy chỉ xử lý một buổi của một ngày; mỗi buổi một file Excel `baocaobuoi<buoi>_<ddMMyy>.xlsm`. Tạm thời bỏ qua ảnh.

## Giả định còn lại

1. Khoảng thời gian mặc định là ngày hiện tại (giờ Việt Nam).
2. Ranh giới các buổi: sáng trước 12:00, chiều 12:00–17:59, tối từ 18:00 (chưa được người dùng xác nhận).
3. `Area` điền mã khu vực như `TĐ`, `BTAN` (không đổi sang tên đầy đủ như "Thủ Đức").
4. Báo cáo có phòng không tìm thấy trong DB (`maPhong = null`) bị loại khỏi Excel và có `maTrangThai = 2` (người dùng đã xác nhận).
