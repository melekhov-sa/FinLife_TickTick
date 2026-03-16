import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EventItem } from "@/types/api";

export function useEvents(days = 30) {
  return useQuery<EventItem[]>({
    queryKey: ["events", days],
    queryFn: () => api.get<EventItem[]>(`/api/v2/events?days=${days}`),
    staleTime: 60 * 1000,
  });
}

export function useCreateEventQuick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; start_date: string; category_id?: number }) =>
      api.post("/api/v2/events", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      occurrenceId,
      data,
    }: {
      occurrenceId: number;
      data: Partial<{
        title: string;
        description: string | null;
        start_date: string;
        start_time: string | null;
        end_date: string | null;
        category_id: number | null;
      }>;
    }) => api.patch(`/api/v2/events/occurrences/${occurrenceId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceId: number) =>
      api.delete(`/api/v2/events/occurrences/${occurrenceId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDuplicateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/events/occurrences/${occurrenceId}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
