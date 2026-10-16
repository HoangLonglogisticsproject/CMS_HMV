"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { onPermissionDenied, onSessionExpired, setCsrfToken } from "@/lib/api/client";
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
  const { data: session, isPending, isError, isFetching, error, refetch } = useSession();
  // Last signed-in user in this tab (derived while rendering; React's "store info from previous renders" pattern).
  const [lastUser, setLastUser] = useState<{ id: string; email: string } | null>(null);
  // Another account took over this tab: re-login as someone else in the dialog below, or a sign-in in another tab
  // (the session cookie is per browser). Nothing of the previous user's screen may stay mounted, readable or
  // submittable under the new identity.
  const [identityChanged, setIdentityChanged] = useState(false);
  if (session && lastUser?.id !== session.user.id) {
    if (lastUser) setIdentityChanged(true);
    setLastUser({ id: session.user.id, email: session.user.email });
  }
  // Signed in earlier in this tab and did not sign out: the session expired or was revoked.
  const expired = !session && Boolean(lastUser) && !authState.signedOut;

  useEffect(() => {
    // Only a full reload reliably drops the previous account's drafts, editor state, query cache and CSRF token.
    if (identityChanged) window.location.replace("/");
  }, [identityChanged]);

  useEffect(() => {
    const offExpired = onSessionExpired(() => {
      setCsrfToken(null);
      queryClient.setQueryData(queryKeys.auth.session, null);
    });
    // A 403 means the permissions on screen are stale: reload them (the server already refused the request).
    const offDenied = onPermissionDenied(() => void queryClient.invalidateQueries({ queryKey: queryKeys.auth.session }));
    return () => {
      offExpired();
      offDenied();
    };
  }, [queryClient]);

  useEffect(() => {
    if (session === null && !expired) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [session, expired, pathname, router]);

  if (identityChanged) return <Centered>Đang chuyển sang tài khoản khác...</Centered>;
  if (isPending) return <Centered>Đang kiểm tra phiên đăng nhập...</Centered>;
  // Only a session that never loaded may block the app. When a background refetch fails, TanStack keeps the last
  // session and sets `error`: the app, open editors and unsaved work stay mounted and a banner offers a retry.
  // (A 401 is not an error here: the query resolves to null and the re-login dialog below takes over.)
  if (isError && session === undefined) {
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
      {isError && (
        <div
          role="alert"
          data-testid="session-connection-error"
          className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 shadow-lg"
        >
          <span>{errorMessage(error)} Nội dung đang soạn vẫn được giữ nguyên.</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={isFetching} onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      )}
      {/* Signed out: the app stays mounted (drafts survive) but must not be readable on a shared screen. The regular
          dialog backdrop is translucent and drawers live in their own portals, so cover the whole viewport. */}
      {expired &&
        createPortal(
          <div data-testid="reauth-privacy-cover" aria-hidden className="fixed inset-0 z-50 bg-[#F8FAFC]" />,
          document.body,
        )}
      <Dialog open={expired}>
        <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
          <DialogTitle className="text-sm font-bold text-[#123D68]">Phiên đăng nhập đã hết hạn</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Đăng nhập lại để tiếp tục. Nội dung đang soạn được giữ lại (đang ẩn) và hiện lại khi bạn đăng nhập đúng
            tài khoản này. Đăng nhập bằng tài khoản khác sẽ huỷ nội dung chưa lưu.
          </DialogDescription>
          {/* A different account is handled above (identityChanged): unmount, then a full reload. */}
          <LoginForm keepCacheForUserId={lastUser?.id} defaultEmail={lastUser?.email} />
        </DialogContent>
      </Dialog>
    </>
  );
}
