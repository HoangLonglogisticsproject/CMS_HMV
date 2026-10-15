"use client";

import React from "react";
import Image from "next/image";
import { Lock, AlertTriangle } from "lucide-react";
import { LoginBrandPanel } from "./login-brand-panel";
import { LoginForm } from "./login-form";
import { type Session } from "../queries/use-session";

export interface LoginScreenProps {
  reason?: string | null;
  onSuccess: (session: Session) => void;
}

export function LoginScreen({ reason, onSuccess }: LoginScreenProps) {
  return (
    <div className="relative min-h-screen xl:h-screen xl:max-h-screen w-full flex flex-col justify-between overflow-x-hidden">
      {/* 1. FULL VIEWPORT BACKGROUND (Official Login_background.png asset) */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <Image
          src="/brand/Login_background.png"
          alt="HMV Global Supply Chain & Logistics"
          fill
          priority
          quality={100}
          sizes="100vw"
          className="object-cover object-center select-none"
        />
        {/* Subtle, soft top wash: Preserves light sky while leaving seaport & crops 100% crisp */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-transparent pointer-events-none" />
      </div>

      {/* 2. FOREGROUND CONTENT WORKSPACE */}
      {/* Viewport-aware layout: Scales dynamically to viewport height while matching reference at 1672x941 */}
      <div className="relative z-10 w-full flex-1 xl:h-full flex flex-col xl:flex-row items-center xl:items-stretch justify-center xl:justify-between px-6 sm:px-12 lg:px-16 xl:pl-[80px] xl:pr-[64px] pt-4 sm:pt-6 xl:pt-5 [@media(min-height:935px)]:pt-[36px] pb-4 sm:pb-6 xl:pb-5 [@media(min-height:935px)]:pb-[45px] max-w-[1672px] mx-auto box-border">
        {/* LEFT BRAND CONTENT: Dynamic height flex column with bottom-anchored editorial footer */}
        <div className="hidden xl:flex w-full xl:w-[50%] h-full flex-col justify-between">
          <LoginBrandPanel />
        </div>

        {/* RIGHT FLOATING LOGIN CARD: Optical vertical centering on standard desktops, reference offset at 941px */}
        <div className="w-full xl:w-auto flex justify-center xl:justify-end items-center xl:items-center [@media(min-height:935px)]:items-start [@media(min-height:935px)]:pt-[46px]">
          <div
            id="right-login-card"
            className="w-full sm:w-[540px] xl:w-[570px] h-auto xl:h-[min(806px,calc(100dvh-110px))] min-h-[580px] [@media(min-height:935px)]:min-h-[806px] flex flex-col justify-between rounded-[28px] bg-white shadow-2xl shadow-sky-950/20 border border-slate-100/90 p-6 sm:p-8 xl:p-10 [@media(min-height:935px)]:p-12 box-border"
          >
            {/* Group A: Brand Identity */}
            <div className="flex flex-col items-center text-center pt-1 sm:pt-2">
              <div
                id="card-logo"
                className="relative mb-2 shrink-0 w-[210px] sm:w-[230px] [@media(min-height:935px)]:w-[250px] h-[85px] sm:h-[95px] [@media(min-height:935px)]:h-[105px]"
              >
                <Image
                  src="/brand/logohmv.png"
                  alt="HMV Global"
                  fill
                  priority
                  sizes="(max-width: 640px) 210px, 250px"
                  className="object-contain"
                />
              </div>
              <h2 id="card-welcome-heading" className="text-xl sm:text-2xl xl:text-[26px] [@media(min-height:935px)]:text-[28px] font-black text-[#113E67] tracking-tight">
                Chào mừng trở lại
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 font-normal">
                Đăng nhập để quản trị nội dung
              </p>
            </div>

            {/* Session Expired Banner (if redirected after expiry) */}
            {reason === "expired" && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 shadow-2xs animate-in fade-in"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
                <p className="font-medium leading-relaxed">
                  Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục phiên làm việc.
                </p>
              </div>
            )}

            {/* Group B: Core Authentication Form */}
            <div className="my-auto py-2 sm:py-3">
              <LoginForm onSuccess={onSuccess} />
            </div>

            {/* Group C: Security Notice */}
            <div className="pt-2">
              <div id="card-security-footer" className="rounded-2xl bg-[#F0F5FA] border border-[#E2EAF2] p-3.5 xl:p-4 text-center space-y-1 select-none">
                <p className="text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5">
                  <Lock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                  <span>Chỉ dành cho nhân sự được ủy quyền</span>
                </p>
                <p className="text-[11px] text-slate-500 font-medium">
                  Hệ thống CMS nội bộ của HMV Global
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
