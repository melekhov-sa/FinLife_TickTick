"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Tag, Clock, AlignLeft, Trash2, Flame, Trophy } from "lucide-react";
import { clsx } from "clsx";
import type { HabitItem, WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { useUpdateHabit, useDeleteHabit } from "@/hooks/useHabits";

interface Props {
  habit: HabitItem;
  onClose: () => void;
}

const LEVELS = [
  { value: 1, label: "Просто",  color: "text-emerald-400" },
  { value: 2, label: "Средне",  color: "text-amber-400" },
  { value: 3, label: "Сложно",  color: "text-red-400" },
];

export function HabitDetailPanel({ habit, onClose }: Props) {
  const [title, setTitle]           = useState(habit.title);
  const [note, setNote]             = useState(habit.note ?? "");
  const [level, setLevel]           = useState(habit.level);
  const [catId, setCatId]           = useState(habit.category_id ? String(habit.category_id) : "");
  const [reminderTime, setReminderTime] = useState(habit.reminder_time ?? "");
  const [titleFocused, setTitleFocused] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleRef    = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: update } = useUpdateHabit();
  const { mutate: del }    = useDeleteHabit();

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  const catOptions = [
    { value: "", label: "— без категории —" },
    ...(categories ?? []).map((c) => ({
      value: String(c.category_id),
      label: c.title,
      emoji: c.emoji ?? undefined,
    })),
  ];

  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setTitle(habit.title);
    setNote(habit.note ?? "");
    setLevel(habit.level);
    setCatId(habit.category_id ? String(habit.category_id) : "");
    setReminderTime(habit.reminder_time ?? "");
  }, [habit.habit_id]);

  const debounceSave = useCallback((field: "note", value: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      update({ habitId: habit.habit_id, data: { [field]: value || null } });
    }, 800);
  }, [habit.habit_id, update]);

  function saveTitle() {
    const t = title.trim();
    if (t && t !== habit.title) update({ habitId: habit.habit_id, data: { title: t } });
    else setTitle(habit.title);
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    del(habit.habit_id);
    onClose();
  }

  const doneCount = habit.recent_days.filter(Boolean).length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />

      <div
        className={clsx(
          "fixed z-40 bg-[#161d2b] border-l border-white/[0.07] shadow-2xl flex flex-col",
          "inset-x-0 bottom-0 top-[15%] rounded-t-2xl",
          "lg:inset-x-auto lg:top-0 lg:bottom-0 lg:right-0 lg:w-[400px] lg:rounded-none",
        )}
        style={{ animation: "slideInPanel 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/[0.07] flex items-center justify-center text-base">
              {habit.category_emoji ?? "🔄"}
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Привычка
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--t-faint)" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => { setTitleFocused(false); saveTitle(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); titleRef.current?.blur(); }
              if (e.key === "Escape") { setTitle(habit.title); titleRef.current?.blur(); }
            }}
            className={clsx(
              "w-full text-[18px] font-semibold bg-transparent outline-none leading-snug border-b transition-colors pb-1",
              titleFocused ? "border-indigo-500/50" : "border-transparent hover:border-white/[0.08]"
            )}
            style={{ color: "var(--t-primary)", letterSpacing: "-0.02em" }}
          />

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: <Flame size={14} />, value: habit.current_streak, label: "Серия", color: habit.current_streak >= 7 ? "text-amber-400" : "" },
              { icon: <Trophy size={14} />, value: habit.best_streak, label: "Рекорд", color: "text-indigo-400" },
              { value: `${habit.done_count_30d}/30`, label: "За 30 дней", color: "text-emerald-400" },
            ].map((stat, i) => (
              <div key={i} className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 text-center">
                {stat.icon && <div className={clsx("flex justify-center mb-1", stat.color)} style={{ color: !stat.color ? "var(--t-faint)" : undefined }}>{stat.icon}</div>}
                <div className={clsx("text-lg font-bold tabular-nums leading-none", stat.color)} style={{ color: !stat.color ? "var(--t-primary)" : undefined, letterSpacing: "-0.03em" }}>
                  {stat.value}
                </div>
                <div className="text-[10px] mt-1 font-medium uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* 14-day tracker */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>
              Последние 14 дней
            </p>
            <div className="flex items-center gap-1">
              {habit.recent_days.map((done, i) => (
                <div
                  key={i}
                  title={done ? "Выполнено" : "Не выполнено"}
                  className={clsx(
                    "flex-1 h-5 rounded-sm transition-colors",
                    done ? "bg-emerald-500/60" : "bg-white/[0.07]"
                  )}
                />
              ))}
            </div>
            <p className="text-[11px] mt-1.5 tabular-nums" style={{ color: "var(--t-faint)" }}>
              {doneCount} из 14 дней
            </p>
          </div>

          {/* Difficulty (level) */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>
              Сложность
            </p>
            <div className="flex items-center gap-1.5">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => {
                    setLevel(l.value);
                    update({ habitId: habit.habit_id, data: { level: l.value } });
                  }}
                  className={clsx(
                    "flex-1 py-2 rounded-xl text-[12px] font-semibold transition-colors border",
                    level === l.value
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white/[0.04] border-white/[0.07] hover:bg-white/[0.08]"
                  )}
                  style={{ color: level === l.value ? undefined : "var(--t-muted)" }}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="flex items-start gap-3">
            <Tag size={15} className="mt-2.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Категория
              </p>
              <Select
                value={catId}
                onChange={(v) => {
                  setCatId(v);
                  update({ habitId: habit.habit_id, data: { category_id: v ? Number(v) : null } });
                }}
                options={catOptions}
                placeholder="— без категории —"
              />
            </div>
          </div>

          {/* Reminder */}
          <div className="flex items-start gap-3">
            <Clock size={15} className="mt-0.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Напоминание
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => {
                    setReminderTime(e.target.value);
                    update({ habitId: habit.habit_id, data: { reminder_time: e.target.value || null } });
                  }}
                  className="px-2.5 py-1.5 text-[13px] rounded-lg bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 transition-colors [color-scheme:dark]"
                  style={{ color: "var(--t-secondary)" }}
                />
                {reminderTime && (
                  <button
                    onClick={() => {
                      setReminderTime("");
                      update({ habitId: habit.habit_id, data: { reminder_time: null } });
                    }}
                    className="text-[11px] hover:text-red-400 transition-colors"
                    style={{ color: "var(--t-faint)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Note */}
          <div className="flex items-start gap-3">
            <AlignLeft size={15} className="mt-2.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
                Заметка
              </p>
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value); debounceSave("note", e.target.value); }}
                placeholder="Добавить заметку..."
                rows={3}
                className="w-full px-3 py-2.5 text-[14px] rounded-xl bg-white/[0.04] border border-white/[0.07] focus:outline-none focus:border-indigo-500/40 transition-colors resize-none placeholder-white/25"
                style={{ color: "var(--t-secondary)" }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 flex justify-end">
          <button
            onClick={handleDelete}
            onBlur={() => setTimeout(() => setConfirmDelete(false), 300)}
            className={clsx(
              "flex items-center gap-1.5 py-2 px-3 rounded-xl border transition-all text-[12px] font-medium",
              confirmDelete
                ? "bg-red-600 border-red-500 text-white"
                : "bg-white/[0.04] border-white/[0.07] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
            )}
            style={{ color: confirmDelete ? undefined : "var(--t-secondary)" }}
          >
            <Trash2 size={13} />
            {confirmDelete ? "Архивировать?" : "В архив"}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInPanel {
          from { transform: translateX(100%); opacity: 0.8; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (max-width: 1023px) {
          @keyframes slideInPanel {
            from { transform: translateY(40px); opacity: 0.8; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}
