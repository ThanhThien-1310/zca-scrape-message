# Báo cáo VỆ SINH PHÒNG MÁY & VI PHẠM NỘI QUY THỰC TẬP — Thiết kế

**Trạng thái:** đã duyệt qua trao đổi trực tiếp (không qua văn bản trước khi viết spec này) — xem lịch sử hội thoại. Spec này là bản ghi lại chính thức để viết plan và implement.

**Quy ước đặt tên:** mọi identifier MỚI trong code đặt bằng tiếng Anh, theo đúng quy ước đã áp dụng ở spec giai đoạn 4 buổi (`docs/superpowers/specs/2026-09-29-giai-doan-4-phan-design.md`).

## Bối cảnh

Hệ thống hiện có 10 file trạng thái thiết bị/báo cáo (`src/lesson/statusReportLayout.ts`): 5 file có dữ liệu qua `fill:status-reports` (BO SUNG MAY TINH, LOA, INTERNET, NETSUPPORT, MÁY TÍNH), và 5 file nằm trong `OTHER_TEMPLATE_FILES` chỉ được chép nguyên trạng, chưa có dữ liệu: THAY THE MAY TINH, TINH TRANG LOI DIEN, TINH TRANG LOI PHAN MEM, **TINH TRANG VE SINH PHONG MAY**, **VI PHAM NOI QUY THUC TAP**.

Việc này bổ sung dữ liệu cho đúng 2 file cuối. 3 file còn lại (THAY THE MAY TINH, LOI DIEN, LOI PHAN MEM) tiếp tục ngoài phạm vi, vẫn chỉ chép nguyên trạng.

Nguồn dữ liệu của 2 báo cáo này là các nhóm Zalo **khác hoàn toàn** với nhóm báo cáo trường học hiện tại (nhóm IT/vận hành nội bộ — tên nhóm thật chưa xác định). Giai đoạn thử nghiệm dùng tạm nhóm "bot test" đã có sẵn trong `config.targets` (nhóm này hiện cũng đang dùng để test báo cáo trường học qua `groupAliases["bot test"] = "LC_ChuVănAn_BTAN"`).

## Phạm vi

**Trong phạm vi:**
- Trích xuất và điền dữ liệu cho sheet `HANG NGAY` của cả 2 file, tự động chạy trong `bot:runner`.
- Bỏ 2 file này khỏi `OTHER_TEMPLATE_FILES`.

**Ngoài phạm vi (đã chốt qua trao đổi, KHÔNG làm ở lần này):**
- Sheet `TONG` của file vệ sinh (bảng "PM ĐƯỢC BT", các công thức COUNTIF) — không đụng tới, giữ nguyên như trong file mẫu.
- Xếp loại C ("phòng IT không được phép đụng") — bỏ hẳn cơ chế tra "PM ĐƯỢC BT". Xếp loại vệ sinh chỉ còn A/B, suy trực tiếp từ trường "Vệ sinh sạch sẽ" của chính tin nhắn.
- Cột GHI CHÚ của file vệ sinh — để trống.
- Các cột I (NỘI DUNG), J (GIẢI TRÌNH), K (CAM KẾT), L (GHI CHÚ) của file vi phạm — không điền.
- Phân biệt "đi trễ" và "quên điểm danh", và việc đối chiếu chéo với nhóm "BÁO CÁO NỘI QUY" để xác nhận giờ đến thật — không cần nữa, vì hệ quả (cột NỘI DUNG) đã ngoài phạm vi.
- Thiết kế lại cách tính SỐ LẦN kiểu "reset chỉ khi nguyên 1 ngày toàn T/không vi phạm" (đang bàn dở cho BO SUNG/internet/netsupport) — **không áp dụng ở đây**. Cột VI PHẠM (H) dùng tạm logic hiện có (reset về 0 ngay khi ngày đó không vi phạm), chỉ đổi cách tính (từ lịch sử đầy đủ thay vì state tích luỹ — xem mục 4).

## Rủi ro phải xử lý trước: đụng độ tiêu đề với `classifyTitle` hiện tại

`classifyTitle()` (`src/lesson/parseReport.ts:10-18`) khớp CuoiBuoi bằng regex tiền tố `^bao cao cuoi buoi` — **không** yêu cầu có chữ "DẠY" theo sau. Tiêu đề vệ sinh "BÁO CÁO CUỐI BUỔI" (không có "DẠY") vì vậy đang bị pipeline báo cáo trường học nhận nhầm là `CuoiBuoi`, cố áp `parseLines` (dành cho báo cáo lớp học) lên một tin hoàn toàn khác cấu trúc — ra dữ liệu rác hoặc lọt review sai. Đây là rủi ro thật khi 2 tính năng test chung nhóm "bot test".

**Phải sửa** `classifyTitle` để yêu cầu rõ "DẠY": `^bao cao (dau|cuoi) buoi day\b`. Toàn bộ tiêu đề báo cáo trường học thật đã xác nhận qua dữ liệu DB đều có "DẠY", nên đổi này không ảnh hưởng hành vi hiện tại — chỉ chặn đúng trường hợp nhầm lẫn mới. Việc sửa này làm TRƯỚC, có test riêng, trước khi bật test 2 tính năng mới chung nhóm "bot test".

## Kiến trúc

### 1. Phân loại & parse tin nhắn — độc lập với `parseReport.ts`

Hai module mới, không đụng tới `classifyTitle`/`parseLines`/`Report` hiện có (khác cấu trúc dữ liệu hoàn toàn):

- `src/lesson/cleaningReport.ts`: `classifyCleaningTitle(content): boolean` — dòng đầu tiên (fold, bỏ dấu) khớp CHÍNH XÁC `^bao cao cuoi buoi$` (không có gì thêm sau — để không lẫn với "BÁO CÁO CUỐI BUỔI DẠY"); `parseCleaningMessage(content): CleaningEntry | null`.
- `src/lesson/attendanceReport.ts`: `classifyAttendanceTitle(content): boolean` — khớp `^bao cao diem danh`; `parseAttendanceMessage(content): AttendanceEntry | null`.

### 2. Kiểu dữ liệu mới (`src/types/`)

```ts
export interface CleaningEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    tenTruong: string;
    khuVuc: string;
    phongMay: string;
    tenIT: string;
    veSinhSach: boolean; // từ trường "Vệ sinh sạch sẽ: Có/Không"
}

export interface AttendanceEntry {
    maNhom: string;
    maTinNhan: string;
    thoiGian: number;
    tenNV: string;
    noiLamViec: string;
}
```

### 3. VỆ SINH — `src/cli/fill-cleaning-report.ts`

- `cleaningReportDay(now: number): string` (mới, `src/lesson/cleaningReport.ts`) — nếu hôm nay là Thứ 2 thì lùi 2 ngày (Thứ 2 trừ 2 ngày = Thứ 7 tuần trước); các ngày khác lùi 1 ngày. Không dùng `Phase`/`phaseDay`.
- Đọc toàn bộ tin nhắn qua `loadMessages()` (export dùng chung từ `src/runner/steps.ts`), lọc tin có ngày lịch (giờ Việt Nam) = ngày mục tiêu và tiêu đề khớp `classifyCleaningTitle`, parse bằng `parseCleaningMessage`. Mỗi tin hợp lệ = 1 phòng máy = 1 dòng.
- XẾP LOẠI = `veSinhSach ? "A" : "B"`.
- Ghi vào sheet `HANG NGAY`: A=STT, B=NGÀY (ngày mục tiêu), C=TÊN TRƯỜNG, D=KHU VỰC, E=PM, F=HỌ TÊN (tên IT), G=XẾP LOẠI, H=GHI CHÚ (trống). Sheet `TONG` không đụng.
- Dùng lại nguyên cơ chế ghi Excel đã có (`scripts/fill-status-template.ps1` + spec JSON `{template, out, sheet, firstDataRow, totalRowBefore, lastColumn, rows, headerCells, formulaCells}`, như `fill-status-reports.ts` đang gọi) — không viết cơ chế COM mới.
- Tên file: `<tiêu đề đọc từ A1>_<yyMMdd ngày mục tiêu>_T<thứ>_<HHmm giờ chạy thực tế>.xlsx`, ghi vào `data/export/trang-thai/<yyMM>/<yyMMdd>/` với `yyMMdd` = **ngày mục tiêu** (ngày dữ liệu nói về, không phải ngày chạy). Cần biến thể mới của `statusFileName` nhận HHmm dạng chuỗi tự do thay vì tra `PHASE_HHMM[Phase]`.
- Chạy lại nhiều lần trong ngày cho cùng ngày mục tiêu là AN TOÀN: mỗi lần quét lại toàn bộ tin của đúng ngày đó rồi ghi đè — không có state tích luỹ nào có thể sai lệch.

### 4. VI PHẠM — `src/cli/fill-attendance-report.ts`

- Hai khung giờ cố định, hằng số riêng (không liên quan `config.phases`): SÁNG = [08:00, 11:30), CHIỀU = [14:00, 17:30).
- Tin điểm danh rơi vào khung nào → giờ đến ghi vào cột SÁNG hoặc CHIỀU của **đúng ngày gửi** (không lùi ngày, không wrap qua đêm — khác vệ sinh).
- Trễ = giờ đến > 08:00 (khung sáng) hoặc > 14:00 (khung chiều) — đúng 2 mốc này, không phải 8h05/14h05.
- Với mỗi (người, ngày): tạo 1 dòng nếu có ít nhất 1 khung trễ trong ngày; ngày hoàn toàn đúng giờ không tạo dòng.
- Cột H (VI PHẠM = SỐ LẦN): **tính lại từ toàn bộ lịch sử** tin điểm danh mỗi lần chạy, không lưu state tăng dần — theo đúng nguyên tắc "đọc lại từ nguồn" đã thống nhất khi bàn về SỐ LẦN của BO SUNG/internet/netsupport, để tránh lỗi thứ tự khi có tin đến muộn (gap-recovery). Với mỗi người: duyệt các ngày có tin theo thứ tự thời gian tăng dần; ngày có vi phạm → nối tiếp +1 từ ngày trước; ngày không có vi phạm (hoặc không có tin) → về 0. Đây vẫn là logic reset-ngay-khi-không-vi-phạm hiện có, chỉ đổi cách tính (không phải thiết kế mới đang bàn dở).
- CHỨC VỤ (D) = hằng số `"TTS"`. VỊ TRÍ (E) = `noiLamViec`. Cột I/J/K/L để trống hoàn toàn.
- Ghi vào sheet `HANG NGAY` (file chỉ có 1 sheet) bằng cùng cơ chế PowerShell/Excel COM. Tên file/thư mục cùng quy tắc như vệ sinh, nhưng `yyMMdd` = ngày báo cáo thật (không lùi ngày), HHmm = giờ chạy thực tế.

### 5. Gắn vào runner

- Bỏ `"TINH TRANG VE SINH PHONG MAY.xlsx"` và `"VI PHAM NOI QUY THUC TAP.xlsx"` khỏi `OTHER_TEMPLATE_FILES` (`statusReportLayout.ts`) — không còn chép nguyên trạng.
- **Không** gắn vào `buildSession()`: hàm này chạy theo từng `SessionKey` (1 giai đoạn), và 1 cycle có thể có nhiều giai đoạn dirty cùng lúc — gắn vào đó sẽ chạy lặp lại 2 báo cáo này không cần thiết, trong khi chúng không có khái niệm giai đoạn. Thay vào đó: thêm bước mới ở **cấp cycle** — `CycleDeps.buildExtras()` (`src/runner/cycle.ts`, triển khai thật ở `realDeps` trong `steps.ts`) — chạy đúng 1 lần sau vòng lặp build session của `runCycle()`, bọc try/catch riêng (lỗi chỉ vào `summary.warnings`, không làm hỏng cycle), độc lập với việc có session nào dirty hay không.
- `runner:once` (rebuild tay 1 giai đoạn) không gọi 2 bước này. Có 2 lệnh CLI riêng để chạy tay khi cần: `npm run fill:cleaning-report`, `npm run fill:attendance-report`.

### 6. Config

Không cần thêm cấu hình mới cho giai đoạn test (dùng chung `"bot test"` đã có trong `config.targets`). Khi có tên nhóm thật, chỉ cần thêm vào `config.targets` như các nhóm khác — kiến trúc phân loại theo tiêu đề tin nhắn (không theo tên nhóm) nên không cần đổi gì thêm.

## Test

- Unit test `classifyCleaningTitle`/`parseCleaningMessage`, `classifyAttendanceTitle`/`parseAttendanceMessage`: tin hợp lệ, tin thiếu trường, tin không khớp tiêu đề, tin gần giống nhưng không đúng tiêu đề.
- Unit test `cleaningReportDay()`: Thứ 2 → Thứ 7 trước đó (lùi 2), các thứ khác → lùi 1, biên nửa đêm giờ Việt Nam.
- Unit test phân loại khung giờ điểm danh: biên đúng/sai tại 08:00:00, 11:30:00, 14:00:00, 17:30:00.
- Unit test tính SỐ LẦN từ lịch sử đầy đủ: nhiều ngày liên tiếp có/không vi phạm xen kẽ, và trường hợp tin đến không đúng thứ tự thời gian thật (mô phỏng gap-recovery).
- Test regex `classifyTitle` mới (yêu cầu "DẠY"): chạy lại trên toàn bộ tiêu đề báo cáo trường học thật đã có, xác nhận không đổi hành vi; thêm test tiêu đề "BÁO CÁO CUỐI BUỔI" (không DẠY) không còn bị nhận là `CuoiBuoi`.
- Test tích hợp: dữ liệu mẫu → điền thật vào 2 file `.xlsx` thật, kiểm tra bằng dump lại nội dung (cùng cách đã dùng để kiểm tra 5 file kia).
- Test tay ở nhóm "bot test" trước khi thêm nhóm thật vào `config.targets`.

## Review Focus (đưa vào plan)

1. Tiêu đề "BÁO CÁO CUỐI BUỔI" (vệ sinh) lẫn vào pipeline trường học trước khi sửa `classifyTitle` — phải sửa và có test riêng trước khi bật test chung nhóm "bot test".
2. Tin vệ sinh/điểm danh gửi đúng lúc ranh giới khung giờ/ngày (23:59:59, 00:00:00, 08:00:00, 11:30:00, 14:00:00, 17:30:00) — test biên rõ ràng, cùng tinh thần đã làm với 4 giai đoạn.
3. Người điểm danh trễ CẢ sáng lẫn chiều cùng 1 ngày — vẫn chỉ 1 dòng, cả 2 cột SÁNG và CHIỀU cùng điền.
4. `fill-attendance-report` chạy giữa buổi (ví dụ 9h, khi mới có vài tin điểm danh) — không được suy luận người CHƯA điểm danh là "không vi phạm hôm đó"; chỉ tính trên tin ĐÃ THẤY, tuyệt đối không dựa vào sự vắng mặt.
5. Chạy 2 script khi file Excel đích đang mở sẵn (ai đó đang xem) — theo đúng hành vi non-fatal đã có ở `fill-status-reports`: chỉ cảnh báo, không làm hỏng cả cycle.
6. `buildExtras()` lỗi (vd. Excel COM treo) không được làm dirty-session tracking hay vòng lặp build session chính của cycle bị ảnh hưởng — lỗi phải khoanh vùng đúng trong bước mới này.
