"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageFormValues } from "../schemas/page-schema";
import {
  Eye,
  ExternalLink,
  Layers,
  Sparkles,
  Search,
  Globe,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

interface PagePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  data: PageFormValues;
  defaultLocale?: "vi" | "en";
}

export function PagePreviewDialog({
  isOpen,
  onClose,
  data,
  defaultLocale = "vi",
}: PagePreviewDialogProps) {
  const [previewLocale, setPreviewLocale] = useState<"vi" | "en">(defaultLocale);

  const isVi = previewLocale === "vi";
  const title = isVi ? data.titleVi : (data.titleEn || data.titleVi);
  const slug = isVi ? data.slugVi : (data.slugEn || data.slugVi);
  const metaTitle = isVi ? data.seo.metaTitleVi : (data.seo.metaTitleEn || data.seo.metaTitleVi);
  const metaDesc = isVi ? data.seo.metaDescriptionVi : (data.seo.metaDescriptionEn || data.seo.metaDescriptionVi);

  const activeSections = [...(data.sections || [])]
    .filter((s) => s.isActive)
    .sort((a, b) => a.order - b.order);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl border-slate-200">
        {/* Preview Top Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E9F7FF] text-[#087EC2]">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-[#123D68]">
                Bản Xem Trước Nội Bộ — {title}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500">
                Mô phỏng cấu trúc nội dung CMS Studio (Internal Template Preview)
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-3 pr-6">
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setPreviewLocale("vi")}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  isVi ? "bg-[#087EC2] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Tiếng Việt (VI)
              </button>
              <button
                type="button"
                onClick={() => setPreviewLocale("en")}
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  !isVi ? "bg-[#087EC2] text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                English (EN)
              </button>
            </div>
          </div>
        </div>

        {/* Disclaimer Strip */}
        <div className="bg-amber-50/80 px-6 py-2.5 border-b border-amber-200/60 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <span>
              <strong>Lưu ý kỹ thuật:</strong> Giao diện này render trực tiếp từ dữ liệu draft hiện tại trong CMS. Các hiệu ứng đồ họa 3D/Three.js sẽ được hiển thị trên Website công khai.
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white border-amber-300 text-amber-800">
            /{previewLocale}/{slug}
          </Badge>
        </div>

        <div className="p-6 space-y-8 bg-slate-50/50 min-h-[500px]">
          {/* SERP Search Preview Simulation */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
              <Search className="h-3.5 w-3.5 text-[#087EC2]" />
              <span>Mô Phỏng Hiển Thị Trên Google Tìm Kiếm (SERP Snippet)</span>
            </div>
            <div className="space-y-1 text-xs font-sans">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Globe className="h-3 w-3 text-slate-400" />
                <span>hmvglobal.vn &gt; {previewLocale} &gt; {slug}</span>
              </div>
              <div className="text-base font-medium text-[#1a0dab] hover:underline cursor-pointer line-clamp-1">
                {metaTitle || `${title} | HMV Global — Chuỗi Cung Ứng Nông Sản`}
              </div>
              <div className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                {metaDesc || "Chưa có thẻ Meta Description cho trang này. Hãy bổ sung trong phần Inspector SEO."}
              </div>
            </div>
          </div>

          {/* Sections Render Simulation */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Layers className="h-3.5 w-3.5 text-[#087EC2]" />
                <span>Nội Dung Các Khối Sections ({activeSections.length} khối hoạt động)</span>
              </div>
            </div>

            {activeSections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500 bg-white">
                Trang này hiện chưa có section nào được kích hoạt. Hãy thêm section mới trong Content Studio.
              </div>
            ) : (
              activeSections.map((sec, idx) => {
                const secTitle = isVi ? sec.titleVi : (sec.titleEn || sec.titleVi);
                const secSub = isVi ? sec.subtitleVi : (sec.subtitleEn || sec.subtitleVi);
                const secDesc = isVi ? sec.descriptionVi : (sec.descriptionEn || sec.descriptionVi);
                const secCta = isVi ? sec.ctaTextVi : (sec.ctaTextEn || sec.ctaTextVi);

                if (sec.sectionType === "HERO") {
                  return (
                    <div
                      key={sec.id}
                      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-[#123D68] via-[#0D4B75] to-[#087EC2] p-8 text-white shadow-md"
                    >
                      <div className="absolute top-3 right-3">
                        <Badge className="bg-white/20 text-white backdrop-blur-xs text-[10px]">
                          Section #{idx + 1} — HERO
                        </Badge>
                      </div>
                      <div className="max-w-2xl space-y-4">
                        {secSub && (
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-sky-200 backdrop-blur-xs">
                            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                            <span>{secSub}</span>
                          </div>
                        )}
                        <h2 className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
                          {secTitle}
                        </h2>
                        {secDesc && (
                          <p className="text-sm text-sky-100/90 leading-relaxed">
                            {secDesc}
                          </p>
                        )}
                        {secCta && (
                          <div className="pt-2">
                            <Button className="bg-white text-[#123D68] hover:bg-sky-50 font-semibold gap-1.5 shadow-sm text-xs h-9">
                              <span>{secCta}</span>
                              <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (sec.sectionType === "STORY_INTRO") {
                  return (
                    <div
                      key={sec.id}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs relative"
                    >
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="text-[10px]">
                          Section #{idx + 1} — STORY INTRO
                        </Badge>
                      </div>
                      <div className="grid md:grid-cols-2 gap-6 items-center">
                        <div className="space-y-3">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#087EC2]">
                            {secSub || "Storytelling"}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900">{secTitle}</h3>
                          <p className="text-xs text-slate-600 leading-relaxed">{secDesc}</p>
                          {secCta && (
                            <Button variant="outline" size="sm" className="text-xs text-[#087EC2] border-[#087EC2]/30 hover:bg-[#F1FAFF]">
                              {secCta}
                            </Button>
                          )}
                        </div>
                        {sec.mediaUrl ? (
                          <div className="overflow-hidden rounded-xl border border-slate-200 max-h-48">
                            <img
                              src={sec.mediaUrl}
                              alt={sec.mediaAlt || secTitle}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center h-36 text-xs text-slate-400">
                            Khối media minh họa
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (sec.sectionType === "CAPABILITY_GRID") {
                  return (
                    <div
                      key={sec.id}
                      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs relative"
                    >
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="text-[10px]">
                          Section #{idx + 1} — CAPABILITY GRID
                        </Badge>
                      </div>
                      <div className="space-y-4">
                        <div className="text-center max-w-xl mx-auto space-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#087EC2]">
                            {secSub || "Enterprise Capabilities"}
                          </span>
                          <h3 className="text-lg font-bold text-slate-900">{secTitle}</h3>
                          <p className="text-xs text-slate-600">{secDesc}</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#123D68]">
                              <ShieldCheck className="h-4 w-4 text-[#087EC2]" />
                              <span>Vùng Trồng Bản Địa</span>
                            </div>
                            <p className="text-[11px] text-slate-500">Quy chuẩn canh tác VietGAP & hợp tác xã độc quyền.</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#123D68]">
                              <CheckCircle2 className="h-4 w-4 text-[#087EC2]" />
                              <span>Chế Biến Quốc Tế</span>
                            </div>
                            <p className="text-[11px] text-slate-500">Cụm nhà máy đạt chuẩn HACCP / ISO 22000 toàn cầu.</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#123D68]">
                              <Globe className="h-4 w-4 text-[#087EC2]" />
                              <span>Logistics Incoterms</span>
                            </div>
                            <p className="text-[11px] text-slate-500">Giao hàng đa phương thức FOB, CIF tới các cảng đích.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (sec.sectionType === "METRICS_STRIP") {
                  return (
                    <div
                      key={sec.id}
                      className="rounded-2xl border border-blue-100 bg-gradient-to-r from-[#F1FAFF] to-white p-6 shadow-xs relative"
                    >
                      <div className="absolute top-3 right-3">
                        <Badge variant="secondary" className="text-[10px]">
                          Section #{idx + 1} — METRICS STRIP
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-base font-bold text-[#123D68]">{secTitle}</h3>
                        <p className="text-xs text-slate-600 leading-relaxed">{secDesc}</p>
                      </div>
                    </div>
                  );
                }

                // CTA_BANNER
                return (
                  <div
                    key={sec.id}
                    className="rounded-2xl border border-slate-200 bg-[#F8FAFC] p-6 text-center space-y-3 relative shadow-xs"
                  >
                    <div className="absolute top-3 right-3">
                      <Badge variant="secondary" className="text-[10px]">
                        Section #{idx + 1} — CTA BANNER
                      </Badge>
                    </div>
                    <div className="max-w-md mx-auto space-y-2">
                      <h3 className="text-base font-bold text-slate-900">{secTitle}</h3>
                      <p className="text-xs text-slate-600">{secDesc}</p>
                      {secCta && (
                        <div className="pt-2">
                          <Button className="bg-[#087EC2] hover:bg-[#066ba8] text-white text-xs h-8">
                            {secCta}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3">
          <span className="text-xs text-slate-500">
            Trạng thái hiện tại: <strong>{data.status}</strong>
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Đóng Xem Trước
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
