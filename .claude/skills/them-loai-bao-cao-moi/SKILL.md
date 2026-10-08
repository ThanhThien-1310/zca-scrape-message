---
name: them-loai-bao-cao-moi
description: Thêm một LOẠI báo cáo mới vào hệ thống (cần viết code đọc tin, dựng dòng và đăng ký mã). Dùng khi người dùng nói "thêm loại báo cáo mới", "thêm báo cáo ... chưa có trong reports:list". KHÔNG dùng khi chỉ cần thêm một người phụ trách với các mã báo cáo có sẵn (dùng skill `cau-hinh-nguoi-phu-trach`).
---

# Thêm một loại báo cáo mới

Thuật ngữ: loại báo cáo = một báo cáo chưa có trong `npm run reports:list`; mã = mã nội bộ ngắn không dấu (ví dụ `mayLanh`); giai đoạn (`phase`) = dựng theo từng giai đoạn trong ngày; theo ngày (`day`) = một file mỗi ngày.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| Mã nội bộ | "Mã ngắn không dấu cho báo cáo này là gì? (ví dụ mayLanh)" |
| Tiêu đề dòng đầu của tin | "Dòng đầu của tin nhắn báo cáo này viết chính xác thế nào? Gửi tôi ít nhất 3 tin mẫu thật." |
| Các trường lấy từ tin và cột trong mẫu | "Mỗi trường trong tin nằm ở cột nào của file mẫu?" |
| Kiểu dựng | "Báo cáo này dựng theo từng giai đoạn trong ngày, hay một file mỗi ngày?" |
| File mẫu Excel | "Đường dẫn file mẫu trên máy là gì?" |

## Các bước

1. Mã không trùng mã có sẵn. Lệnh: `npm run reports:list` → Mong đợi: mã mới không có trong danh sách.
2. Tiêu đề không trùng hay lẫn với các tiêu đề có sẵn: `BÁO CÁO ĐẦU BUỔI DẠY`, `BÁO CÁO CUỐI BUỔI DẠY` (khớp phần đầu), `BÁO CÁO CUỐI BUỔI`, `BÁO CÁO ĐIỂM DANH`, `LỖI ĐIỆN` (khớp đúng nguyên dòng). Nhất là `BÁO CÁO CUỐI BUỔI` với `BÁO CÁO CUỐI BUỔI DẠY`. Nghi trùng: hỏi người dùng.
3. Viết TEST trước cho hàm nhận diện tiêu đề và hàm đọc dòng, dùng đúng các tin mẫu người dùng gửi (cả tin sai định dạng). Mẫu: `src/lesson/cleaningReport.ts`, `attendanceReport.ts`, `electricReport.ts` và test của chúng. Chạy test → Mong đợi: FAIL.
4. Viết hàm nhận diện và hàm đọc cho đến khi test PASS. → Mong đợi: test PASS.
5. Đo bố cục trực tiếp trên file mẫu: `templateFile`, `sheet`, `firstDataRow`, `totalRowBefore`, `lastColumn`, ô thứ/ngày/giờ, khối chú giải nếu có. KHÔNG đoán, KHÔNG chép từ mẫu khác. Nghi ngờ dòng tiêu đề bảng, dòng TỔNG hay cột trống: hỏi người dùng. → Mong đợi: có đủ các con số trên.
6. Viết hàm dựng dòng cho mẫu (mẫu: `src/lesson/statusRows.ts`, `cleaningRows.ts`, `attendanceRows.ts`) kèm test. → Mong đợi: test PASS.
7. Đăng ký mã trong `src/reportSets/registry.ts`: thêm vào `REPORT_KEYS` (thứ tự = thứ tự xuất và in) và `REPORT_DEFS` (loại `phase` hoặc `day`, nguồn tin, bố cục).
8. Nối mã vào nơi dựng file:
   - Loại `phase`: `buildFillSpecs` và `FILE_LAYOUT` trong `src/lesson/statusReportLayout.ts`.
   - Loại `day`: một script `src/cli/fill-<tên>-report.ts` nhận `--set` (mẫu: `fill-cleaning-report.ts`), một mục trong `buildExtras` ở `src/runner/steps.ts`, và `runTotalOnce` ở `src/total/runTotal.ts`.
9. Viết test đối chiếu bố cục với file mẫu thật (mẫu: `tests/statusReportLayout.test.ts`) và cập nhật `tests/reportRegistry.test.ts`. → Mong đợi: test PASS.
10. Đặt file mẫu vào `data/mau bao cao new/`. Thư mục `data/` không nằm trong git: nhắc người dùng chép mẫu sang mọi máy chạy bot.
11. Lệnh: `npm run typecheck` rồi `npm test` → Mong đợi: không lỗi, `fail 0`.
12. Thêm mã vào bộ của người dùng bằng skill `cau-hinh-nguoi-phu-trach` (từ bước 6 của skill đó). → Mong đợi: mã có trong `reports` của bộ.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## Quy tắc cứng

- Mỗi bước viết test trước, thấy FAIL rồi mới viết code.
- KHÔNG đổi tên hay xoá file mẫu có sẵn.
- KHÔNG commit hay push khi chưa được yêu cầu.

## Đầu ra

```
Đã thêm loại báo cáo "<mã>": tiêu đề tin "<tiêu đề dòng đầu>", loại <phase|day>.
Kiểm tra: typecheck <OK|lỗi: ...>; test <fail 0|lỗi: ...>.
File mẫu: <đường dẫn|chưa có, nhắc người dùng chép>.
Việc tiếp theo: thêm mã "<mã>" vào `reportSets` của bộ cần dùng (skill `cau-hinh-nguoi-phu-trach`).
```

## Khi không chắc

Dừng và hỏi: "Tôi chưa chắc về <điểm cụ thể>. Bạn xác nhận giúp: <câu hỏi một ý>?" Không đoán.

## Ví dụ

Đúng: mã `mayLanh`, tiêu đề tin `TÌNH TRẠNG MÁY LẠNH`, loại `phase`; viết test trước, thấy FAIL, rồi mới viết code.
Sai: mã `may_lanh` — vì mã nội bộ viết liền, không dấu. Sai: dùng tiêu đề `BÁO CÁO CUỐI BUỔI` cho loại mới — vì trùng với tiêu đề của báo cáo vệ sinh đã có.
