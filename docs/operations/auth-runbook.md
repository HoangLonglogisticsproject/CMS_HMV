# HMV CMS — Runbook tài khoản & đăng nhập

Hướng dẫn vận hành ngắn cho Product Owner và quản trị viên. Không bao giờ gửi mật khẩu qua chat, email hay cho agent;
mọi lệnh dưới đây tự hỏi mật khẩu ở dạng ẩn.

## 1. Khởi chạy CMS (development)

```bash
docker compose up -d postgres            # Postgres :5442, chỉ nghe trên loopback, dữ liệu nằm trong volume
                                         # (mật khẩu DB đọc từ .env ở thư mục gốc, xem README.md)
pnpm install                             # an toàn: chỉ chạy `prisma generate`, không đụng dữ liệu
pnpm --filter backend db:migrate         # áp migration mới (vd. quyền user:manage cho ADMIN)
pnpm --filter backend start:dev          # API :4000
pnpm --filter frontend dev               # CMS :3000
```

Tắt/mở lại CMS, restart backend, frontend hoặc Postgres **không** thay đổi tài khoản, mật khẩu hay session còn hạn.
Không có script khởi động, build, install hay seed nào tạo hoặc sửa tài khoản (có test tự động chặn việc này).

## 2. Tài khoản Admin đầu tiên (chỉ khi database chưa có ai)

```bash
pnpm --filter backend user:create --email <email> --name "<Tên>" --role ADMIN
```

Lệnh in database đích rồi hỏi mật khẩu (ẩn, nhập hai lần). Nếu email đã tồn tại, lệnh **từ chối và không thay đổi gì**.

## 3. Vai trò

| Vai trò | Quyền |
|---|---|
| ADMIN | Mọi quyền, gồm `user:manage` (quản lý người dùng) |
| EDITOR | Viết bài (`article:read`, `article:write`), media (`media:read`, `media:write`) |
| REVIEWER | Đọc, duyệt bản dịch, xuất bản, lưu trữ bài viết; đọc media |
| VIEWER | Chỉ đọc bài viết và media |

Quyền được backend kiểm tra ở mọi API; ẩn nút trên giao diện chỉ là tiện ích.

## 4. Công việc thường ngày (CMS → *Người dùng & phân quyền*, cần vai trò ADMIN)

| Việc | Cách làm | Kết quả |
|---|---|---|
| Tạo nhân viên | *Thêm người dùng*: email, tên, vai trò, mật khẩu ban đầu | Email trùng bị từ chối. Gửi mật khẩu ban đầu qua kênh riêng; nhân viên đổi ngay sau lần đăng nhập đầu |
| Phân quyền | *Phân quyền* | Có hiệu lực ngay trên các phiên đang mở |
| Nhân viên nghỉ việc | *Khoá* | Đăng xuất mọi phiên, không đăng nhập lại được. *Mở khoá* để khôi phục |
| Quên mật khẩu | *Đặt lại mật khẩu* | Mật khẩu mới, mọi phiên bị đăng xuất; vai trò giữ nguyên |
| Nghi lộ phiên | *Đăng xuất mọi phiên* | Tài khoản vẫn dùng được, mọi phiên cũ vô hiệu |
| Xem sự kiện bảo mật | Bảng *Sự kiện bảo mật gần đây* | Đăng nhập (kể cả thất bại), đổi/đặt lại mật khẩu, tạo/khoá/đổi vai trò, ai làm, IP |

**Tự đổi mật khẩu:** menu tài khoản (góc phải) → *Đổi mật khẩu*. Cần mật khẩu hiện tại; phiên đang dùng được giữ, các phiên
khác bị đăng xuất.

Hệ thống luôn giữ ít nhất một quản trị viên đang hoạt động: không thể khoá hoặc bỏ vai trò ADMIN của quản trị viên cuối
cùng (lỗi `LAST_ADMIN`).

## 5. Khôi phục quyền Admin (khi không ai đăng nhập được giao diện)

Cần quyền truy cập máy chủ/database. Không tạo tài khoản Admin mới để "thay thế":

```bash
pnpm --filter backend user:list                                   # xem tài khoản, vai trò, phiên (không in hash)
pnpm --filter backend user:reset-password --email <email-admin>   # in database đích, hỏi xác nhận, hỏi mật khẩu ẩn
```

`user:reset-password` chỉ đổi mật khẩu của đúng tài khoản đó và đăng xuất mọi phiên của nó; vai trò và trạng thái giữ
nguyên. Mọi lần chạy được ghi vào sự kiện bảo mật (`user.password_reset`, `via: cli`).

## 6. Điều tra lỗi đăng nhập

| Mã | Ý nghĩa | Việc cần làm |
|---|---|---|
| 401 `INVALID_CREDENTIALS` | Sai mật khẩu, email không tồn tại hoặc tài khoản đã khoá (cố ý trả cùng một lỗi) | `user:list` (đúng database? tài khoản active?), xem *Sự kiện bảo mật*; nếu quên mật khẩu → mục 4/5 |
| 401 `UNAUTHENTICATED` | Phiên hết hạn (mặc định 12 giờ), bị thu hồi hoặc tài khoản bị khoá | Đăng nhập lại; CMS giữ nguyên nội dung đang soạn |
| 403 `PERMISSION_DENIED` | Vai trò không có quyền | Phân quyền lại |
| 403 `CSRF_TOKEN_INVALID` | Tab cũ sau khi đăng nhập ở tab khác | Tải lại trang |
| 403 `ORIGIN_NOT_ALLOWED` | Địa chỉ CMS không nằm trong `CORS_ORIGIN` của API | Sửa cấu hình |
| 403 `CURRENT_PASSWORD_INCORRECT` | Nhập sai mật khẩu hiện tại khi tự đổi | Nhập lại |
| 429 `RATE_LIMITED` | 5 lần sai trong 15 phút cho một email/IP, hoặc 20 lần sai/IP | Chờ hết thời gian ghi trong thông báo (bộ đếm nằm trong bộ nhớ: restart backend cũng xoá) |

`user:list` và `user:reset-password` luôn in `host:port/database` đang dùng: kiểm tra trước khi nghi ngờ mật khẩu.

## 7. Môi trường & an toàn

| Môi trường | Database | Tài khoản |
|---|---|---|
| Development | `hmv_cms` | Tài khoản thật của nhân viên |
| Integration test backend | `hmv_cms_test` | Sinh tự động, bị xoá sau mỗi test |
| E2E trình duyệt | `hmv_cms_e2e_test` | `*@e2e.test` |

- Script xoá dữ liệu test từ chối mọi database không có đuôi `_test`; E2E không bao giờ ghi vào `hmv_cms`.
- Automation, screenshot và E2E không được dùng tài khoản development; không commit mật khẩu (test `credential-safety`
  kiểm tra cả hai điều này).
- Session lưu trong database (chỉ lưu hash của token), cookie `HttpOnly`, `SameSite=Lax`; production dùng
  `__Host-hmv_session` + `Secure`.
- Production: API từ chối khởi động nếu `CORS_ORIGIN` không phải https hoặc trỏ về localhost, hoặc thiếu
  `MEDIA_PUBLIC_BASE_URL`; frontend từ chối build nếu thiếu `NEXT_PUBLIC_API_URL`. Sau reverse proxy phải đặt
  `TRUST_PROXY` để rate limit và audit thấy đúng IP. CMS và API phải cùng site (vd. `cms.` và `api.` của cùng tên miền).
- Biến `JWT_SECRET` trong `.env` cũ không được dùng (session không dùng JWT).
