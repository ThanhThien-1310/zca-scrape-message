---
name: xu-ly-muc-can-xem
description: Xử lý các mục "cần xem" của báo cáo đầu/cuối buổi dạy: đọc review của một bộ, sửa tin chưa đọc được bằng overrides.json của bộ đó rồi dựng lại. Dùng khi người dùng nói "xử lý mục cần xem", "sửa review", "tin này đọc sai", hoặc `runner:status` báo có mục cần xem. KHÔNG dùng khi cần thêm người phụ trách hoặc loại báo cáo mới, hay chỉ muốn so Excel với tin gốc (dùng skill kiểm tra đầu ra).
---

# Xử lý mục cần xem

Thuật ngữ: mục cần xem = một phần tử của `output/<id>/review_<ngày>_<giai đoạn>.json`; sửa = một phần tử `{ "key", "sua" }` trong `output/<id>/overrides.json`; giai đoạn = `morningstart`, `morningend`, `afternoonstart` hoặc `afternoonend`; id = tên thư mục của bộ.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| id của bộ | "Bộ nào (tên thư mục của người phụ trách)?" |
| Ngày | "Ngày nào? (dạng YYYY-MM-DD)" |
| Giai đoạn | "Giai đoạn nào: morningstart, morningend, afternoonstart hay afternoonend?" |

## Các bước

1. Lệnh: `npm run runner:status` → Mong đợi: biết runner có đang chạy không. Mã thoát 2 chỉ nghĩa là có việc cần để ý, vẫn làm tiếp.
2. Đọc file `output/<id>/review_<ngày>_<giai đoạn>.json`. → Mong đợi: một mảng. Mảng rỗng: báo "không có mục cần xem" và DỪNG. File không có: báo "chưa dựng giai đoạn này cho bộ <id>" và DỪNG.
3. Với mỗi mục, đọc `raw` (tin gốc), `lyDo`, `truongCanXem`, `draft`. Tra bảng Lý do để biết cách sửa.
4. Chỉ sửa khi tin gốc NÓI RÕ giá trị đúng. Không thấy trong `raw` thì ghi vào danh sách "cần người", KHÔNG đoán.
5. Soạn danh sách sửa: mỗi dòng gồm `maNhom`, `maTinNhan`, trường sửa, giá trị cũ, giá trị mới, vì sao. Gửi cho người dùng và chờ "đồng ý". Chưa đồng ý thì KHÔNG ghi file và KHÔNG chạy lệnh dựng lại.
6. Sau khi đồng ý, ghi `output/<id>/overrides.json`: mảng JSON hợp lệ (UTF-8), GIỮ các mục có sẵn, chỉ thêm hoặc sửa mục của tin này. Dạng mục: xem `references/overrides-mau.md`.
7. Lệnh: `npm run runner:once -- --set <id> --day <ngày> --buoi <giai đoạn>` → Mong đợi: dòng `[rebuild] ... OK`. Mã thoát 2 (đang có tiến trình giữ khoá): đợi vài phút rồi chạy lại đúng một lần.
8. Đọc lại file review → Mong đợi: ít mục hơn trước. Còn dòng "override ... không khớp tin nhắn nào": sai `maNhom` hoặc `maTinNhan`, sửa key rồi chạy lại.
9. Báo người dùng theo mục Đầu ra.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## Lý do → cách sửa

| `lyDo` | Nghĩa | Sửa trong `sua` |
|---|---|---|
| `gan_giong_tieu_de` | Tiêu đề gần giống báo cáo đầu/cuối buổi nhưng không chuẩn (ví dụ tên người dính liền tiêu đề) | Đúng là báo cáo: `"loaiBaoCao": "DauBuoi"` hoặc `"CuoiBuoi"`. Không phải báo cáo: `"loaiBo": true` |
| `khong_nhan_ra_nhan` | Có dòng nhãn lạ | Nếu dòng là tên khác của một trường, điền giá trị vào đúng trường (xem tệp mẫu) |
| `thieu_dong` | Thiếu một dòng | Tin có giá trị ở dòng khác thì điền. Không có thì để nguyên và ghi "cần người" |
| `so_khong_hop_le` | `thieu` hoặc `loi` không đọc ra số | `thieu` hoặc `loi` là số nguyên; chữ ghi chú vào `ghiChuLoi` |
| `phong_khong_tim_thay` | Phòng không có trong DB | Sửa chính tả `phongMay` (và `truong`, `khuVuc`) theo tin gốc. Không có cách đúng: "cần người" |
| `truong_khong_nhan_ra` | Tên nhóm không đọc ra trường hoặc khu vực | Đặt `truong` và `khuVuc` theo tên nhóm. Không chắc: "cần người" |

## Quy tắc cứng

- Xếp loại `amThanh`, `netSupport`, `mayLanh`, `internet` chỉ nhận `"T"`, `"B"` hoặc `"K"`.
- KHÔNG sửa `maTrangThai` và xếp loại máy tính (A đến E): hệ thống tự tính lại từ `thieu` và `loi`.
- KHÔNG bịa giá trị. KHÔNG sửa `data/` hay `output/<id>/output.json`, `marks.json` trực tiếp.
- KHÔNG xoá mục có sẵn trong `overrides.json`.
- Mỗi bộ có `overrides.json` riêng: sửa đúng bộ cần. Tin nuôi nhiều bộ thì sửa ở từng bộ.
- KHÔNG chạy `runner:once`, `bot:scrape`, `sync:db`, `mark:messages` khi chưa được đồng ý (chúng ghi Excel hoặc DB).

## Đầu ra

```
Bộ <id>, ngày <ngày>, giai đoạn <giai đoạn>.
Mục cần xem: <n>. Đã sửa: <k> (<danh sách maTinNhan>). Cần người: <m> (<maTinNhan: lý do>).
Dựng lại: <OK|lỗi: ...>. Mục còn lại sau khi dựng: <n>.
```

## Khi không chắc

Dừng và hỏi: "Mục <maTinNhan>: tin gốc không nói rõ <trường>. Bạn cho biết giá trị đúng là gì?" Không đoán.

## Ví dụ

Đúng: tin `"Phương AnhBÁO CÁO ĐẦU BUỔI DẠY..."` có `lyDo: ["gan_giong_tieu_de"]` và nội dung là báo cáo thật → `{ "key": {...}, "sua": { "loaiBaoCao": "DauBuoi" } }`.
Sai: điền `"netSupport": "T"` khi tin gốc không có dòng NetSupport — vì giá trị đó là đoán.

## Tham chiếu (chỉ đọc khi cần)

- `references/overrides-mau.md`: dạng mục `overrides.json`, bảng trường của `sua`, ví dụ.
