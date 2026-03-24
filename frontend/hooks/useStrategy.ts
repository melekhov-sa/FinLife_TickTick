import { useQuery } from "@tanstack/react-query";
import type { StrategyData } from "@/types/api";
import { api } from "@/lib/api";

export function useStrategy() {
  return useQuery<StrategyData, Error>({
    queryKey: ["strategy"],
    queryFn: () => api.get<StrategyData>("/api/v2/strategy"),
    staleTime: 2 * 60 * 1000,
  });
}
