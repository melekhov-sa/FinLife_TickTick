import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DigestListItem, DigestDetail } from "@/types/api";

export function useDigests(periodType = "week", limit = 20) {
  return useQuery<DigestListItem[]>({
    queryKey: ["digests", periodType, limit],
    queryFn: () =>
      api.get<DigestListItem[]>(
        `/api/v2/digests?period_type=${periodType}&limit=${limit}`
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDigest(periodType: string, periodKey: string) {
  return useQuery<DigestDetail>({
    queryKey: ["digest", periodType, periodKey],
    queryFn: () =>
      api.get<DigestDetail>(`/api/v2/digests/${periodType}/${periodKey}`),
    staleTime: 10 * 60 * 1000,
  });
}

export function useUnviewedLatestDigest() {
  return useQuery<DigestListItem | null>({
    queryKey: ["digest-unviewed-latest"],
    queryFn: () =>
      api.get<DigestListItem | null>("/api/v2/digests/unviewed-latest"),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
}

export function useDigestMarkViewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (digestId: number) =>
      api.post(`/api/v2/digests/${digestId}/viewed`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digests"] });
      qc.invalidateQueries({ queryKey: ["digest-unviewed-latest"] });
    },
  });
}

export function useDigestBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (weeksBack: number) =>
      api.post("/api/v2/digests/backfill", { weeks_back: weeksBack }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["digests"] });
      qc.invalidateQueries({ queryKey: ["digest-unviewed-latest"] });
    },
  });
}
