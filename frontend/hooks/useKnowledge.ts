import { useQuery } from "@tanstack/react-query";
import type { ArticleListItem } from "@/types/api";

interface KnowledgeFilters {
  search?: string;
  type?: string;
  status?: string;
}

async function fetchKnowledge(filters: KnowledgeFilters): Promise<ArticleListItem[]> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("status", filters.status);
  const qs = params.toString();
  const res = await fetch(`/api/v2/knowledge${qs ? `?${qs}` : ""}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function useKnowledge(filters: KnowledgeFilters = {}) {
  return useQuery<ArticleListItem[], Error>({
    queryKey: ["knowledge", filters],
    queryFn: () => fetchKnowledge(filters),
    staleTime: 30 * 1000,
  });
}
