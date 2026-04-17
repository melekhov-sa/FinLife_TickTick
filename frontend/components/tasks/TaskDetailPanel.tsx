"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Calendar, Tag, CheckCircle2, Archive, Trash2, Paperclip } from "lucide-react";
import { TaskAttachments } from "./TaskAttachments";
import { TaskReminders } from "./TaskReminders";
import { clsx } from "clsx";
import type { TaskItem, WorkCategoryItem, ProjectTag } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompleteTask, useCompleteTaskOccurrence, useArchiveTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";

interface Props {
  task: TaskItem;
  onClose: () => void;
  projectTags?: ProjectTag[];
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function isoToInputDate(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatDisplayDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  if (diff === -1) return "Вчера";
  if (diff < 0) return `просрочено ${Math.abs(diff)}д`;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

// ── Component ─────────────────────────────────────────────────────────────────

const TAG_COLOR_CLASSES: Record<string, string> = {
  gray:   "bg-white/10 text-white/50 border-white/15",
  blue:   "bg-blue-500/15 text-blue-400 border-blue-500/20",
  green:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  orange: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};

export function TaskDetailPanel({ task, onClose, projectTags }: Props) {
  const [title, setTitle]     = useState(task.title);
  const [note, setNote]       = useState(task.note ?? "");
  const [dueDate, setDueDate] = useState(isoToInputDate(task.due_date));
  const [catId, setCatId]     = useState<string>(task.category_id ? String(task.category_id) : "");
  const [titleFocused, setTitleFocused] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const titleRef    = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: complete }    = useCompleteTask();
  const { mutate: completeOcc } = useCompleteTaskOccurrence();
  const { mutate: archive }  = useArchiveTask();
  const { mutate: update }   = useUpdateTask();
  const { mutate: del }      = useDeleteTask();

  const qc = useQueryClient();
  const { mutate: addTag } = useMutation({
    mutationFn: ({ tagId }: { tagId: number }) =>
      api.post(`/api/v2/projects/${task.project_id}/tasks/${task.task_id}/tags/${tagId}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task", task.task_id] }),
  });
  const { mutate: removeTag } = useMutation({
    mutationFn: ({ tagId }: { tagId: number }) =>
      api.delete(`/api/v2/projects/${task.project_id}/tasks/${task.task_id}/tags/${tagId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task", task.task_id] });
      qc.invalidateQueries({ queryKey: ["project", task.project_id] });
    },
  });

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  const catOptions = [
    { value: "", label: "— без категории —" },
    ...(categories ?? []).map((c) => ({ value: String(c.category_id), label: c.title, emoji: c.emoji ?? undefined })),
  ];

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Keep local state in sync if task prop changes (tab switch etc.)
  useEffect(() => {
    setTitle(task.title);
    setNote(task.note ?? "");
    setDueDate(isoToInputDate(task.due_date));
    setCatId(task.category_id ? String(task.category_id) : "");
  }, [task.task_id]);

  // Debounced auto-save for note
  const debounceSave = useCallback((field: "note", value: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      update({ taskId: task.task_id, data: { [field]: value || null } });
    }, 800);
  }, [task.task_id, update]);

  function saveTitle() {
    if (title.trim() && title.trim() !== task.title) {
      update({ taskId: task.task_id, data: { title: title.trim() } });
    } else {
      setTitle(task.title);
    }
  }

  function saveDueDate(val: string) {
    setDueDate(val);
    update({ taskId: task.task_id, data: { due_date: val || null } });
  }

  function saveCategoryId(val: string) {
    setCatId(val);
    update({ taskId: task.task_id, data: { category_id: val ? Number(val) : null } });
  }

  function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    del(task.task_id);
    onClose();
  }

  const isDone     = task.status === "DONE";
  const isArchived = task.status === "ARCHIVED";
  const dateLabel  = formatDisplayDate(dueDate || null);
  const isOverdue  = dueDate ? new Date(dueDate + "T00:00:00") < new Date(new Date().toDateString()) && !isDone : false;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          "fixed z-40 bg-[#161d2b] border-l border-white/[0.07] shadow-2xl flex flex-col",
          // Mobile: bottom sheet / full screen
          "inset-x-0 bottom-0 top-[20%] rounded-t-2xl",
          // Desktop: right side panel
          "lg:inset-x-auto lg:top-0 lg:bottom-0 lg:right-0 lg:w-[400px] lg:rounded-none",
        )}
        style={{ animation: "slideInPanel 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              {isDone ? "Выполнено" : isArchived ? "Архив" : task.is_recurring ? "Повторяющаяся" : "Задача"}
            </span>
            {task.category_emoji && (
              <span className="text-base">{task.category_emoji}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--t-faint)" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Title — inline editable */}
          <div>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={() => setTitleFocused(true)}
              onBlur={() => { setTitleFocused(false); saveTitle(); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); titleRef.current?.blur(); } if (e.key === "Escape") { setTitle(task.title); titleRef.current?.blur(); } }}
              disabled={isDone || isArchived || task.is_recurring}
              className={clsx(
                "w-full text-[18px] font-semibold bg-transparent outline-none resize-none leading-snug",
                "border-b transition-colors pb-1",
                titleFocused ? "border-indigo-500/50" : "border-transparent hover:border-white/[0.08]",
                isDone || isArchived ? "line-through opacity-50" : ""
              )}
              style={{ color: "var(--t-primary)", letterSpacing: "-0.02em" }}
            />
          </div>

          {/* Due date */}
          <div className="flex items-start gap-3">
            <Calendar size={15} className="mt-0.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>Срок</p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => saveDueDate(e.target.value)}
                  disabled={isDone || isArchived}
                  className="px-2.5 py-1.5 text-[13px] rounded-lg bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 transition-colors [color-scheme:dark] disabled:opacity-50"
                  style={{ color: "var(--t-secondary)" }}
                />
                {dateLabel && (
                  <span className={clsx(
                    "text-[12px] font-medium",
                    isOverdue ? "text-red-400" : dueDate === new Date().toISOString().slice(0,10) ? "text-amber-400" : ""
                  )} style={{ color: (!isOverdue && dueDate !== new Date().toISOString().slice(0,10)) ? "var(--t-muted)" : undefined }}>
                    {dateLabel}
                  </span>
                )}
                {dueDate && (
                  <button
                    onClick={() => saveDueDate("")}
                    className="text-[11px] hover:text-red-400 transition-colors"
                    style={{ color: "var(--t-faint)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Reminders */}
          {!task.is_recurring && (
            <TaskReminders
              taskId={task.task_id}
              dueDate={task.due_date}
              dueTime={task.due_time ?? null}
              disabled={isDone || isArchived}
            />
          )}

          {/* Category */}
          <div className="flex items-start gap-3">
            <Tag size={15} className="mt-2.5 shrink-0" style={{ color: "var(--t-faint)" }} />
            <div className="flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>Категория</p>
              <Select
                value={catId}
                onChange={saveCategoryId}
                options={catOptions}
                placeholder="— без категории —"
                disabled={isDone || isArchived}
              />
            </div>
          </div>

          {/* Project tags */}
          {projectTags && projectTags.length > 0 && (
            <div className="flex items-start gap-3">
              <Tag size={15} className="mt-1 shrink-0" style={{ color: "var(--t-faint)" }} />
              <div className="flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>Теги</p>
                <div className="flex flex-wrap gap-1.5">
                  {projectTags.map((tag) => {
                    const isActive = (task.tag_ids ?? []).includes(tag.id);
                    const colorCls = TAG_COLOR_CLASSES[tag.color ?? "gray"] ?? TAG_COLOR_CLASSES.gray;
                    return (
                      <button
                        key={tag.id}
                        onClick={() => isActive ? removeTag({ tagId: tag.id }) : addTag({ tagId: tag.id })}
                        disabled={isDone || isArchived}
                        className={clsx(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all disabled:opacity-50",
                          isActive ? colorCls : "bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white/60"
                        )}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Note */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>Заметка</p>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); debounceSave("note", e.target.value); }}
              disabled={isDone || isArchived}
              placeholder="Добавить заметку..."
              rows={4}
              className="w-full px-3 py-2.5 text-[14px] rounded-xl bg-white/[0.04] border border-white/[0.07] focus:outline-none focus:border-indigo-500/40 transition-colors resize-none placeholder-white/25 disabled:opacity-50"
              style={{ color: "var(--t-secondary)" }}
            />
          </div>

          {/* Attachments — only for non-recurring tasks */}
          {!task.is_recurring && (
            <div className="flex items-start gap-3">
              <Paperclip size={15} className="mt-1 shrink-0" style={{ color: "var(--t-faint)" }} />
              <div className="flex-1">
                <TaskAttachments taskId={task.task_id} disabled={isDone || isArchived} />
              </div>
            </div>
          )}

          {/* Metadata */}
          {task.completed_at && (
            <div className="text-[12px]" style={{ color: "var(--t-faint)" }}>
              Выполнено: {new Date(task.completed_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>

        {/* Action bar */}
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 flex items-center gap-2">
          {!isDone && !isArchived && (
            <button
              onClick={() => {
                if (task.is_recurring && task.occurrence_id) {
                  completeOcc(task.occurrence_id);
                } else {
                  complete(task.task_id);
                }
                onClose();
              }}
              className="flex items-center gap-2 flex-1 justify-center py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold transition-colors"
            >
              <CheckCircle2 size={15} />
              Выполнено
            </button>
          )}
          {!isDone && !isArchived && !task.is_recurring && (
            <button
              onClick={() => { archive(task.task_id); onClose(); }}
              className="flex items-center gap-2 py-2.5 px-3.5 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition-colors"
              style={{ color: "var(--t-secondary)" }}
              title="В архив"
            >
              <Archive size={14} />
            </button>
          )}
          {task.is_recurring ? (
            <a
              href="/legacy/tasks?mode=recurring"
              className="flex items-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/[0.04] border border-white/[0.07] hover:bg-white/[0.07] transition-colors text-[12px] font-medium"
              style={{ color: "var(--t-faint)" }}
            >
              Управление →
            </a>
          ) : (
            <button
              onClick={handleDelete}
              className={clsx(
                "flex items-center gap-1.5 py-2.5 px-3.5 rounded-xl border transition-all text-[13px] font-medium",
                confirmDelete
                  ? "bg-red-600 border-red-500 text-white"
                  : "bg-white/[0.04] border-white/[0.07] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
              )}
              style={{ color: confirmDelete ? undefined : "var(--t-secondary)" }}
              title={confirmDelete ? "Нажмите ещё раз для подтверждения" : "Удалить"}
              onBlur={() => setTimeout(() => setConfirmDelete(false), 300)}
            >
              <Trash2 size={14} />
              {confirmDelete && <span>Удалить?</span>}
            </button>
          )}
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
