import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call, uploadFile, type Schemas } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { operations } from "@/lib/api/schema";

export type MediaAsset = Schemas["MediaAssetResponse"];
export type MediaCategory = NonNullable<MediaAsset["category"]>;
export type MediaListParams = NonNullable<operations["Media_list"]["parameters"]["query"]>;
export type MediaUpdate = Schemas["UpdateMediaDto"];

export const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp";

export const altOf = (asset: MediaAsset, locale: string) =>
  asset.altTexts.find((a) => a.locale === locale)?.altText ?? "";
export const formatOf = (asset: MediaAsset) => asset.mimeType.replace("image/", "").toUpperCase();

export function useMediaAssets(params: MediaListParams) {
  return useQuery({
    queryKey: queryKeys.media.list(params),
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/media", { params: { query: params }, signal })),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useMediaUsages(id: string | null) {
  return useQuery({
    queryKey: queryKeys.media.usages(id ?? ""),
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/media/{id}/usages", { params: { path: { id: id! } }, signal })),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export interface UploadInput {
  file: File;
  title?: string;
  category?: MediaCategory;
  onProgress?: (fraction: number) => void;
}

/** Multipart upload; the server detects the type from the bytes and rejects anything but JPEG/PNG/WebP. */
export function useUploadMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, title, category, onProgress }: UploadInput) => {
      const form = new FormData();
      form.append("file", file);
      if (title?.trim()) form.append("title", title.trim());
      if (category) form.append("category", category);
      return uploadFile<MediaAsset>("/api/v1/admin/media", form, onProgress);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.media.lists }),
  });
}

export function useUpdateMedia() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MediaUpdate }) =>
      call(api.PATCH("/api/v1/admin/media/{id}", { params: { path: { id } }, body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.media.lists });
      // Default alt texts feed article previews and approval checks.
      void queryClient.invalidateQueries({ queryKey: ["articles", "preview"] });
    },
  });
}
