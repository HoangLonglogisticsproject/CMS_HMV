import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cmsMockApi } from "@/lib/mocks/adapter";
import { queryKeys } from "@/lib/api/query-keys";
import { CommodityItem } from "@/lib/mocks/types";

export function useCommodities(filters: { search?: string; locale?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.commodities.list(filters),
    queryFn: () => cmsMockApi.getCommodities(),
  });
}

export function useUpdateCommodity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CommodityItem> }) =>
      cmsMockApi.updateCommodity(id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.commodities.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.activities });
    },
  });
}
