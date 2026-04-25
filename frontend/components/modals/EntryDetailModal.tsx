"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormRow } from "@/components/ui/FormRow";
import { Select } from "@/components/ui/Select";
import { RichNoteEditor } from "@/components/ui/RichNoteEditor";
import { X } from "lucide-react";
import { TaskReminders } from "@/components/tasks/TaskReminders";
import { EventReminders } from "@/components/events/EventReminders";
import type { WorkCategoryItem, TaskItem } from "@/types/api";
import { Button } from "@/components/primitives/Button";
import { Chip } from "@/components/primitives/Chip";
import { Input } from "@/components/primitives/Input";
import { DateInput } from "@/components/primitives/DateInput";

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

interface TripListOption {
  id: number;
  title: string;
  list_type: string;
}

interface Props {
  entry: PlanEntry;
  onClose: () => void;
}

export function EntryDetailModal({ entry, onClose }: Props) {
  const qc = useQueryClient();
  const isTask = entry.kind === "task" || entry.kind === "task_occ";
  const isEvent = entry.kind === "event";
  const editable = isTask && !entry.is_done;

  const initialCategoryId = typeof entry.meta.category_id === "number" ? entry.meta.category_id : null;
  const initialListId = typeof entry.meta.list_id === "number" ? (entry.meta.list_id as number) : null;
  const metaNote = typeof entry.meta.note === "string" ? (entry.meta.note as string) : "";

  const [title, setTitle] = useState(entry.title);
  const [dueDate, setDueDate] = useState((entry.date ?? (entry.meta.due_date as string) ?? ""));
  const [dueTime, setDueTime] = useState((entry.time ?? (entry.meta.due_time as string) ?? ""));
  const [categoryId, setCategoryId] = useState<number | null>(initialCategoryId);
  const [listId, setListId] = useState<number | "">(initialListId ?? "");
  const [note, setNote] = useState(metaNote);
  const [noteEdited, setNoteEdited] = useState(false);
  const [initialNote, setInitialNote] = useState(metaNote);

  const formRef = useRef<HTMLFormElement | null>(null);

  // Fetch full task to get note (only for `task`, occurrence note lives on template).
  const { data: taskFull } = useQuery<TaskItem>({
    queryKey: ["task", entry.id],
    queryFn: () => api.get<TaskItem>(`/api/v2/tasks/${entry.id}`),
    staleTime: 30_000,
    enabled: entry.kind === "task" && !entry.is_done && !metaNote,
  });

  // Hydrate the note from full task once it arrives (only if user hasn't started editing).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (taskFull && taskFull.note !== null && !noteEdited) {
      setInitialNote(taskFull.note);
      setNote(taskFull.note);
    }
  }, [taskFull, noteEdited]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
    enabled: editable,
  });
  const activeCategories = categories ?? [];

  const { data: tripLists } = useQuery<TripListOption[]>({
    queryKey: ["shared-lists", "trip"],
    queryFn: async () => {
      const all = await api.get<TripListOption[]>("/api/v2/lists");
      return all.filter((l) => l.list_type === "trip");
    },
    staleTime: 60_000,
    enabled: editable,
  });

  const { mutate: updateTask, isPending: updating } = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v2/tasks/${entry.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["task", entry.id] });
      onClose();
    },
  });

  // Title textarea — auto-resize to fit content so long titles wrap and stay fully visible
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  function handleSave() {
    const body: Record<string, unknown> = {};
    if (title.trim() !== entry.title) body.title = title.trim();
    if (dueDate !== ((entry.date ?? (entry.meta.due_date as string) ?? ""))) body.due_date = dueDate || null;
    const origTime = entry.time ?? (entry.meta.due_time as string) ?? "";
    if (dueTime !== origTime) body.due_time = dueTime || null;
    if (categoryId !== initialCategoryId) body.category_id = categoryId;
    if ((listId || null) !== initialListId) body.list_id = listId || null;
    if (note !== initialNote) body.note = note || null;
    if (Object.keys(body).length > 0) {
      updateTask(body);
    } else {
      onClose();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editable) return;
    handleSave();
  }

  // Ctrl/Cmd + Enter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!editable) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editable]);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isEvent ? "Событие" : "Задача"}
      onSubmit={editable ? handleSubmit : undefined}
      footer={
        editable ? (
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={updating}
            disabled={!title.trim()}
            fullWidth
          >
            Сохранить
          </Button>
        ) : isTask && entry.is_done ? (
          <p className="text-center text-[13px] text-emerald-600 dark:text-emerald-400 font-medium">Задача выполнена</p>
        ) : null
      }
    >
      <div
        className="space-y-3 md:space-y-4"
        ref={(el) => {
          if (el && !formRef.current) {
            const f = el.closest("form");
            if (f instanceof HTMLFormElement) formRef.current = f;
          }
        }}
      >
        {/* Title */}
        <FormRow label="Название" required={editable}>
          {editable ? (
            <textarea
              ref={titleRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              rows={1}
              className="w-full px-3 py-2 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 resize-none overflow-hidden leading-snug"
            />
          ) : (
            <p className="text-[15px] font-medium pt-1.5" style={{ color: "var(--t-primary)" }}>
              {entry.category_emoji && <span className="mr-1.5">{entry.category_emoji}</span>}
              {entry.title}
            </p>
          )}
        </FormRow>

        {/* Due date — tasks only */}
        {editable && (
          <FormRow label="Дата">
            <DateInput
              value={dueDate}
              onChange={setDueDate}
            />
          </FormRow>
        )}

        {/* Time */}
        {editable ? (
          <FormRow label="Время" hint="Необязательно">
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="flex-1"
              />
              {dueTime && (
                <button
                  type="button"
                  onClick={() => setDueTime("")}
                  className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/55 hover:text-slate-700 dark:hover:text-white/80 transition-colors"
                  aria-label="Очистить время"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </FormRow>
        ) : entry.time ? (
          <FormRow label="Время">
            <p className="text-[14px] pt-2" style={{ color: "var(--t-secondary)" }}>{entry.time}</p>
          </FormRow>
        ) : null}

        {/* Category — tasks only (toggle, no default selection) */}
        {editable && (
          <FormRow label="Категория" hint={categoryId === null ? "Без категории" : undefined}>
            <div className="flex flex-wrap gap-1">
              {activeCategories.map((c) => (
                <Chip
                  key={c.category_id}
                  label={c.title}
                  emoji={c.emoji ?? undefined}
                  selected={categoryId === c.category_id}
                  variant="accent"
                  size="sm"
                  onClick={() => setCategoryId(categoryId === c.category_id ? null : c.category_id)}
                />
              ))}
            </div>
          </FormRow>
        )}

        {/* Trip list — tasks only */}
        {editable && tripLists && tripLists.length > 0 && (
          <FormRow label="Поездка" hint="Опционально — привязать к списку поездки">
            <Select
              value={listId}
              onChange={(v) => setListId(v ? Number(v) : "")}
              placeholder="— без списка —"
              options={[
                { value: "", label: "— без списка —" },
                ...tripLists.map((l) => ({ value: String(l.id), label: l.title })),
              ]}
            />
          </FormRow>
        )}

        {/* Note — tasks only */}
        {editable && (
          <FormRow label="Заметка">
            <RichNoteEditor
              value={note}
              onChange={(v) => { setNote(v); setNoteEdited(true); }}
              placeholder="Опишите задачу…"
              minHeight={100}
            />
          </FormRow>
        )}

        {/* Reminders — regular tasks only (task_occ reminders live on template) */}
        {entry.kind === "task" && (
          <FormRow label="Напоминания">
            <TaskReminders
              taskId={entry.id}
              dueDate={dueDate || null}
              dueTime={dueTime || null}
              disabled={entry.is_done}
            />
          </FormRow>
        )}

        {/* Reminders — events */}
        {entry.kind === "event" && typeof entry.meta.event_id === "number" && (
          <FormRow label="Напоминания">
            <EventReminders
              eventId={entry.meta.event_id as number}
              startTime={entry.time ?? null}
            />
          </FormRow>
        )}

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
