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
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { KanbanTaskCard } from "./KanbanTaskCard";
import type { BoardColumn, ProjectDetail, TaskCard } from "@/types/api";

interface Props {
  project: ProjectDetail;
}

export function KanbanBoard({ project }: Props) {
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = useState<TaskCard | null>(null);
  // local optimistic groups so UI responds immediately
  const [localGroups, setLocalGroups] = useState<Record<string, TaskCard[]>>(
    () => project.groups
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
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
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tasks,
  allTags,
}: {
  column: BoardColumn;
  tasks: TaskCard[];
  allTags: ProjectDetail["tags"];
}) {
  const isDone = column.key === "done";

  return (
    <div
      className="flex flex-col w-[280px] shrink-0 bg-white/[0.03] rounded-2xl border border-white/[0.07]"
      id={column.key}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.06]">
        <span className="text-[10px] font-semibold text-white/45 uppercase tracking-widest">
          {column.label}
        </span>
        <span
          className={clsx(
            "text-[10px] font-semibold px-2 py-0.5 rounded-full",
            isDone
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
              : tasks.length > 0
              ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/20"
              : "bg-white/[0.06] text-white/25 border border-white/[0.08]"
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
        <div className="flex-1 p-3 space-y-2 min-h-[80px]">
          {tasks.map((task) => (
            <KanbanTaskCard key={task.task_id} task={task} allTags={allTags} />
          ))}
          {tasks.length === 0 && (
            <div className="h-16 rounded-xl border border-dashed border-white/[0.06] flex items-center justify-center">
              <span className="text-xs text-white/15">Перетащить сюда</span>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
