# Đường dẫn, tên file, file -auto, file trạng thái

Nguồn: `src/core/paths.ts` (`setReportDir`), `src/lesson/statusReportLayout.ts` (`freeFormFileName`), `src/lesson/statusFill.ts`, `src/lesson/statusFileTracker.ts`, `src/lesson/excelFill.ts` (`pruneSiblings`), `src/total/runTotal.ts`, `src/total/slots.ts` (`autoFileName`).

## Đường dẫn

`<gốc>/<yyMM>/<yyMMdd>/<id>/<tên file>`

- `<gốc>` = `config.statusExportDir`. Mặc định `data/export/trang-thai` trong thư mục dự án; xem giá trị thật bằng `npm run config:show`. Phải là đường dẫn tuyệt đối. Đổi gốc không chuyển file cũ.
- `<yyMM>` và `<yyMMdd>` lấy từ ngày báo cáo. Ví dụ ngày 2026-10-06 thì `2610/261006`.
- `<id>` = id của bộ. Mỗi bộ một thư mục riêng, bot tự tạo.

## Tên file

`<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx`

- `<tiêu đề>`: đọc từ ô A1 dòng 2 của file mẫu (cột "Tiêu đề" trong bảng ở SKILL.md), không viết cứng.
- `T<thứ>`: số thứ theo kiểu Excel `WEEKDAY(ngày,1)`: Chủ nhật = 1, Thứ 2 = 2, ..., Thứ 7 = 7. Ví dụ Thứ 2 là `T2`.
- `<HHmm>`: giờ Việt Nam, 4 chữ số. Cách lấy phụ thuộc loại:

| Loại file | HHmm lấy từ |
|---|---|
| 4 giai đoạn (netsupport, loa, internet, mayTinh) | Giờ của báo cáo MUỘN NHẤT trong giai đoạn đó. Giai đoạn không có báo cáo: giờ chạy. Nếu giai đoạn khác của cùng bộ, ngày, tiêu đề đã dùng giờ này thì lấy phút kế tiếp chưa ai dùng (`freeHhmm`) |
| Theo ngày (dien, cleaning, attendance) | Giờ chạy thực tế của lần dựng |
| `bot:total` | Giờ chạy thực tế của lần xuất, thêm hậu tố `-auto` |

CLAUDE.md còn ghi "HHmm là giờ chạy thực tế" cho 4 giai đoạn: code (`latestReportHhmm` trong `src/lesson/statusFill.ts`) mới là nguồn đúng, theo bảng trên.

## File của bot:total (hậu tố -auto)

`<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>-auto.xlsx`, cùng thư mục `<id>`. Hai đợt mỗi ngày: `morning` (tin từ 6:30 đến trước 9:00) và `afternoon` (tin từ 6:30 đến trước 15:00, cộng dồn). Giờ và khung lấy từ `config.total` (xem `npm run config:show`). Một đợt xuất lại thì chỉ thay các file `-auto` của đợt đó. Mỗi mã ở mỗi đợt có một file `-auto`, nên một ngày có thể có tối đa hai file `-auto` cho cùng một mã (một của đợt sáng, một của đợt chiều).

## Mỗi (bộ, giai đoạn hoặc đợt, mã) chỉ giữ 1 file

- 4 giai đoạn: bản cũ của cùng (bộ, ngày, giai đoạn, tiêu đề) được tìm bằng `data/.status-report-files.json` và xoá SAU khi bản mới ghi xong.
- Theo ngày (dien, cleaning, attendance): sau khi ghi bản mới, xoá mọi file dạng `<tiêu đề>_<yyMMdd>_T<số>_<HHmm>.xlsx` khác của ngày đó. File `-auto` không bị xoá bởi bước này (`pruneSiblings`).
- `bot:total`: bản cũ của cùng (bộ, ngày, đợt, tiêu đề) được tìm bằng `data/.total-report-files.json`.
- Điền lỗi: file ghi dở bị bỏ, BẢN CŨ ĐƯỢC GIỮ nguyên. Xoá bản cũ không được (đang mở trong Excel) chỉ báo cảnh báo; khi đó thư mục tạm thời có 2 file.

## File trạng thái

| File | Ý nghĩa |
|---|---|
| `output/<id>/fill-failed.json` | Mảng mã lỗi ở lần `fill:status-reports` gần nhất của bộ. Mỗi lần chạy xoá file này rồi ghi lại |
| `data/.runner-failed.json` | Mục `<id>\|<ngày>\|<giai đoạn>\|<mã>` runner sẽ điền lại. Qua ngày thì bỏ. Mã theo ngày không cần ở đây vì tự quét lại mỗi vòng |
| `data/.status-report-files.json` | Tên file mới nhất của từng (bộ, ngày, giai đoạn, tiêu đề) |
| `data/.runner-built.json` | Báo cáo đã dựng, theo bộ. Báo cáo có trên đĩa mà không có ở đây làm giai đoạn đó "chưa dựng" |
| `data/.total-report-files.json` | Tên file `-auto` mới nhất của từng (bộ, ngày, đợt, tiêu đề) |
| `data/.total-slots.json` | Các đợt `bot:total` đã xuất (khoá dạng `2026-10-03\|morning`) |
| `data/.electric-report.<id>.json` | Trạng thái dựng file ĐIỆN của bộ: chỉ dựng lại khi nội dung dòng đổi. CLAUDE.md ghi tên `data/.electric-report.json` (không có `<id>`); code ở `src/lesson/electricState.ts` dùng tên có `<id>` |
| `output/fill-<mã>.log` | Log PowerShell/Excel của mã đó ở lần điền gần nhất (thư mục `output` gốc, không theo bộ) |

Lệnh xem tổng quát: `npm run runner:status` và `npm run total:status` (thoát mã 2 khi bot không sống hoặc cấu hình bộ sai).

## Nguyên nhân thường gặp khi thiếu file

- Mẫu Excel thiếu: `npm run reports:list` hiện chữ `THIẾU` ở dòng của mã. (Chữ `có sẵn` là bình thường.)
- File đang mở trong Excel: file bị giữ, mã vào `fill-failed.json` và `.runner-failed.json`, vòng sau thử lại.
- Bộ không bật mã đó trong `config.reportSets[].reports`: không có file, đúng thiết kế.
- CHƯA XÁC NHẬN: thời điểm chính xác `.runner-failed.json` bị dọn khi qua ngày (README chỉ ghi "qua ngày thì bỏ").
