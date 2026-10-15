"use client";

import React, { useState } from "react";
import {
  Boxes,
  Plus,
  Search,
  Edit2,
  X,
  Check,
} from "lucide-react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getFilteredRowModel,
} from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCommodities, useUpdateCommodity } from "../queries/use-commodities";
import { CommodityItem } from "@/lib/mocks/types";
import { ContentStatusTag } from "@/components/common/content-status-tag";

export function CommoditiesView() {
  const { data: commodities = [], isLoading } = useCommodities();
  const updateCommodityMutation = useUpdateCommodity();
  const [globalFilter, setGlobalFilter] = useState("");
  const [activeLocale, setActiveLocale] = useState<"vi" | "en">("vi");
  const [editingItem, setEditingItem] = useState<CommodityItem | null>(null);

  // TanStack Table columns definition
  const columns: ColumnDef<CommodityItem>[] = [
    {
      accessorKey: "code",
      header: "Mã Nông Sản (Code)",
      cell: ({ row }) => (
        <span className="font-mono text-xs font-semibold text-[#087EC2]">
          {row.getValue("code")}
        </span>
      ),
    },
    {
      id: "name",
      header: "Tên Nông Sản",
      cell: ({ row }) => {
        const item = row.original;
        return (
          <div>
            <div className="font-semibold text-xs text-slate-800">
              {activeLocale === "vi" ? item.nameVi : item.nameEn}
            </div>
            <div className="text-[10px] text-slate-400">
              {activeLocale === "vi" ? `EN: ${item.nameEn}` : `VI: ${item.nameVi}`}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "originRegion",
      header: "Vùng Trồng / Xuất Xứ",
      cell: ({ row }) => <span className="text-xs text-slate-600">{row.getValue("originRegion")}</span>,
    },
    {
      accessorKey: "variantsCount",
      header: "Quy Cách (Variants)",
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px]">
          {row.getValue("variantsCount")} quy cách
        </Badge>
      ),
    },
    {
      accessorKey: "status",
      header: "Trạng Thái",
      cell: ({ row }) => <ContentStatusTag status={row.getValue("status")} />,
    },
    {
      accessorKey: "updatedAt",
      header: "Ngày Cập Nhật",
      cell: ({ row }) => <span className="text-xs text-slate-400">{row.getValue("updatedAt")}</span>,
    },
    {
      id: "actions",
      header: "Hành Động",
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setEditingItem(row.original)}
        >
          <Edit2 className="h-3 w-3 text-slate-500" />
          <span>Sửa</span>
        </Button>
      ),
    },
  ];

  const table = useReactTable({
    data: commodities,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 6,
      },
    },
  });

  const handleSaveDrawer = () => {
    if (!editingItem) return;
    updateCommodityMutation.mutate(
      {
        id: editingItem.id,
        payload: {
          nameVi: editingItem.nameVi,
          nameEn: editingItem.nameEn,
          originRegion: editingItem.originRegion,
        },
      },
      {
        onSuccess: () => {
          setEditingItem(null);
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-[#E9F7FF] text-[#087EC2]">
              <Boxes className="h-4 w-4" />
            </div>
            <h1 className="text-lg font-bold text-[#123D68]">
              Nông Sản & Nguyên Liệu (Commodities Management)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Danh mục nông sản xuất khẩu chủ lực và thông số kỹ thuật (Chanh leo, Cà phê, Hạt điều, Tiêu)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center border border-slate-200 rounded-md p-0.5 bg-white text-xs">
            <button
              type="button"
              onClick={() => setActiveLocale("vi")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeLocale === "vi"
                  ? "bg-[#087EC2] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tiếng Việt
            </button>
            <button
              type="button"
              onClick={() => setActiveLocale("en")}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                activeLocale === "en"
                  ? "bg-[#087EC2] text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              English
            </button>
          </div>

          <Button
            variant="default"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => alert("Thêm nông sản mới (Phiên demo)")}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Thêm Nông Sản</span>
          </Button>
        </div>
      </div>

      {/* Filter and TanStack Table Card */}
      <Card className="p-0 overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="relative w-80">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Tìm theo tên, mã code hoặc vùng trồng..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 text-xs"
            />
          </div>
          <span className="text-xs text-slate-400">
            Tổng cộng: <strong className="text-slate-700">{table.getFilteredRowModel().rows.length}</strong> nông sản
          </span>
        </div>

        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
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
                <TableCell colSpan={columns.length} className="text-center py-8 text-slate-400">
                  Đang tải danh sách nông sản...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-slate-400">
                  Không tìm thấy nông sản nào phù hợp.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination Toolbar */}
        <div className="p-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>
            Trang {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Sau
            </Button>
          </div>
        </div>
      </Card>

      {/* Slide-over Inspection Sheet (Pure Tailwind/Radix style) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/30 flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[#123D68]">Chi Tiết Nông Sản</h3>
                <p className="text-[11px] text-slate-400 font-mono">{editingItem.code}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingItem(null)}
                className="h-7 w-7 text-slate-400 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 p-5 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Nông Sản Tiếng Việt (VI)
                </label>
                <Input
                  value={editingItem.nameVi}
                  onChange={(e) => setEditingItem({ ...editingItem, nameVi: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tên Nông Sản Tiếng Anh (EN)
                </label>
                <Input
                  value={editingItem.nameEn}
                  onChange={(e) => setEditingItem({ ...editingItem, nameEn: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vùng Canh Tác / Xuất Xứ
                </label>
                <Input
                  value={editingItem.originRegion}
                  onChange={(e) => setEditingItem({ ...editingItem, originRegion: e.target.value })}
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                <span className="font-semibold text-slate-700">Quy Cách & Biến Thể</span>
                <p className="text-slate-500 text-[11px]">
                  Bao gồm {editingItem.variantsCount} quy cách đóng gói và cấp độ phẩm phẩm.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2 bg-slate-50/50">
              <Button variant="outline" size="sm" onClick={() => setEditingItem(null)}>
                Hủy
              </Button>
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={handleSaveDrawer}
                disabled={updateCommodityMutation.isPending}
              >
                <Check className="h-3.5 w-3.5" />
                <span>{updateCommodityMutation.isPending ? "Đang lưu..." : "Lưu Bản Nháp (Demo)"}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
