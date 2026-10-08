---
name: giam-sat-van-hanh
description: Giám sát hệ thống Zalo đang chạy bằng các lệnh trạng thái chỉ-đọc rồi báo cáo gọn cho người dùng. Dùng khi người dùng nói "kiểm tra hệ thống", "bot còn chạy không", "giám sát", "báo cáo tình trạng bot", "có bị gián đoạn không", hoặc khi đến lượt kiểm tra định kỳ sau mỗi buổi. KHÔNG dùng khi người dùng yêu cầu khởi động, dừng hay sửa bot, hoặc dựng lại báo cáo (đó là việc ghi, phải hỏi riêng).
---

# Giám sát vận hành

Thuật ngữ: bot = một trong `bot:watch` (nghe tin, đưa nhóm có tin mới vào hàng chờ), `bot:runner` (cào hàng chờ, đồng bộ DB, dựng Excel), `bot:chat` (trả lời tự động), `bot:total` (báo cáo tổng lúc 9:00 và 15:00); hàng chờ = các nhóm đang chờ cào; gián đoạn = khoảng bot:watch không nghe được tin; việc ghi = bất kỳ lệnh nào đổi file, khởi động hay dừng bot.

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| Buổi cần kiểm (chỉ khi người dùng hỏi về gián đoạn của một buổi) | "Bạn muốn kiểm buổi nào (sang, chieu hay toi) và ngày nào?" |
| Bot nào cố ý không chạy hôm nay | "Có bot nào hôm nay cố ý không chạy (ví dụ bot:chat) để tôi không báo là sự cố?" |

Hỏi bằng câu thứ hai khi có bot báo `ĐÃ DỪNG` hoặc `chưa từng chạy` và người dùng chưa nói trước. Không đủ thông tin thì vẫn chạy các lệnh chỉ-đọc và báo kết quả.

## Các bước

1. Chạy `npm run watch:status`. → Mong đợi: dòng đầu bắt đầu bằng `[watch]`. Ghi lại dòng đầu và các dòng `khoảng gián đoạn`. Mã thoát của lệnh này là 0 dù bot đã dừng, nên PHẢI đọc dòng đầu.
2. Nếu có buổi cần kiểm, chạy `npm run watch:status -- --buoi <sang|chieu|toi> --day <YYYY-MM-DD>`. → Mong đợi: dòng cuối `[watch] buổi ...`. Mã 2 nghĩa là có gián đoạn chồng lên buổi.
3. Chạy `npm run runner:status`. → Mong đợi: dòng đầu bắt đầu bằng `[runner]`. Ghi lại dòng đầu, `hàng chờ`, `vòng gần nhất`, `lỗi`, `lỗi dựng`, `cảnh báo`, mọi dòng `[bộ báo cáo]`, `buổi chưa dựng xong`.
4. Chạy `npm run total:status`. → Mong đợi: dòng đầu bắt đầu bằng `[total]`, sau đó hai dòng đợt `sáng` và `chiều`.
5. Chạy `npm run chat:status`. → Mong đợi: dòng đầu bắt đầu bằng `[chat]`.
6. Với mỗi dòng bất thường, tra `references/bang-quyet-dinh.md` để biết việc tự làm (chỉ đọc) và việc phải hỏi.
7. Chỉ khi bước 3 có `lỗi` hoặc `lỗi dựng`: đọc 20 dòng cuối `output/runner-log.jsonl` để nêu nguyên nhân. Không sửa file.
8. Điền khung ở mục Đầu ra và gửi người dùng.

Mã thoát: 0 = ổn; 2 = cần người xem (`runner:status`, `total:status`, `chat:status`: bot không sống hoặc bộ báo cáo có lỗi); 1 = lệnh tự hỏng (sai tham số). Chi tiết từng dòng đầu ra ở `references/dong-trang-thai.md`.

Bước nào không khớp "Mong đợi" (không có dòng `[watch]`, `[runner]`, `[total]`, `[chat]`, hoặc lệnh báo lỗi thay vì trạng thái): DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## Quy tắc cứng

- CHỈ chạy: `watch:status`, `runner:status`, `total:status`, `chat:status`, `config:show`, `reports:list`, `date +%H:%M`; đọc file.
- KHÔNG tự khởi động lại, dừng hay bật bot, kể cả khi bot đã chết hay người dùng nói "restart bot cho tôi": phải hỏi trước (câu mẫu ở Khi không chắc).
- KHÔNG tự chạy `recover:missing` (kể cả `--dry-run`, vì lệnh ghi `output/recovery.json`), `runner:once`, `total:once`, `bot:scrape`, `scrape:add`, `today`, `mark:messages`, `sync:db`.
- KHÔNG sửa `config.ts`, `chat-rules.json`, `data/`, `output/`. KHÔNG tạo hay xoá `data/.chat-off`.
- KHÔNG nói "đã in" khi `total:status` chỉ có "đã gửi lệnh in" (giấy ra hay chưa phải xem ở máy in).
- Luôn nêu giờ theo dòng lệnh in ra (giờ Việt Nam, dạng HH:MM), không tự đổi múi giờ.

## Đầu ra

```
Tình trạng hệ thống lúc <HH:MM>:
- bot:watch: <ĐANG CHẠY|ĐÃ DỪNG|CÓ VẺ ĐÃ CHẾT|ĐANG CHẠY NHƯNG MÙ|chưa từng chạy>; phát hiện gần nhất <HH:MM|chưa có>
- bot:runner: <ĐANG CHẠY|ĐÃ DỪNG|CÓ VẺ ĐÃ CHẾT|LỖI|chưa từng chạy>; hàng chờ <N nhóm|rỗng>; vòng gần nhất <HH:MM OK|LỖI>
- bot:chat: <ĐANG CHẠY (gửi thật|DRY-RUN)|ĐÃ DỪNG|CÓ VẺ ĐÃ CHẾT|chưa từng chạy>; tin chờ <N>
- bot:total: <ĐANG CHẠY|ĐÃ DỪNG|CÓ VẺ ĐÃ CHẾT|chưa từng chạy>; đợt sáng <trạng thái>; đợt chiều <trạng thái>
Việc bất thường: <mỗi việc một dòng, trích đúng câu của lệnh|không có>
Tôi đã tự làm: chỉ chạy lệnh đọc trạng thái.
Đề nghị bạn làm (tôi chưa làm gì): <mỗi việc một dòng: lệnh cụ thể và lý do|không có>
```

## Khi không chắc

Dừng và hỏi: "Tôi thấy <dòng cụ thể>. Bạn có muốn tôi <việc ghi cụ thể> không?" Không đoán, không tự làm.

## Ví dụ

Đúng: runner báo `ĐÃ DỪNG lúc 10:50`, hàng chờ rỗng → ghi vào "Đề nghị bạn làm": "Khởi động lại `npm run bot:runner` nếu bạn muốn runner chạy tiếp"; không chạy lệnh nào thêm.
Sai: tự chạy `npm run bot:runner` — vì khởi động bot là việc ghi, phải hỏi trước.

## Tham chiếu (chỉ đọc khi cần)

- `references/bang-quyet-dinh.md`: đọc ở bước 6, bảng "thấy gì → làm gì".
- `references/dong-trang-thai.md`: đọc khi một dòng trạng thái không rõ nghĩa hoặc cần biết ngưỡng.
