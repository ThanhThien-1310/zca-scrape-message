# Cột SỐ LẦN (INTERNET / NETSUPPORT) tính từ lịch sử — Thiết kế

> **Đã bị thay thế (2026-10-03):** bộ mẫu mới không còn cột SỐ LẦN nên toàn bộ phần tính SỐ LẦN (`faultHistory.ts`, `streakHistory.ts`, `historyDb.ts`, `config.streak`) đã bị gỡ khỏi code. Tài liệu này chỉ còn giá trị lịch sử thiết kế — xem `2026-10-03-bo-mau-moi-7-file-design.md`.

**Trạng thái:** đã duyệt qua trao đổi trực tiếp (2026-10-01): làm **hướng B** trước, ghi lại **hướng C** ở mục "Hướng C" để nâng cấp khi hệ thống lớn.

**Quy ước đặt tên:** identifier MỚI bằng tiếng Anh (xem spec giai đoạn 4 buổi).

## Vấn đề

`src/lesson/faultStreaks.ts` (cũ) tính SỐ LẦN **tăng dần, lưu state** trong `data/.status-streaks.json`: mỗi báo cáo K thì +1, **bất kỳ T/B nào cũng về 0 ngay**, và cộng theo thứ tự tin được xử lý. Hai điểm không đúng ý nghiệp vụ:

1. T/B xen giữa làm mất số đếm: chiều hôm trước K (1), sáng hôm sau T (về 0), chiều K lại ra 1 thay vì 2.
2. Tin đến muộn (khôi phục sau gián đoạn) hoặc xử lý sai thứ tự làm số đếm sai và không tự sửa được, vì state chỉ đi tới.

## Luật mới (chốt ngày 2026-10-01: mỗi ngày chốt MỘT lần vào báo cáo cuối buổi chiều)

Luật cũ trong cùng ngày thiết kế (K cộng dồn theo từng báo cáo, reset sau một ngày không có K) đã được thay bằng luật dưới đây theo yêu cầu nghiệp vụ: báo cáo cuối buổi chiều là báo cáo tổng kết của ngày, nên dùng đúng thời điểm đó để quyết định phòng "còn lỗi" hay không.

Với mỗi khoá **(nhóm, phòng, loại)** (loại = `internet` | `netsupport`), duyệt các ngày có báo cáo của khoá đó theo thứ tự tăng dần. **Chốt ngày D** bằng báo cáo cuối buổi chiều (`classifyPhase(...).phase === "afternoonend"`) của phòng đó trong ngày D:

- Cuối chiều **K** (còn lỗi): số đếm **+1** (mỗi ngày tối đa +1, dù trong ngày có nhiều báo cáo K ở các giai đoạn khác).
- Cuối chiều **T hoặc B** (hết lỗi): số đếm **về 0**.
- Ngày **không có** báo cáo cuối chiều có xếp loại hợp lệ (T/B/K) của phòng đó (không có lớp buổi chiều, báo muộn quá 17h30, hoặc để trống như "Học tại lớp"): **bỏ qua**, giữ nguyên số đếm (không tăng, không reset).
- Nhiều báo cáo cuối chiều của cùng phòng trong một ngày: báo cáo **muộn nhất** quyết định.
- Báo cáo có `xepLoai === null` cho loại đó, hoặc không có `phongMay`: bỏ qua, không có giá trị.

**Giá trị hiển thị** của mỗi báo cáo:
- Báo cáo **cuối buổi chiều** của ngày D: số đếm **sau khi** chốt ngày D.
- Báo cáo ở **giai đoạn khác** trong ngày D (đầu sáng, cuối sáng, đầu chiều): số đã chốt **đến hết ngày liền trước** (chưa cộng hôm nay). Số của hôm nay chỉ tăng ở file giai đoạn cuối buổi chiều.

"Ngày" của báo cáo = ngày do `classifyPhase(thoiGian, loaiBaoCao)` trả về (cùng khái niệm ngày dùng đặt tên thư mục xuất), không phải ngày lịch thô; báo cáo đầu buổi gửi sau 17h30 thuộc đầu buổi sáng ngày hôm sau.

## Hướng B (đang làm): tin thô từ DB + phân tích tại máy, không lưu state

Mỗi lần `fill:status-reports` chạy, **tính lại** số đếm từ lịch sử, không còn `data/.status-streaks.json`:

1. Lấy các tin báo cáo trong `config.streak.historyDays` ngày gần nhất (mặc định **60**) từ bảng `Zalo_CrawlMessage` (bảng tin thô, giữ nguyên; xem `docs/Zalo_CrawlMessage.md`). Lọc ngay trong truy vấn theo tiêu đề (`BUỔI DẠY` / `BUOI DAY`) để chỉ kéo các tin báo cáo (~4 lần ít hơn so với kéo mọi tin).
2. Phân tích tại máy bằng đúng bộ phân tích đang dùng (`classifyTitle`, `extractRaw`, `deriveReport`), áp `output/overrides.json`.
3. Gộp thêm các báo cáo của chính giai đoạn đang dựng (từ `output/output.json`, TRƯỚC khi lọc "phòng mới nhất") và khử trùng theo (nhóm, mã tin) — để số đếm luôn tính cả báo cáo hiện tại kể cả khi `sync-db` chưa kịp đẩy lên DB.
4. `computeStreakCounts` áp luật mới, trả `Map<"<maTinNhan>|<loại>", số đếm>` (cùng dạng `perMessage` mà `statusRows.ts` đang dùng, nên `statusRows.ts` không đổi).

**Dự phòng:** nếu đọc DB lỗi (mất mạng, thiếu `.env`) thì đọc cùng cửa sổ ngày từ kho JSON cục bộ (`MessageStore`) và ghi cảnh báo — dựng Excel không bị hỏng.

**Lý do chọn B (đo bằng `scripts/benchHistory.ts`, 300 nhóm, ~10 tin/nhóm/ngày, ~2,3 báo cáo/nhóm/ngày):** phân tích lại toàn bộ lịch sử tốn tuyến tính theo số ngày (0,8 s @7 ngày, 3,7 s @60, 7,9 s @120, 22 s @240; ~63 nghìn tin/giây, phép tính SỐ LẦN gần như không tốn). Giới hạn 60 ngày giữ chi phí ~3–4 s mỗi lần dựng (so với ~14 s dựng Excel hiện tại) và ~15 MB kéo từ DB nếu chỉ lấy tin báo cáo.

**Hạn chế đã biết của B**
- Cột `GroupName` trong DB bị cắt 50 ký tự; `extractRaw` dùng tên nhóm để suy ra trường/khu vực. Tên nhóm hiện đều ngắn hơn 50, nếu có tên dài hơn thì phân tích bản DB có thể lệch so với bản JSON.
- Khoá số đếm là (mã nhóm, tên phòng IN HOA đã trim, loại) như cũ — đổi tên phòng thì bắt đầu đếm lại.
- Một phòng K liên tục quá `historyDays` ngày: số đếm dừng ở số K trong cửa sổ (không bao giờ đếm vượt cửa sổ).
- Chưa đo tốc độ truy vấn DB và mạng thật.

## Hướng C (ghi lại để nâng cấp sau): bảng lưu báo cáo đã phân tích

**Khi nào chuyển sang C:** khi vượt ~300 nhóm, hoặc cần `historyDays` > ~120 ngày, hoặc đo thấy thời gian dựng/kéo DB làm chậm vòng runner (so `npm run runner:timing`, bước "dựng Excel"), hoặc một hệ thống khác (backend/frontend) cần đọc dữ liệu đã phân tích.

**Ý tưởng:** thêm bảng `Zalo_ParsedReport`, **mỗi dòng một báo cáo đã phân tích xong và đã áp sửa tay** (không cần bảng riêng cho `overrides.json`; sửa xong chạy `runner:once` thì dòng được ghi đè):

| Nhóm cột | Cột |
|---|---|
| Khoá | `GroupId`, `MessageId` (duy nhất; trỏ về `Zalo_CrawlMessage`) |
| Thời gian | `Timestamp`, `ReportDay`, `Phase`, `ReportKind` (đầu/cuối buổi) |
| Phòng | `RoomId`, `SchoolLevel`, `SchoolName`, `Area`, `RoomName`, `Teacher` |
| Tình trạng | `NetSupportGrade`, `InternetGrade`, `SpeakerGrade`, `AcGrade` (T/B/K/NULL) |
| Số máy | `MissingCount`, `BrokenCount`, `BrokenNote` |
| Quản lý | `StatusId`, `UpdatedAt` |

Cột ngang (không bảng con) vì các mục thiết bị cố định. Chỉ mục `(GroupId, RoomName, Timestamp)`.

**Luồng khi có C:** sau `extract-reports` (ra `output.json`) thêm bước `sync-reports` **upsert** lên `Zalo_ParsedReport` (idempotent như `sync-db`; tin đến muộn chỉ là thêm dòng vì số đếm sắp theo `Timestamp`); `fill-status-reports` truy vấn lịch sử từng phòng từ bảng này rồi áp **cùng** `computeStreakCounts`. Cần: script `CREATE TABLE` (người dùng tự xem/chạy), lệnh `sync-reports`, và một lệnh nạp lịch sử một lần (chạy lại phân tích trên các ngày đã cào).

**Chuyển B → C chỉ đổi nguồn đầu vào:** `computeStreakCounts(reports)` nhận danh sách báo cáo đã phân tích và không biết chúng đến từ đâu; B lấy từ DB tin thô + phân tích, C lấy thẳng từ `Zalo_ParsedReport`. Không phải viết lại luật.

## Cấu hình

`config.streak.historyDays` (mặc định 60, số nguyên ≥ 1): số ngày lịch sử dùng để tính SỐ LẦN. Đọc bởi `fill:status-reports`. Mục "10. SỐ LẦN" trong `config.ts`, `configCheck.ts`, `configDoc.ts`.

## Thành phần

- `src/lesson/faultHistory.ts` (mới): `reportsFromMessages(messages, overrides)`, `computeStreakCounts(reports, categories?)`, `mergeReports(a, b)`.
- `src/store/historyDb.ts` (mới): `loadHistoryMessages(sinceTs, pool?)` — đọc tin báo cáo từ `Zalo_CrawlMessage`.
- `src/lesson/streakHistory.ts` (mới): `loadStreakHistory(sinceTs, deps?)` — DB trước, lỗi thì kho JSON, trả kèm cảnh báo.
- `src/cli/fill-status-reports.ts`: dùng các hàm trên thay `applyStreaks/readStreaks/writeStreaks`.
- Xoá `src/lesson/faultStreaks.ts`, `tests/faultStreaks.test.ts`, file trạng thái `data/.status-streaks.json` (không còn dùng; `benchLoad.ts` bỏ phần sao lưu file này).

## Kiểm thử

- `computeStreakCounts`: chốt mỗi ngày một lần vào cuối buổi chiều (4 báo cáo K trong ngày vẫn +1); K cuối chiều liên tiếp 1, 2, 3; cuối chiều T/B về 0; K buổi sáng nhưng cuối chiều hết lỗi không tính; ngày không có báo cáo cuối chiều bỏ qua; nhiều báo cáo cuối chiều trong ngày thì báo cáo muộn nhất quyết định; xếp loại để trống ("Học tại lớp") không chốt; giá trị hiển thị của giai đoạn trước cuối chiều là số đã chốt đến hôm qua; độc lập theo (nhóm, phòng, loại); tin đến sai thứ tự mảng vẫn đúng; `xepLoai` null / không có phòng bị bỏ qua; ngày theo `classifyPhase`.
- `reportsFromMessages`: chỉ lấy DauBuoi/CuoiBuoi, áp override (loaiBo, sửa), bỏ tin không phải báo cáo.
- `loadHistoryMessages`: ánh xạ dòng DB → `SourceMessage`, tham số truy vấn (mốc `sinceTs`).
- `loadStreakHistory`: DB OK dùng DB; DB lỗi dùng JSON kèm cảnh báo; cả hai lỗi thì ném lỗi.
- `mergeReports`: khử trùng theo (nhóm, mã tin), bản trong giai đoạn hiện tại thắng.
