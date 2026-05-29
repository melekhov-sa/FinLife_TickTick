"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface MediaEntry {
  id: number;
  media_type: string;
  title: string;
  author: string | null;
  status: string;
  rating: number | null;
  cover_url: string | null;
  note: string | null;
  finished_at: string | null;
}

export interface LookupResult {
  title: string;
  author: string | null;
  cover_url: string | null;
}

export function useMedia(mediaType?: string, status?: string) {
  const params = new URLSearchParams();
  if (mediaType) params.set("media_type", mediaType);
  if (status) params.set("status", status);
  const qs = params.toString();
  return useQuery<MediaEntry[]>({
    queryKey: ["media", mediaType ?? "all", status ?? "all"],
    queryFn: () => api.get<MediaEntry[]>(`/api/v2/media${qs ? "?" + qs : ""}`),
  });
}

export function useLookupMedia(mediaType: string, q: string) {
  return useQuery<LookupResult[]>({
    queryKey: ["media-lookup", mediaType, q],
    queryFn: () => api.get<LookupResult[]>(`/api/v2/media/lookup?media_type=${mediaType}&q=${encodeURIComponent(q)}`),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}

export function useCreateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<MediaEntry, "id"> & { media_type: string }) =>
      api.post<MediaEntry>("/api/v2/media", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useUpdateMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<MediaEntry> & { id: number }) =>
      api.patch<MediaEntry>(`/api/v2/media/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}

export function useDeleteMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/media/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["media"] }),
  });
}
