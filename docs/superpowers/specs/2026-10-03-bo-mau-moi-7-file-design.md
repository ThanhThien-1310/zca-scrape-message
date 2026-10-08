# Bộ mẫu mới: xuất 7 file báo cáo, bỏ các logic không còn dùng — Thiết kế

**Trạng thái:** đã thống nhất qua trao đổi trực tiếp (2026-10-03) và **đã cài đặt** (dự án A). Báo cáo tổng `-auto` (dự án B) và in tự động (dự án C) làm sau, xem `2026-10-02-bao-cao-tong-auto-design.md` (đã cập nhật theo spec này).

**Quy ước đặt tên:** identifier MỚI bằng tiếng Anh (xem spec giai đoạn 4 buổi).

## Bối cảnh

Thư mục `data/mau bao cao new` được thay bằng bộ mẫu mới (6 file `.xlsx`, tên `0N - FORM ...`). So với bộ cũ: bỏ BỔ SUNG MÁY TÍNH, THAY THẾ MÁY TÍNH, LỖI PHẦN MỀM; bỏ cột SỐ LẦN; gộp phần bổ sung vào mẫu MÁY TÍNH; mẫu INTERNET có 2 sheet (NETSUPPORT và INTERNET); thêm mẫu ĐIỆN; VỆ SINH có thêm sheet TONG; NỘI QUY đổi cột. Cách chia 4 giai đoạn, định dạng tên file và giờ trong tên file (giờ chạy thực tế) **giữ nguyên**.

## 7 file xuất

| File | Mẫu | Sheet xuất | Tên file xuất (từ ô A1 của mẫu) | Dữ liệu |
|---|---|---|---|---|
| LOA | `01 - FORM TINH TRANG LOA` | `1209` | `TÌNH TRẠNG LOA` | XẾP LOẠI từ "Tình trạng loa, âm ly" |
| MÁY TÍNH | `02 - FORM TINH TRANG MAY TINH` | `2409` (xoá sheet `0310 (2)`) | `TÌNH TRẠNG MÁY TÍNH` | SM LỖI, SM THIẾU, HIỆN TRẠNG, XẾP LOẠI |
| NETSUPPORT | `03 - FORM TINH TRANG INTERNET` | `NETSUPPORT` (xoá sheet `INTERNET`) | `TÌNH TRẠNG NETSUPPORT` | XẾP LOẠI từ "Tình trạng Netsupport" |
| INTERNET | `03 - FORM TINH TRANG INTERNET` | `INTERNET` (xoá sheet `NETSUPPORT`) | `TÌNH TRẠNG INTERNET` | XẾP LOẠI từ "Tình trạng Internet" |
| ĐIỆN | `03 - FORM TINH TRANG LOI DIEN` | `DIEN` | `TÌNH TRẠNG ĐIỆN` | **Rỗng tạm thời** (chưa có định dạng tin để lấy dữ liệu) |
| VỆ SINH | `04 - FORM VE SINH PHONG MAY` | `HANG NGAY` có dữ liệu, `TONG` để trống (giữ cả 2 sheet) | `VỆ SINH PHÒNG MÁY` | tin báo cáo vệ sinh của ngày |
| NỘI QUY | `05 - FORM NOI QUY THUC TAP` | `HANG NGAY` | `NỘI QUY THỰC TẬP` | người đi trễ trong ngày |

LOA, MÁY TÍNH, NETSUPPORT, INTERNET, ĐIỆN do `fill:status-reports` xuất (mỗi giai đoạn, mỗi file một tiến trình PowerShell riêng như trước); VỆ SINH và NỘI QUY do `fill:cleaning-report` và `fill:attendance-report` (mỗi vòng runner một lần, báo cáo của chính ngày hôm nay).

## Cột từng file

- **LOA, NETSUPPORT, INTERNET, ĐIỆN** (7 cột): STT, TÊN TRƯỜNG, KHU VỰC, PM, HIỆN TRẠNG, XẾP LOẠI (cột F, các dòng sắp T → B → K), GHI CHÚ. HIỆN TRẠNG và GHI CHÚ để trống.
- **MÁY TÍNH** (12 cột): STT, TÊN TRƯỜNG, KHU VỰC, PM, TỔNG SM, SM LỖI (F), SM THIẾU (G), SM BỔ SUNG, HIỆN TRẠNG (I, ghi chú trong ngoặc của "Tổng số máy bị lỗi"), XẾP LOẠI (J), NGUỒN TT, GHI CHÚ. **XẾP LOẠI theo SM THIẾU** đúng bảng chú giải của mẫu: ≤2 A, ≤4 B, ≤6 C, ≤8 D, >8 E. **TỔNG SM, SM BỔ SUNG, NGUỒN TT chưa có dữ liệu nên để trống** (xem "Việc chờ").
- **VỆ SINH, sheet HANG NGAY** (7 cột): STT, NGÀY, TÊN TRƯỜNG, KHU VỰC, PM, HỌ TÊN, GHI CHÚ. Mẫu không còn cột XẾP LOẠI riêng: bot chỉ điền STT đến HỌ TÊN, cột GHI CHÚ (G) để TRỐNG cho người dùng tự xếp loại A (đã vệ sinh), B (chưa vệ sinh), C (trường nhờ sau) theo khối chú giải; công thức SỐ LƯỢNG/TỶ LỆ của khối chú giải đếm theo cột G nên tự cập nhật khi họ gõ (đổi ngày 2026-10-03: trước đó bot tự ghi A/B từ tin "Vệ sinh sạch sẽ"). Sheet TONG chỉ cập nhật ô "Ngày báo cáo" để khỏi hiện ngày cũ của mẫu.
- **NỘI QUY** (9 cột): THỨ, NGÀY, HỌ TÊN, CHỨC VỤ (luôn `TTS`), VỊ TRÍ, SÁNG, CHIỀU (giờ gửi tin khi đi trễ), NỘI DUNG, GHI CHÚ. NỘI DUNG và GHI CHÚ để trống.
- **Cập nhật 2026-10-03, NỘI QUY:** trễ = QUA 8h05 (sáng, tới hết buổi sáng) hoặc QUA 14h05 (chiều); đúng 8h05/14h05 chưa tính. Tin điểm danh gửi quá 17h30 không ghi nhận (và không đè tin trễ đã ghi nhận trước đó). Giờ vẫn là giờ Zalo ghi nhận tin gửi tới. Lưu ý: báo cáo tổng chiều cắt dữ liệu ở 15h nên chỉ thấy tin tới 15h; tin 15h-17h30 vào file của các giai đoạn sau.
- **Cập nhật 2026-10-03, ĐIỆN:** lấy từ tin có dòng đầu "LỖI ĐIỆN" với các dòng "- Trường:", "- Khu vực:", "- Phòng Máy:", "- Tình trạng:" (src/lesson/electricReport.ts). Trường/Khu vực để trống thì lấy từ tên nhóm (qua `groupAliases`, nhóm "bot test" ra trường như nhóm thật). Lấy CẢ NGÀY, không giới hạn theo buổi, giai đoạn hay đợt (lỗi điện là sự cố phát sinh), mỗi phòng giữ tin mới nhất trong ngày. "Tình trạng" là T/B/K (đổi 2026-10-03): vào XẾP LOẠI (F), các dòng sắp T, B, K; chữ khác T/B/K vào HIỆN TRẠNG (E) xếp sau. Cột: B TÊN TRƯỜNG, C KHU VỰC, D PM, E HIỆN TRẠNG, F XẾP LOẠI; GHI CHÚ (G) để trống. Báo cáo tổng lấy cả ngày vào file ĐIỆN `-auto`. Với 4 giai đoạn, ĐIỆN KHÔNG còn nằm trong `fill:status-reports` mà có chu trình riêng `fill:electric-report` (src/cli/fill-electric-report.ts), chạy một lần mỗi chu trình runner: mỗi NGÀY MỘT FILE, chỉ dựng lại (giờ mới trong tên, bản cũ trong ngày bị thay) khi nội dung các dòng đổi so với lần dựng trước (nhớ ở data/.electric-report.json); không có dữ liệu mới thì không dựng lại. Ngày chưa có tin nào dựng một file rỗng một lần.

## Khối "CHÚ GIẢI & THỐNG KÊ"

Mọi mẫu mới (trừ NỘI QUY) có khối này bên dưới hoặc bên cạnh bảng, với công thức đếm theo XẾP LOẠI. Excel không tự co giãn đúng vùng tham chiếu khi chèn/xoá dòng và có thể sinh `#REF!` (đã gặp), nên `legendFormulaCells` (`statusReportLayout.ts`) **ghi đè lại** công thức theo đúng vùng dữ liệu hiện tại (tối thiểu 1 dòng) cho mọi mẫu. Cột **TỶ LỆ** trong mẫu là số 0 tĩnh (ô đã định dạng %); bản này viết công thức `SỐ LƯỢNG / TỔNG` (bằng 0 khi tổng bằng 0) để tỷ lệ đúng với số đếm. Mẫu MÁY TÍNH còn có sẵn lỗi: công thức hạng A chỉ đếm `$J$7:$J$7`, đã được ghi đè.

## Logic đã bỏ

- **SỐ LẦN:** `faultHistory.ts` (tính chuỗi), `streakHistory.ts`, `store/historyDb.ts`, mục `streak` (`historyDays`) trong `config.ts`, `configCheck.ts`, `configDoc.ts`, `scripts/benchHistory.ts` và test liên quan. Spec `2026-10-01-so-lan-tu-lich-su-design.md` chỉ còn giá trị lịch sử.
- **Điểm danh:** phần đếm SỐ LẦN vi phạm (`computeAttendanceCounts`); `attendanceStreaks.ts` đổi tên thành `attendanceDays.ts` (chỉ còn gộp theo ngày và kiểm tra đi trễ).
- **File không còn:** BỔ SUNG MÁY TÍNH, THAY THẾ MÁY TÍNH, LỖI ĐIỆN cũ, LỖI PHẦN MỀM (cùng `buildBoSungRows`, `boSungFormulaCells`, `cleaningFormulaCells`, `capToRoman`, `OTHER_TEMPLATE_FILES`); `mayTinhGrade` đổi sang quy tắc theo SM THIẾU.
- Dữ liệu cũ trên đĩa không bị đụng: các file đã xuất theo mẫu cũ, `data/.status-streaks.json` (không dùng nữa, xoá tay được).

## Thay đổi hạ tầng

- `FileLayout` thêm `deleteSheets` và `legend`; `HeaderCell`/`FormulaCell` thêm `sheet` tuỳ chọn (ghi ô ở sheet khác sheet chính).
- `scripts/fill-status-template.ps1`: xoá các sheet thừa trước khi ghi; ghi ô theo sheet nếu có.
- Tên mẫu trong `FILE_LAYOUT`/`CLEANING_LAYOUT`/`ATTENDANCE_LAYOUT` đổi sang `0N - FORM ...`. Test đối chiếu **mẫu thật** (sheet, dòng TỔNG, cột, vị trí khối chú giải, tên tiêu đề) để phát hiện khi mẫu bị đổi.

## Việc chờ (chưa làm, không chặn)

1. **TỔNG SM, SM BỔ SUNG** (MÁY TÍNH): công thức đã chốt là **SM BỔ SUNG = SỈ SỐ TỐI ĐA cố định của trường − TỔNG SM** (không âm). Cần nơi lưu SỈ SỐ TỐI ĐA cố định và TỔNG SM theo phòng (file cấu hình cục bộ hoặc DB) và khớp phòng theo cặp tên giáo viên báo ↔ tên kỹ thuật. Chưa chọn nguồn.
2. **NGUỒN TT** (MÁY TÍNH): chưa rõ ý nghĩa, để trống.
3. **ĐIỆN:** chờ định dạng tin nhắn. Hàm `buildDienRows` (`statusRows.ts`) là chỗ duy nhất cần viết khi có định dạng.
4. **VỆ SINH sheet TONG** (TỔNG PM, PM ĐƯỢC BT, ĐÃ VỆ SINH, CHƯA VỆ SINH, XẾP LOẠI): tin chưa có TỔNG PM. Loại **C "Trường nhờ sau"** chưa có nguồn nên chưa bao giờ được ghi.
5. HIỆN TRẠNG (LOA, NETSUPPORT, INTERNET) và NỘI DUNG (NỘI QUY): chưa có nguồn, để trống.

## Kiểm thử

- Dựng dòng từng file (cột đúng, sắp T/B/K, gom cùng trường, ĐIỆN luôn rỗng, MÁY TÍNH xếp loại theo thiếu).
- `legendFormulaCells`: đúng vị trí gốc của mẫu, dời theo số dòng, 0 dòng vẫn tham chiếu 1 dòng, MÁY TÍNH 5 loại, INTERNET/NETSUPPORT/ĐIỆN, VỆ SINH.
- `buildFillPsSpec` có `deleteSheets` và ô theo sheet.
- Đối chiếu mẫu thật (bỏ qua nếu máy không có thư mục mẫu).
- Chạy thật bằng Excel trên dữ liệu giai đoạn `afternoonend` ngày 2026-10-02 (5 file), vệ sinh ngày 2026-10-03 và nội quy ngày 2026-10-02: không có lỗi công thức, chú giải đếm và tính tỷ lệ đúng, mỗi file đúng số sheet.
