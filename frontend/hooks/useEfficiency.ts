import { useQuery } from "@tanstack/react-query";
import type { EfficiencyData } from "@/types/api";

async function fetchEfficiency(): Promise<EfficiencyData> {
  const res = await fetch("/api/v2/efficiency", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useEfficiency() {
  return useQuery<EfficiencyData, Error>({
    queryKey: ["efficiency"],
    queryFn: fetchEfficiency,
    staleTime: 60 * 1000,
  });
}
