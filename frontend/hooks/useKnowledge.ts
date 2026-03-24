import { useQuery } from "@tanstack/react-query";
import type { ArticleListItem } from "@/types/api";
import { api } from "@/lib/api";

interface KnowledgeFilters {
  search?: string;
  type?: string;
  status?: string;
}

export function useKnowledge(filters: KnowledgeFilters = {}) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();

  return useQuery<ArticleListItem[], Error>({
    queryKey: ["knowledge", filters],
    queryFn: () => api.get<ArticleListItem[]>(`/api/v2/knowledge${qs ? `?${qs}` : ""}`),
    staleTime: 30 * 1000,
  });
}
