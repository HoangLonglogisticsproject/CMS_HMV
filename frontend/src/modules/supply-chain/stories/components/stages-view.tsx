"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import {
  RotateCcw,
  Check,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  ChevronRight,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useSupplyChainStages, useUpdateSupplyChainStage } from "../queries/use-stages";
import { stageFormSchema, StageFormValues } from "../schemas/stage-form.schema";
import { StageNavigator } from "./stage-navigator";
import { StageContentEditor } from "./stage-content-editor";
import { StageInspector } from "./stage-inspector";
import { StagePreviewDialog, StagePreviewData } from "./stage-preview-dialog";
import { toast } from "sonner";

export function SupplyChainStagesView() {
  const { data: stages = [], isLoading } = useSupplyChainStages();
  const updateStageMutation = useUpdateSupplyChainStage();

  const [selectedStageId, setSelectedStageId] = useState<string>("stage-1");
  const [activeLocale, setActiveLocale] = useState<"vi" | "en">("vi");
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Unsaved changes confirmation dialog state
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [isConfirmDiscardOpen, setIsConfirmDiscardOpen] = useState(false);

  const selectedStage = stages.find((s) => s.id === selectedStageId) ?? stages[0];

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<StageFormValues>({
    resolver: zodResolver(stageFormSchema),
    defaultValues: {
      titleVi: "",
      titleEn: "",
      subtitle: "",
      tier: "DIRECT_OPERATION",
      status: "DRAFT",
      keyCapability: "",
      descriptionVi: "",
      descriptionEn: "",
    },
  });

  // Watch form fields for live sync with preview and inspector
  const currentTier = watch("tier");
  const currentStatus = watch("status");
  const currentTitleVi = watch("titleVi");
  const currentTitleEn = watch("titleEn");
  const currentSubtitle = watch("subtitle");
  const currentKeyCapability = watch("keyCapability");
  const currentDescVi = watch("descriptionVi");
  const currentDescEn = watch("descriptionEn");

  // Populate form when selected stage changes
  useEffect(() => {
    if (selectedStage) {
      reset({
        titleVi: selectedStage.titleVi,
        titleEn: selectedStage.titleEn,
        subtitle: selectedStage.subtitle,
        tier: selectedStage.tier,
        status: selectedStage.status,
        keyCapability: selectedStage.keyCapability,
        descriptionVi: selectedStage.descriptionVi,
        descriptionEn: selectedStage.descriptionEn,
      });
    }
  }, [selectedStage, reset]);

  // Handle stage switching with dirty guard
  const handleSelectStage = (id: string) => {
    if (id === selectedStageId) return;
    if (isDirty) {
      setPendingStageId(id);
      setIsConfirmDiscardOpen(true);
      return;
    }
    setSelectedStageId(id);
  };

  const handleConfirmDiscard = () => {
    if (pendingStageId) {
      setSelectedStageId(pendingStageId);
      setPendingStageId(null);
    }
    setIsConfirmDiscardOpen(false);
  };

  const onSubmit = (values: StageFormValues) => {
    if (!selectedStage) return;
    updateStageMutation.mutate(
      {
        id: selectedStage.id,
        payload: values,
      },
      {
        onSuccess: (updated) => {
          toast.success("Đã lưu bản nháp công đoạn thành công!", {
            description: `Dữ liệu công đoạn #${updated.stageNumber} đã được cập nhật trong bộ nhớ phiên làm việc.`,
          });
          reset(values); // reset dirty state to newly saved values
        },
        onError: (err) => {
          toast.error("Không thể lưu bản nháp", {
            description: err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định",
          });
        },
      }
    );
  };

  // Prepare data for live preview dialog
  const previewData: StagePreviewData = {
    stageNumber: selectedStage?.stageNumber ?? 1,
    titleVi: currentTitleVi || selectedStage?.titleVi || "",
    titleEn: currentTitleEn || selectedStage?.titleEn || "",
    subtitle: currentSubtitle || selectedStage?.subtitle || "",
    tier: currentTier || selectedStage?.tier || "DIRECT_OPERATION",
    status: currentStatus || selectedStage?.status || "DRAFT",
    keyCapability: currentKeyCapability || selectedStage?.keyCapability || "",
    descriptionVi: currentDescVi || selectedStage?.descriptionVi || "",
    descriptionEn: currentDescEn || selectedStage?.descriptionEn || "",
  };

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center space-y-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#0066CC] border-t-transparent" />
        <p className="text-xs text-slate-500 font-medium">Đang tải dữ liệu Chuỗi Cung Ứng...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 1. Page Header & Editorial Breadcrumb */}
      <div className="pb-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1.5" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-slate-800 transition-colors">
              Tổng quan
            </Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-600">Chuỗi cung ứng</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[#0066CC] font-bold">Hành trình</span>
          </nav>

          {/* Main Title & Subtitle */}
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-black text-[#113E67] tracking-tight">
              Hành trình chuỗi cung ứng
            </h1>
            <Badge variant="outline" className="text-[11px] bg-sky-50 text-[#0066CC] border-[#bae6fd] font-semibold gap-1">
              <Sparkles className="h-3 w-3" />
              Demo Session
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Quản lý nội dung hành trình từ vùng nguyên liệu Việt Nam đến khách hàng quốc tế.
          </p>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Unsaved status badge */}
          {isDirty ? (
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-xs font-semibold gap-1.5 py-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Có thay đổi chưa lưu
            </Badge>
          ) : (
            <span className="text-xs text-slate-400 hidden sm:inline-block">
              Đã đồng bộ
            </span>
          )}

          {/* Preview Trigger */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            className="h-9 text-xs gap-1.5 text-[#0066CC] border-slate-200 hover:border-[#0066CC] hover:bg-[#F0F7FF] rounded-xl font-semibold"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Xem trước</span>
          </Button>

          {/* Revert / Discard */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isDirty}
            onClick={() => reset()}
            className="h-9 text-xs gap-1.5 text-slate-600 border-slate-200 hover:text-slate-900 rounded-xl"
            title="Khôi phục dữ liệu ban đầu của công đoạn này"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Hoàn tác</span>
          </Button>

          {/* Primary Save Action */}
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSubmit(onSubmit)}
            disabled={updateStageMutation.isPending}
            className="h-9 px-4 text-xs gap-1.5 bg-[#0066CC] hover:bg-[#0055b3] text-white font-bold rounded-xl shadow-xs"
          >
            <Check className="h-4 w-4" />
            <span>{updateStageMutation.isPending ? "Đang lưu..." : "Lưu bản nháp"}</span>
          </Button>

          {/* Inspector Collapse Toggle (Desktop only) */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
            className="h-9 w-9 text-slate-500 hover:text-slate-800 rounded-xl hidden lg:inline-flex"
            title={isInspectorCollapsed ? "Mở thanh thông tin (Inspector)" : "Thu gọn thanh thông tin"}
          >
            {isInspectorCollapsed ? (
              <PanelRightOpen className="h-4 w-4 text-[#0066CC]" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 2. Main Workspace Layout */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left: Stage Navigator Timeline (Fixed width ~310px on desktop) */}
        <div className="w-full lg:w-80 shrink-0">
          <StageNavigator
            stages={stages}
            selectedStageId={selectedStage?.id ?? "stage-1"}
            onSelectStage={handleSelectStage}
            activeLocale={activeLocale}
            hasUnsavedChanges={isDirty}
          />
        </div>

        {/* Center: Spacious Content Studio Editor */}
        {selectedStage && (
          <StageContentEditor
            stage={selectedStage}
            register={register}
            watch={watch}
            errors={errors}
            activeLocale={activeLocale}
            onChangeLocale={(loc) => setActiveLocale(loc)}
            onOpenPreview={() => setIsPreviewOpen(true)}
          />
        )}

        {/* Right: Contextual Inspector (Collapsible panel) */}
        {selectedStage && (
          <StageInspector
            stage={selectedStage}
            register={register}
            setValue={setValue}
            currentTier={currentTier}
            currentStatus={currentStatus}
            onOpenPreview={() => setIsPreviewOpen(true)}
            isCollapsed={isInspectorCollapsed}
            onToggleCollapse={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
          />
        )}
      </div>

      {/* 3. Stage Preview Modal */}
      <StagePreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={previewData}
        initialLocale={activeLocale}
      />

      {/* 4. Discard Unsaved Changes Confirmation Dialog */}
      <Dialog open={isConfirmDiscardOpen} onOpenChange={setIsConfirmDiscardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              <DialogTitle className="text-base font-bold text-slate-800">
                Thay đổi chưa được lưu
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-slate-500 pt-2 leading-relaxed">
              Bạn đang có các nội dung vừa chỉnh sửa ở công đoạn hiện tại. Nếu chuyển sang công đoạn khác lúc này, các thay đổi chưa lưu sẽ bị hủy bỏ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsConfirmDiscardOpen(false)}
              className="text-xs"
            >
              Tiếp tục chỉnh sửa
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDiscard}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              Hủy thay đổi &amp; Chuyển công đoạn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
