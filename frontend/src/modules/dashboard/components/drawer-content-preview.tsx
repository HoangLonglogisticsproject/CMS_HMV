"use client";

import React from "react";
import {
  Search,
  BookOpen,
  Sparkles,
  Globe,
  Image as ImageIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Schemas } from "@/lib/api/client";

type PublicArticle = Schemas["PublicArticle"];
type ArticleDetail = Schemas["ArticleDetailResponse"];

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

interface DrawerContentPreviewProps {
  activeLocale: "vi" | "en";
  currentPreview: PublicArticle | null | undefined;
  currentTranslation: ArticleDetail["translations"][number] | undefined;
}

/** Render rich content from ProseMirror JSON */
function RenderRichContent({ doc }: { doc: ProseMirrorDoc | null }) {
  if (!doc || !doc.content || !Array.isArray(doc.content) || doc.content.length === 0) {
    return (
      <div className="py-8 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
        <BookOpen className="h-6 w-6 text-slate-300 mx-auto mb-2" />
        <p className="text-xs text-slate-500 italic">
          Bản dịch này hiện chưa có nội dung văn bản chi tiết.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-slate-800 leading-relaxed text-sm">
      {doc.content.map((node, idx) => {
        if (node.type === "heading") {
          const text = node.content?.map((c) => c.text || "").join("") || "";
          if (node.attrs?.level === 2) {
            return (
              <h2
                key={idx}
                className="text-lg sm:text-xl font-bold text-slate-900 pt-3 pb-1 border-b border-slate-100"
              >
                {text}
              </h2>
            );
          }
          return (
            <h3 key={idx} className="text-base font-bold text-slate-800 pt-2 pb-0.5">
              {text}
            </h3>
          );
        }

        if (node.type === "paragraph") {
          const text = node.content?.map((c) => c.text || "").join("") || "";
          if (!text.trim()) return null;
          return (
            <p key={idx} className="leading-relaxed whitespace-pre-line text-slate-700">
              {text}
            </p>
          );
        }

        if (node.type === "blockquote") {
          return (
            <blockquote
              key={idx}
              className="border-l-4 border-[#0066CC] pl-4 py-2 italic text-slate-700 bg-sky-50/40 rounded-r-lg my-3"
            >
              {node.content?.map((p, pIdx) => (
                <p key={pIdx} className="text-xs sm:text-sm">
                  {p.content?.map((c) => c.text || "").join("")}
                </p>
              ))}
            </blockquote>
          );
        }

        if (node.type === "bulletList" || node.type === "bullet_list") {
          return (
            <ul key={idx} className="list-disc pl-5 space-y-1.5 text-slate-700 text-xs sm:text-sm">
              {node.content?.map((li, liIdx) => (
                <li key={liIdx}>
                  {li.content?.map((p) => p.content?.map((c) => c.text || "").join("")).join(" ")}
                </li>
              ))}
            </ul>
          );
        }

        if (node.type === "orderedList" || node.type === "ordered_list") {
          return (
            <ol key={idx} className="list-decimal pl-5 space-y-1.5 text-slate-700 text-xs sm:text-sm">
              {node.content?.map((li, liIdx) => (
                <li key={liIdx}>
                  {li.content?.map((p) => p.content?.map((c) => c.text || "").join("")).join(" ")}
                </li>
              ))}
            </ol>
          );
        }

        if (node.type === "image") {
          const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
          const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "Ảnh minh họa";
          return (
            <div key={idx} className="my-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
              {src ? (
                <img src={src} alt={alt} className="w-full max-h-80 object-cover" />
              ) : (
                <div className="h-40 flex items-center justify-center text-slate-400 text-xs">
                  Ảnh chưa được thiết lập URL
                </div>
              )}
              {alt && (
                <p className="text-[11px] text-slate-500 text-center py-1.5 bg-slate-50/90 border-t border-slate-100">
                  {alt}
                </p>
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

export function DrawerContentPreview({
  activeLocale,
  currentPreview,
  currentTranslation,
}: DrawerContentPreviewProps) {
  // If no translation exists for this locale
  if (!currentTranslation && !currentPreview) {
    return (
      <div className="py-12 px-6 text-center bg-slate-50/60 rounded-xl border border-dashed border-slate-200 space-y-3">
        <div className="h-12 w-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 mx-auto">
          <Globe className="h-6 w-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-700">
            Chưa có bản dịch {activeLocale.toUpperCase()}
          </h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
            Biên tập viên chưa tạo bản dịch cho ngôn ngữ này. Bạn có thể chuyển sang tab ngôn ngữ khác để xem xét và duyệt nội dung.
          </p>
        </div>
      </div>
    );
  }

  const excerpt = currentPreview?.excerpt || currentTranslation?.excerpt;
  const coverUrl = currentPreview?.cover?.url;
  const coverAlt =
    (typeof currentPreview?.cover?.alt === "string" ? currentPreview.cover.alt : null) ||
    currentTranslation?.coverImageAlt ||
    "Ảnh bìa bài viết";

  const slug = currentPreview?.slug || currentTranslation?.slug || "draft";
  const seoTitle =
    currentPreview?.seo?.title ||
    currentTranslation?.seoTitle ||
    currentPreview?.title ||
    currentTranslation?.title ||
    "Tiêu đề tìm kiếm";
  const seoDescription =
    currentPreview?.seo?.description ||
    currentTranslation?.seoDescription ||
    excerpt ||
    "Chưa có mô tả tóm tắt cho công cụ tìm kiếm.";

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <div className="flex items-center justify-between gap-3 p-3 bg-amber-50/60 border border-amber-200/70 rounded-xl text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            <strong>Bản xem trước nội dung:</strong> Mô phỏng cấu trúc xuất bản công khai từ dữ liệu máy chủ NestJS.
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] bg-white text-amber-800 border-amber-200 shrink-0">
          /tin-tuc/{slug}
        </Badge>
      </div>

      {/* Excerpt Banner */}
      {excerpt && (
        <div className="p-3.5 bg-slate-50 border-l-4 border-[#0066CC] rounded-r-xl text-xs sm:text-sm italic text-slate-700 leading-relaxed">
          {excerpt}
        </div>
      )}

      {/* Cover Image Preview */}
      {coverUrl ? (
        <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <img
            src={coverUrl}
            alt={coverAlt}
            className="w-full max-h-72 object-cover"
          />
          <p className="text-[11px] text-slate-400 text-center py-1 bg-slate-50/90 border-t border-slate-100">
            Ảnh bìa: {coverAlt}
          </p>
        </div>
      ) : (
        <div className="p-4 bg-slate-50/60 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <ImageIcon className="h-4 w-4 text-slate-300" />
          <span>Bài viết chưa có ảnh bìa</span>
        </div>
      )}

      {/* Main Body Content */}
      <div className="prose prose-slate max-w-none pt-2">
        <RenderRichContent
          doc={
            (currentPreview?.content ||
              currentTranslation?.content) as ProseMirrorDoc | null
          }
        />
      </div>

      {/* Google SERP Snippet Preview */}
      <div className="mt-6 pt-5 border-t border-slate-200 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wide">
          <Search className="h-3.5 w-3.5 text-[#0066CC]" />
          <span>Hiển Thị Trên Google Tìm Kiếm (SERP Snippet)</span>
        </div>
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-1">
          <p className="text-[11px] text-emerald-700 font-mono">
            hmvglobal.vn &gt; tin-tuc &gt; {slug}
          </p>
          <h4 className="text-sm font-semibold text-[#1a0dab] hover:underline cursor-pointer">
            {seoTitle}
          </h4>
          <p className="text-xs text-slate-600 line-clamp-2">
            {seoDescription}
          </p>
        </div>
      </div>
    </div>
  );
}
