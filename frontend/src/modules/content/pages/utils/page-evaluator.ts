import { PageContentItem, PageSeoMetadata } from "@/lib/mocks/types";

export interface SeoCriterion {
  id: string;
  name: string;
  description: string;
  isPassed: boolean;
  score: number;
  weight: number;
  guidance: string;
}

export interface SeoEvaluationReport {
  overallPercentage: number;
  passedCount: number;
  totalCount: number;
  criteria: SeoCriterion[];
  criticalIssues: string[];
}

export function evaluatePageSeo(seo?: PageSeoMetadata, locale: "vi" | "en" = "vi"): SeoEvaluationReport {
  if (!seo) {
    return {
      overallPercentage: 0,
      passedCount: 0,
      totalCount: 5,
      criteria: [],
      criticalIssues: ["Chưa cấu hình SEO metadata cho trang này."],
    };
  }

  const title = locale === "vi" ? (seo.metaTitleVi || "") : (seo.metaTitleEn || "");
  const desc = locale === "vi" ? (seo.metaDescriptionVi || "") : (seo.metaDescriptionEn || "");
  const titleLen = title.trim().length;
  const descLen = desc.trim().length;

  const criteria: SeoCriterion[] = [
    {
      id: "meta-title",
      name: "Meta Title tối ưu",
      description: `Độ dài hiện tại: ${titleLen} ký tự. Chuẩn khuyến nghị: 25 - 65 ký tự.`,
      isPassed: titleLen >= 25 && titleLen <= 65,
      score: titleLen >= 25 && titleLen <= 65 ? 25 : titleLen > 0 ? 10 : 0,
      weight: 25,
      guidance: titleLen < 25 ? "Meta Title quá ngắn, nên bổ sung tên thương hiệu hoặc từ khóa chính." : titleLen > 65 ? "Meta Title quá dài, có nguy cơ bị cắt bớt trên Google SERP." : "Độ dài hoàn hảo cho hiển thị tìm kiếm.",
    },
    {
      id: "meta-desc",
      name: "Meta Description thuyết phục",
      description: `Độ dài hiện tại: ${descLen} ký tự. Chuẩn khuyến nghị: 50 - 160 ký tự.`,
      isPassed: descLen >= 50 && descLen <= 160,
      score: descLen >= 50 && descLen <= 160 ? 25 : descLen > 0 ? 10 : 0,
      weight: 25,
      guidance: descLen < 50 ? "Mô tả còn sơ sài, hãy tóm tắt giá trị chuỗi cung ứng HMV." : descLen > 160 ? "Mô tả vượt quá 160 ký tự, sẽ bị ẩn trên SERP di động." : "Độ dài đạt chuẩn hiển thị công cụ tìm kiếm.",
    },
    {
      id: "canonical",
      name: "Đường dẫn Canonical hợp lệ",
      description: seo.canonicalUrl ? `URI: ${seo.canonicalUrl}` : "Chưa khai báo Canonical URL",
      isPassed: Boolean(seo.canonicalUrl && (seo.canonicalUrl.startsWith("/") || seo.canonicalUrl.startsWith("http"))),
      score: Boolean(seo.canonicalUrl) ? 20 : 0,
      weight: 20,
      guidance: "Canonical URL giúp tránh trùng lặp nội dung khi phân phối đa kênh.",
    },
    {
      id: "og-image",
      name: "Open Graph Social Banner",
      description: seo.ogImageUrl ? "Đã đính kèm ảnh đại diện mạng xã hội" : "Chưa có ảnh OG Image",
      isPassed: Boolean(seo.ogImageUrl && (seo.ogImageUrl.startsWith("/") || seo.ogImageUrl.startsWith("http"))),
      score: Boolean(seo.ogImageUrl) ? 15 : 0,
      weight: 15,
      guidance: "Kích thước khuyến nghị 1200x630px cho chia sẻ LinkedIn, Facebook.",
    },
    {
      id: "indexing-readiness",
      name: "Tối ưu hóa Indexing & Cấu trúc URL",
      description: seo.canonicalUrl && !seo.canonicalUrl.includes("?") ? "URL sạch, không chứa tham số tracking rác" : "Chưa tối ưu hóa URL cho bot tìm kiếm",
      isPassed: Boolean(seo.canonicalUrl && !seo.canonicalUrl.includes("?")),
      score: Boolean(seo.canonicalUrl && !seo.canonicalUrl.includes("?")) ? 15 : 0,
      weight: 15,
      guidance: "URL sạch giúp Googlebot thu thập dữ liệu nhanh và chuẩn xác hơn (không phụ thuộc meta keywords lỗi thời).",
    },
  ];

  const totalScore = criteria.reduce((acc, curr) => acc + curr.score, 0);
  const passedCount = criteria.filter((c) => c.isPassed).length;
  const criticalIssues = criteria.filter((c) => !c.isPassed).map((c) => c.name);

  return {
    overallPercentage: totalScore,
    passedCount,
    totalCount: criteria.length,
    criteria,
    criticalIssues,
  };
}

export interface LocalizablePageInput {
  titleVi?: string;
  titleEn?: string;
  slugVi?: string;
  slugEn?: string;
  seo?: {
    metaTitleVi?: string;
    metaTitleEn?: string;
    metaDescriptionVi?: string;
    metaDescriptionEn?: string;
  };
  sections?: Array<{
    sectionType?: string;
    titleVi?: string;
    titleEn?: string;
    descriptionVi?: string;
    descriptionEn?: string;
  }>;
}

export function evaluatePageLocalization(page: LocalizablePageInput): {
  viPercentage: number;
  enPercentage: number;
  isFullyLocalized: boolean;
  missingEnFields: string[];
} {
  let viPoints = 0;
  let enPoints = 0;
  let maxPoints = 0;
  const missingEn: string[] = [];

  // Title
  maxPoints += 10;
  if (page.titleVi?.trim()) viPoints += 10;
  if (page.titleEn?.trim()) enPoints += 10;
  else missingEn.push("Tiêu đề trang tiếng Anh");

  // Slug
  maxPoints += 5;
  if (page.slugVi?.trim()) viPoints += 5;
  if (page.slugEn?.trim()) enPoints += 5;
  else missingEn.push("URL slug tiếng Anh");

  // SEO
  maxPoints += 10;
  if (page.seo?.metaTitleVi?.trim()) viPoints += 5;
  if (page.seo?.metaTitleEn?.trim()) enPoints += 5;
  else missingEn.push("Meta title tiếng Anh");

  if (page.seo?.metaDescriptionVi?.trim()) viPoints += 5;
  if (page.seo?.metaDescriptionEn?.trim()) enPoints += 5;
  else missingEn.push("Meta description tiếng Anh");

  // Sections
  const sections = page.sections || [];
  if (sections.length > 0) {
    const pointPerSec = Math.floor(70 / sections.length);
    sections.forEach((sec, idx) => {
      maxPoints += pointPerSec;
      const hasVi = Boolean(sec.titleVi?.trim() && sec.descriptionVi?.trim());
      const hasEn = Boolean(sec.titleEn?.trim() && sec.descriptionEn?.trim());

      if (hasVi) viPoints += pointPerSec;
      if (hasEn) enPoints += pointPerSec;
      else missingEn.push(`Section #${idx + 1} (${sec.sectionType})`);
    });
  }

  const viPercentage = maxPoints > 0 ? Math.round((viPoints / maxPoints) * 100) : 100;
  const enPercentage = maxPoints > 0 ? Math.round((enPoints / maxPoints) * 100) : 0;

  return {
    viPercentage,
    enPercentage,
    isFullyLocalized: viPercentage >= 85 && enPercentage >= 85,
    missingEnFields: missingEn,
  };
}
