"use client";

import { useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { clsx } from "clsx";
import type { HabitItem } from "@/types/api";
import { useSkipHabitToday, useDeleteHabit, useRestoreHabit } from "@/hooks/useHabits";

type FilterValue = "all" | "pending" | "done";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "pending", label: "Не выполнено" },
  { value: "done", label: "Выполнено" },
];

const LEVEL_STYLE: Record<number, string> = {
  1: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  2: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  3: "text-red-400 bg-red-500/10 border-red-500/20",
};

function QuickMenu({
  onOpen, onSkip, onDelete,
}: {
  onOpen: () => void;
  onSkip: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const items = [
    { label: "Редактировать", action: () => { onOpen(); setOpen(false); } },
    { label: "Пропустить сегодня", action: () => { onSkip(); setOpen(false); } },
    { label: "В архив", action: () => { onDelete(); setOpen(false); }, danger: true },
  ];
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-7 h-7 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-white/[0.08]"
        style={{ color: "var(--t-faint)" }}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl py-1 min-w-[170px]" onMouseLeave={() => setTimeout(() => setOpen(false), 150)}>
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className={clsx("w-full text-left block px-4 py-2 font-medium transition-colors hover:bg-white/[0.05]", item.danger ? "text-red-400/80 hover:text-red-400" : "hover:text-white/90")}
              style={{ fontSize: "var(--fs-secondary)", color: item.danger ? undefined : "var(--t-secondary)" }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactHabitCard({ habit, onOpen }: { habit: HabitItem; onOpen: () => void }) {
  const { mutate: skipToday } = useSkipHabitToday();
  const { mutate: deleteHabit } = useDeleteHabit();
  const { mutate: restoreHabit } = useRestoreHabit();
  const levelCls = LEVEL_STYLE[habit.level] ?? "text-white/60 bg-white/[0.05] border-white/[0.08]";
  return (
    <div
      onClick={habit.is_archived ? undefined : onOpen}
      className={clsx(
        "group bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5 transition-all",
        habit.is_archived ? "opacity-60" : "cursor-pointer hover:bg-white/[0.05] hover:border-white/[0.09]",
        habit.done_today && !habit.is_archived && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-base shrink-0">{habit.category_emoji ?? "🔄"}</span>
        <div className="flex-1 min-w-0">
          <p className={clsx("font-medium truncate", habit.done_today && "line-through")} style={{ fontSize: "var(--fs-secondary)", color: "var(--t-primary)" }}>
            {habit.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={clsx("px-1.5 py-0.5 rounded-full font-semibold border", levelCls)} style={{ fontSize: "var(--fs-badge)" }}>
              {habit.level_label}
            </span>
            {habit.category_title && <span style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}>{habit.category_title}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          {habit.is_archived ? (
            <button onClick={(e) => { e.stopPropagation(); restoreHabit(habit.habit_id); }} className="font-medium text-emerald-400/80 hover:text-emerald-400 transition-colors" style={{ fontSize: "var(--fs-badge)" }}>
              Восстановить
            </button>
          ) : (
            <>
              <span className="font-bold tabular-nums leading-none" style={{ fontSize: "var(--fs-title)", color: habit.current_streak >= 30 ? "#34d399" : habit.current_streak >= 14 ? "#fbbf24" : habit.current_streak >= 7 ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.4)", letterSpacing: "-0.03em" }}>
                {habit.current_streak}
              </span>
              <p style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}>серия</p>
            </>
          )}
        </div>
        {!habit.is_archived && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <QuickMenu onOpen={onOpen} onSkip={() => skipToday(habit.habit_id)} onDelete={() => deleteHabit(habit.habit_id)} />
          </div>
        )}
      </div>
      <div className="flex gap-0.5 mt-2.5">
        {(habit.recent_days ?? []).map((done, i) => (
          <div key={i} className={clsx("flex-1 h-2 rounded-sm transition-colors", done ? "bg-emerald-500/50" : "bg-white/[0.07]")} title={done ? "Выполнено" : "Не выполнено"} />
        ))}
      </div>
    </div>
  );
}

interface AdminBlockProps {
  habits: HabitItem[];
  archivedHabits: HabitItem[];
  onOpen: (habit: HabitItem) => void;
  onCreateNew: () => void;
}

export function AdminBlock({ habits, archivedHabits, onOpen, onCreateNew }: AdminBlockProps) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [showArchived, setShowArchived] = useState(false);
  const listHabits = showArchived ? archivedHabits : habits;
  const filtered = listHabits.filter((h) => {
    if (showArchived) return true;
    if (filter === "done") return h.done_today;
    if (filter === "pending") return !h.done_today;
    return true;
  });
  const pendingCount = habits.filter((h) => !h.done_today).length;
  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-4">
      <h3 className="font-semibold uppercase tracking-widest mb-3" style={{ fontSize: "var(--fs-badge)", color: "var(--t-faint)" }}>
        Все привычки
      </h3>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {!showArchived && (
          <button onClick={onCreateNew} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl px-3 py-1.5 transition-colors" style={{ fontSize: "var(--fs-caption)" }}>
            <Plus size={12} strokeWidth={2.5} />
            Создать привычку
          </button>
        )}
        <label className="flex items-center gap-2 cursor-pointer ml-auto" style={{ fontSize: "var(--fs-caption)", color: "var(--t-muted)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); setFilter("all"); }} className="rounded" />
          Архивные
        </label>
      </div>
      {!showArchived && (
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 w-fit mb-3">
          {FILTERS.map(({ value, label }) => (
            <button key={value} onClick={() => setFilter(value)} className={clsx("px-3 py-1 rounded-lg font-medium transition-colors", filter === value ? "bg-white/[0.09] text-white shadow-sm" : "text-white/55 hover:text-white/80")} style={{ fontSize: "var(--fs-caption)" }}>
              {label}
              {value === "pending" && pendingCount > 0 && (
                <span className="ml-1.5 font-bold text-amber-400 tabular-nums" style={{ fontSize: "var(--fs-badge)" }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="py-8 text-center">
          <p style={{ fontSize: "var(--fs-secondary)", color: "var(--t-muted)" }}>
            {showArchived ? "Нет архивных привычек" : filter === "done" ? "Ничего не выполнено сегодня" : filter === "pending" ? "Все привычки выполнены!" : "Нет активных привычек"}
          </p>
          {!showArchived && filter === "all" && (
            <button onClick={onCreateNew} className="mt-2 font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors" style={{ fontSize: "var(--fs-caption)" }}>
              + Создать первую привычку
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => (
            <CompactHabitCard key={h.habit_id} habit={h} onOpen={() => onOpen(h)} />
          ))}
        </div>
      )}
    </div>
  );
}
