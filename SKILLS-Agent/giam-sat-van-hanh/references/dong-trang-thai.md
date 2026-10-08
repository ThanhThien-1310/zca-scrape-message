# Ý nghĩa các dòng trạng thái

Nguồn sự thật là code: `src/watch/watchStatusReport.ts`, `src/runner/runnerStatusReport.ts`, `src/total/totalStatusReport.ts`, `src/cli/chat-status.ts`. Nếu câu chữ thật khác tệp này, tin lệnh, không tin tệp này.

## Mã thoát

| Lệnh | 0 | 2 | 1 |
|---|---|---|---|
| `watch:status` | luôn (kể cả bot đã dừng) | chỉ khi có `--buoi` hoặc `--day` và có gián đoạn chồng lên buổi | sai tham số |
| `runner:status` | bot sống và bộ báo cáo không lỗi | bot đã dừng, chết, `LỖI`, chưa từng chạy, hoặc có `[bộ báo cáo] LỖI` | |
| `total:status` | như runner | như runner | |
| `chat:status` | bot sống | bot không sống (kể cả chưa từng chạy) | |
| `config:show`, `reports:list` | luôn | | |

Hệ quả: `watch:status` không có `--buoi` KHÔNG cho biết bot sống hay chết qua mã thoát; đọc dòng đầu.

## Các trạng thái của một bot

- `ĐANG CHẠY`: có nhịp tim trong ngưỡng. Ngưỡng chết là `watch.deadAfterSeconds` (xem `npm run config:show`, mục 4).
- `ĐÃ DỪNG lúc HH:MM`: bot tự tắt có chủ ý (đóng cửa sổ, Ctrl+C).
- `CÓ VẺ ĐÃ CHẾT`: quá ngưỡng không có nhịp tim mà bot chưa ghi "đã dừng" (máy ngủ, tắt đột ngột, lỗi).
- `ĐANG CHẠY NHƯNG MÙ` (chỉ bot:watch): còn nhịp tim nhưng kết nối WebSocket của Zalo hỏng, nên tin mới không vào hàng chờ.
- `LỖI` (chỉ bot:runner): quá `runner.maxConsecutiveFailures` vòng lỗi liên tiếp, runner ngừng tự thử.
- `chưa từng chạy`: không có file trạng thái trong `data/`.

`trạng thái:` dưới `ĐANG CHẠY` của runner: `idle` (rảnh), `waiting` (chờ hàng chờ yên lặng), `running` (đang cào hoặc dựng).

## Lý do gián đoạn (trong ngoặc ở dòng `khoảng gián đoạn`)

`chết đột ngột`; `dừng có chủ ý`; `mất nguồn phát hiện WebSocket`; `dừng vì lỗi nghiêm trọng`; `chưa có dữ liệu nhịp tim`. Có dòng gián đoạn mà giờ sau nhỏ hơn giờ trước (đã thấy trên máy này): trích nguyên văn, không tự suy diễn.

## Hàng chờ và buổi

- Hàng chờ do bot:watch ghi, runner cào sau khi yên lặng `runner.quietSeconds` (tối đa `runner.maxWaitSeconds` kể từ nhóm đầu tiên). "Hàng chờ kẹt" không phải câu lệnh in ra: tự kết luận khi runner `ĐANG CHẠY` mà nhóm đầu tiên đã chờ quá `runner.maxWaitSeconds`. Giờ hiện tại: chạy `date +%H:%M` (chỉ đọc; xem mục Chưa xác nhận).
- Buổi (của `watch:status`, `recover:missing`): `sang`, `chieu`, `toi`. Giai đoạn (của runner, dùng trong `buổi chưa dựng xong`): `morningstart`, `morningend`, `afternoonstart`, `afternoonend`. Hai hệ chưa thống nhất; không đổi qua lại.
- `buổi chưa dựng xong`: có báo cáo trên đĩa chưa vào Excel (runner tự thử lại sau `runner.dirtyRetrySeconds`).

## Bộ báo cáo

`[bộ báo cáo] LỖI (<id>)` nghĩa là bộ `<id>` trong `config.reportSets` bị tắt vì cấu hình sai (các bộ khác vẫn chạy). `reports:list` hiện mã hợp lệ; dòng có `THIẾU` là mẫu Excel chưa có trên máy.

## Chưa xác nhận

- CHƯA XÁC NHẬN: nguồn `connecting` có kéo dài bao lâu thì bot:watch tự chuyển sang `MÙ` (đọc `src/watch/realtimeListener.ts` nếu cần).
- CHƯA XÁC NHẬN: múi giờ của đồng hồ máy có là giờ Việt Nam không (các lệnh trạng thái cộng cố định +7 giờ nên luôn in giờ Việt Nam); nếu `date` lệch, hỏi người dùng giờ hiện tại.
