"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Eye,
  PanelRightClose,
  PanelRightOpen,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Search,
  Globe,
  Tag,
  User,
  ShieldCheck,
  FileText,
  Calendar,
  Layers,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  type ArticleDetail,
  type DraftPatch,
  useArticleCategories,
  useArticleDetail,
  useSaveArticleDraft,
} from "../queries/use-articles";
import {
  articleFormSchema,
  ArticleFormValues,
  ARTICLE_CATEGORY_METADATA,
} from "../schemas/article-schema";
import {
  buildDraftPatch,
  formErrorsFromApi,
  previewFromForm,
  publicPath,
  toContents,
  toFormValues,
  translationOf,
} from "../utils/article-form";
import { evaluatePageSeo } from "@/modules/content/pages/utils/page-evaluator";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { MediaPickerDialog, SelectedMediaResult } from "@/components/media/media-picker-dialog";
import { ArticlePreviewDialog } from "./article-preview-dialog";
import { ArticleWorkflowPanel } from "./article-workflow-panel";
import { RevisionConflictDialog } from "./revision-conflict-dialog";
import { isApiError } from "@/lib/api/client";
import { errorDetails, errorMessage } from "@/lib/api/errors";
import { useCan } from "@/modules/auth/queries/use-session";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-[11px] text-rose-600">{message}</p> : null;
}

/** All client-side validation messages, for fields that may sit in another tab or locale. */
function collectMessages(errors: FieldErrors, out: string[] = []): string[] {
  for (const value of Object.values(errors)) {
    if (!value) continue;
    if (typeof value.message === "string" && value.message) out.push(value.message);
    else if (typeof value === "object") collectMessages(value as FieldErrors, out);
  }
  return out;
}

interface ArticleEditorViewProps {
  articleId: string;
}

export function ArticleEditorView({ articleId }: ArticleEditorViewProps) {
  const router = useRouter();
  const can = useCan();
  const { data: articleData, isLoading, error, refetch } = useArticleDetail(articleId);
  const { data: categories = [] } = useArticleCategories();
  const updateMutation = useSaveArticleDraft();

  // The revision the form was loaded from. Background refetches never overwrite what the user is typing;
  // only an explicit load (first load, own save/approve/publish, conflict resolution) does.
  const [base, setBase] = useState<ArticleDetail | null>(null);
  const [conflict, setConflict] = useState<DraftPatch | null>(null);

  const [activeLocale, setActiveLocale] = useState<"vi" | "en">("vi");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(true);

  // Independent rich content state for VI and EN
  const [contentJsonVi, setContentJsonVi] = useState<Record<string, unknown> | null>(null);
  const [contentJsonEn, setContentJsonEn] = useState<Record<string, unknown> | null>(null);
  const [isRichContentDirty, setIsRichContentDirty] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { isDirty, errors },
  } = useForm<ArticleFormValues>({
    resolver: zodResolver(articleFormSchema),
    defaultValues: {
      id: articleId,
      category: "SUPPLY_CHAIN_INSIGHTS",
      authorName: "",
      authorRole: "",
      coverMediaId: null,
      coverImage: "",
      coverImageAltVi: "",
      coverImageAltEn: "",
      isFeatured: false,
      titleVi: "",
      titleEn: "",
      slugVi: "",
      slugEn: "",
      excerptVi: "",
      excerptEn: "",
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

  const loadFrom = useCallback(
    (detail: ArticleDetail) => {
      setBase(detail);
      reset(toFormValues(detail));
      const contents = toContents(detail);
      setContentJsonVi(contents.vi);
      setContentJsonEn(contents.en);
      setIsRichContentDirty(false);
    },
    [reset]
  );

  // First load only.
  useEffect(() => {
    if (articleData && !base) loadFrom(articleData);
  }, [articleData, base, loadFrom]);

  const watchedValues = watch();
  const activeSlug = activeLocale === "vi" ? watchedValues.slugVi : watchedValues.slugEn;
  // Canonical URL and OG image are derived (public path of the slug, cover image), not stored.
  const derivedSeo = {
    ...watchedValues.seo,
    canonicalUrl: activeSlug ? publicPath(activeSlug) : "",
    ogImageUrl: watchedValues.coverImage,
  };
  const currentSeoReport = evaluatePageSeo(derivedSeo, activeLocale);

  // Localization calculation
  const isViComplete = Boolean(watchedValues.titleVi && watchedValues.slugVi && watchedValues.excerptVi && contentJsonVi);
  const isEnComplete = Boolean(watchedValues.titleEn && watchedValues.slugEn && watchedValues.excerptEn && contentJsonEn);

  const isFormDirtyOverall = isDirty || isRichContentDirty;

  const handlePickCoverImage = (media: SelectedMediaResult) => {
    setValue("coverMediaId", media.id, { shouldDirty: true });
    setValue("coverImage", media.url, { shouldDirty: true });
    setValue("coverImageAltVi", media.altVi, { shouldDirty: true });
    setValue("coverImageAltEn", media.altEn, { shouldDirty: true });
  };

  const handleRemoveCover = () => {
    setValue("coverMediaId", null, { shouldDirty: true });
    setValue("coverImage", "", { shouldDirty: true });
    setValue("coverImageAltVi", "", { shouldDirty: true });
    setValue("coverImageAltEn", "", { shouldDirty: true });
  };

  const save = (patch: DraftPatch, expectedRevision: number) => {
    updateMutation.mutate(
      { id: articleId, expectedRevision, patch },
      {
        onSuccess: (saved) => {
          setConflict(null);
          loadFrom(saved);
          toast.success(`Đã lưu bản nháp (bản #${saved.revision})`);
        },
        onError: (err) => {
          if (isApiError(err, "REVISION_CONFLICT")) {
            setConflict(patch); // keep everything the user typed; let them decide
            return;
          }
          for (const { field, message } of formErrorsFromApi(err, patch)) setError(field, { message });
          toast.error("Không thể lưu bài viết", {
            description: [errorMessage(err), ...errorDetails(err)].join(" · "),
          });
        },
      }
    );
  };

  const onSubmit = (values: ArticleFormValues) => {
    if (!base) return;
    const patch = buildDraftPatch(base, values, { vi: contentJsonVi, en: contentJsonEn });
    if (!patch) {
      reset(values);
      setIsRichContentDirty(false);
      toast.info("Không có thay đổi nào để lưu.");
      return;
    }
    save(patch, base.revision);
  };

  const onInvalid = (formErrors: FieldErrors<ArticleFormValues>) => {
    toast.error("Vui lòng kiểm tra lại thông tin bài viết", {
      description: collectMessages(formErrors).slice(0, 4).join(" · "),
    });
  };

  const resolveConflict = async (applyMine: boolean) => {
    const { data: latest, error: refetchError } = await refetch();
    if (!latest) {
      toast.error("Không tải được bản mới nhất", { description: errorMessage(refetchError) });
      return;
    }
    if (applyMine && conflict) save(conflict, latest.revision);
    else {
      setConflict(null);
      loadFrom(latest);
      toast.info(`Đã tải bản mới nhất (bản #${latest.revision})`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-slate-500">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#087EC2] border-t-transparent" />
          <p className="text-xs">Đang tải dữ liệu bài viết EcoNews...</p>
        </div>
      </div>
    );
  }

  if (error || !articleData || !base) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-8 text-center space-y-3">
        <AlertCircle className="mx-auto h-8 w-8 text-rose-500" />
        <h3 className="text-sm font-bold text-rose-900">Không mở được bài viết</h3>
        <p className="text-xs text-rose-700">
          {error ? errorMessage(error) : <>Mã bài viết &quot;{articleId}&quot; không tồn tại trong hệ thống.</>}
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push("/content/articles")}>
          Quay Lại Danh Sách Bài Viết
        </Button>
      </div>
    );
  }

  const isVi = activeLocale === "vi";
  const categoryMeta = ARTICLE_CATEGORY_METADATA[watchedValues.category];
  const categoryName = categories
    .find((c) => c.code === watchedValues.category)
    ?.names.find((n) => n.locale === activeLocale)?.name;
  const isArchived = base.status === "ARCHIVED";
  const canEdit = can("article:write") && !isArchived;
  const activeTranslation = translationOf(base, activeLocale);

  return (
    <div className="space-y-4">
      {/* 1. TOP STICKY TOOLBAR */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-xs backdrop-blur-md">
        {/* Left: Breadcrumbs & Identifier */}
        <div className="flex items-center gap-3">
          <Link
            href="/content/articles"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title="Quay lại danh sách bài viết"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-400">Tin Tức &amp; Bài Viết</span>
              <span className="text-slate-300">/</span>
              <h1 className="text-sm font-bold text-[#123D68] max-w-sm sm:max-w-md truncate">
                {isVi ? watchedValues.titleVi : (watchedValues.titleEn || watchedValues.titleVi)}
              </h1>
              <Badge variant="outline" className={`text-[10px] border ${categoryMeta?.color || ""}`}>
                {categoryName ?? (isVi ? categoryMeta?.labelVi : categoryMeta?.labelEn)}
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
                isVi ? "bg-[#087EC2] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tiếng Việt (VI)
            </button>
            <button
              type="button"
              onClick={() => setActiveLocale("en")}
              className={`rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                !isVi ? "bg-[#087EC2] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              English (EN)
            </button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Unsaved Indicator */}
          {isFormDirtyOverall ? (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[11px] font-medium text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span>Chưa lưu thay đổi</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              <span>Đã lưu vào hệ thống</span>
            </div>
          )}

          {/* Reset */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!isFormDirtyOverall || updateMutation.isPending}
            onClick={() => {
              if (confirm("Bạn có chắc muốn khôi phục về bản lưu ban đầu?")) {
                loadFrom(base);
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
            disabled={updateMutation.isPending || !canEdit}
            title={!canEdit ? (isArchived ? "Bài viết đã lưu trữ" : "Bạn không có quyền chỉnh sửa") : undefined}
            onClick={handleSubmit(onSubmit, onInvalid)}
            className="h-8 text-xs bg-[#087EC2] hover:bg-[#066ba8] text-white gap-1.5 font-semibold shadow-xs"
          >
            <Save className="h-3.5 w-3.5" />
            <span>{updateMutation.isPending ? "Đang lưu..." : "Lưu Bản Nháp"}</span>
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
            {isInspectorOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE: EDITOR & CONTEXTUAL INSPECTOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column: Main Editor (Col 8 or 12) */}
        <div className={`space-y-4 transition-all duration-200 ${isInspectorOpen ? "lg:col-span-8" : "lg:col-span-12"}`}>
          {/* Article Info & Header Metadata */}
          <Card className="border-slate-200 shadow-2xs">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#087EC2]" />
                <CardTitle className="text-xs font-bold text-[#123D68] uppercase tracking-wide">
                  Tiêu Đề &amp; Tóm Tắt Bài Viết ({isVi ? "Tiếng Việt" : "English"})
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-slate-500">
                ID: {articleId}
              </Badge>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Tiêu Đề Bài Viết ({isVi ? "VI" : "EN"}) *
                </label>
                <Input
                  {...register(isVi ? "titleVi" : "titleEn")}
                  placeholder={isVi ? "Nhập tiêu đề bài viết phân tích..." : "Enter English article title..."}
                  className="h-9 text-xs sm:text-sm font-semibold"
                />
                <FieldError message={(isVi ? errors.titleVi : errors.titleEn)?.message} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Đoạn Tóm Tắt / Sa-pô ({isVi ? "VI" : "EN"})
                </label>
                <Textarea
                  {...register(isVi ? "excerptVi" : "excerptEn")}
                  placeholder={isVi ? "Tóm tắt 2-3 câu trọng tâm của bài viết để kích thích người đọc..." : "Brief 2-3 sentence article summary..."}
                  rows={2}
                  className="text-xs resize-none"
                />
              </div>

              {/* Cover Image Picker Integration */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-[#087EC2]" />
                    <span>Ảnh Đại Diện Bài Viết (Cover Image)</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsMediaPickerOpen(true)}
                    className="h-7 text-xs text-[#087EC2] border-[#087EC2]/30 hover:bg-[#F1FAFF]"
                  >
                    {watchedValues.coverImage ? "Đổi Ảnh Thư Viện" : "Chọn Từ Thư Viện Media"}
                  </Button>
                </div>

                {watchedValues.coverImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-slate-200 max-h-56 bg-slate-100 group">
                    <img
                      src={watchedValues.coverImage}
                      alt={isVi ? watchedValues.coverImageAltVi : watchedValues.coverImageAltEn}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveCover}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-rose-600 transition-colors shadow-sm"
                      title="Gỡ ảnh này"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 p-2 text-white text-[11px] truncate backdrop-blur-xs">
                      {isVi ? watchedValues.coverImageAltVi || "Ảnh đại diện" : watchedValues.coverImageAltEn || "Cover Image"}
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsMediaPickerOpen(true)}
                    className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center cursor-pointer hover:border-[#087EC2] hover:bg-sky-50/30 transition-all space-y-1.5"
                  >
                    <ImageIcon className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="text-xs text-slate-600 font-medium">Chưa có ảnh đại diện</p>
                    <p className="text-[11px] text-slate-400">Click để mở Media Picker và chọn hình ảnh độ phân giải cao</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Rich Content Body Studio (Tiptap) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-[#087EC2]" />
                <h2 className="text-xs font-bold text-[#123D68] uppercase tracking-wide">
                  Nội Dung Chi Tiết ({isVi ? "Tiếng Việt" : "English"})
                </h2>
                <Badge variant="outline" className="text-[10px] text-emerald-700 bg-emerald-50 border-emerald-200">
                  Tiptap Structured JSON
                </Badge>
              </div>

              <span className="text-[11px] text-slate-400">
                Định dạng chuẩn ProseMirror Document
              </span>
            </div>

            <RichTextEditor
              locale={activeLocale}
              content={isVi ? contentJsonVi : contentJsonEn}
              onChange={(json) => {
                if (isVi) {
                  setContentJsonVi(json);
                } else {
                  setContentJsonEn(json);
                }
                setIsRichContentDirty(true);
              }}
              placeholder={isVi ? "Bắt đầu soạn thảo bài viết chuyên sâu tiếng Việt..." : "Start drafting English article content..."}
            />
          </div>
        </div>

        {/* Right Column: Contextual Inspector (Col 4) */}
        {isInspectorOpen && (
          <div className="lg:col-span-4 space-y-4 sticky top-16">
            <Card className="border-slate-200 shadow-2xs">
              <CardHeader className="py-2.5 px-3 border-b border-slate-100 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-[#123D68] uppercase tracking-wide">
                  Contextual Inspector
                </CardTitle>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {activeLocale.toUpperCase()}
                </Badge>
              </CardHeader>
              <CardContent className="p-3">
                <Tabs defaultValue="settings" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-8">
                    <TabsTrigger value="settings" className="text-[11px]">
                      Cài Đặt
                    </TabsTrigger>
                    <TabsTrigger value="seo" className="text-[11px]">
                      SEO
                    </TabsTrigger>
                    <TabsTrigger value="loc" className="text-[11px]">
                      Bản Dịch
                    </TabsTrigger>
                  </TabsList>

                  {/* TAB 1: CONTENT SETTINGS */}
                  <TabsContent value="settings" className="space-y-3 pt-3 text-xs">
                    {/* Category */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-700">Chuyên Mục HMV</label>
                      <select
                        {...register("category")}
                        className="w-full h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#087EC2]"
                      >
                        {categories.map((c, i) => (
                          <option key={c.code} value={c.code}>
                            {i + 1}. {c.names.find((n) => n.locale === "en")?.name ?? c.code} (
                            {c.names.find((n) => n.locale === "vi")?.name ?? c.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status: review / approve / publish are server actions, not a field */}
                    <ArticleWorkflowPanel
                      article={base}
                      isDirty={isFormDirtyOverall}
                      onChanged={loadFrom}
                    />

                    {/* Slug */}
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-700">
                        URL Slug ({isVi ? "VI" : "EN"}) *
                      </label>
                      <Input
                        {...register(isVi ? "slugVi" : "slugEn")}
                        placeholder="slug-bai-viet"
                        className="h-7 text-xs font-mono"
                      />
                      <FieldError message={(isVi ? errors.slugVi : errors.slugEn)?.message} />
                    </div>

                    {/* Author & Role */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700">Tác Giả</label>
                        <Input {...register("authorName")} placeholder="Tên tác giả..." className="h-7 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700">Chức Danh</label>
                        <Input {...register("authorRole")} placeholder="Chức danh..." className="h-7 text-xs" />
                      </div>
                    </div>

                    {/* Read Time & Featured */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700">Thời Gian Đọc</label>
                        <div className="flex items-center">
                          <Input
                            type="number"
                            readOnly
                            value={activeTranslation?.readTimeMinutes ?? 0}
                            title="Tự tính từ nội dung đã lưu"
                            className="h-7 text-xs bg-slate-50"
                          />
                          <span className="text-[11px] text-slate-400 ml-1.5">phút</span>
                        </div>
                      </div>

                      <div className="space-y-1 flex flex-col justify-end">
                        <label className="flex items-center gap-1.5 cursor-pointer pb-1">
                          <input
                            type="checkbox"
                            {...register("isFeatured")}
                            className="rounded border-slate-300 text-[#087EC2] focus:ring-[#087EC2]"
                          />
                          <span className="text-xs font-semibold text-slate-700">Bài Nổi Bật</span>
                        </label>
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB 2: SEO INSPECTION */}
                  <TabsContent value="seo" className="space-y-3 pt-3">
                    <div className="rounded-xl border border-slate-100 bg-[#F1FAFF]/60 p-3 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          Đánh Giá SEO
                        </span>
                        <div className="text-xl font-bold text-[#123D68] mt-0.5">
                          {currentSeoReport.overallPercentage}%
                        </div>
                        <span className="text-[10px] text-slate-500">
                          Đạt {currentSeoReport.passedCount}/{currentSeoReport.totalCount} tiêu chí
                        </span>
                      </div>
                      <div className="h-10 w-10 rounded-full border-2 border-[#087EC2] flex items-center justify-center font-bold text-xs text-[#087EC2] bg-white">
                        {currentSeoReport.passedCount}/5
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px]">
                          <label className="font-semibold text-slate-600">Meta Title</label>
                          <span className="text-slate-400">
                            {(isVi ? watchedValues.seo.metaTitleVi : watchedValues.seo.metaTitleEn)?.length || 0}/65 ký tự
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
                            {(isVi ? watchedValues.seo.metaDescriptionVi : watchedValues.seo.metaDescriptionEn)?.length || 0}/160 ký tự
                          </span>
                        </div>
                        <Textarea
                          {...register(isVi ? "seo.metaDescriptionVi" : "seo.metaDescriptionEn")}
                          placeholder="Mô tả tóm tắt cho Google SERP..."
                          rows={2}
                          className="text-xs resize-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-slate-600">Canonical URL</label>
                        <Input
                          readOnly
                          value={derivedSeo.canonicalUrl}
                          title="Tự tạo từ URL slug"
                          placeholder="/tin-tuc/slug-bai-viet"
                          className="h-7 text-xs font-mono bg-slate-50"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* TAB 3: LOCALIZATION */}
                  <TabsContent value="loc" className="space-y-3 pt-3 text-xs">
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-slate-700">Tiếng Việt (VI)</span>
                          <span className={`font-bold ${isViComplete ? "text-emerald-600" : "text-amber-600"}`}>
                            {isViComplete ? "100%" : "Đang soạn thảo"}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${isViComplete ? "bg-emerald-500 w-full" : "bg-amber-500 w-2/3"}`}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-medium text-slate-700">English (EN)</span>
                          <span className={`font-bold ${isEnComplete ? "text-emerald-600" : "text-amber-600"}`}>
                            {isEnComplete ? "100%" : "Chưa hoàn thiện"}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${isEnComplete ? "bg-emerald-500 w-full" : "bg-amber-500 w-1/3"}`}
                          />
                        </div>
                      </div>
                    </div>

                    {!isEnComplete && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-1 text-[11px] text-amber-900">
                        <span className="font-bold flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                          <span>Hạng mục tiếng Anh cần bổ sung:</span>
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                          {!watchedValues.titleEn && <li>Tiêu đề tiếng Anh</li>}
                          {!watchedValues.excerptEn && <li>Tóm tắt sa-pô tiếng Anh</li>}
                          {!contentJsonEn && <li>Nội dung bài viết tiếng Anh</li>}
                        </ul>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* 3. REUSABLE MEDIA PICKER DIALOG */}
      <MediaPickerDialog
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handlePickCoverImage}
        currentUrl={watchedValues.coverImage}
        title="Chọn Ảnh Đại Diện Bài Viết"
      />

      {/* 4. PREVIEW DIALOG */}
      <ArticlePreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        article={previewFromForm(watchedValues, { vi: contentJsonVi, en: contentJsonEn }, base)}
        defaultLocale={activeLocale}
      />

      {/* 5. 409 REVISION_CONFLICT */}
      <RevisionConflictDialog
        open={conflict !== null}
        busy={updateMutation.isPending}
        onApplyMine={() => void resolveConflict(true)}
        onDiscardMine={() => void resolveConflict(false)}
        onClose={() => setConflict(null)}
      />
    </div>
  );
}
