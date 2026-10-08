# Bộ báo cáo theo người phụ trách — thiết kế

Ngày: 2026-10-06. Trạng thái: **chờ người dùng duyệt** (chưa có kế hoạch triển khai, chưa có code).

## 1. Mục tiêu

1. Mỗi **người phụ trách** có một thư mục riêng chứa các báo cáo của họ:
   `<statusExportDir>/<yyMM>/<yyMMdd>/<id người>/<file báo cáo>`, ví dụ `…/2610/261006/NguyenVanA/TÌNH TRẠNG NETSUPPORT_261006_T3_0742.xlsx`.
2. Báo cáo thuộc về **người**, không thuộc về nhóm Zalo. Người A có 7 loại hiện tại, người B có 4 loại mới (làm sau). A và B có thể đọc cùng một nhóm Zalo; không có chuyện nhóm nào bị chặn.
3. **Cô lập lỗi.** Dữ liệu của bộ 1 hỏng, `overrides.json` của bộ 1 sai, hay mẫu Excel của một loại báo cáo của bộ 1 thiếu thì bộ 2 và các bộ khác vẫn xuất bình thường. Đơn vị cô lập là cặp **(bộ, mã báo cáo)**: một file hỏng không kéo các file còn lại của cùng bộ.
4. Cấu hình sai (gõ sai mã, bộ không khai báo cáo…) **không làm bot dừng**: phần sai bị tắt và báo lỗi ồn ào, phần còn lại chạy.

Không nằm trong phạm vi: thêm 4 loại báo cáo mới (tiêu đề, cách đọc tin, mẫu, bố cục); mẫu Excel riêng theo từng bộ; thay đổi `bot:watch`, `bot:scrape`, `bot:chat`.

## 2. Cấu hình

`config.ts`, mục mới `reportSets` (đặt trong phần 1 cạnh `statusExportDir`):

```ts
reportSets: [
    { id: "NguyenVanA", reports: ["netsupport", "loa", "internet", "mayTinh", "dien", "cleaning", "attendance"] },
    // { id: "NguyenVanB", reports: [ …4 mã mới khi đã làm xong… ] },
] as ReportSetConfig[],
```

- `id`: tên thư mục. Hợp lệ khi không rỗng, không chứa `\ / : * ? " < > |`, không kết thúc bằng dấu chấm hay khoảng trắng, và không trùng giữa các bộ (so không phân biệt hoa thường vì Windows).
- `reports`: danh sách **mã nội bộ** (bảng đăng ký ở mục 3). Không có mặc định: bộ không khai `reports` (thiếu hoặc rỗng) thì không xuất gì.
- Giá trị `targets`, `groupAliases`, mẫu Excel (`data/mau bao cao new`) dùng chung cho mọi bộ. Mọi tin từ mọi nhóm đi qua mọi bộ.
- Một mã báo cáo nằm trong hai bộ: cho phép (file ra cả hai thư mục), chỉ ghi chú trong `config:show`.
- Bot **tự tạo** thư mục của bộ (`mkdir -p`) khi xuất.

### Kiểm tra (`resolveReportSets`, hàm thuần, không bao giờ ném lỗi)

Trả về `{ active: ResolvedSet[], problems: Problem[] }`.

| Tình huống | Kết quả |
|---|---|
| `id` không hợp lệ hoặc trùng | tắt bộ đó (với trùng: tắt cả hai) |
| `reports` thiếu hoặc rỗng | bỏ qua cả bộ |
| mã báo cáo không có trong bảng đăng ký | bỏ qua riêng mục đó; thông báo nêu mã sai và danh sách mã hợp lệ |
| `reportSets` rỗng hoặc không bộ nào hợp lệ | bot vẫn chạy, báo lỗi lớn "không có bộ nào xuất file" |
| `reportSets` không phải mảng | như rỗng |

Mỗi `Problem` có mức (`error` | `warning`) và câu tiếng Việt. Nơi hiển thị: màn hình lúc `bot:runner` và `bot:total` khởi động, đầu mỗi vòng runner (`warnings` của tóm tắt), `runner:status` và `total:status` (mã thoát 2 khi có bộ bị tắt hoặc cặp lỗi), `config:show`. `configCheck.ts` không còn ném lỗi cho `reportSets`; nó chỉ kiểm tra kiểu dữ liệu cơ bản của `statusExportDir`, như hiện nay.

## 3. Bảng đăng ký mã báo cáo

Một file mới `src/reportSets/registry.ts`. Mỗi mã có: `key`, `kind`, mẫu (từ `FILE_LAYOUT`, `CLEANING_LAYOUT`, `ATTENDANCE_LAYOUT`) và mô tả. Tiêu đề tin và cách đọc tin vẫn ở `lesson/` như hiện nay; bảng đăng ký chỉ trỏ tới đó.

| Mã | Loại (`kind`) | Nguồn tin (tiêu đề dòng đầu) | Khi dựng |
|---|---|---|---|
| `netsupport`, `loa`, `internet`, `mayTinh` | `phase` | `BÁO CÁO ĐẦU/CUỐI BUỔI DẠY` (một tin ra cả 4) | mỗi giai đoạn của ngày (4 giai đoạn) |
| `dien` | `day` | `LỖI ĐIỆN` | một file mỗi ngày, dựng lại khi dòng đổi |
| `cleaning` | `day` | `BÁO CÁO CUỐI BUỔI` | một file mỗi ngày, quét lại cả ngày |
| `attendance` | `day` | `BÁO CÁO ĐIỂM DANH` | một file mỗi ngày, quét lại cả ngày |

Danh tính của báo cáo là **mã nội bộ**, không phải tên file mẫu hay tiêu đề đọc từ ô A1 (đổi LOA → ÂM THANH không làm đổi mã `loa`). Thứ tự khoá trong bảng là thứ tự xuất và in (NETSUPPORT, ÂM THANH, INTERNET, MÁY TÍNH, ĐIỆN, VỆ SINH, NỘI QUY), giữ như `FILE_LAYOUT` hiện tại. `npm run reports:list` in bảng này (mã, loại, nguồn tin, mẫu, mẫu có tồn tại trên máy không).

Thêm loại mới về sau: một dòng trong bảng đăng ký, cộng cách đọc tin, bố cục mẫu và (nếu tin chung tiêu đề với loại khác) kiểm tra không trùng; sau đó ghi mã vào `reports` của bộ cần.

## 4. Đường dẫn

`statusReportDir(root, day)` giữ nguyên chữ ký. Thêm `setReportDir(root, setId, day) = path.join(statusReportDir(root, day), setId)` trong `src/core/paths.ts`. Mọi script `fill:*` và `bot:total` ghi vào `setReportDir`. File cũ xuất trước đây (thư mục `<ngày>/` không có cấp người) giữ nguyên, không tự chuyển; bot chỉ ghi vào chỗ mới từ lần xuất sau (giống cách đổi `statusExportDir`).

## 5. Luồng runner theo bộ

Vòng runner (recover → scrape → sync) **không đổi**: một Zalo, một hàng chờ, một kho tin `data/<groupId>.json`, chỉ đọc. Phần dựng báo cáo thay đổi:

```
for set of active sets (đúng thứ tự trong config, tuần tự):     // try/catch riêng cho cả bộ
    phase reports:  các giai đoạn còn "bẩn" của bộ → chạy các mã phase đã bật
    day reports:    dien / cleaning / attendance nếu bộ bật
```

### 5.1 Thư mục làm việc riêng

`output/<id>/` chứa `output.json`, `marks.json`, `review.json`, `meta.json`, `overrides.json`, `review_<ngày>_<buổi>.json`, và `fill-spec-*.json`, `fill-*.log` của bộ đó. Các script nhận thêm `--set <id>` và đọc/ghi trong thư mục này; `output/` gốc không còn được dùng khi chạy từ runner. Chạy tay không kèm `--set` chỉ hợp lệ khi `reportSets` có đúng một bộ hợp lệ; ngược lại script dừng và nói phải chỉ rõ `--set`. `runner:once` cũng nhận `--set` (bỏ trống = mọi bộ).

### 5.2 Mỗi (bộ, mã) là một bước độc lập

`fill:status-reports` hiện chạy 4 mã trong một vòng lặp, và lỗi ngoài `try` (ví dụ không đọc được tiêu đề mẫu) làm dừng cả vòng lặp — đã gặp khi mẫu ÂM THANH thiếu làm INTERNET và MÁY TÍNH không bao giờ chạy. Sau khi sửa:

- Việc đọc tiêu đề mẫu, dựng tên file, điền, xoá bản cũ, ghi tracker đều nằm trong `try` của **từng (bộ, mã)**; bước dọn bản ghi dở cũng nằm trong `try` (file đang bị Excel giữ thì không được làm dừng vòng lặp).
- Lỗi của một cặp: ghi cảnh báo nêu `id` bộ, mã báo cáo, đường dẫn mẫu đang tìm hoặc file đích; bản cũ của cặp đó được giữ; các cặp khác chạy tiếp.
- `fill-status-reports.ts` vẫn có thể chạy các mã `phase` của một bộ trong một lệnh (mỗi file một tiến trình PowerShell riêng như bây giờ), nhưng thoát mã 1 chỉ sau khi đã thử hết các mã.

### 5.3 Trạng thái theo bộ

| File trạng thái | Hiện nay | Sau khi sửa |
|---|---|---|
| `data/.runner-built.json` | mảng `messageKey` đã dựng | đối tượng `{ "<id>": [messageKey…] }` |
| `data/.status-report-files.json` | khoá `<ngày>\|<giai đoạn>\|<tiêu đề>` | khoá `<id>\|<ngày>\|<giai đoạn>\|<tiêu đề>` (file ra thư mục khác nhau nên không đè được nhau) |
| `data/.electric-report.json` | một trạng thái | một trạng thái mỗi bộ có `dien` (khoá theo `id`) |
| `data/.total-report-files.json` | khoá `<ngày>\|total-<slot>\|<tiêu đề>` | thêm `<id>\|` ở đầu |

**Di chuyển (lần chạy đầu sau khi nâng cấp):**
- `.runner-built.json` dạng mảng cũ được gán cho **mọi bộ đang có trong config lúc đó** (hiện chỉ một bộ). Không dựng lại gì.
- Một bộ **mới thêm sau này** được coi như runner lần đầu: các báo cáo đã có trong kho lúc bộ xuất hiện được tính là "đã dựng" (`initBuiltBaseline` theo từng bộ). Nếu không, thêm một bộ sẽ dựng lại toàn bộ lịch sử trong kho (mỗi giai đoạn 4 lần chạy Excel).
- `output/overrides.json` cũ ở gốc: không tự chuyển. Khi khởi động, nếu còn file đó và bộ nào chưa có `output/<id>/overrides.json`, bot ghi cảnh báo ồn ào kèm lệnh chép tay vào đúng bộ. (Sửa dữ liệu theo bộ là chủ ý, nên không tự chép cho mọi bộ.)

### 5.4 Thử lại

Hiện lỗi `fill-status-reports` là cảnh báo nhưng buổi vẫn được đánh dấu đã dựng, nên không tự thử lại. Sau khi sửa: cặp (bộ, mã `phase`) nào lỗi trong một buổi được ghi vào `data/.runner-failed.json` (`<id>|<ngày>|<giai đoạn>|<mã>`); vòng sau, các bộ có mục còn trong danh sách đó dựng lại **chỉ các mã lỗi** của buổi đó, thành công thì xoá khỏi danh sách. Mã `day` vốn tự quét lại mỗi vòng nên không cần danh sách này.

## 6. Dấu `StatusId` và `HasRead` trên tin

Chỉ các tin "báo cáo đầu/cuối buổi dạy" được đánh dấu (`marks.json` → `mark-messages`). Một tin có thể nuôi nhiều bộ. Quy ước:
- Mỗi bộ ghi `output/<id>/marks.json` của riêng nó.
- Khi đánh dấu, gộp theo tin: `StatusId` = giá trị của bộ đã dựng xong; nếu bất kỳ bộ nào đánh dấu "cần xem" thì giữ "cần xem". `HasRead = 1` khi ít nhất một bộ đã xử lý.
- Lỗi của một bộ **không chặn** việc đánh dấu của bộ khác; lỗi `mark-messages` là cảnh báo (như `buildExtras` hiện nay) và chạy lại ở vòng sau.

Hiện chỉ có một bộ dùng các tin này nên chưa có xung đột; quy ước trên cần được cài và có test trước khi thêm bộ thứ hai dùng cùng loại tin. (Điểm này cần kiểm tra lại với giá trị `StatusId` thực tế khi viết kế hoạch.)

## 7. `bot:total` (9:00 và 15:00)

`runTotalOnce` đã cô lập lỗi theo từng file; chỉ cần lặp theo bộ: với mỗi bộ hợp lệ dựng các file `-auto` của các mã trong `reports`, ghi vào `setReportDir`, tracker khoá theo `id`. Giữ nguyên các quy tắc đợt (`slots`), chờ runner, làm mới định kỳ. Bản ghi đợt (`.total-slots.json`) thêm danh sách các cặp (bộ, mã) lỗi. In: vẫn in mọi file vừa xuất, theo thứ tự bộ rồi thứ tự mã; lỗi in chỉ là cảnh báo.

## 8. Hiển thị lỗi

- Tóm tắt mỗi vòng runner (`output/runner-log.jsonl`) thêm trường theo bộ: danh sách bộ đã chạy, và cặp (bộ, mã) lỗi.
- `runner:status`, `total:status`, `config:show` liệt kê bộ đang chạy, bộ bị tắt (kèm lý do), cặp đang lỗi, và các tin bị bỏ qua vì loại chưa được bộ nào bật (đếm trong tóm tắt vòng).
- Nhóm Zalo trong `targets` luôn được theo dõi và cào; không còn kiểm tra theo nhóm.

## 9. Kiểm thử

Thuần (`node:test`, không cần Excel): `resolveReportSets` (từng dòng của bảng mục 2), `setReportDir` (kể cả `id` có dấu tiếng Việt), chuyển đổi `.runner-built.json` cũ sang mới, khoá tracker có `id`, gộp dấu `StatusId` theo mục 6, `dirtySessions` theo bộ. Một test hành vi cho `fill-status-reports`: cặp đầu lỗi (mẫu thiếu) thì các cặp sau vẫn chạy và mã thoát là 1, dùng bản `runFillTemplate` giả. `npm run typecheck` và `npm test` phải sạch.

## 10. Rủi ro và giả định cần xác nhận khi viết kế hoạch

1. Thời gian một vòng tăng tuyến tính theo số bộ (Excel COM chạy tuần tự); chấp nhận được với 2–3 bộ.
2. Quy ước `StatusId` ở mục 6 chưa được kiểm tra với giá trị `StatusId` thực tế trong DB.
3. Loại tin mới của người B dùng chung tiêu đề `BÁO CÁO CUỐI BUỔI` với vệ sinh (`cleaning`): cần quy ước loại nào đọc dòng nào khi viết loại mới; ngoài phạm vi thiết kế này.
4. `data/` bị gitignore nên mẫu Excel không đi theo `git pull`: máy mới thiếu mẫu thì cặp tương ứng báo lỗi rõ ràng (đường dẫn mẫu), và `reports:list` cho thấy mẫu nào thiếu.
