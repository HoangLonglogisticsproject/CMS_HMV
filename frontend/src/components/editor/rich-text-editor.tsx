"use client";

import React, { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import LinkExtension from "@tiptap/extension-link";
import ImageExtension from "@tiptap/extension-image";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Undo,
  Redo,
  Code,
} from "lucide-react";
import { MediaPickerDialog, SelectedMediaResult } from "@/components/media/media-picker-dialog";
import { toast } from "sonner";
import { isSafeHref } from "./content-rules";

/**
 * Images must reference the media library (rich content v1: `image.attrs.mediaId`). `src` is only for display;
 * the API discards it and resolves the current URL from `mediaId`. Pasted <img> tags without a media id are dropped.
 */
const MediaImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-media-id"),
        renderHTML: (attrs: { mediaId?: string | null }) => (attrs.mediaId ? { "data-media-id": attrs.mediaId } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-media-id]" }];
  },
});

interface RichTextEditorProps {
  /** Locale of the content being edited: picks the VI or EN alt text when inserting an image. */
  locale?: "vi" | "en";
  content?: Record<string, unknown> | null | string;
  onChange?: (jsonContent: Record<string, unknown>) => void;
  placeholder?: string;
  editable?: boolean;
}

export function RichTextEditor({
  locale = "vi",
  content,
  onChange,
  placeholder = "Nhập nội dung bài viết chuyên sâu theo tiêu chuẩn HMV...",
  editable = true,
}: RichTextEditorProps) {
  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
        link: false, // StarterKit 3 bundles Link; it is configured once below
      }),
      LinkExtension.configure({
        openOnClick: false,
        // Same href rule as the backend, so autolinked/pasted links cannot be rejected on save.
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: {
          class: "text-[#087EC2] underline font-medium",
        },
      }),
      MediaImage.configure({
        HTMLAttributes: {
          class: "rounded-xl border border-slate-200 my-4 max-h-96 object-cover mx-auto",
        },
      }),
    ],
    content: content || "",
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-slate max-w-none focus:outline-none min-h-[220px] px-4 py-3 text-xs sm:text-sm leading-relaxed text-slate-800",
      },
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      if (onChange) {
        onChange(json);
      }
    },
  });

  // Keep content synced if content prop changes externally (e.g. locale switch)
  useEffect(() => {
    if (editor && content) {
      const currentJson = JSON.stringify(editor.getJSON());
      const nextJson = typeof content === "object" ? JSON.stringify(content) : content;
      if (currentJson !== nextJson) {
        // Loading or switching locale is not an edit: do not emit onUpdate (it would mark the form dirty).
        editor.commands.setContent(content, { emitUpdate: false });
      }
    } else if (editor && !content) {
      editor.commands.setContent("", { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) {
    return (
      <div className="h-48 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-400">
        Đang khởi tạo trình soạn thảo nội dung...
      </div>
    );
  }

  const handleInsertMedia = (media: SelectedMediaResult) => {
    const alt = (locale === "en" ? media.altEn : media.altVi) || null;
    editor.chain().focus().insertContent({ type: "image", attrs: { mediaId: media.id, src: media.url, alt } }).run();
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Nhập đường dẫn liên kết URL:", previousUrl);

    if (url === null) {
      return;
    }

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (!isSafeHref(url.trim())) {
      toast.error("Liên kết không hợp lệ", {
        description: "Chỉ dùng http(s)://, mailto:, tel:, đường dẫn bắt đầu bằng / hoặc #.",
      });
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden focus-within:border-[#087EC2] transition-colors">
      {/* Editor Formatting Toolbar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50/80 px-2 py-1.5 select-none">
          {/* Bold */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive("bold") ? "bg-[#087EC2] text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            title="In đậm (Bold)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>

          {/* Italic */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive("italic") ? "bg-[#087EC2] text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            title="In nghiêng (Italic)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-200 mx-1" />

          {/* Heading 2 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
              editor.isActive("heading", { level: 2 })
                ? "bg-[#087EC2] text-white"
                : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Tiêu đề H2"
          >
            H2
          </button>

          {/* Heading 3 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
              editor.isActive("heading", { level: 3 })
                ? "bg-[#087EC2] text-white"
                : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Tiêu đề H3"
          >
            H3
          </button>

          <span className="w-px h-4 bg-slate-200 mx-1" />

          {/* Bullet List */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive("bulletList") ? "bg-[#087EC2] text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Danh sách dấu chấm"
          >
            <List className="h-3.5 w-3.5" />
          </button>

          {/* Ordered List */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive("orderedList") ? "bg-[#087EC2] text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Danh sách số"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </button>

          {/* Blockquote */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive("blockquote") ? "bg-[#087EC2] text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Trích dẫn (Quote)"
          >
            <Quote className="h-3.5 w-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-200 mx-1" />

          {/* Link */}
          <button
            type="button"
            onClick={setLink}
            className={`p-1.5 rounded transition-colors ${
              editor.isActive("link") ? "bg-[#087EC2] text-white" : "text-slate-600 hover:bg-slate-200"
            }`}
            title="Chèn liên kết"
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </button>

          {/* Image Picker */}
          <button
            type="button"
            onClick={() => setIsMediaPickerOpen(true)}
            className="p-1.5 rounded text-slate-600 hover:bg-slate-200 transition-colors flex items-center gap-1"
            title="Chèn ảnh từ thư viện Media Asset"
          >
            <ImageIcon className="h-3.5 w-3.5 text-[#087EC2]" />
            <span className="text-[10px] font-semibold text-[#087EC2]">Thêm Ảnh</span>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().chain().focus().undo().run()}
              className="p-1.5 rounded text-slate-400 hover:text-slate-800 disabled:opacity-30"
              title="Hoàn tác (Undo)"
            >
              <Undo className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().chain().focus().redo().run()}
              className="p-1.5 rounded text-slate-400 hover:text-slate-800 disabled:opacity-30"
              title="Làm lại (Redo)"
            >
              <Redo className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Editor Content Area */}
      <EditorContent editor={editor} />

      {/* Reusable Media Picker Dialog */}
      <MediaPickerDialog
        isOpen={isMediaPickerOpen}
        onClose={() => setIsMediaPickerOpen(false)}
        onSelect={handleInsertMedia}
        title="Chèn Hình Ảnh Vào Bài Viết"
      />
    </div>
  );
}
