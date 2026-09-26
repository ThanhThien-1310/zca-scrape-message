# TIN HỌC ĐẠI DƯƠNG — BẢNG CẤU TRÚC TABLE

Tổng số bảng: **1**

## 1. Zalo_CrawlMessage

Đại diện cho một tin nhắn trong Zalo.

| Tên cột | Kiểu dữ liệu | Thuộc tính | Ý nghĩa |
|---|---|---|---|
| Id | uniqueidentifier | PK | Khoá chính |
| MessageId | varchar(128) | | Id của tin nhắn mà nhân viên gửi trong nhóm Zalo |
| MessageType | varchar(32) | | Loại tin nhắn |
| IsSelf | bit | | Cho biết đây là tin nhắn tài khoản bot gửi hay người dùng thường |
| SenderId | varchar(128) | | Id của nhân viên trong Zalo |
| SenderName | nvarchar(256) | | Tên tài khoản Zalo của nhân viên |
| GroupId | varchar(128) | | Id của nhóm Zalo mà nhân viên gửi tin nhắn |
| GroupName | nvarchar(50) | | Tên nhóm Zalo |
| Timestamp | bigint | | Thời gian tin nhắn được gửi trong nhóm Zalo |
| TextContent | ntext | | Nội dung tin nhắn hoặc caption đối với tin nhắn hình ảnh |
| Url | nvarchar(MAX) | | Url hình ảnh đối với tin nhắn hình ảnh |
| MessageStatus | int | | Trạng thái của tin nhắn |
| StatusId | int | | Trạng thái của tin nhắn sau khi được bot trích xuất |
| HasRead | bit | | Cho biết tin nhắn đã được bot đọc hay chưa |
| Created | datetime | | Thời gian tin nhắn được lưu vào database |

### Ghi chú

**MessageId** — Không dùng `MessageId` làm khoá chính vì:

- Có thể null khi Zalo thay đổi giao diện dẫn đến logic trích xuất bị sai.
- Cơ chế retry có thể gây trùng do gửi nhiều lần.

**MessageType**

| Giá trị | Ý nghĩa |
|---|---|
| `text` | Văn bản |
| `image` | Hình ảnh |

**IsSelf**

| Giá trị | Ý nghĩa |
|---|---|
| `true` | Bot |
| `false` | Người dùng bình thường |

**GroupName** — Đã kiểm tra nhóm Zalo chỉ chứa tối đa 50 kí tự.

**MessageStatus**

| Giá trị | Ý nghĩa |
|---|---|
| `1` | Bình thường |
| `2` | Thu hồi |

**StatusId**

| Giá trị | Ý nghĩa |
|---|---|
| `-1` | Không phân loại được tin nhắn |
| `0` | Phân loại được tin nhắn nhưng toàn bộ trường, phòng trong tin nhắn không match được vào database |
| `1` | Phân loại được tin nhắn và toàn bộ trường, phòng trong tin nhắn match được vào database |
| `2` | Phân loại được tin nhắn nhưng một số trường, phòng trong tin nhắn không match được vào database |
| `3` | Phân loại được tin nhắn, nhưng không có bất kỳ thông tin nào |

**Created** — Tính theo múi giờ +07:00.
