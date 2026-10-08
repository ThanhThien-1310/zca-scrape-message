# Cột của từng file

Nguồn: `src/lesson/statusRows.ts` (`buildNetSupportRows`, `buildInternetRows`, `buildLoaRows`, `buildMayTinhRows`, `buildDienRows`), `src/lesson/cleaningRows.ts`, `src/lesson/attendanceRows.ts`, `src/lesson/statusReportLayout.ts` (`FILE_LAYOUT`). Dòng tiêu đề bảng là dòng 3, dòng dữ liệu đầu là dòng 4 (mọi file). Muốn kiểm trên file thật: mở sheet chính, đọc dòng 3.

Viết tắt: PM = phòng máy; SM = số máy (suy từ tên cột và code). "Để trống" = bot không ghi, ô có thể có nội dung do người dùng gõ.

## netsupport, internet (sheet NETSUPPORT / INTERNET), cột A-G

| Cột | Tên | Bot ghi |
|---|---|---|
| A | STT | Số thứ tự 1, 2, 3... |
| B | TÊN TRƯỜNG | Tên trường (chỉ dòng đầu của cụm cùng trường; xem `chon-dong.md`) |
| C | KHU VỰC | Khu vực của trường trong tin |
| D | PM | Tên phòng máy |
| E | HIỆN TRẠNG | Để trống |
| F | XẾP LOẠI | T, B hoặc K lấy từ tin |
| G | GHI CHÚ | Để trống |

Mỗi file chỉ có một sheet: sheet kia của mẫu `03 - FORM TINH TRANG INTERNET.xlsx` bị xoá khi xuất.

## loa (sheet 1209), cột A-G

Cùng 7 cột như trên, cùng ý nghĩa; chỉ khác: khối CHÚ GIẢI & THỐNG KÊ đặt ở cột I-L (xem `chon-dong.md`).

## mayTinh (sheet 2409), cột A-L

| Cột | Tên | Bot ghi |
|---|---|---|
| A | STT | Số thứ tự |
| B, C, D | TÊN TRƯỜNG, KHU VỰC, PM | Như trên |
| E | TỔNG SM | Để trống (chưa có nguồn dữ liệu) |
| F | SM LỖI | Số máy lỗi trong tin ("Tổng số máy bị lỗi: N") |
| G | SM THIẾU | Số máy thiếu trong tin |
| H | SM BỔ SUNG | Để trống (chưa có nguồn) |
| I | HIỆN TRẠNG | Ghi chú trong ngoặc của "Tổng số máy bị lỗi: N (...)" |
| J | XẾP LOẠI | A-E tính từ SM THIẾU (xem `chon-dong.md`); tin không ghi số máy thiếu thì để trống |
| K | NGUỒN TT | Để trống |
| L | GHI CHÚ | Để trống |

Sheet thứ hai của mẫu ("0310 (2)", danh sách dự kiến trường thiếu máy) bị xoá khi xuất.

## dien (sheet DIEN), cột A-G

| Cột | Bot ghi |
|---|---|
| A | STT |
| B, C, D | TÊN TRƯỜNG, KHU VỰC, PM (mặc định lấy theo tên nhóm Zalo khi tin không ghi) |
| E HIỆN TRẠNG | Chữ "Tình trạng" của tin khi KHÔNG phải T/B/K |
| F XẾP LOẠI | T, B, K khi "Tình trạng" đúng một trong ba chữ (không phân biệt hoa thường) |
| G GHI CHÚ | Để trống |

Mỗi dòng chỉ có E hoặc F, không có cả hai. "Tình trạng" trống thì cả E và F trống.

## cleaning (sheet HANG NGAY), cột A-G

| Cột | Tên | Bot ghi |
|---|---|---|
| A | STT | Số thứ tự |
| B | NGÀY | Ngày báo cáo dạng chữ dd/mm/yyyy |
| C, D, E | TÊN TRƯỜNG, KHU VỰC, PM | Từ tin "BÁO CÁO CUỐI BUỔI"; PM giữ nguyên văn như trong tin |
| F | HỌ TÊN | Tên IT ("Tên IT" trong tin) |
| G | GHI CHÚ | Để trống: người dùng tự gõ A, B hoặc C, khối chú giải đếm theo cột G |

Sheet TONG của mẫu để trống, bot chỉ ghi ô ngày J2.

## attendance (sheet HANG NGAY), cột A-I

| Cột | Tên | Bot ghi |
|---|---|---|
| A | THỨ | Dạng "Thứ N" với N theo kiểu Excel (Chủ nhật = 1, Thứ 2 = 2, ...) |
| B | NGÀY | Ngày báo cáo dạng chữ dd/mm/yyyy |
| C | HỌ TÊN | Tên nhân viên thực tập trong tin |
| D | CHỨC VỤ | Cố định "TTS" |
| E | VỊ TRÍ | "Nơi làm việc" trong tin |
| F | SÁNG | Giờ gửi tin (h:mm) CHỈ khi buổi sáng bị trễ, ngược lại để trống |
| G | CHIỀU | Giờ gửi tin (h:mm) CHỈ khi buổi chiều bị trễ, ngược lại để trống |
| H | NỘI DUNG | Để trống |
| I | GHI CHÚ | Để trống |

Không có khối CHÚ GIẢI & THỐNG KÊ. Mẫu cũ có cột SỐ LẦN, GIẢI TRÌNH, CAM KẾT: mẫu mới không còn.

## Mốc trễ (điểm danh)

Quy tắc trễ nằm ở `isLateAttendance` trong `src/lesson/attendanceReport.ts` (giờ lấy theo giờ Zalo ghi nhận tin, không theo giờ tự khai trong tin). Đọc hàm đó khi cần con số; không chép vào câu trả lời từ trí nhớ.

## CHƯA XÁC NHẬN

- Ý nghĩa nghiệp vụ chính xác của các cột bot để trống (TỔNG SM, SM BỔ SUNG, NGUỒN TT): code chỉ ghi "chưa có nguồn dữ liệu".
- Tên đầy đủ của "SM": suy là "số máy", code không giải thích.
