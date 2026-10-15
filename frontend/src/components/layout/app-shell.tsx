"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { AuthGate } from "@/modules/auth/components/auth-gate";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  if (pathname === "/login") return <>{children}</>;

  return (
    <AuthGate>
      <div className="min-h-screen bg-[#F8FAFC] flex">
        {/* Desktop Sidebar with rail collapse (>= md) */}
        <div className="hidden md:flex">
          <Sidebar collapsed={collapsed} />
        </div>

        {/* Mobile Navigation Drawer Sheet (< md) */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="p-0 w-[280px] max-w-[85vw] border-r bg-white">
            <Sidebar
              collapsed={false}
              isMobile
              onNavigate={() => setMobileOpen(false)}
              className="w-full h-full border-r-0"
            />
          </SheetContent>
        </Sheet>

        {/* Main Content Workspace */}
        <div className="flex-1 flex flex-col min-w-0">
          <Header
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed(!collapsed)}
            onOpenMobileNav={() => setMobileOpen(true)}
          />
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
