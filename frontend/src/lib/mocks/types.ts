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

export interface PageSeoMetadata {
  metaTitleVi: string;
  metaTitleEn: string;
  metaDescriptionVi: string;
  metaDescriptionEn: string;
  canonicalUrl: string;
  ogImageUrl: string;
  keywords: string[];
}
