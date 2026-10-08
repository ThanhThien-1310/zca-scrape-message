# Rà soát quy trình báo cáo buổi dạy (bản tạm)

Ngày: 2026-09-25. File tạm, dùng để xem và quyết định; không phải tài liệu chính thức.

Phạm vi: đọc code và cấu hình, **chưa chạy test**. Các nhận định về hành vi đều dẫn tới file và dòng để kiểm chứng. Những điểm chỉ dựa trên suy luận được ghi rõ là "suy luận".

## 1. Việc đã làm trong lượt này

**Dọn dẹp**

| Đã xóa | Ghi chú |
|---|---|
| `_tmp_verify.ts` | Script thử một lần đã có sẵn từ trước; đưa vào Thùng rác |
| `output/*` (7 file: `output.json`, `marks.json`, `review.json`, `meta.json`, `rows.json`, `fill.log`, `overrides.json`) | Sinh ra khi demo, có `overrides.json` của tin demo; đưa vào Thùng rác |
| Các file thăm dò trong `%TEMP%` (`probe`, `call`, `cols`, `room`, `tables`, `tmpt`, `xl`, `t.test.ts`, thư mục `xlsm`) | File do tôi tạo |
| Tiến trình `bot:watch` chạy nền của demo | Đã dừng |

**Không xóa, nêu để bạn quyết**

| File | Lý do giữ |
|---|---|
| `tests/` (10 file test) | Là test thật của code, không phải test tạm |
| `src/cli/debug/db-check.ts`, `src/cli/debug/zalo.ts`, `src/cli/debug/active-conversation.ts` | Công cụ chẩn đoán, `src/cli/debug/zalo.ts` còn được script `zalo:debug` dùng |
| `src/cli/export-lesson-report.ts` và script `export:lesson-report` | Code cũ bị bỏ qua theo lời bạn, nhưng không phải file tạm; xóa được nếu bạn muốn |
| `data/export/baocaobuoisang_250926.xlsm` | Đang chứa dòng demo `Demo GV`; cần chạy lại bản sạch nếu dùng làm báo cáo thật |
| `data/export/baocaobuoisang_240926.xlsm`, `lesson-report-2026-09-24.xlsx` | Kết quả xuất ra (bản sau là định dạng cũ do bot cũ tạo) |
| Dữ liệu demo trong DB (một dòng `bot test`, `StatusId = 1`) và trong `data/g6163952554109807820.json` | Xóa dữ liệu DB cần bạn đồng ý |
| Thư mục tạm của phiên (`scratchpad\output_backup_bot`) | Bản sao `output/` của bot cũ (12 báo cáo ngày 24/09) trước khi bị ghi đè |

**Sự cố của tôi:** lúc dừng `bot:watch` tôi dừng cả cây tiến trình, và Zalo Desktop là tiến trình con nên bị đóng theo. Đã mở lại ngay (đăng nhập không mất). Đã thêm cảnh báo cách dừng an toàn vào `docs/GUIDE.md`.

**Cập nhật skill** `Teach-lesson-skills-V2/SKILL.md` (khối quy tắc trích xuất giữ nguyên, đã đối chiếu 176/176 dòng):
1. Hàng chờ rỗng **không** làm dừng quy trình nữa (xem F1 bên dưới); chỉ dừng khi bước 3 báo `xét 0 tin`.
2. Bất kỳ bước nào lỗi thì dừng, không chạy tiếp; đặc biệt không chạy `mark:messages` khi bước 3 hoặc 5 lỗi.
3. Luôn truyền `--buoi` (và `--day`) tường minh; không dùng `--no-db` khi chạy thật.
4. Khi ghi `overrides.json` phải ghi cả mảng (không làm mất mục cũ).
5. Đọc output bước 1: `sidebar item ... not found` hoặc `no messages found` nghĩa là nhóm có thể chưa được cào.
6. Thêm mục "Giới hạn đã biết". Cập nhật tương ứng trong `docs/QUY-TRINH.md` và `docs/GUIDE.md`.

## 2. Phát hiện qua đọc code

Mức: **Cao** = có thể làm sai hoặc mất dữ liệu mà không ai biết; **TB** = ảnh hưởng chất lượng hoặc độ tin cậy; **Thấp** = cần biết.

### Cao

**F1. Quy trình phụ thuộc hoàn toàn vào `bot:watch` để biết nhóm nào cần cào.**
Hàng chờ chỉ có nhóm nào `bot:watch` đã thấy. Nếu `bot:watch` chết, máy khởi động lại hoặc Zalo đổi giao diện thông báo, tin đến mà không ai xếp hàng. Skill sẽ thấy hàng chờ rỗng (giờ vẫn chạy tiếp), nhưng dữ liệu thiếu và Excel thiếu báo cáo mà không có cảnh báo. `bot:watch` cũng không tự phục hồi (`src/watch/watch.ts`, README mục "Chế độ theo dõi"). *Đề xuất:* thêm cách cào dự phòng toàn bộ `config.targets` (ví dụ tham số `--all` cho `bot:scrape`) mà agent chạy một lần trước khi trích xuất buổi.
*Trạng thái (2026-09-25): đã xử lý theo hướng khác, phù hợp quy mô lớn:* `bot:watch` ghi nhịp tim và khoảng gián đoạn (kèm trạng thái hai nguồn phát hiện), `recover:missing` chỉ cào lại các nhóm còn thiếu báo cáo khi có gián đoạn chồng lên buổi, `watch:status` cho biết tình trạng. Chưa xử lý: nhóm đã có một báo cáo cùng loại mà báo cáo thứ hai bị lỡ thì không phát hiện được.

**F2. `bot:scrape` coi "không tìm thấy nhóm" và "không có tin" là thành công.**
`src/scrape/desktopScraper.ts:377` (`if (!opened) return [];`) rồi `:230` (`no messages found ... nothing to save`) trả `{0,0}` không ném lỗi, nên `:211` ghi `outcomes.push({ target })` (không có `error`). Kết quả: nhóm bị xóa khỏi hàng chờ, lệnh thoát mã 0, agent không biết nhóm chưa được cào. *Đề xuất:* trả trạng thái riêng cho "không mở được nhóm" và giữ nhóm đó trong hàng chờ, hoặc ném lỗi. Hiện chỉ giảm nhẹ bằng quy tắc trong skill (đọc output).

**F3. Tin nhắn bị giáo viên sửa hoặc thu hồi sau khi đã cào không được cập nhật.**
`src/store/messageStore.ts:153` và `:181` bỏ qua tin đã thấy theo `msgId`; `enrichExisting` chỉ bổ sung thông tin cho tin **ảnh** (đọc trực tiếp). `src/store/dbMapping.ts:52` luôn ghi `MessageStatus: 1` (chưa theo dõi thu hồi, comment `:19` nói rõ). `sync:db` cũng chỉ làm mới `MessageType` và `Url` của dòng đã có. Báo cáo bị sửa sau khi cào sẽ mang số liệu cũ vào Excel. *Đề xuất:* cào lại và cập nhật nội dung khi `msgId` đã có mà nội dung khác; hoặc ít nhất ghi nhận rủi ro cho người vận hành.

**F4. Mốc thời gian cào cố định là 06:00 hôm nay theo giờ máy, tính một lần khi nạp cấu hình.**
`config.ts:82` (`sinceTs: todayAt(6, 0)`, dùng `Date` giờ địa phương). Hậu quả: (a) tin trước 06:00 không bao giờ được lấy; (b) nhóm còn nằm trong hàng chờ từ hôm trước, cào vào hôm sau, chỉ lấy từ 06:00 hôm sau, tin cuối ngày hôm trước mất; (c) chạy lại báo cáo cho ngày cũ không cào được thêm. Ngoài ra nếu múi giờ máy khác UTC+7 thì mốc lệch (suy luận; phần trích xuất dùng UTC+7 cố định nên sẽ không khớp). *Đề xuất:* tính mốc theo ngày và buổi đang xử lý hoặc theo lần cào thành công gần nhất.

**F5. Kết quả cũ còn nguyên khi `extract:reports` lỗi, nên các bước sau có thể chạy trên dữ liệu cũ.**
`src/cli/extract-reports.ts:57` chỉ ghi file **sau khi** trích xuất thành công. Nếu lỗi (ví dụ DB không kết nối được) thì `output/output.json`, `marks.json`, `meta.json` của lần trước còn đó; một agent chạy tiếp `fill:report` sẽ tạo lại file của buổi cũ, và `mark:messages` áp lại trạng thái cũ. Đã giảm nhẹ bằng quy tắc "lỗi thì dừng" trong skill. *Đề xuất:* xóa các file kết quả (trừ `overrides.json`) ở đầu lệnh.

**F6. Agent tự động ghi vào DB dùng chung, kèm quyền chạy lệnh rộng.**
Bước 2 (`sync:db --apply`) và bước 6 (`mark:messages`, `src/cli/mark-messages.ts:52`) ghi thật. `mark:messages` đặt `StatusId` và `HasRead = 1` cho **mọi** tin trong buổi. Hệ thống cũ (`school-message-classification`) cũng đánh dấu tin không phải báo cáo là `-1`, nên kết quả tương thích; nhưng nếu chuỗi skill cũ (`group-classification` → phân loại → `teacher-lesson-report-extraction` qua API `save-report`) còn chạy song song thì hai bên tranh nhau cùng tin và cùng ghi báo cáo, còn V2 **không** ghi vào các bảng `Technical_*`. Cho phép `npm.cmd` trong danh sách phê duyệt nghĩa là agent chạy được mọi script npm, kể cả ghi DB. *Đề xuất:* tắt chuỗi skill cũ khi bật V2; chạy tay một vòng trước khi cho agent tự chạy; nếu có thể, tách script chỉ đọc và script ghi.

### Trung bình

**F7. Tra `RoomId` có thể bỏ sót phòng.** `src/lesson/roomKey.ts:5` bỏ tiền tố `PM` (đúng với `1`, `2`, `H002` đã thấy), nhưng nếu trường nào lưu tên phòng là `PM1` thì tra không ra (suy luận: dữ liệu DB mới xem mẫu 4 trường). `src/lesson/roomLookup.ts:38` chỉ nhận `Type = 0` và `RoomIds` là một số; nhiều `RoomIds` hoặc `Type` khác đều thành `null` nên phòng mơ hồ bị coi như không có. *Đề xuất:* tra cả dạng có và không có `PM`; xử lý trường hợp nhiều ID bằng cảnh báo riêng.

**F8. Bảng báo cáo chỉ hiện báo cáo mới nhất của phòng trong ngày (macro của file mẫu).** Hai lớp học liên tiếp trong cùng một phòng, hoặc báo cáo cuối buổi ghi `IT bảo trì`, sẽ làm mất số liệu của báo cáo trước (đã gặp ở Chu Văn An và Quang Trung). Không sửa được trong code, phải sửa macro.

**F9. Ranh giới buổi cứng 12:00 và 18:00 theo giờ gửi tin (`src/lesson/time.ts`).** Báo cáo cuối buổi sáng gửi lúc 12:05 rơi vào buổi chiều, và trong file chiều nó còn thay thế báo cáo đầu buổi chiều của cùng phòng nếu gửi sau đó. Chưa được bạn xác nhận ranh giới.

**F10. `bot:scrape` khởi động lại Zalo nếu cổng debug đóng, và `bot:watch` luôn khởi động lại Zalo lúc bật** (`src/watch/watch.ts:39`, `ensureZaloReady`). Chạy theo lịch trong giờ làm việc có thể ngắt người đang dùng Zalo. Dừng `bot:watch` bằng cách giết cả cây tiến trình sẽ đóng Zalo (chính tôi đã gặp).

**F11. `overrides.json` dùng chung nhiều buổi và không tự dọn.** Agent ghi đè bằng mảng mới thì mất sửa cũ (đã thêm quy tắc "ghi cả mảng" vào skill). Mục cũ ở lại vô thời hạn.

**F12. Không có khóa khi chạy chồng.** Hai lần chạy (cron chồng lịch, hoặc bạn chạy tay lúc agent đang chạy) cùng ghi `output/` và cùng mở Excel; không có phát hiện chạy chồng. Hàng chờ cũng chỉ ghi nguyên tử, không khóa (đã ghi trong spec).

**F13. `--no-db` cho ra Excel rỗng một cách im lặng.** `fill:report` bỏ qua báo cáo `maPhong = null` rồi in một dòng; agent nếu dùng `--no-db` sẽ thấy "thành công" nhưng không có dòng nào. Đã ghi vào skill: không dùng khi chạy thật.

### Thấp

- **F14.** `scrollStability.nextStableRounds`: khung tin nhắn trả `null` 3 vòng liên tiếp thì dừng cuộn, có thể cắt sớm nếu nhóm đang tải chậm (suy luận, khoảng 3 vòng x 0,5–1,2 giây).
- **F15.** `sync:db --apply` thêm cả tin ảnh (60 dòng ảnh trong lần demo) với `Url` là đường dẫn cục bộ, vô nghĩa với hệ thống khác. Bạn đã bảo tạm bỏ qua ảnh.
- **F16.** `data/*.json` tăng không giới hạn và `extract:reports` đọc hết mỗi lần chạy. Chưa vấn đề với vài trăm tin; nên có lưu trữ theo tháng.
- **F17.** Excel COM và Zalo Desktop cần phiên Windows tương tác. Nếu gateway OpenClaw chạy như dịch vụ ở phiên không có màn hình thì bước 1 và 5 sẽ lỗi (suy luận; chưa thử).
- **F18.** Mã mới phụ thuộc file chưa commit của bạn (`src/store/db.ts`, `src/store/imageStore.ts`, `src/store/dbMapping.ts`, `src/cli/sync-db.ts`, `src/cli/mark-messages.ts`); commit của tôi kèm cả sửa dở của bạn trong vài file. Clone sạch từ git sẽ không chạy.
- **F19.** Độ phủ test: chưa có test cho `fill:report` và `fill-template.ps1` (cần Excel), `src/watch/watch.ts`, nối `scrapeThreadHistory`, và phân tích tham số của `extract:reports`. Phần trích xuất lõi, hàng chờ và kho lưu trữ có 66 test (lần chạy gần nhất).
- **F20.** Hai skill cùng câu kích hoạt ("trích xuất thông tin báo cáo buổi dạy"): skill cũ `teacher-lesson-report-extraction` (file trong git hiện chứa bản nháp spec) và V2. Skill V2 nằm ngoài `skills/` nên OpenClaw chưa nạp nó.
- **F21.** `docs/QUY-TRINH.md` có dùng `groupId` và `msgId` thật làm ví dụ, và `.env` dùng tài khoản DB cá nhân; nên đổi sang ví dụ giả và tài khoản dịch vụ trước khi chia sẻ.

## 3. Cần lưu ý khi vận hành

1. Chạy tay trọn một vòng (GUIDE mục 5) trước khi bật lịch tự động.
2. Luôn kiểm tra `review.json` cho các mục `phong_khong_tim_thay` và `truong_khong_nhan_ra`: chúng là báo cáo **không** vào Excel.
3. Sau mỗi lần chạy, so nhanh số báo cáo trong tóm tắt với số nhóm đang dạy: thiếu nhóm thường do F1, F2 hoặc F4.
4. Chạy sau khi buổi kết thúc và đủ thời gian cho báo cáo cuối buổi (ví dụ 12:05 và 18:05).
5. Không bật đồng thời chuỗi skill cũ và V2.
6. Dừng `bot:watch` bằng Ctrl+C, không giết cả cây tiến trình.
7. Nhớ bước 2 và 6 ghi vào DB thật; mọi lần chạy lại đặt lại `StatusId` theo kết quả mới nhất.

## 4. Đề xuất sửa theo thứ tự

1. **F2** (giữ nhóm trong hàng chờ khi chưa cào được): nhỏ, tác động lớn, có thể kèm test.
2. **F1** (tham số cào toàn bộ `config.targets` làm dự phòng) và **F4** (mốc thời gian theo ngày đang xử lý).
3. **F5** (xóa kết quả cũ đầu `extract:reports`).
4. **F3** (cập nhật tin đã sửa): cần thiết kế thêm (so sánh nội dung khi cào lại, cập nhật cả `Zalo_CrawlMessage.TextContent`).
5. **F7** (tra phòng cả hai dạng, cảnh báo nhiều ID) và ghi rõ ranh giới buổi (F9) với người dùng.
