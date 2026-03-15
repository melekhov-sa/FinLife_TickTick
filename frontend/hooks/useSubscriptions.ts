import { useQuery } from "@tanstack/react-query";
import type { SubscriptionItem } from "@/types/api";

async function fetchSubscriptions(): Promise<SubscriptionItem[]> {
  const res = await fetch("/api/v2/subscriptions", { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useSubscriptions() {
  return useQuery<SubscriptionItem[], Error>({
    queryKey: ["subscriptions"],
    queryFn: fetchSubscriptions,
    staleTime: 60 * 1000,
  });
}
