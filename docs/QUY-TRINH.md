# Quy trình báo cáo buổi dạy

Tài liệu mô tả chi tiết cách hệ thống biến tin nhắn báo cáo đầu/cuối buổi dạy trong các nhóm Zalo thành file Excel báo cáo theo từng buổi. Muốn cài đặt và chạy tự động với agent, xem [GUIDE.md](GUIDE.md). Các quy tắc trích xuất từng trường nằm ở skill `Teach-lesson-skills-V2/SKILL.md`; bản thiết kế gốc nằm ở `docs/superpowers/specs/`.

## 1. Tổng quan

Đầu vào là tin nhắn Zalo của giáo viên trong các nhóm (ví dụ `LC_HoaSen1_TĐ`). Đầu ra là một file Excel cho **một buổi của một ngày**, ví dụ buổi sáng 25/09/2026:

```
data/export/baocaobuoisang_250926.xlsm
```

Hệ thống gồm hai bot và một agent:

| Thành phần | Vai trò | Ghi vào đâu |
|---|---|---|
| `bot:watch` | Đứng chạy liên tục, chỉ **phát hiện** nhóm nào có tin mới | `data/.scrape-queue.json` (hàng chờ) |
| `bot:scrape` | Chạy khi cần, chỉ cào các nhóm đang trong hàng chờ | `data/<groupId>.json` |
| Script trích xuất và điền Excel | Làm toàn bộ việc trích xuất, tra DB, điền Excel | `output/`, `data/export/` |
| Agent (OpenClaw) | Điều phối các lệnh, đọc và giám sát kết quả, sửa nếu cần | `output/overrides.json` |

```
  Zalo Desktop
      │  (WebSocket + popup thông báo)
      ▼
  bot:watch ──ghi tên nhóm──▶ data/.scrape-queue.json
                                     │
                                     ▼
                            bot:scrape (đọc hàng chờ)
                                     │  cào đúng các nhóm đó
                                     ▼
                            data/<groupId>.json
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
        sync:db --apply                          extract:reports --buoi X
   (tin thô ─▶ Zalo_CrawlMessage)             (script trích xuất + tra RoomId)
                                                         │
                                       output/{output,marks,review,meta}.json
                                                         │
                                        agent xem review.json ─ sửa ─▶ overrides.json
                                                         │ (chạy lại extract:reports)
                                                         ▼
                                              fill:report (Excel + macro)
                                                         │
                                       data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm
                                                         │
                                       mark:messages (StatusId, HasRead ─▶ DB)
```

## 2. Khái niệm cần biết

**Buổi.** Mỗi lần chạy chỉ xử lý tin nhắn của một buổi, tính theo giờ gửi tin (giờ Việt Nam):

| Buổi | Giá trị `--buoi` | Khoảng giờ |
|---|---|---|
| Sáng | `sang` | 00:00–11:59 |
| Chiều | `chieu` | 12:00–17:59 |
| Tối | `toi` | 18:00–23:59 |

Không truyền `--buoi` thì dùng buổi của thời điểm chạy. Khi chạy theo lịch, luôn truyền tường minh.

**Ngày.** `--day YYYY-MM-DD`, mặc định hôm nay theo giờ Việt Nam.

**Tin nhắn báo cáo.** Tin có dòng đầu là `BÁO CÁO ĐẦU BUỔI DẠY` hoặc `BÁO CÁO CUỐI BUỔI DẠY`. `BÁO CÁO CHUYÊN MÔN`, tin thường, ảnh và tin của bot không phải báo cáo (`StatusId = -1`).

**`StatusId` / `maTrangThai`.**

| Giá trị | Ý nghĩa |
|---|---|
| `-1` | Không phải báo cáo đầu/cuối buổi |
| `1` | Báo cáo đầy đủ và phòng khớp DB |
| `2` | Báo cáo có thiếu hoặc sai một phần, hoặc phòng không có trong DB |

**Hàng chờ.** File `data/.scrape-queue.json` là mảng tên nhóm (đúng như trong `config.targets`), không trùng. `bot:watch` chỉ thêm vào; `bot:scrape` chụp lại hàng chờ, cào, rồi xóa đúng những nhóm vừa xử lý. Nhóm được thêm trong lúc đang cào vẫn còn cho lần sau.

## 3. Các bước chạy

Mọi lệnh chạy trong thư mục `zca-scrape-message/`.

### Bước 0 — `bot:watch` chạy nền

```
npm run bot:watch
```

Chạy liên tục. Khi Zalo Desktop có tin mới ở một nhóm trong `config.targets`, nó in `[watch] queued "<tên nhóm>"` và thêm nhóm vào hàng chờ. Nó **không** mở giao diện Zalo và không cào. Khởi động sẽ tắt và mở lại Zalo Desktop để quan sát được kết nối WebSocket.

### Bước 1 — Cào tin nhắn

```
npm run bot:scrape
```

- Đọc hàng chờ. **Hàng chờ rỗng** thì in `[scrape] hàng chờ rỗng, không có gì để cào.`, thoát ngay và không đụng Zalo Desktop.
- Nếu có nhóm: mở Zalo Desktop (khởi động lại nếu cổng debug chưa mở), mở từng nhóm, cuộn lấy lịch sử, ghi vào `data/<groupId>.json` (khử trùng theo `msgId`), rồi xóa các nhóm đã xử lý khỏi hàng chờ.
- Chỉ lấy tin từ mốc `config.sinceTs` (mặc định 06:00 hôm nay) và tối đa `config.targetMessageCount` tin mỗi nhóm.
- Nhóm lỗi hoặc không có tin vẫn bị xóa khỏi hàng chờ và được ghi log; lệnh thoát mã 1 nếu có nhóm lỗi. Không kết nối được Zalo Desktop thì không xóa gì.

### Bước 0 và 1b — Kiểm tra `bot:watch` và khôi phục khi bị gián đoạn

`bot:watch` chỉ phát hiện được tin khi nó đang chạy. Khi nó chết, tin đến mà không nhóm nào vào hàng chờ. Để biết **khi nào** nó ngừng và **tin nào** có thể đã lỡ, hệ thống để lại bằng chứng:

| File | Nội dung |
|---|---|
| `data/.watch-state.json` | Nhịp tim mỗi 30 giây: `pid`, giờ khởi động, lần đập cuối, trạng thái hai nguồn (WebSocket, thông báo), lần phát hiện gần nhất và tổng số lần |
| `data/.watch-gaps.json` | Mọi khoảng `bot:watch` không lắng nghe: `crash` (chết đột ngột), `stopped` (dừng có chủ ý), `blind` (còn sống nhưng mất cả hai nguồn từ 1 phút trở lên), `fatal` (thoát vì lỗi nghiêm trọng), `unknown` (chưa có dữ liệu) |
| `output/recovery.json` | Kết quả của lần khôi phục gần nhất |

Chết đột ngột được nhận ra ở hai thời điểm: khi `bot:watch` khởi động lại (thấy trạng thái cũ vẫn là "đang chạy" với nhịp tim đã cũ), hoặc khi kiểm tra lúc nó vẫn chưa được khởi động lại (nhịp tim cũ quá 90 giây). Hệ thống không thể biết tin nào đã lỡ; nó biết **khoảng thời gian** bị lỡ, rồi cào lại để biết chính xác.

```
npm run watch:status [-- --day YYYY-MM-DD --buoi sang|chieu|toi]  # xem bot:watch còn sống không, đã chết lúc nào; có --buoi thì thoát mã 2 nếu có gián đoạn trong buổi
npm run recover:missing -- --day YYYY-MM-DD --buoi sang|chieu|toi [--dry-run]
```

**Agent quyết định bằng mã thoát của bước 0.** Trước khi cào, agent chạy `npm run watch:status -- --day <ngày> --buoi <buổi>`. Mã `0`: không có khoảng gián đoạn nào chồng lên buổi, bỏ qua bước 1b. Mã `2`: log ghi nhận `bot:watch` chết, dừng hoặc mù trong buổi, agent chạy `recover:missing` sau bước 1. Mã `1` (lỗi lệnh): agent coi như không xác định và chạy khôi phục. Nếu `bot:watch` đang không hoạt động ngay lúc chạy, agent nêu trong thông báo cuối là cần khởi động lại, không tự khởi động lại.

`recover:missing`:

1. Lấy các khoảng gián đoạn chồng lên buổi. **Không có khoảng nào thì thoát, không làm gì.**
2. Tìm các nhóm trong `config.targets` (trừ `config.recoveryIgnoreTargets`, mặc định `bot test`) chưa có báo cáo đầu buổi và/hoặc cuối buổi trong buổi đó. Bước này chỉ đọc `data/*.json`.
3. Cào lại **riêng các nhóm đó**, từ 5 phút trước khoảng gián đoạn (không phải mốc 06:00 cố định).
4. So sánh trước và sau: các tin của buổi mới xuất hiện sau lần cào lại chính là **những tin `bot:watch` đã bỏ lỡ**. Lệnh in danh sách (giờ, nhóm, tiêu đề dòng đầu) và các nhóm vẫn thiếu báo cáo, và ghi `output/recovery.json`.

Lệnh thoát mã 1 nếu có nhóm không cào được. Nhóm vẫn thiếu sau khi cào lại không phải lỗi: có thể giáo viên chưa gửi hoặc nhóm không có lớp buổi đó.

### Bước 2 — Đưa tin lên DB

```
npm run sync:db                # chạy thử: chỉ in, không ghi
npm run sync:db -- --apply     # ghi thật
```

Ghi các tin trong `data/*.json` vào bảng `Zalo_CrawlMessage`. Dòng mới có `StatusId = -1`, `HasRead = 0`. Dòng đã có (cùng `GroupId` và `MessageId`) chỉ được làm mới `MessageType` và `Url`, không bị ghi đè `StatusId` hay `HasRead`, nên chạy lại nhiều lần an toàn.

### Bước 3 — Trích xuất

```
npm run extract:reports -- [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--no-db]
```

Đọc mọi `data/<groupId>.json`, chỉ giữ tin của ngày và buổi được chọn. Với mỗi tin:

1. Phân loại theo tiêu đề. Tin không phải báo cáo được ghi `-1`; tin nhắc tới báo cáo đầu/cuối buổi nhưng tiêu đề lạ được ghi `-1` **và** đưa vào `review.json`.
2. Với báo cáo: tách tên nhóm thành `truong` và `khuVuc`, đọc 8 dòng cần lấy, tính xếp loại máy tính và `maTrangThai` (xem mục 5).
3. Tra `maPhong` (`Room.Id`) bằng `dbo.fn_LookupRoomIds`, một lần cho cả lô. Khi tra, bỏ tiền tố `PM` khỏi tên phòng (`PM1` → `1`) vì bảng `Room` lưu `1`, `2`, `H002`. Không tìm thấy phòng: `maPhong = null` và `maTrangThai = 2`.
4. Áp dụng `output/overrides.json` (nếu có) trước khi tính xếp loại và trạng thái.

`--no-db` bỏ qua bước tra `maPhong` (dùng khi không có kết nối DB).

Kết quả trong `output/` (luôn ghi đủ bốn file, kể cả khi rỗng) và bản tóm tắt in ra màn hình:

| File | Nội dung |
|---|---|
| `output.json` | Các báo cáo hợp lệ (đầu vào của bước 5) |
| `marks.json` | `maTrangThai` của mọi tin nhắn đã xét (đầu vào của bước 6) |
| `review.json` | Các báo cáo cần agent xem, kèm nguyên văn tin nhắn |
| `meta.json` | `{ "day", "buoi" }` của lần chạy, để bước 5 đặt tên file |

### Bước 4 — Agent giám sát

Agent đọc bản tóm tắt và `output/review.json`. Mỗi mục có `key`, `lyDo`, `raw` (nguyên văn), `draft` (kết quả của script) và `truongCanXem`. Agent **đối chiếu `draft` với `raw`** rồi quyết định giữ nguyên hoặc sửa.

| `lyDo` | Ý nghĩa | Thường làm |
|---|---|---|
| `so_khong_hop_le` | Số máy lỗi hoặc thiếu là chữ (ví dụ `IT bảo trì`) | Để nguyên (`maTrangThai = 2` là đúng), trừ khi tin có số mà script bỏ sót |
| `thieu_dong` | Thiếu một trong 8 dòng cần lấy | Nếu dòng có nhưng nhãn viết lạ thì sửa; nếu thật sự thiếu thì để nguyên |
| `khong_nhan_ra_nhan` | Dòng giống dòng cần lấy nhưng nhãn lạ | Xem `raw` và sửa giá trị |
| `gan_giong_tieu_de` | Tiêu đề không chuẩn | Đúng là báo cáo thì sửa `loaiBaoCao`; không thì để nguyên (`-1`) |
| `phong_khong_tim_thay` | DB không có phòng này | Sửa `phongMay` nếu sai chính tả; thật sự không có thì để nguyên |
| `truong_khong_nhan_ra` | Không xác định trường hoặc khu vực từ tên nhóm | Sửa `truong` và `khuVuc` |

Để sửa, agent ghi `output/overrides.json` rồi **chạy lại bước 3**:

```json
[
  { "key": { "maNhom": "g5639872021926770946", "maTinNhan": "8298999766806" },
    "sua": { "loi": 5, "ghiChuLoi": "IT đang sửa" } }
]
```

Trường được phép trong `sua`: `loaiBo` (loại tin khỏi báo cáo, gán `-1`), `loaiBaoCao`, `phongMay`, `giaoVien`, `truong` (`{ capHoc, tenRieng, coSo }`), `khuVuc`, `thieu`, `loi` (số), `ghiChuLoi`, `amThanh`, `netSupport`, `mayLanh`, `internet` (`T`/`B`/`K`). Agent **không** ghi `xepLoai` của máy tính hay `maTrangThai`: script luôn tự tính lại. Nếu một `key` không khớp tin nhắn nào, script in `CẢNH BÁO` và bỏ qua mục đó.

### Bước 5 — Điền Excel

```
npm run fill:report -- output/output.json [--day YYYY-MM-DD] [--buoi sang|chieu|toi] [--template <đường dẫn>]
```

Ngày và buổi lấy từ `output/meta.json` nếu không truyền. Script:

1. Dựng các dòng phẳng cho sheet `data` của file mẫu (mục 6). Báo cáo có `maPhong = null` bị bỏ qua.
2. Sao chép `../templates/Temp_RoomFacility_rpt.xlsm` (không sửa bản gốc), mở bằng Excel (PowerShell/COM) với sự kiện tắt, ghi sheet `data` từ ô `A2`, bật lại sự kiện, gọi `ThisWorkbook.Workbook_Open`. Macro của file mẫu điền 5 bảng: MAY TINH, INTERNET, NETSUPPORT, LOA, MAY LANH.
3. Lưu thành `data/export/baocaobuoi<buoi>_<ddMMyy>.xlsm` (ghi đè nếu trùng ngày và buổi). Log ở `output/fill.log`.

Với mỗi phòng trong ngày, macro chỉ hiển thị **báo cáo mới nhất** (theo `Timestamp`), không phải mọi báo cáo. Nếu không có báo cáo nào có `maPhong`, lệnh in thông báo và không tạo file.

### Bước 6 — Cập nhật DB

```
npm run mark:messages -- output/marks.json --dry-run   # chạy thử
npm run mark:messages -- output/marks.json             # ghi thật
```

Với mỗi phần tử của `marks.json`, đặt `StatusId = maTrangThai` và `HasRead = 1` cho dòng `Zalo_CrawlMessage` có `GroupId` và `MessageId` khớp. Chạy trong một transaction (lỗi thì hoàn tác); phần tử không có dòng tương ứng chỉ cảnh báo. Chỉ tin trong buổi đã chọn được cập nhật.

### Bước 7 — Thông báo

Thành công: agent trả đúng một từ `xong`. Có lỗi: trả thông báo lỗi chi tiết (lệnh nào lỗi và thông báo).

Lưu ý về hàng chờ rỗng: khi agent chạy trọn quy trình, hàng chờ rỗng ở bước 1 **không** làm dừng quy trình. Dữ liệu có thể đã được cào từ trước (ví dụ có người chạy `bot:scrape` tay), nên agent vẫn chạy tiếp các bước 2–6 với dữ liệu đã có. Chỉ khi bước 3 báo `xét 0 tin` thì dừng và báo không có tin nhắn trong buổi.

## 3b. Chế độ tự động với `bot:runner`

Các bước 1, 1b, 2, 3, 5, 6 ở trên có thể do `bot:runner` tự làm; khi đó agent chỉ giám sát (xem mục "Chế độ giám sát khi `bot:runner` đang chạy" của skill). Quy trình chạy tay ở trên vẫn dùng được khi runner không chạy.

**Kích hoạt.** `bot:watch` xếp nhóm có tin mới vào hàng chờ (kèm thời điểm, `data/.scrape-queue-meta.json`). Hàng chờ rỗng: runner không làm gì. Có nhóm: runner đợi hàng chờ yên lặng 2 phút (trần 10 phút kể từ nhóm đầu tiên) rồi chạy một vòng. Nếu `bot:watch` chết nên không ai xếp hàng, một khoảng gián đoạn mới chồng lên buổi hiện tại cũng tự kích hoạt một vòng khôi phục.

**Một vòng, theo thứ tự:**

1. Khôi phục nếu `bot:watch` có gián đoạn trong buổi hiện tại (như `recover:missing`).
2. Cào các nhóm trong hàng chờ. Không cào được (Zalo không kết nối) thì vòng lỗi, hàng chờ nguyên.
3. Lưu danh sách buổi cần dựng (buổi của các báo cáo đầu/cuối buổi vừa xuất hiện, cộng buổi còn chờ từ vòng trước) vào `data/.runner-pending.json`, rồi đồng bộ DB.
4. Với mỗi buổi: trích xuất (áp `output/overrides.json`), điền Excel vào tệp tạm rồi đổi tên đè lên `data/export/baocaobuoi<buổi>_<ddMMyy>.xlsm`, rồi `mark:messages`. Dựng thành công thì buổi đó bị xóa khỏi danh sách chờ.
5. Ghi một dòng vào `output/runner-log.jsonl` và cập nhật `data/.runner-state.json`.

**Ghi đè Excel.** Kết quả cuối luôn là một tệp. Nếu tệp đang mở trong Excel thì bản mới lưu thành `..._moi.xlsm`, bản cũ giữ nguyên; vòng sau tệp gốc đã đóng thì tự đè và xóa `_moi`.

**Độ bền.** Runner chết giữa vòng thì buổi chưa dựng vẫn nằm trong danh sách chờ và được dựng ở vòng sau dù không có tin mới. Sau 3 vòng lỗi liên tiếp runner ngừng tự thử (`runner:status` báo `LỖI`), hàng chờ vẫn nguyên; sửa nguyên nhân rồi chạy lại `npm run bot:runner`.

**Xem trạng thái:** `npm run runner:status` (thoát mã 2 nếu runner không sống). **Dựng lại một buổi không cào** (sau khi sửa `overrides.json`): `npm run runner:once -- --day <ngày> --buoi <buổi>`.

## 4. Chạy lại có an toàn không

- `extract:reports` và `fill:report` tạo lại file mỗi lần chạy: cùng ngày và buổi thì ghi đè kết quả cũ.
- `sync:db` không ghi đè `StatusId` và `HasRead` của dòng đã có.
- `mark:messages` ghi đè `StatusId` và `HasRead` theo `marks.json` hiện có. Chạy lại sau khi sửa `overrides.json` sẽ cập nhật trạng thái mới.
- `output/overrides.json` được giữ giữa các lần chạy; mỗi mục gắn với một tin nhắn cụ thể nên không ảnh hưởng các buổi khác.
- File Excel đích đang mở thì `fill:report` báo lỗi; đóng file rồi chạy lại.

## 5. Quy tắc trích xuất tóm tắt

Chỉ lấy 8 dòng: `Tên giáo viên`, `Phòng máy`, `Tổng số máy bị lỗi`, `Số máy còn thiếu cho HS`, `Tình trạng Netsupport`, `Tình trạng internet`, `Tình trạng loa, âm ly`, `Tình trạng máy lạnh, máy quạt`. Các dòng khác (`Tên Trợ Giảng`, `Tổng số máy`, `Số lượng HS`...) bỏ qua. Nhãn không phân biệt hoa thường, dấu, và chịu được thiếu dấu cách sau `:` (`Internet:T`).

| Trường | Quy tắc | `maTrangThai = 2` khi |
|---|---|---|
| `phongMay` | Giữ đúng chữ giáo viên viết (`PM1`, `H002`), bỏ ghi chú trong `()`; `CS<n>` ghi đè `truong.coSo` | Trống hoặc thiếu dòng |
| `giaoVien` | Giữ nguyên chữ người báo cáo viết | Trống hoặc thiếu dòng |
| Loa, NetSupport, máy lạnh, Internet | `T`, `B` hoặc `K` (chữ thường được viết hoa) | Giá trị khác, trống hoặc thiếu dòng |
| Máy tính | `Thieu` và `Loi` lấy số ở đầu giá trị; ghi chú trong `()` sau số; xếp loại theo bảng dưới | Thiếu một trong hai số |
| `maPhong` | Tra từ DB | Không tìm thấy |

Xếp loại máy tính:

| Thieu | Loi | Xếp loại |
|---|---|---|
| 0 | 0 | A |
| 0 | 1–5 | B |
| 0 | 6–9 | C |
| 0 | ≥ 10 | D |
| > 0 | 0–9 | C |
| > 0 | ≥ 10 | D |

`truong` và `khuVuc` tách từ tên nhóm theo skill `school-and-area-extraction` (ví dụ `LC_HoaSen1_TĐ` → cấp `LC`, tên `HOA SEN 1`, khu vực `TĐ`).

## 6. Sheet `data` của file Excel mẫu

20 cột theo đúng thứ tự: `Id`, `MessageId`, `SenderId`, `GroupId`, `Timestamp`, `Date`, `Time`, `TypeId`, `Employee`, `RoomId`, `School`, `Area`, `Room`, `FacilityId`, `FacilityTypeId`, `FacilityGrade`, `FacilityNote`, `QuantityTypeId`, `Quantity`, `QuantityNote`.

Dạng phẳng: mỗi cơ sở vật chất một dòng; máy tính hai dòng (thiếu, lỗi). Các cột của báo cáo lặp lại trên mọi dòng của báo cáo đó. `Id` và `FacilityId` là GUID mới; `Date` là số ngày kiểu Excel; `Time` là phần thập phân của ngày; `School` dạng `LC HOA SEN 1`; `Area` là mã khu vực (`TĐ`, `BTAN`); `Room` giữ nguyên chữ trong tin nhắn.

Bảng mã:

| Nhóm | Giá trị |
|---|---|
| `TypeId` (loại báo cáo) | 1 = đầu buổi, 2 = cuối buổi |
| `FacilityTypeId` | 1 = máy tính, 2 = NetSupport, 3 = Internet, 4 = loa, 5 = máy lạnh |
| `QuantityTypeId` | 1 = số máy thiếu, 2 = số máy lỗi |

## 7. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `bot:scrape` in `hàng chờ rỗng` | `bot:watch` chưa chạy hoặc chưa thấy tin mới | Kiểm tra `bot:watch` đang chạy; xem `data/.scrape-queue.json` |
| Số tin sau khi cào bằng 0, hoặc `sidebar item ... not found` | Zalo cập nhật giao diện, hoặc tên trong `config.targets` lệch tên nhóm | Xem mục "Bảo trì" trong README; sửa `history/scrapeSelectors.ts` hoặc `config.targets` |
| `watch:status` báo `CÓ VẺ ĐÃ CHẾT` | Tiến trình `bot:watch` đã thoát, máy ngủ hoặc khởi động lại | Khởi động lại `npm run bot:watch`; chạy `recover:missing` cho buổi bị ảnh hưởng |
| `watch:status` báo `ĐANG CHẠY NHƯNG MÙ` | Zalo Desktop bị đóng hoặc mất kết nối, cả hai nguồn phát hiện đều mất | Mở lại Zalo Desktop; khởi động lại `bot:watch` |
| `recover:missing` báo nhóm vẫn thiếu | Giáo viên chưa gửi báo cáo, hoặc nhóm không có lớp buổi đó | Nhắc người phụ trách; thêm nhóm không dạy vào `config.recoveryIgnoreTargets` |
| `extract:reports` báo lỗi kết nối DB | Sai `.env`, DB không truy cập được | Chạy `npx tsx dbCheck.ts`; tạm dùng `--no-db` |
| `extract:reports` ra 0 báo cáo | Sai `--day` hoặc `--buoi`, hoặc tin nằm ở buổi khác | Chạy lại với đúng ngày và buổi; kiểm tra `data/<groupId>.json` |
| `output/overrides.json ... is not valid JSON` | File sửa tay bị sai cú pháp | Sửa file; script nêu rõ tên file |
| `CẢNH BÁO: override ... không khớp tin nhắn nào` | Gõ sai `maNhom` hoặc `maTinNhan` | Chép lại `key` từ `review.json` |
| `fill:report` lỗi `being used by another process` | File Excel đích đang mở | Đóng file rồi chạy lại |
| `fill:report` báo macro lỗi hoặc bảng trống | Excel chặn macro, hoặc chưa cài Excel | Xem mục cài đặt trong GUIDE.md |
| Báo cáo không có trong Excel | `maPhong = null` (phòng không có trong DB) | Xem `review.json` (`phong_khong_tim_thay`); sửa `phongMay` nếu sai chính tả |
| Xếp loại máy tính để trống | Số máy lỗi hoặc thiếu không phải số | Bình thường theo quy tắc; sửa bằng `overrides.json` nếu biết số |

## 8. Kiểm tra nhanh

```
npm test                 # unit test của phần trích xuất
npm run typecheck        # kiểm tra kiểu
npm run extract:reports -- --day 2026-09-24 --buoi sang --no-db   # chạy thử trên dữ liệu đã cào
```
