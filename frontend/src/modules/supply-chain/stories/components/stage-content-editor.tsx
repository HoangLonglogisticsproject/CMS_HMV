"use client";

import React, { useState } from "react";
import Image from "next/image";
import { UseFormRegister, FieldErrors, UseFormWatch, UseFormSetValue } from "react-hook-form";
import { StageFormValues } from "../schemas/stage-form.schema";
import { SupplyChainStageItem } from "@/lib/mocks/types";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MediaPickerDialog, SelectedMediaResult } from "@/components/media/media-picker-dialog";
import {
  FileText,
  Image as ImageIcon,
  ShieldCheck,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  Eye,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface StageContentEditorProps {
  stage: SupplyChainStageItem;
  register: UseFormRegister<StageFormValues>;
  watch: UseFormWatch<StageFormValues>;
  errors: FieldErrors<StageFormValues>;
  activeLocale: "vi" | "en";
  onChangeLocale: (locale: "vi" | "en") => void;
  onOpenPreview: () => void;
}

export function StageContentEditor({
  stage,
  register,
  watch,
  errors,
  activeLocale,
  onChangeLocale,
  onOpenPreview,
}: StageContentEditorProps) {
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(null);

  const titleVi = watch("titleVi");
  const titleEn = watch("titleEn");
  const descriptionVi = watch("descriptionVi") || "";
  const descriptionEn = watch("descriptionEn") || "";

  const currentDesc = activeLocale === "vi" ? descriptionVi : descriptionEn;
  const currentCount = currentDesc.length;

  const hasViContent = Boolean(titleVi?.trim() && descriptionVi?.trim());
  const hasEnContent = Boolean(titleEn?.trim() && descriptionEn?.trim());

  const handleMediaSelect = (media: SelectedMediaResult) => {
    setCustomImageUrl(media.url);
    setIsMediaPickerOpen(false);
  };

  const previewImage = customImageUrl || "/brand/Login_background.png";

  return (
    <div className="flex-1 min-w-0 space-y-5">
      {/* 1. Editor Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="h-6 px-2.5 rounded-full bg-[#0066CC] text-white text-xs font-bold flex items-center justify-center shadow-2xs">
                #{stage.stageNumber}
              </span>
              <h2 className="text-base sm:text-lg font-black text-[#113E67] tracking-tight">
                {activeLocale === "vi" ? titleVi || stage.titleVi : titleEn || stage.titleEn}
              </h2>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Không gian biên tập câu chuyện công đoạn chuỗi cung ứng HMV Global
            </p>
          </div>

          {/* Bilingual Switcher Tabs inside Editor */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => onChangeLocale("vi")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  activeLocale === "vi"
                    ? "bg-white text-[#0066CC] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <span>Tiếng Việt</span>
                {hasViContent ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                )}
              </button>

              <button
                type="button"
                onClick={() => onChangeLocale("en")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  activeLocale === "en"
                    ? "bg-white text-[#0066CC] shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <span>English</span>
                {hasEnContent ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                ) : (
                  <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded font-normal">Cần dịch</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Group A: Story Identity (Định danh công đoạn) */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-[#113E67] uppercase tracking-wider">
            <FileText className="h-4 w-4 text-[#0066CC]" />
            <span>1. Định danh công đoạn (Story Identity)</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">
            Đang hiển thị: <span className="text-[#0066CC]">{activeLocale.toUpperCase()}</span>
          </span>
        </div>

        <div className="space-y-4">
          {/* Stage Title */}
          <div className="space-y-1.5">
            <label htmlFor="stage-title-input" className="block text-xs font-bold text-slate-700">
              Tiêu đề công đoạn ({activeLocale === "vi" ? "Tiếng Việt" : "English"}) <span className="text-rose-500">*</span>
            </label>
            {activeLocale === "vi" ? (
              <Input
                id="stage-title-input"
                {...register("titleVi")}
                placeholder="VD: Vùng Nguyên Liệu Bản Địa (Vietnamese Indigenous Origin)"
                className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl"
              />
            ) : (
              <Input
                id="stage-title-input"
                {...register("titleEn")}
                placeholder="e.g. Vietnamese Indigenous Origin & Cooperative Farms"
                className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl"
              />
            )}
            {activeLocale === "vi" && errors.titleVi && (
              <p className="text-xs text-rose-500">{errors.titleVi.message}</p>
            )}
            {activeLocale === "en" && errors.titleEn && (
              <p className="text-xs text-rose-500">{errors.titleEn.message}</p>
            )}
          </div>

          {/* Subtitle / Focus point */}
          <div className="space-y-1.5">
            <label htmlFor="stage-subtitle-input" className="block text-xs font-bold text-slate-700">
              Mô tả trọng tâm (Supporting Subtitle) <span className="text-rose-500">*</span>
            </label>
            <Input
              id="stage-subtitle-input"
              {...register("subtitle")}
              placeholder="VD: Liên kết trực tiếp với các hợp tác xã nông dân Tây Nguyên và Đồng Bằng"
              className="h-11 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl"
            />
            {errors.subtitle && (
              <p className="text-xs text-rose-500">{errors.subtitle.message}</p>
            )}
            <p className="text-[11px] text-slate-400">
              Dòng thông điệp ngắn xuất hiện ngay dưới tiêu đề trên website công khai.
            </p>
          </div>

          {/* Key Capability / Standard */}
          <div className="space-y-1.5">
            <label htmlFor="stage-capability-input" className="block text-xs font-bold text-slate-700">
              Năng lực cốt lõi &amp; Tiêu chuẩn chứng nhận (Key Capability) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0066CC] pointer-events-none" />
              <Input
                id="stage-capability-input"
                {...register("keyCapability")}
                placeholder="VD: Kiểm soát thổ nhưỡng & nhật ký canh tác chuẩn VietGAP / GlobalGAP"
                className="h-11 pl-10 text-sm bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl"
              />
            </div>
            {errors.keyCapability && (
              <p className="text-xs text-rose-500">{errors.keyCapability.message}</p>
            )}
            <p className="text-[11px] text-slate-400">
              Được làm nổi bật trong hộp cam kết chất lượng của từng giai đoạn.
            </p>
          </div>
        </div>
      </Card>

      {/* 3. Group B: Narrative Content (Câu chuyện chi tiết) */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-[#113E67] uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-[#0066CC]" />
            <span>2. Nội dung câu chuyện (Narrative Story)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>{currentCount} ký tự</span>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="stage-description-textarea" className="block text-xs font-bold text-slate-700">
            Nội dung kể chuyện chi tiết ({activeLocale === "vi" ? "Tiếng Việt" : "English"}) <span className="text-rose-500">*</span>
          </label>

          {activeLocale === "vi" ? (
            <Textarea
              id="stage-description-textarea"
              {...register("descriptionVi")}
              rows={8}
              placeholder="Kể chi tiết câu chuyện về xuất xứ, sự gắn kết với nông dân bản địa, quy trình kiểm soát và giá trị HMV mang lại..."
              className="text-sm leading-relaxed p-4 bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl transition-all resize-y"
            />
          ) : (
            <Textarea
              id="stage-description-textarea"
              {...register("descriptionEn")}
              rows={8}
              placeholder="Tell the comprehensive supply chain story, cooperative farmers partnership, quality compliance and value creation for global buyers..."
              className="text-sm leading-relaxed p-4 bg-slate-50/50 hover:bg-white focus:bg-white border-slate-200 rounded-xl transition-all resize-y"
            />
          )}

          {activeLocale === "vi" && errors.descriptionVi && (
            <p className="text-xs text-rose-500">{errors.descriptionVi.message}</p>
          )}
          {activeLocale === "en" && errors.descriptionEn && (
            <p className="text-xs text-rose-500">{errors.descriptionEn.message}</p>
          )}

          {/* Editorial Writing Guidance */}
          <div className="p-3.5 bg-[#F0F7FF] rounded-xl border border-[#D0E6FC] flex items-start gap-2.5 text-xs text-slate-600">
            <Info className="h-4 w-4 text-[#0066CC] shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="text-[#113E67]">Gợi ý biên tập:</strong> Nhấn mạnh tính minh bạch và giá trị thực tế của nông sản Việt Nam. Tránh dùng từ ngữ quảng cáo sáo rỗng; tập trung vào hành động kiểm chứng cụ thể (ví dụ: thời gian thu gom trong 6 giờ, kiểm định CoA độc lập theo từng container).
            </div>
          </div>
        </div>
      </Card>

      {/* 4. Group C: Visual Storytelling (Hình ảnh câu chuyện) */}
      <Card className="rounded-2xl border-slate-200/90 shadow-2xs bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-[#113E67] uppercase tracking-wider">
            <ImageIcon className="h-4 w-4 text-[#0066CC]" />
            <span>3. Hình ảnh đại diện (Visual Storytelling)</span>
          </div>
          <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-200">
            Media Hub
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
          {/* Image Thumbnail Preview */}
          <div className="sm:col-span-5 relative h-40 sm:h-44 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs">
            <Image
              src={previewImage}
              alt="Hình ảnh đại diện công đoạn"
              fill
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent pointer-events-none" />
            <span className="absolute bottom-2.5 left-2.5 text-[11px] font-bold text-white drop-shadow-xs">
              Ảnh công đoạn #{stage.stageNumber}
            </span>
          </div>

          {/* Media Info & Picker Trigger */}
          <div className="sm:col-span-7 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-slate-800">Ảnh bìa minh họa công đoạn</h4>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Hình ảnh xuất hiện đầu thẻ câu chuyện trên website. Khuyến nghị sử dụng ảnh thực tế tại nông trường, trạm sơ chế hoặc cảng biển HMV.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMediaPickerOpen(true)}
                className="text-xs gap-1.5 border-slate-200 hover:border-[#0066CC] hover:text-[#0066CC]"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Chọn từ Thư viện Media</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onOpenPreview}
                className="text-xs gap-1 text-slate-500 hover:text-slate-800"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>Xem mô phỏng</span>
              </Button>
            </div>

            <p className="text-[11px] text-slate-400 italic">
              * Tính năng liên kết Media Asset trực tiếp với Stage Item: Cần Claude bổ sung trường `imageUrl` vào schema cơ sở dữ liệu.
            </p>
          </div>
        </div>
      </Card>

      {/* Media Picker Dialog Integration */}
      <MediaPickerDialog
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleMediaSelect}
        title="Chọn hình ảnh cho công đoạn chuỗi cung ứng"
      />
    </div>
  );
}
