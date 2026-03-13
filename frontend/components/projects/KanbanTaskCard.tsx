"use client";

import { clsx } from "clsx";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskCard, ProjectTag } from "@/types/api";

interface Props {
  task: TaskCard;
  allTags: ProjectTag[];
}

const TAG_COLOR_MAP: Record<string, string> = {
  gray:   "bg-white/10 text-white/50",
  blue:   "bg-blue-500/15 text-blue-400",
  green:  "bg-emerald-500/15 text-emerald-400",
  orange: "bg-orange-500/15 text-orange-400",
  purple: "bg-purple-500/15 text-purple-400",
};

export function KanbanTaskCard({ task, allTags }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.task_id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const tagMap = Object.fromEntries(allTags.map((t) => [t.id, t]));

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "bg-[#161b22] border border-white/[0.06] rounded-lg p-3 cursor-grab active:cursor-grabbing transition-opacity",
        isDragging && "opacity-40",
        task.is_overdue && "border-red-500/30"
      )}
    >
      <p className={clsx("text-sm", task.board_status === "done" ? "text-white/35 line-through" : "text-white/75")}>
        {task.title}
      </p>

      {/* Tags */}
      {task.tag_ids.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.tag_ids.map((tid) => {
            const tag = tagMap[tid];
            if (!tag) return null;
            return (
              <span
                key={tid}
                className={clsx(
                  "text-[10px] px-1.5 py-0.5 rounded",
                  TAG_COLOR_MAP[tag.color] ?? "bg-white/10 text-white/40"
                )}
              >
                {tag.name}
              </span>
            );
          })}
        </div>
      )}

      {/* Due date */}
      <div className="flex items-center gap-2 mt-2">
        {task.due_date && (
          <span className={clsx("text-[10px]", task.is_overdue ? "text-red-400/70" : "text-white/25")}>
            {task.due_date}
          </span>
        )}
      </div>
    </div>
  );
}
