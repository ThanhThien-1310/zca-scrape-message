---
name: kiem-tra-bao-cao-dau-ra
description: Kiểm tra (chỉ đọc) file Excel báo cáo đã xuất có khớp tin Zalo gốc không, và báo bất thường (phòng thiếu, trùng, dòng lạ, sai xếp loại). Dùng khi người dùng nói "kiểm tra báo cáo", "file Excel có đúng không", "sao thiếu phòng", "đối chiếu báo cáo với tin nhắn". KHÔNG dùng khi người dùng muốn dựng lại hoặc sửa file (đó là việc của `runner:once` / `total:once`, phải hỏi trước).
---

# Kiểm tra báo cáo đầu ra

Thuật ngữ: bộ = một người phụ trách (`id` trong `reportSets`); giai đoạn = `morningstart|morningend|afternoonstart|afternoonend`; đợt = `morning|afternoon` (file `-auto` của `bot:total`); file kiểm = một file Excel; mã = `netsupport` (NETSUPPORT), `loa` (ÂM THANH), `internet` (INTERNET), `mayTinh` (MÁY TÍNH).
Phạm vi: 4 mã trên. Các file ĐIỆN, VỆ SINH, NỘI QUY: chưa kiểm được (xem Khi không chắc).

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| id bộ | "Kiểm báo cáo của bộ nào? (id, ví dụ Như)" |
| Ngày | "Kiểm báo cáo của ngày nào? (dạng YYYY-MM-DD)" |
| Giai đoạn hoặc đợt | "Kiểm giai đoạn nào (morningstart, morningend, afternoonstart, afternoonend) hay đợt nào (morning, afternoon)?" |

## Các bước

1. Xác nhận bộ. Lệnh: `grep -n "{ id:" config.ts` → Mong đợi: thấy dòng có `id: "<id>"`. Không thấy: DỪNG và hỏi lại id.
2. Tìm tên file. Giai đoạn: `grep "<id>|<ngày>|<giaiDoan>|" data/.status-report-files.json`. Đợt: `grep "<id>|<ngày>|total-<đợt>|" data/.total-report-files.json` → Mong đợi: mỗi dòng dạng `"<khoá>": "<tên file>"`, tối đa 4 dòng trong phạm vi. Không có dòng nào: DỪNG, báo "chưa có file cho kỳ này" (KHÔNG dựng).
3. Xác nhận file có thật. Lệnh: `ls "data/export/trang-thai/<yyMM>/<yyMMdd>/<id>/<tên file>"` → Mong đợi: file hiện ra. (`<yyMM>/<yyMMdd>` lấy từ ngày, ví dụ 2026-10-06 → `2610/261006`.) Thư mục khác `data/export/trang-thai`: xem `statusExportDir` trong `config.ts`.
4. Đọc các dòng của file kiểm (thay đường dẫn cuối bằng file của bước 3):

```
node -e "const X=require('xlsx');const wb=X.readFile(process.argv[1]);const rs=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:'A',defval:'',raw:false});let on=0,s='';console.log('sheet:',wb.SheetNames.join('|'));for(const r of rs){if(r.A==='TỔNG')break;if(r.A==='STT'){on=1;continue}if(!on){if(String(r.A).startsWith('Nhân viên'))console.log(JSON.stringify(Object.values(r).filter(v=>String(v).trim())));continue}if(String(r.B).trim())s=r.B;else r.B=s;console.log(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k,v])=>String(v).trim()!==''))))}" "data/export/trang-thai/2610/261006/Như/TÌNH TRẠNG MÁY TÍNH_261006_T3_1316.xlsx"
```

   → Mong đợi: dòng `sheet:`, một dòng có `Ngày: dd/mm/yyyy` khớp ngày cần kiểm, rồi mỗi dòng dữ liệu một JSON (A=STT, B=trường, C=khu vực, D=PM, F/J=xếp loại). Ngày trong file khác ngày cần kiểm: ghi vào bất thường. Số dòng dữ liệu = N.
5. Đối chiếu với tin gốc (đọc `data/<groupId>.json`, tính bằng code của bot, không ghi gì). Lệnh: `npx tsx SKILLS-Agent/kiem-tra-bao-cao-dau-ra/references/doc-nguon.mjs <id> <ngày> <giaiDoan|đợt> <mã> "<đường dẫn file>"` → Mong đợi: các dòng `TIN` (mỗi tin báo cáo: giờ, nhóm, phòng, xếp loại, `giuLai`), các dòng `CẦN XEM`, `MONG ĐỢI (<mã>): n dòng`, `TRONG FILE: n dòng`, và dòng cuối `KHỚP` hoặc `CÓ k BẤT THƯỜNG`. Lặp bước 4 và 5 cho từng file (mã theo tiêu đề file).
6. Phân loại bất thường theo bảng:

| Dòng script in ra | Vấn đề báo |
|---|---|
| `THIẾU TRONG FILE` | phòng có tin, file không có dòng |
| `THỪA TRONG FILE` | dòng không có tin nguồn |
| `TRÙNG` | trùng phòng |
| `KHÁC GIÁ TRỊ` | sai xếp loại hoặc sai số máy |
| `TRONG FILE: 0 dòng` mà `MONG ĐỢI` > 0 | file rỗng dù có tin |
| `XẾP LOẠI NGOÀI TẬP HỢP LỆ` | xếp loại ngoài tập hợp (xem `references/chi-tiet.md` mục 3) |
| `giuLai` là `false` ở một dòng `TIN` | tin cũ của phòng, bị tin mới hơn thay: bình thường, KHÔNG báo |

7. Đọc mục cần xem. Các dòng `CẦN XEM` ở bước 5 là bản tính lại; thêm bản lúc dựng (có tra DB, giai đoạn mới có): `node -e "for(const v of require('./output/<id>/review_<ngày>_<giaiDoan>.json'))console.log(v.lyDo.join('+'),v.key.maNhom,v.key.maTinNhan,v.raw.split('\n')[0])"` → Mong đợi: mỗi mục một dòng, hoặc không in gì (0 mục). Ý nghĩa `lyDo`: `references/chi-tiet.md` mục 4.
8. Với mỗi bất thường cần xem nguyên văn tin: `references/chi-tiet.md` mục 5. Rồi báo theo mục Đầu ra.

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## Quy tắc cứng

- Chỉ ĐỌC. KHÔNG sửa file Excel, KHÔNG sửa gì dưới `data/`, KHÔNG sửa `output/`.
- KHÔNG chạy lệnh dựng lại hay ghi (`runner:once`, `total:once`, `fill:*`, `extract:reports`, `mark:messages`, `sync:db`) khi chưa hỏi và chưa được đồng ý.
- Người dùng bảo "sửa luôn file cho đúng": từ chối sửa, báo bất thường, đề nghị `runner:once` (giai đoạn) hoặc `total:once` (đợt) và chờ họ đồng ý.
- Chỗ không chắc: ghi "không chắc: <lý do>". KHÔNG đoán, KHÔNG kết luận "đúng" khi chưa có dòng `KHỚP`.
- Luật xếp loại tính theo CODE (script ở bước 5), KHÔNG tự tính bằng trí nhớ.
- Luôn nêu file nào đã kiểm và file nào chưa kiểm được.

## Đầu ra

```
Đã kiểm: bộ <id>, ngày <ngày>, <giai đoạn|đợt>.
File: <tên file> (<mã>): <N> dòng trong file / <n> dòng mong đợi / khớp <m> dòng.   (mỗi file một dòng)
Chưa kiểm được: <file hoặc "không có">.
Bất thường: <số lượng; "không có" nếu 0>
 - <phòng> | <nhóm> | <giờ tin> | <thiếu / thừa / trùng / sai xếp loại / file rỗng / mục cần xem>: <chi tiết>
Không chắc: <điều chưa rõ hoặc "không có">
Đề nghị: <việc người dùng nên làm, ví dụ "đồng ý để tôi chạy runner:once --day <ngày> --buoi <giaiDoan>" hoặc "không cần làm gì">
```

## Khi không chắc

Dừng và hỏi: "Tôi chưa chắc về <điểm cụ thể>. Bạn xác nhận giúp: <câu hỏi một ý>?" Không đoán.
Yêu cầu kiểm ĐIỆN, VỆ SINH, NỘI QUY: trả lời "skill này chưa kiểm ba file đó (cách đối chiếu chưa có)". Cột và xếp loại của 7 file: xem skill `du-lieu-dau-ra` nếu có; luôn lấy code làm gốc.

## Ví dụ

Đúng: "Phòng PM2 / LC_HoaSen1_TĐ / tin 09:15: có tin, file NETSUPPORT không có dòng (THIẾU TRONG FILE). Đề nghị bạn đồng ý để tôi dựng lại giai đoạn."
Sai: "Tôi đã thêm dòng PM2 vào file cho đúng." — vì skill này chỉ đọc, không sửa file.

## Tham chiếu (chỉ đọc khi cần)

- `references/chi-tiet.md`: đọc ở bước 6, 7, 8 (xếp loại hợp lệ, ý nghĩa `lyDo`, xem nguyên văn tin, lưu ý và điều chưa xác nhận).
- `references/doc-nguon.mjs`: script của bước 5 (chỉ đọc; chạy từ thư mục gốc dự án).
