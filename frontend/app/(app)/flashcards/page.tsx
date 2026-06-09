"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Flame, Brain, CheckCircle2, XCircle, Play } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Skeleton } from "@/components/primitives/Skeleton";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface CategoryOut {
  id: number;
  name: string;
  emoji: string | null;
  description: string | null;
  total: number;
  learned: number;
  skipped: number;
}

interface StatsOut {
  total_cards: number;
  learned: number;
  skipped: number;
  due_today: number;
  new_today: number;
  streak_days: number;
}

function StreakBadge({ days }: { days: number }) {
  if (days === 0) return null;
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold"
      style={{
        background: "color-mix(in srgb, #F97316 15%, transparent)",
        color: "#F97316",
        fontSize: 13,
      }}
    >
      <Flame size={14} />
      {days} {days === 1 ? "день" : days < 5 ? "дня" : "дней"} подряд
    </div>
  );
}

function StatPill({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div
      className="flex flex-col items-center gap-1 px-4 py-3 rounded-2xl flex-1"
      style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
    >
      <div className="flex items-center gap-1.5" style={{ color: accent }}>
        {icon}
        <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t-primary)" }}>{value}</span>
      </div>
      <span style={{ fontSize: 11, color: "var(--t-muted)" }}>{label}</span>
    </div>
  );
}

function CategoryCard({ cat, onClick }: { cat: CategoryOut; onClick: () => void }) {
  const pct = cat.total > 0 ? Math.round((cat.learned / cat.total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 p-4 rounded-2xl transition-colors hover:bg-[var(--app-accent-weak)]"
      style={{
        background: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div
        className="shrink-0 flex items-center justify-center text-2xl rounded-xl"
        style={{ width: 48, height: 48, background: "var(--app-accent-weak)" }}
      >
        {cat.emoji ?? "📚"}
      </div>
      <div className="flex-1 min-w-0">
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--t-primary)" }}>{cat.name}</div>
        {cat.description && (
          <div className="truncate mt-0.5" style={{ fontSize: 12.5, color: "var(--t-muted)" }}>
            {cat.description}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--app-border)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: "var(--app-accent)" }}
            />
          </div>
          <span style={{ fontSize: 11, color: "var(--t-muted)", whiteSpace: "nowrap" }}>
            {cat.learned}/{cat.total}
          </span>
        </div>
      </div>
      <div style={{ color: "var(--t-faint)" }}>›</div>
    </button>
  );
}

export default function FlashcardsPage() {
  const router = useRouter();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["flashcards-stats"],
    queryFn: () => api.get<StatsOut>("/api/v2/flashcards/stats"),
  });

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ["flashcards-categories"],
    queryFn: () => api.get<CategoryOut[]>("/api/v2/flashcards/categories"),
  });

  const canStartSession = stats && (stats.new_today > 0 || stats.due_today > 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Флеш-карты"
        subtitle="Умные слова для работы"
        actions={
          stats?.streak_days ? <StreakBadge days={stats.streak_days} /> : undefined
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-6 py-4 flex flex-col gap-4 max-w-2xl mx-auto">

          {/* Stats row */}
          {statsLoading ? (
            <div className="flex gap-3">
              <Skeleton className="h-20 flex-1 rounded-2xl" />
              <Skeleton className="h-20 flex-1 rounded-2xl" />
              <Skeleton className="h-20 flex-1 rounded-2xl" />
            </div>
          ) : stats ? (
            <div className="flex gap-3">
              <StatPill icon={<Brain size={14} />} label="Всего слов" value={stats.total_cards} accent="var(--app-accent)" />
              <StatPill icon={<CheckCircle2 size={14} />} label="Изучено" value={stats.learned} accent="#22C55E" />
              <StatPill icon={<XCircle size={14} />} label="Пропущено" value={stats.skipped} accent="var(--t-muted)" />
            </div>
          ) : null}

          {/* Session button */}
          <button
            onClick={() => router.push("/flashcards/session")}
            disabled={!canStartSession}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all"
            style={{
              background: canStartSession ? "var(--app-accent)" : "var(--app-card-bg)",
              border: canStartSession ? "none" : "1px solid var(--app-border)",
              color: canStartSession ? "#fff" : "var(--t-muted)",
              cursor: canStartSession ? "pointer" : "default",
              opacity: canStartSession ? 1 : 0.6,
            }}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                {statsLoading ? "Загрузка..." : canStartSession ? "Начать занятие" : "На сегодня всё"}
              </span>
              {stats && canStartSession && (
                <span style={{ fontSize: 12.5, opacity: 0.85 }}>
                  {stats.new_today > 0 && `${stats.new_today} новых`}
                  {stats.new_today > 0 && stats.due_today > 0 && " · "}
                  {stats.due_today > 0 && `${stats.due_today} на повторение`}
                </span>
              )}
              {stats && !canStartSession && (
                <span style={{ fontSize: 12.5 }}>Все слова выучены на сегодня 🎉</span>
              )}
            </div>
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 40, height: 40,
                background: canStartSession ? "rgba(255,255,255,0.2)" : "var(--app-accent-weak)",
                color: canStartSession ? "#fff" : "var(--app-accent)",
              }}
            >
              <Play size={18} fill="currentColor" />
            </div>
          </button>

          {/* Categories */}
          <div>
            <div className="flex items-center gap-2 mb-3" style={{ fontSize: 13, fontWeight: 600, color: "var(--t-muted)" }}>
              <BookOpen size={14} />
              КАТЕГОРИИ
            </div>
            {catsLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {categories?.map(cat => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    onClick={() => router.push(`/flashcards/session?category=${cat.id}`)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
