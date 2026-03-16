"use client";

import { useState, useRef, useEffect } from "react";
import { clsx } from "clsx";
import { Check, MoreHorizontal, GripVertical } from "lucide-react";
import type { TaskItem } from "@/types/api";
import { useArchiveTask, useDeleteTask, useDuplicateTask, useUpdateTask } from "@/hooks/useTasks";

interface TaskRowProps {
  task: TaskItem;
  onComplete?: (id: number) => void;
  onOpen?: (task: TaskItem) => void;
  isDragging?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

// ── Due date label ────────────────────────────────────────────────────────────

function dueDateInfo(iso: string | null, isDone: boolean): { label: string; color: string } | null {
  if (!iso) return null;
  const d    = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((d.getTime() - today.getTime()) / 86400000);

  if (isDone) return { label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), color: "text-white/35" };
  if (diff < 0)  return { label: `просрочено ${Math.abs(diff)}д`, color: "text-red-400" };
  if (diff === 0) return { label: "Сегодня", color: "text-amber-400" };
  if (diff === 1) return { label: "Завтра",  color: "text-white/60" };
  return { label: d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }), color: "text-white/45" };
}

// ── Quick actions menu ────────────────────────────────────────────────────────

function QuickMenu({ task, onOpen }: { task: TaskItem; onOpen?: (t: TaskItem) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { mutate: archive }   = useArchiveTask();
  const { mutate: del }       = useDeleteTask();
  const { mutate: duplicate } = useDuplicateTask();

  useEffect(() => {
    if (!open) return;
    function out(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", out);
    return () => document.removeEventListener("mousedown", out);
  }, [open]);

  const isDone     = task.status === "DONE";
  const isArchived = task.status === "ARCHIVED";

  const items = [
    { label: "Открыть",     action: () => { onOpen?.(task); setOpen(false); } },
    { label: "Дублировать", action: () => { duplicate(task.task_id); setOpen(false); } },
    ...(!isDone && !isArchived ? [{ label: "В архив", action: () => { archive(task.task_id); setOpen(false); } }] : []),
    { label: "Удалить", action: () => { del(task.task_id); setOpen(false); }, danger: true },
  ];

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 hover:!opacity-100 transition-all hover:bg-white/[0.08]"
        style={{ color: "var(--t-faint)" }}
        title="Действия"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl py-1 min-w-[150px]">
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

// ── TaskRow ───────────────────────────────────────────────────────────────────

export function TaskRow({ task, onComplete, onOpen, isDragging, dragHandleProps }: TaskRowProps) {
  const isDone     = task.status === "DONE";
  const isArchived = task.status === "ARCHIVED";

  // Inline title editing
  const [editing, setEditing]   = useState(false);
  const [editVal, setEditVal]   = useState(task.title);
  const inputRef                = useRef<HTMLInputElement>(null);
  const { mutate: update }      = useUpdateTask();

  const dateInfo = dueDateInfo(task.due_date, isDone);

  function startEdit(e: React.MouseEvent) {
    if (isDone || isArchived) return;
    e.stopPropagation();
    setEditVal(task.title);
    setEditing(true);
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 0);
  }

  function commitEdit() {
    setEditing(false);
    if (editVal.trim() && editVal.trim() !== task.title) {
      update({ taskId: task.task_id, data: { title: editVal.trim() } });
    }
  }

  return (
    <div
      className={clsx(
        "group flex items-center gap-2.5 px-3 py-2.5 transition-colors cursor-pointer",
        isDragging
          ? "bg-white/[0.06] border border-indigo-500/30 rounded-xl opacity-80"
          : isDone || isArchived
          ? "opacity-45"
          : "hover:bg-white/[0.03]"
      )}
      onClick={() => !editing && onOpen?.(task)}
    >
      {/* Drag handle */}
      <div
        {...dragHandleProps}
        className="shrink-0 opacity-0 group-hover:opacity-40 hover:!opacity-70 cursor-grab active:cursor-grabbing transition-opacity"
        style={{ color: "var(--t-faint)", touchAction: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </div>

      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); !isDone && !isArchived && onComplete?.(task.task_id); }}
        disabled={isDone || isArchived}
        className={clsx(
          "shrink-0 w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center transition-all",
          isDone
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]"
            : "border-white/25 text-transparent hover:border-indigo-400/60 hover:bg-indigo-500/10 hover:text-indigo-400/50"
        )}
      >
        <Check size={10} strokeWidth={2.5} />
      </button>

      {/* Category emoji */}
      {task.category_emoji && (
        <span className="text-sm shrink-0 leading-none">{task.category_emoji}</span>
      )}

      {/* Title — double-click to edit */}
      <div className="flex-1 min-w-0" onDoubleClick={startEdit}>
        {editing ? (
          <input
            ref={inputRef}
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { setEditing(false); setEditVal(task.title); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent outline-none text-[14px] font-medium border-b border-indigo-500/50"
            style={{ color: "var(--t-primary)" }}
          />
        ) : (
          <p className={clsx(
            "text-[14px] min-w-0 truncate",
            isDone || isArchived ? "line-through" : "font-medium"
          )} style={{ color: isDone || isArchived ? "var(--t-faint)" : "var(--t-primary)" }}>
            {task.title}
          </p>
        )}
      </div>

      {/* Due date */}
      {dateInfo && !editing && (
        <span className={clsx("text-[11px] font-medium shrink-0 tabular-nums", dateInfo.color)}
          onClick={(e) => e.stopPropagation()}>
          {dateInfo.label}
        </span>
      )}

      {/* Quick actions ⋯ */}
      {!editing && (
        <QuickMenu task={task} onOpen={onOpen} />
      )}
    </div>
  );
}
