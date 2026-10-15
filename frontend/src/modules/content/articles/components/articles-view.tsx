"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Newspaper,
  Search,
  Plus,
  Eye,
  Edit3,
  Calendar,
  Clock,
  Sparkles,
  User,
  Filter,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  type ArticleListParams,
  type ArticleSummary,
  useArticleCategories,
  useArticlePreviews,
  useArticleStats,
  useArticles,
  useCreateArticle,
} from "../queries/use-articles";
import { ContentStatusTag } from "@/components/common/content-status-tag";
import { ARTICLE_CATEGORY_METADATA } from "../schemas/article-schema";
import { ArticlePreviewDialog } from "./article-preview-dialog";
import { previewFromServer, publicPath } from "../utils/article-form";
import { useCan, useSession } from "@/modules/auth/queries/use-session";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils/format";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const PREVIEW_LOCALES = ["vi", "en"] as const;

/** Server-rendered draft preview (GET /admin/articles/:id/preview): what reviewers check before approving. */
function ServerPreviewDialog({
  article,
  onClose,
  locale,
}: {
  article: ArticleSummary;
  onClose: () => void;
  locale: "vi" | "en";
}) {
  const [vi, en] = useArticlePreviews(article.id, PREVIEW_LOCALES);
  const failure = vi.error ?? en.error;
  useEffect(() => {
    if (failure) {
      toast.error("Không tải được bản xem trước", { description: errorMessage(failure) });
      onClose();
    }
  }, [failure, onClose]);
  if (vi.isPending || en.isPending || failure) return null;
  return (
    <ArticlePreviewDialog
      isOpen
      onClose={onClose}
      article={previewFromServer(vi.data ?? null, en.data ?? null, article.status)}
      defaultLocale={locale}
    />
  );
}

export function ArticlesView() {
  const router = useRouter();
  const can = useCan();
  const { data: session } = useSession();
  const createArticleMutation = useCreateArticle();
  const { data: categories = [] } = useArticleCategories();

  const [globalFilter, setGlobalFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [activeLocale, setActiveLocale] = useState<"vi" | "en">("vi");
  const [page, setPage] = useState(1);
  const [previewArticle, setPreviewArticle] = useState<ArticleSummary | null>(null);

  // Search is sent to the API, debounced.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(globalFilter.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [globalFilter]);

  // Filtering, search and pagination happen server-side.
  const params: ArticleListParams = {
    page,
    pageSize: PAGE_SIZE,
    sort: "-updatedAt",
    search: search || undefined,
    category: selectedCategory === "ALL" ? undefined : selectedCategory,
    status:
      selectedStatus === "PUBLISHED" || selectedStatus === "DRAFT" || selectedStatus === "ARCHIVED"
        ? selectedStatus
        : undefined,
    awaitingReview: selectedStatus === "IN_REVIEW" ? true : undefined,
  };
  const { data: list, isLoading, error: listError } = useArticles(params);
  const articles = useMemo(() => list?.items ?? [], [list]);
  const total = list?.total ?? 0;

  // Executive Metric Strip: counts across all pages
  const { data: stats } = useArticleStats();
  const totalArticles = stats?.total ?? 0;
  const publishedCount = stats?.published ?? 0;
  const inReviewCount = stats?.awaitingReview ?? 0;
  const featuredCount = stats?.featured ?? 0;

  const handleCreateNewArticle = () => {
    createArticleMutation.mutate(
      {
        categoryCode: categories[0]?.code ?? "SUPPLY_CHAIN_INSIGHTS",
        authorName: session?.user.displayName,
        translations: [
          {
            locale: "vi",
            title: "Bản Phân Tích Chuỗi Cung Ứng Nông Sản Mới (Bản Nháp)",
            slug: `bai-viet-moi-${Date.now().toString(36)}`,
          },
        ],
      },
      {
        onSuccess: (newArt) => {
          toast.success("Đã tạo bản nháp bài viết mới!");
          router.push(`/content/articles/${newArt.id}`);
        },
        onError: (err) => {
          toast.error("Không thể tạo bài viết mới", { description: errorMessage(err) });
        },
      }
    );
  };

  const columns = useMemo<ColumnDef<ArticleSummary>[]>(() => [
    {
      id: "title",
      header: () => (
        <span className="flex items-center gap-1.5 font-semibold text-slate-700">
          <span>Bài Viết &amp; Tiêu Đề</span>
        </span>
      ),
      cell: ({ row }) => {
        const article = row.original;
        const vi = article.translations.find((t) => t.locale === "vi");
        const en = article.translations.find((t) => t.locale === "en");
        const current = activeLocale === "vi" ? (vi ?? en) : (en ?? vi);
        const title = current?.title ?? "";
        const slug = current?.slug ?? "";

        return (
          <div className="flex items-center gap-3">
            {article.coverMedia ? (
              <div className="h-10 w-14 rounded-lg overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
                <img src={article.coverMedia.url} alt={title} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="h-10 w-14 rounded-lg shrink-0 border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] text-slate-400">
                No Img
              </div>
            )}

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span
                  onClick={() => router.push(`/content/articles/${article.id}`)}
                  className="font-semibold text-xs text-slate-900 hover:text-[#087EC2] cursor-pointer truncate max-w-sm"
                  title={title}
                >
                  {title}
                </span>
                {article.isFeatured && (
                  <Badge className="bg-amber-500 text-white text-[9px] px-1.5 py-0 border-none">
                    Nổi bật
                  </Badge>
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-400 truncate">
                {publicPath(slug)}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "categoryCode",
      header: "Chuyên Mục",
      cell: ({ row }) => {
        const code = row.original.categoryCode;
        const meta = ARTICLE_CATEGORY_METADATA[code];
        const name = categories
          .find((c) => c.code === code)
          ?.names.find((n) => n.locale === activeLocale)?.name;
        return (
          <Badge variant="outline" className={`text-[10px] border ${meta?.color || ""}`}>
            {name ?? code}
          </Badge>
        );
      },
    },
    {
      accessorKey: "authorName",
      header: "Tác Giả & Đọc",
      cell: ({ row }) => {
        const article = row.original;
        const readTime =
          article.translations.find((t) => t.locale === activeLocale)?.readTimeMinutes ?? 0;
        return (
          <div className="text-xs space-y-0.5">
            <div className="font-medium text-slate-800">
              {article.authorName ?? article.updatedBy.displayName}
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{readTime} phút đọc</span>
            </div>
          </div>
        );
      },
    },
    {
      id: "translation",
      header: "Bản Dịch",
      cell: ({ row }) => {
        const art = row.original;
        const vi = art.translations.find((t) => t.locale === "vi");
        const en = art.translations.find((t) => t.locale === "en");
        const hasVi = Boolean(vi);
        const hasEn = Boolean(en);
        const state = (t?: (typeof art.translations)[number]) =>
          !t
            ? "Chưa có"
            : t.isLive && !t.hasUnpublishedChanges
              ? "Đang xuất bản"
              : t.reviewStatus === "APPROVED"
                ? "Đã duyệt"
                : "Chưa duyệt";

        return (
          <div className="flex items-center gap-1.5">
            <span
              title={`VI: ${state(vi)}`}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                hasVi ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"
              }`}
            >
              VI
            </span>
            <span
              title={`EN: ${state(en)}`}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                hasEn ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {hasEn ? "EN" : "Thiếu EN"}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Trạng Thái",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <ContentStatusTag status={row.original.status} />
          {row.original.hasUnpublishedChanges && (
            <Badge variant="warning" className="text-[9px]">
              Có bản nháp mới
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Cập Nhật",
      cell: ({ row }) => (
        <span className="text-[11px] text-slate-400">{formatDateTime(row.original.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="text-right block pr-2">Thao Tác</span>,
      cell: ({ row }) => {
        const article = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewArticle(article)}
              className="h-7 text-xs px-2 gap-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              title="Xem trước bài viết"
            >
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              <span>Xem</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/content/articles/${article.id}`)}
              className="h-7 text-xs px-2.5 gap-1 text-slate-700 hover:text-[#0066CC] hover:bg-[#E9F7FF] font-medium"
              title="Biên tập bài viết"
            >
              <Edit3 className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#0066CC]" />
              <span>Biên tập</span>
            </Button>
          </div>
        );
      },
    },
  ], [activeLocale, router, categories]);

  const table = useReactTable({
    data: articles,
    columns,
    manualPagination: true,
    rowCount: total,
    getCoreRowModel: getCoreRowModel(),
  });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      {/* 1. Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#E9F7FF] text-[#087EC2]">
              <Newspaper className="h-4 w-4" />
            </div>
            <h1 className="text-base font-bold text-[#123D68]">
              Tin Tức &amp; Bài Viết Chuyên Sâu (EcoNews Studio)
            </h1>
            <Badge variant="outline" className="text-[10px] text-slate-500">
              Editorial Studio
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản trị các bài viết chuyên môn về chuỗi cung ứng, công nghệ chế biến sâu, vận hành logistics và tiêu chuẩn xanh
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {/* Locale switch */}
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-white text-xs">
            <button
              type="button"
              onClick={() => setActiveLocale("vi")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeLocale === "vi" ? "bg-[#087EC2] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tiếng Việt
            </button>
            <button
              type="button"
              onClick={() => setActiveLocale("en")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeLocale === "en" ? "bg-[#087EC2] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              English
            </button>
          </div>

          {/* Create Button */}
          {can("article:write") && (
          <Button
            size="sm"
            onClick={handleCreateNewArticle}
            disabled={createArticleMutation.isPending}
            className="h-8 text-xs bg-[#087EC2] hover:bg-[#066ba8] text-white font-semibold gap-1.5 shadow-2xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Tạo Bài Viết Mới</span>
          </Button>
          )}
        </div>
      </div>

      {/* 2. Executive Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 border-slate-200 shadow-2xs bg-white">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Tổng Bài Viết
          </div>
          <div className="text-xl font-bold text-[#123D68] mt-1">{totalArticles}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Kho dữ liệu nội dung CMS</div>
        </Card>

        <Card className="p-3 border-slate-200 shadow-2xs bg-white">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Đã Xuất Bản
          </div>
          <div className="text-xl font-bold text-emerald-600 mt-1">{publishedCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Đang hiển thị công khai</div>
        </Card>

        <Card className="p-3 border-slate-200 shadow-2xs bg-white">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Chờ Kiểm Duyệt
          </div>
          <div className="text-xl font-bold text-amber-600 mt-1">{inReviewCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Cần phê duyệt xuất bản</div>
        </Card>

        <Card className="p-3 border-slate-200 shadow-2xs bg-white">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Bài Viết Nổi Bật
          </div>
          <div className="text-xl font-bold text-[#087EC2] mt-1">{featuredCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Gắn huy hiệu Featured</div>
        </Card>
      </div>

      {/* 3. Search & Filter Bar */}
      <Card className="p-3 border-slate-200 shadow-2xs bg-white">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Tìm theo tiêu đề bài viết, tác giả hoặc đường dẫn slug..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 h-8 text-xs bg-slate-50/70 border-slate-200"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#087EC2]"
            >
              <option value="ALL">Tất cả chuyên mục</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.names.find((n) => n.locale === "vi")?.name ?? c.code}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#087EC2]"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PUBLISHED">Đã xuất bản</option>
              <option value="IN_REVIEW">Đang kiểm duyệt</option>
              <option value="DRAFT">Bản nháp</option>
              <option value="ARCHIVED">Lưu trữ</option>
            </select>
          </div>
        </div>
      </Card>

      {/* 4. TanStack Table Workspace */}
      <Card className="border-slate-200 shadow-2xs overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-slate-50/80 border-b border-slate-200">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="text-xs font-bold text-slate-700 py-3">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-xs text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#087EC2] border-t-transparent" />
                    <span>Đang tải danh sách bài viết từ TanStack Query cache...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : listError ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-xs text-rose-600">
                  Không tải được danh sách bài viết: {errorMessage(listError)}
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 cursor-pointer"
                  onClick={() => router.push(`/content/articles/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="py-3 text-xs"
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button")) {
                          e.stopPropagation();
                        }
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-xs text-slate-500">
                  Không tìm thấy bài viết nào phù hợp với bộ lọc tìm kiếm.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <div>
            Hiển thị <strong>{table.getRowModel().rows.length}</strong> trên tổng số{" "}
            <strong>{total}</strong> bài viết · Trang {page}/{pageCount}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="h-7 text-xs px-2.5"
            >
              Trang trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageCount}
              className="h-7 text-xs px-2.5"
            >
              Trang sau
            </Button>
          </div>
        </div>
      </Card>

      {/* 5. Fast Preview Modal */}
      {previewArticle && (
        <ServerPreviewDialog
          article={previewArticle}
          onClose={() => setPreviewArticle(null)}
          locale={activeLocale}
        />
      )}
    </div>
  );
}
