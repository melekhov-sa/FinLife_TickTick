"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface MealEntry {
  id: number;
  week_start: string;
  day_of_week: number;
  meal_slot: string;
  dish_name: string;
  dish_id: number | null;
}

export function useMealPlan(weekStart: string) {
  return useQuery<MealEntry[]>({
    queryKey: ["meal-plan", weekStart],
    queryFn: () => api.get<MealEntry[]>(`/api/v2/meal-plan?week=${weekStart}`),
  });
}

export function useUpsertMealEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { week_start: string; day_of_week: number; meal_slot: string; dish_name: string; dish_id?: number | null }) =>
      api.post<MealEntry>("/api/v2/meal-plan/entries", data),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["meal-plan", vars.week_start] }),
  });
}

export function useDeleteMealEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, week_start }: { id: number; week_start: string }) =>
      api.delete(`/api/v2/meal-plan/entries/${id}`),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["meal-plan", vars.week_start] }),
  });
}
