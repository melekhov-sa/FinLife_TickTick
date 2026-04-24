"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { CreateHabitModal } from "@/components/modals/CreateHabitModal";
import { HabitRow } from "@/components/habits/HabitRow";
import { DoneSection } from "@/components/habits/DoneSection";
import { MilestoneOverlay, MILESTONE_STREAKS } from "@/components/habits/MilestoneOverlay";
import { useHabits, useCompleteHabitToday } from "@/hooks/useHabits";
import type { HabitItem } from "@/types/api";

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

      <AppTopbar
        title="Привычки"
        subtitle={topbarSubtitle}
        actions={
          <Link
            href="/habits/all"
            className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium hover:bg-white/10 transition-colors"
            style={{ color: "var(--app-topbar-text)" }}
            title="Управление привычками"
          >
            <Settings2 size={13} />
            Управление
          </Link>
        }
      />

      {/* Slim progress strip under the topbar */}
      {!noneScheduled && (
        <div className="h-[3px] bg-white/[0.06] shrink-0">
          <div
            className={clsx_progress(allDone)}
            style={{ width: `${pct}%`, transition: "width 0.5s" }}
          />
        </div>
      )}

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">
        {isPending && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.03] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-center py-12" style={{ fontSize: "var(--fs-secondary)" }}>
            Не удалось загрузить привычки
          </p>
        )}

        {!isPending && !isError && (
          <div className="space-y-4">
            {/* Empty state */}
            {noneScheduled && activeHabits.length === 0 && (
              <div className="text-center py-12 space-y-3">
                <p style={{ fontSize: "var(--fs-body)", color: "var(--t-muted)" }}>
                  У вас ещё нет привычек
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
                  style={{ fontSize: "var(--fs-secondary)" }}
                >
                  <Plus size={14} /> Создать первую
                </button>
              </div>
            )}

            {noneScheduled && activeHabits.length > 0 && (
              <div className="text-center py-8">
                <p style={{ fontSize: "var(--fs-body)", color: "var(--t-muted)" }}>
                  Сегодня нет запланированных привычек
                </p>
              </div>
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
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/[0.10] hover:bg-white/[0.05] transition-colors"
                  style={{ fontSize: "var(--fs-secondary)", color: "var(--t-secondary)" }}
                >
                  <Plus size={14} /> Создать привычку
                </button>
                <Link
                  href="/habits/all"
                  className="inline-flex items-center gap-1.5 px-3 py-2 hover:text-indigo-400 transition-colors"
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
    : "h-full bg-gradient-to-r from-indigo-500 to-indigo-400";
}
