import type { ArticleDetail } from "../queries/use-articles";

/** Why Publish is unavailable, most actionable first. */
export type PublishBlocker =
  | "NO_PERMISSION"
  | "ARCHIVED"
  | "UNSAVED_EDITS"
  | "LIVE_LOCALE_UNAPPROVED"
  | "NOTHING_APPROVED"
  | "NOTHING_TO_PUBLISH";

export interface PublishReadiness {
  canPublish: boolean;
  blocker: PublishBlocker | null;
  /** One sentence for the UI, null when publishing is possible. */
  reason: string | null;
  /** Live locales edited since they were approved: the API answers 409 TRANSLATION_NOT_APPROVED. */
  liveNeedingApproval: string[];
  /** Approved locales: public after publishing. */
  goingLive: string[];
  /** Approved locales that are not public yet. */
  newLocales: string[];
  /** Unapproved locales that are not public: they stay internal drafts. */
  staysDraft: string[];
}

/** Shown to everyone with a live locale awaiting re-approval, not only to publishers. */
export const liveApprovalReason = (locales: string[]) =>
  `Bản đang công khai (${locales.map((l) => l.toUpperCase()).join(", ")}) đã được sửa: cần duyệt lại trước khi xuất bản.`;

const REASONS: Record<PublishBlocker, (r: Pick<PublishReadiness, "liveNeedingApproval">) => string> = {
  NO_PERMISSION: () => "Tài khoản của bạn không có quyền xuất bản.",
  ARCHIVED: () => "Bài viết đã lưu trữ: bỏ lưu trữ trước khi xuất bản.",
  UNSAVED_EDITS: () => "Lưu bản nháp trước khi duyệt hoặc xuất bản.",
  LIVE_LOCALE_UNAPPROVED: (r) => liveApprovalReason(r.liveNeedingApproval),
  NOTHING_APPROVED: () => "Cần ít nhất một bản dịch đã được duyệt để xuất bản.",
  NOTHING_TO_PUBLISH: () => "Không có thay đổi mới để xuất bản: bản công khai đã là bản mới nhất.",
};

/**
 * Whether Publish should be offered, mirroring `ArticlesService.publish` (the API stays authoritative):
 * - every live locale must be approved for its current content, else 409 TRANSLATION_NOT_APPROVED;
 * - at least one locale must be approved, else 409 TRANSLATION_NOT_APPROVED;
 * - approvals bind to a locale's content hash, so any edit makes a live locale unapproved again.
 * On top of that it hides publishes that change nothing public (the API accepts them, bumps `lastPublishedAt` and
 * writes an audit entry). Something changes when an approved locale is not live yet, or when the draft revision moved
 * past the published one (`hasUnpublishedChanges`: approved live-locale edits and article-level fields such as
 * category, cover, author or featured, which no translation hash covers).
 * ponytail: a draft that differs only in an unapproved, non-live locale still counts as a change (the API does not
 * expose the published revision's fields to tell); publishing it is harmless.
 */
export function getArticlePublishReadiness(
  article: Pick<ArticleDetail, "status" | "hasUnpublishedChanges" | "translations">,
  { canPublish, hasUnsavedEdits = false }: { canPublish: boolean; hasUnsavedEdits?: boolean },
): PublishReadiness {
  const approved = article.translations.filter((t) => t.reviewStatus === "APPROVED");
  const lists = {
    liveNeedingApproval: article.translations.filter((t) => t.isLive && t.reviewStatus !== "APPROVED").map((t) => t.locale),
    goingLive: approved.map((t) => t.locale),
    newLocales: approved.filter((t) => !t.isLive).map((t) => t.locale),
    staysDraft: article.translations.filter((t) => !t.isLive && t.reviewStatus !== "APPROVED").map((t) => t.locale),
  };
  const blocker: PublishBlocker | null = !canPublish
    ? "NO_PERMISSION"
    : article.status === "ARCHIVED"
      ? "ARCHIVED"
      : hasUnsavedEdits
        ? "UNSAVED_EDITS"
        : lists.liveNeedingApproval.length
          ? "LIVE_LOCALE_UNAPPROVED"
          : !approved.length
            ? "NOTHING_APPROVED"
            : !lists.newLocales.length && !article.hasUnpublishedChanges
              ? "NOTHING_TO_PUBLISH"
              : null;
  return { canPublish: blocker === null, blocker, reason: blocker && REASONS[blocker](lists), ...lists };
}
