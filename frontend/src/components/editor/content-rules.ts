/**
 * Client copy of the backend rich content v1 link rule (backend/src/modules/articles/rich-content.ts, `isSafeHref`),
 * so editors get immediate feedback instead of a 422 on save. The backend stays authoritative.
 */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

export function isSafeHref(value: string): boolean {
  if (!value || value.length > 2048) return false;
  // Whitespace/control characters are how "java\tscript:" style bypasses get through naive checks.
  if (/[\u0000-\u0020\u007f]/.test(value)) return false;
  if (value.startsWith("#") || (value.startsWith("/") && !value.startsWith("//"))) return true;
  try {
    return SAFE_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
