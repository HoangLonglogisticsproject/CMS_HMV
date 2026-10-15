import { z } from "zod";

/** Same rule as the backend (`SLUG_RE`): lowercase ASCII words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MESSAGE = "Slug chỉ gồm chữ thường không dấu, số và dấu gạch nối (vd: chuoi-cung-ung-ca-phe)";

const optionalSlug = z
  .string()
  .max(200, "Slug tối đa 200 ký tự")
  .refine((v) => v === "" || SLUG_PATTERN.test(v), SLUG_MESSAGE);

// Max lengths mirror the backend DTOs so errors appear before the request is sent.
export const articleFormSchema = z
  .object({
    id: z.string(),
    category: z.string().min(1, "Chọn chuyên mục"),
    authorName: z.string().max(120, "Tối đa 120 ký tự"), // optional byline, as in the API
    authorRole: z.string().max(120, "Tối đa 120 ký tự"),
    /** Media library asset id of the cover (what the API stores); `coverImage` is its URL for display. */
    coverMediaId: z.string().nullable(),
    coverImage: z.string(),
    coverImageAltVi: z.string().max(500, "Alt text tối đa 500 ký tự"),
    coverImageAltEn: z.string().max(500, "Alt text tối đa 500 ký tự"),
    isFeatured: z.boolean(),
    titleVi: z.string().trim().min(3, "Tiêu đề bài viết tiếng Việt không được để trống").max(200, "Tiêu đề tối đa 200 ký tự"),
    titleEn: z.string().max(200, "Tiêu đề tối đa 200 ký tự"),
    slugVi: z.string().min(2, "URL Slug tiếng Việt không được để trống").max(200).regex(SLUG_PATTERN, SLUG_MESSAGE),
    slugEn: optionalSlug,
    excerptVi: z.string().max(1000, "Tóm tắt tối đa 1000 ký tự"),
    excerptEn: z.string().max(1000, "Tóm tắt tối đa 1000 ký tự"),
    seo: z.object({
      metaTitleVi: z.string().max(200, "Meta title tối đa 200 ký tự"),
      metaTitleEn: z.string().max(200, "Meta title tối đa 200 ký tự"),
      metaDescriptionVi: z.string().max(500, "Meta description tối đa 500 ký tự"),
      metaDescriptionEn: z.string().max(500, "Meta description tối đa 500 ký tự"),
      // Derived for the SEO checklist only (not stored): canonical = public path of the slug, OG image = cover.
      canonicalUrl: z.string(),
      ogImageUrl: z.string(),
      keywords: z.array(z.string()),
    }),
  })
  .superRefine((v, ctx) => {
    // Once English is started it must be complete enough to exist (the API rejects a locale without title + slug).
    const enStarted = [v.titleEn, v.slugEn, v.excerptEn, v.seo.metaTitleEn, v.seo.metaDescriptionEn].some((s) => s.trim());
    if (enStarted && !v.titleEn.trim()) ctx.addIssue({ code: "custom", path: ["titleEn"], message: "Cần tiêu đề tiếng Anh" });
    if (enStarted && !v.slugEn) ctx.addIssue({ code: "custom", path: ["slugEn"], message: "Cần URL slug tiếng Anh" });
  });

export type ArticleFormValues = z.infer<typeof articleFormSchema>;

/** Presentation only (badge colours). Labels come from GET /admin/article-categories. */
export const ARTICLE_CATEGORY_METADATA: Record<
  string,
  { labelVi: string; labelEn: string; color: string }
> = {
  SUPPLY_CHAIN_INSIGHTS: {
    labelVi: "Chuỗi Cung Ứng",
    labelEn: "Supply Chain Insights",
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  QUALITY_STANDARDS: {
    labelVi: "Tiêu Chuẩn Nông Sản & QA",
    labelEn: "Quality & Agricultural Standards",
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  COLD_CHAIN_INTEL: {
    labelVi: "Bảo Quản & Chuỗi Lạnh",
    labelEn: "Cold Chain Intelligence",
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
  },
  GLOBAL_TRADE_INVESTMENT: {
    labelVi: "Thương Mại & Đầu Tư",
    labelEn: "Global Trade & Investment",
    color: "bg-amber-50 text-amber-700 border-amber-200",
  },
  LOGISTICS_OPERATIONS: {
    labelVi: "Vận Hành Logistics",
    labelEn: "Trade & Logistics Operations",
    color: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  SUSTAINABILITY_ENERGY: {
    labelVi: "Bền Vững & Năng Lượng (ESG)",
    labelEn: "Sustainability & Renewable Energy",
    color: "bg-teal-50 text-teal-700 border-teal-200",
  },
};
