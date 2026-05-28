"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface BodyMetric {
  id: number;
  metric_type: string;
  value: number;
  value2: number | null;
  recorded_at: string;
  note: string | null;
}

export function useBodyMetrics(metricType?: string) {
  const params = metricType ? `?metric_type=${metricType}` : "";
  return useQuery<BodyMetric[]>({
    queryKey: ["body-metrics", metricType ?? "all"],
    queryFn: () => api.get<BodyMetric[]>(`/api/v2/body-metrics${params}`),
  });
}

export function useCreateBodyMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      metric_type: string;
      value: number;
      value2?: number | null;
      recorded_at?: string | null;
      note?: string | null;
    }) => api.post<BodyMetric>("/api/v2/body-metrics", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["body-metrics"] }),
  });
}

export function useDeleteBodyMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/body-metrics/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["body-metrics"] }),
  });
}
