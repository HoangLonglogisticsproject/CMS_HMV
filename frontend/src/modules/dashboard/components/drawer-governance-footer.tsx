"use client";

import React from "react";
import { SheetClose } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  Send,
} from "lucide-react";
import type { Schemas } from "@/lib/api/client";

type ArticleDetail = Schemas["ArticleDetailResponse"];

interface DrawerGovernanceFooterProps {
  article: ArticleDetail | undefined;
  activeLocale: "vi" | "en";
  canReview: boolean;
  canPublish: boolean;
  isBusy: boolean;
  isApprovePending: boolean;
  onApprove: () => void;
  onRequestPublish: () => void;
}

export function DrawerGovernanceFooter({
  article,
  activeLocale,
  canReview,
  canPublish,
  isBusy,
  isApprovePending,
  onApprove,
  onRequestPublish,
}: DrawerGovernanceFooterProps) {
  const currentTranslation = article?.translations.find((t) => t.locale === activeLocale);
  const isCurrentLocaleApproved = currentTranslation?.reviewStatus === "APPROVED";
  const isArchived = article?.status === "ARCHIVED";

  const hasApprovedTranslation = Boolean(
    article?.translations.some((t) => t.reviewStatus === "APPROVED"),
  );
  const liveNeedingApproval =
    article?.translations.filter((t) => t.isLive && t.reviewStatus !== "APPROVED") ?? [];

  const canReviewCurrentLocale =
    canReview && Boolean(currentTranslation) && !isCurrentLocaleApproved && !isArchived;

  const canPublishArticle =
    canPublish && !isArchived && hasApprovedTranslation && liveNeedingApproval.length === 0;

  return (
    <div className="p-4 sm:p-5 border-t border-slate-200 bg-white/95 backdrop-blur-md sticky bottom-0 z-10 space-y-2.5">
      {/* Warning if any published translation was modified and needs re-approval */}
      {liveNeedingApproval.length > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            Bản dịch đang trực tuyến (
            <strong>{liveNeedingApproval.map((t) => t.locale.toUpperCase()).join(", ")}</strong>
            ) đã có cập nhật mới chưa được duyệt: cần duyệt lại trước khi xuất bản bản sửa đổi.
          </span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Locale Approval Action */}
        <div className="flex items-center gap-2">
          {canReviewCurrentLocale && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="drawer-approve-btn"
              className="h-9 px-4 text-xs font-semibold bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-300 gap-1.5 shadow-2xs"
              disabled={isBusy}
              onClick={onApprove}
            >
              <CheckCircle2 className="h-4 w-4 text-amber-600" />
              <span>
                {isApprovePending
                  ? "Đang phê duyệt..."
                  : `Phê duyệt bản dịch ${activeLocale.toUpperCase()}`}
              </span>
            </Button>
          )}

          {isCurrentLocaleApproved && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Bản dịch {activeLocale.toUpperCase()} đã duyệt</span>
            </div>
          )}

          {!canReview && (
            <span className="text-xs text-slate-400 italic">
              Chế độ xem trước (cần quyền Reviewer để duyệt)
            </span>
          )}
        </div>

        {/* Right: Close and Publish Actions */}
        <div className="flex items-center gap-2 justify-end">
          <SheetClose asChild>
            <Button
              variant="outline"
              size="sm"
              data-testid="drawer-close-btn"
              className="h-9 text-xs font-medium text-slate-600"
            >
              Đóng
            </Button>
          </SheetClose>

          {canPublish && (
            <Button
              type="button"
              variant="default"
              size="sm"
              data-testid="drawer-publish-btn"
              className="h-9 px-4 text-xs font-medium bg-[#0066CC] hover:bg-[#0052A3] text-white gap-1.5 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200"
              disabled={isBusy || !canPublishArticle}
              title={
                !hasApprovedTranslation
                  ? "Cần ít nhất một bản dịch đã được duyệt để xuất bản"
                  : liveNeedingApproval.length > 0
                  ? "Bản dịch đang trực tuyến có cập nhật mới chưa được duyệt"
                  : "Xuất bản bài viết lên website công khai"
              }
              onClick={onRequestPublish}
            >
              <Send className="h-3.5 w-3.5" />
              <span>Xuất bản bài viết</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
