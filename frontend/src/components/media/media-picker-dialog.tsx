"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  altOf,
  formatOf,
  MEDIA_ACCEPT,
  type MediaAsset,
  type MediaCategory,
  useMediaAssets,
  useUploadMedia,
} from "@/modules/content/media/queries/use-media";
import { useCan } from "@/modules/auth/queries/use-session";
import { errorMessage } from "@/lib/api/errors";
import { formatBytes, formatDateTime } from "@/lib/utils/format";
import {
  ImageIcon,
  Search,
  CheckCircle2,
  Upload,
  Layers,
  FileImage,
  Info,
  ShieldCheck,
  Calendar,
  Maximize2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export interface SelectedMediaResult {
  /** Media library asset id: what articles store (coverMediaId, image node mediaId). */
  id: string;
  url: string;
  altVi: string;
  altEn: string;
  title: string;
}

interface MediaPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: SelectedMediaResult) => void;
  currentUrl?: string;
  title?: string;
}

export function MediaPickerDialog({
  isOpen,
  onClose,
  onSelect,
  currentUrl,
  title = "Chọn Hình Ảnh / Media Asset",
}: MediaPickerDialogProps) {
  const can = useCan();
  const uploadMutation = useUploadMedia();

  const [searchQuery, setSearchQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [customAltVi, setCustomAltVi] = useState("");
  const [customAltEn, setCustomAltEn] = useState("");
  const [isUploadTab, setIsUploadTab] = useState(false);

  // Upload state
  const [newUploadTitle, setNewUploadTitle] = useState("");
  const [newUploadFile, setNewUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Search and category filtering run on the server (first 100 matches).
  const { data, isLoading, error } = useMediaAssets({
    pageSize: 100,
    search: search || undefined,
    category: selectedCategory === "ALL" ? undefined : (selectedCategory as MediaCategory),
  });
  const filteredAssets = data?.items ?? [];

  // Select asset handler: alt texts start from the asset defaults and can be adapted for this usage.
  const handlePickAsset = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setCustomAltVi(altOf(asset, "vi"));
    setCustomAltEn(altOf(asset, "en"));
  };

  const handleConfirm = () => {
    if (!selectedAsset) {
      toast.error("Vui lòng chọn một hình ảnh từ thư viện.");
      return;
    }
    onSelect({
      id: selectedAsset.id,
      url: selectedAsset.url,
      altVi: customAltVi.trim(),
      altEn: customAltEn.trim(),
      title: selectedAsset.title,
    });
    toast.success("Đã chọn hình ảnh thành công!");
    onClose();
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUploadFile) {
      toast.error("Vui lòng chọn tệp ảnh (JPEG, PNG hoặc WebP).");
      return;
    }
    setUploadProgress(0);
    uploadMutation.mutate(
      { file: newUploadFile, title: newUploadTitle, onProgress: setUploadProgress },
      {
        onSuccess: (newAsset) => {
          handlePickAsset(newAsset);
          setIsUploadTab(false);
          setNewUploadTitle("");
          setNewUploadFile(null);
          toast.success("Đã tải ảnh lên thư viện media", {
            description: "Nhập alt text cho ảnh trước khi chọn.",
          });
        },
        // The editor content is untouched; the user can retry or pick another image.
        onError: (err) => toast.error("Tải ảnh lên thất bại", { description: errorMessage(err) }),
      }
    );
  };

  const categories: { label: string; value: string }[] = [
    { label: "Tất cả", value: "ALL" },
    { label: "Nông sản", value: "COMMODITY" },
    { label: "Cơ sở chế biến", value: "FACILITY" },
    { label: "Logistics", value: "LOGISTICS" },
    { label: "Chứng nhận QA", value: "CERTIFICATE" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden p-0 rounded-2xl border-slate-200 flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#E9F7FF] text-[#087EC2]">
              <ImageIcon className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-bold text-[#123D68]">{title}</DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500">
                Thư viện media dùng chung cho Pages, Commodities và Articles
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-6">
            <Button
              type="button"
              variant={!isUploadTab ? "default" : "outline"}
              size="sm"
              onClick={() => setIsUploadTab(false)}
              className={`h-7 text-xs ${!isUploadTab ? "bg-[#087EC2] text-white" : ""}`}
            >
              Thư Viện Ảnh
            </Button>
            {can("media:write") && (
            <Button
              type="button"
              variant={isUploadTab ? "default" : "outline"}
              size="sm"
              onClick={() => setIsUploadTab(true)}
              className={`h-7 text-xs ${isUploadTab ? "bg-[#087EC2] text-white" : ""}`}
            >
              <Upload className="h-3 w-3 mr-1" />
              <span>Tải Lên Ảnh</span>
            </Button>
            )}
          </div>
        </div>

        {/* Content Body */}
        {isUploadTab ? (
          /* Mock Upload View */
          <div className="p-6 overflow-y-auto space-y-5 bg-slate-50/50 flex-1">
            <div className="rounded-xl border border-sky-200 bg-[#F1FAFF] p-4 text-xs text-sky-950 space-y-1.5">
              <span className="font-bold flex items-center gap-1.5 text-[#087EC2]">
                <ShieldCheck className="h-4 w-4" />
                <span>Tải Ảnh Lên Thư Viện Media</span>
              </span>
              <p className="leading-relaxed">
                Ảnh được gửi tới máy chủ CMS, kiểm tra định dạng thực (JPEG, PNG, WebP), kích thước tối đa 10 MB rồi mới lưu
                vào kho media dùng chung.
              </p>
            </div>

            <form onSubmit={handleUpload} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Thêm Ảnh Mới Vào Thư Viện
              </h3>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Tên Mô Tả Hình Ảnh</label>
                <Input
                  value={newUploadTitle}
                  onChange={(e) => setNewUploadTitle(e.target.value)}
                  placeholder="Ví dụ: Kho lạnh cấp đông IQF Gia Lai..."
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="picker-upload-file" className="text-xs font-semibold text-slate-700">Tệp Ảnh</label>
                <Input
                  id="picker-upload-file"
                  type="file"
                  accept={MEDIA_ACCEPT}
                  onChange={(e) => setNewUploadFile(e.target.files?.[0] ?? null)}
                  className="h-8 text-xs"
                />
              </div>

              {uploadMutation.isPending && (
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden" aria-label="Tiến độ tải lên">
                  <div className="h-1.5 bg-[#087EC2]" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsUploadTab(false)}>
                  Quay Lại Thư Viện
                </Button>
                <Button type="submit" size="sm" disabled={uploadMutation.isPending} className="bg-[#087EC2] hover:bg-[#066ba8] text-white">
                  {uploadMutation.isPending ? `Đang tải ${Math.round(uploadProgress * 100)}%` : "Tải Lên"}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          /* Gallery & Metadata Grid */
          <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden">
            {/* Left: Gallery Grid (Col 8) */}
            <div className="md:col-span-8 flex flex-col border-r border-slate-200 bg-slate-50/50 overflow-hidden">
              {/* Search & Category Filter */}
              <div className="p-3 border-b border-slate-200 bg-white space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm theo tên file, chủ đề hoặc chú thích..."
                    className="pl-8 h-8 text-xs bg-slate-50"
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setSelectedCategory(cat.value)}
                      className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
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

              {/* Grid of Images */}
              <div className="p-4 overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {isLoading ? (
                  <div className="col-span-3 py-16 text-center text-xs text-slate-400">
                    Đang tải danh sách media...
                  </div>
                ) : error ? (
                  <div className="col-span-3 py-16 text-center text-xs text-rose-600">
                    Không tải được thư viện media: {errorMessage(error)}
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="col-span-3 py-16 text-center text-xs text-slate-400">
                    Không tìm thấy hình ảnh nào phù hợp với từ khóa.
                  </div>
                ) : (
                  filteredAssets.map((asset) => {
                    const isSelected = selectedAsset?.id === asset.id;
                    const isCurrentlyActive = currentUrl && currentUrl === asset.url;

                    return (
                      <div
                        key={asset.id}
                        onClick={() => handlePickAsset(asset)}
                        className={`group relative rounded-xl overflow-hidden border cursor-pointer transition-all ${
                          isSelected
                            ? "border-[#087EC2] ring-2 ring-[#087EC2]/30 shadow-sm"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <div className="aspect-4/3 w-full overflow-hidden bg-slate-100">
                          <img
                            src={asset.url}
                            alt={altOf(asset, "vi")}
                            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </div>

                        {/* Badges Overlay */}
                        <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between items-center pointer-events-none">
                          <Badge variant="secondary" className="text-[9px] bg-black/60 text-white backdrop-blur-xs border-none">
                            {asset.category ?? "—"}
                          </Badge>
                          {isSelected && (
                            <div className="h-5 w-5 rounded-full bg-[#087EC2] text-white flex items-center justify-center shadow-xs">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </div>
                          )}
                          {!isSelected && isCurrentlyActive && (
                            <Badge className="bg-amber-500 text-white text-[9px] border-none">
                              Đang dùng
                            </Badge>
                          )}
                        </div>

                        <div className="p-2 bg-white">
                          <div className="text-[11px] font-semibold text-slate-800 truncate" title={asset.title}>
                            {asset.title}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center justify-between mt-0.5">
                            <span>{asset.width}×{asset.height}</span>
                            <span>{formatBytes(asset.byteSize)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right: Asset Detail & Alt Text Inspector (Col 4) */}
            <div className="md:col-span-4 p-4 flex flex-col justify-between bg-white overflow-y-auto">
              {selectedAsset ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Xem Trước &amp; Metadata
                    </span>
                    <div className="rounded-xl overflow-hidden border border-slate-200 aspect-16/10 bg-slate-100">
                      <img
                        src={selectedAsset.url}
                        alt={altOf(selectedAsset, "vi")}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <h4 className="font-bold text-slate-900 leading-tight">{selectedAsset.title}</h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 pt-1">
                      <div>
                        Định dạng: <strong>{formatOf(selectedAsset)}</strong>
                      </div>
                      <div>
                        Kích thước: <strong>{selectedAsset.width}×{selectedAsset.height}</strong>
                      </div>
                      <div>
                        Dung lượng: <strong>{formatBytes(selectedAsset.byteSize)}</strong>
                      </div>
                      <div>
                        Ngày tạo: <strong>{formatDateTime(selectedAsset.createdAt)}</strong>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Alt Text Inputs */}
                  <div className="space-y-3">
                    <span className="text-[11px] font-bold text-slate-700">
                      Chú Thích Hình Ảnh (Alt Text SEO)
                    </span>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-600">
                        Alt Text Tiếng Việt (VI)
                      </label>
                      <Input
                        value={customAltVi}
                        onChange={(e) => setCustomAltVi(e.target.value)}
                        placeholder="Mô tả ảnh tiếng Việt cho SEO..."
                        className="h-7 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-600">
                        Alt Text Tiếng Anh (EN)
                      </label>
                      <Input
                        value={customAltEn}
                        onChange={(e) => setCustomAltEn(e.target.value)}
                        placeholder="English alt text for accessibility..."
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-xs text-slate-400 space-y-2">
                  <FileImage className="mx-auto h-8 w-8 text-slate-300" />
                  <p>Chọn một hình ảnh từ lưới bên trái để xem thông tin chi tiết và chỉnh sửa thẻ Alt.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-3">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Hủy Bỏ
          </Button>

          <div className="flex items-center gap-2">
            {selectedAsset && (
              <span className="text-xs text-slate-500 hidden sm:inline">
                Đã chọn: <strong className="text-slate-800">{selectedAsset.title}</strong>
              </span>
            )}
            <Button
              type="button"
              size="sm"
              disabled={!selectedAsset}
              onClick={handleConfirm}
              className="bg-[#087EC2] hover:bg-[#066ba8] text-white text-xs font-semibold"
            >
              Chọn Ảnh Này
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
