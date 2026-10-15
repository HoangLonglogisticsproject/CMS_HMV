"use client";

import { UseFormRegister, UseFormSetValue } from "react-hook-form";
import { StageFormValues } from "../schemas/stage-form.schema";
import { CapabilityTier, PublicationStatus, SupplyChainStageItem } from "@/lib/mocks/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContentStatusTag } from "@/components/common/content-status-tag";
import {
  Building2,
  TrendingUp,
  CheckCircle2,
  PanelRightClose,
  PanelRightOpen,
  Eye,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StageInspectorProps {
  stage: SupplyChainStageItem;
  register: UseFormRegister<StageFormValues>;
  setValue: UseFormSetValue<StageFormValues>;
  currentTier: CapabilityTier;
  currentStatus: PublicationStatus;
  onOpenPreview: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function StageInspector({
  stage,
  register,
  setValue,
  currentTier,
  currentStatus,
  onOpenPreview,
  isCollapsed,
  onToggleCollapse,
}: StageInspectorProps) {

  const capabilityTiers: { value: CapabilityTier; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
    {
      value: "DIRECT_OPERATION",
      label: "HMV trực tiếp thực hiện",
      desc: "HMV sở hữu nguồn lực, vận hành và giám sát 100% tại hiện trường",
      icon: CheckCircle2,
    },
    {
      value: "STRATEGIC_PARTNER",
      label: "Phối hợp với đối tác",
      desc: "Liên kết chuỗi cùng các hợp tác xã và nhà máy chế biến đạt chuẩn",
      icon: Building2,
    },
    {
      value: "IN_DEVELOPMENT",
      label: "Đang phát triển",
      desc: "Năng lực đang trong giai đoạn thử nghiệm R&D hoặc mở rộng vùng trồng",
      icon: TrendingUp,
    },
  ];

  if (isCollapsed) {
    return (
      <div className="hidden lg:flex flex-col items-center py-4 bg-white rounded-2xl border border-slate-200/90 shadow-2xs w-12 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 text-slate-500 hover:text-slate-800"
          title="Mở thanh thông tin & Năng lực (Inspector)"
        >
          <PanelRightOpen className="h-4 w-4" />
        </Button>
        <span
          className="mt-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest select-none"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          Thông tin công đoạn
        </span>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-80 shrink-0 space-y-4">
      {/* 1. Main Inspector Card */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs bg-white overflow-hidden">
        {/* Header with collapse button */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="text-xs font-bold text-[#113E67] uppercase tracking-wider flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-[#0066CC]" />
              <span>Thông tin công đoạn #{stage.stageNumber}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Phân cấp năng lực &amp; quản trị</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="h-7 w-7 text-slate-400 hover:text-slate-700 hidden lg:inline-flex"
            title="Thu gọn thanh thông tin"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Capability Tier Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700">
              Phân cấp năng lực công bố
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Mô tả mức độ làm chủ công nghệ và chuỗi cung ứng của HMV tại công đoạn này.
            </p>

            <div className="space-y-2 pt-1">
              {capabilityTiers.map((tierOption) => {
                const isSelected = currentTier === tierOption.value;
                const Icon = tierOption.icon;
                return (
                  <button
                    type="button"
                    key={tierOption.value}
                    onClick={() => setValue("tier", tierOption.value, { shouldDirty: true })}
                    className={cn(
                      "w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5",
                      isSelected
                        ? "bg-[#F0F7FF] border-[#0066CC] ring-1 ring-[#0066CC]/20 text-[#0066CC]"
                        : "bg-white border-slate-200 hover:bg-slate-50 text-slate-700"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", isSelected ? "text-[#0066CC]" : "text-slate-400")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold leading-tight">{tierOption.label}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{tierOption.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Workflow Status Governance */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-700">
              Quy trình xuất bản
            </label>
            
            <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs text-slate-600 font-medium">Trạng thái:</span>
              <ContentStatusTag status={currentStatus} />
            </div>

            {/* Workflow state selector */}
            <div className="space-y-1">
              <label htmlFor="stage-status-select" className="block text-[11px] font-medium text-slate-500">
                Chuyển trạng thái quy trình:
              </label>
              <select
                id="stage-status-select"
                {...register("status")}
                className="w-full h-9 text-xs rounded-xl border border-slate-200 bg-white px-3 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-[#0066CC]"
              >
                <option value="DRAFT">Bản nháp (Đang biên tập)</option>
                <option value="IN_REVIEW">Gửi chờ phê duyệt (Ban giám đốc)</option>
                <option value="APPROVED">Đã phê duyệt nội dung</option>
                <option value="PUBLISHED">Xuất bản công khai trên Website</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                Lưu ý: Quyền xuất bản độc lập cho Supply Chain sẽ được áp dụng khi backend tích hợp RBAC riêng.
              </p>
            </div>
          </div>

          {/* Quick Preview Action */}
          <div className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenPreview}
              className="w-full h-9 rounded-xl text-xs gap-1.5 text-[#0066CC] border-[#0066CC]/30 hover:bg-[#F0F7FF]"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Xem trước công đoạn này</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. Technical Metadata Card */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs bg-white p-4 space-y-2.5">
        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          Thông số kỹ thuật
        </div>
        <div className="text-xs space-y-1.5 text-slate-500">
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Mã công đoạn:</span>
            <span className="font-mono text-slate-700 font-medium">{stage.id}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Thứ tự hiển thị:</span>
            <span className="font-bold text-slate-800">#{stage.stageNumber}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-slate-100">
            <span>Anchor link:</span>
            <span className="font-mono text-[11px] text-[#0066CC]">#stage-{stage.stageNumber}</span>
          </div>
          <div className="flex justify-between py-1">
            <span>Lưu trữ dữ liệu:</span>
            <span className="text-[11px] font-semibold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
              Client Session Mock
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
