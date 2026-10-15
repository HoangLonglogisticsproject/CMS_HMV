"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Search,
  Edit3,
  Eye,
  Copy,
  Layers,
  ArrowUpDown,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePages } from "../queries/use-pages";
import { PageContentItem, PageContentType } from "@/lib/mocks/types";
import { ContentStatusTag } from "@/components/common/content-status-tag";
import { evaluatePageSeo, evaluatePageLocalization } from "../utils/page-evaluator";
import { PagePreviewDialog } from "./page-preview-dialog";
import { toast } from "sonner";

export function PagesView() {
  const router = useRouter();
  const { data: pages = [], isLoading } = usePages();

  const [globalFilter, setGlobalFilter] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [activeLocale, setActiveLocale] = useState<"vi" | "en">("vi");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [previewPage, setPreviewPage] = useState<PageContentItem | null>(null);

  // Filter data based on type & status
  const filteredData = useMemo(() => {
    return pages.filter((page) => {
      const matchType = selectedType === "ALL" || page.contentType === selectedType;
      const matchStatus = selectedStatus === "ALL" || page.status === selectedStatus;
      return matchType && matchStatus;
    });
  }, [pages, selectedType, selectedStatus]);

  // Metric strip calculations
  const totalPages = pages.length;
  const publishedCount = pages.filter((p) => p.status === "PUBLISHED").length;
  const inReviewCount = pages.filter((p) => p.status === "IN_REVIEW").length;
  const avgSeoScore = useMemo(() => {
    if (pages.length === 0) return 0;
    const sum = pages.reduce((acc, p) => acc + evaluatePageSeo(p.seo, "vi").overallPercentage, 0);
    return Math.round(sum / pages.length);
  }, [pages]);

  const columns = useMemo<ColumnDef<PageContentItem>[]>(() => [
    {
      accessorKey: "titleVi",
      header: ({ column }) => (
        <button
          type="button"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="flex items-center gap-1.5 font-semibold text-slate-700 hover:text-slate-900"
        >
          <span>Trang &amp; Đường Dẫn</span>
          <ArrowUpDown className="h-3 w-3 text-slate-400" />
        </button>
      ),
      cell: ({ row }) => {
        const page = row.original;
        const title = activeLocale === "vi" ? page.titleVi : (page.titleEn || page.titleVi);
        const slug = activeLocale === "vi" ? page.slugVi : (page.slugEn || page.slugVi);

        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-xs text-slate-900 hover:text-[#087EC2] cursor-pointer"
                onClick={() => router.push(`/content/pages/${page.id}`)}
              >
                {title}
              </span>
              <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                {page.systemKey}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500">
              <span className="text-[#087EC2]">/{activeLocale}/{slug}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(`/${activeLocale}/${slug}`);
                  toast.success(`Đã sao chép đường dẫn /${activeLocale}/${slug}`);
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5"
                title="Sao chép đường dẫn"
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "contentType",
      header: "Phân Loại",
      cell: ({ row }) => {
        const type = row.getValue("contentType") as PageContentType;
        const labels: Record<string, { text: string; bg: string }> = {
          LANDING: { text: "Landing Page", bg: "bg-blue-50 text-blue-700 border-blue-200" },
          SUPPLY_CHAIN: { text: "Chuỗi Cung Ứng", bg: "bg-cyan-50 text-cyan-700 border-cyan-200" },
          CATALOG: { text: "Danh Mục Nông Sản", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
          STANDARDS: { text: "Tiêu Chuẩn QA", bg: "bg-purple-50 text-purple-700 border-purple-200" },
          EDITORIAL: { text: "Bài Viết", bg: "bg-slate-50 text-slate-700 border-slate-200" },
        };
        const config = labels[type] || { text: type, bg: "bg-slate-50 text-slate-700 border-slate-200" };
        return (
          <Badge variant="outline" className={`text-[10px] font-medium border ${config.bg}`}>
            {config.text}
          </Badge>
        );
      },
    },
    {
      accessorKey: "sectionsCount",
      header: "Cấu Trúc Sections",
      cell: ({ row }) => {
        const page = row.original;
        const count = page.sections?.length || page.sectionsCount || 0;
        return (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <Layers className="h-3.5 w-3.5 text-[#087EC2]" />
            <span className="font-semibold">{count}</span>
            <span className="text-[11px] text-slate-400">khối</span>
          </div>
        );
      },
    },
    {
      id: "localization",
      header: "Độ Phủ Song Ngữ",
      cell: ({ row }) => {
        const loc = evaluatePageLocalization(row.original);
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-500">VI:</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1 rounded">
                {loc.viPercentage}%
              </span>
              <span className="text-[10px] font-semibold text-slate-500 ml-1">EN:</span>
              <span className={`text-[10px] font-bold px-1 rounded ${
                loc.enPercentage >= 80 ? "text-blue-700 bg-blue-50" : "text-amber-700 bg-amber-50"
              }`}>
                {loc.enPercentage}%
              </span>
            </div>
            {loc.missingEnFields.length > 0 && (
              <span className="text-[10px] text-amber-600 block">
                Thiếu {loc.missingEnFields.length} mục EN
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: "seoReadiness",
      header: "Kiểm Định SEO (Checklist)",
      cell: ({ row }) => {
        const seo = evaluatePageSeo(row.original.seo, activeLocale);
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                  seo.passedCount === seo.totalCount
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : seo.passedCount >= 3
                    ? "bg-sky-50 text-sky-800 border-sky-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {seo.passedCount === seo.totalCount ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-3 w-3 text-sky-600" />
                )}
                <span>{seo.passedCount}/{seo.totalCount} Tiêu chí</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">{seo.overallPercentage}%</span>
            </div>
            <div className="w-24 bg-slate-100 rounded-full h-1 overflow-hidden">
              <div
                className={`h-1 rounded-full ${
                  seo.overallPercentage >= 80 ? "bg-emerald-500" : "bg-sky-500"
                }`}
                style={{ width: `${seo.overallPercentage}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Trạng Thái",
      cell: ({ row }) => <ContentStatusTag status={row.getValue("status")} />,
    },
    {
      accessorKey: "updatedAt",
      header: "Cập Nhật",
      cell: ({ row }) => (
        <div className="text-[11px] text-slate-500 space-y-0.5">
          <div>{row.getValue("updatedAt")}</div>
          <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
            {row.original.lastEditor || "Admin"}
          </div>
        </div>
      ),
    },
    {
      id: "actions",
      header: () => <span className="text-right block pr-2">Thao Tác</span>,
      cell: ({ row }) => {
        const page = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPreviewPage(page)}
              className="h-7 text-xs px-2 gap-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              title="Xem trước nội dung"
            >
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              <span>Xem</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/content/pages/${page.id}`)}
              className="h-7 text-xs px-2.5 gap-1 text-slate-700 hover:text-[#0066CC] hover:bg-[#E9F7FF] font-medium"
              title="Biên tập trang"
            >
              <Edit3 className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#0066CC]" />
              <span>Biên tập</span>
            </Button>
          </div>
        );
      },
    },
  ], [activeLocale, router]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-5">
      {/* 1. Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#E9F7FF] text-[#0066CC]">
              <FileText className="h-4 w-4" />
            </div>
            <h1 className="text-base font-bold text-[#113E67]">
              Trang website &amp; Landing Pages
            </h1>
            <Badge variant="outline" className="text-[10px] bg-sky-50 text-[#0066CC] border-[#bae6fd] font-semibold">
              Demo State
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Trung tâm điều phối cấu trúc các khối sections, câu chuyện thương mại Blue Ocean và kiểm định SEO song ngữ.
          </p>
        </div>

        {/* Locale switch */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-500">Ngôn ngữ bảng:</span>
          <div className="flex items-center border border-slate-200 rounded-lg p-0.5 bg-white text-xs">
            <button
              type="button"
              onClick={() => setActiveLocale("vi")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeLocale === "vi"
                  ? "bg-[#0066CC] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tiếng Việt
            </button>
            <button
              type="button"
              onClick={() => setActiveLocale("en")}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                activeLocale === "en"
                  ? "bg-[#0066CC] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              English
            </button>
          </div>
        </div>
      </div>

      {/* 2. Executive Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3 border-slate-200 shadow-2xs bg-white">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Tổng Số Trang
          </div>
          <div className="text-xl font-bold text-[#123D68] mt-1">{totalPages}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Trang cấu hình trong CMS</div>
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
            Đang Kiểm Duyệt
          </div>
          <div className="text-xl font-bold text-amber-600 mt-1">{inReviewCount}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Chờ phê duyệt ban giám đốc</div>
        </Card>

        <Card className="p-3 border-slate-200 shadow-2xs bg-white">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            SEO Readiness TB
          </div>
          <div className="text-xl font-bold text-[#087EC2] mt-1">{avgSeoScore}%</div>
          <div className="text-[10px] text-slate-400 mt-0.5">Tính theo 5 tiêu chuẩn kỹ thuật</div>
        </Card>
      </div>

      {/* 3. Search & Filter Bar */}
      <Card className="p-3 border-slate-200 shadow-2xs bg-white">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Tìm theo tiêu đề trang, mã systemKey hoặc đường dẫn slug..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 h-8 text-xs bg-slate-50/70 border-slate-200"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Type Filter */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#087EC2]"
            >
              <option value="ALL">Tất cả phân loại</option>
              <option value="LANDING">Landing Page</option>
              <option value="SUPPLY_CHAIN">Chuỗi Cung Ứng</option>
              <option value="CATALOG">Danh Mục Nông Sản</option>
              <option value="STANDARDS">Tiêu Chuẩn QA</option>
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#087EC2]"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="PUBLISHED">Đã xuất bản</option>
              <option value="IN_REVIEW">Đang duyệt</option>
              <option value="DRAFT">Bản nháp</option>
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
                    <span>Đang tải danh sách trang từ TanStack Query cache...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 cursor-pointer"
                  onClick={() => router.push(`/content/pages/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="py-3 text-xs"
                      onClick={(e) => {
                        // Prevent row click when clicking on action buttons or copy links
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
                  Không tìm thấy trang nào phù hợp với bộ lọc tìm kiếm hiện tại.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Table Footer with Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <div>
            Hiển thị <strong>{table.getRowModel().rows.length}</strong> trên tổng số{" "}
            <strong>{pages.length}</strong> trang
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 text-xs px-2.5"
            >
              Trang trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 text-xs px-2.5"
            >
              Trang sau
            </Button>
          </div>
        </div>
      </Card>

      {/* 5. Fast Preview Dialog */}
      {previewPage && (
        <PagePreviewDialog
          isOpen={Boolean(previewPage)}
          onClose={() => setPreviewPage(null)}
          data={{
            id: previewPage.id,
            systemKey: previewPage.systemKey,
            contentType: previewPage.contentType || "LANDING",
            titleVi: previewPage.titleVi,
            titleEn: previewPage.titleEn,
            slugVi: previewPage.slugVi,
            slugEn: previewPage.slugEn,
            status: previewPage.status,
            sections: previewPage.sections || [],
            seo: previewPage.seo,
          }}
          defaultLocale={activeLocale}
        />
      )}
    </div>
  );
}
