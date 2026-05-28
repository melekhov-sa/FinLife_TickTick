"use client";

import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { useMealPlan, useUpsertMealEntry, useDeleteMealEntry, type MealEntry } from "@/hooks/useMealPlan";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Skeleton } from "@/components/primitives/Skeleton";

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const SLOTS: { key: string; label: string }[] = [
  { key: "breakfast", label: "Завтрак" },
  { key: "lunch",     label: "Обед" },
  { key: "dinner",    label: "Ужин" },
];

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addWeeks(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n * 7);
  return result;
}

function weekLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmtDay = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monday.getDate()}–${fmtDay(sunday)}`;
  }
  return `${fmtDay(monday)} – ${fmtDay(sunday)}`;
}

function MealCell({
  entry,
  weekStart,
  dayIndex,
  slot,
}: {
  entry: MealEntry | undefined;
  weekStart: string;
  dayIndex: number;
  slot: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry?.dish_name ?? "");
  const { mutate: upsert } = useUpsertMealEntry();
  const { mutate: remove } = useDeleteMealEntry();
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    const trimmed = text.trim();
    if (trimmed && trimmed !== entry?.dish_name) {
      upsert({ week_start: weekStart, day_of_week: dayIndex, meal_slot: slot, dish_name: trimmed });
    } else if (!trimmed && entry) {
      remove({ id: entry.id, week_start: weekStart });
    }
    setEditing(false);
  }

  function startEdit() {
    setText(entry?.dish_name ?? "");
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setText(entry?.dish_name ?? ""); setEditing(false); }
        }}
        className="w-full rounded-lg px-2 py-1.5 text-[12px] outline-none border border-indigo-400"
        style={{ background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
        placeholder="Введите блюдо…"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className={clsx(
        "w-full min-h-[36px] rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors",
        entry
          ? "bg-indigo-50 dark:bg-indigo-500/[0.08] hover:bg-indigo-100 dark:hover:bg-indigo-500/[0.14]"
          : "hover:bg-slate-100 dark:hover:bg-white/[0.06] border border-dashed border-slate-200 dark:border-white/[0.08]",
      )}
    >
      {entry ? (
        <span style={{ color: "var(--t-primary)" }}>{entry.dish_name}</span>
      ) : (
        <span style={{ color: "var(--t-faint)" }}>+</span>
      )}
    </button>
  );
}

export default function MealPlanPage() {
  const [monday, setMonday] = useState(() => getMonday(new Date()));
  const weekStart = toISO(monday);
  const { data: entries, isLoading } = useMealPlan(weekStart);

  const byKey = new Map<string, MealEntry>();
  for (const e of entries ?? []) {
    byKey.set(`${e.day_of_week}:${e.meal_slot}`, e);
  }

  const today = toISO(new Date());
  const todayIndex = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();
  const isCurrentWeek = weekStart === toISO(getMonday(new Date()));

  return (
    <>
      <PageHeader
        title="Меню на неделю"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMonday((m) => addWeeks(m, -1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08]"
              style={{ borderColor: "var(--app-border)", color: "var(--t-muted)" }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-[13px] font-medium min-w-[130px] text-center" style={{ color: "var(--t-primary)" }}>
              {weekLabel(monday)}
            </span>
            <button
              onClick={() => setMonday((m) => addWeeks(m, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08]"
              style={{ borderColor: "var(--app-border)", color: "var(--t-muted)" }}
            >
              <ChevronRight size={16} />
            </button>
            {!isCurrentWeek && (
              <button
                onClick={() => setMonday(getMonday(new Date()))}
                className="text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                style={{ color: "var(--t-muted)" }}
              >
                Сегодня
              </button>
            )}
          </div>
        }
      />

      <main className="flex-1 p-3 md:p-6 overflow-x-auto">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-12 rounded-xl" />)}
          </div>
        ) : (
          <table className="w-full border-collapse" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th className="w-20 text-left pb-2 pr-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>
                    Приём
                  </span>
                </th>
                {DAYS.map((day, i) => (
                  <th key={i} className="pb-2 px-1 text-center">
                    <span
                      className={clsx(
                        "text-[12px] font-bold",
                        isCurrentWeek && i === todayIndex
                          ? "text-indigo-500"
                          : "",
                      )}
                      style={!(isCurrentWeek && i === todayIndex) ? { color: "var(--t-muted)" } : undefined}
                    >
                      {day}
                    </span>
                    {isCurrentWeek && i === todayIndex && (
                      <div className="w-1 h-1 rounded-full bg-indigo-500 mx-auto mt-0.5" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SLOTS.map(({ key, label }) => (
                <tr key={key}>
                  <td className="py-1 pr-3 align-top">
                    <span className="text-[12px] font-medium" style={{ color: "var(--t-faint)" }}>{label}</span>
                  </td>
                  {DAYS.map((_, dayIdx) => (
                    <td key={dayIdx} className="py-1 px-1 align-top">
                      <MealCell
                        entry={byKey.get(`${dayIdx}:${key}`)}
                        weekStart={weekStart}
                        dayIndex={dayIdx}
                        slot={key}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
