"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Eye,
  ExternalLink,
  Layers,
  Globe,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useArticles,
  useArticleStats,
} from "@/modules/content/articles/queries/use-articles";
import { ARTICLE_CATEGORY_METADATA } from "@/modules/content/articles/schemas/article-schema";
import { formatDateTime } from "@/lib/utils/format";
import { QuickReviewDrawer } from "./quick-review-drawer";

/** Presentation helper for category tags */
function getCategoryInfo(code: string) {
  return (
    ARTICLE_CATEGORY_METADATA[code] || {
      labelVi: code,
      labelEn: code,
      color: "bg-slate-50 text-slate-700 border-slate-200",
    }
  );
}

/** Status badge for individual translation review status */
function LocaleBadge({
  locale,
  translation,
}: {
  locale: "vi" | "en";
  translation?: { reviewStatus: string; isLive: boolean; isOutdated: boolean; hasUnpublishedChanges: boolean };
}) {
  if (!translation) {
    return (
      <Badge variant="outline" className="text-[10px] text-slate-400 border-dashed border-slate-300">
        {locale.toUpperCase()}: Chưa có
      </Badge>
    );
  }

  if (translation.reviewStatus === "APPROVED") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
        <CheckCircle2 className="h-2.5 w-2.5" />
        {locale.toUpperCase()}: Đã duyệt
      </Badge>
    );
  }

  if (translation.isOutdated) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] gap-1 font-medium bg-rose-50 text-rose-700 border-rose-200"
        title="Bản gốc VI đã thay đổi sau khi dịch"
      >
        <AlertTriangle className="h-2.5 w-2.5" />
        {locale.toUpperCase()}: Cần cập nhật
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-[10px] gap-1 font-medium bg-amber-50 text-amber-700 border-amber-200">
      <Clock className="h-2.5 w-2.5" />
      {locale.toUpperCase()}: Chờ duyệt
    </Badge>
  );
}

export function DashboardView() {
  const [filterMode, setFilterMode] = useState<"awaiting" | "all">("awaiting");
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);

  // Real backend queries
  const { data: stats, isLoading: isStatsLoading, refetch: refetchStats } = useArticleStats();
  const {
    data: articlesList,
    isLoading: isArticlesLoading,
    isFetching: isArticlesFetching,
    refetch: refetchArticles,
  } = useArticles({
    awaitingReview: filterMode === "awaiting" ? true : undefined,
    sort: "-updatedAt",
    pageSize: 6,
  });

  const articles = articlesList?.items ?? [];

  const handleRefresh = () => {
    void refetchStats();
    void refetchArticles();
  };

  return (
    <div className="space-y-6">
      {/* Editorial Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#113E67]">Tổng quan &amp; Điều hành nội dung</h1>
            <Badge variant="outline" className="text-[10px] bg-sky-50 text-[#0066CC] border-[#bae6fd] font-semibold gap-1">
              <Shield className="h-3 w-3" />
              <span>CEO Operations</span>
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Hàng đợi rà soát, phê duyệt bản dịch song ngữ và điều hành chuỗi cung ứng HMV Global.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isArticlesFetching}
            className="h-8 text-xs gap-1.5 text-slate-600 hover:text-[#0066CC] hover:border-[#0066CC]/30 font-medium"
            title="Làm mới hàng đợi và số liệu thực tế"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isArticlesFetching ? "animate-spin text-[#0066CC]" : "text-slate-400"}`} />
            <span className="hidden sm:inline">Làm mới</span>
          </Button>
          <Link href="/content/articles">
            <Button variant="default" size="sm" className="h-8 text-xs gap-1.5 font-medium bg-[#0066CC] hover:bg-[#0052A3]">
              <FileText className="h-3.5 w-3.5" />
              <span>Kho EcoNews</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Workspace Layout (8 cols Left / 4 cols Right at 1440x900) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (66% width): Urgent Approval Queue */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="border border-slate-200/90 shadow-2xs">
            <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm sm:text-base font-bold text-[#113E67]">
                    Hàng Đợi Phê Duyệt EcoNews
                  </CardTitle>
                  <Badge variant="outline" className="text-[11px] font-bold bg-amber-50 text-amber-800 border-amber-200">
                    {stats?.awaitingReview ?? 0} bài chờ duyệt
                  </Badge>
                </div>
                <CardDescription className="text-xs text-slate-500 mt-0.5">
                  Các bài viết phân tích nông sản có bản dịch cần Ban Giám đốc kiểm duyệt trước khi phát hành
                </CardDescription>
              </div>

              {/* View Toggle */}
              <div className="flex items-center bg-slate-100/80 p-0.5 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterMode("awaiting")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    filterMode === "awaiting" ? "bg-white text-[#0066CC] shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Cần duyệt ({stats?.awaitingReview ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    filterMode === "all" ? "bg-white text-[#0066CC] shadow-2xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Tất cả gần đây
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-3 sm:p-4 space-y-3">
              {/* Loading Skeleton */}
              {isArticlesLoading && (
                <div className="space-y-3">
                  {[1, 2, 3].map((idx) => (
                    <div key={idx} className="h-24 rounded-xl border border-slate-100 bg-slate-50/70 animate-pulse p-4" />
                  ))}
                </div>
              )}

              {/* Honest Empty State */}
              {!isArticlesLoading && articles.length === 0 && (
                <div className="py-12 px-4 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                  <div className="mx-auto w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-3 shadow-2xs">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {filterMode === "awaiting" ? "Không có bài viết nào chờ xem xét hoặc phê duyệt" : "Chưa có bài viết nào"}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                    {filterMode === "awaiting"
                      ? "Hiện tại không có bản dịch EcoNews nào đang chờ Ban Giám đốc kiểm duyệt trong hàng đợi này."
                      : "Kho dữ liệu EcoNews hiện chưa có bài viết nào phù hợp với bộ lọc đã chọn."}
                  </p>
                  <div className="mt-5 flex items-center justify-center gap-2.5">
                    <Link href="/content/articles">
                      <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-medium">
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        <span>Xem kho EcoNews</span>
                      </Button>
                    </Link>
                    <Link href="/supply-chain/stages">
                      <Button variant="default" size="sm" className="h-8 text-xs gap-1.5 font-medium bg-[#0066CC] hover:bg-[#0052A3]">
                        <Layers className="h-3.5 w-3.5" />
                        <span>Mở Story Studio</span>
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {/* Populated Approval Queue List: Single Action "Xem & xét duyệt" */}
              {!isArticlesLoading &&
                articles.map((article) => {
                  const viTranslation = article.translations.find((t) => t.locale === "vi");
                  const enTranslation = article.translations.find((t) => t.locale === "en");
                  const title = viTranslation?.title || enTranslation?.title || `Bài viết rev #${article.revision}`;
                  const categoryInfo = getCategoryInfo(article.categoryCode);

                  return (
                    <div
                      key={article.id}
                      className="p-3.5 sm:p-4 bg-white border border-slate-200/90 rounded-xl hover:border-[#0066CC]/40 hover:shadow-2xs transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        {/* Article Info */}
                        <div className="min-w-0 space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className={`text-[10px] py-0 px-2 font-medium ${categoryInfo.color}`}>
                              {categoryInfo.labelVi}
                            </Badge>
                            <Badge variant="outline" className="text-[10px] py-0 font-mono text-slate-500 bg-slate-50">
                              rev #{article.revision}
                            </Badge>
                            {article.status === "PUBLISHED" ? (
                              <Badge variant="outline" className="text-[10px] py-0 bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
                                Đang công khai
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] py-0 bg-amber-50 text-amber-700 border-amber-200 font-medium">
                                Bản nháp
                              </Badge>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-slate-800 leading-snug truncate" title={title}>
                            {title}
                          </h3>

                          <p className="text-[11px] text-slate-400">
                            Biên tập bởi <span className="font-medium text-slate-600">{article.updatedBy.displayName}</span> • Cập nhật{" "}
                            {formatDateTime(article.updatedAt)}
                          </p>

                          {/* Bilingual Status Indicators */}
                          <div className="flex items-center gap-2 pt-1 flex-wrap">
                            <LocaleBadge locale="vi" translation={viTranslation} />
                            <LocaleBadge locale="en" translation={enTranslation} />
                          </div>
                        </div>

                        {/* Primary Action Button: "Xem & xét duyệt" */}
                        <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 sm:pl-4 border-t sm:border-t-0 border-slate-100">
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="h-8 text-xs gap-1.5 font-medium bg-[#0066CC] hover:bg-[#0052A3] text-white shadow-2xs"
                            onClick={() => setSelectedArticleId(article.id)}
                            title="Mở Quick Review Workspace để rà soát nội dung và quyết định phê duyệt / xuất bản"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Xem &amp; xét duyệt</span>
                          </Button>

                          <Link href={`/content/articles/${article.id}`}>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-slate-700 hover:border-slate-300"
                              title="Mở trình soạn thảo chi tiết"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (34% width): Real Stats & Isolated Workspaces */}
        <div className="lg:col-span-4 space-y-5">
          {/* Real Metrics Card */}
          <Card className="border border-slate-200/90 shadow-2xs">
            <CardHeader className="p-4 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-bold text-[#113E67] uppercase tracking-wide">
                  Kho Nội Dung EcoNews (Real-time)
                </CardTitle>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              </div>
              <CardDescription className="text-[11px] text-slate-400">
                Dữ liệu máy chủ NestJS không qua giả lập
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-2.5">
                {/* Awaiting Review */}
                <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-xl">
                  <span className="text-[11px] font-medium text-amber-800">Chờ Phê Duyệt</span>
                  <div className="text-xl font-bold text-amber-900 mt-0.5">
                    {isStatsLoading ? "..." : stats?.awaitingReview ?? 0}
                  </div>
                  <span className="text-[10px] text-amber-600">Bản dịch cần rà soát</span>
                </div>

                {/* Published */}
                <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl">
                  <span className="text-[11px] font-medium text-emerald-800">Đang Công Khai</span>
                  <div className="text-xl font-bold text-emerald-900 mt-0.5">
                    {isStatsLoading ? "..." : stats?.published ?? 0}
                  </div>
                  <span className="text-[10px] text-emerald-600">Trực tuyến website</span>
                </div>

                {/* Draft */}
                <div className="p-3 bg-sky-50/70 border border-sky-200/70 rounded-xl">
                  <span className="text-[11px] font-medium text-sky-800">Bản Nháp</span>
                  <div className="text-xl font-bold text-sky-900 mt-0.5">
                    {isStatsLoading ? "..." : stats?.draft ?? 0}
                  </div>
                  <span className="text-[10px] text-sky-600">Đang được biên soạn</span>
                </div>

                {/* Total */}
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <span className="text-[11px] font-medium text-slate-700">Tổng Bài Viết</span>
                  <div className="text-xl font-bold text-slate-800 mt-0.5">
                    {isStatsLoading ? "..." : stats?.total ?? 0}
                  </div>
                  <span className="text-[10px] text-slate-500">Trong kho nội dung</span>
                </div>
              </div>

              <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Xem danh sách đầy đủ:</span>
                <Link
                  href="/content/articles"
                  className="font-semibold text-[#0066CC] hover:underline flex items-center gap-1"
                >
                  Kho EcoNews <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Isolated Specialist Workspaces (Pages & Supply Chain) */}
          <Card className="border border-slate-200/90 shadow-2xs">
            <CardHeader className="p-4 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#0066CC]" />
                <CardTitle className="text-xs font-bold text-[#113E67] uppercase tracking-wide">
                  Phân Khu Khởi Tạo &amp; Kể Chuyện
                </CardTitle>
              </div>
              <CardDescription className="text-[11px] text-slate-400">
                Không gian chuyên môn tách biệt khỏi hàng đợi phê duyệt xuất bản
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* Supply Chain Story Studio */}
              <div className="p-3.5 bg-gradient-to-br from-[#F1FAFF] to-white border border-[#bae6fd]/70 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#0066CC] text-white flex items-center justify-center shadow-2xs shrink-0">
                      <Layers className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">Hành Trình Chuỗi Cung Ứng</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white text-[#0066CC] border-[#bae6fd] font-semibold">
                    6 Giai Đoạn
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Cấu hình cốt truyện 6 công đoạn: Vùng nguyên liệu, Sơ chế, Chế biến sâu, Kho vận, Kiểm định và Giao hàng quốc tế.
                </p>
                <Link href="/supply-chain/stages" className="block pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5 font-medium text-[#0066CC] border-[#bae6fd] hover:bg-sky-50 justify-between"
                  >
                    <span>Mở Story Studio</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>

              {/* Website Pages Workspace */}
              <div className="p-3.5 bg-slate-50/70 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-slate-700 text-white flex items-center justify-center shadow-2xs shrink-0">
                      <Globe className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">Trang Web &amp; Landing Pages</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-white text-slate-600 border-slate-200 font-semibold">
                    5 Trang
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Quản lý nội dung các trang website công khai: Trang chủ, Về chúng tôi, Đối tác chế biến, Vận hành và Liên hệ.
                </p>
                <Link href="/content/pages" className="block pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1.5 font-medium text-slate-700 border-slate-200 hover:bg-slate-100 justify-between"
                  >
                    <span>Quản lý Trang Web</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Review Drawer (Executive Cockpit Review Workspace) */}
      <QuickReviewDrawer
        articleId={selectedArticleId}
        isOpen={Boolean(selectedArticleId)}
        onClose={() => setSelectedArticleId(null)}
        defaultLocale="vi"
      />
    </div>
  );
}
