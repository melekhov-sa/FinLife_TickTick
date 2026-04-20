"use client";

import { useMemo } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { clsx } from "clsx";

interface PlanEntry {
  kind: string;
  id: number;
  title: string;
  date: string | null;
  time: string | null;
  is_done: boolean;
  is_overdue: boolean;
  status: string | null;
  category_emoji: string | null;
  meta: Record<string, unknown>;
}

interface Props {
  dateISO: string;
  entries: PlanEntry[];
  onClose: () => void;
  onEntryClick: (entry: PlanEntry) => void;
  onAddTask: () => void;
}

type EntryGroupType = "tasks" | "habits" | "events" | "ops";

const ENTRY_GROUP_ORDER: EntryGroupType[] = ["tasks", "habits", "events", "ops"];
const ENTRY_GROUP_LABELS: Record<EntryGroupType, string> = {
  tasks: "Задачи",
  habits: "Привычки",
  events: "События",
  ops: "Финансы",
};

function entryGroupType(kind: string): EntryGroupType {
  if (kind === "task" || kind === "task_occ") return "tasks";
  if (kind === "habit") return "habits";
  if (kind === "event") return "events";
  return "ops";
}

function kindBadgeCls(kind: string): string {
  switch (kind) {
    case "event": return "text-purple-500 dark:text-purple-400";
    case "task":
    case "task_occ": return "text-indigo-500 dark:text-indigo-400";
    case "planned_op": return "text-amber-500 dark:text-amber-400";
    case "habit": return "text-violet-500 dark:text-violet-400";
    default: return "text-slate-400 dark:text-white/40";
  }
}

/** Format ISO date string to human-readable Russian title. */
function formatDayTitle(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const dayName = d.toLocaleDateString("ru-RU", { weekday: "long" });
  const dayMonth = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).replace(/\s\d{4}$/, "");
  const capitalized = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${dayMonth} · ${capitalized}`;
}

export function DayListModal({ dateISO, entries, onClose, onEntryClick, onAddTask }: Props) {
  const title = formatDayTitle(dateISO);

  const grouped = useMemo(
    () =>
      ENTRY_GROUP_ORDER.map((gt) => ({
        type: gt,
        label: ENTRY_GROUP_LABELS[gt],
        entries: entries.filter((e) => entryGroupType(e.kind) === gt),
      })).filter((g) => g.entries.length > 0),
    [entries],
  );

  return (
    <BottomSheet open onClose={onClose} title={title}>
      {entries.length === 0 ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>
            На этот день ничего не запланировано
          </p>
          <button
            onClick={() => { onClose(); onAddTask(); }}
            className="text-[13px] font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
          >
            + Добавить задачу
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => (
            <div key={g.type}>
              {grouped.length > 1 && (
                <p className="text-[10px] font-bold uppercase tracking-[0.05em] mb-1" style={{ color: "var(--t-muted)", opacity: 0.5 }}>
                  {g.label}
                </p>
              )}
              {g.entries.map((entry) => (
                <button
                  key={`${entry.kind}-${entry.id}`}
                  className={clsx(
                    "w-full text-left flex items-center gap-2.5 py-2 border-t first:border-0 transition-colors",
                    "border-slate-100/70 dark:border-white/[0.05] hover:bg-slate-50/50 dark:hover:bg-white/[0.03]",
                  )}
                  onClick={() => onEntryClick(entry)}
                >
                  <span className={clsx("shrink-0 text-[13px]", kindBadgeCls(entry.kind))}>
                    {entry.kind === "event" ? "🔔"
                      : entry.kind === "task" || entry.kind === "task_occ" ? "▢"
                      : entry.kind === "planned_op" ? "💰"
                      : entry.kind === "habit" ? "🌱"
                      : "•"}
                  </span>
                  <span
                    className={clsx(
                      "flex-1 text-[14px] font-medium truncate",
                      entry.is_done && "line-through",
                    )}
                    style={{ color: entry.is_done ? "var(--t-muted)" : "var(--t-primary)" }}
                  >
                    {entry.category_emoji && <span className="mr-0.5">{entry.category_emoji}</span>}
                    {entry.title}
                  </span>
                  {entry.time && (
                    <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--t-muted)" }}>
                      {entry.time}
                    </span>
                  )}
                  {entry.is_overdue && !entry.is_done && (
                    <span className="shrink-0 text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-500/[0.12] px-1 py-px rounded">
                      просроч.
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
