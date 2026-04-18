import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { TaskItem, TaskAttachment } from "@/types/api";

export function useTasks(status = "ACTIVE") {
  return useQuery<TaskItem[]>({
    queryKey: ["tasks", status],
    queryFn: () => api.get<TaskItem[]>(`/api/v2/tasks?status=${status}&limit=200`),
    staleTime: 15 * 1000,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string; due_kind?: string; due_date?: string; category_id?: number }) =>
      api.post(`/api/v2/tasks`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
}

export function useCompleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => api.post(`/api/v2/tasks/${taskId}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCompleteTaskOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceId: number) => api.post(`/api/v2/task-occurrences/${occurrenceId}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => api.post(`/api/v2/tasks/${taskId}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: Partial<{ title: string; note: string | null; due_date: string | null; category_id: number | null }> }) =>
      api.patch(`/api/v2/tasks/${taskId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => api.delete(`/api/v2/tasks/${taskId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDuplicateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => api.post(`/api/v2/tasks/${taskId}/duplicate`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

// ── Attachments ──────────────────────────────────────────────────────────────

export function useTaskAttachments(taskId: number) {
  return useQuery<TaskAttachment[]>({
    queryKey: ["task-attachments", taskId],
    queryFn: () => api.get<TaskAttachment[]>(`/api/v2/tasks/${taskId}/attachments`),
    staleTime: 30_000,
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, file }: { taskId: number; file: File }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/v2/tasks/${taskId}/attachments`, {
        method: "POST",
        headers,
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        let detail = text;
        try { detail = JSON.parse(text).detail; } catch {}
        throw new Error(detail);
      }
      return res.json() as Promise<TaskAttachment>;
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, attachmentId }: { taskId: number; attachmentId: number }) =>
      api.delete(`/api/v2/tasks/${taskId}/attachments/${attachmentId}`),
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
    },
  });
}

export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderedIds: number[]) =>
      api.post('/api/v2/tasks/reorder', { ordered_ids: orderedIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['plan'] });
    },
  });
}
