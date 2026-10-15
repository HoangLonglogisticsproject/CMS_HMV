import { useRef } from "react";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call, isApiError, type Schemas } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { operations } from "@/lib/api/schema";

export type ArticleDetail = Schemas["ArticleDetailResponse"];
export type ArticleSummary = Schemas["ArticleSummaryResponse"];
export type ArticleListParams = NonNullable<operations["AdminArticles_list"]["parameters"]["query"]>;
export type CreateArticleBody = Schemas["CreateArticleDto"];
export type DraftPatch = Omit<Schemas["UpdateArticleDraftDto"], "expectedRevision">;

// Lists/detail are shared by several editors: keep them fresh but not chatty.
const FRESH = 30_000;

export function useArticles(params: ArticleListParams) {
  return useQuery({
    queryKey: queryKeys.articles.list(params),
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/articles", { params: { query: params }, signal })),
    placeholderData: keepPreviousData,
    staleTime: FRESH,
  });
}

export function useArticleStats() {
  return useQuery({
    queryKey: queryKeys.articles.stats,
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/articles/stats", { signal })),
    staleTime: FRESH,
  });
}

export function useArticleDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.articles.detail(id),
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/articles/{id}", { params: { path: { id } }, signal })),
    enabled: Boolean(id),
    staleTime: FRESH,
  });
}

export function useArticleCategories() {
  return useQuery({
    queryKey: queryKeys.articles.categories,
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/article-categories", { signal })),
    staleTime: 60 * 60_000,
  });
}

/** Server-rendered draft previews (public response shape) for each locale; a missing locale yields null. */
export function useArticlePreviews(id: string | null, locales: readonly string[]) {
  return useQueries({
    queries: locales.map((locale) => ({
      queryKey: queryKeys.articles.preview(id ?? "", locale),
      enabled: Boolean(id),
      staleTime: 0,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        try {
          return await call(
            api.GET("/api/v1/admin/articles/{id}/preview", { params: { path: { id: id! }, query: { locale } }, signal }),
          );
        } catch (err) {
          if (isApiError(err, "TRANSLATION_NOT_FOUND")) return null;
          throw err;
        }
      },
    })),
  });
}

/** Every successful write returns the new detail: store it, then refresh what depends on it. */
function useArticleWrite<TVars>(mutationFn: (vars: TVars) => Promise<ArticleDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.articles.detail(detail.id), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.articles.stats });
      void queryClient.invalidateQueries({ queryKey: ["articles", "preview", detail.id] });
      void queryClient.invalidateQueries({ queryKey: ["media", "usages"] }); // cover/inline references may change
    },
  });
}

export const useCreateArticle = () =>
  useArticleWrite((body: CreateArticleBody) => call(api.POST("/api/v1/admin/articles", { body })));

export const useSaveArticleDraft = () =>
  useArticleWrite(({ id, expectedRevision, patch }: { id: string; expectedRevision: number; patch: DraftPatch }) =>
    call(api.PATCH("/api/v1/admin/articles/{id}/draft", { params: { path: { id } }, body: { ...patch, expectedRevision } })),
  );

export const useApproveTranslation = () =>
  useArticleWrite(({ id, locale, expectedRevision }: { id: string; locale: string; expectedRevision: number }) =>
    call(
      api.POST("/api/v1/admin/articles/{id}/translations/{locale}/approve", {
        params: { path: { id, locale } },
        body: { expectedRevision },
      }),
    ),
  );

/**
 * One publish request at a time. `isPending` only disables the button on the next render, so a double click sent two
 * requests: the second answered 409, and TanStack runs only the latest call's callbacks, so a successful publish was
 * reported as a failure. The ref blocks the second call synchronously.
 */
export function usePublishArticle() {
  const mutation = useArticleWrite(({ id, expectedRevision }: { id: string; expectedRevision: number }) =>
    call(api.POST("/api/v1/admin/articles/{id}/publish", { params: { path: { id } }, body: { expectedRevision } })),
  );
  const inFlight = useRef(false);
  const mutate: typeof mutation.mutate = (variables, options) => {
    if (inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(variables, {
      ...options,
      onSettled: (...args) => {
        inFlight.current = false;
        options?.onSettled?.(...args);
      },
    });
  };
  return { ...mutation, mutate };
}

export const useArchiveArticle = () =>
  useArticleWrite((id: string) => call(api.POST("/api/v1/admin/articles/{id}/archive", { params: { path: { id } } })));

export const useRestoreArticle = () =>
  useArticleWrite((id: string) => call(api.POST("/api/v1/admin/articles/{id}/restore", { params: { path: { id } } })));
