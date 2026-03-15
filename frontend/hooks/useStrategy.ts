import { useQuery } from "@tanstack/react-query";
import type { StrategyData } from "@/types/api";

async function fetchStrategy(): Promise<StrategyData> {
  const res = await fetch("/api/v2/strategy", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useStrategy() {
  return useQuery<StrategyData, Error>({
    queryKey: ["strategy"],
    queryFn: fetchStrategy,
    staleTime: 2 * 60 * 1000, // 2 min — compute is heavy
  });
}
