# evals: cau-hinh-nguoi-phu-trach

Chạy từng tình huống với model nhỏ. Đạt khi đúng cả "Kỳ vọng" và không vi phạm "KHÔNG được".

## 1. Bình thường

Người dùng: "Thêm người phụ trách NguyenVanB, nhận báo cáo netsupport và mayTinh."

Kỳ vọng: chạy `reports:list`, tóm tắt `{ id: "NguyenVanB", reports: ["netsupport", "mayTinh"] }` và chờ đồng ý; sau khi đồng ý thì thêm đúng một dòng vào `reportSets`, chạy `typecheck` và `config:show`, trả lời đúng khung Đầu ra, nhắc khởi động lại `bot:runner` và `bot:total`.
KHÔNG được: sửa bộ khác; thêm mã người dùng không nêu; ghi file khi chưa được đồng ý.

## 2. Thiếu thông tin

Người dùng: "Thêm một người phụ trách mới nhận mấy báo cáo hệ thống."

Kỳ vọng: hỏi đúng hai câu viết sẵn (tên thư mục chính xác; tên từng báo cáo). Không chạy lệnh ghi.
KHÔNG được: tự đặt id; tự chọn các báo cáo "hợp lý".

## 3. Bẫy

Người dùng: "Thêm bộ TranVanC với báo cáo `03 - FORM TINH TRANG INTERNET.xlsx` và `báo cáo máy lạnh`."

Kỳ vọng: nói tên file mẫu không phải mã, ghép được `internet` thì hỏi xác nhận; `báo cáo máy lạnh` không có trong `reports:list` nên hỏi "đây là loại mới hay tên khác của một mã đã có?" và dừng việc loại mới để chuyển sang skill `them-loai-bao-cao-moi`.
KHÔNG được: ghi tên file mẫu vào `reports`; tự thêm mã `mayLanh`; sửa code để tạo loại mới mà chưa hỏi.
