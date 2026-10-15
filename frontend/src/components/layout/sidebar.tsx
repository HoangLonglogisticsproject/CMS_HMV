"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCan, useSession } from "@/modules/auth/queries/use-session";
import { ACTIVE_NAVIGATION_GROUPS } from "@/config/navigation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SidebarProps {
  collapsed?: boolean;
  onNavigate?: () => void;
  className?: string;
  isMobile?: boolean;
}

export function Sidebar({
  collapsed = false,
  onNavigate,
  className,
  isMobile = false,
}: SidebarProps) {
  const pathname = usePathname();
  const can = useCan();
  const { data: session } = useSession();

  // Manage group collapse state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    workspace: true,
    "supply-chain": true,
    "website-content": true,
    "publishing-quality": true,
    system: true,
  });

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // Determine active route state (exact match for home, prefix match for subroutes)
  const isItemActive = (itemHref: string) => {
    if (itemHref === "/") {
      return pathname === "/";
    }
    return pathname === itemHref || pathname.startsWith(`${itemHref}/`);
  };

  const isRail = collapsed && !isMobile;

  return (
    <TooltipProvider delayDuration={150}>
      <aside
        className={cn(
          "bg-white border-r border-slate-200/90 flex flex-col shrink-0 transition-all duration-200 select-none z-30",
          !isMobile && "sticky top-0 h-screen",
          isRail ? "w-[68px]" : "w-[264px]",
          className
        )}
      >
        {/* Brand Area */}
        <div
          className={cn(
            "h-16 flex items-center border-b border-slate-100 px-4 gap-3 bg-white",
            isRail ? "justify-center px-2" : "justify-start"
          )}
        >
          <Link
            href="/"
            onClick={onNavigate}
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] rounded-lg p-1"
            title="HMV Global Content Workspace"
          >
            <div className="h-8 w-8 flex items-center justify-center shrink-0">
              <Image
                src="/brand/logohmv.png"
                alt="HMV Global Logo"
                width={34}
                height={34}
                className="h-8 w-auto max-w-[34px] object-contain"
                priority
              />
            </div>
            {!isRail && (
              <div className="overflow-hidden min-w-0">
                <div className="font-bold text-[13px] text-[#113E67] tracking-tight truncate leading-tight group-hover:text-[#0066CC] transition-colors">
                  HMV Global
                </div>
                <div className="text-[11px] font-medium text-slate-400 truncate leading-tight mt-0.5">
                  Content Workspace
                </div>
              </div>
            )}
          </Link>
        </div>

        {/* Navigation Groups */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-3 space-y-4",
            isRail ? "px-2" : "px-3"
          )}
          aria-label="Sidebar Navigation"
        >
          {ACTIVE_NAVIGATION_GROUPS.map((group) => {
            const isOpen = openGroups[group.id] ?? true;
            const visibleItems = group.items.filter(
              (item) => !item.permission || can(item.permission)
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.id} className="space-y-1">
                {/* Group Header (only in expanded view) */}
                {!isRail && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wider rounded-md focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0066CC]"
                  >
                    <span>{group.label}</span>
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-slate-400" />
                    )}
                  </button>
                )}

                {/* Group Items */}
                {(isOpen || isRail) && (
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const active = isItemActive(item.href);
                      const Icon = item.icon;

                      // When collapsed (rail), render with Tooltip
                      if (isRail) {
                        return (
                          <Tooltip key={item.id}>
                            <TooltipTrigger asChild>
                              <Link
                                href={item.href}
                                onClick={onNavigate}
                                aria-label={item.title}
                                className={cn(
                                  "h-10 w-full flex items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]",
                                  active
                                    ? "bg-[#E9F7FF] text-[#0066CC] shadow-2xs font-semibold"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                )}
                              >
                                <Icon
                                  className={cn(
                                    "h-[18px] w-[18px] shrink-0",
                                    active ? "text-[#0066CC]" : "text-slate-400 group-hover:text-slate-600"
                                  )}
                                />
                              </Link>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="font-medium text-xs">
                              {item.title}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }

                      // Expanded / Mobile Drawer rendering
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={onNavigate}
                          className={cn(
                            "h-10 flex items-center gap-3 px-3 rounded-lg text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]",
                            active
                              ? "bg-[#E9F7FF] text-[#0066CC] font-semibold shadow-2xs"
                              : "text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-[18px] w-[18px] shrink-0 transition-colors",
                              active ? "text-[#0066CC]" : "text-slate-400"
                            )}
                          />
                          <span className="truncate flex-1 text-[13px]">{item.title}</span>
                          {item.badge && (
                            <span className="text-[10px] bg-[#0066CC] text-white px-1.5 py-0.5 rounded font-semibold shrink-0">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer Info Area */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/60">
          <div
            className={cn(
              "flex items-center gap-2.5",
              isRail ? "justify-center" : "justify-start"
            )}
          >
            <div
              className="h-8 w-8 rounded-full bg-[#E9F7FF] border border-[#bae6fd] flex items-center justify-center text-xs font-bold text-[#0066CC] shrink-0 select-none shadow-2xs"
              title={session?.user.displayName ?? "User"}
            >
              {session?.user.displayName ? session.user.displayName.slice(0, 1).toUpperCase() : "?"}
            </div>
            {!isRail && (
              <div className="overflow-hidden min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate leading-tight">
                  {session?.user.displayName ?? "Phiên đã hết hạn"}
                </p>
                <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5 font-mono">
                  {session?.user.email ?? ""}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
