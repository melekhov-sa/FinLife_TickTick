import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UserMe } from "@/types/api";

export function useMe() {
  return useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => api.get<UserMe>("/api/v2/me"),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}
