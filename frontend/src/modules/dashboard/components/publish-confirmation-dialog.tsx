"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileCheck2, Send, RefreshCw, AlertCircle } from "lucide-react";
import type { Schemas } from "@/lib/api/client";

type ArticleDetail = Schemas["ArticleDetailResponse"];

interface PublishConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  article: ArticleDetail | undefined;
  onConfirm: () => void;
  isPending: boolean;
}

export function PublishConfirmationDialog({
  isOpen,
  onClose,
  article,
  onConfirm,
  isPending,
}: PublishConfirmationDialogProps) {
  if (!article) return null;

  const approvedLocales = article.translations
    .filter((t) => t.reviewStatus === "APPROVED")
    .map((t) => t.locale.toUpperCase());

  const unapprovedLocales = article.translations
    .filter((t) => t.reviewStatus !== "APPROVED")
    .map((t) => t.locale.toUpperCase());

  const displayTitle =
    article.translations.find((t) => t.reviewStatus === "APPROVED")?.title ||
    article.translations[0]?.title ||
    `Bài viết rev #${article.revision}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="max-w-md rounded-2xl p-5 border-slate-200">
        <DialogHeader className="space-y-2">
          <div className="h-10 w-10 rounded-full bg-sky-50 border border-sky-100 flex items-center justify-center text-[#0066CC] mb-1">
            <FileCheck2 className="h-5 w-5" />
          </div>
          <DialogTitle className="text-base font-bold text-[#113E67]">
            Xác nhận xuất bản bài viết lên website công khai?
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 leading-relaxed">
            Bài viết sẽ được đưa lên trang web chính thức của HMV Global cho độc giả và đối tác quốc tế.
            Mọi bản dịch đã được Ban Giám đốc phê duyệt sẽ hiển thị trực tuyến ngay lập tức.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5 my-2">
          <p className="font-semibold text-slate-800 line-clamp-2">
            {displayTitle}
          </p>
          <p className="text-slate-500">
            Phiên bản nháp: <strong>#{article.revision}</strong>
          </p>
          <p className="text-slate-600">
            Bản dịch phát hành công khai:{" "}
            <strong className="text-emerald-700">
              {approvedLocales.length > 0 ? approvedLocales.join(", ") : "Chưa có"}
            </strong>
          </p>
          {unapprovedLocales.length > 0 && (
            <p className="text-amber-700 text-[11px] flex items-center gap-1 pt-0.5">
              <AlertCircle className="h-3 w-3 shrink-0" />
              Bản dịch {unapprovedLocales.join(", ")} chưa duyệt sẽ tiếp tục ở chế độ bản nháp nội bộ.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPending}
            className="text-xs"
          >
            Hủy bỏ
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            data-testid="confirm-publish-btn"
            onClick={onConfirm}
            disabled={isPending}
            className="text-xs bg-[#0066CC] hover:bg-[#0052A3] text-white font-medium gap-1.5"
          >
            {isPending ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Đang xuất bản...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Xác nhận xuất bản</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
