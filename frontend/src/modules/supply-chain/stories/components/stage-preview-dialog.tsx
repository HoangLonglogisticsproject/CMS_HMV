"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Building2,
  TrendingUp,
  Monitor,
  Smartphone,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { CapabilityTier, PublicationStatus } from "@/lib/mocks/types";
import { ContentStatusTag } from "@/components/common/content-status-tag";

export interface StagePreviewData {
  stageNumber: number;
  titleVi: string;
  titleEn: string;
  subtitle: string;
  tier: CapabilityTier;
  status: PublicationStatus;
  keyCapability: string;
  descriptionVi: string;
  descriptionEn: string;
  imageUrl?: string;
}

interface StagePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  data: StagePreviewData;
  initialLocale?: "vi" | "en";
}

export function StagePreviewDialog({
  isOpen,
  onClose,
  data,
  initialLocale = "vi",
}: StagePreviewDialogProps) {
  const [locale, setLocale] = useState<"vi" | "en">(initialLocale);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");

  const title = locale === "vi" ? data.titleVi : data.titleEn || data.titleVi;
  const description = locale === "vi" ? data.descriptionVi : data.descriptionEn || data.descriptionVi;

  const getTierDisplay = (tier: CapabilityTier) => {
    switch (tier) {
      case "DIRECT_OPERATION":
        return {
          label: "HMV trực tiếp thực hiện",
          color: "bg-emerald-50 text-emerald-800 border-emerald-200",
          icon: CheckCircle2,
        };
      case "STRATEGIC_PARTNER":
        return {
          label: "Phối hợp với đối tác",
          color: "bg-sky-50 text-[#0066CC] border-sky-200",
          icon: Building2,
        };
      case "IN_DEVELOPMENT":
        return {
          label: "Đang phát triển",
          color: "bg-amber-50 text-amber-800 border-amber-200",
          icon: TrendingUp,
        };
    }
  };

  const tierInfo = getTierDisplay(data.tier);
  const TierIcon = tierInfo.icon;

  // Fallback representative image for each stage if not specified
  const stageImages: Record<number, string> = {
    1: "/brand/Login_background.png",
    2: "/brand/Login_background.png",
    3: "/brand/Login_background.png",
    4: "/brand/Login_background.png",
    5: "/brand/Login_background.png",
    6: "/brand/Login_background.png",
  };
  const heroImage = data.imageUrl || stageImages[data.stageNumber] || "/brand/Login_background.png";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 flex flex-col overflow-hidden bg-slate-50/50">
        {/* Preview Control Header */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-base font-bold text-[#113E67]">
                Xem trước công đoạn #{data.stageNumber}
              </DialogTitle>
              <Badge variant="outline" className="bg-[#EBF5FF] text-[#0066CC] border-[#bae6fd] text-[11px] font-semibold gap-1">
                <Sparkles className="h-3 w-3" />
                CMS Preview
              </Badge>
            </div>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">
              Mô phỏng bố cục hiển thị trên trang chủ và trang Chuỗi Cung Ứng công khai của HMV Global
            </DialogDescription>
          </div>

          {/* Switchers: Locale & Viewport */}
          <div className="flex items-center gap-2.5">
            {/* Viewport switch */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                className={`p-1.5 rounded-md text-xs flex items-center gap-1 transition-colors ${
                  viewport === "desktop"
                    ? "bg-white text-slate-800 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title="Màn hình máy tính (Desktop)"
              >
                <Monitor className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Desktop</span>
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                className={`p-1.5 rounded-md text-xs flex items-center gap-1 transition-colors ${
                  viewport === "mobile"
                    ? "bg-white text-slate-800 shadow-2xs font-semibold"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                title="Màn hình di động (Mobile)"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mobile</span>
              </button>
            </div>

            {/* Locale switch */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setLocale("vi")}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  locale === "vi"
                    ? "bg-[#0066CC] text-white font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLocale("en")}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                  locale === "en"
                    ? "bg-[#0066CC] text-white font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Stage Simulation Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex justify-center items-start">
          <div
            className={`transition-all duration-300 w-full ${
              viewport === "mobile"
                ? "max-w-[390px] border-4 border-slate-700 rounded-3xl shadow-xl overflow-hidden bg-white"
                : "max-w-2xl bg-white rounded-2xl border border-slate-200/90 shadow-md overflow-hidden"
            }`}
          >
            {/* Visual Hero Image */}
            <div className="relative w-full h-48 sm:h-56 bg-slate-100 overflow-hidden">
              <Image
                src={heroImage}
                alt={title}
                fill
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/20 to-transparent" />
              
              {/* Badge overlay on top of hero */}
              <div className="absolute top-4 left-4 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/95 text-[#113E67] shadow-sm backdrop-blur-xs">
                  Công đoạn {String(data.stageNumber).padStart(2, "0")}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border flex items-center gap-1 shadow-sm backdrop-blur-xs ${tierInfo.color}`}>
                  <TierIcon className="h-3 w-3" />
                  {tierInfo.label}
                </span>
              </div>

              {/* Status on top right */}
              <div className="absolute top-4 right-4">
                <ContentStatusTag status={data.status} />
              </div>

              {/* Title inside hero bottom */}
              <div className="absolute bottom-4 left-4 right-4 text-white">
                <h3 className="text-lg sm:text-xl font-black tracking-tight leading-snug drop-shadow-sm">
                  {title}
                </h3>
                {data.subtitle && (
                  <p className="text-xs sm:text-sm text-white/90 font-medium mt-1 drop-shadow-xs line-clamp-2">
                    {data.subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Story Card Body */}
            <div className="p-5 sm:p-6 space-y-4">
              {/* Key Capability Callout Box */}
              {data.keyCapability && (
                <div className="p-3.5 rounded-xl bg-[#F0F7FF] border border-[#D0E6FC] flex items-start gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#0066CC] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#0066CC]">
                      Năng lực &amp; Tiêu chuẩn cam kết
                    </div>
                    <div className="text-xs font-semibold text-[#113E67] mt-0.5 leading-relaxed">
                      {data.keyCapability}
                    </div>
                  </div>
                </div>
              )}

              {/* Narrative Story Body */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Câu chuyện hành trình ({locale.toUpperCase()})
                </div>
                <div className="text-sm text-slate-700 leading-relaxed font-normal whitespace-pre-line bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                  {description || (
                    <span className="italic text-slate-400">
                      Chưa có nội dung chi tiết cho ngôn ngữ này.
                    </span>
                  )}
                </div>
              </div>

              {/* Public Website Context Note */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>HMV Global Agricultural Supply Chain Story</span>
                <span className="flex items-center gap-1 font-semibold text-[#0066CC]">
                  Xem trên website <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-xs text-slate-500 italic">
            * Xem trước mô phỏng cấu trúc nội dung. Renderer thực tế trên Public Website có thể tinh chỉnh theo thiết kế trang.
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Đóng xem trước
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
