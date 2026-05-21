import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { EventTaskTemplateItem } from "@/types/api";

const key = (eventId: number) => ["event-task-templates", eventId];

export function useEventTaskTemplates(eventId: number) {
  return useQuery<EventTaskTemplateItem[]>({
    queryKey: key(eventId),
    queryFn: () => api.get<EventTaskTemplateItem[]>(`/api/v2/events/${eventId}/task-templates`),
    staleTime: 60_000,
  });
}

export function useCreateEventTaskTemplate(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; days_before: number; reminder_offset_minutes: number | null }) =>
      api.post<EventTaskTemplateItem>(`/api/v2/events/${eventId}/task-templates`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(eventId) }),
  });
}

export function useUpdateEventTaskTemplate(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; title?: string; days_before?: number; reminder_offset_minutes?: number | null }) =>
      api.patch<EventTaskTemplateItem>(`/api/v2/events/${eventId}/task-templates/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(eventId) }),
  });
}

export function useDeleteEventTaskTemplate(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archiveTasks }: { id: number; archiveTasks: boolean }) =>
      api.delete(`/api/v2/events/${eventId}/task-templates/${id}?archive_tasks=${archiveTasks}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(eventId) }),
  });
}
