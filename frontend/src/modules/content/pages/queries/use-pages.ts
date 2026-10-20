import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call, type Schemas } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";

export type PageDetail = Schemas["PageDetailResponse"];
export type PageSummary = Schemas["PageSummaryResponse"];
export type PageTranslation = Schemas["PageTranslationResponse"];
export type PageState = Schemas["PageTranslationSummary"]["state"];
export type AboutContent = Schemas["AboutPageContent"];
export type PageTranslationInput = Schemas["PageTranslationInput"];
export type PageStep = "submit" | "approve" | "request-changes" | "publish";

const FRESH = 30_000;

export function usePages() {
  return useQuery({
    queryKey: queryKeys.pages.list,
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/pages", { signal })),
    staleTime: FRESH,
  });
}

export function usePageDetail(key: string) {
  return useQuery({
    queryKey: queryKeys.pages.detail(key),
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/pages/{key}", { params: { path: { key } }, signal })),
    enabled: Boolean(key),
    staleTime: FRESH,
  });
}

function usePageWrite<TVars>(mutationFn: (vars: TVars) => Promise<PageDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.pages.detail(detail.key), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.pages.list });
    },
  });
}

export const useSavePageDraft = () =>
  usePageWrite(({ key, expectedRevision, translations }: { key: string; expectedRevision: number; translations: PageTranslationInput[] }) =>
    call(api.PATCH("/api/v1/admin/pages/{key}/draft", { params: { path: { key } }, body: { expectedRevision, translations } })),
  );

/** Submit, approve, request changes or publish one locale of the current draft. */
export const usePageStep = () =>
  usePageWrite(({ key, locale, step, expectedRevision, note }: { key: string; locale: string; step: PageStep; expectedRevision: number; note?: string }) => {
    const params = { path: { key, locale } };
    const body = { expectedRevision };
    switch (step) {
      case "submit":
        return call(api.POST("/api/v1/admin/pages/{key}/translations/{locale}/submit", { params, body }));
      case "approve":
        return call(api.POST("/api/v1/admin/pages/{key}/translations/{locale}/approve", { params, body }));
      case "publish":
        return call(api.POST("/api/v1/admin/pages/{key}/translations/{locale}/publish", { params, body }));
      case "request-changes":
        return call(api.POST("/api/v1/admin/pages/{key}/translations/{locale}/request-changes", { params, body: { ...body, note: note ?? "" } }));
    }
  });
