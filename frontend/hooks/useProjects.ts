import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProjectSummary, ProjectDetail } from "@/types/api";

export function useProjects(status?: string) {
  const params = status ? `?status=${status}` : "";
  return useQuery<ProjectSummary[]>({
    queryKey: ["projects", status],
    queryFn: () => api.get<ProjectSummary[]>(`/api/v2/projects${params}`),
    staleTime: 30 * 1000,
  });
}

export function useProject(projectId: number) {
  return useQuery<ProjectDetail>({
    queryKey: ["project", projectId],
    queryFn: () => api.get<ProjectDetail>(`/api/v2/projects/${projectId}`),
    staleTime: 15 * 1000,
  });
}
