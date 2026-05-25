"use client";

import { useState, useRef, useCallback } from "react";
import { Plus, CheckCircle2, ClipboardList, AlertCircle, Search, X } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { TaskRow } from "@/components/tasks/TaskRow";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import { useTasks, useCompleteTask, useCompleteTaskOccurrence, useCreateTask } from "@/hooks/useTasks";
import type { TaskItem } from "@/types/api";
import { Button } from "@/components/primitives/Button";
import { Chip } from "@/components/primitives/Chip";
import { Card } from "@/components/primitives/Card";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";

const RU_MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

function getLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface TaskGroup {
  label: string;
  isOverdue: boolean;
  tasks: TaskItem[];
}

function groupTasksByDate(tasks: TaskItem[]): TaskGroup[] {
  const now = new Date();
  const todayStr   = getLocalDateString(now);
  const tomorrowD  = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrowD);

  const overdue:  TaskItem[] = [];
  const today:    TaskItem[] = [];
  const tomorrow: TaskItem[] = [];
  const noDate:   TaskItem[] = [];
  const future:   Map<string, TaskItem[]> = new Map();

  for (const task of tasks) {
    const dd = task.due_date;
    if (!dd) {
      noDate.push(task);
    } else if (dd < todayStr) {
      overdue.push(task);
    } else if (dd === todayStr) {
      today.push(task);
    } else if (dd === tomorrowStr) {
      tomorrow.push(task);
    } else {
      if (!future.has(dd)) future.set(dd, []);
      future.get(dd)!.push(task);
    }
  }

  const groups: TaskGroup[] = [];

  if (overdue.length)  groups.push({ label: "Просрочено", isOverdue: true,  tasks: overdue });
  if (today.length)    groups.push({ label: "Сегодня",    isOverdue: false, tasks: today });
  if (tomorrow.length) groups.push({ label: "Завтра",     isOverdue: false, tasks: tomorrow });

  const sortedFuture = [...future.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [dateStr, ts] of sortedFuture) {
    const [, m, d] = dateStr.split("-");
    const label = `${parseInt(d)} ${RU_MONTHS[parseInt(m) - 1]}`;
    groups.push({ label, isOverdue: false, tasks: ts });
  }

  if (noDate.length)   groups.push({ label: "Без даты",  isOverdue: false, tasks: noDate });

  return groups;
}

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
  const [search, setSearch]           = useState("");

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
    setSearch("");
  };

  const searchTrimmed = search.trim().toLowerCase();
  const filteredTasks = searchTrimmed
    ? (tasks ?? []).filter((t) => t.title.toLowerCase().includes(searchTrimmed))
    : tasks;

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

      <PageHeader title="Задачи" />

      <main className="flex-1 p-3 md:p-6 w-full">
        {/* Controls */}
        <div className="flex flex-col gap-2 mb-3 md:mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] rounded-lg md:rounded-xl p-0.5 md:p-1">
              {TABS.map(({ value, label }) => (
                <Chip
                  key={value}
                  label={label}
                  size="sm"
                  selected={status === value}
                  onClick={() => handleTabChange(value)}
                />
              ))}
            </div>

            {filteredTasks && filteredTasks.length > 0 && (
              <span className="text-[10px] md:text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.06]"
                style={{ color: "var(--t-faint)" }}>
                {searchTrimmed ? `${filteredTasks.length} / ${tasks?.length ?? 0}` : filteredTasks.length}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--t-faint)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск задач..."
              className="w-full pl-9 pr-9 py-2 rounded-xl text-[13px] outline-none border"
              style={{
                background: "var(--app-card-bg)",
                borderColor: search ? "var(--app-accent)" : "var(--app-border)",
                color: "var(--t-primary)",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <X size={13} style={{ color: "var(--t-faint)" }} />
              </button>
            )}
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-1">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} variant="rect" className="h-10 md:h-11 rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            variant="error"
            icon={<AlertCircle size={24} />}
            title="Не удалось загрузить задачи"
            size="md"
          />
        )}

        {/* Task list + quick-add */}
        {!isLoading && !isError && (
          <Card padding="none" className="overflow-hidden rounded-xl md:rounded-2xl">

            {/* Quick-add row (active tab only) */}
            {status === "ACTIVE" && (
              <div className="flex items-center gap-2 px-3 py-2 md:py-2.5 border-b border-slate-100 dark:border-white/[0.05] bg-indigo-500/[0.03]">
                <button
                  onClick={submitQuickAdd}
                  className="shrink-0 w-5 h-5 rounded-full border-[1.5px] border-indigo-400/30 flex items-center justify-center hover:border-indigo-400/60 hover:bg-indigo-500/10 transition-all"
                >
                  <Plus size={11} strokeWidth={2.5} className="text-indigo-400/60" />
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
                  className="flex-1 bg-transparent outline-none text-base md:text-[14px] placeholder-slate-300 dark:placeholder-indigo-300/25 font-medium"
                  style={{ color: "var(--t-secondary)" }}
                />
              </div>
            )}

            {/* Empty state */}
            {filteredTasks && filteredTasks.length === 0 && (
              <EmptyState
                icon={searchTrimmed ? <Search size={18} /> : status === "DONE" ? <CheckCircle2 size={18} /> : <ClipboardList size={18} />}
                title={
                  searchTrimmed
                    ? `По запросу «${search}» ничего не найдено`
                    : status === "ACTIVE" ? "Активных задач нет" : status === "DONE" ? "Выполненных задач нет" : "Архив пуст"
                }
                size="sm"
                actions={!searchTrimmed && status === "ACTIVE" ? (
                  <Button variant="link" size="sm" onClick={() => quickInputRef.current?.focus()} className="text-indigo-400/60 hover:text-indigo-400 px-0">
                    Напишите задачу выше
                  </Button>
                ) : undefined}
              />
            )}

            {/* Rows — non-active tab or search mode: flat list */}
            {filteredTasks && (status !== "ACTIVE" || searchTrimmed) && filteredTasks.map((task, i) => (
              <div
                key={task.task_id}
                className={i < filteredTasks.length - 1 ? "border-b border-slate-100 dark:border-white/[0.04]" : ""}
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

            {/* Grouped rows (active tab, no search) */}
            {filteredTasks && status === "ACTIVE" && !searchTrimmed && (() => {
              const groups = groupTasksByDate(filteredTasks);
              const allTasks = groups.flatMap((g) => g.tasks);
              return groups.map((group) => (
                <div key={group.label}>
                  <div
                    className="text-[11px] font-semibold uppercase tracking-widest px-3 pt-4 pb-1.5"
                    style={{ color: group.isOverdue ? "var(--accent-red)" : "var(--t-faint)" }}
                  >
                    {group.label}
                  </div>
                  {group.tasks.map((task) => {
                    const globalIdx = allTasks.indexOf(task);
                    return (
                      <div
                        key={task.task_id}
                        className={globalIdx < allTasks.length - 1 ? "border-b border-white/[0.04]" : ""}
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
                    );
                  })}
                </div>
              ));
            })()}
          </Card>
        )}
      </main>
    </>
  );
}
