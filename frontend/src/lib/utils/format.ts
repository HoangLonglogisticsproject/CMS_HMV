const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

/** ISO timestamp from the API → "14/10/2026, 09:30". */
export const formatDateTime = (iso?: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
