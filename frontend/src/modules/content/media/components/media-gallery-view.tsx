"use client";

import React, { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  Search,
  Upload,
  CheckCircle2,
  Calendar,
  Maximize2,
  FileImage,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  altOf,
  formatOf,
  MEDIA_ACCEPT,
  type MediaAsset,
  type MediaCategory,
  useMediaAssets,
  useMediaUsages,
  useUpdateMedia,
  useUploadMedia,
} from "../queries/use-media";
import { useCan } from "@/modules/auth/queries/use-session";
import { errorMessage } from "@/lib/api/errors";
import { formatBytes, formatDateTime } from "@/lib/utils/format";
import { toast } from "sonner";

/** Detail card with editable default alt text (per locale) and where the asset is used. */
function MediaDetailCard({ asset, onClose }: { asset: MediaAsset; onClose: () => void }) {
  const can = useCan();
  const update = useUpdateMedia();
  const usages = useMediaUsages(asset.id);
  const [altVi, setAltVi] = useState(altOf(asset, "vi"));
  const [altEn, setAltEn] = useState(altOf(asset, "en"));
  const editable = can("media:write");

  const saveAlt = () =>
    update.mutate(
      {
        id: asset.id,
        body: {
          altTexts: [
            { locale: "vi", altText: altVi.trim() || null },
            { locale: "en", altText: altEn.trim() || null },
          ],
        },
      },
      {
        onSuccess: () => toast.success("Đã lưu alt text mặc định"),
        onError: (err) => toast.error("Không lưu được alt text", { description: errorMessage(err) }),
      }
    );

  const usedIn = usages.data?.usages ?? [];
  return (
    <Card className="p-4 border-slate-200 bg-white shadow-2xs flex flex-col sm:flex-row items-center gap-4" data-testid="media-detail">
      <div className="h-24 w-36 rounded-xl overflow-hidden shrink-0 border border-slate-200 bg-slate-100">
        <img src={asset.url} alt={altOf(asset, "vi")} className="h-full w-full object-cover" />
      </div>
      <div className="flex-1 space-y-1 text-xs w-full">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-900">{asset.title}</h3>
          <Badge variant="outline" className="text-[10px]">{asset.category ?? "—"}</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <label className="space-y-0.5 text-[11px] text-slate-500">
            <span>Alt (VI)</span>
            <Input value={altVi} onChange={(e) => setAltVi(e.target.value)} disabled={!editable} className="h-7 text-xs" />
          </label>
          <label className="space-y-0.5 text-[11px] text-slate-500">
            <span>Alt (EN)</span>
            <Input value={altEn} onChange={(e) => setAltEn(e.target.value)} disabled={!editable} className="h-7 text-xs" />
          </label>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-400 pt-1 flex-wrap">
          <span>Định dạng: {formatOf(asset)}</span>
          <span>Kích thước: {asset.width}×{asset.height}</span>
          <span>Dung lượng: {formatBytes(asset.byteSize)}</span>
          <span>Ngày tạo: {formatDateTime(asset.createdAt)}</span>
          <span>
            {usages.isPending
              ? "Đang kiểm tra nơi sử dụng..."
              : usedIn.length
                ? `Đang dùng trong ${usedIn.length} bài viết (bản nháp/công khai)`
                : "Chưa được bài viết nào sử dụng"}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        {editable && (
          <Button size="sm" onClick={saveAlt} disabled={update.isPending} className="text-xs bg-[#087EC2] text-white">
            {update.isPending ? "Đang lưu..." : "Lưu Alt Text"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
          Đóng Chi Tiết
        </Button>
      </div>
    </Card>
  );
}

export function MediaGalleryView() {
  const can = useCan();
  const uploadMutation = useUploadMedia();

  const [searchQuery, setSearchQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFileValue, setUploadFileValue] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState<MediaCategory>("COMMODITY");
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Filtering and search run on the server. ponytail: first 100 results; add paging UI when the library grows.
  const { data, isLoading, error } = useMediaAssets({
    pageSize: 100,
    search: search || undefined,
    category: selectedCategory === "ALL" ? undefined : (selectedCategory as MediaCategory),
  });
  const filteredAssets = data?.items ?? [];

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFileValue) {
      toast.error("Vui lòng chọn tệp ảnh (JPEG, PNG hoặc WebP).");
      return;
    }
    setUploadProgress(0);
    uploadMutation.mutate(
      { file: uploadFileValue, title: uploadTitle, category: uploadCategory, onProgress: setUploadProgress },
      {
        onSuccess: (newAsset) => {
          setSelectedAsset(newAsset);
          setIsUploadOpen(false);
          setUploadTitle("");
          setUploadFileValue(null);
          toast.success("Đã tải ảnh lên thư viện media", {
            description: "Hãy bổ sung alt text tiếng Việt và tiếng Anh cho ảnh.",
          });
        },
        onError: (err) => toast.error("Tải ảnh lên thất bại", { description: errorMessage(err) }),
      }
    );
  };

  const categories = [
    { label: "Tất cả", value: "ALL" },
    { label: "Nông sản", value: "COMMODITY" },
    { label: "Cơ sở chế biến", value: "FACILITY" },
    { label: "Logistics", value: "LOGISTICS" },
    { label: "Chứng nhận QA", value: "CERTIFICATE" },
  ];

  return (
    <div className="space-y-5">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#E9F7FF] text-[#087EC2]">
              <ImageIcon className="h-4 w-4" />
            </div>
            <h1 className="text-base font-bold text-[#123D68]">Thư Viện Media Assets</h1>
            <Badge variant="outline" className="text-[10px] text-slate-500">
              Shared Media Hub
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Quản trị kho ảnh đại diện, banner nông sản và chứng thư phân tích dùng chung cho toàn bộ CMS
          </p>
        </div>

        {can("media:write") && (
        <Button
          size="sm"
          onClick={() => setIsUploadOpen(!isUploadOpen)}
          className="h-8 text-xs bg-[#087EC2] hover:bg-[#066ba8] text-white font-semibold gap-1.5 shadow-2xs self-start sm:self-auto"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>{isUploadOpen ? "Đóng Upload" : "Tải Lên Ảnh"}</span>
        </Button>
        )}
      </div>

      {/* Upload Simulation Card */}
      {isUploadOpen && (
        <Card className="p-4 border-sky-200 bg-[#F1FAFF]/60 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#123D68] flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#087EC2]" />
              <span>Tải Ảnh Lên Thư Viện Media</span>
            </span>
            <Badge variant="outline" className="text-[10px] bg-white text-slate-600 border-sky-300">
              JPEG · PNG · WebP — tối đa 10 MB
            </Badge>
          </div>

          <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5 space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Tên Mô Tả Ảnh</label>
              <Input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Ví dụ: Cánh đồng cà phê thu hoạch..."
                className="h-8 text-xs bg-white"
              />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <label htmlFor="media-upload-file" className="text-[11px] font-semibold text-slate-700">Tệp Ảnh</label>
              <Input
                id="media-upload-file"
                type="file"
                accept={MEDIA_ACCEPT}
                onChange={(e) => setUploadFileValue(e.target.files?.[0] ?? null)}
                className="h-8 text-xs bg-white"
              />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Danh Mục</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as MediaCategory)}
                className="w-full h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                {categories.filter((c) => c.value !== "ALL").map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" size="sm" disabled={uploadMutation.isPending} className="w-full h-8 text-xs bg-[#087EC2] text-white">
                {uploadMutation.isPending ? `Đang tải ${Math.round(uploadProgress * 100)}%` : "Tải Lên"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* 2. Filter Bar */}
      <Card className="p-3 border-slate-200 shadow-2xs bg-white">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên ảnh, danh mục hoặc mô tả..."
              className="pl-8 h-8 text-xs bg-slate-50/70"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => setSelectedCategory(cat.value)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  selectedCategory === cat.value
                    ? "bg-[#087EC2] text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* 3. Media Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {isLoading ? (
          <div className="col-span-full py-20 text-center text-xs text-slate-400">
            Đang tải dữ liệu media assets...
          </div>
        ) : error ? (
          <div className="col-span-full py-20 text-center text-xs text-rose-600">
            Không tải được thư viện media: {errorMessage(error)}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="col-span-full py-20 text-center text-xs text-slate-400">
            Không tìm thấy hình ảnh nào phù hợp với từ khóa.
          </div>
        ) : (
          filteredAssets.map((asset) => {
            const isSelected = selectedAsset?.id === asset.id;

            return (
              <Card
                key={asset.id}
                onClick={() => setSelectedAsset(asset)}
                className={`overflow-hidden border cursor-pointer transition-all group ${
                  isSelected ? "border-[#087EC2] ring-2 ring-[#087EC2]/30 shadow-sm" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="aspect-4/3 overflow-hidden bg-slate-100 relative">
                  <img
                    src={asset.url}
                    alt={altOf(asset, "vi")}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />
                  <div className="absolute top-1.5 left-1.5 pointer-events-none">
                    <Badge variant="secondary" className="text-[9px] bg-black/60 text-white backdrop-blur-xs border-none">
                      {asset.category ?? "—"}
                    </Badge>
                  </div>
                </div>
                <div className="p-2 space-y-0.5 bg-white">
                  <div className="text-[11px] font-semibold text-slate-800 truncate" title={asset.title}>
                    {asset.title}
                  </div>
                  <div className="text-[10px] text-slate-400 flex items-center justify-between">
                    <span>{asset.width}×{asset.height}</span>
                    <span>{formatBytes(asset.byteSize)}</span>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {data && data.total > filteredAssets.length && (
        <p className="text-[11px] text-slate-400">
          Hiển thị {filteredAssets.length}/{data.total} ảnh mới nhất. Dùng ô tìm kiếm hoặc danh mục để thu hẹp.
        </p>
      )}

      {/* Detail (editable alt text) if selected */}
      {selectedAsset && (
        <MediaDetailCard key={selectedAsset.id} asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  );
}
