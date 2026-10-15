export type PublicationStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED";
export type SupportedLocale = "en" | "vi";

export type CapabilityTier = "DIRECT_OPERATION" | "STRATEGIC_PARTNER" | "IN_DEVELOPMENT";

export interface DashboardMetrics {
  publishedPages: number;
  draftArticles: number;
  pendingReviews: number;
  missingTranslations: number;
  seoWarnings: number;
  totalMediaAssets: number;
}

export interface RecentContentActivity {
  id: string;
  title: string;
  entityType: "Page" | "Article" | "Commodity" | "SupplyChainStory";
  locale: SupportedLocale;
  action: "Created" | "Updated" | "Translated" | "Ready for Review";
  updatedAt: string;
  author: string;
  status: PublicationStatus;
}

export interface CommodityItem {
  id: string;
  code: string;
  nameVi: string;
  nameEn: string;
  originRegion: string;
  status: PublicationStatus;
  variantsCount: number;
  updatedAt: string;
}

export interface SupplyChainStageItem {
  id: string;
  stageNumber: number;
  titleVi: string;
  titleEn: string;
  subtitle: string;
  tier: CapabilityTier;
  status: PublicationStatus;
  keyCapability: string;
  descriptionVi: string;
  descriptionEn: string;
}

export type PageContentType = "LANDING" | "SUPPLY_CHAIN" | "CATALOG" | "STANDARDS" | "EDITORIAL";

export type SectionType = "HERO" | "STORY_INTRO" | "CAPABILITY_GRID" | "METRICS_STRIP" | "CTA_BANNER";

export interface PageSectionItem {
  id: string;
  sectionType: SectionType;
  titleVi: string;
  titleEn: string;
  subtitleVi: string;
  subtitleEn: string;
  descriptionVi: string;
  descriptionEn: string;
  ctaTextVi: string;
  ctaTextEn: string;
  ctaUrl: string;
  mediaUrl: string;
  mediaAlt: string;
  order: number;
  isActive: boolean;
}

export interface PageSeoMetadata {
  metaTitleVi: string;
  metaTitleEn: string;
  metaDescriptionVi: string;
  metaDescriptionEn: string;
  canonicalUrl: string;
  ogImageUrl: string;
  keywords: string[];
}

export interface PageContentItem {
  id: string;
  systemKey: string;
  contentType: PageContentType;
  titleVi: string;
  titleEn: string;
  slugVi: string;
  slugEn: string;
  status: PublicationStatus;
  sectionsCount: number;
  updatedAt: string;
  lastEditor: string;
  sections: PageSectionItem[];
  seo: PageSeoMetadata;
}
