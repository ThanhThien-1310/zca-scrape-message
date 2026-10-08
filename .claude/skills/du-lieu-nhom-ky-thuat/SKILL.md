---
name: du-lieu-nhom-ky-thuat
description: Giải thích cấu trúc dữ liệu đầu vào của NHÓM KỸ THUẬT (nhân viên IT gửi báo cáo vệ sinh phòng máy, điểm danh thực tập, lỗi điện): các loại tin, tin nào bot đọc và nuôi báo cáo nào. Dùng khi cần hiểu hay phân loại một tin của IT, hoặc kiểm tra tin có đúng định dạng không. KHÔNG dùng khi tin đến từ nhóm trường (giáo viên báo cáo đầu/cuối buổi dạy) hoặc khi cần cấu trúc file Excel đầu ra.
---

# Dữ liệu nhóm kỹ thuật

Thuật ngữ: nhóm kỹ thuật = nhóm Zalo mà nhân viên IT gửi báo cáo; mã = mã báo cáo trong `npm run reports:list`.

CHƯA XÁC NHẬN: tên các nhóm kỹ thuật thật. Kho tin hiện chưa có nhóm kỹ thuật nào trong `config.targets`; ba loại tin dưới đây lấy từ nhóm thử `bot test` và từ code đọc tin.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| Tin cần giải thích | "Bạn cần hiểu tin nào? Gửi nội dung (hoặc dòng đầu) của tin." |

## Các bước (tra cứu)

1. Lấy dòng đầu của tin (bỏ dòng trống, không phân biệt hoa thường và dấu) và tra bảng Loại tin.
2. Dòng đầu là `BÁO CÁO CUỐI BUỔI` đúng nguyên dòng: tin vệ sinh của IT. Có thêm chữ `DẠY` phía sau: đó là báo cáo của giáo viên nhóm trường, dùng skill `du-lieu-nhom-truong`.
3. Tin có `isSelf` là `true` là tin do bot gửi (trả lời tự động), không phải báo cáo.
4. Dòng đầu không có trong bảng: báo "loại tin chưa biết" và dừng, không gán loại.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, kết quả thực tế).

## Loại tin (tra theo dòng đầu)

| Dòng đầu | Người gửi | Bot đọc? | Nuôi mã | Các dòng bot lấy |
|---|---|---|---|---|
| `BÁO CÁO CUỐI BUỔI` | IT kỹ thuật | Có | `cleaning` | `Tên trường` (dạng `<trường> - <mã khu vực>`), `Tên IT`, mỗi khối `Phòng máy:` lấy tên phòng và `Vệ sinh sạch sẽ` |
| `BÁO CÁO ĐIỂM DANH` | nhân viên IT thực tập | Có | `attendance` | `Tên NV IT thực tập`, `Nơi làm việc`; dòng `Thời gian đến nơi` phải có và không rỗng |
| `LỖI ĐIỆN` | CHƯA XÁC NHẬN | Có | `dien` | `Trường`, `Khu vực`, `Phòng Máy`, `Tình trạng` |

Chi tiết từng dòng và cách đọc: xem `src/lesson/cleaningReport.ts`, `attendanceReport.ts`, `electricReport.ts`. Không chép lại ở đây.

## Điểm cần nhớ

- Điểm danh: giờ đến tính từ GIỜ GỬI THẬT mà Zalo ghi nhận, không tính từ giờ người gửi tự ghi trong dòng `Thời gian đến nơi` (code ghi đã xác nhận với người dùng).
- `LỖI ĐIỆN`: nếu `Trường` hoặc `Khu vực` để trống thì bot lấy từ TÊN NHÓM. Dòng `Tình trạng` là `T`, `B` hoặc `K` thì vào cột xếp loại; chữ khác vào cột hiện trạng.
- Tin vệ sinh có nhiều dòng khác (hệ điều hành, RAM, camera...). Bot không lấy; dòng nào được lấy xem `cleaningReport.ts`.
- Tin trả lời của bot (`isSelf: true`, ví dụ "Đã nhận thông tin có máy lỗi.") không được đưa vào báo cáo.

## Quy tắc cứng

- Phân loại tin chỉ bằng dòng đầu. KHÔNG suy ra loại tin từ người gửi hay giờ gửi.
- KHÔNG gán loại cho tin không có trong bảng.
- Nguồn sự thật là code. Bảng trên chỉ để tra nhanh; lệch với code thì theo code và báo người dùng.
- KHÔNG đưa tên người thật hay số liệu trường vào ví dụ.

## Đầu ra

```
Loại tin: <loại>. Bot đọc: <có|không>. Nuôi mã: <mã|không có>.
Dòng bot lấy: <danh sách>. Lưu ý: <bất thường, hoặc "không">.
```

## Khi không chắc

Dừng và hỏi: "Tin này có dòng đầu '<dòng đầu>', không có trong bảng loại tin. Đây là loại tin gì và ai gửi?" Không đoán.

## Ví dụ

Đúng: `BÁO CÁO CUỐI BUỔI DẠY` trong nhóm kỹ thuật → báo cáo của giáo viên (không phải vệ sinh), dùng `du-lieu-nhom-truong`.
Sai: coi `BÁO CÁO CUỐI BUỔI DẠY` là tin vệ sinh — vì vệ sinh chỉ nhận đúng nguyên dòng `BÁO CÁO CUỐI BUỔI`.

## Tham chiếu (chỉ đọc khi cần)

- `references/mau-tin.md`: tin mẫu đã ẩn danh của ba loại.
