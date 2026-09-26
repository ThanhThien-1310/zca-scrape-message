# Thiết kế: gom toàn bộ thông số chỉnh được vào `config.ts`

Ngày: 2026-09-26. Trạng thái: chờ duyệt.

## 1. Mục tiêu

Người dùng muốn xem và chỉnh **mọi thông số vận hành ở một file**, chia mục, mỗi thông số có ghi chú ý nghĩa và ví dụ cách đặt, thay vì đi tìm ở từng module. Hiện có khoảng 20 thông số rải ở 12 file (`runner/schedule.ts`, `bot-runner.ts`, `runner/runnerState.ts`, `history/watchState.ts`, `lesson/recoveryRun.ts`, `bot-chat.ts`, `chat/cycle.ts`, `chat/state.ts`, `lesson/time.ts`, `lesson/recovery.ts`, `config.ts`).

Tiêu chí thành công:

- Một file (`config.ts`) chứa mọi thông số chỉnh được, chia mục có tiêu đề.
- Mỗi thông số có: ý nghĩa, đơn vị, mặc định, ví dụ đặt và cách tính, và ai đọc nó.
- Giá trị mặc định **đúng bằng hiện tại**: hệ thống chạy y như cũ sau khi gom.
- Giá trị sai bị từ chối khi khởi động, báo rõ khóa nào sai.
- `npm run config:show` in toàn bộ mục kèm giá trị, đơn vị và bot nào đọc.

## 2. Đã thống nhất

| Quyết định | Nội dung |
|---|---|
| Nơi đặt | Mở rộng `config.ts` (phương án A), không tạo file mới |
| Khóa cũ | Giữ nguyên tên và vị trí truy cập (`config.targets`, `config.sinceTs`, `config.scrollDelayMs`, `config.recoveryIgnoreTargets`...) để không phải sửa nơi đang dùng |
| Khóa mới | Nhóm thành các đối tượng theo mục: `watch`, `runner`, `recovery`, `chat`, `sessions` |
| Đơn vị | Nằm trong tên khóa: `...Seconds`, `...Minutes`, `...Hour` (riêng `scrollDelayMs` giữ nguyên vì là khóa cũ) |
| Áp dụng | Đổi giá trị thì khởi động lại bot liên quan |
| Không gom | Mã giao thức Zalo (`CMD_...`), độ lệch múi giờ, `GROUP_NAME_MAX`, và `chat-rules.json` |

## 3. Cấu trúc và ghi chú từng thông số

`config.ts` được sắp thành 8 mục theo thứ tự dưới đây. **Nội dung ghi chú dưới đây chính là chú thích sẽ nằm trong file** (viết dạng comment ngay trên từng khóa) và cũng là nội dung `config:show` in ra.

### Mục 1. ZALO

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `cdpPort` | `9222` | Cổng gỡ lỗi (Chrome DevTools) mà Zalo Desktop được mở ra để bot điều khiển. Đổi khi cổng này bị chương trình khác chiếm. Ví dụ: đặt `9333` thì Zalo được mở với `--remote-debugging-port=9333`. Đọc bởi: mọi bot. |
| `zaloExePath` | tự dò | Đường dẫn `Zalo.exe`, tự tìm thư mục `Zalo-<phiên bản>` mới nhất. Chỉ đặt tay khi tự dò sai. |
| `autoLaunchZalo` | `true` | Nếu Zalo chưa chạy với cổng gỡ lỗi thì tự tắt và mở lại. Đặt `false` nếu bạn muốn tự mở Zalo; bot sẽ báo lỗi thay vì mở lại giúp. |
| `dataDir` | `./data` | Nơi lưu tin đã cào và các tệp trạng thái. |

### Mục 2. NHÓM THEO DÕI

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `targets` | 5 nhóm hiện tại | Tên nhóm **đúng như hiện ở thanh bên Zalo**. Chỉ nhóm nằm ở đây mới được theo dõi, cào và (nếu có trong `chat-rules.json`) trả lời. Ví dụ thêm một nhóm: `["bot test", "LC_HoaSen1_TĐ", "LC_MoiThem_Q1"]`. Đổi tên nhóm trong Zalo thì phải sửa ở đây. |
| `recoveryIgnoreTargets` | `["bot test"]` | Nhóm không bao giờ gửi báo cáo buổi dạy (nhóm thử). Khôi phục không coi chúng là "thiếu báo cáo" và không cào lại. Phải là tập con của `targets`. |

### Mục 3. CÀO

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `sinceTs` | `todayAt(6, 0)` | Chỉ giữ tin từ mốc này trở đi và ngừng cuộn khi cuộn qua mốc. Ví dụ: `todayAt(0, 0)` cào từ đầu ngày; `todayAt(7, 30)` từ 07:30; `null` là không giới hạn (cẩn thận: cuộn cho đến `targetMessageCount`). Lưu ý: giá trị này được tính **một lần lúc bot khởi động**, nên bot chạy qua đêm sẽ giữ mốc của ngày hôm qua (vì vậy `bot:runner` không dùng nó mà tính lại mỗi vòng: từ đầu ngày hôm nay). |
| `untilTs` | `null` | Chỉ giữ tin đến mốc này (chỉ là bộ lọc kết quả, không ảnh hưởng việc cuộn). Ví dụ: `todayAt(12, 0)` để chốt đúng buổi sáng. `null` là đến lúc chạy. |
| `targetMessageCount` | `2000` | Trần an toàn số tin mỗi nhóm mỗi lần cào, kể cả khi chưa chạm `sinceTs`. Nhóm nhắn nhiều: tăng lên, đổi lại lần cào lâu hơn. |
| `scrollDelayMs` | `{ min: 500, max: 1200 }` | Nghỉ ngẫu nhiên giữa hai bước cuộn (mili giây) để không dồn dập vào giao diện. Cách tính: trung bình 850 ms mỗi bước, cuộn 100 bước mất khoảng 85 giây. Muốn cào nhanh hơn thì giảm (nhưng dễ làm Zalo giật). |

### Mục 4. WATCH (`bot:watch`)

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `watch.heartbeatSeconds` | `30` | Bao lâu watch ghi "tôi còn sống" vào `data/.watch-state.json`. Nhỏ hơn thì phát hiện chết nhanh hơn nhưng ghi file nhiều hơn. |
| `watch.deadAfterSeconds` | `90` | Quá bấy nhiêu giây không có nhịp tim thì coi watch đã chết. **Nên bằng ít nhất 3 lần `heartbeatSeconds`** (cho phép trễ 2 nhịp). Ví dụ: nhịp 30 thì đặt 90. |
| `watch.minBlindSeconds` | `60` | Khoảng "mù" (cả hai nguồn phát hiện cùng mất) ngắn hơn giá trị này bị coi là nhiễu lúc khởi động, không ghi thành gián đoạn. |

### Mục 5. RUNNER (`bot:runner`)

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `runner.quietSeconds` | `120` | Hàng chờ có nhóm thì chờ **yên lặng** bấy nhiêu giây rồi mới cào, để gom nhiều nhóm vào một vòng. "Yên lặng" tính từ tin **mới nhất** của nhóm nằm trong hàng chờ. Ví dụ: nhóm A nhắn lúc 08:00:00 và tin cuối 08:00:20, đặt 120 thì cào lúc 08:02:20. Đặt 30 thì cào lúc 08:00:50 (nhanh hơn nhưng nhiều vòng nhỏ chiếm giao diện Zalo hơn). |
| `runner.maxWaitSeconds` | `600` | Trần chờ tính từ lúc nhóm **đầu tiên** vào hàng chờ, để nhóm nhắn liên tục không bị hoãn mãi. Ví dụ: nhóm vào hàng chờ 08:00:00 và nhắn liên tục, đặt 600 thì chắc chắn cào lúc 08:10:00. **Phải lớn hơn hoặc bằng `quietSeconds`.** |
| `runner.pollSeconds` | `5` | Runner xem lại hàng chờ mỗi bấy nhiêu giây. Độ trễ thực tế tối đa là `quietSeconds + pollSeconds`. Nhỏ quá thì đọc file dồn dập (dễ đụng lỗi `EPERM` trên Windows). |
| `runner.dirtyCheckSeconds` | `60` | Bao lâu kiểm một lần xem có báo cáo đã có trên đĩa mà chưa dựng vào Excel (ví dụ do crash hoặc cào tay). |
| `runner.dirtyRetrySeconds` | `300` | Sau khi một buổi **dựng lỗi**, đợi bấy nhiêu giây mới thử lại (tránh chiếm giao diện liên tục). Ví dụ: 300 nghĩa là thử lại mỗi 5 phút. |
| `runner.watchWarmupSeconds` | `90` | Sau khi `bot:watch` khởi động (nó tắt và mở lại Zalo), runner không đụng vào Zalo trong bấy nhiêu giây. Đặt đủ lâu để watch gắn xong (thường 60 đến 90 giây). |
| `runner.maxConsecutiveFailures` | `3` | Sau bấy nhiêu vòng lỗi **liên tiếp** (lỗi cào hoặc đồng bộ, không tính lỗi dựng của một buổi) thì runner ngừng tự thử và báo `LỖI`; hàng chờ vẫn giữ nguyên, phải khởi động lại tay. |

### Mục 6. KHÔI PHỤC

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `recovery.marginMinutes` | `5` | Khi watch từng chết, cào lại từ **trước** lúc chết bấy nhiêu phút, để bắt tin đến sát lúc watch sập. Ví dụ: watch chết lúc 10:12 thì cào từ 10:07 (nhưng không lùi quá đầu buổi). |

### Mục 7. CHAT (`bot:chat`)

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `chat.pollSeconds` | `3` | Bao lâu bot chat kiểm hộp thư một lần. Độ trễ trả lời tối thiểu xấp xỉ giá trị này cộng thời gian gửi. |
| `chat.heartbeatSeconds` | `30` | Nhịp tim của bot chat (`data/.chat-state.json`), dùng cho `chat:status`. |
| `chat.skipBackoffSeconds` | `45` | Khi một lần gửi bị hoãn (ô soạn tin đang có chữ dở, chưa mở được nhóm), không đụng vào Zalo lại trong bấy nhiêu giây. Cách tính: với `maxReplyDelaySeconds` là 180 trong `chat-rules.json`, đặt 45 cho tối đa khoảng 4 lần thử trước khi tin bị bỏ vì quá hạn. |
| `chat.sentLedgerMinutes` | `10` | Sổ các câu bot vừa gửi được giữ bấy nhiêu phút rồi xóa (để `bot:watch` nhận ra tin dội lại). Phải lớn hơn `echoWindowSeconds`. |
| `chat.echoWindowSeconds` | `120` | Một tin của chính tài khoản khớp một câu trong sổ, xuất hiện trong khoảng này thì được coi là tin dội lại của bot. Tin cùng nội dung do người gõ sau khoảng này thì không bị nuốt. |

### Mục 8. BUỔI HỌC

| Khóa | Mặc định | Ý nghĩa và ví dụ |
|---|---|---|
| `sessions.chieuFromHour` | `12` | Giờ (giờ Việt Nam, 0 đến 23) bắt đầu buổi chiều; buổi sáng là từ 00:00 đến trước giờ này. |
| `sessions.toiFromHour` | `18` | Giờ bắt đầu buổi tối; buổi chiều là từ `chieuFromHour` đến trước giờ này, buổi tối đến hết 24:00. Ví dụ đổi `toiFromHour` thành `17`: chiều 12:00 đến 17:00, tối từ 17:00; nhớ dời lịch chạy buổi chiều thành 17:05. **Phải có `0 < chieuFromHour < toiFromHour <= 23`.** |

## 4. Kiểm tra giá trị khi nạp (`validateConfig`)

Chạy khi `config.ts` được nạp; sai thì ném lỗi có tên khóa và lý do, bot không khởi động.

- Mọi khóa `...Seconds`, `...Minutes`: số nguyên dương.
- `runner.quietSeconds <= runner.maxWaitSeconds`.
- `watch.deadAfterSeconds >= 2 * watch.heartbeatSeconds` (cảnh báo nếu nhỏ hơn 3 lần).
- `chat.sentLedgerMinutes * 60 > chat.echoWindowSeconds`.
- `0 < sessions.chieuFromHour < sessions.toiFromHour <= 23`.
- `scrollDelayMs.min <= scrollDelayMs.max`, cả hai không âm.
- `recoveryIgnoreTargets` là tập con của `targets`.
- `targets` không rỗng, tên không trùng.

## 5. Cách các module dùng config

- Hằng số trong module được thay bằng giá trị đọc từ `config`. Các tên hằng đang được test dùng (`QUIET_MS`, `MAX_WAIT_MS`, `HEARTBEAT_INTERVAL_MS`, `STALE_AFTER_MS`, `SKIP_BACKOFF_MS`, `MAX_CONSECUTIVE_FAILURES`) vẫn được xuất, nhưng tính từ config.
- Giờ chia buổi: `sessionOf` (`lesson/time.ts`) và `SESSION_HOURS` (`lesson/recovery.ts`) hiện ghi cứng hai nơi; gom về một hàm lấy từ `config.sessions`. Các hàm nhận tham số giờ tùy chọn (mặc định lấy từ config) để test truyền giá trị cố định, không phụ thuộc thứ bạn chỉnh.
- Mọi test hiện có giữ nguyên; thêm test ghim giá trị mặc định (chống lệch so với hành vi cũ).

## 6. `npm run config:show`

In từng mục theo thứ tự trên: tên khóa, giá trị hiện tại, đơn vị, mặc định, và **bot nào đọc** (ví dụ `runner.quietSeconds = 120 giây (mặc định 120) | đọc bởi: bot:runner`). Khóa khác mặc định được đánh dấu `*`. Chạy rồi thoát, không kết nối gì.

## 7. Ngoài phạm vi

- Nạp lại giá trị khi đang chạy (không cần khởi động lại): không làm; `chat-rules.json` vẫn có nạp lại riêng.
- Đưa `chat-rules.json` vào `config.ts`.
- Đổi tên hay chuyển các khóa cũ.
- Đọc cấu hình từ biến môi trường hoặc `.env` (chỗ đó dành cho mật khẩu DB).

## 8. Kiểm thử

- `validateConfig`: từng luật ở mục 4, giá trị hợp lệ mặc định qua được, thông báo lỗi nêu đúng tên khóa.
- Ghim mặc định: các giá trị mặc định bằng đúng số hiện tại (120, 600, 5, 60, 300, 90, 3, 30, 90, 60, 5, 3, 30, 45, 10, 120, 12, 18).
- Giờ chia buổi: `sessionOf` và `sessionWindow` với giờ mặc định và với `toiFromHour = 17`, ranh giới 11:59/12:00/16:59/17:00; `sessionOf` và `sessionWindow` luôn đồng ý với nhau.
- `formatConfig` (hàm thuần cho `config:show`): in đủ 8 mục, đánh dấu khóa khác mặc định.
- Các test hiện có (258) vẫn đạt.

## 9. Giả định

- `config.ts` là CRLF; khi ghi lại tôi giữ CRLF để `git diff` không nhiễu.
- Người dùng chấp nhận phải khởi động lại bot để áp dụng giá trị mới.
- Đổi giờ chia buổi chỉ có tác dụng cho dữ liệu mới; báo cáo đã dựng theo ranh giới cũ không tự dựng lại.
