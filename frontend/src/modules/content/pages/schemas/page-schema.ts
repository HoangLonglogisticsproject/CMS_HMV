import { z } from "zod";

export const pageSectionSchema = z.object({
  id: z.string(),
  sectionType: z.enum(["HERO", "STORY_INTRO", "CAPABILITY_GRID", "METRICS_STRIP", "CTA_BANNER"]),
  titleVi: z.string().min(1, "Tiêu đề tiếng Việt là bắt buộc"),
  titleEn: z.string(),
  subtitleVi: z.string(),
  subtitleEn: z.string(),
  descriptionVi: z.string(),
  descriptionEn: z.string(),
  ctaTextVi: z.string(),
  ctaTextEn: z.string(),
  ctaUrl: z.string(),
  mediaUrl: z.string(),
  mediaAlt: z.string(),
  order: z.number().int(),
  isActive: z.boolean(),
});

export const pageSeoSchema = z.object({
  metaTitleVi: z.string(),
  metaTitleEn: z.string(),
  metaDescriptionVi: z.string(),
  metaDescriptionEn: z.string(),
  canonicalUrl: z.string(),
  ogImageUrl: z.string(),
  keywords: z.array(z.string()),
});

export const pageFormSchema = z.object({
  id: z.string(),
  systemKey: z.string(),
  contentType: z.enum(["LANDING", "SUPPLY_CHAIN", "CATALOG", "STANDARDS", "EDITORIAL"]),
  titleVi: z.string().min(2, "Tiêu đề trang tiếng Việt không được để trống"),
  titleEn: z.string(),
  slugVi: z.string().min(1, "Slug tiếng Việt không được để trống"),
  slugEn: z.string(),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"]),
  sections: z.array(pageSectionSchema),
  seo: pageSeoSchema,
});

export type PageFormValues = z.infer<typeof pageFormSchema>;
