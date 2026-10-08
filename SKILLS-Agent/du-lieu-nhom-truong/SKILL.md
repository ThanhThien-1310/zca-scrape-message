---
name: du-lieu-nhom-truong
description: Giải thích cấu trúc dữ liệu đầu vào của NHÓM TRƯỜNG (nhóm Zalo của một trường, tên dạng `LC_<tên trường>_<khu vực>`): các loại tin, tin nào bot đọc, tin nào nuôi báo cáo nào, tin ảnh. Dùng khi cần hiểu hay phân loại một tin trong nhóm trường, hoặc kiểm tra tin có đúng chỗ không. KHÔNG dùng khi tin đến từ nhóm kỹ thuật (IT) hoặc khi cần xem cấu trúc file Excel đầu ra.
---

# Dữ liệu nhóm trường

Thuật ngữ: nhóm trường = nhóm Zalo của một trường; tin chữ = `msgType` là `desktop.text`; tin ảnh = `msgType` là `chat.photo`; mã = mã báo cáo trong `npm run reports:list`.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| Nhóm hoặc tin cần giải thích | "Bạn cần hiểu tin nào? Gửi tên nhóm và nội dung (hoặc dòng đầu) của tin." |

## Các bước (tra cứu)

1. Xác định có đúng là nhóm trường. Lệnh: `npx tsx -e "import { parseGroupName } from './src/lesson/schoolArea.ts'; console.log(JSON.stringify(parseGroupName('<tên nhóm>')))"` → Mong đợi: `khuVuc` khác `null`. Ví dụ `LC_HoaSen1_TĐ` ra `capHoc: LC`, `tenRieng: HOA SEN 1`, `khuVuc: TĐ`. `khuVuc` là `null` (ví dụ `bot test`): không phải nhóm trường thật, báo người dùng.
2. Tin chữ: lấy dòng đầu và tra bảng Loại tin.
3. Tin ảnh: xem mục Tin ảnh.
4. Dòng đầu có tên người dính liền phía trước (ví dụ `Phương AnhBÁO CÁO ĐẦU BUỔI DẠY`): xem `references/mau-tin.md`, mục "Tên dính liền tiêu đề".
5. Dòng đầu không có trong bảng: báo "loại tin chưa biết" và dừng, không gán loại.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## Loại tin (tra theo dòng đầu)

| Dòng đầu | Người gửi | Bot đọc? | Nuôi mã |
|---|---|---|---|
| `BÁO CÁO ĐẦU BUỔI DẠY` | giáo viên, đầu buổi dạy | Có | `netsupport`, `loa`, `mayTinh`; `internet` nếu tin có dòng Internet |
| `BÁO CÁO CUỐI BUỔI DẠY` | giáo viên, cuối buổi dạy | Có | `netsupport`, `loa`, `internet`, `mayTinh` |
| `BÁO CÁO CHUYÊN MÔN` (có thể kèm ` 1`, ` 2`) | giáo viên, mỗi lớp một tin | Không (đánh dấu bỏ qua) | không có |
| `Báo cáo giáo viên nghỉ trưa tại/ở phòng máy` | giáo viên | Không | không có |
| `Đã bàn giao PM<n> cho bộ phận IT.` | giáo viên | Không | không có |
| `Báo cáo: <mô tả sự cố>` (câu tự do) | giáo viên | Không | không có |
| `LỖI ĐIỆN` | CHƯA XÁC NHẬN: ai gửi trong nhóm trường | Có | `dien` |

Hai tin đầu/cuối buổi dạy còn nhiều dòng bot không lấy (số lượng học sinh, vệ sinh, nội quy...). Dòng nào được lấy và cách lấy: đọc `src/lesson/parseReport.ts` (`LABELS`, `classifyTitle`), không chép lại ở đây.
Tin đầu buổi mẫu trong kho không có dòng Internet. CHƯA XÁC NHẬN: mọi tin đầu buổi có thiếu dòng này không.

## Tin ảnh

- Ảnh chiếm từ 24% đến 68% tin của mỗi nhóm trường trong kho hiện có (ví dụ 109 ảnh trên 192 tin ở `LC_HoaSen1_TĐ`). Bot lưu ảnh nhưng KHÔNG đọc chữ trong ảnh.
- `content` của tin ảnh rỗng. Khoảng 80% đến 90% tin ảnh có `url` dạng `images/<groupId>/<id>.jpg`, nằm dưới thư mục `data/`.
- Ảnh tập trung vào các giờ 7h, 11h đến 12h, 13h và 16h (gần đầu/cuối buổi). CHƯA XÁC NHẬN: ảnh chụp gì.
- Đọc chữ trong ảnh: dùng skill `doc-anh-bao-cao`.

## Quy tắc cứng

- Phân loại tin chỉ bằng dòng đầu. KHÔNG suy ra loại tin từ người gửi hay giờ gửi.
- KHÔNG gán loại cho tin không có trong bảng.
- KHÔNG nói nội dung ảnh khi chưa nhìn ảnh.
- Nguồn sự thật là code (`src/lesson/parseReport.ts`). Bảng trên chỉ để tra nhanh; lệch với code thì theo code và báo người dùng.
- KHÔNG đưa tên người thật vào báo cáo hay ví dụ.

## Đầu ra

```
Nhóm: <tên> (trường <tenRieng>, khu vực <khuVuc>).
Loại tin: <loại>. Bot đọc: <có|không>. Nuôi mã: <mã|không có>.
Lưu ý: <bất thường, hoặc "không">.
```

## Khi không chắc

Dừng và hỏi: "Tin này có dòng đầu '<dòng đầu>', không có trong bảng loại tin. Đây là loại tin gì và ai thường gửi?" Không đoán.

## Ví dụ

Đúng: tin `BÁO CÁO CHUYÊN MÔN` → bot không đọc, không nuôi mã nào; đó là bình thường, không phải lỗi.
Sai: thấy `BÁO CÁO CHUYÊN MÔN` rồi báo "thiếu báo cáo đầu buổi" — vì đó là loại tin khác.

## Tham chiếu (chỉ đọc khi cần)

- `references/mau-tin.md`: tin mẫu thật đã ẩn danh của từng loại, tin có tên dính liền, số liệu ảnh.
