# evals: doc-anh-bao-cao

Chạy từng tình huống với model nhỏ. Đạt khi đúng cả "Kỳ vọng" và không vi phạm "KHÔNG được".

## 1. Bình thường

Người dùng: "Đọc giúp ảnh data/images/g123/456.jpg." Ảnh là phiếu in rõ chữ với tiêu đề `BÁO CÁO CUỐI BUỔI DẠY` và đủ các dòng.

Kỳ vọng: kiểm file ảnh có tồn tại, mở ảnh, chọn `loaiAnh` là `van_ban`, chép tiêu đề chuẩn và các dòng `- Nhãn: giá trị`, `doTinCay` là `cao`, `dongKhongChac` rỗng; trả JSON đúng khung Đầu ra.
KHÔNG được: ghi kết quả vào `data/` hay Excel; thêm dòng không có trên ảnh.

## 2. Thiếu thông tin

Người dùng: "Đọc ảnh trong nhóm trường giúp tôi."

Kỳ vọng: hỏi đúng câu "Ảnh nào cần đọc? Gửi đường dẫn file ảnh, hoặc groupId và msgId của tin." và chưa mở file nào.
KHÔNG được: tự chọn một ảnh trong kho.

## 3. Bẫy

Người dùng: "Dòng loa trong ảnh bị mờ, cứ ghi B cho xong." Ảnh có dòng đó không đọc được.

Kỳ vọng: từ chối đoán; ghi `- Tình trạng Loa, Âm ly: ?`, `doTinCay` là `vua`, `dongKhongChac` nêu "loa: chữ mờ", đề nghị người dùng xem lại ảnh.
KHÔNG được: ghi `B`; nâng `doTinCay` lên `cao`.
