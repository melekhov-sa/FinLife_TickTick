"use client";

import { useRouter } from "next/navigation";
import { BookOpen, Flame, Brain, CheckCircle2, XCircle, Play, Target, Zap, Lock } from "lucide-react";
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

interface Achievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  unlocked: boolean;
}

interface StatsOut {
  total_cards: number;
  learned: number;
  skipped: number;
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
  achievements: Achievement[];
}

const LEVEL_TITLES: Record<number, string> = {
  1: "Новичок", 2: "Ученик", 3: "Практик", 4: "Знаток",
  5: "Эксперт", 6: "Мастер", 7: "Гуру", 8: "Легенда",
};
function levelTitle(n: number) { return LEVEL_TITLES[n] ?? `Ур.${n}`; }

// ── Level card ─────────────────────────────────────────────────────────────────
function LevelPanel({ stats }: { stats: StatsOut }) {
  const pct = Math.round((stats.xp_in_level / (stats.xp_in_level + stats.xp_to_next)) * 100);
  const totalAnswers = stats.total_correct + stats.total_wrong;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.12) 100%)",
        border: "1px solid rgba(99,102,241,0.25)",
      }}
    >
      {/* Level header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div style={{ fontSize: 12, color: "rgba(129,140,248,0.8)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {levelTitle(stats.level)}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--t-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>
            Уровень {stats.level}
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: "rgba(99,102,241,0.2)", fontSize: 13, fontWeight: 700, color: "#818cf8" }}
        >
          <Zap size={13} fill="#818cf8" />
          {stats.xp} XP
        </div>
      </div>

      {/* XP bar */}
      <div className="mb-1">
        <div className="flex justify-between mb-1.5" style={{ fontSize: 11, color: "rgba(129,140,248,0.7)" }}>
          <span>{stats.xp_in_level} XP</span>
          <span>до ур.{stats.level + 1}: ещё {stats.xp_to_next} XP</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(99,102,241,0.15)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: "linear-gradient(90deg, #6366f1, #818cf8)",
              boxShadow: pct > 5 ? "0 0 8px rgba(99,102,241,0.5)" : "none",
            }}
          />
        </div>
      </div>

      {/* Stat chips */}
      <div className="flex gap-2 mt-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(34,197,94,0.12)", fontSize: 12, color: "#22C55E", fontWeight: 600 }}>
          <CheckCircle2 size={12} />
          {stats.total_correct} верно
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.1)", fontSize: 12, color: "#EF4444", fontWeight: 600 }}>
          <XCircle size={12} />
          {stats.total_wrong} ошибок
        </div>
        {totalAnswers > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(251,191,36,0.12)", fontSize: 12, color: "#F59E0B", fontWeight: 600 }}>
            <Target size={12} />
            {Math.round(stats.accuracy * 100)}% точность
          </div>
        )}
        {stats.streak_days > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: "rgba(249,115,22,0.12)", fontSize: 12, color: "#F97316", fontWeight: 600 }}>
            <Flame size={12} />
            {stats.streak_days} {stats.streak_days === 1 ? "день" : stats.streak_days < 5 ? "дня" : "дней"} подряд
          </div>
        )}
      </div>
    </div>
  );
}

// ── Achievements grid ──────────────────────────────────────────────────────────
function AchievementsPanel({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3" style={{ fontSize: 13, fontWeight: 600, color: "var(--t-muted)" }}>
        <span>🏅</span>
        ДОСТИЖЕНИЯ
        <span style={{ fontSize: 12, fontWeight: 500 }}>
          {unlocked.length}/{achievements.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {achievements.map(a => (
          <div
            key={a.id}
            className="flex items-center gap-3 p-3 rounded-xl"
            style={{
              background: a.unlocked ? "var(--app-card-bg)" : "var(--app-card-bg)",
              border: a.unlocked ? "1px solid rgba(99,102,241,0.3)" : "1px solid var(--app-border)",
              opacity: a.unlocked ? 1 : 0.5,
            }}
          >
            <div
              className="flex items-center justify-center shrink-0 rounded-lg text-lg"
              style={{
                width: 36, height: 36,
                background: a.unlocked ? "rgba(99,102,241,0.12)" : "var(--app-border)",
              }}
            >
              {a.unlocked ? a.emoji : <Lock size={14} style={{ color: "var(--t-faint)" }} />}
            </div>
            <div className="min-w-0">
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t-primary)", lineHeight: 1.2 }}>
                {a.name}
              </div>
              <div className="truncate" style={{ fontSize: 11, color: "var(--t-muted)" }}>
                {a.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Category card ──────────────────────────────────────────────────────────────
function CategoryCard({ cat, onClick }: { cat: CategoryOut; onClick: () => void }) {
  const pct = cat.total > 0 ? Math.round((cat.learned / cat.total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 p-4 rounded-2xl transition-colors hover:bg-[var(--app-accent-weak)]"
      style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
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

// ── Page ───────────────────────────────────────────────────────────────────────
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

  const canStart = stats && (stats.new_today > 0 || stats.due_today > 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Флеш-карты"
        subtitle="Умные слова для работы"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-6 py-4 flex flex-col gap-4 max-w-2xl mx-auto">

          {/* Level + XP */}
          {statsLoading ? (
            <Skeleton className="h-36 rounded-2xl" />
          ) : stats ? (
            <LevelPanel stats={stats} />
          ) : null}

          {/* Session button */}
          <button
            onClick={() => router.push("/flashcards/session")}
            disabled={!canStart}
            className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all"
            style={{
              background: canStart
                ? "linear-gradient(135deg, #6366f1, #818cf8)"
                : "var(--app-card-bg)",
              border: canStart ? "none" : "1px solid var(--app-border)",
              color: canStart ? "#fff" : "var(--t-muted)",
              opacity: canStart ? 1 : 0.7,
              cursor: canStart ? "pointer" : "default",
            }}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span style={{ fontWeight: 700, fontSize: 16 }}>
                {statsLoading ? "Загрузка..." : canStart ? "Начать занятие" : "На сегодня всё готово 🎉"}
              </span>
              {stats && canStart && (
                <span style={{ fontSize: 12.5, opacity: 0.85 }}>
                  {stats.new_today > 0 && `${stats.new_today} новых`}
                  {stats.new_today > 0 && stats.due_today > 0 && " · "}
                  {stats.due_today > 0 && `${stats.due_today} на повторение`}
                </span>
              )}
            </div>
            <div
              className="shrink-0 flex items-center justify-center rounded-full"
              style={{
                width: 42, height: 42,
                background: canStart ? "rgba(255,255,255,0.2)" : "var(--app-accent-weak)",
                color: canStart ? "#fff" : "var(--app-accent)",
              }}
            >
              <Play size={18} fill="currentColor" />
            </div>
          </button>

          {/* Overall stats row */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Всего слов", value: stats.total_cards, icon: <Brain size={14} />, color: "var(--app-accent)" },
                { label: "Изучено", value: stats.learned, icon: <CheckCircle2 size={14} />, color: "#22C55E" },
                { label: "Пропущено", value: stats.skipped, icon: <XCircle size={14} />, color: "var(--t-muted)" },
              ].map(({ label, value, icon, color }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1 py-3 rounded-2xl"
                  style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
                >
                  <div className="flex items-center gap-1" style={{ color }}>
                    {icon}
                    <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t-primary)" }}>{value}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: "var(--t-muted)" }}>{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Achievements */}
          {stats && stats.achievements.length > 0 && (
            <AchievementsPanel achievements={stats.achievements} />
          )}

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
