import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call, isApiError, setCsrfToken, type Schemas } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type Session = Schemas["SessionResponse"];
export type Permission = Schemas["Permission"];

/** Distinguishes "the user signed out" from "the session expired" (both leave the session null). */
export const authState = { signedOut: false };

/** Current session, or `null` when signed out. Also (re)bootstraps the in-memory CSRF token. */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: async ({ signal }): Promise<Session | null> => {
      try {
        const session = await call(api.GET("/api/v1/auth/session", { signal }));
        setCsrfToken(session.csrfToken);
        return session;
      } catch (err) {
        if (isApiError(err, "UNAUTHENTICATED")) {
          setCsrfToken(null);
          return null;
        }
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** `can("article:publish")`. UX only: the API enforces every permission itself. */
export function useCan() {
  const { data } = useSession();
  return (permission: Permission) => Boolean(data?.user.permissions.includes(permission));
}

/** `keepCacheForUserId`: re-login after expiry by the same user keeps cached data (and open drafts' context). */
export function useLogin(keepCacheForUserId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => call(api.POST("/api/v1/auth/login", { body })),
    onSuccess: (session) => {
      authState.signedOut = false;
      if (session.user.id !== keepCacheForUserId) queryClient.clear(); // never show another user's cached data
      setCsrfToken(session.csrfToken);
      queryClient.setQueryData(queryKeys.auth.session, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    onMutate: () => {
      authState.signedOut = true;
    },
    mutationFn: () => call(api.POST("/api/v1/auth/logout")),
    // Clear locally even if the request fails (e.g. session already expired).
    onSettled: () => {
      setCsrfToken(null);
      queryClient.clear();
      queryClient.setQueryData(queryKeys.auth.session, null);
    },
  });
}
