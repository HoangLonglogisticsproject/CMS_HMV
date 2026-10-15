"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { KeyRound, LogOut, ShieldCheck, UserPlus, UserX, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorDetails, errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils/format";
import { useCan, useSession } from "@/modules/auth/queries/use-session";
import { newPasswordProblem } from "@/modules/auth/utils/password-policy";
import {
  type AdminUser,
  type Role,
  useCreateUser,
  useRevokeUserSessions,
  useRoles,
  useSecurityEvents,
  useSetUserPassword,
  useUpdateUser,
  useUsers,
} from "../queries/use-users";

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Đăng nhập",
  "auth.login_failed": "Đăng nhập thất bại",
  "auth.logout": "Đăng xuất",
  "auth.password_change": "Tự đổi mật khẩu",
  "auth.password_change_failed": "Đổi mật khẩu thất bại",
  "user.create": "Tạo tài khoản",
  "user.provision": "Provision bằng CLI (cũ)",
  "user.rename": "Đổi tên hiển thị",
  "user.roles_change": "Đổi vai trò",
  "user.deactivate": "Khoá tài khoản",
  "user.reactivate": "Mở khoá tài khoản",
  "user.password_reset": "Đặt lại mật khẩu",
  "user.sessions_revoke": "Đăng xuất mọi phiên",
};

const fail = (title: string) => (err: unknown) =>
  toast.error(title, { description: [errorMessage(err), ...errorDetails(err)].join(" · ") });

function RolePicker({ roles, value, onChange }: { roles: Role[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1.5">
      {roles.map((r) => (
        <label key={r.code} className="flex items-start gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={value.includes(r.code)}
            onChange={(e) => onChange(e.target.checked ? [...value, r.code] : value.filter((c) => c !== r.code))}
          />
          <span>
            <strong>{r.code}</strong> · {r.name}
            {r.description && <span className="block text-[11px] text-slate-500">{r.description}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function PasswordFields({ value, repeat, onChange }: { value: string; repeat: string; onChange: (v: string, r: string) => void }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="user-password" className="text-xs">Mật khẩu (ít nhất 12 ký tự)</Label>
        <Input id="user-password" type="password" autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value, repeat)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="user-password-repeat" className="text-xs">Nhập lại mật khẩu</Label>
        <Input id="user-password-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => onChange(value, e.target.value)} />
      </div>
    </>
  );
}

function CreateUserDialog({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const create = useCreateUser();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [password, setPassword] = useState({ value: "", repeat: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local =
      !email.trim() || !displayName.trim()
        ? "Nhập email và tên hiển thị."
        : selected.length === 0
          ? "Chọn ít nhất một vai trò."
          : newPasswordProblem(password.value, password.repeat);
    setProblem(local);
    if (local || create.isPending) return;
    create.mutate(
      { email: email.trim(), displayName: displayName.trim(), roles: selected, password: password.value },
      {
        onSuccess: (user) => {
          toast.success(`Đã tạo tài khoản ${user.email}`, {
            description: "Gửi mật khẩu ban đầu qua kênh riêng; nhân viên nên đổi mật khẩu sau lần đăng nhập đầu tiên.",
          });
          onClose();
        },
        onError: fail("Không thể tạo tài khoản"),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-sm font-bold text-[#123D68]">Thêm người dùng</DialogTitle>
        <DialogDescription className="text-xs text-slate-500">Email đã có tài khoản sẽ bị từ chối, không bao giờ ghi đè.</DialogDescription>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="user-email" className="text-xs">Email</Label>
            <Input id="user-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-name" className="text-xs">Tên hiển thị</Label>
            <Input id="user-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <RolePicker roles={roles} value={selected} onChange={setSelected} />
          <PasswordFields value={password.value} repeat={password.repeat} onChange={(value, repeat) => setPassword({ value, repeat })} />
          {problem && <p role="alert" className="text-xs text-rose-700">{problem}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onClose}>Huỷ</Button>
            <Button type="submit" size="sm" className="text-xs" disabled={create.isPending}>
              {create.isPending ? "Đang tạo..." : "Tạo tài khoản"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolesDialog({ user, roles, onClose }: { user: AdminUser; roles: Role[]; onClose: () => void }) {
  const update = useUpdateUser();
  const [selected, setSelected] = useState(user.roles);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-sm font-bold text-[#123D68]">Phân quyền: {user.email}</DialogTitle>
        <DialogDescription className="text-xs text-slate-500">Áp dụng ngay cho các phiên đang mở của người dùng này.</DialogDescription>
        <RolePicker roles={roles} value={selected} onChange={setSelected} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onClose}>Huỷ</Button>
          <Button
            type="button"
            size="sm"
            className="text-xs"
            disabled={update.isPending || selected.length === 0}
            onClick={() =>
              update.mutate(
                { id: user.id, body: { roles: selected } },
                {
                  onSuccess: () => {
                    toast.success("Đã cập nhật vai trò");
                    onClose();
                  },
                  onError: fail("Không thể đổi vai trò"),
                },
              )
            }
          >
            Lưu vai trò
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const reset = useSetUserPassword();
  const [password, setPassword] = useState({ value: "", repeat: "" });
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const local = newPasswordProblem(password.value, password.repeat);
    setProblem(local);
    if (local || reset.isPending) return;
    reset.mutate(
      { id: user.id, newPassword: password.value },
      {
        onSuccess: () => {
          toast.success(`Đã đặt lại mật khẩu cho ${user.email}`, { description: "Mọi phiên đăng nhập của tài khoản này đã bị đăng xuất." });
          onClose();
        },
        onError: fail("Không thể đặt lại mật khẩu"),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-sm font-bold text-[#123D68]">Đặt lại mật khẩu: {user.email}</DialogTitle>
        <DialogDescription className="text-xs text-slate-500">
          Vai trò và trạng thái không đổi. Mọi phiên đăng nhập của tài khoản sẽ bị đăng xuất.
        </DialogDescription>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <PasswordFields value={password.value} repeat={password.repeat} onChange={(value, repeat) => setPassword({ value, repeat })} />
          {problem && <p role="alert" className="text-xs text-rose-700">{problem}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={onClose}>Huỷ</Button>
            <Button type="submit" size="sm" className="text-xs" disabled={reset.isPending}>Đặt lại mật khẩu</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type Dialogs = { kind: "create" } | { kind: "roles" | "password"; user: AdminUser } | null;

/** Account administration for holders of `user:manage`. Functional first; presentation is Antigravity's to refine. */
export function UsersView() {
  const can = useCan();
  // The API refuses everything below without user:manage; checking first also avoids firing requests that would 403.
  if (!can("user:manage")) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600" data-testid="users-forbidden">
        Bạn không có quyền quản lý người dùng.
      </div>
    );
  }
  return <UsersAdmin />;
}

function UsersAdmin() {
  const { data: session } = useSession();
  const users = useUsers();
  const roles = useRoles();
  const events = useSecurityEvents();
  const update = useUpdateUser();
  const revoke = useRevokeUserSessions();
  const [dialog, setDialog] = useState<Dialogs>(null);

  const setActive = (user: AdminUser, isActive: boolean) => {
    if (!isActive && !confirm(`Khoá tài khoản ${user.email}? Mọi phiên đăng nhập sẽ bị đăng xuất và không thể đăng nhập lại.`)) return;
    update.mutate(
      { id: user.id, body: { isActive } },
      { onSuccess: () => toast.success(isActive ? "Đã mở khoá tài khoản" : "Đã khoá tài khoản"), onError: fail("Không thể đổi trạng thái") },
    );
  };
  const signOutEverywhere = (user: AdminUser) => {
    if (!confirm(`Đăng xuất mọi phiên của ${user.email}?`)) return;
    revoke.mutate(user.id, {
      onSuccess: (res) => toast.success(`Đã đăng xuất ${res.revoked} phiên`),
      onError: fail("Không thể thu hồi phiên"),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold text-[#113E67]">Người dùng & phân quyền</h1>
          <p className="text-xs text-slate-500 mt-1">Tạo tài khoản nhân viên, phân vai trò, khoá tài khoản, đặt lại mật khẩu và thu hồi phiên.</p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setDialog({ kind: "create" })} disabled={!roles.data}>
          <UserPlus className="h-3.5 w-3.5" /> Thêm người dùng
        </Button>
      </div>

      <Card className="border-slate-200 shadow-2xs">
        <CardContent className="p-0">
          {users.isPending ? (
            <p className="p-6 text-xs text-slate-500">Đang tải danh sách người dùng...</p>
          ) : users.isError ? (
            <div className="p-6 text-xs text-rose-700 space-y-2" role="alert">
              <p>{errorMessage(users.error)}</p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void users.refetch()}>Thử lại</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Người dùng</TableHead>
                  <TableHead className="text-xs">Vai trò</TableHead>
                  <TableHead className="text-xs">Trạng thái</TableHead>
                  <TableHead className="text-xs">Đăng nhập gần nhất</TableHead>
                  <TableHead className="text-xs">Phiên</TableHead>
                  <TableHead className="text-xs text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.items.map((user) => (
                  <TableRow key={user.id} data-testid={`user-row-${user.email}`}>
                    <TableCell className="text-xs">
                      <div className="font-semibold text-slate-800">{user.displayName}</div>
                      <div className="font-mono text-[11px] text-slate-500">{user.email}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((r) => (
                          <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {user.isActive ? <Badge variant="success">Đang hoạt động</Badge> : <Badge variant="destructive">Đã khoá</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{formatDateTime(user.lastLoginAt)}</TableCell>
                    <TableCell className="text-xs text-slate-600">{user.activeSessions}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setDialog({ kind: "roles", user })} disabled={!roles.data}>
                          <ShieldCheck className="h-3 w-3" /> Phân quyền
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setDialog({ kind: "password", user })}>
                          <KeyRound className="h-3 w-3" /> Đặt lại mật khẩu
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => signOutEverywhere(user)} disabled={revoke.isPending}>
                          <LogOut className="h-3 w-3" /> Đăng xuất mọi phiên
                        </Button>
                        {user.isActive ? (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 text-rose-700" onClick={() => setActive(user, false)} disabled={update.isPending}>
                            <UserX className="h-3 w-3" /> {user.id === session?.user.id ? "Khoá (chính bạn)" : "Khoá"}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setActive(user, true)} disabled={update.isPending}>
                            <UserCheck className="h-3 w-3" /> Mở khoá
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-2xs">
        <CardHeader className="py-3 px-4 border-b border-slate-100">
          <CardTitle className="text-xs font-bold text-[#123D68] uppercase tracking-wide">Sự kiện bảo mật gần đây</CardTitle>
        </CardHeader>
        <CardContent className="p-0" data-testid="security-events">
          {events.isError ? (
            <p className="p-4 text-xs text-rose-700" role="alert">{errorMessage(events.error)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Thời gian</TableHead>
                  <TableHead className="text-xs">Sự kiện</TableHead>
                  <TableHead className="text-xs">Người thực hiện</TableHead>
                  <TableHead className="text-xs">Tài khoản</TableHead>
                  <TableHead className="text-xs">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events.data?.items ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-[11px] text-slate-600">{formatDateTime(e.createdAt)}</TableCell>
                    <TableCell className="text-[11px]" title={e.action}>{ACTION_LABEL[e.action] ?? e.action}</TableCell>
                    <TableCell className="text-[11px] font-mono">{e.actorEmail ?? (e.metadata?.via === "cli" ? "CLI" : "—")}</TableCell>
                    <TableCell className="text-[11px] font-mono">{e.targetEmail ?? "—"}</TableCell>
                    <TableCell className="text-[11px] font-mono text-slate-500">{e.ipAddress ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialog?.kind === "create" && roles.data && <CreateUserDialog roles={roles.data.items} onClose={() => setDialog(null)} />}
      {dialog?.kind === "roles" && roles.data && <RolesDialog user={dialog.user} roles={roles.data.items} onClose={() => setDialog(null)} />}
      {dialog?.kind === "password" && <ResetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </div>
  );
}
