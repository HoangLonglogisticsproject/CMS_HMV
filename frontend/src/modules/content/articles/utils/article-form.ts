/**
 * Maps between the API's article model (revisioned, `translations[]`) and the editor's flat VI/EN form.
 * The form shape is UI state only; the API contract stays the source of truth (generated types).
 */
import type { Path } from "react-hook-form";
import { ApiError, type Schemas } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils/format";
import type { ArticleDetail, DraftPatch } from "../queries/use-articles";
import type { ArticleFormValues } from "../schemas/article-schema";

export const EDITOR_LOCALES = ["vi", "en"] as const;
export type EditorLocale = (typeof EDITOR_LOCALES)[number];
export type RichDoc = Record<string, unknown>;
export type Contents = Record<EditorLocale, RichDoc | null>;
type TranslationInput = NonNullable<DraftPatch["translations"]>[number];

const SUFFIX = { vi: "Vi", en: "En" } as const;
const blankToNull = (s: string) => s.trim() || null;
export const translationOf = (d: ArticleDetail, locale: string) => d.translations.find((t) => t.locale === locale);

/** Public URL path convention used across the CMS UI (the website owns its routing). */
export const publicPath = (slug: string) => `/tin-tuc/${slug}`;

export function toFormValues(d: ArticleDetail): ArticleFormValues {
  const vi = translationOf(d, "vi");
  const en = translationOf(d, "en");
  return {
    id: d.id,
    category: d.categoryCode,
    authorName: d.authorName ?? "",
    authorRole: d.authorRole ?? "",
    coverMediaId: d.coverMedia?.id ?? null,
    coverImage: d.coverMedia?.url ?? "",
    coverImageAltVi: vi?.coverImageAlt ?? "",
    coverImageAltEn: en?.coverImageAlt ?? "",
    isFeatured: d.isFeatured,
    titleVi: vi?.title ?? "",
    titleEn: en?.title ?? "",
    slugVi: vi?.slug ?? "",
    slugEn: en?.slug ?? "",
    excerptVi: vi?.excerpt ?? "",
    excerptEn: en?.excerpt ?? "",
    seo: {
      metaTitleVi: vi?.seoTitle ?? "",
      metaTitleEn: en?.seoTitle ?? "",
      metaDescriptionVi: vi?.seoDescription ?? "",
      metaDescriptionEn: en?.seoDescription ?? "",
      canonicalUrl: vi ? publicPath(vi.slug) : "",
      ogImageUrl: d.coverMedia?.url ?? "",
      keywords: [],
    },
  };
}

export const toContents = (d: ArticleDetail): Contents => ({
  vi: (translationOf(d, "vi")?.content as RichDoc | null | undefined) ?? null,
  en: (translationOf(d, "en")?.content as RichDoc | null | undefined) ?? null,
});

/** An editor document without text, images or other blocks (Tiptap's empty doc is one empty paragraph). */
export function isEmptyDoc(doc: RichDoc | null | undefined): boolean {
  const blocks = (doc?.content as RichDoc[] | undefined) ?? [];
  return blocks.every((b) => b.type === "paragraph" && !(b.content as unknown[] | undefined)?.length);
}

/**
 * Canonical form for comparing editor output with stored content: drops what the server never stores
 * (image `src`, link `class`), null attributes and empty arrays, and sorts keys.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const obj = value as RichDoc;
  const out: RichDoc = {};
  for (const key of Object.keys(obj).sort()) {
    let v = obj[key];
    if (key === "attrs" && v && typeof v === "object") {
      const attrs = { ...(v as RichDoc) };
      delete attrs.src;
      delete attrs.class;
      for (const k of Object.keys(attrs)) if (attrs[k] === null) delete attrs[k];
      v = Object.keys(attrs).length ? attrs : undefined;
    }
    if (Array.isArray(v) && v.length === 0) v = undefined;
    if (v !== undefined) out[key] = canonical(v);
  }
  return out;
}

export function sameDoc(a: RichDoc | null | undefined, b: RichDoc | null | undefined) {
  if (isEmptyDoc(a) || isEmptyDoc(b)) return isEmptyDoc(a) && isEmptyDoc(b);
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * The PATCH body for `PATCH /admin/articles/:id/draft`: only fields that differ from `base` (the revision the
 * form was loaded from), so a conflict-resolution retry re-applies just this user's edits. `null` = no changes.
 */
export function buildDraftPatch(base: ArticleDetail, v: ArticleFormValues, contents: Contents): DraftPatch | null {
  const patch: DraftPatch = {};
  if (v.category !== base.categoryCode) patch.categoryCode = v.category;
  if (v.isFeatured !== base.isFeatured) patch.isFeatured = v.isFeatured;
  if (blankToNull(v.authorName) !== base.authorName) patch.authorName = blankToNull(v.authorName);
  if (blankToNull(v.authorRole) !== base.authorRole) patch.authorRole = blankToNull(v.authorRole);
  if (v.coverMediaId !== (base.coverMedia?.id ?? null)) patch.coverMediaId = v.coverMediaId;

  const translations: TranslationInput[] = [];
  for (const locale of EDITOR_LOCALES) {
    const s = SUFFIX[locale];
    const prev = translationOf(base, locale);
    const doc = contents[locale];
    const cur = {
      title: v[`title${s}`].trim(),
      slug: v[`slug${s}`].trim(),
      excerpt: blankToNull(v[`excerpt${s}`]),
      seoTitle: blankToNull(v.seo[`metaTitle${s}`]),
      seoDescription: blankToNull(v.seo[`metaDescription${s}`]),
      coverImageAlt: blankToNull(v[`coverImageAlt${s}`]),
      content: isEmptyDoc(doc) ? null : doc,
    };

    if (!prev) {
      // A locale that does not exist yet is created only once the editor has started it.
      if (!cur.title && !cur.slug && !cur.excerpt && !cur.content && !cur.seoTitle && !cur.seoDescription) continue;
      translations.push({ locale, ...cur, title: cur.title || undefined, slug: cur.slug || undefined });
      continue;
    }
    const t: TranslationInput = { locale };
    if (cur.title && cur.title !== prev.title) t.title = cur.title;
    if (cur.slug && cur.slug !== prev.slug) t.slug = cur.slug;
    if (cur.excerpt !== prev.excerpt) t.excerpt = cur.excerpt;
    if (cur.seoTitle !== prev.seoTitle) t.seoTitle = cur.seoTitle;
    if (cur.seoDescription !== prev.seoDescription) t.seoDescription = cur.seoDescription;
    if (cur.coverImageAlt !== prev.coverImageAlt) t.coverImageAlt = cur.coverImageAlt;
    if (!sameDoc(cur.content, prev.content as RichDoc | null)) t.content = cur.content;
    if (Object.keys(t).length > 1) translations.push(t);
  }
  if (translations.length) patch.translations = translations;
  return Object.keys(patch).length ? patch : null;
}

// ---------- Preview dialog view model ----------

const STATUS_LABEL: Record<string, string> = { DRAFT: "Bản nháp", PUBLISHED: "Đã xuất bản", ARCHIVED: "Lưu trữ" };

/** Exactly what `ArticlePreviewDialog` renders (flat VI/EN). */
export interface ArticlePreviewModel {
  category?: string;
  status?: string;
  authorName?: string;
  authorRole?: string;
  updatedAt?: string;
  isFeatured?: boolean;
  readTimeMinutes?: number;
  coverImage?: string;
  coverImageAltVi?: string;
  coverImageAltEn?: string;
  titleVi?: string;
  titleEn?: string;
  slugVi?: string;
  slugEn?: string;
  excerptVi?: string;
  excerptEn?: string;
  contentJsonVi?: RichDoc | null;
  contentJsonEn?: RichDoc | null;
  seo?: { metaTitleVi?: string; metaTitleEn?: string; metaDescriptionVi?: string; metaDescriptionEn?: string };
}

/** Unsaved editor state (what the author is looking at right now). */
export function previewFromForm(v: ArticleFormValues, contents: Contents, base?: ArticleDetail): ArticlePreviewModel {
  return {
    ...v,
    status: base ? STATUS_LABEL[base.status] : undefined,
    updatedAt: base ? formatDateTime(base.updatedAt) : undefined,
    readTimeMinutes: base ? translationOf(base, "vi")?.readTimeMinutes : undefined,
    contentJsonVi: contents.vi,
    contentJsonEn: contents.en,
  };
}

type PublicArticle = Schemas["PublicArticle"];

/** Saved draft as the public API would render it (GET /admin/articles/:id/preview), per locale. */
export function previewFromServer(vi: PublicArticle | null, en: PublicArticle | null, status?: string): ArticlePreviewModel {
  const any = vi ?? en;
  return {
    category: any?.category.code,
    status: status ? STATUS_LABEL[status] : undefined,
    authorName: any?.authorName ?? undefined,
    authorRole: any?.authorRole ?? undefined,
    updatedAt: any?.updatedAt ? formatDateTime(any.updatedAt) : "Chưa xuất bản",
    isFeatured: any?.isFeatured,
    readTimeMinutes: any?.readTimeMinutes,
    coverImage: any?.cover?.url,
    coverImageAltVi: vi?.cover?.alt ?? undefined,
    coverImageAltEn: en?.cover?.alt ?? undefined,
    titleVi: vi?.title,
    titleEn: en?.title,
    slugVi: vi?.slug,
    slugEn: en?.slug,
    excerptVi: vi?.excerpt ?? undefined,
    excerptEn: en?.excerpt ?? undefined,
    contentJsonVi: vi?.content ?? null,
    contentJsonEn: en?.content ?? null,
    seo: {
      metaTitleVi: vi?.seo.title,
      metaTitleEn: en?.seo.title,
      metaDescriptionVi: vi?.seo.description ?? undefined,
      metaDescriptionEn: en?.seo.description ?? undefined,
    },
  };
}

// ---------- Server validation errors → form fields ----------

type FormPath = Path<ArticleFormValues>;
const FIELD_BY_API: Record<string, (s: "Vi" | "En") => FormPath> = {
  title: (s) => `title${s}`,
  slug: (s) => `slug${s}`,
  excerpt: (s) => `excerpt${s}`,
  seoTitle: (s) => `seo.metaTitle${s}`,
  seoDescription: (s) => `seo.metaDescription${s}`,
  coverImageAlt: (s) => `coverImageAlt${s}`,
};
const suffixOf = (locale?: string) => (locale === "en" ? "En" : "Vi");

/** Maps API errors about translation fields (by index into the sent patch) to form fields. */
export function formErrorsFromApi(err: unknown, patch: DraftPatch): { field: FormPath; message: string }[] {
  if (!(err instanceof ApiError)) return [];
  const sent = patch.translations ?? [];
  if (err.code === "SLUG_TAKEN") {
    const d = err.details as { locale?: string } | undefined;
    return [{ field: `slug${suffixOf(d?.locale)}`, message: "Slug đã được bài viết khác sử dụng" }];
  }
  if (!Array.isArray(err.details)) return [];
  return (err.details as { path?: string; message?: string }[]).flatMap((issue) => {
    const m = /^translations(?:\.|\[)(\d+)\]?(?:\.(\w+))?/.exec(issue.path ?? "");
    if (!m) return [];
    const s = suffixOf(sent[Number(m[1])]?.locale);
    if (err.code === "TRANSLATION_INCOMPLETE" && !m[2]) {
      return [
        { field: `title${s}` as FormPath, message: "Cần tiêu đề" },
        { field: `slug${s}` as FormPath, message: "Cần URL slug" },
      ];
    }
    const toField = m[2] ? FIELD_BY_API[m[2]] : undefined;
    return toField ? [{ field: toField(s), message: issue.message ?? "Không hợp lệ" }] : [];
  });
}
