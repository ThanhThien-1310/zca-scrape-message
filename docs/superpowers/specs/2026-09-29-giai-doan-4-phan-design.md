# Giai đoạn 4 buổi (đầu/cuối sáng, đầu/cuối chiều) — Thiết kế

**Trạng thái:** đã duyệt qua trao đổi trực tiếp (không qua văn bản trước khi viết spec này) — xem lịch sử hội thoại. Spec này là bản ghi lại chính thức để viết plan và implement.

## Bối cảnh

Hệ thống hiện chia 1 ngày thành 3 "buổi": sáng/chiều/tối (`config.sessions`, `Buoi` type, `sessionOf()` trong `src/lesson/time.ts`), dùng cho `extract:reports`, `fill:report` (.xlsm), và `fill:status-reports` (5 file trạng thái thiết bị không macro, thêm gần đây).

Người dùng nhận thấy khái niệm "buổi" hiện tại quá thô: một buổi thực tế nhận cả báo cáo ĐẦU BUỔI DẠY và CUỐI BUỔI DẠY của một hoặc nhiều lớp, dẫn tới báo cáo trạng thái thiết bị bị trùng (một phòng ra 2 dòng: đầu buổi + cuối buổi) hoặc lấy nhầm số liệu cũ. Sau nhiều vòng bàn bạc (bao gồm tra dữ liệu thật trong DB `Zalo_CrawlMessage` để kiểm chứng), chốt lại: thay "buổi" bằng 4 "giai đoạn" cố định trong ngày, phân loại 1 tin nhắn vào đúng giai đoạn dựa trên **loại báo cáo** (`loaiBaoCao`: `DauBuoi`/`CuoiBuoi`, đọc từ title tin nhắn) kết hợp **giờ gửi**.

## Phạm vi

**Quyết định (đã chốt):** đây là logic THAY THẾ hẳn "buổi" sang/chiều/tối hiện tại, không phải một hệ thống chạy song song vĩnh viễn. `--buoi` ở MỌI lệnh (kể cả lời gọi nội bộ từ `bot:runner`) sẽ chỉ nhận 4 giá trị mới (`dausang|cuoisang|dauchieu|cuoichieu`); `Buoi`/`sessionOf`/`sessionWindow`/`config.sessions` bị xoá hẳn khi không còn nơi nào dùng.

Vẫn triển khai theo thứ tự 2 chặng để đủ nhỏ mà làm/test từng phần (không tách thành 2 spec/2 lần duyệt riêng — cùng 1 plan, các task sau phụ thuộc task trước):

- **Chặng 1**: thêm `Phase`/`config.phases`/các hàm mới trong `time.ts` (chưa xoá gì cũ) + migrate `extract:reports`, `fill:report` (.xlsm), `fill:status-reports` sang dùng `Phase`, đổi `--buoi` của 3 lệnh này sang nhận 4 giá trị mới. Đây là 3 lệnh người dùng tự chạy tay, test được ngay bằng dữ liệu thật.
- **Chặng 2**: migrate nốt `bot:runner` (`src/runner/steps.ts` gọi `extract-reports.ts`/`fill-report.ts` với `--buoi`, `src/runner/affectedSessions.ts`, `src/runner/builtReports.ts`, `src/runner/schedule.ts`), `bot:chat`/`chat-rules`, `recover:missing`, `mark:messages`, `watch:status`, `src/lesson/recovery.ts` — mọi chỗ còn lại đang dùng `Buoi`/`sessionOf`/`sessionWindow`/`config.sessions`.
- **Chặng 3 (dọn dẹp)**: xoá `Buoi`, `sessionOf`, `sessionWindow`, `currentSession`, `isBuoi`, `config.sessions` và các test tương ứng khi Chặng 2 xong và không còn nơi nào import.

Vì Chặng 2 đụng tới `bot:runner`/`bot:chat` đang chạy thật, plan phải yêu cầu người dùng tự dừng bot trước khi merge/deploy nhánh này (theo quy tắc đã có: người dùng tự chạy và theo dõi bot, agent không tự khởi động/deploy).

**Ngoài phạm vi, để làm sau (đề tài brainstorm riêng):** tính năng phát hiện "đi trễ/vi phạm nội quy" cho file `VI PHAM NOI QUY THUC TAP.xlsx` với 2 mốc giờ riêng (8h, 14h) — không liên quan đến 4 giai đoạn báo cáo trạng thái thiết bị. File này giữ nguyên như hiện tại (nằm trong `OTHER_TEMPLATE_FILES`, chỉ copy nguyên trạng, không có dữ liệu).

## 4 giai đoạn & mốc giờ (giờ Việt Nam)

| Giai đoạn | Khung giờ (thô, theo đồng hồ) |
|---|---|
| `dausang` (đầu buổi sáng) | 17h30 hôm trước → trước 9h00 hôm nay |
| `cuoisang` (cuối buổi sáng) | 9h00 → trước 12h30 |
| `dauchieu` (đầu buổi chiều) | 12h30 → trước 15h00 |
| `cuoichieu` (cuối buổi chiều) | 15h00 → trước 17h30 |

Mốc giờ để trong config (`config.phases`), không hard-code, theo đúng style `config.sessions` hiện tại.

## Quy tắc phân loại 1 tin nhắn vào đúng giai đoạn + ngày

Phân loại dựa trên **giờ gửi** (`thoiGian`) VÀ **loại báo cáo** (`loaiBaoCao`, đã có sẵn từ parser hiện tại — đọc từ title "BÁO CÁO ĐẦU BUỔI DẠY"/"BÁO CÁO CUỐI BUỔI DẠY"). Không dùng title làm "bảo hiểm" chéo với giờ — tin đã có `loaiBaoCao` xác định là dùng đúng cái đó, không đối chiếu lại với giờ để nghi ngờ.

**Bước 1 — giai đoạn thô** (`phaseOf`, chỉ theo giờ, bỏ qua loại): tra bảng mốc giờ ở trên.

**Bước 2 — áp dụng quy tắc theo loại** (`classifyPhase`):
- Tin **CUỐI BUỔI** (`CuoiBuoi`): **luôn nhận đúng giai đoạn thô**, không có ngoại lệ — kể cả khi giai đoạn thô ra là một khung "đầu buổi" (ví dụ cuối buổi sáng gửi trễ sau 12h30 thì rơi vào khung "đầu buổi chiều" theo giờ thô, và **nhận luôn**, không bị coi là sai).
- Tin **ĐẦU BUỔI** (`DauBuoi`): được "bảo vệ" để luôn nằm trong một khung đầu-buổi, không bao giờ lẫn vào file cuối-buổi:
  - Giai đoạn thô là `dausang` hoặc `dauchieu` → giữ nguyên.
  - Giai đoạn thô là `cuoisang` (lỡ hẹn đầu-sáng, gửi sau 9h) → đẩy sang **`dauchieu`, cùng ngày**.
  - Giai đoạn thô là `cuoichieu` (lỡ hẹn đầu-chiều, gửi sau 15h) → đẩy sang **`dausang`, NGÀY MAI**.

**Ngày (`day`, `YYYY-MM-DD`)** đi kèm giai đoạn cuối cùng (không phải ngày lịch thô của `thoiGian`):
- Giai đoạn thô là `dausang` do gửi sau 17h30 (đêm nay) → ngày = **ngày mai**.
- Giai đoạn thô là `dausang` do gửi trước 9h (sáng nay) → ngày = hôm nay.
- 3 giai đoạn còn lại (không wrap qua nửa đêm) → ngày = ngày lịch của `thoiGian`.
- Trường hợp đẩy `cuoichieu` → `dausang` (đầu-buổi lỡ hẹn đầu-chiều): ngày ép thành **ngày lịch của `thoiGian` + 1** (không phải ngày lịch thô của `thoiGian`, vì giờ gửi thật luôn < 17h30 nên không tự động wrap được — phải cộng ngày thủ công).

Đã kiểm chứng logic trên khớp với dữ liệu thật trong DB (có báo cáo ĐẦU BUỔI gửi lúc 09:18-09:48, tức lỡ hẹn 9h khá phổ biến, không phải trường hợp hiếm).

### Interface đề xuất (`src/lesson/time.ts`, thêm mới — không sửa hàm cũ)

```ts
export type Phase = "dausang" | "cuoisang" | "dauchieu" | "cuoichieu";

export interface PhaseHours {
    cuoiSangFromHour: number; // 9
    dauChieuFromHour: number; // 12.5
    cuoiChieuFromHour: number; // 15
    dauSangFromHour: number;  // 17.5 — mốc "đầu buổi sáng NGÀY MAI" bắt đầu
}

export function phaseOf(ts: number, hours?: PhaseHours): Phase;           // giai đoạn thô, chỉ theo giờ
export function phaseDay(ts: number, hours?: PhaseHours): string;         // ngày ứng với giai đoạn thô (có wrap)
export function classifyPhase(ts: number, loaiBaoCao: LoaiBaoCao, hours?: PhaseHours): { phase: Phase; day: string };
export function isPhase(value: string | undefined): value is Phase;
export function addDays(day: string, n: number): string;                  // helper dùng chung
```

`config.phases` thêm section mới trong `config.ts` (giữ nguyên `config.sessions`), validate trong `configCheck.ts`, mô tả trong `configDoc.ts` — theo đúng pattern hiện có.

## Ảnh hưởng tới `extractAll` (`src/lesson/extract.ts`)

Hiện tại lọc tin nhắn theo `(day, buoi)` **TRƯỚC KHI parse** (dùng `vietnamDay`/`sessionOf` trên tin thô — dòng 68). Với giai đoạn mới, việc này **không làm được nữa theo cách cũ**: `classifyPhase` cần `loaiBaoCao`, mà `loaiBaoCao` chỉ có được **sau khi parse** title của từng tin (việc parse hiện nằm trong vòng lặp phía dưới, dùng `classifyTitle`).

Hướng sửa: đổi thứ tự — lọc tin nhắn theo một **khung ngày rộng hơn** trước (đủ chứa cả phần "đêm hôm trước" của `dausang`, ví dụ toàn bộ `[ngày-1 17h30, ngày 24h00)`), parse tất cả tin trong khung đó như bình thường, rồi lọc **kết quả đã parse** (`Report[]`) theo `classifyPhase(report.thoiGian, report.loaiBaoCao) === { day: opts.day, phase: opts.buoi }` khi `opts.buoi` được truyền. Ghi rõ điểm này trong plan — đây là điểm phức tạp nhất của Chặng 1, cần task/test riêng.

`ExtractOptions.buoi?: Buoi` đổi type thẳng sang `ExtractOptions.buoi?: Phase` (Chặng 1 chỉ đổi ở `extract.ts`/`extract-reports.ts` — nơi khác trong Chặng 2 như `recovery.ts`, `affectedSessions.ts` vẫn giữ `Buoi`/`SessionKey` cũ cho tới khi migrate, không import `ExtractOptions` nên không bị ảnh hưởng dây chuyền).

## Cờ CLI

**Đổi thẳng, không giữ song song:** `--buoi` ở cả 3 lệnh (`extract:reports`, `fill:report`, `fill:status-reports`) đổi sang chỉ nhận `dausang|cuoisang|dauchieu|cuoichieu` — bỏ hẳn `sang|chieu|toi` ở 3 lệnh này (báo lỗi rõ ràng nếu ai còn gõ giá trị cũ). Tên cờ giữ nguyên `--buoi` (không đổi tên cờ), chỉ đổi tập giá trị hợp lệ và ý nghĩa bên trong (dùng `Phase`/`classifyPhase` thay vì `Buoi`/`sessionOf`).

`output/meta.json` (do `extract:reports` ghi, `fill:report`/`fill:status-reports` đọc mặc định khi không truyền `--buoi`): field `buoi` vẫn tên `buoi`, nhưng giá trị giờ là một trong 4 giá trị mới.

## Tên file `.xlsm` (`fill:report`)

Đổi `reportFileName()` hiện có sang nhận `Phase` thay vì `Buoi`:
```
baocaobuoi<buoi>_<ddMMyy>.xlsm    // vd: baocaobuoidausang_290926.xlsm — buoi giờ là 1 trong 4 giá trị mới
```

## `fill:status-reports` — đổi cấu trúc thư mục + tên file

- Thư mục: `data/export/trang-thai/<yyMM>/<yyMMdd>/` — `yyMMdd` là **ngày đã tính theo giai đoạn** (`classifyPhase` trả về), không phải ngày lịch thô.
- Tên file, áp dụng cho **cả 10 file** (5 file có dữ liệu + 5 file copy nguyên trạng, trừ `VI PHAM NOI QUY THUC TAP.xlsx` — xem "Ngoài phạm vi"):
  ```
  <tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx
  ```
  - `<tiêu đề>`: đọc đúng nguyên văn dòng 2 của ô A1 trong CHÍNH file mẫu đó (ví dụ file LOA có sẵn "TÌNH TRẠNG LOA", file MÁY TÍNH có sẵn "TÌNH TRẠNG LỖI MÁY TÍNH") — không hard-code danh sách tên, đọc động từ file mẫu lúc chạy.
  - `<thứ>` = số thứ theo quy ước Excel `WEEKDAY(d,1)` (1=CN...7=Thứ 7), tính theo `yyMMdd` ở trên (hàm `WEEKDAY_EXCEL_TYPE1` đã có sẵn trong `statusReportLayout.ts`, tái dùng).
  - `<HHmm>` = **mốc giờ cố định kết thúc của giai đoạn**, KHÔNG phải giờ báo cáo thật, giống nhau cho cả 10 file trong 1 lần xuất:

    | Giai đoạn | HHmm |
    |---|---|
    | `dausang` | `0900` |
    | `cuoisang` | `1230` |
    | `dauchieu` | `1500` |
    | `cuoichieu` | `1730` |

  Ví dụ đầy đủ: `TÌNH TRẠNG LOA_260929_T3_0900.xlsx` (xuất giai đoạn đầu buổi sáng, ngày 29/09/2026 — thứ Ba).

5 file "chưa có nguồn dữ liệu" (`OTHER_TEMPLATE_FILES` trừ VI PHAM) vẫn chỉ copy nguyên trạng như hiện tại, nhưng copy ra **tên mới theo format trên** thay vì giữ tên file mẫu gốc.

## Cột CẤP (`BO SUNG MAY TINH`, `buildBoSungRows` trong `statusRows.ts`)

Đổi map:
```
TH   -> "I"
THCS -> "II"
THPT -> "III"
LC   -> "LC"   (giữ nguyên, không đổi)
```
(khác `mã cấp học` khác — nếu có giá trị lạ không thuộc 4 loại trên, giữ nguyên chuỗi gốc, không throw.)

## Review Focus (đưa vào plan)

1. Tin ĐẦU BUỔI gửi rất trễ, lỡ **cả 2** khung đầu-buổi trong ngày (giả thuyết: gửi sau `cuoichieu` đã đóng, tức sau 17h30) — đã có quy tắc (đẩy sang `dausang` ngày mai), cần test rõ ràng.
2. Tin CUỐI BUỔI gửi rất sớm (trước 9h, khi chưa khung cuối-buổi nào "mở" theo nghĩa thông thường) — theo quy tắc đã chốt, nhận đúng giai đoạn thô (`dausang`) không có ngoại lệ; cần 1 test khẳng định rõ hành vi này (dễ bị coi nhầm là bug nếu không có test).
3. `extractAll` lọc theo khung ngày rộng rồi lọc lại sau khi parse (mục "Ảnh hưởng tới extractAll") — test riêng cho việc tin nhắn "đêm hôm trước" (sau 17h30) được đưa đúng vào kết quả của "ngày mai, dausang" chứ không bị lọc mất ở bước lọc thô ban đầu.
4. File mẫu không có dòng tiêu đề đọc được ở A1 (dòng 2) — hành vi lỗi phải rõ ràng (throw có tên file, không âm thầm dùng tên rỗng).
5. `fill:status-reports` chạy 2 lần liên tiếp cho CÙNG một giai đoạn (không phải test tự động, nhưng cần xác nhận bằng tay): ghi đè đúng file cũ trong đúng thư mục `yyMM/yyMMdd/`, không tạo file trùng tên khác giờ do làm tròn.
