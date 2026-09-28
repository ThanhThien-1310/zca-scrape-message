# Thiết kế: điền trực tiếp 5 file báo cáo tình trạng (không macro)

Ngày: 2026-09-28. Trạng thái: chờ duyệt.

## 1. Mục tiêu

Có 10 file `.xlsx` mẫu mới trong `data/mau bao cao new/`, **không có VBA macro** (khác với `.xlsm` hiện tại chạy qua `Workbook_Open`). Đợt này làm **5 file có nguồn dữ liệu**, điền trực tiếp vào bảng hiển thị (không qua sheet trung gian + macro):

- `BO SUNG MAY TINH.xlsx`
- `TINH TRANG LOA.xlsx`
- `TINH TRANG LOI INTERNET.xlsx`
- `TINH TRANG LOI MAY TINH.xlsx` (chỉ sheet `2409`, sheet `0310 (2)` là danh sách khác, không đụng)
- `TINH TRANG LOI NETSUPPORT.xlsx`

**5 file còn lại chưa có nguồn dữ liệu:** `THAY THE MAY TINH.xlsx`, `TINH TRANG LOI DIEN.xlsx`, `TINH TRANG LOI PHAN MEM.xlsx`, `TINH TRANG VE SINH PHONG MAY.xlsx`, `VI PHAM NOI QUY THUC TAP.xlsx`. Mỗi lần chạy **vẫn xuất đủ cả 10 file** (chép từ mẫu sang thư mục xuất), nhưng 5 file này chỉ được **chép nguyên trạng** (giữ trống như file mẫu, không mở qua Excel COM, không đụng cell nào) — chỉ 5 file có nguồn ở trên mới thật sự được điền dữ liệu.

Tiêu chí thành công: chạy một lệnh cho một buổi (ngày + buổi, giống `extract:reports`), 5 file trên được điền đúng dữ liệu của buổi đó, số dòng thay đổi theo số trường báo cáo mà không hỏng công thức TỔNG/CHÚ GIẢI có sẵn trong file mẫu.

## 2. Ngoài phạm vi, cố ý để sau

- **Tự động hoá theo buổi** (gắn vào `bot:runner`): đợt này chạy **bằng tay**, một lệnh CLI mới, để xem dữ liệu ra đúng trước. Không sửa `runner/`.
- **Tách file theo ngày** (sheet kiểu "1209", "2409" trong file mẫu): không làm. Mỗi file luôn **ghi đè** dữ liệu hiện có bằng dữ liệu của buổi vừa chạy — không cộng dồn, không tạo sheet mới mỗi ngày.
- Cột `SM BỔ SUNG` (file máy tính): để trống.
- Nội dung của 5 file chưa có nguồn: không tính toán gì cho chúng (chỉ chép nguyên file, xem mục 1 và mục 6).

## 3. Nguồn dữ liệu: tái dùng `output/output.json`, không đọc tin nhắn lại

Bộ trích xuất hiện có (`extractAll`, dùng bởi `extract:reports`) đã cho ra `Report[]` với đủ trường cần: `data.truong` (capHoc/tenRieng), `data.khuVuc`, `data.phongMay`, và `data.coSoVatChat` (mảng gồm AmThanh/NetSupport/Internet/MayTinh, mỗi mục có `xepLoai` và với MayTinh có `soLuong` chứa Thiếu/Lỗi + ghi chú). Bước điền 5 file này **đọc lại `output/output.json`** (giống `fill:report` đang đọc), không tự trích xuất lại từ `data/<groupId>.json`. Lợi ích: tự động thừa hưởng override của agent (`output/overrides.json`) vì `Report[]` đã áp override rồi.

CLI mới: `src/cli/fill-status-reports.ts` (lệnh `npm run fill:status-reports -- output/output.json [--day D] [--buoi B]`), đứng cạnh `fill-report.ts` hiện có, cùng input, khác đầu ra.

**Nơi xuất:** `data/export/trang-thai/<tên file như trong "mau bao cao new">.xlsx` — cùng tên 10 file gốc, một thư mục cố định, ghi đè mỗi lần chạy (không gắn ngày vào tên file, vì đã chốt là ghi đè chứ không tách theo ngày).

## 4. Bảng cột từng file (đúng tiêu đề cột thật trong file mẫu)

Quy ước chung: `TÊN TRƯỜNG` = `report.data.truong.tenRieng`, `KHU VỰC` = `report.data.khuVuc`, `PM` (khi có cột) = luôn **để trống** (đã chốt).

### 4.1 `BO SUNG MAY TINH.xlsx`, sheet `BO SUNG`, tiêu đề dòng 4, dữ liệu từ dòng 5

Điều kiện có dòng: lấy từ mục `MayTinh` trong `coSoVatChat`, `thieu = soLuong[Thieu].so`, `loi = soLuong[Loi].so`; **có dòng khi `thieu - loi > 0`**.

| Cột | Nguồn |
|---|---|
| A STT | số thứ tự |
| B CẤP | `report.data.truong.capHoc` nguyên văn (vd "LC") |
| C TÊN TRƯỜNG | như trên |
| D KHU VỰC | như trên |
| E SLHS, F THQT, G TỔNG PM, H PM TRƯỜNG, I PM CTY | để trống |
| J PM BỔ SUNG | `report.data.phongMay` (tên phòng, vd "PM1") |
| K SỞ HỮU | để trống |
| L THÙNG MÁY, M MÀN HÌNH | = `thieu` (giống nhau) |
| N XẾP LOẠI, O KG THQT, P KG AI, Q GHI CHÚ | để trống |

### 4.2 `TINH TRANG LOA.xlsx`, sheet `1209`, tiêu đề dòng 3, dữ liệu từ dòng 4

Một dòng cho mỗi báo cáo có `AmThanh.xepLoai` khác null (T/B/K hợp lệ).

| Cột | Nguồn |
|---|---|
| A STT, B TÊN TRƯỜNG, C KHU VỰC | như trên |
| D PM, E SỞ HỮU, F HIỆN TRẠNG | để trống |
| G XẾP LOẠI | `AmThanh.xepLoai` (T/B/K nguyên văn) |
| H GHI CHÚ | để trống |

Không có cột SỐ LẦN trong file này (đã xác nhận với người dùng) — không áp dụng bộ đếm.

### 4.3 `TINH TRANG LOI INTERNET.xlsx` (sheet `INTERNET`) và `TINH TRANG LOI NETSUPPORT.xlsx` (sheet `NETSUPPORT`), tiêu đề dòng 3, dữ liệu từ dòng 4

Cùng layout. Một dòng cho mỗi báo cáo có `xepLoai` (Internet hoặc NetSupport tương ứng) khác null.

| Cột | Nguồn |
|---|---|
| A STT, B TÊN TRƯỜNG, C KHU VỰC | như trên |
| D PM, E SỞ HỮU, F HIỆN TRẠNG | để trống |
| G SỐ LẦN | bộ đếm liên tiếp, xem mục 5 |
| H TƯƠNG TÁC | để trống |
| I XẾP LOẠI | T/B/K nguyên văn |
| J SẮP XẾP IT | để trống |

**Khối CHÚ GIẢI & THỐNG KÊ của 2 file này giữ nguyên nhãn A/B/C/D** (đã chốt: không sửa). Vì cột XẾP LOẠI ghi T/B/K, các công thức `COUNTIF` đếm theo A/B/C/D trong khối này sẽ luôn ra 0 — đây là hệ quả đã biết trước, không phải lỗi.

### 4.4 `TINH TRANG LOI MAY TINH.xlsx`, sheet `2409`, tiêu đề dòng 3, dữ liệu từ dòng 4

Một dòng cho mỗi báo cáo có mục `MayTinh` (luôn có, vì mọi báo cáo đều có phần máy tính).

| Cột | Nguồn |
|---|---|
| A STT, B TÊN TRƯỜNG, C KHU VỰC | như trên |
| D PM, I HIỆN TRẠNG, J TƯƠNG TÁC, L SẮP XẾP IT, M NGUỒN TT | để trống |
| E TỔNG SM | để trống (không thêm trích xuất "tổng số máy") |
| F SM LỖI | `soLuong[Loi].so` |
| G SM THIẾU | `soLuong[Thieu].so` |
| H SM BỔ SUNG | để trống |
| K XẾP LOẠI | theo `SM LỖI`: 0→A, 1–5→B, 6–9→C, ≥10→D |
| N GHI CHÚ | `soLuong[Loi].ghiChu` (phần trong ngoặc của "Tổng số máy bị lỗi: N (...)") |

Không có cột SỐ LẦN trong file này — không áp dụng bộ đếm.

## 5. Bộ đếm SỐ LẦN (chỉ Internet, NetSupport)

**Trạng thái mới, tồn tại qua nhiều lần chạy**, file `data/.status-streaks.json`:

```json
{ "<maNhom>|<phongMay đã chuẩn hoá>|<internet|netsupport>": { "count": 3, "lastMsgId": "...", "lastTs": 1234567890 } }
```

Quy tắc cập nhật, xử lý các báo cáo **theo thứ tự thời gian** (`thoiGian` tăng dần), với từng báo cáo và từng loại (internet, netsupport):
- Bỏ qua nếu `xepLoai` là null (báo cáo không có dòng đó, không đủ thông tin) — giữ nguyên số cũ.
- Bỏ qua nếu `msgId` này đã là `lastMsgId` đã lưu — tránh cộng trùng khi chạy lại cùng một buổi.
- `xepLoai === "K"` → `count = count + 1`.
- `xepLoai` khác K (T hoặc B) → `count = 0`.
- Ghi `lastMsgId`/`lastTs` sau khi xử lý.

Cài đặt: một hàm thuần `applyStreaks(state, reports, now): { state, values }` để test độc lập, cộng một lớp đọc/ghi file nguyên tử (theo mẫu `atomicWrite.ts` đang dùng). `values` trả về map `key -> count hiện tại` để CLI dùng điền cột SỐ LẦN.

**Giả định cần bạn xem lại sau khi thấy kết quả chạy thử:** khoá theo `phongMay` là chuỗi thô đã chuẩn hoá (trim, một kiểu viết hoa) — nếu giáo viên gõ tên phòng không nhất quán giữa các buổi (ví dụ "PM1" và "P.M 1"), bộ đếm sẽ bị tách thành hai chuỗi khác nhau. Đây là rủi ro đã biết, chưa có cách sửa nào được yêu cầu.

## 6. Cách điền Excel: chèn dòng qua Excel COM (đã chốt phương án A)

Giữ cùng cách `scripts/fill-template.ps1` đang làm với `.xlsm`: mở bằng Excel thật qua COM, không qua thư viện đọc/ghi `.xlsx` bằng JS.

**Bước 0, cho cả 10 file:** chép mọi file từ `data/mau bao cao new/` sang `data/export/trang-thai/` (ghi đè). Đây là bước duy nhất áp dụng cho 5 file chưa có nguồn — chúng dừng lại ở đây, không mở qua Excel COM, giữ nguyên trạng thái trống như file mẫu.

Với riêng 5 file có nguồn, làm tiếp qua Excel COM:

1. (đã copy ở bước 0, không copy lại) mở đúng file vừa chép ở thư mục xuất.
2. Xác định **dòng dữ liệu đầu tiên** và **dòng "TỔNG" hiện tại** trong sheet.
3. So khớp số dòng mẫu có sẵn (rỗng, đã định dạng) với số dòng dữ liệu cần điền:
   - Cần nhiều dòng hơn: `Rows(dòng-TỔNG).EntireRow.Insert` lặp lại đúng số lần còn thiếu, ngay phía trên dòng TỔNG (Excel COM tự dời và **mở rộng phạm vi công thức** `COUNTIF`/`SUM`/`COUNTA` nếu vị trí chèn nằm trong phạm vi đó — đây là lý do chọn COM thay vì ghi trực tiếp bằng thư viện).
   - Cần ít dòng hơn: xoá bớt dòng dữ liệu thừa (`EntireRow.Delete`) từ dưới lên.
4. Ghi giá trị vào từng ô theo bảng ở mục 4 (native COM, không dùng công thức).
5. Ghi đè các ô `Ngày:`/`Thứ:`/`Thời gian:` đang là công thức `TODAY()`/`NOW()` thành **giá trị cố định** của ngày buổi đang xuất (không phải lúc mở file sau này).
6. Lưu, đóng, không chạy macro nào (không có macro để chạy).

Một script PowerShell dùng chung cho cả 5 file, nhận vào một file JSON mô tả: đường dẫn nguồn/đích, tên sheet, dòng tiêu đề, dòng TỔNG hiện tại, danh sách cột cần ghi (chữ cột + tên trường), và mảng các dòng dữ liệu (JSON, giống cách `rows.json` đang truyền cho `fill-template.ps1`). Tránh viết 5 script PowerShell riêng.

**Rủi ro đã biết:** Excel COM chậm (đã thấy ở `.xlsm` hiện tại, ~20 giây); mở 5 file liên tiếp mỗi lần chạy sẽ chậm hơn. Đợt này chạy tay nên chấp nhận được; khi tự động hoá theo buổi (việc để sau) mới cần tính lại.

## 7. Không thuộc phạm vi quyết định của tôi, chỉ nêu giả định

- Với mỗi báo cáo, một dòng trong LOA/INTERNET/NETSUPPORT/MÁY TÍNH ứng với **một phòng** (không gộp nhiều phòng cùng trường thành một dòng), khác với cách BO SUNG chỉ liệt kê phòng thoả điều kiện. Nếu một trường có 2 phòng cùng báo cáo trong buổi đó, sẽ có 2 dòng riêng ở các file này (dù cột PM để trống nên nhìn vào file sẽ không phân biệt được, chỉ khác nhau ở XẾP LOẠI/SỐ LẦN nếu có).
- STT là số thứ tự theo thứ tự xử lý (không phải mã cố định), đổi mỗi lần ghi đè.

## 8. Kiểm thử

- `applyStreaks` (mục 5): test thuần, không cần Excel — tăng liên tiếp, về 0 khi hết K, bỏ qua null, không cộng trùng `msgId`, độc lập theo (nhóm, phòng, loại).
- Hàm chọn dòng theo điều kiện của từng file (mục 4, ví dụ lọc `thieu - loi > 0` cho BO SUNG, lọc `xepLoai !== null` cho các file khác) và hàm ánh xạ `Report -> dòng` (kiểu dữ liệu ghi vào JSON cho PowerShell) đều là hàm thuần, test bằng `node:test` như phần còn lại của repo.
- Phần PowerShell/Excel COM không tự test được (như `fill-template.ps1` hiện tại) — kiểm bằng chạy tay và agent đối chiếu file xuất ra.

## Tự soát lại

- Không còn "TBD"/chỗ trống mập mờ trong 4 bảng cột — mọi cột đều ghi rõ nguồn hoặc "để trống".
- Đối chiếu ngược từng quyết định của người dùng trong hội thoại: CẤP không ép số, PM BỔ SUNG = tên phòng, THÙNG MÁY=MÀN HÌNH=thiếu, SỐ LẦN chỉ Internet/NetSupport theo đúng báo cáo (không theo ngày lịch), XẾP LOẠI máy tính theo ngưỡng A/B/C/D, ghi đè không tách file theo ngày, Excel COM — đều đã đưa vào mục 4–6.
- Phạm vi rõ ràng, không lẫn với 5 file chưa có nguồn — nhưng cả 10 file vẫn cùng được xuất ra (mục 1, mục 6 bước 0), chỉ khác là 5 file kia dừng lại ở bước chép nguyên trạng.

## Cập nhật sau khi duyệt

- 2026-09-28: thêm yêu cầu — mỗi lần chạy vẫn xuất đủ **cả 10 file** (không chỉ 5 file có dữ liệu); 5 file chưa có nguồn được chép nguyên trạng sang thư mục xuất, giữ trống. Đã sửa mục 1, mục 2, mục 3 (thêm đường dẫn xuất) và mục 6 (thêm bước 0).
