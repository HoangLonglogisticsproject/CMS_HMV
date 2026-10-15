"use client";

import React, { useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ExternalLink,
  Menu,
  ChevronRight,
  ChevronDown,
  Shield,
  Search,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useSession } from "@/modules/auth/queries/use-session";
import { ChangePasswordDialog } from "@/modules/auth/components/change-password-dialog";

/** Shown instead of any identity while the session is gone (AuthGate keeps the screen for re-login). */
const EXPIRED = "Phiên đã hết hạn";

/** "Nguyễn Hoàng Long" → "NL", "Quản trị viên" → "QV" */
export function initials(name = "") {
  const letters = name
    .split(/\s+/)
    .map((w) => w.match(/\p{L}/u)?.[0])
    .filter((c): c is string => Boolean(c));
  return (letters.length > 1 ? letters[0] + letters[letters.length - 1] : (letters[0] ?? "?")).toUpperCase();
}

interface HeaderProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobileNav?: () => void;
}

export function Header({ collapsed, onToggleCollapse, onOpenMobileNav }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const logout = useLogout();
  const [changingPassword, setChangingPassword] = useState(false);

  // Compute breadcrumb / page context from pathname
  const pageBreadcrumbs = useMemo(() => {
    if (pathname === "/") {
      return [{ title: "Tổng quan", href: "/" }];
    }
    if (pathname.startsWith("/supply-chain/stages")) {
      return [
        { title: "Chuỗi cung ứng", href: "/supply-chain/stages" },
        { title: "Hành trình chuỗi cung ứng", href: "/supply-chain/stages" },
      ];
    }
    if (pathname.startsWith("/supply-chain/commodities")) {
      return [
        { title: "Chuỗi cung ứng", href: "/supply-chain/commodities" },
        { title: "Nông sản & sản phẩm", href: "/supply-chain/commodities" },
      ];
    }
    if (pathname.startsWith("/content/pages")) {
      const isSub = pathname !== "/content/pages";
      return [
        { title: "Nội dung website", href: "/content/pages" },
        { title: "Trang website", href: "/content/pages" },
        ...(isSub ? [{ title: "Biên tập", href: pathname }] : []),
      ];
    }
    if (pathname.startsWith("/content/articles")) {
      const isSub = pathname !== "/content/articles";
      return [
        { title: "Nội dung website", href: "/content/articles" },
        { title: "EcoNews", href: "/content/articles" },
        ...(isSub ? [{ title: "Biên tập", href: pathname }] : []),
      ];
    }
    if (pathname.startsWith("/content/media")) {
      return [
        { title: "Nội dung website", href: "/content/media" },
        { title: "Thư viện media", href: "/content/media" },
      ];
    }
    return [{ title: "Workspace", href: "/" }];
  }, [pathname]);

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Mobile hamburger + Desktop collapse rail toggle + Page Context */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile drawer toggle (<md) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenMobileNav}
          className="h-8 w-8 text-slate-500 hover:text-slate-700 md:hidden shrink-0"
          title="Mở thanh điều hướng"
          aria-label="Mở thanh điều hướng"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Desktop rail collapse toggle (>=md) */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 text-slate-500 hover:text-slate-700 hidden md:inline-flex shrink-0"
          title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>

        {/* Contextual Breadcrumb / Page Path */}
        <nav aria-label="Vị trí hiện tại" className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 truncate">
          {pageBreadcrumbs.map((crumb, idx) => {
            const isLast = idx === pageBreadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.href + idx}>
                {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-300 shrink-0" />}
                {isLast ? (
                  <span className="font-semibold text-slate-800 truncate">{crumb.title}</span>
                ) : (
                  <Link href={crumb.href} className="hover:text-slate-800 transition-colors truncate">
                    {crumb.title}
                  </Link>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      </div>

      {/* Right: Search, Public Website Preview Link & Enterprise User Account Menu */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {/* Subtle quick search indicator (hidden on small viewports) */}
        <div className="relative w-48 lg:w-60 hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm nội dung..."
            className="w-full h-8 pl-8 pr-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-[#0066CC] focus:ring-1 focus:ring-[#0066CC] transition-colors"
          />
        </div>

        {/* Website Preview Link (Direct external tab with security rels, no dummy alerts) */}
        <Button
          variant="outline"
          size="sm"
          asChild
          className="h-8 text-xs gap-1.5 text-slate-600 hover:text-[#0066CC] hover:border-[#0066CC]/30 font-medium"
        >
          <a
            href="https://hmvglobal.vn"
            target="_blank"
            rel="noopener noreferrer"
            title="Xem trước website công khai trong tab mới"
          >
            <Globe className="h-3.5 w-3.5 text-slate-400" />
            <span className="hidden sm:inline">Website</span>
            <ExternalLink className="h-3 w-3 text-slate-400" />
          </a>
        </Button>

        {/* Enterprise Account Menu (Single logout mechanism) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 pl-2.5 sm:pl-3 border-l border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] rounded-lg py-1 px-1.5 sm:px-2 hover:bg-slate-50 transition-colors cursor-pointer"
              aria-label="Tài khoản người dùng"
            >
              <div className="h-7 w-7 rounded-full bg-[#0066CC] text-white flex items-center justify-center text-xs font-bold shadow-2xs shrink-0 select-none">
                {initials(session?.user.displayName ?? "")}
              </div>
              <div className="hidden sm:flex flex-col text-left max-w-[130px] lg:max-w-[160px]">
                <span className="text-xs font-semibold text-slate-700 truncate leading-tight">
                  {session?.user.displayName ?? EXPIRED}
                </span>
                <span className="text-[10px] text-slate-400 truncate leading-tight font-mono mt-0.5">
                  {session?.user.roles[0] ?? ""}
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 hidden sm:block shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 sm:w-64 p-1.5">
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-900 leading-tight">
                {session?.user.displayName ?? EXPIRED}
              </p>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">
                {session?.user.email ?? ""}
              </p>
              {session && session.user.roles.length > 0 && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] bg-sky-50 text-[#0066CC] border-[#bae6fd] font-semibold gap-1 py-0.5">
                    <Shield className="h-3 w-3" />
                    <span>{session.user.roles.join(", ")}</span>
                  </Badge>
                </div>
              )}
            </div>

            <div className="p-1">
              {session && (
                <DropdownMenuItem
                  className="text-xs text-slate-700 cursor-pointer gap-2 py-2 font-medium rounded-md"
                  onSelect={() => setChangingPassword(true)}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Đổi mật khẩu</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-xs text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer gap-2 py-2 font-medium rounded-md"
                disabled={logout.isPending}
                onClick={() => logout.mutate(undefined, { onSettled: () => router.replace("/login") })}
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Đăng xuất</span>
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
      </div>
    </header>
  );
}
