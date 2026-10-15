"use client";

import React from "react";
import Image from "next/image";
import { Sprout, Package, Ship, Globe } from "lucide-react";

export function LoginBrandPanel() {
  return (
    <div className="w-full h-full flex flex-col justify-between select-none">
      {/* Top Header & Optical Center Content */}
      <div>
        {/* 1. TOP BRAND HEADER: Hero Logo (~330px) + Vertical Separator + Typography Metadata */}
        <div id="left-brand-header" className="flex items-center gap-4 xl:gap-5">
          <div className="relative shrink-0 w-[280px] xl:w-[310px] [@media(min-height:935px)]:w-[335px] h-[125px] xl:h-[145px] [@media(min-height:935px)]:h-[160px]">
            <Image
              src="/brand/logohmv.png"
              alt="HMV Global Connecting the world"
              fill
              priority
              sizes="(max-width: 1280px) 280px, 335px"
              className="object-contain object-left"
            />
          </div>

          {/* Subtle Vertical Divider */}
          <div className="h-10 xl:h-12 w-px bg-slate-400/60 shrink-0" aria-hidden="true" />

          {/* Brand Metadata Typography */}
          <div id="metadata-label" className="flex flex-col text-[11px] xl:text-[12px] font-bold text-[#113E67]/90 tracking-[0.16em] uppercase leading-tight">
            <span>Internal Workspace</span>
            <span className="text-[#0066CC]">Enterprise CMS</span>
          </div>
        </div>

        {/* 2. HEADLINE & INDUSTRY CONTEXT: Positioned in optical center */}
        <div className="mt-8 xl:mt-16 [@media(min-height:935px)]:mt-[112px] space-y-4 xl:space-y-6 [@media(min-height:935px)]:space-y-7 max-w-2xl">
          {/* Main Headline */}
          <div className="space-y-2.5 xl:space-y-4">
            <h1
              id="main-headline"
              className="text-4xl xl:text-5xl [@media(min-height:935px)]:text-[64px] 2xl:[@media(min-height:935px)]:text-[70px] font-black text-[#0F2D4A] tracking-tight leading-[1.08] [@media(min-height:935px)]:leading-[1.04]"
            >
              HMV Global <br />
              <span className="text-[#0066CC]">Content Studio</span>
            </h1>
            <p id="supporting-description" className="text-base xl:text-[18px] [@media(min-height:935px)]:text-[19px] text-[#1E3A5F]/90 font-medium leading-relaxed max-w-[540px]">
              Nền tảng quản trị nội dung, EcoNews và hệ sinh thái chuỗi cung ứng HMV Global.
            </p>
          </div>

          {/* Industry Context Row: Exactly 4 columns in one row matching reference */}
          <div
            id="industry-context-row"
            className="flex items-center justify-between gap-2.5 xl:gap-3 pt-3 xl:pt-5 [@media(min-height:935px)]:pt-4 max-w-[620px]"
          >
            {/* Item 1: Nông nghiệp bền vững */}
            <div className="flex items-center gap-2 xl:gap-2.5">
              <Sprout className="h-7 w-7 xl:h-8 xl:w-8 text-[#0066CC] shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <div className="flex flex-col text-[12px] xl:text-[13px] font-bold text-[#113E67] leading-tight">
                <span>Nông nghiệp</span>
                <span>bền vững</span>
              </div>
            </div>

            <div className="h-7 xl:h-8 w-px bg-slate-300/70 shrink-0" aria-hidden="true" />

            {/* Item 2: Thương mại quốc tế */}
            <div className="flex items-center gap-2 xl:gap-2.5">
              <Package className="h-7 w-7 xl:h-8 xl:w-8 text-[#0066CC] shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <div className="flex flex-col text-[12px] xl:text-[13px] font-bold text-[#113E67] leading-tight">
                <span>Thương mại</span>
                <span>quốc tế</span>
              </div>
            </div>

            <div className="h-7 xl:h-8 w-px bg-slate-300/70 shrink-0" aria-hidden="true" />

            {/* Item 3: Logistics toàn cầu */}
            <div className="flex items-center gap-2 xl:gap-2.5">
              <Ship className="h-7 w-7 xl:h-8 xl:w-8 text-[#0066CC] shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <div className="flex flex-col text-[12px] xl:text-[13px] font-bold text-[#113E67] leading-tight">
                <span>Logistics</span>
                <span>toàn cầu</span>
              </div>
            </div>

            <div className="h-7 xl:h-8 w-px bg-slate-300/70 shrink-0" aria-hidden="true" />

            {/* Item 4: Kết nối thị trường */}
            <div className="flex items-center gap-2 xl:gap-2.5">
              <Globe className="h-7 w-7 xl:h-8 xl:w-8 text-[#0066CC] shrink-0" strokeWidth={1.5} aria-hidden="true" />
              <div className="flex flex-col text-[12px] xl:text-[13px] font-bold text-[#113E67] leading-tight">
                <span>Kết nối</span>
                <span>thị trường</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. EDITORIAL FOOTER: Anchored at bottom of left panel */}
      <div id="editorial-footer" className="pt-2 pb-2 xl:pb-3 select-none">
        <div className="flex items-center gap-2 xl:gap-3 text-[11px] font-semibold tracking-[0.2em] uppercase text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
          <span className="w-5 xl:w-6 h-[2px] bg-white inline-block" aria-hidden="true" />
          <span>Global Supply Chain</span>
          <span className="text-white/60">|</span>
          <span>Sustainable Agriculture</span>
          <span className="text-white/60">|</span>
          <span>A Brighter Tomorrow</span>
        </div>
      </div>
    </div>
  );
}
