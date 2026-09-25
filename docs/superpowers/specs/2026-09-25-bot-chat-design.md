# Thiết kế `bot:chat`: tự động trả lời tin nhắn theo kịch bản trong JSON

Ngày: 2026-09-25. Trạng thái: chờ duyệt.

## 1. Mục tiêu

Một tiến trình mới `bot:chat` đọc tin nhắn mới trong các nhóm được chỉ định và **trả lời lại bằng câu có sẵn** trong một file JSON do người dùng viết, theo tình huống (ví dụ: báo cáo có máy lỗi thì trả lời "đã nhận thông tin có máy lỗi"). Bot không tự nghĩ ra nội dung; chỉ chọn một trong các câu đã viết.

Tiêu chí thành công (người dùng ưu tiên độ an toàn và ổn định):

- Chỉ trả lời trong các nhóm được liệt kê trong JSON, và chỉ khi đúng tình huống.
- Không bao giờ trả lời tin do chính bot gửi (không có vòng lặp), không spam.
- Việc trả lời không làm `bot:runner` đi cào lại vô ích và không tranh giao diện Zalo với nó.
- Thử được an toàn: chế độ `dryRun` và nhóm `bot test`.

## 2. Đã thống nhất

| Quyết định | Nội dung |
|---|---|
| Đọc tin | `bot:watch` vẫn là **nơi duy nhất nghe tin**, chia mỗi tin thành hai luồng độc lập: hàng chờ cào (cho `bot:runner`) và hộp thư chat (cho `bot:chat`) |
| Gửi tin | Qua giao diện Zalo Desktop bằng CDP: mở nhóm, gõ vào `#richInput`, Enter; đã thử thật thành công ở nhóm `bot test` |
| Kịch bản | File JSON: mỗi nhóm có tình huống và câu trả lời riêng (có thể giống nhau giữa các nhóm) |
| Ví dụ đầu tiên | "máy lỗi": xem `2026-09-25-bot-chat-rules.sample.json` |
| Thử nghiệm | Chỉ nhóm `bot test`; tuyệt đối không gửi vào các nhóm khác khi chưa được người dùng thêm vào JSON |

## 3. Ngoài phạm vi (phiên bản đầu)

- Trả lời dạng **trích dẫn** tin gốc (cần rê chuột và bấm biểu tượng trả lời; mong manh). Chỉ gửi tin thường.
- Trả lời tin ảnh, sticker, thoại; chỉ xử lý tin chữ.
- Nội dung trả lời do AI sinh ra.
- Chạy 50 đến 100 nhóm ổn định (xem mục 10): thiết kế để mở rộng nhưng phiên bản đầu nhắm tới vài nhóm.
- Dùng thông báo (popup) làm nguồn nội dung: popup chỉ có đoạn xem trước bị cắt nên không đủ tin cậy để khớp điều kiện.

## 4. Kiến trúc

```
                         ┌─► hàng chờ cào  data/.scrape-queue.json ─► bot:runner (không đổi)
bot:watch (nghe WS) ─────┤
                         └─► hộp thư chat  data/.chat-inbox.jsonl  ─► bot:chat ─► gửi trả lời
```

Lý do `bot:watch` phải là nơi duy nhất nghe: chìa khóa giải mã tin chỉ được Zalo gửi một lần khi kết nối, và chỉ `bot:watch` (khởi động lại Zalo rồi gắn vào từ đầu) bắt được. Một tiến trình thứ hai gắn vào sau không đọc được nội dung.

### Thay đổi ở `bot:watch`

- `history/realtimeListener.ts`: sự kiện tin nhắn hiện chỉ có `groupId` và `photoMessage`. Bổ sung, cho tin chữ (`msgType === "webchat"`): `msgId`, `text` (`content` dạng chuỗi), `senderId`, `senderName` (`dName`), `isSelf` (`uidFrom === "0"`), `ts`.
- Đọc danh sách nhóm trong `chat-rules.json` mỗi lần có sự kiện (tệp nhỏ; cache theo thời điểm sửa). Nếu nhóm nằm trong `groups`, tin chữ không phải của chính mình được ghi một dòng vào `data/.chat-inbox.jsonl`. Nhóm không có trong JSON thì **không bao giờ** vào hộp thư chat.
- Không thay đổi cách xếp hàng cào, **trừ** một điều: tin khớp một câu bot vừa gửi (mục 8) bị bỏ qua ở cả hai luồng.

### Tiến trình mới `bot:chat`

Đọc hộp thư từ vị trí đã xử lý, khớp tình huống, gửi, ghi nhớ. Không nghe WebSocket, không cào.

## 5. File kịch bản `chat-rules.json`

Nằm ở gốc `zca-scrape-message/`, người dùng tự sửa. Mẫu: `2026-09-25-bot-chat-rules.sample.json`.

```json
{
  "version": 1,
  "dryRun": false,
  "limits": { "maxRepliesPerMinute": 6, "maxReplyDelaySeconds": 180, "cooldownSecondsPerRule": 30 },
  "groups": { "<tên nhóm như trong config.targets>": { "rules": [ { "id": "...", "when": { ... }, "reply": "..." } ] } }
}
```

- `dryRun: true`: chỉ ghi log "sẽ trả lời gì vào nhóm nào", không gửi.
- `limits`: tối đa số tin gửi mỗi phút toàn hệ thống; tin chờ quá `maxReplyDelaySeconds` thì bỏ (trả lời quá trễ có thể còn tệ hơn không trả lời); một tình huống không trả lời lặp trong `cooldownSecondsPerRule` ở cùng nhóm.
- `groups`: khóa là tên nhóm. **Bắt buộc** có trong `config.targets`; tên lạ làm bot từ chối khởi động (báo rõ tên nào).
- `rules` của một nhóm được xét **theo thứ tự**; **tình huống đầu tiên khớp thì trả lời và dừng** (một tin nhận tối đa một câu trả lời).
- Mọi tên nhóm hoặc quy tắc thiếu `id`, `when` rỗng, `reply` rỗng, `id` trùng trong một nhóm: lỗi khi nạp, bot không chạy.

### Điều kiện `when` (mọi khóa có mặt phải cùng khớp)

| Khóa | Ý nghĩa |
|---|---|
| `loaiBaoCao` | Tin là báo cáo `DauBuoi` và/hoặc `CuoiBuoi` (dùng `classifyTitle` của bộ trích xuất) |
| `mayLoi: true` | Báo cáo có máy lỗi, tính từ kết quả phân tích: `coSoVatChat` loại `MayTinh` có `soLuong` loại `Loi` với `so > 0`, hoặc `so` là `null` kèm ghi chú (ví dụ "IT bảo trì"). Số máy lỗi bằng 0 thì **không** khớp |
| `keywords` | Tin chứa ít nhất một cụm; so khớp không phân biệt hoa thường và dấu, dùng cùng hàm chuẩn hóa với bộ trích xuất |

Lý do có `mayLoi` riêng thay vì tìm chữ "lỗi": mẫu báo cáo có dòng `- Tổng số máy bị lỗi: 0`, tìm từ khóa sẽ nhận sai cả báo cáo bình thường.

### Câu trả lời `reply`

Chuỗi cố định, có thể chèn `{senderName}` (tên người gửi). Chưa hỗ trợ biến khác.

## 6. Vòng xử lý của `bot:chat`

1. Đọc các dòng hộp thư mới (con trỏ lưu ở `data/.chat-inbox.cursor`).
2. Bỏ tin quá `maxReplyDelaySeconds`, tin đã xử lý (`msgId` đã có trong `data/.chat-done.json`), tin của chính mình.
3. Với tin còn lại: tìm tình huống khớp đầu tiên; kiểm cooldown; kiểm giới hạn tốc độ.
4. Nếu `dryRun`: ghi log rồi đánh dấu đã xử lý.
5. Nếu không: xin khóa `data/.scrape.lock` (chờ tối đa hết `maxReplyDelaySeconds`), gửi (mục 7), nhả khóa, ghi `msgId` vào `data/.chat-done.json` và câu vừa gửi vào sổ (mục 8).

## 7. Gửi một tin (`chat/send.ts`)

Giữ khóa suốt lúc gửi. Trước **mỗi** thao tác gõ, kiểm chốt chặn kép (đã thử thật): tên nhóm đang chọn (`.conv-item.selected .conv-item-title__name`) bằng đúng nhóm đích **và** `placeholder` của `#richInput` kết thúc bằng "tới <nhóm đích>". Trình tự:

1. Mở nhóm đích bằng ô tìm kiếm rồi bấm `.conv-item` (như `clickConversation`); chốt chặn.
2. Nếu `#richInput` **không** có class `empty` (đang có chữ dở, thường do người dùng): hoãn, không gửi; thử lại ở vòng sau, quá hạn thì bỏ.
3. Focus `#richInput`; chốt chặn; `Input.insertText` với câu trả lời; kiểm `#richInput` chứa đúng chữ vừa chèn.
4. Chốt chặn lần cuối; Enter bằng `Input.dispatchKeyEvent`.
5. Xác nhận: `#richInput` trở lại `empty` và dòng cuối của khung chat chứa câu vừa gửi.
6. Mở lại cuộc trò chuyện đang mở trước đó (chỉ điều hướng, không gõ).

Lỗi ở bước 1 đến 3: không gửi gì, ghi log. Lỗi sau khi đã chèn chữ mà chưa gửi: xóa bản nháp (chỉ khi chốt chặn vẫn đúng nhóm đích). Lỗi ở bước 5 (không xác nhận được): ghi cảnh báo, **không tự gửi lại** (tránh gửi trùng).

## 8. Chống vòng lặp và tin thừa

- `bot:chat` không phản ứng với tin `isSelf`.
- Sổ `data/.chat-sent.json` ghi (nhóm, nội dung, thời điểm) các câu vừa gửi. `bot:watch`, khi thấy một tin `isSelf` khớp một mục trong sổ (trong vòng 2 phút), bỏ qua nó ở **cả hai luồng**: không xếp hàng cào, không vào hộp thư chat. Nhờ vậy câu trả lời của bot không làm runner đi cào và không bị bot tự trả lời.
- Tin của chính tài khoản mà **không** khớp sổ (người dùng tự gõ) vẫn xếp hàng cào như hiện tại, nhưng không vào hộp thư chat.

## 9. An toàn

- Danh sách nhóm là whitelist nằm trong JSON và phải thuộc `config.targets`.
- `dryRun` để xem trước mà không gửi.
- Công tắc dừng nhanh: tồn tại file `data/.chat-off` thì `bot:chat` không gửi gì (vẫn đọc hộp thư và ghi log).
- Giới hạn tốc độ và bỏ tin quá hạn (mục 5).
- Chốt chặn kép trước mỗi lần gõ (mục 7). Nếu bất kỳ chốt nào sai, hủy toàn bộ.
- Tài khoản dùng cho bot nên là tài khoản dành riêng: việc tự động gửi có thể bị Zalo coi là bất thường.

## 10. Mở rộng lên 50 đến 100 nhóm

Nút cổ chai duy nhất là **một cửa sổ Zalo chỉ mở được một cuộc trò chuyện**; cào và gửi xếp hàng dùng chung khóa. Phiên bản đầu (độ trễ chấp nhận vài phút): `bot:chat` xin khóa theo từng lần gửi và chờ nếu runner đang giữ. Khi số nhóm tăng và độ trễ trở thành vấn đề, làm theo thứ tự (không thuộc phiên bản đầu):

1. Runner nhả khóa giữa các nhóm thay vì giữ cả vòng.
2. Chat được ưu tiên hơn cào (runner nhường sau nhóm hiện tại khi có tin chờ trả lời).
3. Nếu vẫn chưa đủ: một tiến trình sở hữu giao diện duy nhất có hàng ưu tiên; runner và chat chỉ gửi việc cho nó.

Hộp thư JSONL cần xoay tệp khi lớn (giữ con trỏ theo số dòng hoặc tên tệp).

## 11. Kiểm thử

Chỉ hàm thuần và phụ thuộc tiêm được; phần gửi qua Zalo kiểm bằng chạy thật ở `bot test`.

- Nạp và kiểm JSON: nhóm ngoài `config.targets`, `id` trùng, `when` rỗng, `reply` rỗng, `version` lạ.
- Khớp tình huống: `mayLoi` với số máy lỗi 0, lớn hơn 0, `IT bảo trì`, có ghi chú; từ khóa không dấu và hoa thường; báo cáo bình thường không khớp; thứ tự và dừng ở tình huống đầu tiên.
- Cooldown và giới hạn tốc độ, tin quá hạn, tin đã xử lý.
- Con trỏ hộp thư: đọc tiếp đúng vị trí, dòng hỏng bị bỏ qua, tệp thiếu.
- Sổ tin đã gửi: nhận đúng tin dội lại, không nhận nhầm tin người dùng gõ.
- Chốt chặn gửi: tên nhóm sai, placeholder sai, ô soạn tin đang có chữ.

## 12. Giả định

- Độ trễ chấp nhận được là vài phút (chưa được người dùng chọn rõ; giả định phương án đơn giản).
- Với "máy lỗi", JSON mẫu có cả hai tình huống: theo báo cáo phân tích (`mayLoi`) và theo từ khóa; người dùng giữ hoặc xóa từng cái.
- Chưa thử gửi tiếng Việt có dấu, nhiều dòng và `@tên` qua `Input.insertText` (lần thử trước dùng chữ không dấu). Phải thử ở `bot test` trước khi triển khai; nếu lỗi, chuyển sang gửi từng ký tự bằng `Input.dispatchKeyEvent` kiểu `char`.
- Tin mới đến qua WebSocket luôn có nội dung chữ; khi WebSocket mất, `bot:chat` không nhận gì và không trả lời (an toàn hơn đoán từ popup).
