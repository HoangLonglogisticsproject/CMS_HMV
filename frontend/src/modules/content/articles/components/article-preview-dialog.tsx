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
import type { ArticlePreviewModel } from "../utils/article-form";
import { ARTICLE_CATEGORY_METADATA } from "../schemas/article-schema";
import {
  Eye,
  Calendar,
  Clock,
  User,
  Search,
  Globe,
  Share2,
  Sparkles,
  Layers,
  Tag,
} from "lucide-react";

interface ArticlePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  article: ArticlePreviewModel;
  defaultLocale?: "vi" | "en";
}

export function ArticlePreviewDialog({
  isOpen,
  onClose,
  article,
  defaultLocale = "vi",
}: ArticlePreviewDialogProps) {
  const [previewLocale, setPreviewLocale] = useState<"vi" | "en">(defaultLocale);

  const isVi = previewLocale === "vi";
  const title = isVi ? article.titleVi : (article.titleEn || article.titleVi);
  const slug = isVi ? article.slugVi : (article.slugEn || article.slugVi);
  const excerpt = isVi ? article.excerptVi : (article.excerptEn || article.excerptVi);
  const metaTitle = isVi ? article.seo?.metaTitleVi : (article.seo?.metaTitleEn || article.seo?.metaTitleVi);
  const metaDesc = isVi ? article.seo?.metaDescriptionVi : (article.seo?.metaDescriptionEn || article.seo?.metaDescriptionVi);
  const coverAlt = isVi ? article.coverImageAltVi : (article.coverImageAltEn || article.coverImageAltVi);

  const categoryMeta = article.category ? ARTICLE_CATEGORY_METADATA[article.category] : null;
  const categoryLabel = categoryMeta ? (isVi ? categoryMeta.labelVi : categoryMeta.labelEn) : article.category;

  // Render ProseMirror JSON nodes
  const contentDoc = (isVi ? article.contentJsonVi : (article.contentJsonEn || article.contentJsonVi)) as unknown as ProseMirrorDoc | null;

  interface ProseMirrorNode {
    type: string;
    attrs?: { level?: number; src?: string; alt?: string; [key: string]: unknown };
    content?: ProseMirrorNode[];
    text?: string;
  }

  interface ProseMirrorDoc {
    type: string;
    content?: ProseMirrorNode[];
  }

  const renderDocContent = (doc: ProseMirrorDoc | null) => {
    if (!doc || !doc.content || !Array.isArray(doc.content)) {
      return (
        <p className="text-slate-500 italic">
          Nội dung chi tiết bài viết đang được biên tập...
        </p>
      );
    }

    return doc.content.map((node: ProseMirrorNode, idx: number) => {
      if (node.type === "heading") {
        const text = node.content?.map((c: ProseMirrorNode) => c.text || "").join("") || "";
        if (node.attrs?.level === 2) {
          return (
            <h2 key={idx} className="text-xl font-bold text-slate-900 mt-6 mb-3">
              {text}
            </h2>
          );
        }
        return (
          <h3 key={idx} className="text-lg font-bold text-slate-800 mt-4 mb-2">
            {text}
          </h3>
        );
      }

      if (node.type === "paragraph") {
        const text = node.content?.map((c: ProseMirrorNode) => c.text || "").join("") || "";
        return (
          <p key={idx} className="text-slate-700 leading-relaxed my-3 text-sm whitespace-pre-line">
            {text}
          </p>
        );
      }

      if (node.type === "blockquote") {
        return (
          <blockquote
            key={idx}
            className="border-l-4 border-[#087EC2] pl-4 my-4 italic text-slate-700 bg-sky-50/50 py-2 rounded-r-lg"
          >
            {node.content?.map((p: ProseMirrorNode, pIdx: number) => (
              <p key={pIdx} className="text-sm">
                {p.content?.map((c: ProseMirrorNode) => c.text || "").join("")}
              </p>
            ))}
          </blockquote>
        );
      }

      if (node.type === "image") {
        const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
        const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "Image";
        return (
          <div key={idx} className="my-5 rounded-xl overflow-hidden border border-slate-200">
            <img src={src} alt={alt} className="w-full max-h-96 object-cover" />
            {alt && (
              <p className="text-[11px] text-slate-400 text-center py-1.5 bg-slate-50">
                {alt}
              </p>
            )}
          </div>
        );
      }

      return null;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 rounded-2xl border-slate-200">
        {/* Top Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E9F7FF] text-[#087EC2]">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-[#123D68]">
                Bản Xem Trước Bài Viết EcoNews
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500">
                Mô phỏng giao diện đọc bài viết HMV Global Content Studio
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
              <strong>Bản xem trước nội bộ CMS:</strong> Mô phỏng hiển thị trên Website công khai theo định dạng chuẩn.
            </span>
          </div>
          <Badge variant="outline" className="text-[10px] bg-white border-amber-300 text-amber-800">
            /tin-tuc/{slug}
          </Badge>
        </div>

        {/* Article Body Content */}
        <div className="p-6 md:p-8 space-y-6 bg-white min-h-[500px]">
          {/* Article Header Meta */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              {categoryLabel && (
                <Badge variant="outline" className={`text-xs font-semibold border ${categoryMeta?.color || ""}`}>
                  {categoryLabel}
                </Badge>
              )}
              {article.isFeatured && (
                <Badge className="bg-amber-500 text-white text-[10px] gap-1 border-none">
                  <Sparkles className="h-3 w-3" />
                  <span>Bài Viết Nổi Bật</span>
                </Badge>
              )}
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span>{article.readTimeMinutes || 5} phút đọc</span>
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 leading-tight">
              {title || "Tiêu đề bài viết chưa được nhập"}
            </h1>

            {/* Author bar */}
            <div className="flex items-center gap-3 pt-1 text-xs text-slate-600">
              <div className="h-8 w-8 rounded-full bg-[#E9F7FF] text-[#087EC2] flex items-center justify-center font-bold">
                <User className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">{article.authorName || "Ban Biên Tập HMV"}</div>
                <div className="text-[11px] text-slate-400">{article.authorRole || "Chuyên gia nông nghiệp"}</div>
              </div>
              <span className="text-slate-300 ml-auto">•</span>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>{article.updatedAt || "Mới cập nhật"}</span>
              </div>
            </div>
          </div>

          {/* Cover Image */}
          {article.coverImage && (
            <div className="rounded-2xl overflow-hidden border border-slate-200 max-h-[420px] bg-slate-100">
              <img
                src={article.coverImage}
                alt={coverAlt || title}
                className="w-full h-full object-cover"
              />
              {coverAlt && (
                <p className="text-[11px] text-slate-500 px-4 py-2 bg-slate-50/80 border-t border-slate-100 italic">
                  Ảnh: {coverAlt}
                </p>
              )}
            </div>
          )}

          {/* Excerpt */}
          {excerpt && (
            <div className="rounded-xl border-l-4 border-[#087EC2] bg-[#F1FAFF]/70 p-4 text-xs sm:text-sm font-medium text-[#123D68] leading-relaxed">
              {excerpt}
            </div>
          )}

          {/* Main Rich Content */}
          <div className="pt-2 border-t border-slate-100">
            {renderDocContent(contentDoc)}
          </div>

          {/* SERP Search Preview Simulation */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-xs mt-8">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-2">
              <Search className="h-3.5 w-3.5 text-[#087EC2]" />
              <span>Hiển Thị Trên Google Tìm Kiếm (SERP Snippet)</span>
            </div>
            <div className="space-y-1 text-xs font-sans">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Globe className="h-3 w-3 text-slate-400" />
                <span>hmvglobal.vn &gt; tin-tuc &gt; {slug}</span>
              </div>
              <div className="text-base font-medium text-[#1a0dab] line-clamp-1">
                {metaTitle || `${title} | HMV Global News`}
              </div>
              <div className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                {metaDesc || excerpt || "Chưa có mô tả tóm tắt cho công cụ tìm kiếm."}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3">
          <span className="text-xs text-slate-500">
            Trạng thái: <strong>{article.status}</strong>
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Đóng Xem Trước
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
