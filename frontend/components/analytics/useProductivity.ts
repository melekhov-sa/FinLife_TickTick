"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ProductivityData {
  tasks: {
    active: number;
    done_7d: number;
    done_30d: number;
    overdue: number;
    velocity_7d: number;
    weekly_trend: { week: string; count: number }[];
  };
  habits: {
    total: number;
    today_done: number;
    today_total: number;
    rate_7d: number;
    rate_30d: number;
    best_streak: number;
    daily_chart: { day: string; done: number; total: number }[];
    top_habits: {
      title: string;
      current_streak: number;
      best_streak: number;
      done_30d: number;
    }[];
  };
}

export function useProductivity() {
  return useQuery<ProductivityData>({
    queryKey: ["analytics-productivity"],
    queryFn: () => api.get<ProductivityData>("/api/v2/analytics/productivity"),
    staleTime: 5 * 60 * 1000,
  });
}
