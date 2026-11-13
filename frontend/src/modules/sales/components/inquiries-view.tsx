"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, Search } from "lucide-react";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCan } from "@/modules/auth/queries/use-session";
import { errorMessage } from "@/lib/api/errors";
import {
  type InquiryListParams,
  type InquiryStatus,
  type InquirySummary,
  useInquiryAssignees,
  useTradeInquiries,
  useTradeInquiryStats,
} from "../queries/use-trade-inquiries";
import {
  INQUIRY_STATUSES,
  NOTIFICATION_LABEL,
  NOTIFICATION_SHORT,
  PRODUCT_LABEL,
  ROUTE_LABEL,
  ROUTE_VARIANT,
  STATUS_LABEL,
  STATUS_VARIANT,
  formatVietnamDateTime,
  inquiryRoute,
  inquirySource,
  inquiryVolume,
  settledPage,
} from "../utils/inquiry-format";

const PAGE_SIZE = 20;
const SELECT =
  "h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#087EC2]";

/** The inbox columns, commercial information first: pure render functions of a row, no component state. */
const columns: ColumnDef<InquirySummary>[] = [
  {
    id: "reference",
    header: "Mã",
    cell: ({ row }) => (
      <Link
        href={`/sales/inquiries/${row.original.id}`}
        className="font-mono font-semibold text-[#087EC2] hover:underline whitespace-nowrap"
      >
        {row.original.reference}
      </Link>
    ),
  },
  {
    id: "buyer",
    header: "Công ty / người mua",
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[180px]">
        <div className="font-semibold text-slate-900 truncate" title={row.original.company}>
          {row.original.company}
        </div>
        {row.original.contactName && (
          <div className="text-[11px] text-slate-500 truncate">{row.original.contactName}</div>
        )}
      </div>
    ),
  },
  {
    id: "product",
    header: "Sản phẩm",
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[160px]">
        <div className="text-slate-800 truncate" title={row.original.productName}>
          {row.original.productName}
        </div>
        <div className="text-[11px] text-slate-500">{row.original.locale.toUpperCase()}</div>
      </div>
    ),
  },
  {
    id: "destination",
    header: "Điểm đến",
    cell: ({ row }) => (
      <div className="max-w-[130px] truncate text-slate-700" title={row.original.destination ?? undefined}>
        {row.original.destination ?? "—"}
      </div>
    ),
  },
  {
    id: "volume",
    header: "Khối lượng",
    cell: ({ row }) => (
      <span className="text-slate-700 whitespace-nowrap">{inquiryVolume(row.original) ?? "—"}</span>
    ),
  },
  {
    id: "route",
    header: "Tuyến xử lý",
    cell: ({ row }) => {
      const route = inquiryRoute(row.original);
      return (
        <Badge variant={ROUTE_VARIANT[route]} className="whitespace-nowrap" data-testid="inquiry-route">
          {ROUTE_LABEL[route]}
        </Badge>
      );
    },
  },
  {
    id: "status",
    header: "Trạng thái",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANT[row.original.status]} className="whitespace-nowrap">
        {STATUS_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    id: "assigned",
    header: "Phụ trách",
    cell: ({ row }) =>
      row.original.assignedTo ? (
        <span className="text-slate-700 whitespace-nowrap">{row.original.assignedTo.displayName}</span>
      ) : (
        <span className="text-[11px] text-amber-700 whitespace-nowrap">Chưa giao</span>
      ),
  },
  {
    id: "source",
    header: "Nguồn",
    cell: ({ row }) => (
      <div className="max-w-[110px] truncate text-[11px] text-slate-500">{inquirySource(row.original)}</div>
    ),
  },
  {
    id: "received",
    header: "Nhận lúc",
    // The notification email is secondary to the lead: a muted line under the time.
    cell: ({ row }) => (
      <div className="whitespace-nowrap">
        <div className="text-slate-700">{formatVietnamDateTime(row.original.createdAt)}</div>
        <div className="text-[10px] text-slate-400" title={NOTIFICATION_LABEL[row.original.notificationStatus]}>
          Email: {NOTIFICATION_SHORT[row.original.notificationStatus]}
        </div>
      </div>
    ),
  },
];

export function InquiriesView() {
  const can = useCan();
  // The API refuses the inbox without inquiry:read; checking first also avoids requests that would 403.
  if (!can("inquiry:read")) {
    return (
      <div
        className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600"
        data-testid="inquiries-forbidden"
      >
        Bạn không có quyền xem yêu cầu giao thương.
      </div>
    );
  }
  return <InquiryInbox />;
}

function InquiryInbox() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [productId, setProductId] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [utmInput, setUtmInput] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [page, setPage] = useState(1);

  // Free-text filters go to the API debounced.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setUtmSource(utmInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, utmInput]);

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const params: InquiryListParams = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: (status || undefined) as InquiryStatus | undefined,
    productId: productId || undefined,
    assignedToId: assignee && assignee !== "UNASSIGNED" ? assignee : undefined,
    unassigned: assignee === "UNASSIGNED" ? true : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    utmSource: utmSource || undefined,
  };
  const { data: list, isLoading, error: listError, isFetching, isPlaceholderData } = useTradeInquiries(params);
  const { data: stats } = useTradeInquiryStats();
  const { data: assignees } = useInquiryAssignees();
  const items = useMemo(() => list?.items ?? [], [list]);
  const total = list?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A settled response with fewer pages than the current one: follow it to its last page (set during render, so
  // "Trang 2/1" is never shown).
  const settled = settledPage(page, pageCount, Boolean(list) && !isPlaceholderData);
  if (settled !== page) setPage(settled);
  const filtered = Boolean(search || status || productId || assignee || dateFrom || dateTo || utmSource);


  // What the table body shows instead of rows, if anything: loading, an error, or why there are no rows.
  const emptyMessage = filtered ? "Không có yêu cầu nào khớp bộ lọc." : "Chưa có yêu cầu nào từ website.";
  let message: { text: string; tone: string } | null = null;
  if (isLoading) message = { text: "Đang tải yêu cầu…", tone: "text-slate-500" };
  else if (listError) message = { text: `Không tải được danh sách yêu cầu: ${errorMessage(listError)}`, tone: "text-rose-600" };
  else if (!items.length) message = { text: emptyMessage, tone: "text-slate-500" };

  const table = useReactTable({
    data: items,
    columns,
    manualPagination: true,
    rowCount: total,
    getCoreRowModel: getCoreRowModel(),
  });

  const metrics = [
    { label: "Chờ liên hệ", value: stats?.new, note: "Trạng thái Mới", tone: "text-[#087EC2]" },
    { label: "Nhận hôm nay", value: stats?.today, note: "Từ 00:00 giờ Việt Nam", tone: "text-[#123D68]" },
    { label: "7 ngày qua", value: stats?.last7Days, note: `Tổng cộng ${stats?.total ?? 0} yêu cầu`, tone: "text-[#123D68]" },
    { label: "Đã báo giá", value: stats?.quoted, note: `${stats?.won ?? 0} chốt thành công`, tone: "text-amber-600" },
  ];

  return (
    <div className="space-y-5">
      <div className="pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#E9F7FF] text-[#087EC2]">
            <Inbox className="h-4 w-4" />
          </div>
          <h1 className="text-base font-bold text-[#123D68]">Leads &amp; Yêu cầu giao thương</h1>
          {isFetching && !isLoading && <span className="text-[10px] text-slate-400">Đang cập nhật…</span>}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Lead từ HMV Trade Desk trên website: đủ sản phẩm, điểm đến và khối lượng là <strong>Sales · RFQ</strong>; còn
          lại là <strong>Customer Service</strong>. Danh sách tự làm mới mỗi 30 giây khi tab đang mở.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <Card key={m.label} className="p-3 border-slate-200 shadow-2xs bg-white">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{m.label}</div>
            <div className={`text-xl font-bold mt-1 ${m.tone}`}>{m.value ?? "—"}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{m.note}</div>
          </Card>
        ))}
      </div>

      <Card className="p-3 border-slate-200 shadow-2xs bg-white space-y-2.5">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Tìm theo mã, công ty, email, người liên hệ, sản phẩm, điểm đến…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8 h-8 text-xs bg-slate-50/70 border-slate-200"
            aria-label="Tìm yêu cầu"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select aria-label="Trạng thái" value={status} onChange={(e) => filter(setStatus)(e.target.value)} className={SELECT}>
            <option value="">Tất cả trạng thái</option>
            {INQUIRY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select aria-label="Sản phẩm" value={productId} onChange={(e) => filter(setProductId)(e.target.value)} className={SELECT}>
            <option value="">Tất cả sản phẩm</option>
            {Object.entries(PRODUCT_LABEL).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
          <select aria-label="Phụ trách" value={assignee} onChange={(e) => filter(setAssignee)(e.target.value)} className={SELECT}>
            <option value="">Mọi người phụ trách</option>
            <option value="UNASSIGNED">Chưa giao</option>
            {assignees?.items.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <span>Từ</span>
            <Input type="date" value={dateFrom} onChange={(e) => filter(setDateFrom)(e.target.value)} className="h-8 w-[130px] text-xs" />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <span>đến</span>
            <Input type="date" value={dateTo} onChange={(e) => filter(setDateTo)(e.target.value)} className="h-8 w-[130px] text-xs" />
          </label>
          <Input
            placeholder="utm_source"
            aria-label="Nguồn chiến dịch (utm_source)"
            value={utmInput}
            onChange={(e) => setUtmInput(e.target.value)}
            className="h-8 w-[120px] text-xs"
          />
        </div>
      </Card>

      <Card className="border-slate-200 shadow-2xs overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80 border-b border-slate-200">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-xs font-bold text-slate-700 py-3 whitespace-nowrap">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {message ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className={`h-32 text-center text-xs ${message.tone}`}>
                    {message.text}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-testid="inquiry-row"
                    className="hover:bg-slate-50/80 transition-colors border-b border-slate-100 cursor-pointer"
                    onClick={(e) => {
                      if (!(e.target as HTMLElement).closest("a")) router.push(`/sales/inquiries/${row.original.id}`);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3 text-xs">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-500">
          <div data-testid="inquiries-pagination">
            <strong>{total}</strong> yêu cầu · Trang {Math.min(page, pageCount)}/{pageCount}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} className="h-7 text-xs px-2.5">
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
    </div>
  );
}
