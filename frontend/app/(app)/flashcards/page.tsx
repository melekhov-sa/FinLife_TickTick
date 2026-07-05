"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, Flame, Brain, CheckCircle2, XCircle,
  Play, Target, Zap, Lock, TrendingUp, RotateCw, Dumbbell,
} from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { Heatmap, type HeatmapCell } from "@/components/primitives/Heatmap";
import { Skeleton } from "@/components/primitives/Skeleton";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  weak_count: number;
  achievements: Achievement[];
}

interface CategoryProgress {
  id: number;
  name: string;
  emoji: string | null;
  total: number;
  learned: number;
  correct: number;
  wrong: number;
  accuracy: number;
}

interface ProgressOut {
  categories: CategoryProgress[];
  activity: { date: string; count: number }[];
}

interface CategoryOut {
  id: number;
  name: string;
  emoji: string | null;
  description: string | null;
  total: number;
  learned: number;
  skipped: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEVEL_TITLES: Record<number, string> = {
  1: "Новичок", 2: "Ученик", 3: "Практик", 4: "Знаток",
  5: "Эксперт", 6: "Мастер", 7: "Гуру", 8: "Легенда",
};
function levelTitle(n: number) { return LEVEL_TITLES[n] ?? `Ур.${n}`; }

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function LevelPanel({ stats }: { stats: StatsOut }) {
  const pct = Math.round(
    (stats.xp_in_level / (stats.xp_in_level + stats.xp_to_next)) * 100,
  );
  const totalAnswers = stats.total_correct + stats.total_wrong;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background:
          "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.12) 100%)",
        border: "1px solid rgba(99,102,241,0.25)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(129,140,248,0.8)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {levelTitle(stats.level)}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "var(--t-primary)",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            Уровень {stats.level}
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{
            background: "rgba(99,102,241,0.2)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--app-accent)",
          }}
        >
          <Zap size={13} fill="currentColor" style={{ color: "var(--app-accent)" }} />
          {stats.xp} XP
        </div>
      </div>

      <div className="mb-1">
        <div
          className="flex justify-between mb-1.5"
          style={{ fontSize: 11, color: "rgba(129,140,248,0.7)" }}
        >
          <span>{stats.xp_in_level} XP на этом уровне</span>
          <span>ур.{stats.level + 1} через {stats.xp_to_next} XP</span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "rgba(99,102,241,0.15)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${pct}%`,
              background: "var(--app-accent-gradient)",
              boxShadow: pct > 5 ? "0 0 8px rgba(99,102,241,0.5)" : "none",
            }}
          />
        </div>
      </div>

      <div className="flex gap-2 mt-3 flex-wrap">
        {stats.total_correct > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{
              background: "rgba(34,197,94,0.12)",
              fontSize: 12,
              color: "#22C55E",
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={12} />
            {stats.total_correct} верно
          </div>
        )}
        {stats.total_wrong > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{
              background: "rgba(239,68,68,0.1)",
              fontSize: 12,
              color: "#EF4444",
              fontWeight: 600,
            }}
          >
            <XCircle size={12} />
            {stats.total_wrong} ошибок
          </div>
        )}
        {totalAnswers > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{
              background: "rgba(251,191,36,0.12)",
              fontSize: 12,
              color: "#F59E0B",
              fontWeight: 600,
            }}
          >
            <Target size={12} />
            {Math.round(stats.accuracy * 100)}% точность
          </div>
        )}
        {stats.streak_days > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
            style={{
              background: "rgba(249,115,22,0.12)",
              fontSize: 12,
              color: "#F97316",
              fontWeight: 600,
            }}
          >
            <Flame size={12} />
            {stats.streak_days}{" "}
            {plural(stats.streak_days, "день", "дня", "дней")} подряд
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB 1: Session ─────────────────────────────────────────────────────────────

function SessionTab({
  stats,
  categories,
  catsLoading,
  onStart,
  onPractice,
  onWeak,
  onCategoryClick,
}: {
  stats: StatsOut | undefined;
  categories: CategoryOut[] | undefined;
  catsLoading: boolean;
  onStart: () => void;
  onPractice: () => void;
  onWeak: () => void;
  onCategoryClick: (id: number) => void;
}) {
  const canStart = stats && (stats.new_today > 0 || stats.due_today > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Level panel */}
      {stats ? <LevelPanel stats={stats} /> : <Skeleton className="h-36 rounded-2xl" />}

      {/* Today info */}
      {stats && (stats.new_today > 0 || stats.due_today > 0) && (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "1fr 1fr" }}
        >
          {stats.new_today > 0 && (
            <div
              className="flex flex-col items-center gap-1 py-3 rounded-2xl"
              style={{
                background: "rgba(99,102,241,0.06)",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              <Brain size={16} style={{ color: "var(--app-accent)" }} />
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--t-primary)",
                }}
              >
                {stats.new_today}
              </div>
              <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                новых слов
              </div>
            </div>
          )}
          {stats.due_today > 0 && (
            <div
              className="flex flex-col items-center gap-1 py-3 rounded-2xl"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <TrendingUp size={16} style={{ color: "#F59E0B" }} />
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--t-primary)",
                }}
              >
                {stats.due_today}
              </div>
              <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                на повторение
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary button — daily lesson if available, else practice */}
      <button
        onClick={canStart ? onStart : onPractice}
        disabled={!stats}
        className="w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all"
        style={{
          background: "var(--app-accent-gradient)",
          border: "none",
          color: "#fff",
          opacity: stats ? 1 : 0.6,
          cursor: stats ? "pointer" : "default",
        }}
      >
        <div className="flex flex-col items-start gap-0.5">
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            {!stats ? "Загрузка..." : canStart ? "Начать занятие" : "Тренироваться"}
          </span>
          {stats && (
            <span style={{ fontSize: 12.5, opacity: 0.85 }}>
              {canStart ? "Новые слова и повторение" : "Дневной урок пройден 🎉 — закрепляй сколько хочешь"}
            </span>
          )}
        </div>
        <div
          className="shrink-0 flex items-center justify-center rounded-full"
          style={{ width: 42, height: 42, background: "rgba(255,255,255,0.2)", color: "#fff" }}
        >
          <Play size={18} fill="currentColor" />
        </div>
      </button>

      {/* Secondary practice button — only when the daily lesson is still available */}
      {canStart && (
        <button
          onClick={onPractice}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl transition-colors hover:bg-[var(--app-accent-weak)]"
          style={{
            background: "var(--app-card-bg)",
            border: "1px solid var(--app-border)",
            color: "var(--t-secondary)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          <RotateCw size={15} />
          Тренироваться без лимита
        </button>
      )}

      {/* Weak-words training — only when there are weak words */}
      {stats && stats.weak_count > 0 && (
        <button
          onClick={onWeak}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl transition-colors"
          style={{
            background: "color-mix(in srgb, #EF4444 8%, transparent)",
            border: "1px solid color-mix(in srgb, #EF4444 30%, transparent)",
            color: "#EF4444",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          <Dumbbell size={15} />
          Тренировать слабые слова · {stats.weak_count}
        </button>
      )}

      {/* Overall mini-stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Всего слов",
              value: stats.total_cards,
              icon: <Brain size={13} />,
              color: "var(--app-accent)",
            },
            {
              label: "Изучено",
              value: stats.learned,
              icon: <CheckCircle2 size={13} />,
              color: "#22C55E",
            },
            {
              label: "Пропущено",
              value: stats.skipped,
              icon: <XCircle size={13} />,
              color: "var(--t-muted)",
            },
          ].map(({ label, value, icon, color }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 py-3 rounded-2xl"
              style={{
                background: "var(--app-card-bg)",
                border: "1px solid var(--app-border)",
              }}
            >
              <div className="flex items-center gap-1" style={{ color }}>
                {icon}
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "var(--t-primary)",
                  }}
                >
                  {value}
                </span>
              </div>
              <span style={{ fontSize: 10.5, color: "var(--t-muted)" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Categories */}
      <div>
        <div
          className="flex items-center gap-2 mb-3"
          style={{ fontSize: 13, fontWeight: 600, color: "var(--t-muted)" }}
        >
          <BookOpen size={14} />
          КАТЕГОРИИ
        </div>
        {catsLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {categories?.map((cat) => {
              const pct =
                cat.total > 0
                  ? Math.round((cat.learned / cat.total) * 100)
                  : 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => onCategoryClick(cat.id)}
                  className="w-full text-left flex items-center gap-4 p-4 rounded-2xl transition-colors hover:bg-[var(--app-accent-weak)]"
                  style={{
                    background: "var(--app-card-bg)",
                    border: "1px solid var(--app-border)",
                  }}
                >
                  <div
                    className="shrink-0 flex items-center justify-center text-2xl rounded-xl"
                    style={{
                      width: 48,
                      height: 48,
                      background: "var(--app-accent-weak)",
                    }}
                  >
                    {cat.emoji ?? "📚"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: "var(--t-primary)",
                      }}
                    >
                      {cat.name}
                    </div>
                    {cat.description && (
                      <div
                        className="truncate mt-0.5"
                        style={{ fontSize: 12.5, color: "var(--t-muted)" }}
                      >
                        {cat.description}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <div
                        className="flex-1 h-1.5 rounded-full overflow-hidden"
                        style={{ background: "var(--app-border)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            background: "var(--app-accent)",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--t-muted)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cat.learned}/{cat.total}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: "var(--t-faint)" }}>›</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TAB 2: Progress ────────────────────────────────────────────────────────────

function ProgressTab({
  stats,
  progress,
  progressLoading,
}: {
  stats: StatsOut | undefined;
  progress: ProgressOut | undefined;
  progressLoading: boolean;
}) {
  // Map activity to HeatmapCell[]
  const heatmapCells: HeatmapCell[] = (progress?.activity ?? []).map((d) => ({
    date: d.date,
    value: d.count,
    label: `${d.count} ${plural(d.count, "карточка", "карточки", "карточек")}`,
  }));

  return (
    <div className="flex flex-col gap-5">

      {/* Key numbers */}
      {stats ? (
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Правильных ответов", value: stats.total_correct, color: "#22C55E", emoji: "✅" },
            { label: "Ошибок", value: stats.total_wrong, color: "#EF4444", emoji: "❌" },
            {
              label: "Точность",
              value: stats.total_correct + stats.total_wrong > 0
                ? `${Math.round(stats.accuracy * 100)}%`
                : "—",
              color: "#F59E0B",
              emoji: "🎯",
            },
            { label: "Серия", value: `${stats.streak_days} ${plural(stats.streak_days, "день", "дня", "дней")}`, color: "#F97316", emoji: "🔥" },
          ].map(({ label, value, color, emoji }) => (
            <div
              key={label}
              className="flex flex-col gap-1 p-4 rounded-2xl"
              style={{
                background: "var(--app-card-bg)",
                border: "1px solid var(--app-border)",
              }}
            >
              <div style={{ fontSize: 22 }}>{emoji}</div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 800,
                  color: "var(--t-primary)",
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {value}
              </div>
              <div style={{ fontSize: 12, color: "var(--t-muted)" }}>{label}</div>
            </div>
          ))}
        </div>
      ) : (
        <Skeleton className="h-40 rounded-2xl" />
      )}

      {/* Activity heatmap */}
      <div>
        <div
          className="mb-3"
          style={{ fontSize: 13, fontWeight: 600, color: "var(--t-muted)" }}
        >
          АКТИВНОСТЬ (12 НЕДЕЛЬ)
        </div>
        {progressLoading ? (
          <Skeleton className="h-28 rounded-2xl" />
        ) : (
          <div
            className="p-4 rounded-2xl overflow-x-auto"
            style={{
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
            }}
          >
            <Heatmap
              cells={heatmapCells}
              weeks={12}
              cellSize={13}
              gap={3}
              accentColor="var(--app-accent)"
              formatTooltip={(cell) => (
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(cell.date + "T00:00:00").toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                    })}
                  </div>
                  <div style={{ color: "var(--t-muted)", marginTop: 2 }}>
                    {cell.value > 0
                      ? `${cell.value} ${plural(cell.value, "карточка", "карточки", "карточек")}`
                      : "Нет занятий"}
                  </div>
                </div>
              )}
            />
          </div>
        )}
      </div>

      {/* Category accuracy */}
      <div>
        <div
          className="mb-3"
          style={{ fontSize: 13, fontWeight: 600, color: "var(--t-muted)" }}
        >
          ПО КАТЕГОРИЯМ
        </div>
        {progressLoading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {progress?.categories
              .filter((c) => c.learned > 0 || c.correct > 0 || c.wrong > 0)
              .map((cat) => {
                const total = cat.correct + cat.wrong;
                const acc = total > 0 ? Math.round((cat.correct / total) * 100) : null;
                const learnedPct = cat.total > 0
                  ? Math.round((cat.learned / cat.total) * 100)
                  : 0;
                return (
                  <div
                    key={cat.id}
                    className="p-3 rounded-2xl"
                    style={{
                      background: "var(--app-card-bg)",
                      border: "1px solid var(--app-border)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 18 }}>{cat.emoji ?? "📚"}</span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: "var(--t-primary)",
                          flex: 1,
                        }}
                      >
                        {cat.name}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--t-muted)",
                        }}
                      >
                        {cat.learned}/{cat.total}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div
                      className="h-1.5 rounded-full overflow-hidden mb-1.5"
                      style={{ background: "var(--app-border)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${learnedPct}%`,
                          background: "var(--app-accent)",
                        }}
                      />
                    </div>
                    {/* Accuracy chips */}
                    {total > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          style={{
                            fontSize: 11,
                            color: "#22C55E",
                            fontWeight: 500,
                          }}
                        >
                          ✓ {cat.correct}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "#EF4444",
                            fontWeight: 500,
                          }}
                        >
                          ✗ {cat.wrong}
                        </span>
                        {acc !== null && (
                          <span
                            style={{
                              fontSize: 11,
                              color: acc >= 80 ? "#22C55E" : acc >= 60 ? "#F59E0B" : "#EF4444",
                              fontWeight: 600,
                            }}
                          >
                            {acc}% точность
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            {progress?.categories.every(
              (c) => c.learned === 0 && c.correct === 0 && c.wrong === 0,
            ) && (
              <div
                className="text-center py-8"
                style={{ fontSize: 14, color: "var(--t-muted)" }}
              >
                Начни занятия — здесь появится статистика
              </div>
            )}
          </div>
        )}
      </div>

      {/* Achievements */}
      {stats && stats.achievements.length > 0 && (
        <div>
          <div
            className="flex items-center gap-2 mb-3"
            style={{ fontSize: 13, fontWeight: 600, color: "var(--t-muted)" }}
          >
            <span>🏅</span>
            ДОСТИЖЕНИЯ —{" "}
            {stats.achievements.filter((a) => a.unlocked).length}/
            {stats.achievements.length}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {stats.achievements.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: "var(--app-card-bg)",
                  border: a.unlocked
                    ? "1px solid rgba(99,102,241,0.3)"
                    : "1px solid var(--app-border)",
                  opacity: a.unlocked ? 1 : 0.45,
                }}
              >
                <div
                  className="flex items-center justify-center shrink-0 rounded-lg text-lg"
                  style={{
                    width: 36,
                    height: 36,
                    background: a.unlocked
                      ? "rgba(99,102,241,0.12)"
                      : "var(--app-border)",
                  }}
                >
                  {a.unlocked ? (
                    a.emoji
                  ) : (
                    <Lock size={14} style={{ color: "var(--t-faint)" }} />
                  )}
                </div>
                <div className="min-w-0">
                  <div
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: "var(--t-primary)",
                      lineHeight: 1.2,
                    }}
                  >
                    {a.name}
                  </div>
                  <div
                    className="truncate"
                    style={{ fontSize: 11, color: "var(--t-muted)" }}
                  >
                    {a.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FlashcardsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"session" | "progress">("session");

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["flashcards-stats"],
    queryFn: () => api.get<StatsOut>("/api/v2/flashcards/stats"),
  });

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ["flashcards-categories"],
    queryFn: () => api.get<CategoryOut[]>("/api/v2/flashcards/categories"),
  });

  const { data: progress, isLoading: progressLoading } = useQuery({
    queryKey: ["flashcards-progress"],
    queryFn: () => api.get<ProgressOut>("/api/v2/flashcards/progress"),
    enabled: tab === "progress",
  });

  const unlockedCount = stats?.achievements.filter((a) => a.unlocked).length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Флеш-карты"
        subtitle="Умные слова для работы"
        divider={false}
        tabs={
          <Tabs
            variant="underline"
            active={tab}
            onChange={(id) => setTab(id as "session" | "progress")}
            items={[
              { id: "session", label: "Занятие" },
              {
                id: "progress",
                label: "Прогресс",
                count: unlockedCount > 0 ? `${unlockedCount} 🏅` : undefined,
              },
            ]}
          />
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-6 py-4 max-w-2xl mx-auto">
          {tab === "session" ? (
            <SessionTab
              stats={stats}
              categories={categories}
              catsLoading={catsLoading || statsLoading}
              onStart={() => router.push("/flashcards/session")}
              onPractice={() => router.push("/flashcards/session?mode=practice")}
              onWeak={() => router.push("/flashcards/session?mode=weak")}
              onCategoryClick={(id) =>
                router.push(`/flashcards/session?category=${id}&mode=practice`)
              }
            />
          ) : (
            <ProgressTab
              stats={stats}
              progress={progress}
              progressLoading={progressLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
