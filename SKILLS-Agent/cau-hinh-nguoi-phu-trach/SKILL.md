---
name: cau-hinh-nguoi-phu-trach
description: Thêm một người phụ trách (một "bộ" trong `reportSets` của config.ts) để báo cáo của họ ra đúng thư mục riêng. Dùng khi người dùng nói "thêm người phụ trách", "cấu hình cho người mới", "thêm bộ báo cáo", "cho <tên> nhận các báo cáo ...". KHÔNG dùng khi báo cáo cần tạo là LOẠI MỚI chưa có trong `npm run reports:list` (dùng skill `them-loai-bao-cao-moi`).
---

# Cấu hình người phụ trách

Thuật ngữ: bộ = một người phụ trách trong `config.reportSets`; id = tên thư mục của người; mã báo cáo = mã nội bộ trong `npm run reports:list`.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| id | "Tên thư mục của người này viết chính xác thế nào? (ví dụ NguyenVanB)" |
| Danh sách báo cáo | "Người này nhận những báo cáo nào? Cho tôi tên từng báo cáo." |

## Các bước

1. Kiểm tra tính năng. Lệnh: `grep -n reportSets config.ts` → Mong đợi: có mục `reportSets`. Không có: DỪNG, báo "tính năng bộ báo cáo chưa có trên nhánh này".
2. Lấy danh sách mã. Lệnh: `npm run reports:list` → Mong đợi: 7 dòng mã báo cáo. Ghi lại dòng nào có chữ `THIẾU` (mẫu Excel chưa có trên máy).
3. Ghép mỗi báo cáo người dùng nêu với MỘT mã. Không ghép được: hỏi "Báo cáo '<tên>' chưa có trong danh sách mã. Đây là loại mới cần viết code, hay là tên khác của một mã đã có?" Nếu là loại mới: DỪNG và chuyển sang skill `them-loai-bao-cao-moi`.
4. Kiểm id (xem Quy tắc cứng). Vi phạm: hỏi lại id.
5. Tóm tắt cho người dùng: `id` và danh sách `reports` sẽ thêm. Chờ người dùng trả lời "đồng ý". Chưa đồng ý thì KHÔNG sửa file.
6. Sửa `config.ts`: thêm đúng một dòng vào mảng `reportSets`, theo dạng `{ id: "<id>", reports: ["<mã>", "<mã>"] },` → Mong đợi: file lưu, các bộ khác giữ nguyên thứ tự và nội dung.
7. Lệnh: `npm run typecheck` → Mong đợi: không có lỗi.
8. Lệnh: `npm run config:show` → Mong đợi: dòng `<id>: <các mã>` trong mục "BỘ BÁO CÁO ĐANG CHẠY", và KHÔNG có dòng `[bộ báo cáo] LỖI` nào của id này.
9. Báo người dùng theo mục Đầu ra.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## Quy tắc cứng

- `id` hợp lệ khi: không rỗng, không chứa `\ / : * ? " < > |`, không có khoảng trắng đầu hoặc cuối, không kết thúc bằng dấu chấm, không phải `CON PRN AUX NUL COM1-9 LPT1-9`, tối đa 100 ký tự, không trùng id có sẵn (không phân biệt hoa thường).
- `reports` chỉ ghi MÃ báo cáo. KHÔNG ghi tên file mẫu hay tiêu đề.
- KHÔNG thêm mã người dùng không nêu. KHÔNG đổi `id` của bộ đã có (đổi id = bộ mới).
- KHÔNG sửa bộ khác, `targets`, `chat-rules.json`. KHÔNG tạo thư mục thủ công (bot tự tạo).
- KHÔNG chạy lệnh ghi file Excel hay in (`runner:once`, `total:once`, `--print`) khi chưa hỏi.
- KHÔNG commit hay push khi chưa được yêu cầu.

## Đầu ra

```
Đã thêm bộ "<id>": <mã, mã>.
Kiểm tra: typecheck <OK|lỗi: ...>; config:show <dòng đã thấy|có lỗi: ...>.
Mẫu Excel thiếu trên máy này: <danh sách|không>.
Việc bạn cần làm: khởi động lại bot:runner và bot:total (bot chỉ đọc config lúc khởi động).
```

## Khi không chắc

Dừng và hỏi: "Tôi chưa chắc về <điểm cụ thể>. Bạn xác nhận giúp: <câu hỏi một ý>?" Không đoán.

## Ví dụ

Đúng: `{ id: "NguyenVanB", reports: ["netsupport", "mayTinh"] },`
Sai: `{ id: "NguyenVanB", reports: ["03 - FORM TINH TRANG INTERNET.xlsx"] },` — vì `reports` chỉ nhận mã.

## Tham chiếu (chỉ đọc khi cần)

- Skill `them-loai-bao-cao-moi`: dùng khi báo cáo là loại mới (cần viết code).
