"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorDetails, errorMessage } from "@/lib/api/errors";
import { useChangePassword } from "../queries/use-session";
import { newPasswordProblem } from "../utils/password-policy";

interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Signed-in user changes their own password (current password required). */
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    setCurrent("");
    setNext("");
    setRepeat("");
    setProblem(null);
    change.reset();
    onOpenChange(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local = newPasswordProblem(next, repeat) ?? (next === current ? "Mật khẩu mới phải khác mật khẩu hiện tại." : null);
    setProblem(local);
    if (local || change.isPending) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success("Đã đổi mật khẩu", { description: "Các phiên đăng nhập khác của bạn đã bị đăng xuất." });
          close();
        },
      },
    );
  };

  const error = problem ?? (change.error ? [errorMessage(change.error), ...errorDetails(change.error)].join(" · ") : null);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-sm font-bold text-[#123D68]">Đổi mật khẩu</DialogTitle>
        <DialogDescription className="text-xs text-slate-500">
          Phiên làm việc này được giữ nguyên; các phiên đăng nhập khác của bạn sẽ bị đăng xuất.
        </DialogDescription>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className="text-xs">Mật khẩu hiện tại</Label>
            <Input id="current-password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-xs">Mật khẩu mới (ít nhất 12 ký tự)</Label>
            <Input id="new-password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="repeat-password" className="text-xs">Nhập lại mật khẩu mới</Label>
            <Input id="repeat-password" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={close}>
              Huỷ
            </Button>
            <Button type="submit" size="sm" className="text-xs" disabled={change.isPending || !current || !next}>
              {change.isPending ? "Đang lưu..." : "Đổi mật khẩu"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
