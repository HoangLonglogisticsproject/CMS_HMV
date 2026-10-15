"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Eye,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Layers,
  CheckCircle2,
  AlertCircle,
  PanelRightClose,
  PanelRightOpen,
  Image as ImageIcon,
  ShieldCheck,
  FileCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { usePageDetail, useUpdatePage } from "../queries/use-pages";
import {
  pageFormSchema,
  PageFormValues,
} from "../schemas/page-schema";
import {
  evaluatePageSeo,
  evaluatePageLocalization,
} from "../utils/page-evaluator";
import { PagePreviewDialog } from "./page-preview-dialog";
import { PageSectionItem, SectionType } from "@/lib/mocks/types";

interface PageEditorViewProps {
  pageId: string;
}

export function PageEditorView({ pageId }: PageEditorViewProps) {
  const router = useRouter();
  const { data: pageData, isLoading, error } = usePageDetail(pageId);
  const updateMutation = useUpdatePage();

  const [activeLocale, setActiveLocale] = useState<"vi" | "en">("vi");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Record<string, boolean>>({});

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isDirty, isValid },
  } = useForm<PageFormValues>({
    resolver: zodResolver(pageFormSchema),
    defaultValues: {
      id: pageId,
      systemKey: "",
      contentType: "LANDING",
      titleVi: "",
      titleEn: "",
      slugVi: "",
      slugEn: "",
      status: "DRAFT",
      sections: [],
      seo: {
        metaTitleVi: "",
        metaTitleEn: "",
        metaDescriptionVi: "",
        metaDescriptionEn: "",
        canonicalUrl: "",
        ogImageUrl: "",
        keywords: [],
      },
    },
  });

  const { fields, move, remove, append } = useFieldArray({
    control,
    name: "sections",
  });

  // Populate form values when data loads or pageId changes
  useEffect(() => {
    if (pageData) {
      reset({
        id: pageData.id,
        systemKey: pageData.systemKey,
        contentType: pageData.contentType || "LANDING",
        titleVi: pageData.titleVi || "",
        titleEn: pageData.titleEn || "",
        slugVi: pageData.slugVi || "",
        slugEn: pageData.slugEn || "",
        status: pageData.status || "DRAFT",
        sections: pageData.sections ? JSON.parse(JSON.stringify(pageData.sections)) : [],
        seo: pageData.seo
          ? JSON.parse(JSON.stringify(pageData.seo))
          : {
              metaTitleVi: "",
              metaTitleEn: "",
              metaDescriptionVi: "",
              metaDescriptionEn: "",
              canonicalUrl: "",
              ogImageUrl: "",
              keywords: [],
            },
      });

      // Expand first section by default
      if (pageData.sections && pageData.sections.length > 0) {
        setExpandedSectionIds({ [pageData.sections[0].id]: true });
      }
    }
  }, [pageData, reset]);

  // Watch form data for live SEO evaluation and preview
  const watchedData = watch();
  const currentSeoReport = evaluatePageSeo(watchedData.seo, activeLocale);
  const currentLocReport = evaluatePageLocalization(watchedData);

  const toggleSectionExpand = (id: string) => {
    setExpandedSectionIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleAddNewSection = (type: SectionType) => {
    const newOrder = fields.length + 1;
    const newId = `sec-${Date.now()}`;
    append({
      id: newId,
      sectionType: type,
      titleVi: `Tiêu đề ${type} mới`,
      titleEn: `New ${type} heading`,
      subtitleVi: "Phụ đề khối nội dung",
      subtitleEn: "Section subtitle",
      descriptionVi: "Mô tả nội dung chi tiết theo định hướng Blue Ocean.",
      descriptionEn: "Detailed content according to Blue Ocean strategic direction.",
      ctaTextVi: "Tìm hiểu thêm",
      ctaTextEn: "Learn more",
      ctaUrl: "/supply-chain",
      mediaUrl: "",
      mediaAlt: "",
      order: newOrder,
      isActive: true,
    });
    setExpandedSectionIds((prev) => ({ ...prev, [newId]: true }));
    toast.info(`Đã thêm khối ${type} (Proposed Schema) vào cuối trang.`);
  };

  const onSubmit = (values: PageFormValues) => {
    // Normalizing section orders
    const normalizedSections = values.sections.map((sec, index) => ({
      ...sec,
      order: index + 1,
    }));

    updateMutation.mutate(
      {
        id: pageId,
        payload: {
          ...values,
          sections: normalizedSections,
          sectionsCount: normalizedSections.length,
        },
      },
      {
        onSuccess: (updated) => {
          reset(values); // reset dirty state to pristine
          toast.success(
            "Đã lưu bản nháp trang vào bộ nhớ phiên làm việc (In-Memory Session)!",
            {
              description:
                "Dữ liệu đã cập nhật trong TanStack Query cache. Khi Claude kết nối NestJS backend, dữ liệu sẽ được lưu vĩnh viễn.",
            }
          );
        },
        onError: (err) => {
          toast.error("Không thể lưu bản nháp", {
            description: String(err),
          });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#087EC2] border-t-transparent" />
          <p className="text-xs">Đang tải cấu trúc trang và các khối sections...</p>
        </div>
      </div>
    );
  }

  if (error || !pageData) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
        <h3 className="text-sm font-bold text-rose-900">Không tìm thấy trang yêu cầu</h3>
        <p className="text-xs text-rose-700">Mã trang &quot;{pageId}&quot; không tồn tại hoặc đã bị gỡ bỏ.</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/content/pages")}>
          Quay Lại Danh Sách Trang
        </Button>
      </div>
    );
  }

  const isVi = activeLocale === "vi";

  return (
    <div className="space-y-4">
      {/* 1. TOP STICKY TOOLBAR */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-xs backdrop-blur-md">
        {/* Left: Breadcrumbs & Page Identifier */}
        <div className="flex items-center gap-3">
          <Link
            href="/content/pages"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title="Quay lại danh sách trang"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">Trang &amp; Landing</span>
              <span className="text-slate-300">/</span>
              <h1 className="text-sm font-bold text-[#123D68]">
                {isVi ? watchedData.titleVi : (watchedData.titleEn || watchedData.titleVi)}
              </h1>
              <Badge variant="outline" className="font-mono text-[10px] text-slate-600 border-slate-200">
                {watchedData.systemKey}
              </Badge>
              <Badge className="bg-[#E9F7FF] text-[#087EC2] hover:bg-[#E9F7FF] text-[10px] border-none">
                {watchedData.contentType}
              </Badge>
            </div>
          </div>
        </div>

        {/* Right: Locale Switch, Status, Unsaved Indicator & Actions */}
        <div className="flex items-center gap-2.5">
          {/* Locale Switch */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setActiveLocale("vi")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                isVi
                  ? "bg-[#087EC2] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tiếng Việt (VI)
            </button>
            <button
              type="button"
              onClick={() => setActiveLocale("en")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                !isVi
                  ? "bg-[#087EC2] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              English (EN)
            </button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Unsaved Indicator */}
          {isDirty ? (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-medium text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Chưa lưu thay đổi</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>Đã đồng bộ session</span>
            </div>
          )}

          {/* Reset */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isDirty || updateMutation.isPending}
            onClick={() => {
              if (confirm("Bạn có chắc muốn khôi phục về dữ liệu ban đầu của trang?")) {
                reset();
                toast.info("Đã khôi phục dữ liệu ban đầu.");
              }
            }}
            className="h-8 text-xs text-slate-600 gap-1"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Khôi phục</span>
          </Button>

          {/* Preview */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            className="h-8 text-xs text-[#087EC2] border-[#087EC2]/30 hover:bg-[#F1FAFF] gap-1"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Xem Trước</span>
          </Button>

          {/* Save Demo Draft */}
          <Button
            type="button"
            size="sm"
            disabled={updateMutation.isPending}
            onClick={handleSubmit(onSubmit)}
            className="h-8 text-xs bg-[#087EC2] hover:bg-[#066ba8] text-white gap-1.5 font-semibold shadow-xs"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{updateMutation.isPending ? "Đang lưu..." : "Lưu Bản Nháp (Demo)"}</span>
          </Button>

          {/* Toggle Inspector */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsInspectorOpen(!isInspectorOpen)}
            className="h-8 px-2 text-slate-500 hover:text-slate-800"
            title={isInspectorOpen ? "Thu gọn Inspector" : "Mở rộng Inspector"}
          >
            {isInspectorOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE: EDITOR & CONTEXTUAL INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Form Content Studio */}
        <div
          className={`space-y-4 transition-all duration-200 ${
            isInspectorOpen ? "lg:col-span-8" : "lg:col-span-12"
          }`}
        >
          {/* General Page Information */}
          <Card className="border-slate-200 shadow-2xs">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-[#087EC2]" />
                <CardTitle className="text-xs font-bold text-[#123D68] uppercase tracking-wide">
                  Thông Tin Cơ Bản Của Trang ({isVi ? "Tiếng Việt" : "English"})
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                Route ID: {pageId}
              </Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Tiêu Đề Trang ({isVi ? "VI" : "EN"}) *
                  </label>
                  <Input
                    {...register(isVi ? "titleVi" : "titleEn")}
                    placeholder={isVi ? "Nhập tiêu đề trang tiếng Việt" : "Enter English page title"}
                    className="h-8 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    URL Slug ({isVi ? "VI" : "EN"}) *
                  </label>
                  <div className="flex items-center">
                    <span className="flex h-8 items-center rounded-l-md border border-r-0 border-slate-200 bg-slate-50 px-2.5 text-[11px] font-mono text-slate-500">
                      /{activeLocale}/
                    </span>
                    <Input
                      {...register(isVi ? "slugVi" : "slugEn")}
                      placeholder={isVi ? "slug-tieng-viet" : "english-slug"}
                      className="h-8 text-xs font-mono rounded-l-none"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Mã Hệ Thống (System Key)</label>
                  <Input
                    {...register("systemKey")}
                    disabled
                    className="h-8 text-xs bg-slate-50 font-mono text-slate-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Loại Trang (Content Type)</label>
                  <select
                    {...register("contentType")}
                    className="w-full h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#087EC2]"
                  >
                    <option value="LANDING">LANDING — Trang chủ &amp; Giới thiệu</option>
                    <option value="SUPPLY_CHAIN">SUPPLY_CHAIN — Hành trình chuỗi cung ứng</option>
                    <option value="CATALOG">CATALOG — Danh mục nông sản xuất khẩu</option>
                    <option value="STANDARDS">STANDARDS — Tiêu chuẩn &amp; Chứng nhận QA</option>
                    <option value="EDITORIAL">EDITORIAL — Chuyên trang nội dung</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Trạng Thái Xuất Bản</label>
                  <select
                    {...register("status")}
                    className="w-full h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#087EC2]"
                  >
                    <option value="DRAFT">DRAFT — Bản nháp nội bộ</option>
                    <option value="IN_REVIEW">IN_REVIEW — Chờ Ban Giám Đốc duyệt</option>
                    <option value="APPROVED">APPROVED — Đã phê duyệt nội dung</option>
                    <option value="PUBLISHED">PUBLISHED — Đã công khai trên web</option>
                    <option value="ARCHIVED">ARCHIVED — Lưu trữ / Ẩn trang</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section Management Studio */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#087EC2]" />
                <h2 className="text-xs font-bold text-[#123D68] uppercase tracking-wide">
                  Cấu Trúc Các Khối Sections ({fields.length} Khối)
                </h2>
                <Badge variant="outline" className="text-[10px] text-sky-700 bg-sky-50 border-sky-200">
                  Proposed Schema
                </Badge>
              </div>

              {/* Add Section Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500 mr-1">Thêm khối:</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddNewSection("HERO")}
                  className="h-7 text-[11px] px-2 gap-1 text-slate-700"
                >
                  <Plus className="h-3 w-3" />
                  <span>Hero</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddNewSection("STORY_INTRO")}
                  className="h-7 text-[11px] px-2 gap-1 text-slate-700"
                >
                  <Plus className="h-3 w-3" />
                  <span>Story</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddNewSection("CAPABILITY_GRID")}
                  className="h-7 text-[11px] px-2 gap-1 text-slate-700"
                >
                  <Plus className="h-3 w-3" />
                  <span>Capabilities</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddNewSection("METRICS_STRIP")}
                  className="h-7 text-[11px] px-2 gap-1 text-slate-700"
                >
                  <Plus className="h-3 w-3" />
                  <span>Metrics</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddNewSection("CTA_BANNER")}
                  className="h-7 text-[11px] px-2 gap-1 text-slate-700"
                >
                  <Plus className="h-3 w-3" />
                  <span>CTA</span>
                </Button>
              </div>
            </div>

            {/* List of Sections */}
            {fields.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500 space-y-2">
                <p>Trang này chưa có khối nội dung nào.</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleAddNewSection("HERO")}
                  className="h-8 text-xs bg-[#087EC2] text-white"
                >
                  Thêm Khối Hero Đầu Tiên
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => {
                  const sectionId = field.id;
                  const isExpanded = expandedSectionIds[sectionId] !== false; // default true if undefined
                  const sectionType = watch(`sections.${index}.sectionType`);
                  const currentTitle = watch(isVi ? `sections.${index}.titleVi` : `sections.${index}.titleEn`);
                  const isActive = watch(`sections.${index}.isActive`);

                  return (
                    <Card
                      key={field.id}
                      className={`border transition-all duration-150 ${
                        isActive
                          ? "border-slate-200 bg-white shadow-2xs"
                          : "border-slate-200/60 bg-slate-50/70 opacity-75"
                      }`}
                    >
                      {/* Section Header Bar */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100 rounded-t-xl select-none">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white border border-slate-200 text-[10px] font-bold text-slate-600">
                            #{index + 1}
                          </span>

                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] bg-slate-200/70 text-slate-700"
                          >
                            {sectionType}
                          </Badge>

                          <span className="text-xs font-semibold text-slate-800 max-w-xs truncate">
                            {currentTitle || "(Chưa đặt tiêu đề)"}
                          </span>

                          {!isActive && (
                            <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-300 bg-amber-50">
                              Đang Ẩn
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Visibility Toggle */}
                          <button
                            type="button"
                            onClick={() => setValue(`sections.${index}.isActive`, !isActive, { shouldDirty: true })}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                              isActive
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                            }`}
                          >
                            {isActive ? "Hiển thị" : "Ẩn"}
                          </button>

                          <Separator orientation="vertical" className="h-4 mx-1" />

                          {/* Reorder Up */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            title="Di chuyển lên trên"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>

                          {/* Reorder Down */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={index === fields.length - 1}
                            onClick={() => move(index, index + 1)}
                            className="h-6 w-6 p-0 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            title="Di chuyển xuống dưới"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>

                          {/* Delete Section */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Bạn có chắc muốn xóa section #${index + 1}?`)) {
                                remove(index);
                                toast.info(`Đã xóa section #${index + 1}`);
                              }
                            }}
                            className="h-6 w-6 p-0 text-slate-400 hover:text-rose-600"
                            title="Xóa section này"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>

                          {/* Expand/Collapse */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSectionExpand(sectionId)}
                            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-900 ml-1"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Section Body */}
                      {isExpanded && (
                        <CardContent className="p-4 space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-700">
                                Tiêu Đề Khối ({isVi ? "VI" : "EN"}) *
                              </label>
                              <Input
                                {...register(isVi ? `sections.${index}.titleVi` : `sections.${index}.titleEn`)}
                                placeholder="Nhập tiêu đề khối nội dung..."
                                className="h-8 text-xs"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-700">
                                Phụ Đề / Tagline ({isVi ? "VI" : "EN"})
                              </label>
                              <Input
                                {...register(isVi ? `sections.${index}.subtitleVi` : `sections.${index}.subtitleEn`)}
                                placeholder="Nhập phụ đề định hướng..."
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-700">
                              Nội Dung Chi Tiết ({isVi ? "VI" : "EN"})
                            </label>
                            <Textarea
                              {...register(isVi ? `sections.${index}.descriptionVi` : `sections.${index}.descriptionEn`)}
                              placeholder="Nhập đoạn văn bản nội dung chi tiết..."
                              rows={3}
                              className="text-xs resize-y"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                            {/* CTA Text */}
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-700">
                                Nhãn Nút Kêu Gọi (CTA Label - {isVi ? "VI" : "EN"})
                              </label>
                              <Input
                                {...register(isVi ? `sections.${index}.ctaTextVi` : `sections.${index}.ctaTextEn`)}
                                placeholder="Ví dụ: Khám Phá Ngay, Báo Giá..."
                                className="h-8 text-xs"
                              />
                            </div>

                            {/* CTA URL */}
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-700">
                                Đường Dẫn Nút (CTA URL)
                              </label>
                              <Input
                                {...register(`sections.${index}.ctaUrl`)}
                                placeholder="Ví dụ: /supply-chain hoặc /contact"
                                className="h-8 text-xs font-mono"
                              />
                            </div>
                          </div>

                          {/* Media Reference */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-slate-100">
                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                <ImageIcon className="h-3.5 w-3.5 text-slate-500" />
                                <span>URL Ảnh / Media Minh Họa</span>
                              </label>
                              <Input
                                {...register(`sections.${index}.mediaUrl`)}
                                placeholder="https://... hoặc /assets/..."
                                className="h-8 text-xs font-mono"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-semibold text-slate-700">
                                Chú Thích Ảnh (Alt Text)
                              </label>
                              <Input
                                {...register(`sections.${index}.mediaAlt`)}
                                placeholder="Mô tả hình ảnh cho SEO..."
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Contextual Inspector (Collapsible) */}
        {isInspectorOpen && (
          <div className="lg:col-span-4 space-y-4 sticky top-16">
            {/* Inspector Tabs */}
            <Card className="border-slate-200 shadow-2xs">
              <CardHeader className="py-2.5 px-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-[#123D68] uppercase tracking-wide">
                  Contextual Inspector
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Ngôn ngữ:</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {activeLocale.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3">
                <Tabs defaultValue="seo" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-8">
                    <TabsTrigger value="seo" className="text-[11px]">
                      SEO Health
                    </TabsTrigger>
                    <TabsTrigger value="loc" className="text-[11px]">
                      Bản Dịch
                    </TabsTrigger>
                    <TabsTrigger value="audit" className="text-[11px]">
                      Hệ Thống
                    </TabsTrigger>
                  </TabsList>

                  {/* TAB 1: SEO HEALTH (RULE-BASED CHECKLIST) */}
                  <TabsContent value="seo" className="space-y-3 pt-3">
                    {/* SEO Score Gauge */}
                    <div className="rounded-xl border border-slate-100 bg-[#F1FAFF]/60 p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Đánh Giá SEO Readiness
                        </span>
                        <div className="text-xl font-bold text-[#123D68] mt-0.5">
                          {currentSeoReport.overallPercentage}%
                        </div>
                        <span className="text-[10px] text-slate-500">
                          Đạt {currentSeoReport.passedCount}/{currentSeoReport.totalCount} tiêu chí kỹ thuật
                        </span>
                      </div>
                      <div className="h-10 w-10 rounded-full border-2 border-[#087EC2] flex items-center justify-center font-bold text-xs text-[#087EC2] bg-white">
                        {currentSeoReport.passedCount}/5
                      </div>
                    </div>

                    {/* SEO Checklist */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-700">
                        Checklist Kiểm Định ({isVi ? "Tiếng Việt" : "English"}):
                      </span>
                      {currentSeoReport.criteria.map((crit) => (
                        <div
                          key={crit.id}
                          className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2 text-xs"
                        >
                          {crit.isPassed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                          )}
                          <div className="space-y-0.5">
                            <div className="font-semibold text-slate-800 text-[11px]">{crit.name}</div>
                            <div className="text-[10px] text-slate-500">{crit.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator className="my-2" />

                    {/* SEO Inputs */}
                    <div className="space-y-3">
                      <span className="text-[11px] font-bold text-slate-700">
                        Chỉnh Sửa Metadata ({isVi ? "VI" : "EN"}):
                      </span>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <label className="font-semibold text-slate-600">Meta Title</label>
                          <span className="text-slate-400">
                            {(isVi ? watchedData.seo.metaTitleVi : watchedData.seo.metaTitleEn)?.length || 0}/65 ký tự
                          </span>
                        </div>
                        <Input
                          {...register(isVi ? "seo.metaTitleVi" : "seo.metaTitleEn")}
                          placeholder="Tiêu đề hiển thị trên Google..."
                          className="h-7 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <label className="font-semibold text-slate-600">Meta Description</label>
                          <span className="text-slate-400">
                            {(isVi ? watchedData.seo.metaDescriptionVi : watchedData.seo.metaDescriptionEn)?.length || 0}/160 ký tự
                          </span>
                        </div>
                        <Textarea
                          {...register(isVi ? "seo.metaDescriptionVi" : "seo.metaDescriptionEn")}
                          placeholder="Mô tả tóm tắt giá trị cho công cụ tìm kiếm..."
                          rows={2}
                          className="text-xs resize-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-600">Canonical URL</label>
                        <Input
                          {...register("seo.canonicalUrl")}
                          placeholder="/slug-trang"
                          className="h-7 text-xs font-mono"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-600">Open Graph Image (Social)</label>
                        <Input
                          {...register("seo.ogImageUrl")}
                          placeholder="https://... ảnh 1200x630"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB 2: LOCALIZATION HEALTH */}
                  <TabsContent value="loc" className="space-y-3 pt-3">
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">Tiếng Việt (Gốc)</span>
                          <span className="font-bold text-emerald-600">{currentLocReport.viPercentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${currentLocReport.viPercentage}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-medium text-slate-700">English (Bản dịch)</span>
                          <span className="font-bold text-[#087EC2]">{currentLocReport.enPercentage}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-[#087EC2] h-1.5 rounded-full"
                            style={{ width: `${currentLocReport.enPercentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {currentLocReport.missingEnFields.length > 0 ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-1.5 text-xs text-amber-900">
                        <span className="font-bold text-[11px] flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                          <span>Các mục chưa có bản dịch tiếng Anh:</span>
                        </span>
                        <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                          {currentLocReport.missingEnFields.map((field, i) => (
                            <li key={i}>{field}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Trang này đã hoàn thiện 100% song ngữ VI/EN.</span>
                      </div>
                    )}
                  </TabsContent>

                  {/* TAB 3: SYSTEM AUDIT & NOTICE */}
                  <TabsContent value="audit" className="space-y-3 pt-3 text-xs">
                    <div className="space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Người sửa cuối:</span>
                        <span className="font-semibold text-slate-800">{pageData.lastEditor || "Admin"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Lần cập nhật:</span>
                        <span className="font-semibold text-slate-800">{pageData.updatedAt}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Định dạng sections:</span>
                        <span className="font-semibold text-slate-800">JSON Component Block</span>
                      </div>
                    </div>

                    <div className="rounded-xl border border-sky-200 bg-[#F1FAFF] p-3 space-y-1.5 text-[11px] text-sky-950">
                      <span className="font-bold flex items-center gap-1 text-[#087EC2]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Đặc Tả Handoff Cho Claude</span>
                      </span>
                      <p className="leading-relaxed">
                        Cấu trúc section này được quản lý theo mô hình proposed component blocks. Khi Claude tích hợp API, payload `PUT /api/v1/admin/pages/:id` sẽ nhận danh sách sections để lưu trữ an toàn trong PostgreSQL.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* 3. INTERACTIVE TEMPLATE PREVIEW DIALOG */}
      <PagePreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        data={watchedData}
        defaultLocale={activeLocale}
      />
    </div>
  );
}
