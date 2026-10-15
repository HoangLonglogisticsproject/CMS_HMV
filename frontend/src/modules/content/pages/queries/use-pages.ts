import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cmsMockApi } from "@/lib/mocks/adapter";
import { queryKeys } from "@/lib/api/query-keys";
import { PageContentItem } from "@/lib/mocks/types";

export function usePages(locale: string = "vi") {
  return useQuery({
    queryKey: queryKeys.pages.list(locale),
    queryFn: () => cmsMockApi.getPages(),
  });
}

export function usePageDetail(id: string, locale: string = "vi") {
  return useQuery({
    queryKey: queryKeys.pages.detail(id, locale),
    queryFn: () => cmsMockApi.getPageById(id),
    enabled: Boolean(id),
  });
}

export function useUpdatePage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PageContentItem> }) =>
      cmsMockApi.updatePage(id, payload),
    onSuccess: (updatedData) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.pages.all });
      if (updatedData?.id) {
        queryClient.setQueryData(queryKeys.pages.detail(updatedData.id, "vi"), updatedData);
        queryClient.setQueryData(queryKeys.pages.detail(updatedData.id, "en"), updatedData);
      }
    },
  });
}
