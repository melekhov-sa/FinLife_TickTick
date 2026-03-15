import { useQuery } from "@tanstack/react-query";
import type { HabitItem } from "@/types/api";

async function fetchHabits(): Promise<HabitItem[]> {
  const res = await fetch("/api/v2/habits", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useHabits() {
  return useQuery<HabitItem[], Error>({
    queryKey: ["habits"],
    queryFn: fetchHabits,
    staleTime: 60 * 1000,
  });
}
