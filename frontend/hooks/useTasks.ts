import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TaskItem } from "@/types/api";

export function useTasks(status = "ACTIVE") {
  return useQuery<TaskItem[]>({
    queryKey: ["tasks", status],
    queryFn: () => api.get<TaskItem[]>(`/api/v2/tasks?status=${status}&limit=200`),
    staleTime: 15 * 1000,
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

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: number) => api.post(`/api/v2/tasks/${taskId}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
