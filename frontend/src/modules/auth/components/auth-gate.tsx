"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { onSessionExpired, setCsrfToken } from "@/lib/api/client";
import { errorMessage } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/query-keys";
import { authState, useSession } from "../queries/use-session";
import { LoginForm } from "./login-form";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-xs text-slate-500">{children}</div>;
}

/**
 * Protects every admin route. A fresh visit without a session goes to /login. A session that expires
 * mid-work keeps the screen mounted (unsaved drafts survive) and asks to sign in again in place.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: session, isPending, isError, error, refetch } = useSession();
  // Last signed-in user in this tab (derived while rendering; React's "store info from previous renders" pattern).
  const [lastUser, setLastUser] = useState<{ id: string; email: string } | null>(null);
  if (session && lastUser?.id !== session.user.id) setLastUser({ id: session.user.id, email: session.user.email });
  // Signed in earlier in this tab and did not sign out: the session expired or was revoked.
  const expired = !session && Boolean(lastUser) && !authState.signedOut;

  useEffect(
    () =>
      onSessionExpired(() => {
        setCsrfToken(null);
        queryClient.setQueryData(queryKeys.auth.session, null);
      }),
    [queryClient],
  );

  useEffect(() => {
    if (session === null && !expired) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [session, expired, pathname, router]);

  if (isPending) return <Centered>Đang kiểm tra phiên đăng nhập...</Centered>;
  if (isError) {
    return (
      <Centered>
        <div className="space-y-3 text-center">
          <p className="text-rose-700">{errorMessage(error)}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      </Centered>
    );
  }
  if (!session && !expired) return <Centered>Đang chuyển tới trang đăng nhập...</Centered>;

  return (
    <>
      {children}
      <Dialog open={expired}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogTitle className="text-sm font-bold text-[#123D68]">Phiên đăng nhập đã hết hạn</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Đăng nhập lại để tiếp tục. Nội dung bạn đang soạn vẫn được giữ nguyên trên màn hình.
          </DialogDescription>
          <LoginForm
            keepCacheForUserId={lastUser?.id}
            defaultEmail={lastUser?.email}
            onSuccess={(s) => {
              if (s.user.id !== lastUser?.id) router.replace("/");
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
