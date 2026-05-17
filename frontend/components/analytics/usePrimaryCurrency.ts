"use client";

import { useDashboard } from "@/hooks/useDashboard";

/** Returns the first currency key from financial_summary, or "UAH" as fallback. */
export function usePrimaryCurrency(): string {
  const { data } = useDashboard();
  if (!data) return "UAH";
  const keys = Object.keys(data.financial_summary);
  return keys[0] ?? "UAH";
}
