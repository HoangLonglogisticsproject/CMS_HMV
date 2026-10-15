/** Mirrors the API policy (backend auth/password.ts `passwordProblem`) for instant feedback; the API stays authoritative. */
export const PASSWORD_MIN_LENGTH = 12;

export function newPasswordProblem(password: string, repeat: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Mật khẩu mới cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`;
  if (password.length > 1024) return "Mật khẩu tối đa 1024 ký tự.";
  if (password.trim() !== password) return "Mật khẩu không được bắt đầu hoặc kết thúc bằng khoảng trắng.";
  if (password !== repeat) return "Hai lần nhập mật khẩu mới không khớp.";
  return null;
}
