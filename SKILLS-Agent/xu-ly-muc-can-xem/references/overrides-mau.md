# Dạng `output/<id>/overrides.json`

Mảng JSON (UTF-8). Mỗi phần tử:

```json
{
  "key": { "maNhom": "<groupId của tin>", "maTinNhan": "<msgId của tin>" },
  "sua": { "<trường>": <giá trị> }
}
```

`maNhom` và `maTinNhan` lấy từ `key` của mục trong file review (không tự gõ lại từ trí nhớ).

## Các trường của `sua` (chỉ ghi trường cần đổi)

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `loaiBo` | `true` | Bỏ tin này, không coi là báo cáo |
| `loaiBaoCao` | `"DauBuoi"` hoặc `"CuoiBuoi"` | Chốt loại báo cáo cho tin có tiêu đề không chuẩn |
| `phongMay` | chuỗi hoặc `null` | Tên phòng máy |
| `giaoVien` | chuỗi hoặc `null` | Tên giáo viên |
| `truong` | `{ "capHoc", "tenRieng", "coSo" }` hoặc `null` | Trường học |
| `khuVuc` | chuỗi hoặc `null` | Khu vực |
| `thieu` | số nguyên hoặc `null` | Số máy còn thiếu cho học sinh |
| `loi` | số nguyên hoặc `null` | Tổng số máy bị lỗi |
| `ghiChuLoi` | chuỗi hoặc `null` | Ghi chú về máy lỗi |
| `amThanh`, `netSupport`, `mayLanh`, `internet` | `"T"`, `"B"`, `"K"` hoặc `null` | Xếp loại từng hạng mục |

Đặt trường bằng `null` nghĩa là "để trống có chủ ý" (khác với không ghi trường đó).

## Ví dụ

Chốt một tin có tên người dính liền tiêu đề:

```json
{ "key": { "maNhom": "g5639872021926770946", "maTinNhan": "bb_msg_id_1" }, "sua": { "loaiBaoCao": "DauBuoi" } }
```

Sửa số máy lỗi không đọc ra số, giữ chữ ghi chú:

```json
{ "key": { "maNhom": "g5639872021926770946", "maTinNhan": "bb_msg_id_2" }, "sua": { "loi": 3, "ghiChuLoi": "máy 35 không lên; máy 41 hỏng màn hình" } }
```

Bỏ một tin không phải báo cáo:

```json
{ "key": { "maNhom": "g5639872021926770946", "maTinNhan": "bb_msg_id_3" }, "sua": { "loaiBo": true } }
```

## Lỗi thường gặp

- File không phải mảng, hoặc JSON hỏng: dựng lại báo `is not valid JSON` hoặc `must be a JSON array`. Sửa file rồi chạy lại.
- Một mục thiếu `key.maNhom`, `key.maTinNhan` hoặc `sua`: báo `entry <n> must look like ...`.
- `key` không khớp tin nào: dựng lại in cảnh báo "override cho maNhom=... không khớp tin nhắn nào".
