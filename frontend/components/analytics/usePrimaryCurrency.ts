"use client";

import { useDashboard } from "@/hooks/useDashboard";

export const CURRENCY_SYM: Record<string, string> = {
  UAH: "₴", RUB: "₽", USD: "$", EUR: "€", GBP: "£", PLN: "zł",
};

/** Returns the first currency key from financial_summary, or "RUB" as fallback. */
export function usePrimaryCurrency(): string {
  const { data } = useDashboard();
  if (!data) return "RUB";
  const keys = Object.keys(data.financial_summary);
  return keys[0] ?? "RUB";
}

/** Returns the symbol for the primary currency (e.g. "₽"). */
export function usePrimaryCurrencySym(): string {
  const code = usePrimaryCurrency();
  return CURRENCY_SYM[code] ?? code;
}
