"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { Plus, Settings2, AlertCircle, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { CreateHabitModal } from "@/components/modals/CreateHabitModal";
import { HabitRow } from "@/components/habits/HabitRow";
import { DoneSection } from "@/components/habits/DoneSection";
import { MilestoneOverlay, MILESTONE_STREAKS } from "@/components/habits/MilestoneOverlay";
import { useHabits, useCompleteHabitToday, useIncrementHabitToday, useDecrementHabitToday } from "@/hooks/useHabits";
import { useProductivity } from "@/components/analytics/useProductivity";
import type { HabitItem } from "@/types/api";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";

const WEEK_DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function WeekStrip() {
  const { data } = useProductivity();
  if (!data) return null;

  const chart = data.habits.daily_chart;
  // last 7 entries
  const days = chart.slice(-7);
  if (days.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 md:px-6 py-2 border-b shrink-0"
      style={{ borderColor: "var(--app-border)" }}>
      <span className="text-[10px] font-semibold uppercase tracking-widest mr-1"
        style={{ color: "var(--t-faint)" }}>7 дней</span>
      <div className="flex items-end gap-1.5">
        {days.map((d, i) => {
          const pct = d.total > 0 ? d.done / d.total : -1;
          const bg = pct < 0
            ? "var(--c-neutral-bg)"
            : pct === 0
            ? "var(--c-neutral-bg)"
            : pct < 0.5
            ? "color-mix(in srgb, var(--app-accent) 35%, transparent)"
            : pct < 1
            ? "color-mix(in srgb, var(--app-accent) 65%, transparent)"
            : "var(--app-accent)";
          const dayIdx = (new Date().getDay() + 6 - (days.length - 1 - i)) % 7;
          return (
            <div key={i} className="flex flex-col items-center gap-0.5"
              title={pct < 0 ? d.date : `${d.date}: ${d.done}/${d.total}`}>
              <div className="w-5 h-5 rounded-full transition-colors" style={{ background: bg }} />
              <span className="text-[8px]" style={{ color: "var(--t-faint)" }}>
                {WEEK_DAYS[dayIdx]}
              </span>
            </div>
          );
        })}
      </div>
      <span className="ml-auto text-[11px] font-semibold tabular-nums"
        style={{ color: "var(--app-accent)" }}>
        {data.habits.rate_7d}%
      </span>
    </div>
  );
}

// Safely fire haptic — no-op on Safari / unsupported devices
function haptic(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration API may throw in some environments — silently ignore
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HabitsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<HabitItem | null>(null);

  const [bumpHabitId, setBumpHabitId] = useState<number | null>(null);
  const [glowHabitId, setGlowHabitId] = useState<number | null>(null);
  const [milestoneStreak, setMilestoneStreak] = useState<number | null>(null);

  const inFlightRef = useRef<Set<number>>(new Set());

  const dateSubtitle = useMemo(
    () => typeof window !== "undefined"
      ? new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
      : "",
    []
  );

  const { data, isPending, isError } = useHabits(true);
  const { mutate: complete } = useCompleteHabitToday();
  const { mutate: increment } = useIncrementHabitToday();
  const { mutate: decrement } = useDecrementHabitToday();

  const allHabits = data ?? [];
  const activeHabits = allHabits.filter((h) => !h.is_archived);

  const scheduledToday = activeHabits.filter((h) => h.scheduled_today);
  const pendingToday = scheduledToday
    .filter((h) => !h.done_today)
    .sort((a, b) => b.current_streak - a.current_streak);
  const doneToday = scheduledToday.filter((h) => h.done_today);

  const total = scheduledToday.length;
  const doneCount = doneToday.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;
  const noneScheduled = total === 0;

  const handleComplete = useCallback((habit: HabitItem) => {
    if (inFlightRef.current.has(habit.habit_id)) return;
    inFlightRef.current.add(habit.habit_id);

    const prevStreak = habit.current_streak;
    const expectedNewStreak = prevStreak + 1;
    const isMilestone = MILESTONE_STREAKS.has(expectedNewStreak);

    const reduced = prefersReducedMotion();

    if (!reduced) {
      setBumpHabitId(habit.habit_id);
      setGlowHabitId(habit.habit_id);
      setTimeout(() => setBumpHabitId(null), 600);
      setTimeout(() => setGlowHabitId(null), 700);

      if (isMilestone) {
        setTimeout(() => setMilestoneStreak(expectedNewStreak), 300);
      }
    }

    if (isMilestone) {
      haptic([15, 40, 15, 40, 50]);
    } else {
      haptic(12);
    }

    complete(habit.habit_id, {
      onSettled: () => {
        inFlightRef.current.delete(habit.habit_id);
      },
    });
  }, [complete]);

  // Topbar subtitle: shows today's progress
  const topbarSubtitle = noneScheduled
    ? dateSubtitle
    : `${doneCount} / ${total} сегодня`;

  return (
    <>
      <MilestoneOverlay
        streak={milestoneStreak}
        onDismiss={() => setMilestoneStreak(null)}
      />

      {selectedHabit && (
        <HabitDetailPanel habit={selectedHabit} onClose={() => setSelectedHabit(null)} />
      )}
      {showCreateModal && <CreateHabitModal onClose={() => setShowCreateModal(false)} />}

      <PageHeader
        title="Привычки"
        subtitle={topbarSubtitle}
        actions={
          <Link
            href="/habits/all"
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors border"
            style={{ color: "var(--t-secondary)", borderColor: "var(--app-border)" }}
            title="Управление привычками"
          >
            <Settings2 size={13} />
            Управление
          </Link>
        }
        density="compact"
      />

      {/* Slim progress strip under the topbar */}
      {!noneScheduled && (
        <div className="h-[3px] bg-slate-200 dark:bg-white/[0.06] shrink-0">
          <div
            className={clsx_progress(allDone)}
            style={{ width: `${pct}%`, transition: "width 0.5s" }}
          />
        </div>
      )}

      <WeekStrip />

      <main className="flex-1 p-3 md:p-6 w-full">
        {isPending && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} variant="rect" height={64} className="rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            variant="error"
            icon={<AlertCircle size={24} />}
            title="Не удалось загрузить привычки"
            size="md"
          />
        )}

        {!isPending && !isError && (
          <div className="space-y-4">
            {/* Empty state */}
            {noneScheduled && activeHabits.length === 0 && (
              <EmptyState
                icon={<Sparkles size={24} />}
                title="У вас ещё нет привычек"
                actions={
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    variant="primary"
                    size="md"
                    leftIcon={<Plus size={14} />}
                  >
                    Создать первую
                  </Button>
                }
              />
            )}

            {noneScheduled && activeHabits.length > 0 && (
              <EmptyState
                title="Сегодня нет запланированных привычек"
                size="sm"
              />
            )}

            {/* All-done celebration */}
            {allDone && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-4 text-center">
                <p style={{ fontSize: "var(--fs-title)", color: "var(--t-primary)" }} className="font-bold">
                  🎉 Все привычки выполнены!
                </p>
                <p style={{ fontSize: "var(--fs-caption)", color: "var(--t-muted)" }} className="mt-0.5">
                  {doneCount} из {total} сегодня
                </p>
              </div>
            )}

            {/* Pending today */}
            {pendingToday.length > 0 && (
              <section className="space-y-2">
                {pendingToday.map((h) => (
                  <HabitRow
                    key={h.habit_id}
                    habit={h}
                    onComplete={() => handleComplete(h)}
                    onIncrement={() => increment(h.habit_id)}
                    onDecrement={() => decrement(h.habit_id)}
                    onOpen={() => setSelectedHabit(h)}
                    animateBump={bumpHabitId === h.habit_id}
                    animateGlow={glowHabitId === h.habit_id}
                  />
                ))}
              </section>
            )}

            {/* Done today (collapsed) */}
            <DoneSection habits={doneToday} onOpen={(h) => setSelectedHabit(h)} />

            {/* Footer actions */}
            {activeHabits.length > 0 && (
              <div className="flex items-center justify-between pt-2 gap-3">
                <Button
                  onClick={() => setShowCreateModal(true)}
                  variant="outline"
                  size="md"
                  leftIcon={<Plus size={14} />}
                >
                  Создать привычку
                </Button>
                <Link
                  href="/habits/all"
                  className="inline-flex items-center gap-1.5 px-3 py-2 hover:text-[var(--app-accent)] transition-colors"
                  style={{ fontSize: "var(--fs-secondary)", color: "var(--t-muted)" }}
                >
                  <Settings2 size={14} /> Все привычки
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

// Simple helper instead of importing clsx for one usage in JSX
function clsx_progress(allDone: boolean): string {
  return allDone
    ? "h-full bg-gradient-to-r from-emerald-500 to-emerald-400"
    : "h-full bg-gradient-to-r from-[var(--app-accent)] to-[var(--app-accent)]";
}
