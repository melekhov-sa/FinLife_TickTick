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

export interface CreateTemplateData {
  title: string;
  days_before: number;
  reminder_offset_minutes: number | null;
  is_after_event: boolean;
  minutes_after_end: number | null;
  auto_complete_mode: "end_of_day" | "at_event_end" | null;
}

export function useCreateEventTaskTemplate(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTemplateData) =>
      api.post<EventTaskTemplateItem>(`/api/v2/events/${eventId}/task-templates`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(eventId) }),
  });
}

export function useUpdateEventTaskTemplate(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number } & Partial<CreateTemplateData>) =>
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
