# Chọn dòng, xếp loại, CHÚ GIẢI & THỐNG KÊ, ô đầu trang

Nguồn: `src/lesson/statusRows.ts` (`latestPerRoom`, `mayTinhGrade`, `groupBySchool`), `src/total/windowReports.ts` (`latestGradedPerRoom`, `reportsInWindow`), `src/lesson/electricReport.ts`, `src/lesson/cleaningRows.ts`, `src/lesson/attendanceRows.ts`, `src/lesson/attendanceDays.ts`, `src/lesson/statusReportLayout.ts` (`legendFormulaCells`, `headerDateTexts`). Khi nghi ngờ: đọc hàm, không dựa vào trang này.

## Chọn dòng theo loại

| Loại file | Tin lấy từ | Mỗi phòng một dòng? | Dòng bị bỏ |
|---|---|---|---|
| netsupport, internet, loa (4 giai đoạn) | `output/<id>/output.json` của giai đoạn (đã áp `output/<id>/overrides.json`) | Có: báo cáo MỚI NHẤT của (nhóm + tên phòng IN HOA đã trim) trong giai đoạn, đầu hay cuối buổi (`latestPerRoom`) | Báo cáo không có tên phòng; báo cáo không có mục cơ sở vật chất tương ứng; mục có xếp loại trống |
| mayTinh (4 giai đoạn) | như trên | Có, như trên | Báo cáo không có tên phòng; báo cáo không có mục MÁY TÍNH (xếp loại trống vẫn ra dòng) |
| netsupport, internet, loa, mayTinh (`bot:total`) | Tin văn bản "BÁO CÁO ĐẦU/CUỐI BUỔI DẠY" gửi từ 6:30 đến trước giờ đợt, theo GIỜ GỬI THẬT | Có: báo cáo MỚI NHẤT CÓ XẾP LOẠI (`latestGradedPerRoom`) | Như hai dòng trên |
| dien | Mọi tin "LỖI ĐIỆN" của CẢ NGÀY, mọi nhóm, mọi giờ (cả 4 giai đoạn lẫn `bot:total`) | Có: tin mới nhất của (nhóm + tên phòng) | Dòng không có tên phòng |
| cleaning | Tin "BÁO CÁO CUỐI BUỔI" (đúng nguyên dòng đầu, KHÔNG có chữ "DẠY"). Runner: cả ngày hôm nay. `bot:total`: từ 6:30 đến trước giờ đợt | Không: mỗi khối "Phòng máy" của tin một dòng, không gộp trùng | Khối thiếu dòng "Vệ sinh sạch sẽ"; tin thiếu "Tên trường" |
| attendance | Tin "BÁO CÁO ĐIỂM DANH" hợp lệ (có tên NV, nơi làm việc, dòng thời gian đến nơi không rỗng). Runner: cả hôm nay. `bot:total`: từ 6:30 đến trước giờ đợt | Không: mỗi NGƯỜI VI PHẠM một dòng | Người không trễ; tin gửi quá 17:30 |

Báo cáo trống toàn bộ xếp loại (ví dụ "Học tại lớp") trong `bot:total` KHÔNG xoá báo cáo có điểm trước đó của cùng phòng; nếu cả hai cùng có hoặc cùng không có điểm thì lấy cái muộn hơn. "Có điểm" = bất kỳ cơ sở vật chất nào của báo cáo có xếp loại khác rỗng (không tách riêng theo từng file).

Điểm danh: sáng là tin gửi trước 12:00, chiều là từ 12:00. Mỗi khung chỉ giữ tin gửi MUỘN NHẤT. Mốc trễ ở `isLateAttendance` (`src/lesson/attendanceReport.ts`). Dòng xếp theo họ tên.

## Thứ tự dòng

- netsupport, internet, loa, dien: xếp T trước, B, K sau (dòng không có xếp loại xếp cuối). Sau đó các dòng CÙNG TRƯỜNG được kéo liền nhau: chỉ dòng đầu của cụm ghi TÊN TRƯỜNG (cột B), các dòng sau để trống cột B nhưng giữ cột khác. Dòng không có tên trường không gộp với nhau.
- mayTinh: giữ thứ tự báo cáo, cũng gom cùng trường liền nhau, cũng chỉ dòng đầu ghi TÊN TRƯỜNG.
- STT đánh sau khi gom, từ 1.

## Xếp loại

| Mã | Giá trị | Ý nghĩa (ô chú giải của mẫu) |
|---|---|---|
| netsupport, internet, loa, dien | T / B / K | T Hoạt động tốt; B Bình thường; K Không hoạt động |
| mayTinh | A / B / C / D / E | Theo SM THIẾU: A khi thiếu <= 2, B <= 4, C <= 6, D <= 8, E > 8 (`mayTinhGrade`) |
| cleaning | A / B / C | A Đã vệ sinh; B Chưa vệ sinh; C Trường nhờ sau. Bot KHÔNG ghi: người dùng tự gõ vào cột G |
| attendance | không có | Không có xếp loại |

Lưu ý: tin vệ sinh có đọc giá trị "Vệ sinh sạch sẽ" (có/không) nhưng `buildCleaningRows` không ghi giá trị đó ra cột nào; chỉ khối có dòng này mới ra dòng.

## Khối CHÚ GIẢI & THỐNG KÊ

Bảng nhỏ nằm dưới (hoặc cạnh) bảng dữ liệu: mỗi loại một dòng gồm mã loại, ý nghĩa, SỐ LƯỢNG, TỶ LỆ; cuối là dòng TỔNG. Công thức do `legendFormulaCells` ghi lại theo đúng số dòng dữ liệu hiện tại:

- SỐ LƯỢNG = `COUNTIF` của cột XẾP LOẠI trong vùng dữ liệu, đếm theo mã loại.
- TỶ LỆ = SỐ LƯỢNG chia tổng (bằng 0 khi tổng là 0).
- TỔNG = tổng các dòng loại.
- Bảng dữ liệu trống vẫn tính vùng tối thiểu 1 dòng.

| Mã | Cột đếm | Cột mã loại / SỐ LƯỢNG / TỶ LỆ |
|---|---|---|
| netsupport, internet, dien | F | A / C / D (đặt dưới bảng) |
| loa | F | I / K / L |
| mayTinh | J | C / F / G |
| cleaning | G (người dùng gõ) | I / K / L |
| attendance | không có khối này | không có |

## 3 ô đầu trang (dòng 2): Thứ / Ngày / Giờ

Mẫu có công thức `TODAY()`/`NOW()`; bot ghi đè bằng CHỮ cố định của ngày báo cáo:

- Thứ: `Thứ: N` (N kiểu Excel, Chủ nhật = 1).
- Ngày: `Ngày: dd/mm/yyyy` của ngày báo cáo.
- Giờ: `Thời gian: hh:mm` là GIỜ DỰNG file (không phải giờ báo cáo; tên file của 4 giai đoạn mang giờ báo cáo muộn nhất, hai giờ này có thể khác nhau).

| Mã | Ô Thứ / Ngày / Giờ |
|---|---|
| netsupport, internet, loa, dien | E2 / F2 / G2 |
| mayTinh | J2 / K2 / L2 |
| cleaning | Không có ô Thứ; F2 (Ngày) và G2 (Giờ); sheet TONG ô J2 là ngày |
| attendance | Không có ô Thứ; H2 (Ngày) và I2 (Giờ) |

Cột NGÀY (B) của cleaning và attendance là chữ `dd/mm/yyyy` (bot gắn dấu nháy đơn đầu để Excel không đảo ngày/tháng; dấu nháy không hiện trong ô).

## CHƯA XÁC NHẬN

- Hành vi khi một phòng có hai báo cáo cùng giờ gửi (cùng `thoiGian`): code giữ báo cáo xuất hiện trước, chưa kiểm bằng test.
