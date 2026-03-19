import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { HabitItem } from "@/types/api";

export function useHabits(includeArchived = false) {
  return useQuery<HabitItem[]>({
    queryKey: ["habits", includeArchived],
    queryFn: () => api.get<HabitItem[]>(`/api/v2/habits?include_archived=${includeArchived}`),
    staleTime: 30 * 1000,
  });
}

export function useRestoreHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habitId: number) => api.post(`/api/v2/habits/${habitId}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCompleteHabitToday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habitId: number) => api.post(`/api/v2/habits/${habitId}/complete-today`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useSkipHabitToday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habitId: number) => api.post(`/api/v2/habits/${habitId}/skip-today`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
    },
  });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      habitId,
      data,
    }: {
      habitId: number;
      data: Partial<{
        title: string;
        note: string | null;
        level: number;
        category_id: number | null;
        reminder_time: string | null;
      }>;
    }) => api.patch(`/api/v2/habits/${habitId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
    },
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (habitId: number) => api.delete(`/api/v2/habits/${habitId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
