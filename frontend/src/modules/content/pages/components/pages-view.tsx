"use client";

import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/utils/format";
import { type PageState, usePages } from "../queries/use-pages";

const STATE_LABEL: Record<PageState, string> = {
  DRAFT: "Bản nháp",
  IN_REVIEW: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  CHANGES_REQUESTED: "Cần chỉnh sửa",
};

/** Website pages managed by the CMS. Pages are added by the platform (one per website page), not by editors. */
export function PagesView() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = usePages();
  const pages = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-[#E9F7FF] p-1.5 text-[#0066CC]">
            <FileText className="h-4 w-4" />
          </div>
          <h1 className="text-base font-bold text-[#113E67]">Trang website &amp; Landing Pages</h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Nội dung song ngữ của các trang website. Mỗi ngôn ngữ được gửi duyệt, duyệt và xuất bản độc lập.
        </p>
      </div>

      <Card className="overflow-hidden border-slate-200 bg-white shadow-2xs">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Đang tải danh sách trang…</p>
        ) : error ? (
          <div className="space-y-3 p-6">
            <p className="text-sm text-slate-700">{errorMessage(error)}</p>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Thử lại
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/70">
                <TableHead className="text-xs">Trang</TableHead>
                <TableHead className="text-xs">Bản dịch</TableHead>
                <TableHead className="text-xs">Bản nháp</TableHead>
                <TableHead className="text-xs">Cập nhật</TableHead>
                <TableHead className="text-right text-xs">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((p) => (
                <TableRow key={p.key}>
                  <TableCell>
                    <div className="text-sm font-semibold text-[#123D68]">{p.title ?? "Chưa có nội dung"}</div>
                    <code className="text-[11px] text-slate-500">{p.key}</code>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.translations.length === 0 && <span className="text-[11px] text-slate-400">—</span>}
                      {p.translations.map((t) => (
                        <Badge key={t.locale} variant={t.isLive && !t.hasUnpublishedChanges ? "success" : t.state === "DRAFT" ? "outline" : "warning"}>
                          {t.locale.toUpperCase()}: {STATE_LABEL[t.state]}
                          {t.isLive ? (t.hasUnpublishedChanges ? " · công khai (bản cũ)" : " · công khai") : ""}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{p.revision ? `#${p.revision}` : "—"}</TableCell>
                  <TableCell className="text-xs text-slate-600">{formatDateTime(p.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push(`/content/pages/${p.key}`)}>
                      Biên tập
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
