"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface FootballMatch {
  id: number;
  external_id: number;
  match_date: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  competition: string;
  venue: string | null;
  status: string;
  score_home: number | null;
  score_away: number | null;
}

export function useFootballMatches(upcoming = true) {
  return useQuery<FootballMatch[]>({
    queryKey: ["football-matches", upcoming],
    queryFn: () => api.get<FootballMatch[]>(`/api/v2/football/matches?upcoming=${upcoming}`),
    staleTime: 60 * 60_000, // 1 hour
  });
}
