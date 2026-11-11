import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, call, type Schemas } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { operations } from "@/lib/api/schema";

export type InquirySummary = Schemas["TradeInquirySummary"];
export type InquiryDetail = Schemas["TradeInquiryDetailResponse"];
export type InquiryStatus = Schemas["TradeInquiryStatus"];
export type InquiryListParams = NonNullable<operations["AdminTradeInquiries_list"]["parameters"]["query"]>;
export type InquiryUpdate = Schemas["UpdateTradeInquiryDto"];

// New leads should show up without a reload: fresh for 20 s, re-polled every 30 s while the tab is visible
// (TanStack Query pauses refetchInterval in background tabs by default).
const FRESH = 20_000;
const POLL = 30_000;

export function useTradeInquiries(params: InquiryListParams) {
  return useQuery({
    queryKey: queryKeys.inquiries.list(params),
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/trade-inquiries", { params: { query: params }, signal })),
    placeholderData: keepPreviousData,
    staleTime: FRESH,
    refetchInterval: POLL,
  });
}

export function useTradeInquiryStats() {
  return useQuery({
    queryKey: queryKeys.inquiries.stats,
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/trade-inquiries/stats", { signal })),
    staleTime: FRESH,
    refetchInterval: POLL,
  });
}

export function useTradeInquiry(id: string) {
  return useQuery({
    queryKey: queryKeys.inquiries.detail(id),
    queryFn: ({ signal }) =>
      call(api.GET("/api/v1/admin/trade-inquiries/{id}", { params: { path: { id } }, signal })),
    enabled: Boolean(id),
    staleTime: FRESH,
  });
}

/** Active accounts that can work inquiries (holders of inquiry:write). */
export function useInquiryAssignees(enabled = true) {
  return useQuery({
    queryKey: queryKeys.inquiries.assignees,
    queryFn: ({ signal }) => call(api.GET("/api/v1/admin/trade-inquiries/assignees", { signal })),
    enabled,
    staleTime: 5 * 60_000,
  });
}

function useInquiryWrite<TVars, TResult>(mutationFn: (vars: TVars) => Promise<TResult>, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.inquiries.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inquiries.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.inquiries.stats });
    },
  });
}

export const useUpdateInquiry = (id: string) =>
  useInquiryWrite(
    (body: InquiryUpdate) =>
      call(api.PATCH("/api/v1/admin/trade-inquiries/{id}", { params: { path: { id } }, body })),
    id,
  );

export const useAddInquiryNote = (id: string) =>
  useInquiryWrite(
    (body: string) =>
      call(api.POST("/api/v1/admin/trade-inquiries/{id}/notes", { params: { path: { id } }, body: { body } })),
    id,
  );

export const useResendInquiryNotification = (id: string) =>
  useInquiryWrite(
    () => call(api.POST("/api/v1/admin/trade-inquiries/{id}/resend-notification", { params: { path: { id } } })),
    id,
  );
