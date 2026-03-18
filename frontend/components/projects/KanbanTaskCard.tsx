"use client";

import { useRef } from "react";
import { clsx } from "clsx";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskCard, ProjectTag } from "@/types/api";

interface Props {
  task: TaskCard;
  allTags: ProjectTag[];
  onCardClick?: () => void;
}

const TAG_COLOR_MAP: Record<string, string> = {
  gray:   "bg-white/10 text-white/50",
  blue:   "bg-blue-500/15 text-blue-400",
  green:  "bg-emerald-500/15 text-emerald-400",
  orange: "bg-orange-500/15 text-orange-400",
  purple: "bg-purple-500/15 text-purple-400",
};

export function KanbanTaskCard({ task, allTags, onCardClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.task_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const tagMap = Object.fromEntries(allTags.map((t) => [t.id, t]));

  // Track pointer start to distinguish click from drag
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onPointerDown={(e) => {
        pointerStart.current = { x: e.clientX, y: e.clientY };
        // Forward to dnd-kit drag listener
        const dndHandler = (listeners as Record<string, (e: React.PointerEvent) => void> | undefined)?.onPointerDown;
        dndHandler?.(e);
      }}
      onClick={(e) => {
        if (!onCardClick) return;
        const start = pointerStart.current;
        if (start) {
          const dx = Math.abs(e.clientX - start.x);
          const dy = Math.abs(e.clientY - start.y);
          if (dx > 5 || dy > 5) return;
        }
        onCardClick();
      }}
      className={clsx(
        "bg-white/[0.05] border rounded-xl p-3.5 cursor-grab active:cursor-grabbing transition-all hover:bg-white/[0.07] hover:border-indigo-500/25",
        isDragging && "opacity-40",
        task.is_overdue ? "border-red-500/25" : "border-white/[0.08]"
      )}
    >
      <p className={clsx(
        "text-sm font-medium line-clamp-2",
        task.board_status === "done" ? "text-white/65 line-through" : "text-white/85"
      )} style={{ letterSpacing: "-0.005em" }}>
        {task.title}
      </p>

      {/* Tags */}
      {task.tag_ids.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {task.tag_ids.map((tid) => {
            const tag = tagMap[tid];
            if (!tag) return null;
            return (
              <span
                key={tid}
                className={clsx(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                  TAG_COLOR_MAP[tag.color] ?? "bg-white/10 text-white/68"
                )}
              >
                {tag.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Due date */}
      {task.due_date && (
        <div className="mt-2">
          <span className={clsx(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded-md",
            task.is_overdue
              ? "bg-red-500/10 border border-red-500/20 text-red-400"
              : "text-white/60"
          )}>
            {task.due_date}
          </span>
        </div>
      )}
    </div>
  );
}
