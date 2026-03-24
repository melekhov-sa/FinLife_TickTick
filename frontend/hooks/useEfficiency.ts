import { useQuery } from "@tanstack/react-query";
import type { EfficiencyData } from "@/types/api";
import { api } from "@/lib/api";

export function useEfficiency() {
  return useQuery<EfficiencyData, Error>({
    queryKey: ["efficiency"],
    queryFn: () => api.get<EfficiencyData>("/api/v2/efficiency"),
    staleTime: 60 * 1000,
  });
}
