import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { SubscriptionItem } from "@/types/api";

export function useSubscriptions() {
  return useQuery<SubscriptionItem[]>({
    queryKey: ["subscriptions"],
    queryFn: () => api.get<SubscriptionItem[]>("/api/v2/subscriptions"),
    staleTime: 60_000,
  });
}

export function useUpdateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subId, data }: {
      subId: number;
      data: Partial<{ name: string; paid_until_self: string | null }>;
    }) => api.patch(`/api/v2/subscriptions/${subId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useArchiveSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subId: number) => api.delete(`/api/v2/subscriptions/${subId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subId, memberId, data }: {
      subId: number;
      memberId: number;
      data: Partial<{ paid_until: string | null; payment_per_month: number | null }>;
    }) => api.patch(`/api/v2/subscriptions/${subId}/members/${memberId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}

export function useArchiveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subId, memberId }: { subId: number; memberId: number }) =>
      api.delete(`/api/v2/subscriptions/${subId}/members/${memberId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subscriptions"] }),
  });
}
