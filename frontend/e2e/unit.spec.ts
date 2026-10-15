// Pure-function checks for the integration layer (no browser, no server).
import { expect, test } from "@playwright/test";
import { isSafeHref } from "@/components/editor/content-rules";
import { initials } from "@/components/layout/header";
import { ApiError, apiOrigin } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import type { ArticleDetail } from "@/modules/content/articles/queries/use-articles";
import {
  buildDraftPatch,
  formErrorsFromApi,
  sameDoc,
  toContents,
  toFormValues,
} from "@/modules/content/articles/utils/article-form";

const doc = (text: string, extra: object[] = []) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }, ...extra],
});

const base = {
  id: "a1",
  status: "PUBLISHED",
  hasUnpublishedChanges: false,
  revision: 3,
  categoryCode: "SUPPLY_CHAIN_INSIGHTS",
  isFeatured: false,
  authorName: "Tác giả",
  authorRole: null,
  coverMedia: null,
  translations: [
    {
      locale: "vi",
      title: "Tiêu đề",
      slug: "tieu-de",
      excerpt: null,
      content: doc("Xin chào", [{ type: "image", attrs: { mediaId: "m1", alt: null, src: "http://cdn/m1.png" } }]),
      seoTitle: null,
      seoDescription: null,
      coverImageAlt: null,
    },
  ],
} as unknown as ArticleDetail;

test.describe("buildDraftPatch", () => {
  test("returns null when nothing changed, even though the editor adds src/null attrs", () => {
    const values = toFormValues(base);
    const contents = toContents(base);
    // What Tiptap emits for the same document: link class, image src and null attrs.
    contents.vi = doc("Xin chào", [
      { type: "image", attrs: { src: "http://other-cdn/m1.png", alt: null, title: null, width: null, height: null, mediaId: "m1" } },
    ]);
    expect(buildDraftPatch(base, values, contents)).toBeNull();
  });

  test("sends only changed fields, and creates a new locale once it is started", () => {
    const values = { ...toFormValues(base), excerptVi: "Tóm tắt mới", titleEn: "Title", slugEn: "title" };
    const contents = { ...toContents(base), en: doc("Hello") };
    expect(buildDraftPatch(base, values, contents)).toEqual({
      translations: [
        { locale: "vi", excerpt: "Tóm tắt mới" },
        {
          locale: "en",
          title: "Title",
          slug: "title",
          excerpt: null,
          seoTitle: null,
          seoDescription: null,
          coverImageAlt: null,
          content: doc("Hello"),
        },
      ],
    });
  });

  test("clearing and shared fields", () => {
    const values = { ...toFormValues(base), authorName: "  ", isFeatured: true, coverMediaId: "m9" };
    expect(buildDraftPatch(base, values, toContents(base))).toEqual({ isFeatured: true, authorName: null, coverMediaId: "m9" });
  });

  test("an empty editor equals no content", () => {
    expect(sameDoc({ type: "doc", content: [{ type: "paragraph" }] }, null)).toBe(true);
    expect(sameDoc(doc("a"), doc("b"))).toBe(false);
  });
});

test("server errors map to the right locale's form field", () => {
  const patch = { translations: [{ locale: "en", slug: "x" }] };
  expect(formErrorsFromApi(new ApiError(409, "SLUG_TAKEN", "", { locale: "en", slug: "x" }), patch)).toEqual([
    { field: "slugEn", message: "Slug đã được bài viết khác sử dụng" },
  ]);
  expect(
    formErrorsFromApi(new ApiError(400, "VALIDATION_FAILED", "", [{ path: "translations.0.title", message: "too long" }]), patch),
  ).toEqual([{ field: "titleEn", message: "too long" }]);
  expect(
    formErrorsFromApi(new ApiError(422, "TRANSLATION_INCOMPLETE", "", [{ path: "translations[0]", message: "x" }]), patch),
  ).toEqual([
    { field: "titleEn", message: "Cần tiêu đề" },
    { field: "slugEn", message: "Cần URL slug" },
  ]);
});

test("error messages are specific", () => {
  expect(errorMessage(new ApiError(409, "TRANSLATION_NOT_APPROVED", "", { locales: ["vi", "en"] }))).toBe(
    "Có bản dịch chưa được duyệt nên chưa thể xuất bản. Cần duyệt: Tiếng Việt, English.",
  );
  expect(errorMessage(new ApiError(429, "RATE_LIMITED", "", { retryAfterSeconds: 600 }))).toContain("10 phút");
});

test("link rule mirrors the backend", () => {
  for (const ok of ["https://hmv.vn", "mailto:a@b.c", "tel:+84", "/vi/tin-tuc", "#muc-1"]) expect(isSafeHref(ok)).toBe(true);
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:x", "java\tscript:x", " https://x", "data:text/html,x", "//evil.com", "ftp://x"]) {
    expect(isSafeHref(bad)).toBe(false);
  }
});

test("API base URL never doubles the /api/v1 prefix (generated paths already contain it)", () => {
  for (const value of ["http://localhost:4000", "http://localhost:4000/", "http://localhost:4000/api/v1", "http://localhost:4000/api/v1/", " https://api.hmvglobal.com/api/v1 "]) {
    const origin = apiOrigin(value);
    expect(`${origin}/api/v1/auth/session`).not.toContain("/api/v1/api/v1");
    expect(origin).not.toMatch(/\/$/);
  }
  expect(apiOrigin(undefined)).toBe("http://localhost:4000");
  expect(apiOrigin("https://api.hmvglobal.com/api/v1")).toBe("https://api.hmvglobal.com");
});

test("avatar initials use letters only", () => {
  expect(initials("Nguyễn Hoàng Long")).toBe("NL");
  expect(initials("Quản trị viên (local)")).toBe("QL");
  expect(initials("Admin")).toBe("A");
  expect(initials("")).toBe("?");
});
