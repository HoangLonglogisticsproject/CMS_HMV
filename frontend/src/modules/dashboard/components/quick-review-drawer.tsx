"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Calendar,
  User,
  ShieldAlert,
} from "lucide-react";
import {
  useArticleDetail,
  useArticlePreviews,
  useApproveTranslation,
  usePublishArticle,
} from "@/modules/content/articles/queries/use-articles";
import { useCan } from "@/modules/auth/queries/use-session";
import { ARTICLE_CATEGORY_METADATA } from "@/modules/content/articles/schemas/article-schema";
import { formatDateTime } from "@/lib/utils/format";
import { errorMessage, errorDetails } from "@/lib/api/errors";
import { isApiError } from "@/lib/api/client";
import { toast } from "sonner";
import { DrawerContentPreview } from "./drawer-content-preview";
import { DrawerGovernanceFooter } from "./drawer-governance-footer";
import { PublishConfirmationDialog } from "./publish-confirmation-dialog";

interface QuickReviewDrawerProps {
  articleId: string | null;
  isOpen: boolean;
  onClose: () => void;
  defaultLocale?: "vi" | "en";
}

const PREVIEW_LOCALES = ["vi", "en"] as const;

export function QuickReviewDrawer({
  articleId,
  isOpen,
  onClose,
  defaultLocale = "vi",
}: QuickReviewDrawerProps) {
  const can = useCan();
  const [activeLocale, setActiveLocale] = useState<"vi" | "en">(defaultLocale);
  const [initializedArticleId, setInitializedArticleId] = useState<string | null>(null);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  // Queries
  const {
    data: article,
    isLoading: isArticleLoading,
    error: articleError,
    refetch: refetchArticle,
  } = useArticleDetail(articleId ?? "");

  const [viPreview, enPreview] = useArticlePreviews(articleId, PREVIEW_LOCALES);

  // Mutations
  const approveMutation = useApproveTranslation();
  const publishMutation = usePublishArticle();
  const isBusy = approveMutation.isPending || publishMutation.isPending;

  // Initialize active locale ONCE per article, prioritizing unapproved translations
  if (article && article.id !== initializedArticleId) {
    setInitializedArticleId(article.id);
    setConflictError(null);
    const vi = article.translations.find((t) => t.locale === "vi");
    const en = article.translations.find((t) => t.locale === "en");
    if (vi && vi.reviewStatus !== "APPROVED") {
      setActiveLocale("vi");
    } else if (en && en.reviewStatus !== "APPROVED") {
      setActiveLocale("en");
    } else {
      setActiveLocale(defaultLocale);
    }
  }

  if (!articleId) return null;

  const viTranslation = article?.translations.find((t) => t.locale === "vi");
  const enTranslation = article?.translations.find((t) => t.locale === "en");
  const currentTranslation = activeLocale === "vi" ? viTranslation : enTranslation;
  const currentPreview = activeLocale === "vi" ? viPreview.data : enPreview.data;

  const categoryMeta = article?.categoryCode
    ? ARTICLE_CATEGORY_METADATA[article.categoryCode]
    : null;
  const categoryLabel = categoryMeta
    ? activeLocale === "vi"
      ? categoryMeta.labelVi
      : categoryMeta.labelEn
    : article?.categoryCode;

  const isCurrentLocaleApproved = currentTranslation?.reviewStatus === "APPROVED";

  // Handlers
  const handleApproveCurrentLocale = () => {
    if (!article) return;
    setConflictError(null);
    approveMutation.mutate(
      {
        id: article.id,
        locale: activeLocale,
        expectedRevision: article.revision,
      },
      {
        onSuccess: () => {
          toast.success(`Đã phê duyệt bản dịch ${activeLocale.toUpperCase()} thành công!`);
          void refetchArticle();
        },
        onError: (err: unknown) => {
          const detailMsgs = errorDetails(err);
          const msg = errorMessage(err);
          const isConflict =
            isApiError(err, "REVISION_CONFLICT") ||
            msg.includes("REVISION_CONFLICT") ||
            msg.includes("Draft is at revision") ||
            msg.includes("lưu trước bạn");
          if (isConflict) {
            setConflictError("Bản nháp đã được cập nhật bởi biên tập viên khác. Vui lòng tải lại dữ liệu.");
          }
          toast.error("Không thể phê duyệt bản dịch", {
            description: [msg, ...detailMsgs].join(" · "),
          });
        },
      },
    );
  };

  const handleConfirmPublish = () => {
    if (!article) return;
    setConflictError(null);
    publishMutation.mutate(
      {
        id: article.id,
        expectedRevision: article.revision,
      },
      {
        onSuccess: () => {
          setShowPublishDialog(false);
          toast.success("Đã xuất bản bài viết lên website công khai!");
          void refetchArticle();
        },
        onError: (err: unknown) => {
          setShowPublishDialog(false);
          const detailMsgs = errorDetails(err);
          const msg = errorMessage(err);
          const isConflict =
            isApiError(err, "REVISION_CONFLICT") ||
            msg.includes("REVISION_CONFLICT") ||
            msg.includes("Draft is at revision") ||
            msg.includes("lưu trước bạn");
          if (isConflict) {
            setConflictError("Bản nháp đã được cập nhật bởi biên tập viên khác. Vui lòng tải lại dữ liệu.");
          }
          toast.error("Không thể xuất bản bài viết", {
            description: [msg, ...detailMsgs].join(" · "),
          });
        },
      },
    );
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="right"
          data-testid="quick-review-drawer"
          className="w-full sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl p-0 flex flex-col h-full bg-white shadow-2xl border-l border-slate-200"
        >
          {/* Top Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-white sticky top-0 z-10 space-y-3">
            <div className="flex items-center justify-between gap-3 pr-8">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[11px] font-semibold py-0.5 px-2.5 ${categoryMeta?.color || "bg-slate-50 text-slate-700"}`}
                >
                  {categoryLabel}
                </Badge>
                {article && (
                  <Badge variant="outline" className="text-[11px] font-mono text-slate-600 bg-slate-50">
                    rev #{article.revision}
                  </Badge>
                )}
                {article?.status === "PUBLISHED" ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px] font-medium">
                    Đang công khai
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[11px] text-amber-700 bg-amber-50 border-amber-200 font-medium">
                    Bản nháp
                  </Badge>
                )}
              </div>

              {article && (
                <Link
                  href={`/content/articles/${article.id}`}
                  className="text-xs font-semibold text-[#0066CC] hover:underline flex items-center gap-1 shrink-0"
                  title="Mở toàn bộ giao diện chỉnh sửa chuyên sâu"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Mở Editor</span>
                </Link>
              )}
            </div>

            <div>
              <SheetTitle className="text-base sm:text-lg font-bold text-[#113E67] leading-snug line-clamp-2">
                {currentPreview?.title ||
                  currentTranslation?.title ||
                  viTranslation?.title ||
                  enTranslation?.title ||
                  "Đang tải bài viết..."}
              </SheetTitle>
              <SheetDescription className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                {article && (
                  <>
                    <span className="flex items-center gap-1 text-slate-500">
                      <User className="h-3 w-3 text-slate-400" />
                      {article.authorName || article.updatedBy.displayName}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-slate-500">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      Cập nhật: {formatDateTime(article.updatedAt)}
                    </span>
                    {currentPreview?.readTimeMinutes ? (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-500">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {currentPreview.readTimeMinutes} phút đọc
                        </span>
                      </>
                    ) : null}
                  </>
                )}
              </SheetDescription>
            </div>

            {/* Language Switcher & Locale Status Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveLocale("vi")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeLocale === "vi"
                      ? "bg-white text-[#0066CC] shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Tiếng Việt (VI)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLocale("en")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                    activeLocale === "en"
                      ? "bg-white text-[#0066CC] shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  English (EN)
                </button>
              </div>

              {/* Status Badge for Active Locale */}
              <div className="flex items-center gap-2 flex-wrap">
                {!currentTranslation ? (
                  <Badge variant="outline" className="text-xs text-slate-400 border-dashed border-slate-300">
                    {activeLocale.toUpperCase()}: Chưa có bản dịch
                  </Badge>
                ) : isCurrentLocaleApproved ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-medium gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{activeLocale.toUpperCase()}: Đã duyệt bản dịch</span>
                  </Badge>
                ) : currentTranslation.isOutdated ? (
                  <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs font-medium gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                    <span>{activeLocale.toUpperCase()}: Cần cập nhật do bản gốc đổi</span>
                  </Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-xs font-medium gap-1">
                    <Clock className="h-3.5 w-3.5 text-amber-600" />
                    <span>{activeLocale.toUpperCase()}: Chờ Ban Giám đốc duyệt</span>
                  </Badge>
                )}

                {currentTranslation?.isLive && (
                  <Badge variant="outline" className="text-xs bg-sky-50 text-[#0066CC] border-sky-200">
                    Đang trực tuyến
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Scrollable Reading & Preview Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Loading Skeleton */}
            {isArticleLoading && (
              <div className="space-y-4 animate-pulse">
                <div className="h-8 bg-slate-100 rounded-lg w-3/4" />
                <div className="h-24 bg-slate-100 rounded-xl" />
                <div className="h-64 bg-slate-100 rounded-xl" />
              </div>
            )}

            {/* Revision Conflict Alert Banner */}
            {conflictError && (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span>Xung đột phiên bản nội dung</span>
                </div>
                <p className="text-xs text-amber-800">{conflictError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setConflictError(null);
                    void refetchArticle();
                  }}
                  className="h-7 text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Tải lại dữ liệu mới nhất
                </Button>
              </div>
            )}

            {/* Error State */}
            {articleError && (
              <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 text-rose-800 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <ShieldAlert className="h-4 w-4 text-rose-600" />
                  <span>Không tải được dữ liệu chi tiết bài viết</span>
                </div>
                <p className="text-xs text-rose-700">{errorMessage(articleError)}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchArticle()}
                  className="h-7 text-xs bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Thử lại
                </Button>
              </div>
            )}

            {!isArticleLoading && article && (
              <DrawerContentPreview
                activeLocale={activeLocale}
                currentPreview={currentPreview}
                currentTranslation={currentTranslation}
              />
            )}
          </div>

          {/* Sticky Executive Governance Footer */}
          <DrawerGovernanceFooter
            article={article}
            activeLocale={activeLocale}
            canReview={can("article:review")}
            canPublish={can("article:publish")}
            isBusy={isBusy}
            isApprovePending={approveMutation.isPending}
            onApprove={handleApproveCurrentLocale}
            onRequestPublish={() => setShowPublishDialog(true)}
          />
        </SheetContent>
      </Sheet>

      {/* Strict Publish Confirmation Dialog */}
      <PublishConfirmationDialog
        isOpen={showPublishDialog}
        onClose={() => setShowPublishDialog(false)}
        article={article}
        onConfirm={handleConfirmPublish}
        isPending={publishMutation.isPending}
      />
    </>
  );
}
