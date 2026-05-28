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
        birth_year: number | null;
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
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCompleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/events/occurrences/${occurrenceId}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
}

export function useUncompleteEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceId: number) =>
      api.post(`/api/v2/events/occurrences/${occurrenceId}/uncomplete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateEventSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, data }: { eventId: number; data: { completion_mode?: string } }) =>
      api.patch(`/api/v2/events/${eventId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-templates"] });
    },
  });
}

export function useUpdateEventTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      data,
    }: {
      eventId: number;
      data: Partial<{
        title: string;
        description: string | null;
        category_id: number | null;
        completion_mode: string;
        default_start_time: string | null;
        default_end_time: string | null;
      }>;
    }) => api.patch(`/api/v2/events/${eventId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["event-templates"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });
}
