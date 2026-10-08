# Chi tiết kiểm báo cáo đầu ra

Nguồn sự thật là code. Mọi luật dưới đây có file code đi kèm; khi lệch, tin code.

## 1. Cách chọn file và tin của mỗi kỳ

- Giai đoạn: file nằm ở `<statusExportDir>/<yyMM>/<yyMMdd>/<id>/<tiêu đề>_<yyMMdd>_T<thứ>_<HHmm>.xlsx`. Tên KHÔNG chứa giai đoạn, nên giai đoạn nào ứng với file nào chỉ biết qua `data/.status-report-files.json` (khoá `<id>|<ngày>|<giaiDoan>|<tiêu đề>`). `HHmm` là giờ của báo cáo MUỘN NHẤT trong giai đoạn (`latestReportHhmm`, `src/lesson/statusFill.ts`). Nếu giai đoạn khác cùng ngày đã dùng giờ đó thì cộng thêm phút (`freeHhmm`).
- Đợt: file có thêm `-auto` trước `.xlsx`, khoá ở `data/.total-report-files.json` dạng `<id>|<ngày>|total-<morning|afternoon>|<tiêu đề>`. Tin lấy từ 6:30 đến trước giờ đợt (`config.total`, `slotsOfDay` trong `src/total/slots.ts`).
- Tiêu đề file theo mã: NETSUPPORT = `netsupport`, ÂM THANH = `loa`, INTERNET = `internet`, MÁY TÍNH = `mayTinh` (`src/reportSets/registry.ts`).

## 2. Script `doc-nguon.mjs` dùng đúng code của bot

| Kỳ | Tin được chọn | Mỗi phòng giữ |
|---|---|---|
| Giai đoạn | `extractAll` (`src/lesson/extract.ts`) cùng `overrides.json` của bộ | tin mới nhất (`latestPerRoom`, `src/lesson/statusRows.ts`) |
| Đợt | `reportsInWindow` (`src/total/windowReports.ts`) | tin mới nhất CÓ xếp loại (`latestGradedPerRoom`) |

Dòng mong đợi do `buildNetSupportRows`, `buildLoaRows`, `buildInternetRows`, `buildMayTinhRows` (`statusRows.ts`) sinh ra. Script không tra DB, nên không in `phong_khong_tim_thay` (xem mục 4).
Chỉ tin `msgType` là `desktop.text` được xét (tin ảnh bị bỏ).

## 3. Xếp loại hợp lệ

- NETSUPPORT, INTERNET, ÂM THANH: cột F là `T`, `B` hoặc `K` (`isValidFacilityGrade`, `src/lesson/parseReport.ts`). Giá trị khác trong tin vẫn được ghi nguyên văn vào file, nên script báo `XẾP LOẠI NGOÀI TẬP HỢP LỆ`.
- MÁY TÍNH: cột J là `A`..`E` tính từ SM THIẾU (`mayTinhGrade`, `statusRows.ts`), để trống khi tin không ghi số máy thiếu. Xếp loại trong `output.json` (`computerGrade`) là luật KHÁC, không dùng để so với cột J.
- Cùng trường nằm liền nhau; chỉ dòng đầu cụm hiện tên trường (`groupBySchool`). Lệnh đọc ở bước 4 tự điền tên trường xuống các dòng sau.

## 4. Ý nghĩa `lyDo` trong `review.json` (kiểu `LyDo`, `src/types/report.ts`)

| `lyDo` | Nghĩa | Ảnh hưởng đến Excel |
|---|---|---|
| `gan_giong_tieu_de` | tin nhắc báo cáo đầu/cuối buổi nhưng tiêu đề sai chuẩn | tin KHÔNG vào file (hay gây "thiếu phòng") |
| `khong_nhan_ra_nhan` | có dòng nhãn lạ | xem `truongCanXem` |
| `thieu_dong` | thiếu dòng bắt buộc (ví dụ internet) | mục thiếu để trống |
| `so_khong_hop_le` | số máy thiếu/lỗi không đọc được | ô số để trống |
| `truong_khong_nhan_ra` | không đọc được trường hoặc khu vực từ tên nhóm | tên trường hoặc khu vực trống |
| `phong_khong_tim_thay` | phòng không có trong DB (chỉ khi có tra DB) | dòng VẪN có trong file (đã thấy ở bộ Như 2026-10-06) |

## 5. Xem nguyên văn tin

1. Tìm file nhóm: `grep -l '"groupName": "<tên nhóm>"' data/g*.json` → Mong đợi: một file `data/g<số>.json`.
2. In tin chứa phòng (thay `<groupId>` và `<PM>`): `node -e "require('./data/<groupId>.json').filter(x=>x.msgType==='desktop.text'&&/<PM>/i.test(x.content)).forEach(x=>console.log(new Date(x.ts+252e5).toISOString().slice(0,16),x.msgId,x.content.replace(/\n/g,' / ').slice(0,300)))"` → Mong đợi: mỗi tin một dòng, giờ Việt Nam ở đầu dòng.

## 6. Lưu ý khi đọc kết quả

- Thấy `THIẾU TRONG FILE` mà tin mới đến SAU lúc dựng file: báo "có thể file cũ hơn tin", đề nghị dựng lại, không kết luận lỗi.
- Tên file mang giờ báo cáo muộn nhất của giai đoạn: nếu giờ này nhỏ hơn giờ tin mới nhất trong kết quả `TIN`, file có thể cũ (tín hiệu, không chắc).
- Nhóm thử (`groupAliases` trong `config.ts`, ví dụ `bot test`) vẫn ra dòng trong file thật; không báo là "thừa" nếu có tin nguồn.
- `overrides.json` của bộ đã được script áp; một dòng khác tin gốc có thể do override (đọc `output/<id>/overrides.json`).

## 7. CHƯA XÁC NHẬN

- CHƯA XÁC NHẬN: cách đối chiếu ĐIỆN (tin "LỖI ĐIỆN" cả ngày, `data/.electric-report.json`), VỆ SINH, NỘI QUY. Chưa viết lệnh cho ba file này.
- CHƯA XÁC NHẬN: file của các ngày trước 2026-10-06 (không có thư mục `<id>` và khoá không có `<id>|`); lệnh bước 2 có thể không tìm thấy.
- CHƯA XÁC NHẬN: lệnh đọc xlsx đã thử trên file MÁY TÍNH, NETSUPPORT, ĐIỆN; chưa thử lệnh bước 4 trên file ÂM THANH, INTERNET (script `doc-nguon.mjs` đã đọc được cả hai).
- Dòng không có tên trường (`truong_khong_nhan_ra`) có thể bị gán nhầm tên trường của dòng trên khi điền xuống: ghi "không chắc".
