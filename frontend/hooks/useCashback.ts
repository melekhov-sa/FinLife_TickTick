"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CashbackCategory, CashbackMonth } from "@/types/api";

/** "2026-09" для переданной даты. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** «Сентябрь 2026» с заглавной буквы. */
export function monthLabel(d: Date): string {
  const s = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function useCashbackMonth(month: string) {
  return useQuery({
    queryKey: ["cashback", month],
    queryFn: () => api.get<CashbackMonth>(`/api/v2/cashback?month=${month}`),
  });
}

export function useCashbackCategories() {
  return useQuery({
    queryKey: ["cashback-categories"],
    queryFn: () => api.get<CashbackCategory[]>("/api/v2/cashback/categories"),
  });
}

interface CreateEntryBody {
  wallet_id: number;
  percent: number;
  month: string;
  category_title: string;
}

export function useCreateEntry(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateEntryBody) => api.post("/api/v2/cashback/entries", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cashback", month] });
      qc.invalidateQueries({ queryKey: ["cashback-categories"] });
    },
  });
}

export function useUpdateEntry(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, percent }: { id: number; percent: number }) =>
      api.patch(`/api/v2/cashback/entries/${id}`, { percent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashback", month] }),
  });
}

export function useDeleteEntry(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/cashback/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cashback", month] }),
  });
}
