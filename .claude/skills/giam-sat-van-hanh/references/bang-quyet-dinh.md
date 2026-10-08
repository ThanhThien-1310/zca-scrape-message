# Bảng quyết định: thấy gì → làm gì

Cột "Tự làm" chỉ gồm việc chỉ-đọc. Cột "PHẢI HỎI" là việc ghi: chỉ ĐỀ NGHỊ trong báo cáo, không chạy khi chưa có câu "đồng ý" của người dùng cho đúng việc đó.

## bot:watch (`npm run watch:status`)

| Thấy (trích dòng) | Tự làm | PHẢI HỎI |
|---|---|---|
| `chưa có dữ liệu nhịp tim — bot:watch chưa từng chạy` | Hỏi câu "Có bot nào hôm nay cố ý không chạy" nếu chưa biết | "Bạn có muốn khởi động `npm run bot:watch` không? Lệnh này tắt và mở lại Zalo Desktop, đừng chạy lúc đang dùng Zalo." |
| `ĐÃ DỪNG lúc HH:MM` | Chạy lại với `--buoi` của buổi hôm nay để xem gián đoạn (bước 2) | Như trên; thêm: "Có gián đoạn chồng lên buổi, bạn có muốn chạy `recover:missing` không?" khi bước 2 thoát mã 2 |
| `CÓ VẺ ĐÃ CHẾT: nhịp tim cuối lúc HH:MM` | Như `ĐÃ DỪNG`; ghi pid trong dòng | Như `ĐÃ DỪNG` |
| `ĐANG CHẠY NHƯNG MÙ ... nguồn phát hiện (WebSocket) không hoạt động từ HH:MM` | Ghi giờ mù; xem dòng `nguồn phát hiện: WebSocket:` (`active` là ổn, `connecting` hoặc `down` là chưa nghe được) | "Bot đang mù, tin mới không vào hàng chờ. Bạn có muốn khởi động lại `bot:watch` không? Sau đó có thể cần `recover:missing`." |
| `ĐANG CHẠY` kèm `chưa phát hiện tin nào` | Báo là chưa có tin nào; không coi là lỗi nếu mới chạy | Không có |
| `khoảng gián đoạn ... → đang diễn ra` | Ghi lại giờ bắt đầu và lý do trong ngoặc | Như `ĐÃ DỪNG` |
| Dòng cuối `có N khoảng gián đoạn chồng lên buổi → CẦN chạy recover:missing` (thoát mã 2) | Ghi buổi, ngày, N | "Bạn có muốn chạy `npm run recover:missing -- --day <ngày> --buoi <buổi>` không? Lệnh này điều khiển Zalo Desktop." |
| `không có gián đoạn chồng lên buổi → không cần khôi phục` | Báo "không cần khôi phục" | Không có |

`recover:missing` (kể cả `--dry-run`) ghi `output/recovery.json`, nên luôn là việc phải hỏi. Nó không chạy được khi `bot:runner` hoặc `bot:scrape` đang giữ Zalo: lệnh tự báo `đang có "..." điều khiển Zalo Desktop`; báo lại nguyên văn, không thử lại.

## bot:runner (`npm run runner:status`)

| Thấy | Tự làm | PHẢI HỎI |
|---|---|---|
| `chưa có dữ liệu — bot:runner chưa từng chạy` | Hỏi câu "Có bot nào cố ý không chạy" nếu chưa biết | "Bạn có muốn khởi động `npm run bot:runner` không?" |
| `ĐÃ DỪNG lúc HH:MM` hoặc `CÓ VẺ ĐÃ CHẾT` | Ghi `hàng chờ`; nếu hàng chờ có nhóm, nói rõ chưa ai cào | "Bạn có muốn khởi động lại `bot:runner` không? Nó tự vớt gián đoạn của bot:watch và dựng buổi còn thiếu." |
| `LỖI: N vòng liên tiếp thất bại` | Đọc 20 dòng cuối `output/runner-log.jsonl`, trích `lỗi` | "Nguyên nhân là <...>. Bạn sửa nguyên nhân rồi tôi nhắc khởi động lại `bot:runner`, được không?" (runner đã ngừng tự thử) |
| `hàng chờ: N nhóm ...` với `nhóm đầu tiên vào lúc HH:MM` quá 10 phút trước (`runner.maxWaitSeconds`, xem `config:show`) khi runner `ĐANG CHẠY` | Báo "hàng chờ kẹt"; ghi `trạng thái:` và `vòng gần nhất` | "Hàng chờ kẹt từ HH:MM. Bạn có muốn khởi động lại `bot:runner` không?" |
| `hàng chờ` có nhóm, mới vào dưới 10 phút | Báo "đang chờ yên lặng", không coi là lỗi | Không có |
| `vòng gần nhất ...: LỖI` kèm `lỗi:` hoặc `lỗi dựng:` | Trích nguyên văn hai dòng này | "Bạn có muốn tôi dựng lại buổi đó bằng `runner:once` không?" |
| `buổi chưa dựng xong: <buổi> <ngày>` | Ghi buổi; runner tự thử lại sau `runner.dirtyRetrySeconds` | Chỉ hỏi `runner:once` nếu còn tồn tại sau lần kiểm kế tiếp |
| `file báo cáo đang lỗi, sẽ thử lại: ...` | Trích nguyên văn | "Báo cáo này lỗi, bạn có muốn tôi dựng lại bằng `runner:once` không?" |
| `cảnh báo: ...` | Trích nguyên văn | Không có |
| `[bộ báo cáo] LỖI (<id>): ...` (thoát mã 2) | Trích nguyên văn; chạy `npm run config:show` xem mục "BỘ BÁO CÁO ĐANG CHẠY" | "Bộ <id> đang bị tắt do cấu hình. Bạn có muốn dùng skill `cau-hinh-nguoi-phu-trach` để sửa không?" |
| `[bộ báo cáo] cảnh báo ...` | Trích nguyên văn | Không có |
| `KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY` | Trích; chạy `npm run reports:list` xem mã hợp lệ và dòng `THIẾU` | Như dòng `LỖI (<id>)` |

## bot:total (`npm run total:status`)

| Thấy | Tự làm | PHẢI HỎI |
|---|---|---|
| `chưa có dữ liệu` / `ĐÃ DỪNG` / `CÓ VẺ ĐÃ CHẾT` | Xem hai dòng đợt; nếu đợt đã quá giờ mà chưa xuất, ghi rõ | "Bạn có muốn khởi động lại `npm run bot:total` không?" |
| `<sáng|chiều> HH:MM: chưa tới giờ` | Báo "chưa tới giờ" | Không có |
| `đến giờ, chưa xuất (đang đợi runner hoặc bot:total chưa chạy)` | Xem `[total]` đầu và `hàng chờ` của runner: runner còn hàng chờ thì bot:total đang đợi (tối đa `total.waitMaxMinutes`) | Nếu bot:total không `ĐANG CHẠY`: "Bạn có muốn khởi động `bot:total` hay chạy `total:once -- --slot morning|afternoon` ngay không?" |
| `đã xuất lúc HH:MM (N file) — đủ dữ liệu` | Báo OK | Không có |
| `chưa đủ, sẽ xuất lại` | Báo "sẽ tự xuất lại"; ghi dòng `còn N nhóm chưa cào` | Không có |
| `CHƯA ĐỦ, không xuất lại nữa` | Ghi nhóm thiếu (`còn N nhóm chưa cào: ...`) | "Đợt này thiếu dữ liệu và bot không xuất lại. Bạn có muốn chạy `total:once` sau khi cào xong nhóm thiếu không?" |
| `lỗi N lần liên tiếp` hoặc `cảnh báo: ...` | Trích nguyên văn | Như `CHƯA ĐỦ` nếu đợt chưa xuất |
| `đã gửi lệnh in N file lúc HH:MM (giấy ra hay chưa phải xem ở máy in)` | Báo "đã gửi lệnh in", không nói "đã in" | Không có |
| `KHÔNG CÓ BỘ BÁO CÁO NÀO ĐANG CHẠY` hoặc `[bộ báo cáo] LỖI` | Như bot:runner | Như bot:runner |

## bot:chat (`npm run chat:status`)

| Thấy | Tự làm | PHẢI HỎI |
|---|---|---|
| `chưa có dữ liệu` / `ĐÃ DỪNG` / `CÓ VẺ ĐÃ CHẾT` | Hỏi câu "Có bot nào cố ý không chạy"; bot chat thường là bot tuỳ chọn | "Bạn có muốn khởi động `npm run bot:chat` không?" |
| `ĐANG CHẠY ... DRY-RUN (không gửi thật)` | Báo "đang chạy thử, không gửi thật" | Không có |
| `CÔNG TẮC DỪNG (data/.chat-off) đang BẬT` | Báo bot không gửi gì | "Bạn có muốn tắt công tắc dừng không?" (người dùng tự xoá file) |
| `tin chờ trong hộp thư: N` lớn khi bot không sống | Ghi N | Như `ĐÃ DỪNG` |
