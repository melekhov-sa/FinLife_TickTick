"use client";

import { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  rectIntersection,
  useDroppable,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import type { CollisionDetection } from "@dnd-kit/core";
import { KanbanTaskCard } from "./KanbanTaskCard";
import { TaskDetailPanel } from "@/components/tasks/TaskDetailPanel";
import type { BoardColumn, ProjectDetail, TaskCard, TaskItem } from "@/types/api";

interface Props {
  project: ProjectDetail;
}

// pointerWithin finds the column the pointer is over; rectIntersection as fallback
const collisionDetection: CollisionDetection = (args) => {
  const pw = pointerWithin(args);
  if (pw.length > 0) return pw;
  return rectIntersection(args);
};

export function KanbanBoard({ project }: Props) {
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = useState<TaskCard | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  // local optimistic groups so UI responds immediately
  const [localGroups, setLocalGroups] = useState<Record<string, TaskCard[]>>(
    () => project.groups
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Fetch full TaskItem when a card is clicked
  const { data: selectedTask } = useQuery<TaskItem>({
    queryKey: ["task", selectedTaskId],
    queryFn: () => api.get<TaskItem>(`/api/v2/tasks/${selectedTaskId}`),
    enabled: selectedTaskId !== null,
    staleTime: 0,
  });

  function findColumn(taskId: number): string | null {
    for (const [col, tasks] of Object.entries(localGroups)) {
      if (tasks.some((t) => t.task_id === taskId)) return col;
    }
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as number;
    const col = findColumn(id);
    if (col) setActiveTask(localGroups[col].find((t) => t.task_id === id) ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as number;
    const overId = over.id as string | number;

    const activeCol = findColumn(activeId);
    // over.id may be a column key (string) or a task_id (number)
    const overCol =
      typeof overId === "string" && localGroups[overId] !== undefined
        ? overId
        : findColumn(overId as number);

    if (!activeCol || !overCol || activeCol === overCol) return;

    setLocalGroups((prev) => {
      const activeTask = prev[activeCol].find((t) => t.task_id === activeId)!;
      return {
        ...prev,
        [activeCol]: prev[activeCol].filter((t) => t.task_id !== activeId),
        [overCol]: [...prev[overCol], { ...activeTask, board_status: overCol }],
      };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id as number;
    const overId = over.id as string | number;
    const newCol =
      typeof overId === "string" && localGroups[overId] !== undefined
        ? overId
        : findColumn(overId as number);

    if (!newCol) return;

    try {
      await api.post(`/api/v2/tasks/${activeId}/board-status`, { board_status: newCol });
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    } catch {
      // Revert on error
      setLocalGroups(project.groups);
    }
  }

  async function createTaskInColumn(title: string, columnKey: string) {
    try {
      const res = await api.post<{ task_id: number }>(`/api/v2/projects/${project.id}/tasks`, {
        title,
        board_status: columnKey,
      });
      setLocalGroups((prev) => ({
        ...prev,
        [columnKey]: [...(prev[columnKey] || []), {
          task_id: res.task_id,
          title,
          board_status: columnKey,
          status: "ACTIVE",
          due_date: null,
          completed_at: null,
          is_overdue: false,
          tags: [],
          tag_ids: [],
        } as TaskCard],
      }));
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    } catch {
      qc.invalidateQueries({ queryKey: ["project", project.id] });
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-0">
          {project.columns.map((col: BoardColumn) => {
            const tasks = localGroups[col.key] ?? [];
            return (
              <KanbanColumn
                key={col.key}
                column={col}
                tasks={tasks}
                allTags={project.tags}
                onTaskClick={(taskId) => setSelectedTaskId(taskId)}
                onCreateTask={(title) => createTaskInColumn(title, col.key)}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="rotate-2 opacity-90">
              <KanbanTaskCard task={activeTask} allTags={project.tags} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {selectedTaskId !== null && selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => {
            setSelectedTaskId(null);
            qc.invalidateQueries({ queryKey: ["project", project.id] });
          }}
        />
      )}
    </>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  allTags,
  onTaskClick,
  onCreateTask,
}: {
  column: BoardColumn;
  tasks: TaskCard[];
  allTags: ProjectDetail["tags"];
  onTaskClick: (taskId: number) => void;
  onCreateTask: (title: string) => void;
}) {
  const isDone = column.key === "done";
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const [newTaskTitle, setNewTaskTitle] = useState("");

  function handleCreate() {
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    onCreateTask(trimmed);
    setNewTaskTitle("");
  }

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        "flex flex-col w-[280px] shrink-0 rounded-2xl border transition-colors",
        isOver
          ? "bg-indigo-500/[0.06] border-indigo-500/25"
          : "bg-white/[0.03] border-white/[0.07]"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06]">
        <span className="text-[10px] font-semibold text-white/72 uppercase tracking-widest">
          {column.label}
        </span>
        <span
          className={clsx(
            "text-[10px] font-semibold px-2 py-0.5 rounded-full",
            isDone
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              : tasks.length > 0
              ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
              : "bg-white/[0.06] text-white/55 border border-white/[0.08]"
          )}
        >
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <SortableContext
        items={tasks.map((t) => t.task_id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 p-3 space-y-2 min-h-[80px] max-h-[calc(100vh-220px)] overflow-y-auto">
          {tasks.map((task) => (
            <KanbanTaskCard
              key={task.task_id}
              task={task}
              allTags={allTags}
              onCardClick={() => onTaskClick(task.task_id)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="h-32 rounded-xl border border-dashed border-white/[0.10] flex items-center justify-center">
              <span className="text-xs text-white/20">Перетащить сюда</span>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Quick-add input */}
      <div className="mt-auto px-2 pb-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="+ Добавить задачу..."
          className="w-full px-2.5 py-2 text-[13px] rounded-lg bg-transparent border border-transparent hover:border-white/[0.08] focus:border-indigo-500/50 focus:bg-white/[0.03] placeholder-white/30 outline-none transition-colors"
          style={{ color: "var(--t-primary)" }}
        />
      </div>
    </div>
  );
}
