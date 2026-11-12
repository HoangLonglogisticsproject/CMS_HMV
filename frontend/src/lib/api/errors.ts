import { ApiError, type ApiErrorCode } from "./client";

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  NETWORK_ERROR: "Không kết nối được tới máy chủ API. Kiểm tra backend đang chạy.",
  UNAUTHENTICATED: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  PERMISSION_DENIED: "Tài khoản của bạn không có quyền thực hiện thao tác này.",
  CSRF_TOKEN_INVALID: "Phiên làm việc vừa thay đổi (có thể bạn đã đăng nhập ở tab khác). Vui lòng thử lại.",
  ORIGIN_NOT_ALLOWED: "Yêu cầu bị chặn vì nguồn gửi không hợp lệ.",
  RATE_LIMITED: "Bạn đã thử quá nhiều lần. Vui lòng đợi rồi thử lại.",
  ARTICLE_NOT_FOUND: "Không tìm thấy bài viết.",
  PAGE_NOT_FOUND: "Không tìm thấy trang.",
  TRANSLATION_NOT_FOUND: "Bản dịch chưa tồn tại trong bản nháp.",
  MEDIA_NOT_FOUND: "Ảnh không tồn tại trong thư viện media.",
  REVISION_CONFLICT: "Bài viết đã được người khác lưu trước bạn.",
  SLUG_TAKEN: "Đường dẫn (slug) đã được bài viết khác sử dụng.",
  ARTICLE_ARCHIVED: "Bài viết đang ở trạng thái lưu trữ, không thể chỉnh sửa.",
  ARTICLE_NOT_ARCHIVED: "Bài viết không ở trạng thái lưu trữ.",
  TRANSLATION_NOT_APPROVED: "Có bản dịch chưa được duyệt nên chưa thể xuất bản.",
  TRANSLATION_INCOMPLETE: "Bản dịch chưa đủ điều kiện.",
  TRANSLATION_NOT_SUBMITTED: "Bản dịch chưa được gửi duyệt.",
  RICH_CONTENT_INVALID: "Nội dung bài viết chứa thành phần không được hỗ trợ.",
  UNKNOWN_LOCALE: "Ngôn ngữ không được hỗ trợ.",
  UNKNOWN_CATEGORY: "Chuyên mục không hợp lệ.",
  VALIDATION_FAILED: "Dữ liệu gửi lên không hợp lệ.",
  FILE_REQUIRED: "Vui lòng chọn tệp ảnh.",
  UNSUPPORTED_MEDIA_TYPE: "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.",
  PAYLOAD_TOO_LARGE: "Tệp vượt quá dung lượng cho phép.",
  INTERNAL_ERROR: "Máy chủ gặp lỗi. Vui lòng thử lại sau.",
  CURRENT_PASSWORD_INCORRECT: "Mật khẩu hiện tại không đúng.",
  USER_NOT_FOUND: "Không tìm thấy người dùng.",
  EMAIL_TAKEN: "Email này đã có tài khoản. Không thể tạo trùng.",
  UNKNOWN_ROLE: "Vai trò không hợp lệ.",
  LAST_ADMIN: "Phải còn ít nhất một quản trị viên đang hoạt động: không thể khoá hoặc hạ quyền tài khoản này.",
  INQUIRY_NOT_FOUND: "Không tìm thấy yêu cầu giao thương.",
  ASSIGNEE_INVALID: "Người được giao phải là tài khoản đang hoạt động có quyền xử lý yêu cầu giao thương.",
  NOTIFICATION_IN_PROGRESS: "Email thông báo cho yêu cầu này đang được gửi. Vui lòng đợi kết quả.",
};

const LOCALE_LABEL: Record<string, string> = { vi: "Tiếng Việt", en: "English" };

/** One user-facing sentence (Vietnamese) for any error. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.";
  const base = MESSAGES[err.code] ?? err.message;
  const d = err.details as Record<string, unknown> | undefined;
  if (err.code === "RATE_LIMITED" && typeof d?.retryAfterSeconds === "number") {
    return `${base} (khoảng ${Math.ceil(d.retryAfterSeconds / 60)} phút)`;
  }
  if (err.code === "TRANSLATION_NOT_APPROVED" && Array.isArray(d?.locales)) {
    return `${base} Cần duyệt: ${(d.locales as string[]).map((l) => LOCALE_LABEL[l] ?? l).join(", ")}.`;
  }
  if (err.code === "SLUG_TAKEN" && typeof d?.slug === "string") return `${base} (“${d.slug}”)`;
  return base;
}

/** `[{ path, message }]` details (validation, rich content, incomplete translation) as short lines. */
export function errorDetails(err: unknown): string[] {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return [];
  return (err.details as { path?: string; message?: string }[])
    .filter((i) => i?.message)
    .slice(0, 5)
    .map((i) => (i.path ? `${i.path}: ${i.message}` : String(i.message)));
}
