"use client";

import React from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContentStatusTag } from "@/components/common/content-status-tag";
import { errorDetails, errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils/format";
import { useCan } from "@/modules/auth/queries/use-session";
import {
  type ArticleDetail,
  useApproveTranslation,
  useArchiveArticle,
  usePublishArticle,
  useRestoreArticle,
} from "../queries/use-articles";
import { EDITOR_LOCALES, translationOf } from "../utils/article-form";
import { getArticlePublishReadiness, liveApprovalReason } from "../utils/publish-readiness";

interface ArticleWorkflowPanelProps {
  article: ArticleDetail;
  /** Unsaved edits: approval/publish act on the saved draft, so they wait until it is saved. */
  isDirty: boolean;
  onChanged: (article: ArticleDetail) => void;
}

/**
 * Review → approve (per locale) → publish → archive/restore. Buttons follow the user's permissions and the
 * state returned by the API; the API re-checks both. Nothing here is optimistic.
 */
export function ArticleWorkflowPanel({ article, isDirty, onChanged }: ArticleWorkflowPanelProps) {
  const can = useCan();
  const approve = useApproveTranslation();
  const publish = usePublishArticle();
  const archive = useArchiveArticle();
  const restore = useRestoreArticle();
  const busy = approve.isPending || publish.isPending || archive.isPending || restore.isPending;

  const archived = article.status === "ARCHIVED";
  const blocked = isDirty || archived || busy;
  const canPublish = can("article:publish");
  const readiness = getArticlePublishReadiness(article, { canPublish, hasUnsavedEdits: isDirty });

  const done = (message: string) => ({
    onSuccess: (updated: ArticleDetail) => {
      onChanged(updated);
      toast.success(message);
    },
    onError: (err: unknown) =>
      toast.error("Thao tác không thành công", { description: [errorMessage(err), ...errorDetails(err)].join(" · ") }),
  });

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5" data-testid="article-workflow">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700">Trạng Thái Xuất Bản</span>
        <ContentStatusTag status={article.status} />
      </div>
      <p className="text-[10px] text-slate-500">
        Bản nháp #{article.revision} · {formatDateTime(article.updatedAt)} · {article.updatedBy.displayName}
        {article.publication && ` · Công khai: bản #${article.publication.revision}`}
      </p>

      {EDITOR_LOCALES.map((locale) => {
        const t = translationOf(article, locale);
        return (
          <div key={locale} className="flex items-center justify-between gap-2" data-testid={`workflow-${locale}`}>
            <span className="font-medium text-slate-700">{locale.toUpperCase()}</span>
            <div className="flex items-center gap-1 flex-wrap justify-end">
              {!t ? (
                <Badge variant="outline" className="text-[10px]">Chưa có</Badge>
              ) : (
                <>
                  <Badge variant={t.reviewStatus === "APPROVED" ? "success" : "warning"} className="text-[10px]">
                    {t.reviewStatus === "APPROVED" ? "Đã duyệt" : "Chưa duyệt"}
                  </Badge>
                  {t.isLive && (
                    <Badge variant="info" className="text-[10px]">
                      {t.hasUnpublishedChanges ? "Công khai (bản cũ)" : "Đang công khai"}
                    </Badge>
                  )}
                  {t.isOutdated && (
                    <Badge variant="destructive" className="text-[10px]" title="Bản gốc đã thay đổi sau khi dịch">
                      Cần cập nhật bản dịch
                    </Badge>
                  )}
                  {can("article:review") && t.reviewStatus !== "APPROVED" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      disabled={blocked}
                      onClick={() =>
                        approve.mutate(
                          { id: article.id, locale, expectedRevision: article.revision },
                          done(`Đã duyệt bản ${locale.toUpperCase()}`),
                        )
                      }
                    >
                      Duyệt {locale.toUpperCase()}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}

      {readiness.liveNeedingApproval.length > 0 && (
        <p className="text-[10px] text-amber-700" data-testid="publish-blocked-reason">
          {liveApprovalReason(readiness.liveNeedingApproval)}
        </p>
      )}
      {canPublish && (readiness.blocker === "NOTHING_APPROVED" || readiness.blocker === "NOTHING_TO_PUBLISH") && (
        <p className="text-[10px] text-slate-500" data-testid="publish-blocked-reason">
          {readiness.reason}
        </p>
      )}

      <div className="flex gap-1.5 pt-1">
        {canPublish && !archived && (
          <Button
            type="button"
            size="sm"
            className="h-7 flex-1 text-xs bg-[#087EC2] hover:bg-[#066ba8] text-white"
            disabled={busy || !readiness.canPublish}
            onClick={() => {
              if (confirm("Xuất bản bản nháp này? Mọi bản dịch đã duyệt sẽ hiển thị công khai.")) {
                publish.mutate({ id: article.id, expectedRevision: article.revision }, done("Đã xuất bản bài viết"));
              }
            }}
          >
            Xuất bản
          </Button>
        )}
        {can("article:archive") &&
          (archived ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-xs"
              disabled={busy}
              onClick={() => restore.mutate(article.id, done("Đã bỏ lưu trữ bài viết"))}
            >
              Bỏ lưu trữ
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs text-rose-700"
              disabled={busy || isDirty}
              onClick={() => {
                if (confirm("Lưu trữ bài viết? Bài viết sẽ không còn hiển thị công khai.")) {
                  archive.mutate(article.id, done("Đã lưu trữ bài viết"));
                }
              }}
            >
              Lưu trữ
            </Button>
          ))}
      </div>
      {isDirty && !archived && (
        <p className="text-[10px] text-slate-500">Lưu bản nháp trước khi duyệt hoặc xuất bản.</p>
      )}
      {archived && <p className="text-[10px] text-slate-500">Bài viết đã lưu trữ: chỉ đọc cho tới khi bỏ lưu trữ.</p>}
    </div>
  );
}
