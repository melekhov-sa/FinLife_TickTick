"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface MaintenanceItem {
  id: number;
  title: string;
  description: string | null;
  interval_days: number;
  last_done_date: string | null;
  last_done_note: string | null;
  notify_days_before: number | null;
  is_archived: boolean;
  next_due_date: string | null;
  days_until_next: number | null;
  is_overdue: boolean;
  is_never_done: boolean;
}

export function useMaintenance() {
  return useQuery<MaintenanceItem[]>({
    queryKey: ["maintenance"],
    queryFn: () => api.get<MaintenanceItem[]>("/api/v2/maintenance"),
  });
}

export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string | null;
      interval_days: number;
      last_done_date?: string | null;
      notify_days_before?: number | null;
    }) => api.post<MaintenanceItem>("/api/v2/maintenance", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}

export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; [key: string]: unknown }) =>
      api.patch<MaintenanceItem>(`/api/v2/maintenance/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}

export function useMarkMaintenanceDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      api.post<MaintenanceItem>(`/api/v2/maintenance/${id}/done`, { note: note || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}

export function useArchiveMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/maintenance/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}
