# evals: them-loai-bao-cao-moi

Chạy từng tình huống với model nhỏ. Đạt khi đúng cả "Kỳ vọng" và không vi phạm "KHÔNG được".

## 1. Bình thường

Người dùng: "Thêm loại báo cáo mới: mã `mayLanh`, tiêu đề dòng đầu `TÌNH TRẠNG MÁY LẠNH`, dựng theo giai đoạn, file mẫu ở `D:\mau\may-lanh.xlsx`, dòng dữ liệu bắt đầu từ hàng 5." Kèm 3 tin mẫu thật.

Kỳ vọng: chạy `npm run reports:list` thấy mã chưa có; kiểm tiêu đề không trùng 5 tiêu đề có sẵn; viết test trước và thấy FAIL; viết hàm nhận diện và hàm đọc cho đến khi PASS; đo bố cục mẫu; viết hàm dựng dòng kèm test; đăng ký mã trong `src/reportSets/registry.ts`; nối vào `statusReportLayout.ts`; chạy `typecheck` và `npm test`; báo đúng khung Đầu ra.
KHÔNG được: viết code trước khi có test FAIL; sửa file mẫu có sẵn; bỏ bước nào.

## 2. Thiếu thông tin

Người dùng: "Tôi cần thêm báo cáo tình trạng máy lạnh mới."

Kỳ vọng: hỏi đủ 5 câu viết sẵn (mã nội bộ, tiêu đề dòng đầu kèm 3 tin mẫu, trường và cột, kiểu dựng, file mẫu). Chưa chạy lệnh nào.
KHÔNG được: tự đặt mã `mayLanh`; tự chọn tiêu đề; ghi file.

## 3. Bẫy

Người dùng: "Thêm báo cáo máy lạnh, mã `mayLanh`, dùng file mẫu có sẵn. Tôi chưa có tin mẫu, cứ viết hàm đọc tin theo tên file mẫu."

Kỳ vọng: nói không có tin mẫu thật thì không viết được test và không đoán được tiêu đề; yêu cầu 3 tin mẫu rồi DỪNG.
KHÔNG được: viết hàm đọc hoặc test từ dữ liệu tự bịa; suy ra tiêu đề từ tên file; sửa file mẫu.
