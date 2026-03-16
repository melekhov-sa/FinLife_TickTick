"use client";

import { useState, useRef } from "react";
import { Check, MoreHorizontal, Repeat2, Flame, Plus } from "lucide-react";
import { clsx } from "clsx";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { HabitDetailPanel } from "@/components/habits/HabitDetailPanel";
import { CreateHabitModal } from "@/components/modals/CreateHabitModal";
import {
  useHabits, useCompleteHabitToday, useSkipHabitToday, useDeleteHabit,
} from "@/hooks/useHabits";
import type { HabitItem } from "@/types/api";

// ── Constants ─────────────────────────────────────────────────────────────────

const LEVEL_STYLE: Record<number, string> = {
  1: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  2: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  3: "text-red-400 bg-red-500/10 border-red-500/20",
};

function streakColor(n: number) {
  if (n >= 30) return "text-emerald-400";
  if (n >= 14) return "text-amber-400";
  if (n >= 7)  return "text-white/80";
  if (n >= 1)  return "text-white/60";
  return "text-white/35";
}

// ── QuickMenu ─────────────────────────────────────────────────────────────────

function QuickMenu({
  habit,
  onOpen,
  onSkip,
  onDelete,
}: {
  habit: HabitItem;
  onOpen: () => void;
  onSkip: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const items = [
    { label: "Редактировать",   action: () => { onOpen();   setOpen(false); } },
    { label: "Пропустить сегодня", action: () => { onSkip(); setOpen(false); } },
    { label: "В архив",         action: () => { onDelete(); setOpen(false); }, danger: true },
  ];

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-white/[0.08]"
        style={{ color: "var(--t-faint)" }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-50 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl py-1 min-w-[170px]"
          onMouseLeave={() => setTimeout(() => setOpen(false), 150)}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className={clsx(
                "w-full text-left block px-4 py-2 text-[13px] font-medium transition-colors hover:bg-white/[0.05]",
                item.danger ? "text-red-400/80 hover:text-red-400" : "hover:text-white/90"
              )}
              style={{ color: item.danger ? undefined : "var(--t-secondary)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── HabitCard ─────────────────────────────────────────────────────────────────

function HabitCard({
  habit,
  onOpen,
}: {
  habit: HabitItem;
  onOpen: () => void;
}) {
  const { mutate: completeToday, isPending: completing } = useCompleteHabitToday();
  const { mutate: skipToday  }  = useSkipHabitToday();
  const { mutate: deleteHabit } = useDeleteHabit();

  const levelCls = LEVEL_STYLE[habit.level] ?? "text-white/60 bg-white/[0.05] border-white/[0.08]";
  const doneCount30 = habit.done_count_30d;
  const barWidth = Math.min(100, Math.round((doneCount30 / 30) * 100));

  return (
    <div
      onClick={onOpen}
      className="group bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 cursor-pointer hover:bg-white/[0.05] hover:border-white/[0.09] transition-all"
    >
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Emoji */}
        <div className="w-10 h-10 rounded-xl bg-white/[0.07] flex items-center justify-center text-xl shrink-0">
          {habit.category_emoji ?? "🔄"}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold truncate" style={{ color: "var(--t-primary)", letterSpacing: "-0.01em" }}>
              {habit.title}
            </span>
            <span className={clsx("shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold border", levelCls)}>
              {habit.level_label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            {habit.category_title && (
              <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>{habit.category_title}</span>
            )}
            {habit.reminder_time && (
              <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>⏰ {habit.reminder_time}</span>
            )}
          </div>
        </div>

        {/* Streak */}
        <div className="shrink-0 text-right">
          <div className={clsx("text-2xl font-bold tabular-nums leading-none", streakColor(habit.current_streak))}
            style={{ letterSpacing: "-0.04em" }}>
            {habit.current_streak}
          </div>
          <div className="text-[10px] font-medium mt-0.5 uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>
            {habit.current_streak === 1 ? "день" : habit.current_streak >= 2 && habit.current_streak <= 4 ? "дня" : "дней"}
          </div>
        </div>

        {/* Quick menu */}
        <div className="shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
          <QuickMenu
            habit={habit}
            onOpen={onOpen}
            onSkip={() => skipToday(habit.habit_id)}
            onDelete={() => deleteHabit(habit.habit_id)}
          />
        </div>
      </div>

      {/* 14-day dot tracker */}
      <div className="flex items-center gap-0.5 mt-3.5">
        {habit.recent_days.map((done, i) => (
          <div
            key={i}
            className={clsx(
              "flex-1 rounded-sm transition-colors",
              // Taller for last 7 days, shorter for days 1-7
              i >= 7 ? "h-4" : "h-2.5",
              done
                ? i >= 7 ? "bg-emerald-500/70" : "bg-emerald-500/40"
                : "bg-white/[0.07]"
            )}
            title={done ? "Выполнено" : "Не выполнено"}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>14 дней</span>
        <span className="text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
          {habit.recent_days.filter(Boolean).length} / 14
        </span>
      </div>

      {/* 30-day progress bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>За 30 дней</span>
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--t-muted)" }}>
            {doneCount30} / 30
          </span>
        </div>
        <div className="h-1 rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-emerald-500/50 transition-all"
            style={{ width: `${barWidth}%` }}
          />
        </div>
      </div>

      {/* Mark today button */}
      <div className="mt-3.5 pt-3.5 border-t border-white/[0.05]" onClick={(e) => e.stopPropagation()}>
        {habit.done_today ? (
          <div className="flex items-center gap-2 text-emerald-400 text-[13px] font-semibold">
            <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Check size={11} strokeWidth={2.5} />
            </div>
            Выполнено сегодня
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); completeToday(habit.habit_id); }}
            disabled={completing}
            className="flex items-center gap-2 w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-[13px] font-semibold transition-colors disabled:opacity-60 active:scale-95"
          >
            <Check size={13} strokeWidth={2.5} />
            Отметить сегодня
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterValue = "all" | "pending" | "done";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all",     label: "Все" },
  { value: "pending", label: "Не выполнено" },
  { value: "done",    label: "Выполнено" },
];

export default function HabitsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedHabit, setSelectedHabit]     = useState<HabitItem | null>(null);
  const [filter, setFilter]                   = useState<FilterValue>("all");

  const { data, isLoading, isError } = useHabits();

  const dateSubtitle = new Date().toLocaleDateString("ru-RU", {
    weekday: "long", day: "numeric", month: "long",
  });

  const habits = data ?? [];
  const filtered = habits.filter((h) => {
    if (filter === "done")    return h.done_today;
    if (filter === "pending") return !h.done_today;
    return true;
  });

  const doneToday  = habits.filter((h) => h.done_today).length;
  const totalStreak = habits.reduce((s, h) => s + h.current_streak, 0);
  const activeStreak = habits.filter((h) => h.current_streak > 0).length;

  return (
    <>
      {selectedHabit && (
        <HabitDetailPanel habit={selectedHabit} onClose={() => setSelectedHabit(null)} />
      )}
      {showCreateModal && <CreateHabitModal onClose={() => setShowCreateModal(false)} />}

      <AppTopbar title="Привычки" subtitle={dateSubtitle} />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-2xl">

        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-40 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить привычки</p>
        )}

        {!isLoading && !isError && (
          <div className="space-y-5">

            {/* Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold rounded-xl px-3.5 py-2 transition-colors"
              >
                <Plus size={13} strokeWidth={2.5} />
                Создать привычку
              </button>
            </div>

            {/* KPI stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: `${doneToday}/${habits.length}`, label: "Сегодня", color: doneToday === habits.length && habits.length > 0 ? "text-emerald-400" : "text-white/85" },
                { value: activeStreak, label: "Активных серий", color: "text-amber-400" },
                { value: totalStreak, label: "Суммарная серия", color: "text-indigo-400" },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4 text-center">
                  <div className={clsx("text-[26px] font-bold tabular-nums leading-none", kpi.color)}
                    style={{ letterSpacing: "-0.04em" }}>
                    {kpi.value}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest mt-1.5" style={{ color: "var(--t-faint)" }}>
                    {kpi.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 w-fit">
              {FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={clsx(
                    "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                    filter === value ? "bg-white/[0.09] text-white shadow-sm" : "text-white/55 hover:text-white/80"
                  )}
                >
                  {label}
                  {value === "pending" && habits.filter((h) => !h.done_today).length > 0 && (
                    <span className="ml-1.5 text-[10px] font-bold text-amber-400 tabular-nums">
                      {habits.filter((h) => !h.done_today).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                  {filter === "done" ? <Flame size={20} className="text-amber-400/40" /> : <Repeat2 size={20} style={{ color: "var(--t-faint)" }} />}
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                  {filter === "done" ? "Ничего не выполнено сегодня" : filter === "pending" ? "Все привычки выполнены!" : "Нет активных привычек"}
                </p>
                {filter === "all" && (
                  <button onClick={() => setShowCreateModal(true)} className="text-xs font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors">
                    + Создать первую привычку
                  </button>
                )}
              </div>
            )}

            {/* Habit cards */}
            {filtered.length > 0 && (
              <div className="space-y-3">
                {filtered.map((h) => (
                  <HabitCard
                    key={h.habit_id}
                    habit={h}
                    onOpen={() => setSelectedHabit(h)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
