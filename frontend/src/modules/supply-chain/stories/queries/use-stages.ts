import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cmsMockApi } from "@/lib/mocks/adapter";
import { queryKeys } from "@/lib/api/query-keys";
import { SupplyChainStageItem } from "@/lib/mocks/types";

export function useSupplyChainStages(locale: string = "vi") {
  return useQuery({
    queryKey: queryKeys.stages.list(locale),
    queryFn: () => cmsMockApi.getSupplyChainStages(),
  });
}

export function useUpdateSupplyChainStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SupplyChainStageItem> }) =>
      cmsMockApi.updateSupplyChainStage(id, payload),
    onSuccess: () => {
      // Invalidate all stage queries to synchronize timeline and inspector
      void queryClient.invalidateQueries({ queryKey: queryKeys.stages.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.activities });
    },
  });
}
