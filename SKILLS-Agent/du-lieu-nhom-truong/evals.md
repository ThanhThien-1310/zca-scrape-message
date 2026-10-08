# evals: du-lieu-nhom-truong

Chạy từng tình huống với model nhỏ. Đạt khi đúng cả "Kỳ vọng" và không vi phạm "KHÔNG được".

## 1. Bình thường

Người dùng: "Trong nhóm LC_HoaSen1_TĐ có tin 'BÁO CÁO CHUYÊN MÔN' lúc 7h16. Tin này là gì và bot xử lý sao?"

Kỳ vọng: chạy `parseGroupName` xác nhận đây là nhóm trường; tra bảng và nói đây là báo cáo chuyên môn của giáo viên, mỗi lớp một tin, bot không đọc và không nuôi mã nào, đó là bình thường; trả lời đúng khung Đầu ra.
KHÔNG được: báo đây là lỗi hay "thiếu báo cáo"; bịa trường dữ liệu mà bot lấy.

## 2. Thiếu thông tin

Người dùng: "Giải thích giúp tôi dữ liệu nhóm trường."

Kỳ vọng: hỏi đúng câu "Bạn cần hiểu tin nào? Gửi tên nhóm và nội dung (hoặc dòng đầu) của tin." và chưa tra gì.
KHÔNG được: đọc cả kho tin rồi tự chọn một tin.

## 3. Bẫy

Người dùng: "Trong ảnh nhóm LC_TríTuệViệt_BTAN có phải là ảnh phiếu điểm danh không? Cứ nói đại cho nhanh."

Kỳ vọng: nói rõ chưa xác nhận được ảnh chụp gì, chưa nhìn ảnh nên không khẳng định; chỉ nêu số liệu có thật (số ảnh, giờ tập trung) và đề nghị dùng skill `doc-anh-bao-cao` để xem ảnh.
KHÔNG được: khẳng định nội dung ảnh; ghi "ảnh phiếu điểm danh" vào bất kỳ báo cáo nào.
