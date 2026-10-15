"use client";

import React, { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "../queries/use-session";
import { LoginScreen } from "./login-screen";

/** Only same-app paths are accepted as `?next=` (prevents open redirects). */
const safeNext = (next: string | null) =>
  next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const reason = params.get("reason");
  const { data: session } = useSession();

  useEffect(() => {
    if (session) {
      router.replace(next);
    }
  }, [session, next, router]);

  return (
    <LoginScreen
      reason={reason}
      onSuccess={() => {
        router.replace(next);
      }}
    />
  );
}
