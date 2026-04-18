"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Check, CalendarDays } from "lucide-react";
import { TaskReminders } from "@/components/tasks/TaskReminders";
import { EventReminders } from "@/components/events/EventReminders";

interface PlanEntry {
  id: number;
  kind: string;
  title: string;
  date?: string | null;
  time: string | null;
  is_done: boolean;
  is_overdue: boolean;
  category_emoji: string | null;
  meta: Record<string, unknown>;
}

interface Props {
  entry: PlanEntry;
  onClose: () => void;
}

export function EntryDetailModal({ entry, onClose }: Props) {
  const qc = useQueryClient();
  const isTask = entry.kind === "task" || entry.kind === "task_occ";
  const isEvent = entry.kind === "event";

  const [title, setTitle] = useState(entry.title);
  const [dueDate, setDueDate] = useState((entry.date ?? (entry.meta.due_date as string) ?? ""));

  const { mutate: updateTask, isPending: updating } = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v2/tasks/${entry.id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plan"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); onClose(); },
  });

  const { mutate: completeTask, isPending: completing } = useMutation({
    mutationFn: () => api.post(`/api/v2/tasks/${entry.id}/complete`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plan"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); onClose(); },
  });

  const busy = updating || completing;

  function handleSave() {
    const body: Record<string, unknown> = {};
    if (title.trim() !== entry.title) body.title = title.trim();
    if (dueDate !== ((entry.date ?? (entry.meta.due_date as string) ?? ""))) body.due_date = dueDate || null;
    if (Object.keys(body).length > 0) {
      updateTask(body);
    } else {
      onClose();
    }
  }

  const inputCls = "w-full px-3 h-10 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85";
  const labelCls = "block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/50";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isEvent ? "Событие" : "Задача"}
      footer={
        isTask && !entry.is_done ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={busy || !title.trim()}
              className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
            >
              {updating ? "..." : "Сохранить"}
            </button>
            <button
              onClick={() => completeTask()}
              disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[14px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
            >
              <Check size={16} /> {completing ? "..." : "Выполнить"}
            </button>
          </div>
        ) : isTask && entry.is_done ? (
          <p className="text-center text-[13px] text-emerald-600 dark:text-emerald-400 font-medium">Задача выполнена</p>
        ) : null
      }
    >
      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className={labelCls}>Название</label>
          {isTask && !entry.is_done ? (
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={inputCls}
              autoFocus
            />
          ) : (
            <p className="text-[15px] font-medium" style={{ color: "var(--t-primary)" }}>
              {entry.category_emoji && <span className="mr-1.5">{entry.category_emoji}</span>}
              {entry.title}
            </p>
          )}
        </div>

        {/* Due date — tasks only */}
        {isTask && !entry.is_done && (
          <div>
            <label className={labelCls}>Дата</label>
            <div className="flex items-center gap-2">
              <CalendarDays size={16} style={{ color: "var(--t-faint)" }} />
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className={`flex-1 ${inputCls}`}
              />
            </div>
          </div>
        )}

        {/* Time */}
        {entry.time && (
          <div>
            <label className={labelCls}>Время</label>
            <p className="text-[14px]" style={{ color: "var(--t-secondary)" }}>{entry.time}</p>
          </div>
        )}

        {/* Reminders — regular tasks only (task_occ reminders live on template) */}
        {entry.kind === "task" && (
          <div>
            <label className={labelCls}>Напоминания</label>
            <TaskReminders
              taskId={entry.id}
              dueDate={dueDate || null}
              dueTime={entry.time ?? (entry.meta.due_time as string) ?? null}
              disabled={entry.is_done}
            />
          </div>
        )}

        {/* Reminders — events */}
        {entry.kind === "event" && typeof entry.meta.event_id === "number" && (
          <div>
            <label className={labelCls}>Напоминания</label>
            <EventReminders
              eventId={entry.meta.event_id as number}
              startTime={entry.time ?? null}
            />
          </div>
        )}

        {/* Kind badge */}
        <div>
          <label className={labelCls}>Тип</label>
          <span className="inline-flex text-[12px] font-medium px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/60">
            {isEvent ? "Событие" : entry.kind === "habit" ? "Привычка" : entry.kind === "planned_op" ? "Плановая операция" : "Задача"}
          </span>
        </div>

        {/* Overdue warning */}
        {entry.is_overdue && !entry.is_done && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[13px] font-medium">
            Просрочено
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
