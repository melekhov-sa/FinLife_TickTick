import { useQuery } from "@tanstack/react-query";
import type { EventItem } from "@/types/api";

async function fetchEvents(days: number): Promise<EventItem[]> {
  const res = await fetch(`/api/v2/events?days=${days}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useEvents(days = 30) {
  return useQuery<EventItem[], Error>({
    queryKey: ["events", days],
    queryFn: () => fetchEvents(days),
    staleTime: 60 * 1000,
  });
}
