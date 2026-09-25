# Thiết kế `bot:runner`: tự động cào, trích xuất và điền Excel khi hàng chờ có nhóm

Ngày: 2026-09-25. Trạng thái: chờ duyệt.

## 1. Mục tiêu

`bot:watch` chạy 24/24. Khi có tin mới, hệ thống tự chạy toàn bộ quy trình (cào, đồng bộ DB, trích xuất, điền Excel) mà không cần ai bấm lệnh. Agent chỉ giám sát: kiểm tra dữ liệu trích xuất có đúng không (`review.json`) và kết quả điền Excel.

Tiêu chí thành công (theo lời người dùng: ưu tiên **ổn định và lấy đủ dữ liệu**):

- Báo cáo đến lúc nào cũng được cào trong vài phút mà không cần thao tác tay.
- Excel của buổi luôn phản ánh dữ liệu mới nhất; chạy lặp lại cho cùng kết quả.
- Một lần lỗi không làm mất tin và không làm chết phần phát hiện tin.
- Agent (và người) biết ngay runner còn sống không, lần chạy gần nhất ra sao.

## 2. Đã thống nhất

| Quyết định | Nội dung |
|---|---|
| Kích hoạt | Hàng chờ có nhóm thì kích hoạt; hàng chờ rỗng thì không làm gì |
| Debounce | Đợi hàng chờ yên lặng 2 phút; trần 10 phút tính từ nhóm vào hàng chờ sớm nhất chưa xử lý |
| Excel | Mỗi vòng cào xong thì trích xuất và ghi đè Excel của buổi bị ảnh hưởng (phương án C) |
| Nơi chạy | Tiến trình riêng `bot:runner`; `bot:watch` giữ nguyên là bộ phát hiện |

Cờ "có việc" không lưu riêng: `pending = queue.length > 0`, tính ra mỗi lần kiểm tra.

## 3. Ngoài phạm vi

- Sửa các phát hiện trong `REVIEW-QUY-TRINH-TAM.md` (F2 nhóm không tìm thấy vẫn bị bỏ khỏi hàng chờ, F3 tin bị sửa hoặc thu hồi, F4, F5). Chúng ảnh hưởng độ tin cậy nhưng là việc riêng.
- Ảnh trong báo cáo (vẫn bỏ qua).
- Tự khởi động lại Zalo Desktop; `bot:runner` không bao giờ khởi động lại Zalo.
- Dựng dịch vụ Windows (PM2/Task Scheduler): chỉ hướng dẫn trong `docs/GUIDE.md`, không nằm trong mã.

## 4. Kiến trúc

```
bot:watch (giữ nguyên)            bot:runner (mới)
  WS + thông báo → ghi hàng chờ ─►  đọc data/.scrape-queue.json
  nhịp tim data/.watch-state.json    debounce → chạy một vòng
                                     nhịp tim data/.runner-state.json
                                     nhật ký  output/runner-log.jsonl
```

`bot:runner` chỉ là bộ điều phối: không có logic trích xuất hay cào mới. Nó gọi lại các đơn vị đã có (`runQueuedScrape`, `runRecovery`, `extractAll`, `syncDb`, `fill-template`, `markMessages`) qua các hàm, không qua `npm run` con.

Đơn vị mới (mỗi đơn vị có một trách nhiệm, kiểm thử độc lập):

| Tệp | Trách nhiệm |
|---|---|
| `runner/schedule.ts` | Hàm thuần `decide(queueState, now, config)` → `wait` / `run` / `idle`; xử lý debounce và trần |
| `runner/cycle.ts` | Một vòng chạy với các phụ thuộc được tiêm (`deps`), theo kiểu `queueRun.ts` |
| `runner/affectedSessions.ts` | Từ các tin vừa cào (so `msgId` trước và sau) suy ra tập `(ngày, buổi)` cần dựng lại |
| `runner/safeReplace.ts` | Ghi Excel ra tệp tạm rồi đổi tên; nếu đích bị khóa thì ghi `<tên>_moi.xlsm` |
| `runner/runnerState.ts` | Nhịp tim, khóa tiến trình, bộ đếm lỗi, nhật ký (tương tự `watchState.ts`) |
| `bot-runner.ts` | Vòng lặp: đọc hàng chờ, `decide`, chạy `cycle`, ngủ |

## 5. Một vòng chạy

Thứ tự cố định; lỗi ở bước 2 hoặc 3 dừng vòng (không xóa hàng chờ).

1. **Khôi phục.** Nếu `effectiveGaps` chồng lên buổi hiện tại thì chạy `runRecovery` trước (việc trước đây agent làm ở bước 0 và 1b). Nhóm không cào được chỉ ghi vào nhật ký, không dừng vòng.
2. **Cào.** `runQueuedScrape` với snapshot hàng chờ. Nhóm lỗi vẫn bị bỏ khỏi hàng chờ (hành vi hiện có).
3. **Đồng bộ DB.** Tin mới vào `Zalo_CrawlMessage`.
4. **Xác định buổi bị ảnh hưởng** bằng `affectedSessions` (thường một buổi). Không có tin mới thì bỏ qua bước 5.
5. **Với mỗi `(ngày, buổi)`**: `extractAll` (ghi `output/…`), điền Excel qua `safeReplace`, rồi `markMessages`. Tin `review` không chặn vòng; nó nằm trong `review.json` cho agent.
6. **Ghi nhật ký** một dòng JSON: thời điểm, nhóm đã cào, buổi đã dựng, số báo cáo, số dòng `review`, đường dẫn Excel, lỗi (nếu có).

Vì `extractAll` đọc từ JSON theo ngày và buổi (không phụ thuộc `StatusId`), chạy lại cùng dữ liệu cho cùng kết quả.

## 6. Debounce

`decide` nhận: hàng chờ hiện tại, thời điểm nhóm được thêm sớm nhất chưa xử lý (`firstQueuedAt`), thời điểm thêm gần nhất (`lastQueuedAt`), `now`.

- Hàng chờ rỗng: `idle`.
- `now − lastQueuedAt ≥ 2 phút` **hoặc** `now − firstQueuedAt ≥ 10 phút`: `run`.
- Còn lại: `wait`.

Hàng chờ chưa lưu thời điểm thêm, nên `scrapeQueue.ts` cần ghi thêm `firstQueuedAt`/`lastQueuedAt` (tệp riêng `data/.scrape-queue-meta.json`, hoặc mở rộng định dạng nhưng vẫn đọc được định dạng cũ). Runner khởi động lại phải đếm đúng, nên các mốc này nằm trên đĩa. Hàng chờ có nhóm mà không có mốc (ví dụ do bản cũ ghi) được coi là vừa thêm lúc runner khởi động.

## 7. Trạng thái, nhịp tim và khóa

`data/.runner-state.json`: `pid`, `startedAt`, `lastBeat` (mỗi 30 giây), `state` (`idle` / `waiting` / `running` / `error` / `stopped`), `lastCycle` (`at`, `ok`, `sessions`, `reviewCount`, `excel`), `consecutiveFailures`.

- Quá 90 giây không có nhịp tim thì coi là chết (cùng ngưỡng với watch).
- Khóa: nếu `pid` cũ còn sống và nhịp tim còn mới thì runner thứ hai từ chối chạy. Mọi thứ điều khiển giao diện Zalo dùng một khóa chung `data/.scrape.lock`: mỗi vòng của runner và mỗi lần `bot:scrape` chạy tay phải giữ khóa; ai đến sau thấy khóa còn hiệu lực thì từ chối và báo rõ.
- `consecutiveFailures` đạt 3 thì `state = error`, runner ngừng tự thử cho đến khi có lần thành công hoặc khởi động lại. Nhóm vẫn nằm trong hàng chờ.

## 8. Ghi đè Excel an toàn (`safeReplace`)

Kết quả cuối luôn là **một tệp** `<tên>.xlsm`. Tệp tạm chỉ tồn tại trong lúc điền (script luôn điền từ mẫu và chạy macro nên sinh ra tệp mới hoàn chỉnh, không sửa tại chỗ), xong là đổi tên đè lên tệp chính.

1. Điền vào `data/export/.<tên>.tmp.xlsm`.
2. Đổi tên đè lên `<tên>.xlsm`; tệp tạm biến mất. Nếu tồn tại `<tên>_moi.xlsm` từ vòng trước thì xóa nó.
3. Chỉ khi đổi tên lỗi vì tệp chính đang mở (`EBUSY`/`EPERM`): lưu thành `<tên>_moi.xlsm`, ghi cảnh báo vào nhật ký. Không xóa và không làm hỏng bản hiện có.
4. Nếu điền Excel lỗi (COM), bản cũ giữ nguyên; vòng ghi lỗi và tính vào `consecutiveFailures`.

## 9. Vai trò của agent (giám sát)

Agent không còn chạy cào, đồng bộ, khôi phục. Mỗi lần được gọi (cron hoặc yêu cầu tay), agent:

1. Đọc `npm run runner:status` (mới, chỉ đọc): runner còn sống không, vòng gần nhất, `consecutiveFailures`, hàng chờ.
2. Đọc `output/runner-log.jsonl` (các vòng trong buổi) và `output/review.json`.
3. Xử lý các dòng `review` như hiện nay (ghi `overrides.json`), rồi gọi `npm run runner:once -- --day --buoi --rebuild`: chạy lại bước 4–5 cho buổi đó **không cào**, để Excel và `marks` phản ánh sửa tay.
4. Kiểm tra Excel: đủ dòng, phòng không có trong DB bị loại đúng, không có `_moi.xlsm` tồn đọng.
5. Nếu runner chết hoặc `state = error`: báo cần khởi động lại `npm run bot:runner`; **không tự khởi động** (cùng quy tắc với `bot:watch`).

`SKILL.md` V2 sẽ được cập nhật sang chế độ giám sát này (giữ nguyên khối quy tắc trích xuất và mọi định nghĩa dữ liệu), kèm `runner:status` và `runner:once`.

## 10. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Zalo Desktop không kết nối được | Vòng lỗi, hàng chờ nguyên, thử lại vòng sau; 3 lần liên tiếp thì `error` |
| Một nhóm không cào được | Ghi nhật ký, vẫn dựng Excel từ phần đã có |
| SQL Server không kết nối được | Vòng lỗi ở bước 3 (tra phòng cũng cần DB, và `--no-db` không dùng cho chạy thật); hàng chờ nguyên, thử lại vòng sau |
| Runner chết giữa vòng | Hàng chờ chưa xóa nên vòng sau cào lại; dedupe theo `msgId`; Excel được dựng lại nên vẫn đúng |
| `bot:watch` chết | Bước 1 của vòng phát hiện qua `effectiveGaps` và khôi phục |

## 11. Kiểm thử

Chỉ hàm thuần và `deps` tiêm được; không chạy Zalo hay Excel trong test.

- `schedule.decide`: rỗng; vừa thêm thì chờ; yên lặng đủ 2 phút; đạt trần 10 phút dù tin liên tục; thiếu mốc thời gian.
- `cycle`: đúng thứ tự bước; lỗi cào thì không xóa hàng chờ và không dựng Excel; nhóm lỗi vẫn dựng; không tin mới thì bỏ qua bước 5; nhiều buổi bị ảnh hưởng thì dựng từng buổi.
- `affectedSessions`: tin sáng và tin chiều trong một lần cào; tin trùng `msgId` không tính; ranh giới 12:00.
- `safeReplace`: đổi tên thành công; đích bị khóa thì ra `_moi`; lỗi điền giữ nguyên bản cũ (fs giả).
- `runnerState`: nhịp tim, quá hạn là chết, khóa hai runner, đếm lỗi liên tiếp và về 0 khi thành công.
- Hàng chờ có mốc thời gian: đọc được định dạng cũ, ghi nguyên tử.

## 12. Giả định và điểm cần lưu ý

- Buổi bị ảnh hưởng suy ra từ thời điểm gửi của tin vừa cào, không phải từ giờ hiện tại, nên tin của buổi sáng cào muộn vẫn dựng đúng file buổi sáng.
- Trong lúc một vòng chạy, Zalo Desktop bị điều khiển (nhấp, cuộn). Debounce 2 phút giảm tần suất nhưng không loại bỏ; người dùng đang gõ trong Zalo có thể bị gián đoạn. Đây là giới hạn đã biết của cách cào bằng giao diện.
- Ranh giới buổi chiều 12:00–18:00 (quyết định còn treo từ trước) không ảnh hưởng thiết kế này: runner không dùng giờ cron.
- `safeReplace` không xử lý trường hợp người dùng vừa mở `_moi.xlsm` rồi lại mở tệp gốc; không cần thiết cho phiên bản đầu.

## 13. Điều chỉnh khi lập kế hoạch

1. Các bước `syncDb`, trích xuất, điền Excel, `markMessages` được gọi như **tiến trình con** (`node --import tsx <script>`), không refactor thành hàm: `syncDb.ts` và `markMessages.ts` là tệp của người dùng và chạy `main()` ngay khi nạp. `runScrape`, `runQueuedScrape`, `runRecovery` vẫn gọi trực tiếp.
2. **Danh sách buổi chờ dựng** `data/.runner-pending.json`: lưu trước khi đồng bộ DB, chỉ xóa sau khi dựng thành công, để runner chết giữa vòng không làm mất buổi cần dựng. Đồng bộ DB chạy mỗi vòng vì idempotent.
3. Khi `bot:watch` chết và hàng chờ rỗng, runner **tự kích hoạt một vòng** khi có gián đoạn mới chồng lên buổi hiện tại (khóa `from|to` của gián đoạn), vì nếu không sẽ không ai kích hoạt khôi phục.
4. `runner:once` chỉ dựng lại một buổi và không cào (không cần cờ `--rebuild`); `runner:status` thoát mã 2 khi runner không sống.
5. Trạng thái `error` giữ đến khi khởi động lại (không có vòng thử lại để tự thoát).
6. Khôi phục trong vòng chỉ xét buổi hiện tại; gián đoạn của buổi trước đó xử lý bằng `recover:missing` tay.
7. Mốc thời điểm của hàng chờ nằm ở tệp phụ `data/.scrape-queue-meta.json`, nên `data/.scrape-queue.json` giữ nguyên định dạng (`bot:watch` và tệp test cũ không đổi).
