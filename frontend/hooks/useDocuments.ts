"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document } from "@/types/api";

export function useDocuments(includeArchived = false) {
  return useQuery<Document[]>({
    queryKey: ["documents", { includeArchived }],
    queryFn: () =>
      api.get<Document[]>(`/api/v2/documents${includeArchived ? "?include_archived=true" : ""}`),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      doc_type?: string | null;
      issued_date?: string | null;
      expiry_date: string;
      notify_days_before?: number | null;
      note?: string | null;
    }) => api.post<Document>("/api/v2/documents", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; [key: string]: unknown }) =>
      api.patch<Document>(`/api/v2/documents/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useArchiveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
