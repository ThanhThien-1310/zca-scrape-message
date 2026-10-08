# Chuẩn viết skill (SKILLS-Agent)

Mục tiêu: một model nhỏ làm theo được từng bước mà không phải tự suy luận. Ngắn, rõ, kiểm tra được.
Giới hạn độ dài dưới đây đặt cho cỡ Haiku 4.5. Model nhỏ hơn thì cắt ngắn hơn nữa.

## Quy tắc chung

1. **Một skill làm đúng một việc**, có một điều kiện kích hoạt rõ ràng.
2. **Độ dài:** thân `SKILL.md` tối đa khoảng 100 dòng (khoảng 800 từ). Kiến thức dài chuyển sang `references/<tên>.md`, chỉ trỏ MỘT cấp (reference không trỏ sang reference khác).
3. **Chỉ viết mệnh lệnh ngắn.** Bỏ lịch sử, giải thích dài, "sai lầm đã gặp" dạng văn xuôi. Lý do quan trọng thì gói trong một vế câu.
4. **Không dùng từ mơ hồ** ("phù hợp", "nếu cần", "thường", "khoảng"). Điều kiện viết thành bảng: nếu X thì làm Y.
5. **Việc cố định giao cho lệnh hoặc script.** Skill nói "chạy lệnh này, đọc dòng này"; model không tự tính, không tự nhớ luật.
6. **Không chép lại luật đã có trong code.** Trỏ tới nguồn (`npm run reports:list`, file test) kèm đúng một ví dụ. Nếu không, skill sẽ lệch khỏi code theo thời gian.
7. **Một bộ thuật ngữ cố định**, khai báo một lần ở đầu skill, không đổi từ giữa chừng.
8. **Mỗi bước một hành động**, kèm lệnh cụ thể và kết quả mong đợi. Bước nào không khớp kết quả mong đợi thì DỪNG và báo, không làm tiếp.
9. **Thiếu thông tin thì hỏi bằng câu viết sẵn**, không đoán, không tự quyết.

## Mẫu `SKILL.md`

Sao chép khung này, điền vào chỗ `<...>`, xoá mục không dùng đến (nhưng giữ "Khi không chắc").

````markdown
---
name: ten-skill-ngan
description: <1 câu: làm gì.> Dùng khi <điều kiện kích hoạt cụ thể>. KHÔNG dùng khi <1 điều kiện loại trừ>.
---

# <Tên skill>

Thuật ngữ: <từ> = <nghĩa>; <từ> = <nghĩa>.   (chỉ các từ skill này dùng)

## Cần có trước khi làm

| Thông tin | Nếu thiếu, hỏi đúng câu này |
|---|---|
| <thông tin> | "<câu hỏi viết sẵn>" |

## Các bước

1. <Một hành động.> Lệnh: `<lệnh>` → Mong đợi: <dòng hoặc kết quả cụ thể>.
2. <Một hành động.> → Mong đợi: <...>.
3. ...

Bước nào không khớp "Mong đợi": DỪNG và báo (nêu bước, lệnh, kết quả thực tế).

## Quy tắc cứng

(Tối đa 7 dòng.)
- KHÔNG <điều cấm>.
- Luôn <điều bắt buộc>.

## Đầu ra

<Định dạng chính xác: mẫu JSON, bảng hoặc câu báo cáo, với chỗ trống để điền.>

## Khi không chắc

Dừng và hỏi: "<câu hỏi mẫu>". Không đoán.

## Ví dụ

Đúng: <1 ví dụ ngắn>
Sai: <1 ví dụ ngắn> — vì <lý do một vế>.

## Tham chiếu (chỉ đọc khi cần)

- `references/<x>.md`: đọc khi <điều kiện>.
````

## `description` (frontmatter)

- Câu đầu nói skill làm gì. Câu thứ hai bắt đầu bằng "Dùng khi", nêu điều kiện cụ thể (từ khoá người dùng hay nói, hoặc tình huống). Câu thứ ba bắt đầu bằng "KHÔNG dùng khi" để model không gọi nhầm skill.
- Tên skill: chữ thường, không dấu, nối bằng gạch ngang, trùng tên thư mục.

## Kèm theo mỗi skill: `evals.md`

Ba tình huống để thử với model nhỏ. Mỗi tình huống có: lời người dùng, việc kỳ vọng model làm, và điều model KHÔNG được làm.

| Tình huống | Kỳ vọng |
|---|---|
| Bình thường | Làm xong đúng, đúng định dạng đầu ra |
| Thiếu thông tin | Hỏi đúng câu viết sẵn, không đoán, không chạy lệnh ghi |
| Bẫy | Dừng hoặc từ chối đúng chỗ (ví dụ yêu cầu làm điều "KHÔNG" trong quy tắc cứng) |

Skill chỉ "đạt chuẩn" khi model nhỏ chạy qua cả ba tình huống đúng. Không đạt thì sửa skill (ngắn hơn, rõ hơn), không sửa tình huống.

## Cấu trúc thư mục

```
SKILLS-Agent/
  FORMAT.md                     (file này)
  <ten-skill>/
    SKILL.md                    (≤ ~100 dòng, theo mẫu trên)
    evals.md                    (3 tình huống)
    references/                 (tuỳ chọn; kiến thức dài, ví dụ thật đã ẩn danh)
      <x>.md
      <x>.mjs                   (tuỳ chọn; script CHỈ ĐỌC cho việc cố định, chạy từ thư mục gốc dự án)
```

## Danh sách kiểm trước khi coi là xong

- [ ] Có đủ: frontmatter, thuật ngữ, cần có trước khi làm, các bước, quy tắc cứng, đầu ra, khi không chắc.
- [ ] Thân ≤ ~100 dòng; mỗi bước một hành động có "Mong đợi".
- [ ] Không có từ mơ hồ trong danh sách ở quy tắc 4; không chép luật có trong code.
- [ ] Mọi lệnh `npm run ...` và đường dẫn file nhắc tới đều tồn tại (chạy thử hoặc `grep`).
- [ ] Có `evals.md` với 3 tình huống và đã thử với model nhỏ.
