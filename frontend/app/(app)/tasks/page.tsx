"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, CheckCircle2, ClipboardList } from "lucide-react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { useTasks, useCompleteTask, useCompleteTaskOccurrence, useCreateTask } from "@/hooks/useTasks";
import type { TaskItem } from "@/types/api";

const TABS = [
  { value: "ACTIVE",   label: "Активные" },
  { value: "DONE",     label: "Выполненные" },
  { value: "ARCHIVED", label: "Архив" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export default function TasksPage() {
  const [status, setStatus]           = useState<TabValue>("ACTIVE");
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [draggedId, setDraggedId]     = useState<number | null>(null);
  const [orderOverride, setOrderOverride] = useState<number[] | null>(null);

  // Quick-add state
  const [quickTitle, setQuickTitle]   = useState("");
  const quickInputRef                 = useRef<HTMLInputElement>(null);

  const { data: rawTasks, isLoading, isError } = useTasks(status);
  const { mutate: complete }           = useCompleteTask();
  const { mutate: completeOcc }        = useCompleteTaskOccurrence();
  const { mutate: createTask }         = useCreateTask();

  function handleComplete(task: TaskItem) {
    if (task.is_recurring && task.occurrence_id) {
      completeOcc(task.occurrence_id);
    } else {
      complete(task.task_id);
    }
  }

  // Apply drag-based order override
  const tasks = (() => {
    if (!rawTasks) return rawTasks;
    if (!orderOverride) return rawTasks;
    const map = new Map(rawTasks.map((t) => [t.task_id, t]));
    return orderOverride.map((id) => map.get(id)).filter(Boolean) as TaskItem[];
  })();

  // Reset order override when tab changes or data refreshes
  const handleTabChange = (v: TabValue) => {
    setStatus(v);
    setOrderOverride(null);
    setSelectedTask(null);
  };

  // Quick-add submit
  const submitQuickAdd = useCallback(() => {
    const title = quickTitle.trim();
    if (!title) return;
    createTask({ title });
    setQuickTitle("");
  }, [quickTitle, createTask]);

  // ── Drag & drop ──────────────────────────────────────────────────────────────
  const dragOver = useRef<number | null>(null);

  function onDragStart(id: number) {
    setDraggedId(id);
  }

  function onDragEnter(id: number) {
    dragOver.current = id;
  }

  function onDragEnd() {
    if (draggedId === null || dragOver.current === null || draggedId === dragOver.current) {
      setDraggedId(null);
      dragOver.current = null;
      return;
    }
    const current = tasks ?? [];
    const ids = current.map((t) => t.task_id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx   = ids.indexOf(dragOver.current);
    if (fromIdx === -1 || toIdx === -1) { setDraggedId(null); return; }
    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, draggedId);
    setOrderOverride(newIds);
    setDraggedId(null);
    dragOver.current = null;
  }

  return (
    <>
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}

      <AppTopbar title="Задачи" />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-2xl">
        {/* Controls */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
            {TABS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleTabChange(value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  status === value
                    ? "bg-white/[0.09] text-white shadow-sm"
                    : "text-white/55 hover:text-white/80"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Count badge */}
          {tasks && tasks.length > 0 && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.06]"
              style={{ color: "var(--t-faint)" }}>
              {tasks.length}
            </span>
          )}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-1.5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-11 bg-white/[0.02] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить задачи
          </p>
        )}

        {/* Task list + quick-add */}
        {!isLoading && !isError && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">

            {/* Quick-add row (active tab only) */}
            {status === "ACTIVE" && (
              <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/[0.05]">
                <button
                  onClick={submitQuickAdd}
                  className="shrink-0 w-[18px] h-[18px] rounded-full border-[1.5px] border-white/20 flex items-center justify-center hover:border-indigo-400/60 hover:bg-indigo-500/10 transition-all"
                  style={{ color: "transparent" }}
                  title="Добавить задачу"
                >
                  <Plus size={10} strokeWidth={2.5} style={{ color: "var(--t-faint)" }} />
                </button>
                <input
                  ref={quickInputRef}
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); submitQuickAdd(); }
                    if (e.key === "Escape") { setQuickTitle(""); quickInputRef.current?.blur(); }
                  }}
                  placeholder="Новая задача..."
                  className="flex-1 bg-transparent outline-none text-[14px] placeholder-white/20"
                  style={{ color: "var(--t-secondary)" }}
                />
              </div>
            )}

            {/* Empty state */}
            {tasks && tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                  {status === "DONE" ? (
                    <CheckCircle2 size={20} className="text-emerald-400/40" />
                  ) : (
                    <ClipboardList size={20} className="text-white/30" />
                  )}
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                  {status === "ACTIVE" ? "Активных задач нет" : status === "DONE" ? "Выполненных задач нет" : "Архив пуст"}
                </p>
                {status === "ACTIVE" && (
                  <button
                    onClick={() => quickInputRef.current?.focus()}
                    className="mt-3 text-xs font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors"
                  >
                    Напишите задачу выше ↑
                  </button>
                )}
              </div>
            )}

            {/* Rows */}
            {tasks && tasks.map((task, i) => (
              <div
                key={task.task_id}
                className={i < tasks.length - 1 ? "border-b border-white/[0.04]" : ""}
                onDragEnter={() => onDragEnter(task.task_id)}
              >
                <TaskRow
                  task={task}
                  onComplete={handleComplete}
                  onOpen={setSelectedTask}
                  isDragging={draggedId === task.task_id}
                  dragHandleProps={{
                    draggable: true,
                    onDragStart: () => onDragStart(task.task_id),
                    onDragEnd,
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
