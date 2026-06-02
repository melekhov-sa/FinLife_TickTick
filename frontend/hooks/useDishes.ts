"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DishIngredient {
  id: number;
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  sort_order: number;
}

export interface Dish {
  id: number;
  name: string;
  meal_types: string | null;
  instructions: string | null;
  ingredients: DishIngredient[];
}

export interface DishCreate {
  name: string;
  meal_types?: string | null;
  instructions?: string | null;
  ingredients?: { ingredient_name: string; quantity?: string | null; unit?: string | null; sort_order?: number }[];
}

export interface DishUpdate {
  name?: string;
  meal_types?: string | null;
  instructions?: string | null;
}

const QK = ["dishes"] as const;

export function useDishes() {
  return useQuery<Dish[]>({
    queryKey: QK,
    queryFn: () => api.get<Dish[]>("/api/v2/dishes"),
  });
}

export function useDish(id: number | null) {
  return useQuery<Dish>({
    queryKey: ["dishes", id],
    queryFn: () => api.get<Dish>(`/api/v2/dishes/${id}`),
    enabled: id !== null,
  });
}

export function useCreateDish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DishCreate) => api.post<Dish>("/api/v2/dishes", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useUpdateDish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: DishUpdate & { id: number }) =>
      api.patch<Dish>(`/api/v2/dishes/${id}`, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["dishes", vars.id] });
    },
  });
}

export function useDeleteDish() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/dishes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });
}

export function useReplaceIngredients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      dishId,
      ingredients,
    }: {
      dishId: number;
      ingredients: { ingredient_name: string; quantity?: string | null; unit?: string | null; sort_order?: number }[];
    }) => api.put<Dish>(`/api/v2/dishes/${dishId}/ingredients`, ingredients),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: QK });
      qc.invalidateQueries({ queryKey: ["dishes", vars.dishId] });
    },
  });
}

export function useUploadDishImage() {
  return useMutation({
    mutationFn: async ({ dishId, file }: { dishId: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.postForm<{ url: string }>(`/api/v2/dishes/${dishId}/images`, fd);
    },
  });
}

export function useMealPlanToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { week_start: string; list_title?: string }) =>
      api.post("/api/v2/meal-plan/to-list", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shared-lists"] }),
  });
}
