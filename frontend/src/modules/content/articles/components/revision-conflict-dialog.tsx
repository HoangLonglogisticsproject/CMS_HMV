"use client";

import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RevisionConflictDialogProps {
  open: boolean;
  busy: boolean;
  onApplyMine: () => void;
  onDiscardMine: () => void;
  onClose: () => void;
}

/** 409 REVISION_CONFLICT: someone saved first. Nothing is overwritten without the user choosing it. */
export function RevisionConflictDialog({ open, busy, onApplyMine, onDiscardMine, onClose }: RevisionConflictDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md space-y-3" data-testid="revision-conflict">
        <DialogTitle className="text-sm font-bold text-[#123D68]">Bài viết vừa được người khác lưu</DialogTitle>
        <DialogDescription className="text-xs text-slate-600">
          Trên máy chủ đã có một bản nháp mới hơn bản bạn đang sửa. Thay đổi của bạn vẫn còn nguyên trên màn hình; hệ
          thống không tự ghi đè.
        </DialogDescription>
        <ul className="list-disc pl-4 text-xs text-slate-600 space-y-1">
          <li>
            <strong>Áp dụng thay đổi của tôi</strong>: chỉ những trường bạn đã sửa được ghi lên bản mới nhất. Trường nào cả
            hai cùng sửa sẽ lấy nội dung của bạn.
          </li>
          <li>
            <strong>Tải bản mới nhất</strong>: bỏ thay đổi của bạn và xem bản trên máy chủ.
          </li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onClose} disabled={busy}>
            Tiếp tục chỉnh sửa
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-xs" onClick={onDiscardMine} disabled={busy}>
            Tải bản mới nhất
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-xs bg-[#087EC2] hover:bg-[#066ba8] text-white"
            onClick={onApplyMine}
            disabled={busy}
          >
            {busy ? "Đang lưu..." : "Áp dụng thay đổi của tôi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
