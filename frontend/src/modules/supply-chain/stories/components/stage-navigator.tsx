"use client";

import React, { useState } from "react";
import { SupplyChainStageItem } from "@/lib/mocks/types";
import { ContentStatusTag } from "@/components/common/content-status-tag";
import { Layers, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StageNavigatorProps {
  stages: SupplyChainStageItem[];
  selectedStageId: string;
  onSelectStage: (id: string) => void;
  activeLocale: "vi" | "en";
  hasUnsavedChanges?: boolean;
}

export function StageNavigator({
  stages,
  selectedStageId,
  onSelectStage,
  activeLocale,
  hasUnsavedChanges = false,
}: StageNavigatorProps) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const currentStage = stages.find((s) => s.id === selectedStageId) ?? stages[0];
  const currentTitle = activeLocale === "vi" ? currentStage?.titleVi : currentStage?.titleEn || currentStage?.titleVi;

  return (
    <div className="w-full flex flex-col h-full bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* Header with mobile toggle */}
      <button
        type="button"
        onClick={() => setIsMobileExpanded(!isMobileExpanded)}
        className="w-full p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 hover:bg-slate-100/50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#0066CC]" />
          <h2 className="text-xs font-bold text-[#113E67] uppercase tracking-wider">
            Hành trình ({stages.length} công đoạn)
          </h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-400 hidden sm:inline">
            Quy trình chuẩn
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-slate-500 transition-transform lg:hidden",
              isMobileExpanded ? "rotate-180" : ""
            )}
          />
        </div>
      </button>

      {/* Mobile Selected Summary Bar (Visible only on mobile when collapsed) */}
      {!isMobileExpanded && (
        <div className="lg:hidden p-3 bg-sky-50/50 border-b border-sky-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="h-5 w-5 rounded-full bg-[#0066CC] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {currentStage?.stageNumber}
            </span>
            <span className="font-semibold text-[#113E67] truncate">{currentTitle}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileExpanded(true)}
            className="text-[11px] font-bold text-[#0066CC] hover:underline shrink-0"
          >
            Đổi công đoạn ▾
          </button>
        </div>
      )}

      {/* Timeline List (Always visible on desktop, toggleable on mobile) */}
      <nav
        className={cn(
          "flex-1 overflow-y-auto p-3 space-y-2",
          isMobileExpanded ? "block" : "hidden lg:block"
        )}
        aria-label="Danh sách các công đoạn"
      >
        {stages.map((stage, index) => {
          const isSelected = stage.id === selectedStageId;
          const stageTitle = activeLocale === "vi" ? stage.titleVi : stage.titleEn || stage.titleVi;
          // Strip prefix numbers if already in title (e.g. "1. Vùng Nguyên Liệu..." -> "Vùng Nguyên Liệu...")
          const cleanTitle = stageTitle.replace(/^\d+[\.\:\s\-]+/, "").trim();
          const isLast = index === stages.length - 1;

          return (
            <div key={stage.id} className="relative">
              {/* Vertical connector line between stages */}
              {!isLast && (
                <div
                  className="absolute left-[22px] top-[40px] bottom-[-8px] w-[2px] bg-slate-200 pointer-events-none z-0"
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                onClick={() => {
                  onSelectStage(stage.id);
                  setIsMobileExpanded(false);
                }}
                className={cn(
                  "relative z-10 w-full text-left p-3 rounded-xl transition-all flex items-start gap-3 border",
                  isSelected
                    ? "bg-[#F0F7FF] border-[#0066CC]/40 shadow-xs ring-1 ring-[#0066CC]/20"
                    : "bg-white border-transparent hover:bg-slate-50 hover:border-slate-200"
                )}
              >
                {/* Numbered node circle */}
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors shadow-2xs",
                    isSelected
                      ? "bg-[#0066CC] text-white ring-2 ring-[#0066CC]/20"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  )}
                >
                  {String(stage.stageNumber).padStart(2, "0")}
                </div>

                {/* Stage Info */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={cn(
                        "text-xs sm:text-sm font-bold leading-snug line-clamp-2",
                        isSelected ? "text-[#0066CC]" : "text-slate-800"
                      )}
                    >
                      {cleanTitle}
                    </h3>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform mt-0.5",
                        isSelected ? "text-[#0066CC] translate-x-0.5" : "text-slate-300"
                      )}
                    />
                  </div>

                  {/* Subtitle / summary */}
                  {stage.subtitle && (
                    <p className="text-[11px] text-slate-500 font-normal line-clamp-2 mt-1 leading-relaxed">
                      {stage.subtitle}
                    </p>
                  )}

                  {/* Status Indicator */}
                  <div className="mt-2 flex items-center justify-between">
                    <ContentStatusTag status={stage.status} />
                    {isSelected && hasUnsavedChanges && (
                      <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Chưa lưu
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </div>
          );
        })}
      </nav>

      {/* Navigator Footer Hint */}
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 text-center">
        <span>Chọn công đoạn để chỉnh sửa chi tiết</span>
      </div>
    </div>
  );
}
