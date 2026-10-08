---
name: doc-anh-bao-cao
description: Đọc chữ trong MỘT ảnh của tin nhắn (`chat.photo`) và chép thành tin báo cáo chuẩn kèm độ tin cậy, không đoán chỗ không đọc được. Dùng khi người dùng đưa một ảnh hoặc tin ảnh và nhờ đọc nội dung, hoặc cần biết ảnh có phải báo cáo không. KHÔNG dùng khi tin là tin chữ, hoặc khi cần ghi kết quả vào dữ liệu hay Excel (skill này chỉ trả kết quả đọc).
---

# Đọc ảnh báo cáo

Thuật ngữ: ảnh = tin có `msgType` là `chat.photo`; tin chuẩn = tin chữ có dòng đầu là tiêu đề báo cáo và các dòng `- Nhãn: giá trị` (xem skill `du-lieu-nhom-truong` và `du-lieu-nhom-ky-thuat`).

CHƯA XÁC NHẬN: loại ảnh thật trong các nhóm (chụp phiếu, chụp màn hình, ảnh thiết bị, chữ viết tay) và nơi lưu kết quả đọc. Hiện chưa có code lưu kết quả AI nên skill này CHỈ trả kết quả trong câu trả lời.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| Ảnh cần đọc | "Ảnh nào cần đọc? Gửi đường dẫn file ảnh, hoặc `groupId` và `msgId` của tin." |
| Loại báo cáo dự kiến (nếu biết) | "Bạn nghĩ ảnh này là báo cáo nào, hay chưa biết?" |

## Các bước

1. Tìm file ảnh. Cho `groupId` và `msgId`: đọc tin trong `data/<groupId>.json`, lấy trường `url`, đường dẫn là `data/<url>` (ví dụ `data/images/<groupId>/<id>.jpg`). → Mong đợi: file tồn tại. Tin không có `url` hoặc file không có: DỪNG và báo "ảnh chưa được tải về".
2. Mở ảnh bằng công cụ đọc file ảnh. → Mong đợi: nhìn thấy ảnh.
3. Chọn `loaiAnh`: `van_ban` (có chữ in hoặc viết tay của một báo cáo), `thiet_bi` (ảnh phòng máy, thiết bị, không có chữ báo cáo), `khong_ro`.
4. Nếu `thiet_bi`: trả `noiDung: null`, KHÔNG mô tả suy đoán. Nếu `khong_ro`: dừng và hỏi người dùng.
5. Nếu `van_ban`: chép chữ đọc được. Dòng đầu là tiêu đề báo cáo chuẩn nếu khớp một loại đã biết; mỗi dòng sau dạng `- Nhãn: giá trị`. Chữ không đọc rõ: viết `?` thay cho giá trị, KHÔNG đoán.
6. Chấm `doTinCay`: `cao` khi mọi dòng đều đọc rõ; `vua` khi có từ 1 đến 2 dòng phải ghi `?`; `thap` khi có từ 3 dòng trở lên phải ghi `?`, hoặc ảnh viết tay, mờ, xiên.
7. Ghi mỗi dòng đã ghi `?` hoặc đọc không chắc vào `dongKhongChac` kèm lý do.
8. Trả kết quả theo mục Đầu ra. `doTinCay` là `thap` thì nói rõ cần người xem lại ảnh.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, kết quả thực tế).

## Quy tắc cứng

- KHÔNG đoán chữ không đọc được. Viết `?`.
- KHÔNG bịa tiêu đề: nếu không khớp loại báo cáo đã biết thì `tieuDe` là `null`.
- KHÔNG nêu tên người thật trong `ghiChu`; trong `noiDung` chỉ chép đúng chữ trên ảnh.
- KHÔNG ghi vào `data/`, DB hay Excel. KHÔNG sửa hay xoá file ảnh.
- Ảnh `thiet_bi` thì KHÔNG nói tình trạng thiết bị (tốt, hỏng).

## Đầu ra

```json
{
  "msgId": "<msgId hoặc null>",
  "groupId": "<groupId hoặc null>",
  "loaiAnh": "van_ban | thiet_bi | khong_ro",
  "tieuDe": "<tiêu đề chuẩn hoặc null>",
  "noiDung": "<các dòng, ngăn cách bằng \\n, hoặc null>",
  "doTinCay": "cao | vua | thap",
  "dongKhongChac": ["<nhãn>: <lý do>"],
  "ghiChu": ""
}
```

## Khi không chắc

Dừng và hỏi: "Ảnh này tôi không chắc là <báo cáo hay ảnh thiết bị>. Bạn cho biết đây là ảnh gì?" Không đoán.

## Ví dụ

Đúng: ảnh chụp phiếu in có dòng "Tình trạng Netsupport: T" nhưng dòng loa bị mờ → `noiDung` có `- Tình trạng Loa, Âm ly: ?`, `doTinCay` là `vua`, `dongKhongChac` ghi "loa: chữ mờ".
Sai: ghi `- Tình trạng Loa, Âm ly: B` vì "thường là B" — vì đó là đoán.
