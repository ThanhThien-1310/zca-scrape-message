# Agent đọc ảnh báo cáo (bản chạy thử): thiết kế

Ngày: 2026-10-07. Trạng thái: chờ người dùng duyệt.

## 1. Mục tiêu

Nhân viên kỹ thuật gửi báo cáo kèm ảnh vào nhóm Zalo: một ảnh đo tốc độ mạng (Fast.com) và các ảnh biên bản viết tay (nhiều trang), lẫn với ảnh phòng máy và thiết bị mạng. Hệ thống phải tự động lấy ra **đúng thông tin cần** từ hai loại ảnh đó, kiểm tra dữ liệu, rồi (ở giai đoạn sau) điền vào báo cáo.

Bản này làm **bản chạy thử**: gom ảnh thành từng báo cáo, đọc bằng agent, kiểm tra, ghi kết quả ra đĩa. Chưa nối vào Excel, chưa nối vào `bot:runner`. Mục đích là đo độ chính xác thật (nhất là chữ viết tay) trước khi để dữ liệu chạy vào báo cáo.

Định hướng dài hạn (ghi lại để thiết kế không đi ngược, không làm ở bản này): agent vận hành toàn hệ thống đến **mức 3** (chẩn đoán, hành động an toàn đã định trước, hành động cần người duyệt). Đọc ảnh là dự án con đầu tiên.

## 2. Phạm vi

Trong phạm vi:
- Gom ảnh của một nhóm thành các **bộ ảnh** (mỗi bộ là một báo cáo) và đóng gói vào một thư mục tự chứa.
- **Luật cho từng loại ảnh** viết thành file, dễ thêm và sửa không cần sửa code.
- Mô-đun đọc ảnh có giao diện chung, cách thực hiện đầu tiên là `claude -p` (gói subscription).
- Bước review ba lớp (luật, đọc lần hai độc lập, người xem).
- Ba lệnh: `photos:bundle`, `photos:read`, `photos:review`, cùng bộ đáp án đúng để đo độ chính xác.

Ngoài phạm vi (làm ở các giai đoạn sau, mỗi giai đoạn có thiết kế riêng):
- Bước đọc ảnh trong chu trình `bot:runner`, hai loại báo cáo mới và file mẫu Excel.
- Cách đọc bằng API (`@anthropic-ai/sdk`) thay `claude -p` khi chạy thật 24/24.
- Agent vận hành mức 0 đến 3, trang quản trị, định nghĩa loại báo cáo trong DB.

## 3. Khái niệm

- **Bộ ảnh (bundle):** các ảnh của cùng một báo cáo. Một báo cáo có thể là một album hoặc nhiều ảnh gửi riêng lẻ liên tục.
- **Luật ảnh (rule):** mô tả một loại nội dung ảnh: cách nhận ra, các trường cần lấy, luật kiểm tra.
- **Kết quả đọc (reading):** thông tin agent lấy ra từ một bộ, mỗi trường có độ tin cậy.
- **Review:** kết quả kiểm tra kết quả đọc, có trạng thái `tu_dong_dat`, `can_xem`, `da_xac_nhan`, `da_sua`.

## 4. Thư mục

Kho ảnh gốc **không đổi**: `data/images/<mã nhóm>/<mã tin>.<đuôi>`. Đường dẫn này nằm trong trường `url` của từng tin và được phần đồng bộ DB cùng skill dùng.

Thêm thư mục dẫn xuất, sinh bằng `photos:bundle`:

```
data/photo-reports/<yyyy-MM-dd>/<mã nhóm>/<mã bộ>/
    manifest.json     mô tả bộ
    01.jpg 02.jpg ... liên kết cứng tới ảnh gốc, đúng thứ tự gửi (không có liên kết cứng thì sao chép)
    reading.json      agent ghi kết quả đọc
    review.json       kết quả kiểm tra và xác nhận
```

Mỗi bộ tự chứa nên agent chỉ cần mở một thư mục. Thư mục nằm trong `data/` nên không được commit.

`mã bộ` = `<yyyyMMdd>-<HHmmss giờ Việt Nam của ảnh đầu>-<mã tin của ảnh đầu>`.

`manifest.json`:

```json
{
  "version": 1,
  "bundleId": "20261007-074752-1791334072471",
  "day": "2026-10-07",
  "status": "closed",
  "groupId": "g8177341213137283974",
  "groupName": "LC_..._HM",
  "school": { "tenTruong": "...", "khuVuc": "HM" },
  "sender": { "id": "...", "name": "..." },
  "firstTs": 1791334072471,
  "lastTs": 1791334081907,
  "texts": [{ "msgId": "...", "ts": 0, "content": "..." }],
  "images": [{ "seq": 1, "msgId": "1791334072471", "ts": 1791334072471, "source": "images/g.../1791334072471.jpg", "file": "01.jpg" }]
}
```

Tên trường lấy từ tên nhóm (`parseGroupName`, đã có sẵn), không đọc từ chữ viết tay; chữ viết tay chỉ để đối chiếu.

## 5. Gom bộ

Dùng các tin `chat.photo` trong kho tin, theo từng nhóm, sắp theo giờ:

1. Hai ảnh liên tiếp của cùng một người gửi cách nhau **không quá `gapMinutes` (mặc định 3 phút)** thì cùng một bộ. Đúng cho cả album (các ảnh cách nhau vài mili giây) và ảnh gửi riêng lẻ liên tục.
2. Khác người gửi, hoặc cách nhau quá ngưỡng thì mở bộ mới.
3. Bộ có `status: "open"` cho tới khi **yên ắng `settleMinutes` (mặc định 5 phút)** kể từ ảnh cuối, rồi thành `closed`. Chỉ bộ `closed` mới được đọc, để chắc ảnh cuối đã tới.
4. Tin chữ cùng người gửi, cùng nhóm, trong khoảng `textWindowMinutes` (mặc định 10 phút) quanh bộ được đính vào `texts` (tiêu đề hoặc chú thích). Không có tin chữ vẫn đọc bình thường.
5. Chạy lại `photos:bundle` không tạo bộ trùng: cùng ảnh đầu thì cùng `mã bộ`, thư mục được cập nhật (thêm ảnh về muộn nếu bộ chưa được đọc; bộ đã đọc rồi mà có ảnh mới thì đánh dấu để đọc lại).

Cả ba số (`gapMinutes`, `settleMinutes`, `textWindowMinutes`) nằm trong `config.vision.bundle` và kiểm tra khi khởi động.

## 6. Luật ảnh

Mỗi loại một file trong thư mục `photo-rules/` ở gốc repo (được commit, khác `data/`): `speedtest.json`, `handover.json`. Người dùng sẽ mô tả chi tiết để hoàn thiện luật ở bước sau; bản này chỉ cần khung và hai luật mẫu.

Khung một file luật:

```json
{
  "id": "speedtest",
  "version": 1,
  "title": "Ảnh đo tốc độ mạng",
  "nhanRa": "Ảnh chụp màn hình trình duyệt hiện kết quả Fast.com: số lớn kèm đơn vị Mbps.",
  "soLuongMoiBo": { "toiThieu": 1, "toiDa": 1 },
  "truong": [
    { "ten": "mbps", "kieu": "so", "batBuoc": true, "min": 1, "max": 10000, "goiY": "Số lớn ở giữa màn hình." }
  ],
  "luatKiemTra": [],
  "docLanHai": "khi_tin_cay_thap",
  "nguongTinCay": "vua"
}
```

- `kieu`: `so`, `chu`, `ngay`, `dung_sai`, hoặc `danh_sach` (kèm mô tả phần tử).
- `docLanHai`: `luon`, `khi_tin_cay_thap` hoặc `khong`.
- `nguongTinCay`: độ tin cậy thấp nhất vẫn được xếp `tu_dong_dat` (`cao`, `vua`).
- `model` (không bắt buộc): model riêng cho loại ảnh này, ghi đè `config.vision.model`. Cho phép dùng Haiku 4.5 cho ảnh dễ (tốc độ) và đổi sang model mạnh hơn chỉ cho ảnh khó (biên bản viết tay) nếu đo thấy Haiku đọc chưa đủ chính xác, mà không sửa code.

Hai luật mẫu:
- **`speedtest`**: một trường `mbps` (số, 1 đến 10000). Mỗi bộ đúng 1 ảnh, nhiều hơn thì đánh dấu `can_xem`. Đọc lần hai khi độ tin cậy thấp.
- **`handover`** (biên bản bàn giao phòng máy, viết tay, từ 2 ảnh trở lên): trường `ngay`, `nguoiBanGiao`, `nguoiNhan`, `phong`, `phanMem[]`, `thietBi[]` (`ten`, `soLuong`, `hoatDong`, `hong`, `tinhTrang`, `ghiChu`), `hoanThanhBaoTri`. Luật kiểm tra: `hoatDong + hong = soLuong` khi cả ba có; số thùng máy, màn hình, bộ phím chuột thường bằng nhau (chỉ cảnh báo); ngày không ở tương lai và không lệch quá 2 ngày so với giờ gửi. Đọc lần hai luôn bật.

Prompt của agent được **ghép tự động** từ các file luật: phần nhận ra của mọi luật cho việc phân loại, phần trường và luật của loại đó cho việc trích. Thêm một loại ảnh mới chỉ cần thêm một file luật, không sửa code. Ảnh không khớp luật nào thì loại là `khac` và không đọc thêm gì.

## 7. Đọc ảnh

Giao diện chung (đưa vào được agent giả khi test):

```ts
interface VisionReader {
    /** Đọc một bộ: phân loại từng ảnh theo `rules` rồi trích các trường. Không ném lỗi: lỗi trả về trong `error`. */
    readBundle(input: { bundleDir: string; manifest: Manifest; rules: PhotoRule[]; pass: 1 | 2 }): Promise<BundleReading>;
}
```

Cách thực hiện đầu tiên: **`claude -p`** chạy như một tiến trình con. Một lần gọi cho **cả bộ** (không phải mỗi ảnh một lần, để không trả phần mở đầu cố định nhiều lần). Các cờ: `--allowedTools Read`, `--output-format json`, `--json-schema <lược đồ kết quả sinh từ luật>`, `--model`, `--add-dir <thư mục bộ>`, `--disable-slash-commands`, `--no-session-persistence`, `--setting-sources user`, `--system-prompt <lời dặn ngắn>`, và chạy với thư mục làm việc **sạch** (không có `CLAUDE.md` của dự án) để bớt ngữ cảnh. Kết quả lấy từ `structured_output`.

Model mặc định là **Haiku 4.5** theo yêu cầu của người dùng (`--model haiku`; kết quả `modelUsage` của lần thăm dò xác nhận `claude-haiku-4-5-20251001`). Độ chính xác đọc chữ viết tay của Haiku 4.5 chưa được đo: bộ đáp án đúng (mục 11) là cách xác định có cần đổi model cho loại `handover` hay không.

Thăm dò thực tế (2026-10-07, một ảnh tốc độ, model Haiku 4.5):
- Đọc đúng ảnh Fast.com (75 Mbps) và trả đúng lược đồ.
- Thư mục dự án mặc định: 3 lượt, khoảng 22 giây, khoảng 72.000 token ngữ cảnh. Thư mục sạch kèm các cờ trên: khoảng 12 giây, khoảng 38.000 token. Vẫn là phần lớn chi phí cố định, nên gom cả bộ vào một lần gọi.
- Cờ `--bare` (gọn nhất) **không dùng được với subscription**: chế độ này chỉ nhận `ANTHROPIC_API_KEY`, không đọc đăng nhập OAuth.

Giới hạn đã biết của cách này: tính vào hạn mức của gói; phải giữ đăng nhập Claude Code trên máy chạy; chạy song song kém. Vì vậy `VisionReader` là giao diện, để sau thay bằng cách gọi API mà không sửa phần còn lại.

## 8. Review ba lớp

Chạy theo thứ tự, lớp sau chỉ chạy khi cần.

1. **Lớp 1, luật (luôn chạy, không tốn token).** Áp `luatKiemTra` và các giới hạn `min`/`max`/`batBuoc` của từng luật. Trường thiếu hoặc vi phạm luật cứng thì `can_xem`; vi phạm luật cảnh báo thì ghi chú nhưng không chặn.
2. **Lớp 2, đọc lần hai độc lập.** Chạy khi luật ảnh đặt `luon`, hoặc `khi_tin_cay_thap` mà lần một có trường tin cậy `thap`. Lần hai là một lần gọi `claude -p` khác **không được xem kết quả lần một**. Hai bản so với nhau từng trường: trùng thì giữ, lệch thì ghi `{trường, lần một, lần hai}` và `can_xem`.
3. **Lớp 3, người xem** (`photos:review`). Chỉ các bộ `can_xem`. Hiện ảnh gốc, hai giá trị đọc và lý do; người xem chọn đúng, sửa, hoặc bỏ. Kết quả lưu trong `review.json`; trạng thái thành `da_xac_nhan` hoặc `da_sua`.

Chỉ `tu_dong_dat`, `da_xac_nhan`, `da_sua` mới được dùng làm đầu vào báo cáo ở giai đoạn sau. Cách xử lý bộ đang `can_xem` khi dựng báo cáo là câu hỏi mở (mục 12).

`reading.json` (rút gọn):

```json
{
  "bundleId": "...", "readAt": 0,
  "reader": { "kind": "claude-p", "model": "haiku", "promptVersion": "1", "ruleVersions": { "speedtest": 1, "handover": 1 } },
  "images": [{ "seq": 1, "loai": "speedtest", "doTinCay": "cao" }],
  "extracted": { "speedtest": { "mbps": { "value": 75, "doTinCay": "cao" } } }
}
```

`review.json` (rút gọn): `{ "status": "can_xem", "checks": [{ "id": "tong_thiet_bi", "ok": false, "detail": "..." }], "secondRead": { "disagree": [{ "path": "...", "first": 51, "second": 57 }] }, "human": null }`.

## 9. Lệnh

Cả ba chạy được lặp lại an toàn (không tạo trùng, không đọc lại bộ đã đọc trừ khi có `--again`). Cả ba chỉ ghi vào `data/photo-reports/`, không đụng DB, Excel hay kho tin.

- `npm run photos:bundle -- [--day YYYY-MM-DD] [--group <mã nhóm>] [--from-dir <thư mục ảnh rời>]`: gom ảnh thành bộ và ghi `manifest.json`. `--from-dir` dùng cho bộ ảnh mẫu (ảnh không nằm trong kho tin).
- `npm run photos:read -- [--day D] [--bundle <mã bộ>] [--again] [--dry-run]`: đọc các bộ `closed` chưa đọc, ghi `reading.json` và `review.json`. `--dry-run` chỉ liệt kê.
- `npm run photos:review -- [--list] [--bundle <mã bộ>]`: liệt kê các bộ `can_xem` hoặc xem và xác nhận một bộ.

## 10. Cấu hình (`config.vision`)

```
enabled        false: bot không đọc ảnh tự động (các lệnh chạy tay luôn chạy được)
reader         "claude-p" (sau này "api")
model          model cho lần đọc thứ nhất; mặc định "haiku" (Haiku 4.5, claude-haiku-4-5-20251001, đã dùng ở lần thăm dò)
secondModel    model cho lần đọc thứ hai; mặc định cùng `model` (có thể đặt model khác để hai lần đọc độc lập hơn)
timeoutSeconds thời gian chờ tối đa cho một lần gọi
maxBundlesPerRun  tối đa số bộ đọc mỗi lần chạy lệnh (chặn chạy quá tay)
bundle.gapMinutes, bundle.settleMinutes, bundle.textWindowMinutes   (mục 5)
```

Kiểm tra khi khởi động như các mục khác (`configCheck.ts`), mô tả trong `configDoc.ts` để `config:show` in ra.

## 11. Kiểm thử

- Test đơn vị, không gọi agent: gom bộ (album, ảnh rời, khác người gửi, vượt ngưỡng, chốt bộ), sinh lược đồ và prompt từ luật, mọi luật kiểm tra của lớp 1, so hai lần đọc, chuyển trạng thái review, xử lý lỗi của `VisionReader` (hết thời gian, JSON sai).
- `VisionReader` giả truyền vào để chạy cả đường `photos:read` mà không tốn token.
- **Bộ đáp án đúng** `photo-golden/` (được commit): 15 ảnh mẫu trong `data/images/AI_reading_picture` kèm đáp án người dùng xác nhận (hai ảnh tốc độ 61 và 75 Mbps, hai biên bản). Một lệnh chạy tay (`photos:golden`) đọc bộ này và in độ chính xác từng trường và từng lớp review. Không chạy trong `npm test` vì tốn hạn mức.

Ghi chú về bộ ảnh mẫu: 15 ảnh cùng một lượt gửi lúc 07:47:52 đến 07:48:01 ngày 2026-10-07, nhóm `8177341213137283974` không có trong `config.targets` và không có trong kho tin, nên bản chạy thử dùng `--from-dir`. Cả 15 ảnh sẽ vào cùng một bộ.

## 12. Rủi ro và câu hỏi còn mở

Rủi ro:
- **Hạn mức subscription:** chạy nhiều bộ mỗi ngày có thể chạm giới hạn; đã giảm bằng một lần gọi mỗi bộ và `maxBundlesPerRun`. Chạy thật 24/24 nên chuyển sang API.
- **Điều khoản sử dụng:** chưa chắc về việc chạy tự động liên tục bằng gói subscription; bản chạy thử là rủi ro nhỏ, bản chạy thật nên dùng API.
- **Chữ viết tay đọc sai:** giảm bằng luật kiểm tra chéo, đọc lần hai độc lập và người xem; độ chính xác thực tế chỉ biết sau khi đo trên bộ đáp án.
- **Quyền riêng tư:** ảnh biên bản có tên người và chữ ký, được gửi tới dịch vụ bên ngoài; người dùng cần chắc chắn quy định công ty cho phép.
- **Gom bộ sai** (hai báo cáo gửi sát nhau): ngưỡng chỉnh được; bộ có số ảnh lệch so với luật bị đánh dấu `can_xem`.

Câu hỏi mở (có mặc định, quyết định ở giai đoạn nối vào báo cáo, không chặn bản chạy thử):
1. Bộ đang `can_xem` thì khi dựng báo cáo: để trống chờ xem, hay đưa vào kèm cảnh báo? Mặc định đề xuất: tốc độ đưa vào kèm cảnh báo, biên bản chờ xem.
2. Ngưỡng Mbps để xếp loại T, B, K cho báo cáo INTERNET: người dùng cung cấp.
3. Có cần "biên bản bàn giao linh kiện" (trang hai trong ảnh mẫu) hay chỉ "bàn giao phòng máy": mặc định chỉ đọc bàn giao phòng máy, ảnh linh kiện xếp loại `khac` cho tới khi có luật.

## 13. Thứ tự thực hiện

1. Luật ảnh (khung và hai luật mẫu), sinh lược đồ và prompt.
2. Gom bộ và `photos:bundle`.
3. `VisionReader` (giao diện, cách `claude -p`, agent giả) và `photos:read`.
4. Review lớp 1 và lớp 2, `photos:review`.
5. Bộ đáp án đúng và `photos:golden`, đo độ chính xác trên ảnh mẫu.
