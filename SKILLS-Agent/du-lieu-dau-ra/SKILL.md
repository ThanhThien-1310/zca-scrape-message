---
name: du-lieu-dau-ra
description: Tra cứu cấu trúc DỮ LIỆU ĐẦU RA của hệ thống: 7 file Excel báo cáo của từng người phụ trách (đường dẫn, tên file, cột, cách xếp loại, cách chọn dòng, file trạng thái báo lỗi). Dùng khi người dùng hỏi "file báo cáo nằm ở đâu", "cột X nghĩa là gì", "vì sao phòng này không có dòng", "xếp loại T/B/K hay A-E", "file -auto là gì", hoặc khi cần kiểm tra một file báo cáo có đúng không. KHÔNG dùng khi cần THAY ĐỔI cấu hình hay code (thêm người phụ trách: dùng skill cau-hinh-nguoi-phu-trach).
---

# Dữ liệu đầu ra

Thuật ngữ: bộ = một người phụ trách trong `config.reportSets`; id = tên thư mục của bộ; mã = một trong 7 mã báo cáo; giai đoạn = `morningstart|morningend|afternoonstart|afternoonend` (4 giai đoạn mỗi ngày); đợt = `morning` (9:00) hoặc `afternoon` (15:00) của `bot:total`; `<gốc>` = `config.statusExportDir` (xem `npm run config:show`).

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| Mã báo cáo hoặc tên file cần tra | "Bạn hỏi về báo cáo nào: NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH hay NỘI QUY?" |
| Ngày và id của bộ (khi hỏi về một file cụ thể) | "Ngày nào (yyyy-mm-dd) và bộ nào (id thư mục)?" |

## Bảng 7 mã

| Mã | Tiêu đề (A1 dòng 2 của mẫu) | Mẫu Excel (trong `data/mau bao cao new/`) | Sheet chính | Tin nguồn (dòng đầu tin) | Dựng theo |
|---|---|---|---|---|---|
| netsupport | TÌNH TRẠNG NETSUPPORT | 03 - FORM TINH TRANG INTERNET.xlsx | NETSUPPORT | BÁO CÁO ĐẦU/CUỐI BUỔI DẠY | phase |
| loa | TÌNH TRẠNG ÂM THANH | 01 - FORM TINH TRANG AM THANH.xlsx | 1209 | BÁO CÁO ĐẦU/CUỐI BUỔI DẠY | phase |
| internet | TÌNH TRẠNG INTERNET | 03 - FORM TINH TRANG INTERNET.xlsx | INTERNET | BÁO CÁO ĐẦU/CUỐI BUỔI DẠY | phase |
| mayTinh | TÌNH TRẠNG MÁY TÍNH | 02 - FORM TINH TRANG MAY TINH.xlsx | 2409 | BÁO CÁO ĐẦU/CUỐI BUỔI DẠY | phase |
| dien | TÌNH TRẠNG ĐIỆN | 03 - FORM TINH TRANG LOI DIEN.xlsx | DIEN | LỖI ĐIỆN | day |
| cleaning | VỆ SINH PHÒNG MÁY | 04 - FORM VE SINH PHONG MAY.xlsx | HANG NGAY | BÁO CÁO CUỐI BUỔI | day |
| attendance | NỘI QUY THỰC TẬP | 05 - FORM NOI QUY THUC TAP.xlsx | HANG NGAY | BÁO CÁO ĐIỂM DANH | day |

phase = mỗi giai đoạn một file; day = mỗi ngày một file, quét lại cả ngày. Nguồn thật của bảng: `npm run reports:list` và `src/reportSets/registry.ts`.

## Các bước (cách tra cứu)

1. Xác định mã. Lệnh: `npm run reports:list` → Mong đợi: 7 dòng, mã người dùng hỏi nằm trong đó. Không có: DỪNG và hỏi lại theo bảng "Cần có".
2. Tìm đường dẫn và tên file: mở `references/ten-file-va-trang-thai.md`. Đường dẫn: `<gốc>/<yyMM>/<yyMMdd>/<id>/<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx`.
3. Muốn biết cột nghĩa là gì: mở `references/cot-tung-file.md` → Mong đợi: bảng cột của đúng mã.
4. Muốn biết một phòng vì sao có hay không có dòng, hay thứ tự dòng, xếp loại, khối CHÚ GIẢI & THỐNG KÊ, 3 ô đầu trang: mở `references/chon-dong.md`.
5. Muốn biết đầu ra có lỗi không: đọc các file ở mục "File trạng thái" dưới đây, rồi báo đúng nội dung file (không suy diễn).
6. Muốn kiểm luật chính xác: đọc code đã trỏ trong reference (không dựa vào trí nhớ). Mọi test bố cục: `tests/statusReportLayout.test.ts`.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## File trạng thái (để biết đầu ra có lỗi không)

- `output/<id>/fill-failed.json`: các mã lỗi ở lần điền gần nhất của bộ `<id>` (mảng mã, ví dụ `["loa"]`).
- `data/.runner-failed.json`: các mục `<id>|<ngày>|<giai đoạn>|<mã>` đang chờ runner điền lại.
- `data/.status-report-files.json`: tên file mới nhất của từng (bộ, ngày, giai đoạn, tiêu đề); dùng để xoá bản cũ.
- `data/.runner-built.json`: các báo cáo đã dựng ra Excel, theo từng bộ; báo cáo ngoài danh sách này là giai đoạn chưa dựng.

## Quy tắc cứng

- KHÔNG chép luật vào câu trả lời từ trí nhớ: luôn trỏ file code trong reference.
- KHÔNG sửa file Excel, file trạng thái hay chạy lệnh ghi (`runner:once`, `total:once`, `fill:*`, `--print`) khi chưa được yêu cầu. Skill này chỉ đọc.
- KHÔNG gọi file `...-auto.xlsx` là file của 4 giai đoạn: đó là file của `bot:total`.
- Mục nào chưa rõ trong reference ghi "CHƯA XÁC NHẬN": nói lại đúng như vậy, không đoán.

## Đầu ra

```
Mã: <mã> (<tiêu đề>), dựng theo <phase|day>.
Đường dẫn: <gốc>/<yyMM>/<yyMMdd>/<id>/<tên file>
Trả lời: <nội dung tra được, kèm nguồn: references/<x>.md hoặc đường dẫn file code>
Điều chưa xác nhận: <danh sách|không>
```

## Khi không chắc

Dừng và hỏi: "Tôi chưa chắc về <điểm cụ thể>. Bạn cho biết <mã báo cáo / ngày / id bộ> nào?" Không đoán.

## Ví dụ

Đúng: hỏi "cột F của file NETSUPPORT là gì" → đáp "XẾP LOẠI (T/B/K)", nguồn `references/cot-tung-file.md`.
Sai: đáp "F là SỐ LẦN" — vì cột SỐ LẦN không còn trong mẫu mới.

## Tham chiếu (chỉ đọc khi cần)

- `references/ten-file-va-trang-thai.md`: đọc khi hỏi đường dẫn, tên file, file `-auto`, bản cũ bị thay, file lỗi.
- `references/cot-tung-file.md`: đọc khi hỏi cột của từng file và ý nghĩa.
- `references/chon-dong.md`: đọc khi hỏi cách chọn dòng, xếp loại T/B/K và A-E, CHÚ GIẢI & THỐNG KÊ, ô Thứ/Ngày/Giờ.
