# Tin mẫu của nhóm trường (đã ẩn danh)

Lấy từ kho tin `data/g*.json` ngày 2026-10-06. Tên người đã đổi thành `<tên GV>`.

## BÁO CÁO ĐẦU BUỔI DẠY

```
BÁO CÁO ĐẦU BUỔI DẠY
- Tên Giáo Viên: <tên GV>
- Tên Trợ Giảng:
- Phòng Máy: PM1
- Tổng số máy: 36
- Tổng số máy bị lỗi: 5
- Số máy còn thiếu cho HS: 5
- Tình trạng Netsupport: T
- Tình trạng Loa, Âm ly: B
- Tình trạng máy lạnh, máy quạt: B
- GV Quản Nhiệm có mặt tại lớp: Không
```

Không có dòng `Tình trạng Internet`.

## BÁO CÁO CUỐI BUỔI DẠY

```
BÁO CÁO CUỐI BUỔI DẠY
- Tên giáo viên: <tên GV>
- Tên trợ giảng: Không
  Phòng máy: PM1
 Tổng số máy: 36
 Số lượng HS: 12A4(24/27), 12A5(20/21)
 Tỷ lệ học sinh có tài liệu:  100%
 Tổng số máy bị lỗi:  5
 Số máy còn thiếu cho HS: 0
 Tình trạng Netsupport: T
 Tình trạng Internet: T
 Tình trạng loa, âm ly: B
 Tình trạng máy lạnh, máy quạt: B
 Đã tắt các thiết bị điện chưa: Đ
 Ghế ngồi HS được sắp xếp gọn gàng: N
 Vệ sinh phòng máy: S
 Việc tuân thủ nội quy của HS: T
 Danh sách vi phạm: K
```

Dòng đầu tiên có gạch đầu dòng, các dòng sau có thể chỉ có khoảng trắng đầu dòng. Bộ đọc chấp nhận cả hai.

## BÁO CÁO CHUYÊN MÔN (bot không đọc)

```
BÁO CÁO CHUYÊN MÔN
- Tên Giáo Viên: <tên GV>
- Lớp: 12A5
- Môn: Mos Word 2019
- Tài liệu dạy: Tin Học Đại Dương
- Nội dung dạy: OTTH
- Số tiết dự kiến: 60
- Số tiết đã dạy: 8
- Số lần hoàn thành 100% TH: 0
- Tỷ lệ kết quả điểm Gmetrix: GMT1 (0%), GMT2(0%), GMT3(0%)
```

Mỗi lớp một tin; có tin tiêu đề `BÁO CÁO CHUYÊN MÔN 1` và `BÁO CÁO CHUYÊN MÔN 2`.

## Các tin ngắn (bot không đọc)

```
Đã bàn giao PM1 cho bộ phận IT.
Báo cáo giáo viên nghỉ trưa ở phòng máy
Báo cáo: PM1 đa số máy bị lỗi office, học sinh không thực hành được. Nhờ bộ phận kỹ thuật hỗ trợ ạ.
```

## Tên dính liền tiêu đề

Một số tin có tên người đứng liền ngay trước dòng đầu, không có khoảng cách:

```
Phương AnhBÁO CÁO ĐẦU BUỔI DẠY
ƯuBÁO CÁO CHUYÊN MÔN
Minh TríBÁO CÁO CUỐI BUỔI DẠY
<tên>Báo cáo: PM1 đa số máy bị lỗi office ...
```

Hệ quả: bộ đọc không nhận ra tiêu đề chuẩn, tin được đưa vào mục cần xem với lý do `gan_giong_tieu_de` (xem skill `xu-ly-muc-can-xem`). CHƯA XÁC NHẬN: nguyên nhân (nghi là tin trả lời/trích dẫn trong Zalo).

## Số liệu ảnh trong kho hiện có

| Nhóm | Tổng tin | Tin ảnh | Ảnh có `url` |
|---|---|---|---|
| `LC_QuangTrungNguyễnHuệ_Q5` | 96 | 65 | 52 |
| `LC_TríTuệViệt_BTAN` | 187 | 103 | 92 |
| `LC_HoaSen1_TĐ` | 192 | 109 | 91 |
| `LC_ChuVănAn_BTAN` | 87 | 21 | 19 |
