"use client";

import { useState } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useHabits } from "@/hooks/useHabits";
import type { HabitItem } from "@/types/api";
import { CreateHabitModal } from "@/components/modals/CreateHabitModal";
import { Repeat2, ArrowRight } from "lucide-react";
import { clsx } from "clsx";

const LEVEL_COLORS: Record<number, string> = {
  1: "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20",
  2: "text-amber-400 bg-amber-500/10 border border-amber-500/20",
  3: "text-red-400 bg-red-500/10 border border-red-500/20",
};

function streakColor(streak: number): string {
  if (streak >= 14) return "text-emerald-400";
  if (streak >= 7) return "text-amber-400";
  if (streak >= 1) return "text-white/60";
  return "text-white/55";
}

function HabitRow({ habit }: { habit: HabitItem }) {
  const levelCls = LEVEL_COLORS[habit.level] ?? "text-white/68 bg-white/[0.05] border border-white/[0.08]";

  return (
    <div className="flex items-center gap-3.5 py-3.5 px-4 bg-white/[0.03] border border-white/[0.07] rounded-2xl hover:bg-white/[0.05] hover:border-white/[0.10] transition-all">
      {/* Category emoji */}
      <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-lg shrink-0">
        {habit.category_emoji ?? "🔄"}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white/85 truncate" style={{ letterSpacing: "-0.01em" }}>
            {habit.title}
          </span>
          <span className={clsx("shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold", levelCls)}>
            {habit.level_label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {habit.category_title && (
            <span className="text-[11px] text-white/68">{habit.category_title}</span>
          )}
          {habit.reminder_time && (
            <span className="text-[11px] text-white/60">⏰ {habit.reminder_time}</span>
          )}
          <span className="text-[10px] font-medium text-white/55 uppercase tracking-widest">
            30д: {habit.done_count_30d}×
          </span>
        </div>
      </div>

      {/* Best streak */}
      <div className="text-right shrink-0">
        <div className="text-xs text-white/60 font-medium tabular-nums">{habit.best_streak}</div>
        <div className="text-[10px] text-white/50 uppercase tracking-wide">рекорд</div>
      </div>

      {/* Current streak */}
      <div className="text-right shrink-0 w-14">
        <div className={clsx("text-2xl font-bold tabular-nums", streakColor(habit.current_streak))}
          style={{ letterSpacing: "-0.04em" }}>
          {habit.current_streak}
        </div>
        <div className="text-[10px] text-white/55 uppercase tracking-wide">серия</div>
      </div>
    </div>
  );
}

export default function HabitsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data, isLoading, isError } = useHabits();

  const dateSubtitle = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const totalStreak = data?.reduce((s, h) => s + h.current_streak, 0) ?? 0;
  const activeCount = data?.filter((h) => h.current_streak > 0).length ?? 0;

  return (
    <>
      {showCreateModal && <CreateHabitModal onClose={() => setShowCreateModal(false)} />}
      <AppTopbar title="Привычки" subtitle={dateSubtitle} />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[760px]">
          {isLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-20 bg-white/[0.03] rounded-2xl animate-pulse" />
              ))}
            </div>
          )}

          {isError && (
            <div className="text-white/68 text-sm text-center mt-12">
              Не удалось загрузить привычки
            </div>
          )}

          {data && (
            <div className="space-y-5">
              {/* Controls */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl px-4 py-2 transition-colors"
                >
                  + Создать привычку
                </button>
                <a
                  href="/legacy/habits"
                  className="ml-auto flex items-center gap-1 text-xs text-white/65 hover:text-white/60 transition-colors"
                >
                  Управлять <ArrowRight size={12} />
                </a>
              </div>

              {/* KPI */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: data.length,  label: "Всего привычек", color: "text-white/88" },
                  { value: activeCount,  label: "Активных серий",  color: "text-emerald-400" },
                  { value: totalStreak,  label: "Суммарная серия", color: "text-amber-400" },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-4 text-center">
                    <div className={clsx("text-3xl font-bold tabular-nums", kpi.color)}
                      style={{ letterSpacing: "-0.04em" }}>
                      {kpi.value}
                    </div>
                    <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mt-1.5">
                      {kpi.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* List */}
              <div>
                <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-3">
                  Список привычек
                </p>
                {data.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                      <Repeat2 size={20} className="text-white/55" />
                    </div>
                    <p className="text-sm text-white/60 font-medium">Нет активных привычек</p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="text-xs font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors"
                    >
                      + Создать первую привычку
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.map((h) => (
                      <HabitRow key={h.habit_id} habit={h} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
