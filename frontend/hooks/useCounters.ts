import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CounterItem } from "@/types/api";

export function useCounters() {
  return useQuery<CounterItem[]>({
    queryKey: ["counters"],
    queryFn: () => api.get<CounterItem[]>("/api/v2/counters"),
    staleTime: 30_000,
  });
}

export function useCreateCounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      emoji?: string | null;
      mode: string;
      source_category_id?: number | null;
      period_type: string;
    }) => api.post<CounterItem>("/api/v2/counters", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counters"] }),
  });
}

export function useUpdateCounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: number;
      data: Partial<{
        title: string;
        emoji: string | null;
        mode: string;
        source_category_id: number | null;
        period_type: string;
        sort_order: number;
      }>;
    }) => api.patch<CounterItem>(`/api/v2/counters/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counters"] }),
  });
}

export function useDeleteCounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/counters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counters"] }),
  });
}

export function useIncrementCounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<CounterItem>(`/api/v2/counters/${id}/increment`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counters"] }),
  });
}

export function useDecrementCounter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<CounterItem>(`/api/v2/counters/${id}/decrement`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["counters"] }),
  });
}
