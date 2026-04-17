"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, X, Plus } from "lucide-react";
import { useState } from "react";
import { clsx } from "clsx";
import { api } from "@/lib/api";

interface TaskReminder {
  id: number;
  reminder_kind: string;
  offset_minutes: number;
  fixed_time: string | null;
}

interface ReminderPreset {
  id: number;
  label: string;
  offset_minutes: number;
}

interface Props {
  taskId: number;
  dueDate: string | null;
  dueTime: string | null;
  disabled?: boolean;
}

const FIXED_TIME_PRESETS = ["09:00", "12:00", "15:00", "18:00", "20:00"];

export function TaskReminders({ taskId, dueDate, dueTime, disabled }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: reminders = [] } = useQuery<TaskReminder[]>({
    queryKey: ["task-reminders", taskId],
    queryFn: () => api.get<TaskReminder[]>(`/api/v2/tasks/${taskId}/reminders`),
    staleTime: 30_000,
  });

  const { data: presets = [] } = useQuery<ReminderPreset[]>({
    queryKey: ["reminder-presets"],
    queryFn: () => api.get<ReminderPreset[]>("/api/v2/reminder-presets"),
    staleTime: 5 * 60_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["task-reminders", taskId] });

  const { mutate: addReminder, isPending: adding_ } = useMutation({
    mutationFn: (body: { reminder_kind: string; offset_minutes?: number; fixed_time?: string }) =>
      api.post(`/api/v2/tasks/${taskId}/reminders`, body),
    onSuccess: () => { invalidate(); setAdding(false); },
    onError: (err: Error) => alert(err.message.replace(/^API error \d+: /, "")),
  });

  const { mutate: deleteReminder } = useMutation({
    mutationFn: (reminderId: number) => api.delete(`/api/v2/tasks/${taskId}/reminders/${reminderId}`),
    onSuccess: invalidate,
  });

  // Decide mode: fixed-time if task has date but no time; offset otherwise
  const hasTime = !!dueTime;
  const hasDate = !!dueDate;
  const mode: "OFFSET" | "FIXED_TIME" | "DISABLED" = !hasDate
    ? "DISABLED"
    : hasTime
    ? "OFFSET"
    : "FIXED_TIME";

  function reminderLabel(r: TaskReminder): string {
    if (r.reminder_kind === "FIXED_TIME") {
      return `в ${r.fixed_time}`;
    }
    const preset = presets.find((p) => p.offset_minutes === r.offset_minutes);
    if (preset) return preset.label;
    const m = Math.abs(r.offset_minutes);
    if (m === 0) return "В момент срока";
    if (m < 60) return `За ${m} мин`;
    if (m < 1440) return `За ${Math.floor(m / 60)} ч`;
    return `За ${Math.floor(m / 1440)} д`;
  }

  return (
    <div className="flex items-start gap-3">
      <Bell size={15} className="mt-0.5 shrink-0" style={{ color: "var(--t-faint)" }} />
      <div className="flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
          Напоминания
        </p>

        {mode === "DISABLED" && (
          <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
            Укажите дату, чтобы добавить напоминание
          </p>
        )}

        {mode !== "DISABLED" && (
          <div className="flex flex-wrap gap-1.5">
            {reminders.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-[12px] font-medium"
              >
                {reminderLabel(r)}
                {!disabled && (
                  <button
                    onClick={() => deleteReminder(r.id)}
                    className="hover:text-red-500 transition-colors"
                    title="Удалить"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}

            {!disabled && reminders.length < 5 && (
              adding ? (
                <div className="flex items-center gap-1 flex-wrap">
                  {mode === "FIXED_TIME" ? (
                    FIXED_TIME_PRESETS
                      .filter((t) => !reminders.some((r) => r.reminder_kind === "FIXED_TIME" && r.fixed_time === t))
                      .map((t) => (
                        <button
                          key={t}
                          onClick={() => addReminder({ reminder_kind: "FIXED_TIME", fixed_time: t })}
                          disabled={adding_}
                          className="px-2.5 py-1 text-[12px] font-medium rounded-lg bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-500/25 transition-colors"
                        >
                          {t}
                        </button>
                      ))
                  ) : (
                    presets
                      .filter((p) => !reminders.some((r) => r.reminder_kind === "OFFSET" && r.offset_minutes === p.offset_minutes))
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addReminder({ reminder_kind: "OFFSET", offset_minutes: p.offset_minutes })}
                          disabled={adding_}
                          className="px-2.5 py-1 text-[12px] font-medium rounded-lg bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-500/25 transition-colors"
                        >
                          {p.label}
                        </button>
                      ))
                  )}
                  <button
                    onClick={() => setAdding(false)}
                    className="px-2 py-1 text-[11px] font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                    style={{ color: "var(--t-faint)" }}
                  >
                    Отмена
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.12] hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06] text-[12px] font-medium transition-colors"
                  style={{ color: "var(--t-muted)" }}
                >
                  <Plus size={11} /> Добавить
                </button>
              )
            )}
          </div>
        )}

        {mode === "FIXED_TIME" && !disabled && reminders.length === 0 && !adding && (
          <p className="text-[11px] mt-1.5" style={{ color: "var(--t-faint)" }}>
            Задача без времени — выбери час напоминания
          </p>
        )}
      </div>
    </div>
  );
}
