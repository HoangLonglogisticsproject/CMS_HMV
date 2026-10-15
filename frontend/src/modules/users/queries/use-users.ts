import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call, type Schemas } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type AdminUser = Schemas["AdminUserResponse"];
export type Role = Schemas["RoleResponse"];
export type SecurityEvent = Schemas["SecurityEventResponse"];

// Account administration (user:manage). The API enforces every rule; these hooks only call it.
export const useUsers = () =>
  useQuery({ queryKey: queryKeys.users.list, queryFn: ({ signal }) => call(api.GET("/api/v1/admin/users", { signal })) });

export const useRoles = () =>
  useQuery({
    queryKey: queryKeys.users.roles,
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/roles", { signal })),
    staleTime: 60 * 60_000,
  });

export const useSecurityEvents = () =>
  useQuery({
    queryKey: queryKeys.users.events,
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/security-events", { params: { query: { limit: 50 } }, signal })),
  });

/** Every write changes the list and adds security events. */
function useUserWrite<TVars, TResult>(mutationFn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.users.all }),
  });
}

export const useCreateUser = () =>
  useUserWrite((body: Schemas["CreateUserDto"]) => call(api.POST("/api/v1/admin/users", { body })));

export const useUpdateUser = () =>
  useUserWrite(({ id, body }: { id: string; body: Schemas["UpdateUserDto"] }) =>
    call(api.PATCH("/api/v1/admin/users/{id}", { params: { path: { id } }, body })),
  );

export const useSetUserPassword = () =>
  useUserWrite(({ id, newPassword }: { id: string; newPassword: string }) =>
    call(api.POST("/api/v1/admin/users/{id}/password", { params: { path: { id } }, body: { newPassword } })),
  );

export const useRevokeUserSessions = () =>
  useUserWrite((id: string) => call(api.POST("/api/v1/admin/users/{id}/sessions/revoke", { params: { path: { id } } })));
