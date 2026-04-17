"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { CreateHabitModal } from "@/components/modals/CreateHabitModal";
import { HeroBlock } from "@/components/habits/HeroBlock";
import { DoTodayCard } from "@/components/habits/DoTodayCard";
import { ProtectStreakBlock } from "@/components/habits/ProtectStreakBlock";
import { DoneSection } from "@/components/habits/DoneSection";
import { AdminBlock } from "@/components/habits/AdminBlock";
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

// Check if user prefers reduced motion
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HabitsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState<HabitItem | null>(null);

  // Celebration state
  const [bumpHabitId, setBumpHabitId] = useState<number | null>(null);
  const [glowHabitId, setGlowHabitId] = useState<number | null>(null);
  const [milestoneStreak, setMilestoneStreak] = useState<number | null>(null);

  // Guard against double-tap: track in-flight completions
  const inFlightRef = useRef<Set<number>>(new Set());

  // dateSubtitle computed once on client
  const dateSubtitle = useMemo(
    () => typeof window !== "undefined"
      ? new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
      : "",
    []
  );

  const { data, isPending, isError } = useHabits(true); // fetch all incl archived
  const { mutate: complete } = useCompleteHabitToday();

  const allHabits = data ?? [];
  const activeHabits = allHabits.filter((h) => !h.is_archived);
  const archivedHabits = allHabits.filter((h) => h.is_archived);

  const scheduledToday = activeHabits.filter((h) => h.scheduled_today);
  const pendingToday = scheduledToday
    .filter((h) => !h.done_today)
    .sort((a, b) => b.current_streak - a.current_streak);
  const doneToday = scheduledToday.filter((h) => h.done_today);

  // Protect streak: habits with >= 14 day streak, not done today, sorted by streak desc, max 3
  const protectStreak = pendingToday
    .filter((h) => h.current_streak >= 14)
    .slice(0, 3);

  const handleComplete = useCallback((habit: HabitItem) => {
    // Guard: don't fire twice for the same habit if already in-flight
    if (inFlightRef.current.has(habit.habit_id)) return;
    inFlightRef.current.add(habit.habit_id);

    const prevStreak = habit.current_streak;
    const expectedNewStreak = prevStreak + 1;
    const isMilestone = MILESTONE_STREAKS.has(expectedNewStreak);

    const reduced = prefersReducedMotion();

    if (!reduced) {
      // Level 1: streak bump + card glow
      setBumpHabitId(habit.habit_id);
      setGlowHabitId(habit.habit_id);
      setTimeout(() => setBumpHabitId(null), 600);
      setTimeout(() => setGlowHabitId(null), 700);

      // Level 2: milestone overlay
      if (isMilestone) {
        // Slight delay so bump animation starts first
        setTimeout(() => setMilestoneStreak(expectedNewStreak), 300);
      }
    }

    // Haptic
    if (isMilestone) {
      haptic([15, 40, 15, 40, 50]);
    } else {
      haptic(12);
    }

    // Fire mutation
    complete(habit.habit_id, {
      onSettled: () => {
        // Release the guard after mutation resolves (success or error)
        inFlightRef.current.delete(habit.habit_id);
      },
    });
  }, [complete]);

  return (
    <>
      {/* Milestone overlay — mounted at top level, above everything */}
      <MilestoneOverlay
        streak={milestoneStreak}
        onDismiss={() => setMilestoneStreak(null)}
      />

      {selectedHabit && (
        <HabitDetailPanel habit={selectedHabit} onClose={() => setSelectedHabit(null)} />
      )}
      {showCreateModal && <CreateHabitModal onClose={() => setShowCreateModal(false)} />}

      <AppTopbar title="Привычки" subtitle={dateSubtitle} />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-2xl">
        {isPending && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-white/[0.03] rounded-2xl animate-pulse" />
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

            {/* Hero block */}
            <HeroBlock total={scheduledToday.length} doneCount={doneToday.length} />

            {/* Do Today */}
            {pendingToday.length > 0 && (
              <section>
                <h2
                  className="font-semibold uppercase tracking-widest mb-2"
                  style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}
                >
                  Сделать сегодня
                </h2>
                <div className="space-y-3">
                  {pendingToday.map((h) => (
                    <DoTodayCard
                      key={h.habit_id}
                      habit={h}
                      onComplete={() => handleComplete(h)}
                      onOpen={() => setSelectedHabit(h)}
                      animateBump={bumpHabitId === h.habit_id}
                      animateGlow={glowHabitId === h.habit_id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Protect streak */}
            {protectStreak.length > 0 && (
              <ProtectStreakBlock
                habits={protectStreak}
                onComplete={(id) => {
                  const habit = allHabits.find((h) => h.habit_id === id);
                  if (habit) handleComplete(habit);
                  else complete(id);
                }}
                onOpen={(h) => setSelectedHabit(h)}
              />
            )}

            {/* Done today */}
            <DoneSection habits={doneToday} onOpen={(h) => setSelectedHabit(h)} />

            {/* Admin block */}
            <AdminBlock
              habits={activeHabits}
              archivedHabits={archivedHabits}
              onOpen={(h) => setSelectedHabit(h)}
              onCreateNew={() => setShowCreateModal(true)}
            />

          </div>
        )}
      </main>
    </>
  );
}
