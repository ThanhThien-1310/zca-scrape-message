---
name: save-token
description: Khi danh sách task đã đủ và sắp bắt đầu làm, đề xuất cho người dùng từng task dùng model nào và vì sao (rẻ nhất đủ sức) để tiết kiệm token. Dùng khi người dùng giao một danh sách nhiều task hoặc vừa có kế hoạch xong và chưa bắt đầu làm, hoặc nói "save-token", "chọn model cho từng việc". KHÔNG dùng khi chỉ có một task, hoặc người dùng đã chỉ định model cho từng việc.
---

# Tiết kiệm token

Thuật ngữ: task = một việc trong danh sách; tầng = mức khó (1 nhẹ, 2 vừa, 3 khó); giao = chạy task bằng subagent với model đã chọn; làm tại chỗ = tự làm trong phiên hiện tại.

Chạy ĐÚNG MỘT LẦN: sau khi danh sách task đã đủ và TRƯỚC khi làm task đầu tiên. Không chạy giữa chừng.

## Bảng model (người dùng được sửa)

| Tầng | Model (tham số `model` của công cụ Agent) | Mức suy luận | Việc điển hình |
|---|---|---|---|
| 1 nhẹ | `haiku` (Haiku 4.5) | không cần | chạy lệnh rồi báo kết quả, tìm file, đổi tên, sửa đúng một chỗ đã chỉ rõ dòng, định dạng lại |
| 2 vừa | `sonnet` (Sonnet 5.5) | medium; high nếu sửa từ 3 file trở lên | viết hàm và test theo spec rõ, sửa lỗi đã biết nguyên nhân, cập nhật tài liệu |
| 3 khó | `opus` (Opus 5.5) hoặc `sonnet` | high | thiết kế, lỗi chưa rõ nguyên nhân, đổi kiến trúc, xử lý dữ liệu nhạy cảm |

Công cụ Agent không đặt được mức suy luận. Cần mức cao hơn thì chọn model mạnh hơn một bậc.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| Danh sách task | "Danh sách task cần làm là gì, và kết quả cuối cùng bạn muốn thấy là gì?" |
| Danh sách đã đủ | "Danh sách task đã đủ chưa, hay bạn còn việc cần thêm?" |

## Các bước

1. Xác nhận danh sách đã đủ (xem "Cần có trước khi làm"). Chưa đủ: DỪNG, chưa đề xuất.
2. Liệt kê các task, mỗi task một dòng. → Mong đợi: danh sách đánh số, mỗi task làm được độc lập.
3. Xếp tầng cho từng task theo bảng Tín hiệu. Một tín hiệu tầng 3 là đủ để xếp tầng 3. Phân vân giữa hai tầng: chọn tầng cao hơn.
4. Quyết định giao hay làm tại chỗ theo bảng Giao hay không.
5. Đề xuất cho người dùng theo khung Đầu ra, mỗi task có cột "Vì sao". Chờ người dùng trả lời. KHÔNG làm task nào khi chưa có câu trả lời.
6. Người dùng đổi model của task nào thì dùng đúng model họ chọn, không tranh luận. Chỉ đề xuất MỘT lần; sau khi được đồng ý không hỏi lại từng task.
7. Task tầng 3 loại thiết kế hay tính năng mới: gọi skill `superpowers:brainstorming` TRƯỚC khi làm. Task tầng 3 loại lỗi chưa rõ nguyên nhân: gọi `superpowers:systematic-debugging` trước.
8. Giao bằng công cụ Agent với đúng `model`; prompt theo Mẫu prompt giao việc. Kiểm kết quả trước khi tin: chạy lệnh kiểm hoặc đọc diff. → Mong đợi: lệnh kiểm đạt. Chưa kiểm thì chưa coi là xong.
9. Task thất bại hai lần ở một tầng, hoặc subagent trả "không chắc": giao lại ở tầng cao hơn kèm lỗi đã gặp và báo người dùng đã đổi model. KHÔNG thử lần thứ ba ở tầng cũ.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, kết quả thực tế).

## Tín hiệu xếp tầng

| Tín hiệu có trong việc | Tầng |
|---|---|
| Yêu cầu chưa rõ, hoặc phải chọn giữa nhiều phương án | 3 |
| Lỗi chưa biết nguyên nhân | 3 |
| Đổi giao diện giữa các module, hoặc liên quan từ 6 file trở lên | 3 |
| Xoá dữ liệu, bảo mật, ghi vào hệ thống dùng chung | 3 |
| Đã thất bại hai lần ở tầng thấp hơn | 3 |
| Spec rõ, 1 đến 5 file, có test hoặc lệnh để kiểm | 2 |
| Có sẵn đúng lệnh hoặc đúng dòng cần sửa, không cần quyết định | 1 |

## Giao hay không

| Điều kiện | Làm |
|---|---|
| Việc cần ngữ cảnh của cuộc hội thoại này, hoặc chỉ cần 2 lệnh trở xuống | làm tại chỗ |
| Việc độc lập và mô tả được trong 10 dòng | giao |
| Việc xoá, commit, push, hoặc gửi ra ngoài | làm tại chỗ, sau khi hỏi người dùng |

## Mẫu prompt giao việc

```
Mục tiêu: <một câu>.
File liên quan: <đường dẫn>.
Lệnh kiểm khi xong: <lệnh> → phải thấy: <kết quả>.
KHÔNG được: <điều cấm, ví dụ commit, sửa file khác>.
Báo cáo bằng: <định dạng ngắn>. Không chắc chỗ nào thì nói "không chắc: <chỗ>", đừng đoán.
```

## Quy tắc cứng

- Chỉ giao task khi người dùng đã gọi skill này, hoặc CLAUDE.md của dự án đã bật skill này, hoặc người dùng đã cho phép dùng subagent. Bước 5 (chờ người dùng trả lời) vẫn bắt buộc.
- KHÔNG đoán tên model: chỉ dùng các giá trị trong bảng Model.
- KHÔNG giao việc xoá, commit, push cho model tầng 1.
- Kết quả của model rẻ luôn phải được kiểm trước khi dùng.

## Đầu ra

Đề xuất (trước khi làm):
```
| # | Task | Model | Giao/Tại chỗ | Vì sao dùng model này |
```
Cột "Vì sao" ghi: tín hiệu cụ thể của task (lấy từ bảng Tín hiệu) và điều sẽ hỏng nếu dùng model rẻ hơn một tầng. Cuối bảng hỏi: "Bạn đồng ý, hay đổi model của task nào?"

Báo cuối: số task mỗi tầng; task nào đã lên tầng và vì sao; task nào chưa kiểm.

## Khi không chắc

Dừng và hỏi: "Tôi phân vân việc '<việc>' giữa tầng <a> và <b> vì <lý do>. Bạn chọn tầng nào?" Không đoán.

## Ví dụ

Đúng: "Chạy `npm test` và báo số test lỗi" → tầng 1, `haiku`. Vì sao: có sẵn đúng lệnh, không cần quyết định; dùng model mạnh hơn chỉ tốn token.
Sai: giao cho `haiku` việc "thiết kế cách chia dữ liệu theo người" — vì yêu cầu mở, phải xếp tầng 3.
