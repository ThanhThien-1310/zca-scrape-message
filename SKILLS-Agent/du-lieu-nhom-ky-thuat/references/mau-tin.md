# Tin mẫu của nhóm kỹ thuật (đã ẩn danh)

Lấy từ nhóm thử `bot test`. Tên người, tên trường đã đổi thành chỗ trống.

## BÁO CÁO CUỐI BUỔI (vệ sinh)

```
BÁO CÁO CUỐI BUỔI
Tên trường: <tên trường> - <mã khu vực>
- Tổng số PM:3 (Trường: PM2, PM3, Cty: PM1)
- Tên IT: <tên IT>

* Phòng máy: PM1 (P. Vi Tính 1)
- Tổng số máy: 49 (bao gồm máy GV)
- Hệ điều hành: Windows 10 x64-bit
- TS máy hoạt động: 48/49
- TS máy chưa sửa: 1
- Netsupport: Có
- Internet: Có
- Hệ thống điện: Có
- Tình trạng camera: Có
- Tình trạng loa, micro: Có
- Tình trạng máy lạnh: Có
- Vệ sinh sạch sẽ: Có
- Ảnh, video phòng máy: Có
- Đã hoàn thành: Đã hoàn thành

* Phòng máy: PM3 (P. Vi Tính 3)
...(lặp lại các dòng như trên)
**Đề xuất: Không
```

Mỗi `* Phòng máy:` là một khối, mỗi khối thành một dòng của file VỆ SINH. Dòng đầu của tin phải đúng `BÁO CÁO CUỐI BUỔI`, không thêm chữ.

## BÁO CÁO ĐIỂM DANH

```
BÁO CÁO ĐIỂM DANH
- Tên NV IT thực tập: <tên>
- Thời gian đến nơi: 14h00
- Nơi làm việc: <tên trường>
<mã khu vực, có thể nằm ở dòng kế>
```

## LỖI ĐIỆN

```
LỖI ĐIỆN
- Trường: <tên trường, có thể để trống>
- Khu vực: <khu vực, có thể để trống>
- Phòng Máy: PM1
- Tình trạng: <T|B|K hoặc mô tả, có thể để trống>
```

Để trống `Trường` và `Khu vực` thì bot lấy từ tên nhóm.

## Tin của bot (không phải báo cáo)

```
Đã nhận thông tin có máy lỗi.
```

Tin này có `isSelf: true`, do `bot:chat` gửi theo `chat-rules.json`.
