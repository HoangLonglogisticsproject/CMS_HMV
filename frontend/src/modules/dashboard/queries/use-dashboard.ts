import { useQuery } from "@tanstack/react-query";
import { cmsMockApi } from "@/lib/mocks/adapter";
import { queryKeys } from "@/lib/api/query-keys";

export function useDashboardMetrics() {
  return useQuery({
    queryKey: queryKeys.dashboard.metrics,
    queryFn: () => cmsMockApi.getDashboardMetrics(),
  });
}

export function useDashboardActivities() {
  return useQuery({
    queryKey: queryKeys.dashboard.activities,
    queryFn: () => cmsMockApi.getRecentActivities(),
  });
}
