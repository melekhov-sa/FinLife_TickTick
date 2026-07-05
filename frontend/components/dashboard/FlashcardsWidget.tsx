"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Flame, Play } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface StatsOut {
  total_cards: number;
  learned: number;
  due_today: number;
  new_today: number;
  streak_days: number;
  total_correct: number;
  total_wrong: number;
  accuracy: number;
  xp: number;
  level: number;
  xp_in_level: number;
  xp_to_next: number;
}

const LEVEL_TITLES: Record<number, string> = {
  1: "Новичок", 2: "Ученик", 3: "Практик", 4: "Знаток",
  5: "Эксперт", 6: "Мастер", 7: "Гуру", 8: "Легенда",
};

function levelTitle(n: number) {
  return LEVEL_TITLES[n] ?? `Уровень ${n}`;
}

export function FlashcardsWidget() {
  const router = useRouter();

  const { data: stats } = useQuery({
    queryKey: ["flashcards-stats"],
    queryFn: () => api.get<StatsOut>("/api/v2/flashcards/stats"),
    staleTime: 60_000,
  });

  const hasSession = stats && (stats.new_today > 0 || stats.due_today > 0);
  const xpPct = stats
    ? Math.round((stats.xp_in_level / (stats.xp_in_level + stats.xp_to_next)) * 100)
    : 0;

  return (
    <div
      className="rounded-2xl overflow-hidden cursor-pointer group transition-transform hover:scale-[1.01]"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.13) 0%, rgba(139,92,246,0.13) 100%)",
        border: "1px solid rgba(99,102,241,0.25)",
      }}
      onClick={() => router.push("/flashcards")}
    >
      {/* Header row */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        <div
          className="flex items-center justify-center rounded-xl shrink-0"
          style={{ width: 36, height: 36, background: "rgba(99,102,241,0.18)" }}
        >
          <BookOpen size={17} style={{ color: "var(--app-accent)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--t-primary)", lineHeight: 1.2 }}>
            Флеш-карты
          </div>
          {stats && (
            <div style={{ fontSize: 11.5, color: "var(--t-muted)" }}>
              {levelTitle(stats.level)} · Ур.{stats.level}
            </div>
          )}
        </div>
        {stats && stats.streak_days > 0 && (
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full shrink-0"
            style={{ background: "rgba(249,115,22,0.15)", fontSize: 12, fontWeight: 600, color: "#F97316" }}
          >
            <Flame size={12} />
            {stats.streak_days}
          </div>
        )}
      </div>

      {/* XP bar */}
      {stats && (
        <div className="px-4 pb-3">
          <div className="flex justify-between mb-1" style={{ fontSize: 10.5, color: "var(--t-muted)" }}>
            <span>{stats.xp} XP</span>
            <span>+{stats.xp_to_next} до ур.{stats.level + 1}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(99,102,241,0.15)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${xpPct}%`,
                background: "var(--app-accent-gradient)",
                boxShadow: xpPct > 5 ? "0 0 6px rgba(99,102,241,0.5)" : "none",
              }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div
          className="flex items-center gap-0 border-t"
          style={{ borderColor: "rgba(99,102,241,0.15)" }}
        >
          <div className="flex-1 flex flex-col items-center py-3">
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t-primary)" }}>{stats.learned}</div>
            <div style={{ fontSize: 10.5, color: "var(--t-muted)" }}>изучено</div>
          </div>
          <div style={{ width: 1, height: 28, background: "rgba(99,102,241,0.15)" }} />
          <div className="flex-1 flex flex-col items-center py-3">
            <div style={{ fontSize: 16, fontWeight: 700, color: stats.total_correct + stats.total_wrong > 0 ? "#22C55E" : "var(--t-primary)" }}>
              {stats.total_correct + stats.total_wrong > 0
                ? `${Math.round(stats.accuracy * 100)}%`
                : "—"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--t-muted)" }}>точность</div>
          </div>
          <div style={{ width: 1, height: 28, background: "rgba(99,102,241,0.15)" }} />
          <div className="flex-1 flex flex-col items-center py-3">
            <div style={{ fontSize: 16, fontWeight: 700, color: hasSession ? "var(--app-accent)" : "var(--t-primary)" }}>
              {(stats.new_today + stats.due_today) || "✓"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--t-muted)" }}>сегодня</div>
          </div>
        </div>
      )}

      {/* CTA button — daily lesson if available, else unlimited practice */}
      <div className="px-4 pb-4">
        <button
          onClick={e => {
            e.stopPropagation();
            router.push(hasSession ? "/flashcards/session" : "/flashcards/session?mode=practice");
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl transition-all"
          style={{
            height: 40,
            fontWeight: 600,
            fontSize: 13.5,
            background: "var(--app-accent-gradient)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          {hasSession ? (
            <>
              <Play size={14} fill="#fff" />
              Начать занятие
            </>
          ) : (
            <>
              <Play size={14} fill="#fff" />
              Тренироваться
            </>
          )}
        </button>
      </div>
    </div>
  );
}
